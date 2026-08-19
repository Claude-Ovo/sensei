import { appendFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type ChunkKind = 'out' | 'in' | 'meta' | 'agent' | 'user';
export interface Chunk {
  t: string; // ISO time
  seq: number;
  kind: ChunkKind;
  text: string;
  meta?: Record<string, unknown>;
}

export const SENSEI_HOME = process.env.SENSEI_HOME || join(homedir(), '.sensei');
export const SESSIONS_DIR = join(SENSEI_HOME, 'sessions');

export function newSessionId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${rand}`;
}

export class LocalSessionLog {
  readonly file: string;
  private seq = 0;
  constructor(readonly id: string) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
    this.file = join(SESSIONS_DIR, `${id}.jsonl`);
    if (!existsSync(this.file)) writeFileSync(this.file, '');
    writeFileSync(join(SENSEI_HOME, 'current'), id);
  }
  append(kind: ChunkKind, text: string, meta?: Record<string, unknown>): Chunk {
    const c: Chunk = { t: new Date().toISOString(), seq: ++this.seq, kind, text, ...(meta ? { meta } : {}) };
    appendFileSync(this.file, JSON.stringify(c) + '\n');
    return c;
  }
}
