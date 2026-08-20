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
import { Triage } from '../agent/triage.js';
import { modelHealth } from '../agent/llm.js';

export interface BrainOptions {
  cfg: SenseiConfig;
  sessionId: string;
  goal: string | null;
  log: LocalSessionLog;
  /** 往真实终端打一行（stderr），由 start 提供，负责处理光标/换行 */
  say: (text: string, level?: string) => void;
  cloud?: CloudStore;
  /** 本地脱敏器：所有用户可见文本出机前过它（ask/reply/note/goal/面板 inbound） */
  redact?: (s: string) => string;
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
  private triage: Triage | null = null;
  private timer: NodeJS.Timeout | null = null;
  private observing = false;
  private lastObserveAt = 0;
  private lastFullObserveAt = 0;
  private lastHintAt = 0;
  private lastHintSeq = 0;
  private lastInText = '';
  private lastInAt = 0;
  private lastAutoAsked = '';
  private autoAskBusy = false;
  private pendingAutoAsk: string | null = null;
  private askChain: Promise<unknown> = Promise.resolve();
  private inboundBuckets = new Map<string, number[]>();
  private inboundAskTotal = 0;
  private lastObservedSeq = 0;
  private startedAt = Date.now();
  private llmError: string | null = null;
  ticks = 0;
  triages = 0;

