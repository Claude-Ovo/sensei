import { Gemini, InMemoryRunner, LlmAgent, LogLevel, isFinalResponse, setLogLevel, stringifyContent, type Event } from '@google/adk';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import type { SenseiConfig } from '../lib/config.js';

let proxyInstalled = false;
let logsQuieted = false;

/** 让 Node 全局 fetch（@google/genai 用它）走本地代理 */
export function installProxy(cfg: SenseiConfig): void {
  if (!logsQuieted) {
    // ADK 默认把 INFO 打到控制台，会糊掉用户的终端；只留 ERROR
    setLogLevel(process.env.SENSEI_DEBUG ? LogLevel.INFO : LogLevel.ERROR);
    logsQuieted = true;
  }
  if (proxyInstalled || !cfg.proxy) return;
  setGlobalDispatcher(new ProxyAgent(cfg.proxy));
  proxyInstalled = true;
}

export function makeModel(cfg: SenseiConfig, model = cfg.model): Gemini {
  installProxy(cfg);
  if (!cfg.geminiApiKey) {
    throw new Error('GEMINI_API_KEY missing — put it in ~/.sensei/.env');
  }
  return new Gemini({ model, apiKey: cfg.geminiApiKey });
}

/** 主模型抖动/限流时的退路（都满足"Gemini 3.5 或更新"） */
export function fallbackModels(cfg: SenseiConfig): string[] {
  const list = [cfg.model, 'gemini-3.5-flash', 'gemini-flash-latest'];
  return [...new Set(list)];
}

export interface RunResult {
  text: string;
  events: Event[];
  attempts: number;
  model: string;
}

export class LlmError extends Error {}

const RETRYABLE = /high demand|overloaded|resource.?exhausted|429|503|UNAVAILABLE|deadline|timeout|ECONNRESET|fetch failed/i;

/**
 * 一次性运行：不落会话，上下文全靠调用方拼进 message。
 * 空响应 / 限流 / 高负载：先退避重试，再换备用模型。
 */
export async function runOnce(agent: LlmAgent, message: string, opts: { userId?: string; models?: string[]; cfg?: SenseiConfig } = {}): Promise<RunResult> {
  const models = opts.models ?? [typeof agent.model === 'string' ? agent.model : (agent.model as Gemini | undefined)?.model ?? 'gemini-3.7-flash'];
  let attempts = 0;
  let lastErr: string | null = null;
  for (let mi = 0; mi < models.length; mi++) {
    if (mi > 0 && opts.cfg) agent.model = makeModel(opts.cfg, models[mi]);
    for (let retry = 0; retry < 3; retry++) {
      attempts++;
      const runner = new InMemoryRunner({ agent, appName: 'sensei' });
      const events: Event[] = [];
      let text = '';
      let errorMessage: string | undefined;
      try {
        for await (const ev of runner.runEphemeral({
          userId: opts.userId ?? 'sensei-user',
          newMessage: { role: 'user', parts: [{ text: message }] },
        })) {
          events.push(ev);
          if (ev.errorMessage) errorMessage = ev.errorMessage;
          if (isFinalResponse(ev)) {
            const t = stringifyContent(ev);
            if (t) text = t;
          }
        }
      } catch (e) {
        errorMessage = String((e as Error).message);
      }
      if (!text) {
        for (let i = events.length - 1; i >= 0; i--) {
          const t = stringifyContent(events[i]);
          if (t) {
            text = t;
            break;
          }
        }
      }
      if (text) return { text, events, attempts, model: models[mi] };
      lastErr = errorMessage ?? 'empty response';
      if (!RETRYABLE.test(lastErr)) break; // 非瞬时错误：不重试同一模型，直接试下一个
      // 高负载/限流：同一模型只快速重试一次，然后换下一个模型（延迟比"死等"重要）
      if (retry >= 1 && mi < models.length - 1) break;
      await new Promise((r) => setTimeout(r, 700 * (retry + 1)));
    }
  }
  throw new LlmError(`LLM gave no usable response after ${attempts} attempts: ${lastErr}`);
}

/** 从模型输出里抠 JSON（容忍 ```json 围栏、思考前缀和前后废话） */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
