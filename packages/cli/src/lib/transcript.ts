import type { Chunk } from './session.js';

/**
 * 内存里的会话镜像：给 agent 组装"最近发生了什么"。
 * 只保留纯文本，按行裁剪，避免把整段进度条喂给模型。
 */
export class Transcript {
  private chunks: Chunk[] = [];
  private lastTickSeq = 0;
  private maxChunks = 600;

  push(c: Chunk) {
    this.chunks.push(c);
    if (this.chunks.length > this.maxChunks) this.chunks.splice(0, this.chunks.length - this.maxChunks);
  }

  get lastSeq(): number {
    return this.chunks.length ? this.chunks[this.chunks.length - 1].seq : 0;
  }

  /** 自上次 tick 以来有没有新东西 */
  hasNewSince(seq: number): boolean {
    return this.lastSeq > seq;
  }

  markTick() {
    this.lastTickSeq = this.lastSeq;
  }

  get tickSeq() {
    return this.lastTickSeq;
  }

  /** 最近 N 行的窗口，带 in/out 标记；新旧分界用 seq */
  window(maxLines = 160, maxChars = 12000): { text: string; fromSeq: number; toSeq: number } {
    const lines: string[] = [];
    let fromSeq = this.lastSeq;
    for (let i = this.chunks.length - 1; i >= 0 && lines.length < maxLines; i--) {
      const c = this.chunks[i];
      const rendered = renderChunk(c);
      if (!rendered.length) continue;
      lines.unshift(...rendered);
      fromSeq = c.seq;
    }
    let text = lines.join('\n');
    if (text.length > maxChars) text = '…' + text.slice(-maxChars);
    return { text, fromSeq, toSeq: this.lastSeq };
  }

  /** 全量（给编译教程用），按顺序 */
  full(maxChars = 60000): string {
    const out: string[] = [];
    for (const c of this.chunks) out.push(...renderChunk(c));
    let text = out.join('\n');
    if (text.length > maxChars) text = '…(earlier output trimmed)…\n' + text.slice(-maxChars);
    return text;
  }
}

function renderChunk(c: Chunk): string[] {
  const t = c.text.replace(/\s+$/g, '');
  if (!t) return [];
  switch (c.kind) {
    case 'in':
      return [`$ ${t}`];
    case 'out':
      return t.split('\n').map((l) => l.replace(/\s+$/g, '')).filter((l, i, arr) => l || (i > 0 && arr[i - 1]));
    case 'user':
      return [`[user → sensei] ${t}`];
    case 'agent':
      return [`[sensei → user] ${t}`];
    case 'meta':
      return t === 'ctrl-c' ? ['^C'] : [];
    default:
      return [t];
  }
}
