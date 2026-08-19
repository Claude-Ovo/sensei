import chalk from 'chalk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SenseiConfig } from './config.js';
import { SENSEI_HOME } from './config.js';
import { CloudStore } from './cloud.js';
import type { LocalSessionLog, Chunk } from './session.js';
import { Transcript } from './transcript.js';
import { applyFeedback, loadProfile, saveProfile, type LearnerProfile } from './profile.js';
import { Observer, type Observation } from '../agent/observer.js';
import { Coach } from '../agent/coach.js';
import { Compiler } from '../agent/compiler.js';

export interface BrainOptions {
  cfg: SenseiConfig;
  sessionId: string;
  goal: string | null;
  log: LocalSessionLog;
  /** 往真实终端打一行（stderr），由 start 提供，负责处理光标/换行 */
  say: (text: string, level?: string) => void;
  cloud?: CloudStore;
  quietObserver?: boolean;
  /** 安静多久触发一次观察（ms） */
  debounceMs?: number;
  /** 两次观察最少间隔（ms），防止刷 token */
  minIntervalMs?: number;
}

/**
 * Brain：一个会话里所有"想"的部分。
 * - 收 chunk → 更新内存镜像 → 防抖触发 Observer
 * - Observer 的决定 → 打印提示 / 记笔记 / 提问 / 里程碑 / 更新画像
 * - IPC 进来的 ask/reply/note/fb/done → Coach / 记录 / Compiler
 */
export class Brain {
  readonly transcript = new Transcript();
  readonly profile: LearnerProfile;
  readonly notes: string[] = [];
  readonly milestones: string[] = [];
  readonly hintsGiven: string[] = [];
  readonly qa: Array<{ q: string; a: string }> = [];
  readonly history: Array<{ role: 'user' | 'sensei'; text: string }> = [];
  private pendingQuestion: { id?: string; text: string } | null = null;
  private observer: Observer | null = null;
  private coach: Coach | null = null;
  private compiler: Compiler | null = null;
  private timer: NodeJS.Timeout | null = null;
  private observing = false;
  private lastObserveAt = 0;
  private lastObservedSeq = 0;
  private startedAt = Date.now();
  private llmError: string | null = null;
  ticks = 0;

  constructor(private readonly o: BrainOptions) {
    this.profile = loadProfile();
    try {
      this.observer = new Observer(o.cfg);
      this.coach = new Coach(o.cfg);
      this.compiler = new Compiler(o.cfg);
    } catch (e) {
      this.llmError = String((e as Error).message);
    }
  }

  get llmReady(): boolean {
    return !!this.observer;
  }
  get llmProblem(): string | null {
    return this.llmError;
  }

  /** start.ts 每收到一个 chunk 就喂进来 */
  ingest(c: Chunk): void {
    this.transcript.push(c);
    this.o.cloud?.chunk(c);
    if (c.kind === 'out' || c.kind === 'in') this.schedule();
  }

