import { LlmAgent } from '@google/adk';
import { z } from 'zod';
import type { SenseiConfig } from '../lib/config.js';
import type { LearnerProfile } from '../lib/profile.js';
import { describeProfile } from '../lib/profile.js';
import { extractJson, makeModel, runOnce } from './llm.js';

/**
 * Observer：后台观察者。看最近的终端流，判断学习者状态，决定要不要开口。
 * 纯结构化输出，不用工具——它的"动作"由 CLI 执行（打印提示 / 写笔记 / 提问 / 记里程碑）。
 */
export const ObservationSchema = z.object({
  status: z.enum(['flowing', 'exploring', 'stuck', 'idle', 'milestone', 'done']).describe(
    'flowing=进展顺利别打扰；exploring=在摸索但没卡；stuck=卡住了（报错重复/原地打转/明显走偏）；idle=没动静；milestone=刚完成一个阶段；done=目标已达成',
  ),
  confidence: z.number().min(0).max(1).describe('对上述判断的把握'),
  what_happened: z.string().describe('一句话：刚才发生了什么（给笔记用，第三人称，具体）'),
  stuck_reason: z.string().nullable().describe('如果 stuck：卡在哪、证据是什么（引用关键报错行）；否则 null'),
  hint: z
    .object({
      level: z.enum(['nudge', 'hint', 'explain', 'fix']).describe('nudge=一句提醒；hint=指方向不给答案；explain=讲清楚原理；fix=直接给可执行的修法'),
      text: z.string().describe('对学习者说的话。简短、具体、可执行。用学习者画像里的语言。'),
    })
    .nullable()
    .describe('要不要开口。不该开口就 null。'),
  question: z.string().nullable().describe('只有当不问就没法给出好提示时，才问一个澄清问题；否则 null'),
  note: z.string().nullable().describe('值得写进笔记的一条（概念、决策、踩坑与修法）；没有就 null'),
  milestone: z.string().nullable().describe('如果刚完成一个阶段，用一句话命名它；否则 null'),
  profile_update: z
    .object({
      known_concepts: z.array(z.string()).describe('这段里学习者已经展现出掌握的概念'),
      weak_spots: z.array(z.string()).describe('这段里学习者反复出错/明显不熟的地方'),
    })
    .nullable(),
});
export type Observation = z.infer<typeof ObservationSchema>;

const INSTRUCTION = `You are Sensei, a patient senior engineer sitting next to a learner while they work in a terminal.
You receive: the learner's goal, their profile, notes so far, the hints you already gave, and the most recent terminal transcript
(lines starting with "$ " are commands they typed; other lines are what the terminal printed).

Your job each tick:
1. Decide the learner's state from EVIDENCE in the transcript (repeated errors, same command failing, thrashing, long silence, or clean progress).
2. Decide whether to speak. Default is SILENCE. Speak only when:
   - they are clearly stuck (same failure twice, or an error whose fix they obviously don't see), or
   - they are about to do something destructive/wasteful, or
   - they just reached a milestone worth naming (say so briefly), or
   - they explicitly asked you (a "[user → sensei]" line).
   Never repeat a hint you already gave. Never lecture. Never comment on trivial success.
3. Match the profile: style=hint-first → give direction, not the answer, unless they've failed 3+ times; style=answer-first → give the fix.
   level=beginner → explain terms; level=advanced → assume they know the basics. verbosity=terse → one line.
4. Write notes generously (they're silent): what was tried, what failed, why, what worked. Notes become the tutorial later.
5. Ask a clarifying question ONLY if the right hint depends on their intent and you cannot infer it.
6. Everything you say to the learner must be in the profile's language (zh-CN → 简体中文，术语保留英文).

Output ONLY a JSON object matching the schema. No markdown, no commentary.`;

export interface ObserverInput {
  goal: string | null;
  profile: LearnerProfile;
  notes: string[];
  hintsGiven: string[];
  pendingQuestion: string | null;
  transcript: string;
  minutesSinceStart: number;
}

export class Observer {
  private agent: LlmAgent;
  constructor(cfg: SenseiConfig) {
    this.agent = new LlmAgent({
      name: 'sensei_observer',
      description: 'Watches a learner terminal session and decides whether to coach.',
      model: makeModel(cfg),
      instruction: INSTRUCTION,
      outputSchema: ObservationSchema,
      generateContentConfig: { temperature: 0.3 },
    });
  }

  async observe(input: ObserverInput): Promise<Observation | null> {
    const message = [
      `GOAL: ${input.goal ?? '(not stated — infer from what they do)'}`,
      `PROFILE: ${describeProfile(input.profile)}`,
      `SESSION_MINUTES: ${input.minutesSinceStart.toFixed(0)}`,
      `NOTES_SO_FAR (${input.notes.length}):`,
      ...input.notes.slice(-15).map((n) => `- ${n}`),
      `HINTS_ALREADY_GIVEN (${input.hintsGiven.length}):`,
      ...input.hintsGiven.slice(-8).map((h) => `- ${h}`),
      input.pendingQuestion ? `PENDING_QUESTION (unanswered): ${input.pendingQuestion}` : 'PENDING_QUESTION: none',
      'TRANSCRIPT (most recent last):',
      '<<<',
      input.transcript,
      '>>>',
    ].join('\n');
    const { text } = await runOnce(this.agent, message);
    const parsed = extractJson<unknown>(text);
    if (!parsed) return null;
    const res = ObservationSchema.safeParse(parsed);
    return res.success ? res.data : null;
  }
}
