#!/usr/bin/env node
import { Command } from 'commander';
import { start } from './commands/start.js';

const program = new Command();
program
  .name('sensei')
  .description('An agent that watches you learn a tool in the terminal, coaches you step by step, takes notes, and turns your struggle into a tutorial.')
  .version('0.1.0');

program
  .command('start')
  .description('Wrap your shell and start a learning session')
  .option('-s, --shell <path>', 'shell to launch (default: powershell.exe on Windows, $SHELL elsewhere)')
  .option('-g, --goal <text>', 'what you are trying to learn/do in this session')
  .option('-q, --quiet', 'no banner')
  .action((opts) => start(opts));

program.parseAsync(process.argv);