  private schedule(): void {
    if (!this.observer) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick('debounce'), this.o.debounceMs ?? 2500);
  }

  /** 一次观察 */
  async tick(reason: string): Promise<Observation | null> {
    if (!this.observer || this.observing) return null;
    if (!this.transcript.hasNewSince(this.lastObservedSeq)) return null;
    const now = Date.now();
    const minGap = this.o.minIntervalMs ?? 6000;
    if (now - this.lastObserveAt < minGap) {
      // 太密：推迟到间隔满
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.tick('deferred'), minGap - (now - this.lastObserveAt));
      return null;
    }
    this.observing = true;
    this.lastObserveAt = now;
    const win = this.transcript.window();
    this.lastObservedSeq = win.toSeq;
    try {
      const obs = await this.observer.observe({
        goal: this.o.goal,
        profile: this.profile,
        notes: this.notes,
        hintsGiven: this.hintsGiven,
        pendingQuestion: this.pendingQuestion?.text ?? null,
        transcript: win.text,
        minutesSinceStart: (Date.now() - this.startedAt) / 60000,
      });
      this.ticks++;
      if (obs) await this.act(obs, win.toSeq, reason);
      return obs;
    } catch (e) {
      const msg = String((e as Error).message).slice(0, 160);
      this.o.log.append('meta', 'observer.error', { msg });
      if (this.ticks === 0) this.o.say(`observer error: ${msg}`, 'error');
      return null;
    } finally {
      this.observing = false;
      // 观察期间又来了新东西 → 再排一次
      if (this.transcript.hasNewSince(this.lastObservedSeq)) this.schedule();
    }
  }

  private async act(obs: Observation, atSeq: number, reason: string): Promise<void> {
    this.o.log.append('meta', 'observe', { reason, status: obs.status, confidence: obs.confidence, what: obs.what_happened });
    this.o.cloud?.setState({ status: obs.status, lastObservation: obs.what_happened, ticks: this.ticks });

    if (obs.note && !this.notes.includes(obs.note)) {
      this.notes.push(obs.note);
      this.o.log.append('agent', obs.note, { kind: 'note', atSeq });
      this.o.cloud?.note(obs.note, 'note', atSeq);
    }
    if (obs.milestone) {
      this.milestones.push(obs.milestone);
      this.o.log.append('agent', obs.milestone, { kind: 'milestone', atSeq });
      this.o.cloud?.note(obs.milestone, 'milestone', atSeq);
      if (!obs.hint) this.o.say(`✓ ${obs.milestone}`, 'milestone');
    }
    if (obs.profile_update) {
      let changed = false;
      for (const k of obs.profile_update.known_concepts) {
        if (k && !this.profile.knownConcepts.includes(k)) {
          this.profile.knownConcepts.push(k);
          changed = true;
        }
      }
      for (const w of obs.profile_update.weak_spots) {
        if (w && !this.profile.weakSpots.includes(w)) {
          this.profile.weakSpots.push(w);
          changed = true;
        }
      }
      if (changed) saveProfile(this.profile);
    }
    if (obs.hint && obs.hint.text && !this.o.quietObserver) {
      this.hintsGiven.push(obs.hint.text);
      this.o.log.append('agent', obs.hint.text, { kind: 'hint', level: obs.hint.level, atSeq, evidence: obs.stuck_reason });
      this.o.cloud?.hint({ level: obs.hint.level, text: obs.hint.text, evidence: obs.stuck_reason ?? undefined, atSeq });
      this.o.say(obs.hint.text, obs.hint.level);
    }
    if (obs.question && !this.pendingQuestion) {
      const id = await this.o.cloud?.question({ text: obs.question, atSeq });
      this.pendingQuestion = { id, text: obs.question };
      this.o.log.append('agent', obs.question, { kind: 'question', atSeq });
      this.o.say(`${obs.question}  ${chalk.dim('(answer with: sensei reply "...")')}`, 'question');
    }
  }

  /** 面板写进 Firestore inbound 的消息 → 走同一套路由 */
  attachInbound(): void {
    if (!this.o.cloud) return;
    this.o.cloud.onInbound((m) => {
      const who = m.by ? ` (${m.by})` : '';
      switch (m.kind) {
        case 'reply':
          if (m.text) {
            this.o.say(`panel reply${who}: ${m.text}`, 'info');
            void this.handle('/reply', { text: m.text }).catch(() => undefined);
          }
          break;
        case 'feedback':
          if (m.value) {
            this.o.say(`panel feedback${who}: ${m.value}`, 'info');
            void this.handle('/fb', { value: m.value }).catch(() => undefined);
          }
          break;
        case 'note':
          if (m.text) void this.handle('/note', { text: m.text }).catch(() => undefined);
          break;
        case 'ask':
          if (m.text) {
            this.o.say(`panel asks${who}: ${m.text}`, 'info');
            void this.handle('/ask', { text: m.text })
              .then((r) => this.o.say(String((r as { answer: string }).answer), 'explain'))
              .catch((e) => this.o.say(`could not answer: ${String((e as Error).message)}`, 'error'));
          }
          break;
      }
    });
  }

  /** IPC 路由 */
  async handle(route: string, body: Record<string, unknown>): Promise<unknown> {
    const text = String(body.text ?? '').trim();
    switch (route) {
      case '/status':
        return {
          sessionId: this.o.sessionId,
          goal: this.o.goal,
          notes: this.notes.length,
          hints: this.hintsGiven.length,
          milestones: this.milestones,
          ticks: this.ticks,
          llm: this.llmReady ? 'ready' : this.llmError,
          pendingQuestion: this.pendingQuestion?.text ?? null,
        };
      case '/ask': {
        if (!text) throw new Error('empty question');
        this.o.log.append('user', text, { kind: 'ask' });
        this.o.cloud?.userMessage(text, 'ask');
        this.transcript.push({ t: new Date().toISOString(), seq: this.transcript.lastSeq + 0.5, kind: 'user', text });
        if (!this.coach) throw new Error(this.llmError ?? 'coach unavailable');
        const answer = await this.coach.answer({
          goal: this.o.goal,
          profile: this.profile,
          notes: this.notes,
          transcript: this.transcript.window(120).text,
          history: this.history,
          question: text,
        });
        this.history.push({ role: 'user', text }, { role: 'sensei', text: answer });
        this.qa.push({ q: text, a: answer });
        this.o.log.append('agent', answer, { kind: 'answer' });
        this.o.cloud?.hint({ level: 'explain', text: answer, atSeq: this.transcript.lastSeq });
        this.transcript.push({ t: new Date().toISOString(), seq: this.transcript.lastSeq + 0.5, kind: 'agent', text: answer });
        return { answer };
      }
      case '/reply': {
        if (!text) throw new Error('empty reply');
        this.o.log.append('user', text, { kind: 'reply' });
        this.o.cloud?.userMessage(text, 'reply');
        if (this.pendingQuestion) {
          if (this.pendingQuestion.id) this.o.cloud?.answer(this.pendingQuestion.id, text);
          this.qa.push({ q: this.pendingQuestion.text, a: `(learner) ${text}` });
          this.history.push({ role: 'sensei', text: this.pendingQuestion.text }, { role: 'user', text });
          this.pendingQuestion = null;
        }
        this.transcript.push({ t: new Date().toISOString(), seq: this.transcript.lastSeq + 0.5, kind: 'user', text });
        this.lastObserveAt = 0; // 回答后立刻允许一次观察
        void this.tick('reply');
        return { ok: true };
      }
      case '/note': {
        if (!text) throw new Error('empty note');
        this.notes.push(`(learner) ${text}`);
        this.o.log.append('user', text, { kind: 'note' });
        this.o.cloud?.note(`(learner) ${text}`, 'note', this.transcript.lastSeq);
        return { ok: true, notes: this.notes.length };
      }
      case '/fb': {
        const value = String(body.value ?? text);
        applyFeedback(this.profile, value);
        saveProfile(this.profile);
        this.o.log.append('user', value, { kind: 'feedback' });
        this.o.cloud?.userMessage(value, 'note');
        this.o.cloud?.setState({ profile: publicProfile(this.profile) });
        return { ok: true, profile: publicProfile(this.profile) };
      }
      case '/done': {
        if (!this.compiler) throw new Error(this.llmError ?? 'compiler unavailable');
        const md = await this.compiler.compile({
          goal: this.o.goal,
          profile: this.profile,
          notes: this.notes,
          milestones: this.milestones,
          qa: this.qa,
          transcript: this.transcript.full(),
          durationMinutes: (Date.now() - this.startedAt) / 60000,
        });
        const dir = join(SENSEI_HOME, 'tutorials');
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${this.o.sessionId}.md`);
        writeFileSync(file, md);
        this.o.log.append('agent', `tutorial written: ${file}`, { kind: 'tutorial' });
        this.o.cloud?.setState({ tutorial: md, tutorialAt: new Date().toISOString(), state: 'compiled' });
        return { file, markdown: md };
      }
      default:
        throw new Error(`unknown route ${route}`);
    }
  }

  async shutdown(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
  }
}

function publicProfile(p: LearnerProfile) {
  return {
    level: p.level,
    verbosity: p.verbosity,
    style: p.style,
    knownConcepts: p.knownConcepts.slice(-20),
    weakSpots: p.weakSpots.slice(-10),
    feedback: p.feedback,
  };
}
