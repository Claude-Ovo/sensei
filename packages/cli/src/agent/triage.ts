import { GoogleGenAI } from '@google/genai';
import type { SenseiConfig } from '../lib/config.js';
import { extractJson, installProxy } from './llm.js';

/**
 * Triage：便宜的守门员（Gemma 3 27B，走 Gemini API 同一把 key）。
 * 每次终端安静下来先问它一句"这段值不值得让大模型看"，只有值得的才叫 Observer。
 * 便宜模型做分诊，贵模型做判断——这是成本纪律，也是加分项里的"多接一个 Google 模型"。
 * Gemma 不支持 system instruction / JSON mode，所以指令折进 user 内容，输出宽松解析。
 */
export interface TriageResult {
  attention: 'none' | 'low' | 'high';
  kind: 'noise' | 'progress' | 'error' | 'success' | 'question' | 'idle';
  summary: string;
}

const PROMPT = `You are a fast triage filter for a terminal-coaching agent. You will see the most recent slice of a learner's terminal session
(lines starting with "$ " are commands they typed; other lines are terminal output; "[user → sensei]" lines are messages to the coach).
Classify what just happened and whether a senior engineer watching over their shoulder would need to look closely NOW.

attention:
- "high"  = an error / failure / repeated attempt / the learner talks to sensei / clearly stuck / just finished something significant
- "low"   = ordinary progress, listing files, successful routine commands
- "none"  = pure noise (prompt echoes, blank output, progress bar frames) or nothing new
kind: one of noise | progress | error | success | question | idle
summary: one short sentence, third person, concrete (mention the command and the key error line if any).

Reply with ONLY a JSON object: {"attention": "...", "kind": "...", "summary": "..."}

SLICE:
<<<
{slice}
>>>`;

export class Triage {
  private ai: GoogleGenAI;
  private model: string;
  private disabledUntil = 0;
  constructor(cfg: SenseiConfig) {
    installProxy(cfg);
    if (!cfg.geminiApiKey) throw new Error('GEMINI_API_KEY missing');
    this.ai = new GoogleGenAI({ apiKey: cfg.geminiApiKey });
    this.model = cfg.cheapModel;
  }

  get available(): boolean {
    return Date.now() >= this.disabledUntil;
  }

  async classify(slice: string): Promise<TriageResult | null> {
    if (!this.available) return null;
    try {
      const res = await this.ai.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: PROMPT.replace('{slice}', slice.slice(-6000)) }] }],
        config: { temperature: 0.1, maxOutputTokens: 200 },
      });
      const parsed = extractJson<Partial<TriageResult>>(res.text ?? '');
      if (!parsed || !parsed.attention) return null;
      const attention = (['none', 'low', 'high'] as const).includes(parsed.attention as never) ? parsed.attention : 'low';
      const kind = (['noise', 'progress', 'error', 'success', 'question', 'idle'] as const).includes(parsed.kind as never)
        ? parsed.kind!
        : 'progress';
      return { attention, kind, summary: String(parsed.summary ?? '').slice(0, 300) };
    } catch (e) {
      // 便宜模型挂了就退回直接观察，5 分钟后再试
      this.disabledUntil = Date.now() + 5 * 60 * 1000;
      process.stderr.write(`\n[sensei] triage (${this.model}) unavailable, falling back to observer: ${String((e as Error).message).slice(0, 100)}\n`);
      return null;
    }
  }
}
