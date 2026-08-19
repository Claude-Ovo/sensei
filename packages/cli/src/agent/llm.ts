import { Gemini, InMemoryRunner, LlmAgent, isFinalResponse, stringifyContent, type Event } from '@google/adk';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import type { SenseiConfig } from '../lib/config.js';

let proxyInstalled = false;

/** 让 Node 全局 fetch（@google/genai 用它）走本地代理 */
export function installProxy(cfg: SenseiConfig): void {
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

export interface RunResult {
  text: string;
  events: Event[];
}

/** 一次性运行：不落会话，上下文全靠调用方拼进 message */
export async function runOnce(agent: LlmAgent, message: string, userId = 'sensei-user'): Promise<RunResult> {
  const runner = new InMemoryRunner({ agent, appName: 'sensei' });
  const events: Event[] = [];
  let text = '';
  for await (const ev of runner.runEphemeral({
    userId,
    newMessage: { role: 'user', parts: [{ text: message }] },
  })) {
    events.push(ev);
    if (isFinalResponse(ev)) {
      const t = stringifyContent(ev);
      if (t) text = t;
    }
  }
  if (!text) {
    // 兜底：拿最后一个有文本的事件
    for (let i = events.length - 1; i >= 0; i--) {
      const t = stringifyContent(events[i]);
      if (t) {
        text = t;
        break;
      }
    }
  }
  return { text, events };
}

/** 从模型输出里抠 JSON（容忍 ```json 围栏和前后废话） */
export function extractJson<T = unknown>(text: string): T | null {
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
