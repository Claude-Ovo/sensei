#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { start } from './commands/start.js';
import { callIpc } from './lib/ipc.js';

const program = new Command();
program
  .name('sensei')
  .description(
    'An agent that watches you learn a tool in the terminal, coaches you step by step, takes notes, and turns your struggle into a tutorial.',
  )
  .version('0.1.0');

program
  .command('start')
  .description('Wrap your shell and start a learning session')
  .option('-s, --shell <path>', 'shell to launch (default: powershell.exe on Windows, $SHELL elsewhere)')
  .option('-g, --goal <text>', 'what you are trying to learn/do in this session')
  .option('-q, --quiet', 'no banner')
  .option('--offline', 'do not mirror to Firestore')
  .option('--no-agent', 'record only; the observer stays silent')
  .option('--public', 'make this session visible to anyone on the web panel (demo mode)')
  .action((opts) => start({ ...opts, noAgent: opts.agent === false }));

const fail = (e: unknown) => {
  process.stderr.write(chalk.red(`[sensei] ${String((e as Error).message)}\n`));
  process.exit(1);
};

program
  .command('ask')
  .argument('<text...>', 'your question')
  .description('Ask Sensei about what is happening right now')
  .action(async (words: string[]) => {
    try {
      process.stderr.write(chalk.dim('[sensei] thinking…\n'));
      const r = await callIpc<{ answer: string }>('/ask', { text: words.join(' ') });
      process.stdout.write(`${chalk.cyan('[sensei]')} ${r.answer}\n`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command('reply')
  .argument('<text...>', 'your answer to the pending question')
  .description("Answer Sensei's clarifying question")
  .action(async (words: string[]) => {
    try {
      await callIpc('/reply', { text: words.join(' ') });
      process.stdout.write(chalk.dim('[sensei] got it.\n'));
    } catch (e) {
      fail(e);
    }
  });

program
  .command('note')
  .argument('<text...>', 'a note for the tutorial')
  .description('Leave a note in the session (goes into the tutorial)')
  .action(async (words: string[]) => {
    try {
      const r = await callIpc<{ notes: number }>('/note', { text: words.join(' ') });
      process.stdout.write(chalk.dim(`[sensei] noted (${r.notes} notes).\n`));
    } catch (e) {
      fail(e);
    }
  });

program
  .command('fb')
  .argument('<value>', 'too-basic | confusing | too-deep | just-tell-me | let-me-try | helpful | wrong')
  .description('Give feedback so Sensei adapts to you')
  .action(async (value: string) => {
    try {
      const r = await callIpc<{ profile: Record<string, unknown> }>('/fb', { value });
      process.stdout.write(chalk.dim(`[sensei] adjusted → ${JSON.stringify(r.profile)}\n`));
    } catch (e) {
      fail(e);
    }
  });

program
  .command('status')
  .description('Show the running session status')
  .action(async () => {
    try {
      const r = await callIpc('/status', {});
      process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    } catch (e) {
      fail(e);
    }
  });

program
  .command('done')
  .description('Compile this session into a tutorial (run before you exit the shell)')
  .action(async () => {
    try {
      process.stderr.write(chalk.dim('[sensei] compiling your session into a tutorial…\n'));
      const r = await callIpc<{ file: string; markdown: string }>('/done', {}, 300000);
      process.stdout.write(`\n${r.markdown}\n\n${chalk.dim(`[sensei] saved → ${r.file}`)}\n`);
    } catch (e) {
      fail(e);
    }
  });

program.parseAsync(process.argv);
