import pty from 'node-pty';
import chalk from 'chalk';
import { Chunker } from '../lib/chunker.js';
import { cleanTerminal } from '../lib/ansi.js';
import { makeRedactor } from '../lib/redact.js';
import { LocalSessionLog, newSessionId } from '../lib/session.js';
import { loadConfig } from '../lib/config.js';
import { CloudStore } from '../lib/cloud.js';
import { Brain } from '../lib/brain.js';
import { startIpc, clearCurrent } from '../lib/ipc.js';

export interface StartOptions {
  shell?: string;
  goal?: string;
  quiet?: boolean;
  offline?: boolean;
  noAgent?: boolean;
  /** 会话在面板上对所有人可见（演示/评委用） */
  public?: boolean;
}

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.SENSEI_SHELL || 'powershell.exe';
  return process.env.SENSEI_SHELL || process.env.SHELL || '/bin/bash';
}

const LEVEL_STYLE: Record<string, (s: string) => string> = {
  nudge: chalk.cyan,
  hint: chalk.cyan,
  explain: chalk.cyan,
  fix: chalk.green,
  milestone: chalk.green,
  question: chalk.yellow,
  error: chalk.red,
  info: chalk.dim,
};

export async function start(opts: StartOptions) {
  if (process.env.SENSEI_ACTIVE === '1') {
    process.stderr.write(chalk.yellow(`[sensei] you are already inside a sensei session (${process.env.SENSEI_SESSION}). Type "exit" to leave it first.
`));
    process.exit(2);
  }
  const cfg = loadConfig();
  const shell = opts.shell || defaultShell();
  const sessionId = newSessionId();
  const log = new LocalSessionLog(sessionId);
  const redact = makeRedactor([cfg.geminiApiKey || '', process.env.SENSEI_TOKEN || '']);

  const cols = process.stdout.columns || 100;
  const rows = process.stdout.rows || 30;
  const shellArgs = /powershell|pwsh/i.test(shell) ? ['-NoLogo'] : [];

  // 云端镜像（可关）
  const cloud = !opts.offline && cfg.cloudEnabled ? new CloudStore(cfg, sessionId) : undefined;

  // 往真实终端里插一行。规则：
  // - 用户正在敲命令（lineBuf 非空）→ 先攒着，等他按下回车、命令回显之后再打，不糊他的输入行
  // - 用户没在敲 → 立刻打，然后往 shell 送一个回车让它重画一个干净的 prompt
  let lineBuf = '';
  let termRef: pty.IPty | null = null;
  const pendingSays: string[] = [];
  const render = (text: string, level: string) => {
    const paint = LEVEL_STYLE[level] ?? chalk.cyan;
    const prefix = level === 'question' ? '[sensei ?]' : level === 'milestone' ? '[sensei ✓]' : '[sensei]';
    return text
      .split('\n')
      .map((l, i) => (i === 0 ? `${paint(prefix)} ${l}` : `${' '.repeat(prefix.length + 1)}${l}`))
      .join('\r\n');
  };
  const flushSays = () => {
    if (!pendingSays.length) return;
    process.stderr.write(`\r\n${pendingSays.join('\r\n')}\r\n`);
    pendingSays.length = 0;
  };
  const say = (text: string, level = 'info') => {
    const body = render(text, level);
    if (lineBuf.length > 0) {
      pendingSays.push(body);
      return;
    }
    process.stderr.write(`\r\n${body}\r\n`);
    // 让 shell 重画 prompt（空行回车对任何 shell 都无害）
    termRef?.write('\r');
  };

  const brain = new Brain({
    cfg,
    sessionId,
    goal: opts.goal ?? null,
    log,
    say,
    cloud,
    quietObserver: !!opts.noAgent,
  });

  const { info, server } = await startIpc(sessionId, (route, body) => brain.handle(route, body));

  const term = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.cwd(),
    env: {
      ...process.env,
      SENSEI_SESSION: sessionId,
      SENSEI_ACTIVE: '1',
      SENSEI_PORT: String(info.port),
      SENSEI_TOKEN: info.token,
    } as Record<string, string>,
  });

  const startMeta = { shell, cwd: redact(process.cwd()), platform: process.platform, goal: opts.goal ?? null };
  log.append('meta', 'session.start', { ...startMeta, public: !!opts.public });
  cloud?.start({
    ...startMeta,
    learnerId: brain.profile.id,
    public: !!opts.public,
    ownerEmail: process.env.SENSEI_OWNER_EMAIL || null,
  });
  brain.attachInbound();

  // 输出流：镜像到真实终端 + 清洗/脱敏后进日志和大脑
  const outChunker = new Chunker((raw) => {
    const text = redact(cleanTerminal(raw));
    if (text.trim()) brain.ingest(log.append('out', text));
  });
  term.onData((d) => {
    process.stdout.write(d);
    outChunker.push(d);
  });

  // 输入流：透传给 pty，同时按行记录用户敲的命令
  termRef = term;
  const stdin = process.stdin;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  stdin.on('data', (key: string) => {
    term.write(key);
    for (const ch of key) {
      if (ch === '\r' || ch === '\n') {
        const cmd = lineBuf.trim();
        lineBuf = '';
        if (cmd) brain.ingest(log.append('in', redact(cmd)));
        // 命令已回显，攒着的提示现在打出来
        setTimeout(flushSays, 60);
      } else if (ch === '\x7f' || ch === '\b') {
        lineBuf = lineBuf.slice(0, -1);
        if (!lineBuf.length) setTimeout(flushSays, 60);
      } else if (ch === '\x03') {
        lineBuf = '';
        brain.ingest(log.append('meta', 'ctrl-c'));
        setTimeout(flushSays, 60);
      } else if (ch >= ' ') {
        lineBuf += ch;
      }
    }
  });

  process.stdout.on('resize', () => {
    term.resize(process.stdout.columns || cols, process.stdout.rows || rows);
  });

  if (!opts.quiet) {
    const lines = [
      `[sensei] watching · session ${sessionId}`,
      `[sensei] log → ${log.file}`,
      opts.goal ? `[sensei] goal: ${opts.goal}` : `[sensei] no goal given — I'll infer it (or: sensei start -g "what you're learning")`,
      cloud ? `[sensei] cloud: on (${cfg.projectId})${opts.public ? ' · PUBLIC session' : ''}` : `[sensei] cloud: off`,
      brain.llmReady
        ? `[sensei] agent: observer ${cfg.observerModel} · coach/compiler ${cfg.model} · triage ${cfg.cheapModel}`
        : `[sensei] agent: OFF — ${brain.llmProblem}`,
      `[sensei] in this shell: sensei ask "…" · sensei reply "…" · sensei note "…" · sensei fb too-basic|confusing|just-tell-me|let-me-try · sensei done`,
      `[sensei] type "exit" to finish`,
    ];
    process.stderr.write(chalk.dim('\n' + lines.join('\n') + '\n\n'));
  }

  await new Promise<void>((resolve) => {
    term.onExit(async ({ exitCode }) => {
      outChunker.flush();
      log.append('meta', 'session.end', { exitCode });
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      await brain.shutdown();
      server.close();
      clearCurrent(sessionId);
      cloud?.end(exitCode);
      await cloud?.terminate();
      if (!opts.quiet) {
        process.stderr.write(
          chalk.dim(
            `\n[sensei] session ${sessionId} closed (exit ${exitCode}) · notes ${brain.notes.length} · hints ${brain.hintsGiven.length} · milestones ${brain.milestones.length}\n` +
              (brain.notes.length ? `[sensei] tip: run \`sensei done ${sessionId}\` next time BEFORE exiting to compile the tutorial\n` : ''),
          ),
        );
      }
      resolve();
    });
  });
  // ConPTY 在 Windows 上会拖住进程，显式退出
  process.exit(0);
}
