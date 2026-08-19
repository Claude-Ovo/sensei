import { LlmAgent } from '@google/adk';
import type { SenseiConfig } from '../lib/config.js';
import type { LearnerProfile } from '../lib/profile.js';
import { describeProfile } from '../lib/profile.js';
import { fallbackModels, makeModel, runOnce } from './llm.js';

/**
 * Compiler：会话结束时，把整段挣扎改写成一份能给别人看的教程。
 * 输入是杂乱的终端流 + 笔记 + 里程碑 + 问答；输出是结构化 Markdown + 口播稿。
 */
const TIMEOUT_MS = 120_000;

const INSTRUCTION = `You are Sensei, turning one learner's real terminal session into a tutorial that someone else could follow.
You get: the goal, the learner's profile, all notes/milestones/questions recorded during the session, and the (trimmed) transcript.

Write a Markdown document with EXACTLY these sections:
# <Title: what you'll be able to do after this>
## Goal (2-3 sentences: what we set out to do and why it matters)
## Prerequisites (bullets: tools/versions/accounts actually used in the transcript)
## Steps (numbered; each step = intent → the exact command(s) → what you should see. Use the real commands from the transcript, cleaned of typos.)
## Pitfalls we hit (a table: symptom | cause | fix — ONLY things that actually happened; quote the real error lines briefly)
## Recap (3-5 bullets: the mental model to keep)
## 60-second script (a spoken-word script for a short video, in the profile's language, ~150 words, first person, no jargon dump)

Rules: be faithful to what happened; do not invent steps that were not taken; drop dead ends that taught nothing, keep dead ends that taught something (those go to Pitfalls).
Language: the profile's language for prose (zh-CN → 简体中文，术语/命令保留英文). Output ONLY the Markdown.`;

export interface CompilerInput {
  goal: string | null;
  profile: LearnerProfile;
  notes: string[];
  milestones: string[];
  qa: Array<{ q: string; a: string }>;
  transcript: string;
  durationMinutes: number;
}

export class Compiler {
  private agent: LlmAgent;
  constructor(private readonly cfg: SenseiConfig) {
    this.agent = new LlmAgent({
      name: 'sensei_compiler',
      description: 'Compiles a terminal learning session into a tutorial.',
      model: makeModel(cfg),
      instruction: INSTRUCTION,
      generateContentConfig: { temperature: 0.4 },
    });
  }

  async compile(input: CompilerInput): Promise<string> {
    const message = [
      `GOAL: ${input.goal ?? '(not stated — infer from the session)'}`,
      `PROFILE: ${describeProfile(input.profile)}`,
      `DURATION_MINUTES: ${input.durationMinutes.toFixed(0)}`,
      `MILESTONES:`,
      ...input.milestones.map((m) => `- ${m}`),
      `NOTES:`,
      ...input.notes.map((n) => `- ${n}`),
      `Q&A:`,
      ...input.qa.map((x) => `- Q: ${x.q}\n  A: ${x.a}`),
      'TRANSCRIPT:',
      '<<<',
      input.transcript,
      '>>>',
    ].join('\n');
    const { text } = await runOnce(this.agent, message, { models: fallbackModels(this.cfg), cfg: this.cfg, timeoutMs: TIMEOUT_MS });
    return text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
}