  constructor(private readonly o: BrainOptions) {
    this.profile = loadProfile();
    try {
      this.observer = new Observer(o.cfg);
      this.coach = new Coach(o.cfg);
      this.compiler = new Compiler(o.cfg);
      if (o.cfg.cheapModel && process.env.SENSEI_TRIAGE !== '0') this.triage = new Triage(o.cfg);
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
    if (c.kind === 'in') {
      this.lastInText = c.text;
      this.lastInAt = Date.now();
    }
    if (c.kind === 'out') this.maybeAutoAsk(c.text);
    if (c.kind === 'out' || c.kind === 'in') this.schedule();
  }

  /**
   * 她教会我们的功能：学习者会直接在终端里打自然语言（"这个错到底怎么回事"）。
   * shell 报"无法识别命令"时，如果上一条输入长得像人话，就把它当 sensei ask 接住，
   * 并顺便教一次正确用法。
   * 约束（codex 验收 #5-5）：输入和它的报错必须挨着（≤8s），防止旧问题被后来的无关报错迟到误触发；
   * 忙时排队一个，不静默丢。
   */
  private maybeAutoAsk(out: string): void {
    if (!this.coach) return;
    const q = this.lastInText;
    if (!q || q === this.lastAutoAsked) return;
    const cmdNotFound = /CommandNotFoundException|is not recognized as (the name of )?a cmdlet|command not found|无法将.{0,60}识别为/i.test(out);
    if (!cmdNotFound) return;
    // 报错必须紧跟着这条输入；太久以前的输入不认账
    if (Date.now() - this.lastInAt > 8_000) return;
    const natural = /[一-鿿]/.test(q) || /[?？]\s*$/.test(q) || /^(what|why|how|where|help|explain|please)\b/i.test(q);
    if (!natural || /^sensei\b/i.test(q)) return;
    this.lastAutoAsked = q;
    if (this.autoAskBusy) {
      this.pendingAutoAsk = q; // 排队一个，最新的赢
      return;
    }
    this.fireAutoAsk(q);
  }

  private fireAutoAsk(q: string): void {
    this.autoAskBusy = true;
    this.o.say(`这句我当问题接了（下次可以直接：sensei ask "${q.slice(0, 40)}"）`, 'info');
    void this.handle('/ask', { text: q })
      .then((r) => this.o.say(String((r as { answer: string }).answer), 'explain'))
      .catch((e) => this.o.say(`没答上来：${String((e as Error).message).slice(0, 80)}`, 'error'))
      .finally(() => {
        this.autoAskBusy = false;
        const next = this.pendingAutoAsk;
        this.pendingAutoAsk = null;
        if (next && next !== q) this.fireAutoAsk(next);
      });
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
    const prevSeq = this.lastObservedSeq;
    this.lastObservedSeq = win.toSeq;
    try {
      // 三级门：本地正则（免费）→ Gemma 分诊（便宜）→ Observer（贵）
      const slice = this.transcript.since(prevSeq);
      const local = quickSignal(slice);
      if (local === 'skip' && reason !== 'reply' && reason !== 'replay-final') {
        this.o.log.append('meta', 'triage', { attention: 'none', kind: 'noise', summary: 'local: prompt-only/empty' , by: 'regex' });
        return null;
      }
      if (local === 'ambiguous' && this.triage?.available && reason !== 'reply' && reason !== 'replay-final') {
        const tri = await this.triage.classify(slice);
        if (tri) {
          this.triages++;
          this.o.log.append('meta', 'triage', { attention: tri.attention, kind: tri.kind, summary: tri.summary });
          const sinceLastObs = now - this.lastFullObserveAt;
          const skip = tri.attention === 'none' || (tri.attention === 'low' && sinceLastObs < 45_000);
          if (skip) {
            this.o.cloud?.setState({ status: tri.kind === 'idle' ? 'idle' : 'flowing', lastObservation: tri.summary, triages: this.triages });
            return null;
          }
        }
      }
      this.lastFullObserveAt = now;
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
    // 第一次观察时露个面：让学习者知道它真的在看，而不是死了
    if (this.ticks === 1 && !obs.hint && !this.o.quietObserver) {
      this.o.say(`${chalk.dim('(watching) ' + obs.what_happened)}`, 'info');
    }

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
      // 冷却：刚说过话（40s 内）且这段里没有新的报错/用户消息 → 这次不开口，只记笔记
      const sinceLastHint = Date.now() - this.lastHintAt;
      const fresh = quickSignal(this.transcript.since(this.lastHintSeq)) === 'error';
      // 复读机守卫：跟最近两条提示意思雷同就闭嘴——同一个坑反复触发"新错误"时冷却拦不住它。
      // 但关键 token（数字/代码标识符）不同的两条不算复读："改成 3001" vs "改成 3002" 是两个提示（codex 验收 #5-11）
      const echo = this.hintsGiven.slice(-2).some((h) => isEchoHint(h, obs.hint!.text));
      if (echo) {
        this.o.log.append('meta', 'hint.suppressed', { text: obs.hint.text.slice(0, 120), reason: 'echo' });
      } else if (sinceLastHint < 40_000 && !fresh) {
        this.o.log.append('meta', 'hint.suppressed', { text: obs.hint.text.slice(0, 120), sinceLastHint });
      } else {
        this.hintsGiven.push(obs.hint.text);
        this.lastHintAt = Date.now();
        this.lastHintSeq = atSeq;
        this.o.log.append('agent', obs.hint.text, { kind: 'hint', level: obs.hint.level, atSeq, evidence: obs.stuck_reason });
        this.o.cloud?.hint({ level: obs.hint.level, text: obs.hint.text, evidence: obs.stuck_reason ?? undefined, atSeq });
        this.o.say(obs.hint.text, obs.hint.level);
      }
    }
    if (obs.question && !this.pendingQuestion) {
      const id = this.o.cloud?.question({ text: obs.question, atSeq });
      this.pendingQuestion = { id, text: obs.question };
      this.o.log.append('agent', obs.question, { kind: 'question', atSeq });
      this.o.say(`${obs.question}  ${chalk.dim('(answer with: sensei reply "...")')}`, 'question');
    }
  }

  /**
   * 面板写进 Firestore inbound 的消息 → 走同一套路由。
   * public 会话等于把 ask 开给了整个互联网（codex 验收 #5-13）：
   * 分 kind 令牌桶（ask 2/min·reply 5/min·feedback 6/min·note 4/min）+ ask 整场硬顶 10 次，超了丢弃并在终端提示一次；文本截长。
   */
  private inboundAllowed(kind: string): boolean {
    const now = Date.now();
    // 每类各自的桶：一类被刷不饿死其他类；ask 另有整场上限（20 次/日免费额度的保命绳）
    const bucket = this.inboundBuckets.get(kind) ?? [];
    const fresh = bucket.filter((t) => now - t < 60_000);
    const perMinute: Record<string, number> = { ask: 2, reply: 5, feedback: 6, note: 4 };
    if (fresh.length >= (perMinute[kind] ?? 4)) return false;
    if (kind === 'ask') {
      if (this.inboundAskTotal >= 10) return false; // 整场硬顶
      this.inboundAskTotal++;
    }
    fresh.push(now);
    this.inboundBuckets.set(kind, fresh);
    return true;
  }

  attachInbound(): void {
    if (!this.o.cloud) return;
    let throttleWarned = false;
    this.o.cloud.onInbound((m) => {
      if (m.text) m.text = m.text.slice(0, 1000);
      if (!this.inboundAllowed(m.kind)) {
        this.o.log.append('meta', 'inbound.throttled', { kind: m.kind });
        if (!throttleWarned) {
          throttleWarned = true;
          this.o.say('面板消息太密，开始限流（防止公开会话被刷额度）', 'info');
        }
        return;
      }
      const who = m.by ? ` (${m.by})` : '';
      switch (m.kind) {
        case 'reply':
          if (m.text) {
            this.o.say(`panel reply${who}: ${m.text}`, 'info');
            void this.handle('/reply', { text: m.text, questionId: m.questionId ?? null, fromPanel: true }).catch(() => undefined);
          }
          break;
        case 'feedback':
          if (m.value) {
            this.o.say(`panel feedback${who}: ${m.value}`, 'info');
            void this.handle('/fb', { value: m.value, anon: !m.by }).catch(() => undefined);
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
    const raw = String(body.text ?? '').trim();
    const text = raw && this.o.redact ? this.o.redact(raw) : raw;
    switch (route) {
      case '/status':
        return {
          sessionId: this.o.sessionId,
          goal: this.o.goal,
          notes: this.notes.length,
          hints: this.hintsGiven.length,
          milestones: this.milestones,
          ticks: this.ticks,
          triages: this.triages,
          llm: this.llmReady ? 'ready' : this.llmError,
          models: { observer: this.o.cfg.observerModel, coach: this.o.cfg.model, triage: this.o.cfg.cheapModel, resting: modelHealth() },
          triage: this.triage ? (this.triage.available ? this.o.cfg.cheapModel : 'paused') : 'off',
          pendingQuestion: this.pendingQuestion?.text ?? null,
        };
      case '/ask': {
        if (!text) throw new Error('empty question');
        // 串行化：并发 ask 按到达顺序一个个答，ask/answer 在日志里天然成对，
        // 离线 compile 的 FIFO 配对因此可靠（codex 复核二 #5：响应乱序错配的根修）
        const run = async (): Promise<{ answer: string }> => {
          this.o.log.append('user', text, { kind: 'ask' });
          this.o.cloud?.userMessage(text, 'ask');
          this.transcript.push({ t: new Date().toISOString(), seq: this.transcript.lastSeq + 0.5, kind: 'user', text });
          if (!this.coach) throw new Error(this.llmError ?? 'coach unavailable');
          try {
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
          // 刚正面回答过：Observer 别紧接着复述一遍
          this.hintsGiven.push(`(answered) ${answer.slice(0, 200)}`);
          this.lastHintAt = Date.now();
          this.lastHintSeq = this.transcript.lastSeq;
          this.transcript.push({ t: new Date().toISOString(), seq: this.transcript.lastSeq + 0.5, kind: 'agent', text: answer });
          return { answer };
          } catch (e) {
            // ask 已落日志：失败也要落一条 answer 占位，FIFO 配对不错位（codex 三验 #2）
            const msg = String((e as Error).message).slice(0, 120);
            this.o.log.append('agent', `(未能回答：${msg})`, { kind: 'answer', error: true });
            this.qa.push({ q: text, a: `(未能回答：${msg})` });
            throw e;
          }
        };
        const p = this.askChain.then(run, run);
        this.askChain = p.then(
          () => undefined,
          () => undefined,
        );
        return p;
      }
      case '/reply': {
        if (!text) throw new Error('empty reply');
        // 回复的完整性（codex 三验 #4）：
        // - 面板来源（fromPanel）：必须带非空 questionId 且命中当前待答问题——缺失/空串/过期/伪造一律拒绝
        // - 终端 IPC（学习者本人在被包住的 shell 里）：无 id，保持原语义
        const qid = typeof body.questionId === 'string' && body.questionId ? body.questionId : null;
        if (body.fromPanel) {
          if (!qid || !this.pendingQuestion || this.pendingQuestion.id !== qid) {
            this.o.log.append('meta', 'reply.stale-question', { qid: qid ?? '(missing)' });
            return { ok: false, reason: 'stale-question' };
          }
        } else if (qid && (!this.pendingQuestion || this.pendingQuestion.id !== qid)) {
          this.o.log.append('meta', 'reply.stale-question', { qid });
          return { ok: false, reason: 'stale-question' };
        }
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
        // 匿名（面板未登录）反馈只作用于本场会话的内存画像，不持久化——
        // 一条路人 just-tell-me 不该改写她的长期偏好（codex 复核二 #13 补充）
        if (!body.anon) saveProfile(this.profile);
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

/**
 * 免费的本地信号：
 * - 'skip'      新内容只有 prompt 回显/空白 → 谁都不用叫
 * - 'error'     出现明显报错特征 → 直接叫 Observer（别浪费一轮分诊）
 * - 'ambiguous' 其他 → 让 Gemma 先看
 */
export function quickSignal(slice: string): 'skip' | 'error' | 'ambiguous' {
  const meaningful = slice
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(PS |[$#>]\s*$|\$ ?$|>>\s*$)/.test(l) && !/^(PS )?~?[\w:\\/.\- ]*>\s*$/.test(l));
  if (meaningful.length === 0) return 'skip';
  const text = meaningful.join('\n');
  if (/\[user → sensei\]/.test(text)) return 'error';
  if (/\b(error|fatal|exception|traceback|panic|denied|not found|no such file|cannot|can't|failed|failure|unrecognized|not recognized|command not found|ENOENT|EACCES|EADDRINUSE|npm ERR!|SyntaxError|TypeError|ReferenceError|segfault|exit code [1-9])\b/i.test(text)) return 'error';
  return 'ambiguous';
}

/** 两条提示是否算复读：文本相似度高，且关键 token（数字、代码标识符）没有变化 */
export function isEchoHint(prev: string, next: string): boolean {
  if (bigramSimilarity(prev, next) <= 0.55) return false;
  const keyTokens = (s: string) =>
    new Set(
      (s.match(/\d+|[A-Za-z_][\w./:\\-]{2,}/g) ?? [])
        .map((t) => t.toLowerCase().replace(/[./\\:-]+$/, '')) // 句尾标点别吞进 token："install." ≠ "install" 会误判集合不等
        .filter((t) => t.length >= 2),
    );
  const A = keyTokens(prev);
  const B = keyTokens(next);
  for (const t of B) if (!A.has(t)) return false; // 新提示里出现了旧提示没有的关键 token → 不是复读
  for (const t of A) if (!B.has(t)) return false;
  // 否定签名（best-effort 启发式，不是语义理解）：对每个共有关键 token，
  // 看它前面 10 个字符内有没有否定词；两句里任一 token 的否定签名不同 → 语义可能相反，不算复读。
  // 这抓得住 "请运行 X" vs "请不要运行 X"、"Run X" vs "Never run X"，包括句中其他位置本来就有否定词的情况；
  // 抓不住更远距离/更绕的否定——那类漏网宁可放行（多说一句好过压掉救命提示）。
  const NEG = /[不别勿莫没]|\b(?:not|don'?t|never|no|avoid|stop)\s*$/i;
  // 每个 token 的**所有出现位置**都取否定签名，按排序后的多重集合比较：
  // 只看第一次出现会在"同一 token 多次出现、极性不同"时误判（漏放和误杀两个方向都堵，codex 三验 #3）
  const negFlags = (s: string, token: string): string => {
    const ls = s.toLowerCase();
    const flags: boolean[] = [];
    let i = ls.indexOf(token);
    while (i >= 0) {
      flags.push(NEG.test(s.slice(Math.max(0, i - 10), i)));
      i = ls.indexOf(token, i + token.length);
    }
    return flags.sort().join(',');
  };
  for (const t of A) if (negFlags(prev, t) !== negFlags(next, t)) return false;
  return true;
}

/** 字符 bigram Jaccard 相似度（0~1）。中英文都好使，够快够糙。 */
export function bigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.replace(/\s+/g, '');
    const set = new Set<string>();
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
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
