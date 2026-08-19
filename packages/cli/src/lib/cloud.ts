import { Firestore, FieldValue, type DocumentReference } from '@google-cloud/firestore';
import type { Chunk } from './session.js';
import type { SenseiConfig } from './config.js';

export interface SessionMeta {
  goal: string | null;
  shell: string;
  cwd: string;
  platform: string;
  learnerId: string;
  /** 面板：public 会话谁都能看（演示用） */
  public: boolean;
  /** 面板：非 public 时只有这个 Google 邮箱能看 */
  ownerEmail: string | null;
}

export type HintLevel = 'nudge' | 'hint' | 'explain' | 'fix';

export interface Hint {
  level: HintLevel;
  text: string;
  evidence?: string;
  atSeq: number;
}

export interface Question {
  text: string;
  atSeq: number;
}

export interface InboundMessage {
  id: string;
  kind: 'reply' | 'feedback' | 'note' | 'ask';
  text?: string;
  value?: string;
  questionId?: string;
  by?: string;
}

/**
 * Firestore 是 Sensei 的共享大脑：终端流、笔记、提示、问答、反馈、教程都在这。
 * 面板（Firebase Hosting）用实时监听读同一份数据。
 * 写失败不阻塞终端——云端只是镜像，本地 JSONL 才是主日志。
 */
export class CloudStore {
  private db: Firestore;
  private ref: DocumentReference;
  private pending: Promise<unknown> = Promise.resolve();
  private failures = 0;
  readonly enabled = true;

  constructor(cfg: SenseiConfig, readonly sessionId: string) {
    // gRPC 走 CONNECT 代理：grpc-js 读 grpc_proxy / https_proxy
    if (cfg.proxy) {
      process.env.grpc_proxy ||= cfg.proxy;
      process.env.https_proxy ||= cfg.proxy;
      process.env.HTTPS_PROXY ||= cfg.proxy;
    }
    this.db = new Firestore({
      projectId: cfg.projectId,
      keyFilename: cfg.serviceAccountPath,
      preferRest: false,
      ignoreUndefinedProperties: true,
    });
    this.ref = this.db.collection('sessions').doc(sessionId);
  }

  private queue<T>(fn: () => Promise<T>, label: string): void {
    this.pending = this.pending
      .then(fn)
      .catch((e) => {
        this.failures++;
        if (this.failures <= 3 || this.failures % 50 === 0) {
          process.stderr.write(`\n[sensei] cloud write failed (${label}): ${String((e as Error).message).slice(0, 120)}\n`);
        }
      });
  }

  start(meta: SessionMeta): void {
    this.queue(
      () =>
        this.ref.set(
          {
            ...meta,
            state: 'active',
            startedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            lastSeq: 0,
          },
          { merge: true },
        ),
      'session.start',
    );
  }

  chunk(c: Chunk): void {
    const id = String(c.seq).padStart(6, '0');
    this.queue(async () => {
      const batch = this.db.batch();
      batch.set(this.ref.collection('chunks').doc(id), { ...c, ts: FieldValue.serverTimestamp() });
      batch.set(this.ref, { lastSeq: c.seq, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await batch.commit();
    }, 'chunk');
  }

  hint(h: Hint): void {
    this.queue(() => this.ref.collection('hints').add({ ...h, ts: FieldValue.serverTimestamp() }).then(() => undefined), 'hint');
  }

  note(text: string, kind: 'note' | 'milestone' = 'note', atSeq?: number): void {
    this.queue(
      () => this.ref.collection('notes').add({ text, kind, atSeq: atSeq ?? null, ts: FieldValue.serverTimestamp() }).then(() => undefined),
      'note',
    );
  }

  question(q: Question): Promise<string | undefined> {
    return this.ref
      .collection('questions')
      .add({ ...q, answer: null, ts: FieldValue.serverTimestamp() })
      .then((d) => d.id)
      .catch(() => undefined);
  }

  answer(questionId: string, answer: string): void {
    this.queue(
      () => this.ref.collection('questions').doc(questionId).set({ answer, answeredAt: FieldValue.serverTimestamp() }, { merge: true }),
      'answer',
    );
  }

  userMessage(text: string, kind: 'ask' | 'reply' | 'note'): void {
    this.queue(
      () => this.ref.collection('messages').add({ text, kind, ts: FieldValue.serverTimestamp() }).then(() => undefined),
      'message',
    );
  }

  setState(patch: Record<string, unknown>): void {
    this.queue(() => this.ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true }), 'state');
  }

  end(exitCode: number): void {
    this.queue(
      () => this.ref.set({ state: 'ended', exitCode, endedAt: FieldValue.serverTimestamp() }, { merge: true }),
      'session.end',
    );
  }

  /** 监听面板写进来的回答 / 反馈 / 提问（sessions/{id}/inbound） */
  onInbound(handler: (msg: InboundMessage) => void): () => void {
    const since = new Date(Date.now() - 5000);
    return this.ref
      .collection('inbound')
      .where('ts', '>', since)
      .onSnapshot(
        (snap) => {
          for (const ch of snap.docChanges()) {
            if (ch.type !== 'added') continue;
            const d = ch.doc.data();
            handler({
              id: ch.doc.id,
              kind: (['reply', 'feedback', 'note', 'ask'].includes(String(d.kind)) ? d.kind : 'note') as InboundMessage['kind'],
              text: typeof d.text === 'string' ? d.text : undefined,
              value: typeof d.value === 'string' ? d.value : undefined,
              questionId: typeof d.questionId === 'string' ? d.questionId : undefined,
              by: typeof d.by === 'string' ? d.by : undefined,
            });
          }
        },
        (e) => {
          process.stderr.write(`\n[sensei] inbound listener stopped: ${String(e.message).slice(0, 100)}\n`);
        },
      );
  }

  /** 等所有排队的写入落地（结束时调用） */
  async flush(timeoutMs = 8000): Promise<void> {
    await Promise.race([this.pending, new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  async terminate(): Promise<void> {
    await this.flush();
    await this.db.terminate().catch(() => undefined);
  }
}
