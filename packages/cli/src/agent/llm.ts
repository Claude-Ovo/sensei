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

/**
 * 模型分工（都满足"Gemini 3.5 或更新"）：
 * - observer：高频、要快、免费额度要大 → 3.5 Flash-Lite 打头，3.7 Flash 兜底
 * - coach / compiler：低频、要质量 → 3.7 Flash 打头，Lite 兜底
 * 免费层 Flash 系列每天每模型只有 20 次，所以贵的留给真正需要的地方。
 */
export function fallbackModels(cfg: SenseiConfig, role: 'observer' | 'coach' | 'compiler' = 'coach'): string[] {
  const list =
    role === 'observer'
      ? [cfg.observerModel, cfg.model, 'gemini-3.5-flash', 'gemini-flash-latest']
      : [cfg.model, 'gemini-3.5-flash', cfg.observerModel, 'gemini-flash-latest'];
  return [...new Set(list)];
}

/**
 * 断路器：某个模型刚刚超时/高负载，就先让它歇 10 分钟，直接从下一个开始。
 * 用户在终端里等提示，延迟比"坚持用最新模型"重要。
 */
const penaltyUntil = new Map<string, number>();
const PENALTY_MS = 10 * 60 * 1000;
export function orderModels(models: string[]): string[] {
  const now = Date.now();
  const ok = models.filter((m) => (penaltyUntil.get(m) ?? 0) <= now);
  // 有可用的：真正跳过休眠模型（这才叫断路器——codex 验收 #5-9）
  if (ok.length) return ok;
  // 全在歇：按最早恢复排序，把整条链给出去，一个都不放弃
  return [...models].sort((a, b) => (penaltyUntil.get(a) ?? 0) - (penaltyUntil.get(b) ?? 0));
}
export function penalize(model: string, ms = PENALTY_MS): void {
  penaltyUntil.set(model, Math.max(penaltyUntil.get(model) ?? 0, Date.now() + ms));
}

/** Gemini 免费层的每日配额在太平洋时间午夜重置 */
export function msUntilPacificMidnight(now = new Date()): number {
  const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const next = new Date(pacific);
  next.setHours(24, 0, 5, 0);
  return Math.max(60_000, next.getTime() - pacific.getTime());
}
export function modelHealth(): Record<string, string> {
  const now = Date.now();
  const out: Record<string, string> = {};
  for (const [m, t] of penaltyUntil) if (t > now) out[m] = `resting ${Math.ceil((t - now) / 1000)}s`;
  return out;
}

export interface RunResult {
  text: string;
  events: Event[];
  attempts: number;
  model: string;
  ms: number;
}

export class LlmError extends Error {}

const RETRYABLE = /high demand|overloaded|resource.?exhausted|429|503|UNAVAILABLE|deadline|timeout|timed out|aborted|ECONNRESET|fetch failed/i;

/**
 * 一次性运行：不落会话状态，上下文全靠调用方拼进 message。
 * 每次尝试都有超时；超时/限流 → 记入断路器，换下一个模型。
 */
/** 不认 thinkingConfig 的模型（400 invalid argument 学来的），按模型隔离而不是永久改共享配置 */
const noThinkingModels = new Set<string>();
export function isInvalidArgument(msg: string): boolean {
  return /invalid[ _-]?argument/i.test(msg);
}

export async function runOnce(
  agent: LlmAgent,
  message: string,
  opts: { userId?: string; models?: string[]; cfg?: SenseiConfig; timeoutMs?: number } = {},
): Promise<RunResult> {
  const t0 = Date.now();
  const configured = opts.models ?? [typeof agent.model === 'string' ? agent.model : (agent.model as Gemini | undefined)?.model ?? 'gemini-3.7-flash'];
  const models = orderModels(configured);
  const timeoutMs = opts.timeoutMs ?? 25_000;
  let attempts = 0;
  let lastErr: string | null = null;
  // 保存原始配置：任何按模型的 thinkingConfig 摘除都只影响本次调用，结束后还原（codex 验收 #5-10）
  const originalConfig = agent.generateContentConfig;
  const stripThinking = () => {
    if (originalConfig && (originalConfig as { thinkingConfig?: unknown }).thinkingConfig) {
      const { thinkingConfig: _drop, ...rest } = originalConfig as Record<string, unknown>;
      agent.generateContentConfig = rest as typeof agent.generateContentConfig;
    }
  };
  try {
  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    if (opts.cfg && model !== currentModelName(agent)) agent.model = makeModel(opts.cfg, model);
    agent.generateContentConfig = originalConfig;
    if (noThinkingModels.has(model)) stripThinking();
    for (let retry = 0; retry < 2; retry++) {
      attempts++;
      const runner = new InMemoryRunner({ agent, appName: 'sensei' });
      const events: Event[] = [];
      let text = '';
      let errorMessage: string | undefined;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
      try {
        const userId = opts.userId ?? 'sensei-user';
        const session = await runner.sessionService.createSession({ appName: 'sensei', userId });
        for await (const ev of runner.runAsync({
          userId,
          sessionId: session.id,
          newMessage: { role: 'user', parts: [{ text: message }] },
          abortSignal: ac.signal,
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
      } finally {
        clearTimeout(timer);
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
      if (text) return { text, events, attempts, model, ms: Date.now() - t0 };
      lastErr = errorMessage ?? (ac.signal.aborted ? `timeout after ${timeoutMs}ms` : 'empty response');
      // 部分模型不认 thinkingConfig（400 INVALID_ARGUMENT / invalid-argument / invalid argument）：
      // 记住这个模型，摘掉配置在同一个模型上再试一次
      if (isInvalidArgument(lastErr) && (agent.generateContentConfig as { thinkingConfig?: unknown } | undefined)?.thinkingConfig) {
        noThinkingModels.add(model);
        stripThinking();
        continue;
      }
      if (!RETRYABLE.test(lastErr)) break; // 非瞬时错误：换模型
      if (/PerDay|per day|daily/i.test(lastErr) || (/quota/i.test(lastErr) && /exceeded/i.test(lastErr) && !/PerMinute/i.test(lastErr))) {
        penalize(model, msUntilPacificMidnight()); // 今日免费额度用完：歇到太平洋时间午夜重置
        break;
      }
      if (/PerMinute|per minute/i.test(lastErr)) {
        penalize(model, 65_000);
        break;
      }
      if (/timeout|timed out|aborted|high demand|overloaded|503/i.test(lastErr)) {
        penalize(model);
        break; // 慢/满：别在这个模型上耗第二次
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw new LlmError(`LLM gave no usable response after ${attempts} attempts (${Date.now() - t0}ms): ${lastErr}`);
  } finally {
    agent.generateContentConfig = originalConfig;
  }
}

function currentModelName(agent: LlmAgent): string | undefined {
  return typeof agent.model === 'string' ? agent.model : (agent.model as Gemini | undefined)?.model;
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
