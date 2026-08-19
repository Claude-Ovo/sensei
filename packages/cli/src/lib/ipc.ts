import { createServer, request as httpRequest, type Server } from 'node:http';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { SENSEI_HOME } from './config.js';

/**
 * 本机 IPC：`sensei start` 里起一个只监听 127.0.0.1 的小 HTTP 服务，
 * `sensei ask/reply/note/fb/done` 从同一台机器的任何终端（包括被包住的那个 shell）打过来。
 * 端口和 token 写在 ~/.sensei/current.json；被包住的 shell 还能从环境变量拿到。
 */
export interface CurrentInfo {
  sessionId: string;
  port: number;
  token: string;
  pid: number;
  startedAt: string;
}

const CURRENT = join(SENSEI_HOME, 'current.json');

export type IpcHandler = (route: string, body: Record<string, unknown>) => Promise<unknown>;

export async function startIpc(sessionId: string, handler: IpcHandler): Promise<{ info: CurrentInfo; server: Server }> {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const server = createServer((req, res) => {
    const send = (code: number, payload: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.headers['x-sensei-token'] !== token) return send(401, { error: 'bad token' });
    if (req.method !== 'POST') return send(405, { error: 'POST only' });
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', async () => {
      try {
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const out = await handler(req.url || '/', body);
        send(200, out ?? { ok: true });
      } catch (e) {
        send(500, { error: String((e as Error).message) });
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const info: CurrentInfo = { sessionId, port, token, pid: process.pid, startedAt: new Date().toISOString() };
  writeFileSync(CURRENT, JSON.stringify(info));
  return { info, server };
}

export function clearCurrent(sessionId: string): void {
  try {
    if (existsSync(CURRENT)) {
      const cur = JSON.parse(readFileSync(CURRENT, 'utf8')) as CurrentInfo;
      if (cur.sessionId === sessionId) unlinkSync(CURRENT);
    }
  } catch {
    /* ignore */
  }
}

export function readCurrent(): CurrentInfo | null {
  // 优先环境变量（在被包住的 shell 里）
  if (process.env.SENSEI_PORT && process.env.SENSEI_TOKEN && process.env.SENSEI_SESSION) {
    return {
      sessionId: process.env.SENSEI_SESSION,
      port: Number(process.env.SENSEI_PORT),
      token: process.env.SENSEI_TOKEN,
      pid: 0,
      startedAt: '',
    };
  }
  if (!existsSync(CURRENT)) return null;
  try {
    return JSON.parse(readFileSync(CURRENT, 'utf8')) as CurrentInfo;
  } catch {
    return null;
  }
}

export function callIpc<T = unknown>(route: string, body: Record<string, unknown>, timeoutMs = 120000): Promise<T> {
  const cur = readCurrent();
  if (!cur) return Promise.reject(new Error('no active sensei session — run `sensei start` first'));
  return new Promise<T>((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port: cur.port, path: route, method: 'POST', headers: { 'content-type': 'application/json', 'x-sensei-token': cur.token }, timeout: timeoutMs },
      (res) => {
        let raw = '';
        res.on('data', (d) => (raw += d));
        res.on('end', () => {
          try {
            const j = JSON.parse(raw);
            if (res.statusCode && res.statusCode >= 400) reject(new Error(j.error || `HTTP ${res.statusCode}`));
            else resolve(j as T);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('sensei session did not answer in time')));
    req.on('error', (e) => reject(new Error(`cannot reach sensei session (${e.message}) — is \`sensei start\` still running?`)));
    req.end(JSON.stringify(body));
  });
}
