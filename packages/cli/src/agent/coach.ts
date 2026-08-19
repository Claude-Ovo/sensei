import { LlmAgent } from '@google/adk';
import type { SenseiConfig } from '../lib/config.js';
import type { LearnerProfile } from '../lib/profile.js';
import { describeProfile } from '../lib/profile.js';
import { fallbackModels, makeModel, runOnce } from './llm.js';

/**
 * Coach：学习者主动开口（sensei ask "..."）时回答。
 * 和 Observer 共享同一份上下文，但允许长一点、允许对话。
 */
const TIMEOUT_MS = 40_000;

const INSTRUCTION = `You are Sensei, a patient senior engineer coaching a learner who is working in a terminal.
You are given their goal, profile, notes so far, the recent terminal transcript, and their question.
Answer the question directly and concretely, grounded in what actually happened in the transcript (quote the relevant line when useful).
Respect the profile: style=hint-first → prefer guiding questions and the next single step over the full solution, unless they ask for the answer;
style=answer-first → give the fix, then one sentence of why. verbosity=terse → keep it to a few lines.
If the question reveals a misconception, name it kindly and precisely.
Reply in the profile's language (zh-CN → 简体中文，术语保留英文). Plain text, no markdown headers; short code in backticks is fine.`;

export interface CoachInput {
  goal: string | null;
  profile: LearnerProfile;
  notes: string[];
  transcript: string;
  history: Array<{ role: 'user' | 'sensei'; text: string }>;
  question: string;
}

export class Coach {
  private agent: LlmAgent;
  constructor(private readonly cfg: SenseiConfig) {
    this.agent = new LlmAgent({
      name: 'sensei_coach',
      description: 'Answers learner questions in context of their terminal session.',
      model: makeModel(cfg),
      instruction: INSTRUCTION,
      generateContentConfig: { temperature: 0.5 },
    });
  }

  async answer(input: CoachInput): Promise<string> {
    const message = [
      `GOAL: ${input.goal ?? '(not stated)'}`,
      `PROFILE: ${describeProfile(input.profile)}`,
      `NOTES_SO_FAR:`,
      ...input.notes.slice(-15).map((n) => `- ${n}`),
      'RECENT_TRANSCRIPT:',
      '<<<',
      input.transcript,
      '>>>',
      'CONVERSATION_SO_FAR:',
      ...input.history.slice(-8).map((h) => `${h.role === 'user' ? 'Learner' : 'Sensei'}: ${h.text}`),
      `Learner asks now: ${input.question}`,
    ].join('\n');
    const { text } = await runOnce(this.agent, message, { models: fallbackModels(this.cfg), cfg: this.cfg, timeoutMs: TIMEOUT_MS });
    return text.trim();
  }
}
