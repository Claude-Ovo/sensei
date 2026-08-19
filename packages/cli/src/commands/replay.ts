import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import { loadConfig } from '../lib/config.js';
import { Brain } from '../lib/brain.js';
import { LocalSessionLog, type Chunk } from '../lib/session.js';

/**
 * 开发用：把一个已录制的会话 JSONL 重放给 Observer，看它在每个命令边界会说什么。
 * 不镜像云端、不起 pty。用于调 prompt / 回归测试。
 */
export async function replay(file: string, opts: { goal?: string; every?: string; verbose?: boolean }) {
  const cfg = loadConfig();
  const lines = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Chunk);
  const goal = opts.goal ?? (lines.find((c) => c.kind === 'meta' && c.text === 'session.start')?.meta?.goal as string | null) ?? null;
  const log = new LocalSessionLog(`replay-${Date.now().toString(36)}`);
  const said: string[] = [];
  const brain = new Brain({
    cfg,
    sessionId: 'replay',
    goal,
    log,
    say: (t, level) => {
      said.push(`[${level}] ${t}`);
      process.stdout.write(`${chalk.cyan(`  → sensei(${level}):`)} ${t}\n`);
    },
    debounceMs: 999999, // 不用防抖，手动 tick
    minIntervalMs: 0,
  });
  if (!brain.llmReady) {
    process.stderr.write(chalk.red(`agent not ready: ${brain.llmProblem}\n`));
    process.exit(1);
  }
  const every = Number(opts.every ?? 1);
  let cmdCount = 0;
  for (const c of lines) {
    if (c.kind === 'meta') continue;
    brain.ingest(c);
    if (c.kind === 'in') {
      cmdCount++;
      process.stdout.write(chalk.dim(`$ ${c.text}\n`));
    } else if (opts.verbose && c.kind === 'out') {
      process.stdout.write(chalk.gray(c.text.split('\n').slice(0, 6).join('\n') + '\n'));
    }
    // 在每 N 个命令之后（也就是它的输出到齐后）观察一次
    if (c.kind === 'out' && cmdCount > 0 && cmdCount % every === 0) {
      const obs = await brain.tick('replay');
      if (obs) {
        process.stdout.write(
          chalk.dim(`  · ${obs.status} (${obs.confidence.toFixed(2)}) ${obs.what_happened}${obs.stuck_reason ? ` | stuck: ${obs.stuck_reason}` : ''}\n`),
        );
      }
      cmdCount = 0;
    }
  }
  const obs = await brain.tick('replay-final');
  if (obs) process.stdout.write(chalk.dim(`  · ${obs.status} (${obs.confidence.toFixed(2)}) ${obs.what_happened}\n`));
  process.stdout.write(
    `\n${chalk.bold('summary')}: ticks=${brain.ticks} notes=${brain.notes.length} hints=${brain.hintsGiven.length} milestones=${brain.milestones.length}\n`,
  );
  for (const n of brain.notes) process.stdout.write(`  note: ${n}\n`);
  for (const m of brain.milestones) process.stdout.write(`  milestone: ${m}\n`);
  process.exit(0);
}
