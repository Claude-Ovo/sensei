import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickSignal } from '../src/lib/brain.js';

test('quickSignal skips prompt-only slices', () => {
  assert.equal(quickSignal('PS ~\proj>\n\nPS ~\proj> '), 'skip');
  assert.equal(quickSignal(''), 'skip');
});

test('quickSignal flags errors and user messages', () => {
  assert.equal(quickSignal('$ git commit\nfatal: unable to auto-detect email address'), 'error');
  assert.equal(quickSignal("$ npmm i\nnpmm : The term 'npmm' is not recognized"), 'error');
  assert.equal(quickSignal('[user → sensei] why?'), 'error');
});

test('quickSignal leaves ordinary output to triage', () => {
  assert.equal(quickSignal('$ ls\nREADME.md  package.json'), 'ambiguous');
});

test('bigramSimilarity catches paraphrased repeats, passes distinct hints', async () => {
  const { bigramSimilarity } = await import('../src/lib/brain.js');
  const a = '请在 package.json 中添加 "type": "module" 配置，这样 Node.js 才能识别 import 语法。';
  const b = '请打开 package.json 文件，添加 "type": "module"，让 Node.js 识别 import 语法。';
  const c = '恭喜完成第一次提交，可以用 git log 查看历史。';
  assert.ok(bigramSimilarity(a, b) > 0.55);
  assert.ok(bigramSimilarity(a, c) < 0.3);
});
