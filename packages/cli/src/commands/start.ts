import pty from 'node-pty';
import chalk from 'chalk';
import { Chunker } from '../lib/chunker.js';
import { cleanTerminal } from '../lib/ansi.js';
import { makeRedactor } from '../lib/redact.js';
import { LocalSessionLog, newSessionId } from '../lib/session.js';

export interface StartOptions {
  shell?: string;
  goal?: string;
  quiet?: boolean;
}

function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.SENSEI_SHELL || 'powershell.exe';
  }
  return process.env.SENSEI_SHELL || process.env.SHELL || '/bin/bash';
}

export async function start(opts: StartOptions) {
  const shell = opts.shell || defaultShell();
  const sessionId = newSessionId();
  const log = new LocalSessionLog(sessionId);
  const redact = makeRedactor([process.env.GEMINI_API_KEY || '', process.env.SENSEI_TOKEN || '']);

  const cols = process.stdout.columns || 100;
  const rows = process.stdout.rows || 30;
  const shellArgs = /powershell|pwsh/i.test(shell) ? ['-NoLogo'] : [];

  const term = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.cwd(),
    env: { ...process.env, SENSEI_SESSION: sessionId, SENSEI_ACTIVE: '1' } as Record<string, string>,
  });

  log.append('meta', 'session.start', {
    shell,
    cwd: process.cwd(),
    platform: process.platform,
    goal: opts.goal ?? null,
  });

  // 输出流：镜像到真实终端 + 清洗/脱敏后进日志
  const outChunker = new Chunker((raw) => {
    const text = redact(cleanTerminal(raw));
    if (text.trim()) log.append('out', text);
  });
  term.onData((d) => {
    process.stdout.write(d);
    outChunker.push(d);
  });

  // 输入流：透传给 pty，同时按行记录用户敲的命令（回车触发）
  let lineBuf = '';
  const stdin = process.stdin;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  stdin.on('data', (key: string) => {
    term.write(key);
    for (const ch of key) {
      if (ch === '\r' || ch === '\n') {
        const cmd = lineBuf.trim();
        lineBuf = '';
        if (cmd) log.append('in', redact(cmd));
      } else if (ch === '\x7f' || ch === '\b') {
        lineBuf = lineBuf.slice(0, -1);
      } else if (ch === '\x03') {
        lineBuf = '';
        log.append('meta', 'ctrl-c');
      } else if (ch >= ' ') {
        lineBuf += ch;
      }
    }
  });

  process.stdout.on('resize', () => {
    term.resize(process.stdout.columns || cols, process.stdout.rows || rows);
  });

  if (!opts.quiet) {
    process.stderr.write(
      chalk.dim(`\n[sensei] watching · session ${sessionId}\n[sensei] log → ${log.file}\n`) +
        (opts.goal ? chalk.dim(`[sensei] goal: ${opts.goal}\n`) : '') +
        chalk.dim(`[sensei] type "exit" to finish\n\n`),
    );
  }

  await new Promise<void>((resolve) => {
    term.onExit(({ exitCode }) => {
      outChunker.flush();
      log.append('meta', 'session.end', { exitCode });
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      if (!opts.quiet) {
        process.stderr.write(chalk.dim(`\n[sensei] session ${sessionId} closed (exit ${exitCode})\n`));
      }
      resolve();
    });
  });
  // ConPTY 在 Windows 上会拖住进程，显式退出
  process.exit(0);
}
