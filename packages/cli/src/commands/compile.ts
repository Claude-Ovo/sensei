import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { loadConfig, SENSEI_HOME } from '../lib/config.js';
import { SESSIONS_DIR, type Chunk } from '../lib/session.js';
import { Transcript } from '../lib/transcript.js';
import { loadProfile } from '../lib/profile.js';
import { Compiler } from '../agent/compiler.js';
import { CloudStore } from '../lib/cloud.js';

/**
 * 会话已经退出了也能编译：从本地 JSONL 重建上下文，跑 Compiler，写本地文件 + 同步到云端会话文档。
 * `sensei compile`            → 最近一个会话
 * `sensei compile <sessionId>`
 */
export async function compile(sessionId: string | undefined, opts: { offline?: boolean; print?: boolean }) {
  const cfg = loadConfig();
  const id = sessionId ?? latestSessionId();
  if (!id) throw new Error('no recorded sessions in ' + SESSIONS_DIR);
  const file = join(SESSIONS_DIR, `${id}.jsonl`);
  if (!existsSync(file)) throw new Error(`session log not found: ${file}`);
  const chunks = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Chunk);

  const start = chunks.find((c) => c.kind === 'meta' && c.text === 'session.start');
  const goal = (start?.meta?.goal as string | null | undefined) ?? null;
  const t0 = start ? Date.parse(start.t) : Date.parse(chunks[0]?.t ?? new Date().toISOString());
  const t1 = Date.parse(chunks[chunks.length - 1]?.t ?? new Date().toISOString());

  const transcript = new Transcript();
  const notes: string[] = [];
  const milestones: string[] = [];
  const qa: Array<{ q: string; a: string }> = [];
  // 两类问答分开配对（codex 验收 #5-8）：
  // - learner ask → agent answer（Coach 线）
  // - agent question → learner reply（Observer 澄清线）
  // 合法交错（question 未答期间插入一对 ask/answer）不会串线。
  let pendingAsk: string | null = null;
  let pendingObserverQ: string | null = null;
  for (const c of chunks) {
    const kind = c.meta?.kind as string | undefined;
    if (c.kind === 'agent') {
      if (kind === 'note') notes.push(c.text);
      else if (kind === 'milestone') milestones.push(c.text);
      else if (kind === 'question') pendingObserverQ = c.text;
      else if (kind === 'answer' && pendingAsk) {
        qa.push({ q: pendingAsk, a: c.text });
        pendingAsk = null;
      }
      continue;
    }
    if (c.kind === 'user') {
      if (kind === 'note') notes.push(`(learner) ${c.text}`);
      else if (kind === 'ask') pendingAsk = c.text;
      else if (kind === 'reply' && pendingObserverQ) {
        qa.push({ q: pendingObserverQ, a: `(learner) ${c.text}` });
        pendingObserverQ = null;
      }
      transcript.push(c);
      continue;
    }
    if (c.kind === 'in' || c.kind === 'out') transcript.push(c);
  }

  process.stderr.write(chalk.dim(`[sensei] compiling session ${id} · ${chunks.length} chunks · ${notes.length} notes · ${milestones.length} milestones\n`));
  const compiler = new Compiler(cfg);
  const md = await compiler.compile({
    goal,
    profile: loadProfile(),
    notes,
    milestones,
    qa,
    transcript: transcript.full(),
    durationMinutes: Math.max(1, (t1 - t0) / 60000),
  });
  const dir = join(SENSEI_HOME, 'tutorials');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${id}.md`);
  writeFileSync(out, md);

  if (!opts.offline && cfg.cloudEnabled) {
    const cloud = new CloudStore(cfg, id);
    cloud.setState({ tutorial: md, tutorialAt: new Date().toISOString(), state: 'compiled' });
    await cloud.terminate();
  }
  if (opts.print !== false) process.stdout.write(`\n${md}\n\n`);
  process.stderr.write(chalk.dim(`[sensei] saved → ${out}\n`));
  process.exit(0);
}

function latestSessionId(): string | null {
  if (!existsSync(SESSIONS_DIR)) return null;
  const files = readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith('.jsonl') && !f.startsWith('replay-'))
    .sort();
  return files.length ? files[files.length - 1].replace(/\.jsonl$/, '') : null;
}
