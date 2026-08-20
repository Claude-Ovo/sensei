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

test('isEchoHint: paraphrase is echo, changed key token is not', async () => {
  const { isEchoHint } = await import('../src/lib/brain.js');
  assert.ok(isEchoHint(
    '请在 package.json 中添加 "type": "module" 配置，这样 Node.js 才能识别 import 语法。',
    '请打开 package.json 文件，添加 "type": "module"，让 Node.js 识别 import 语法。',
  ));
  assert.ok(!isEchoHint('把 src/index.ts 里的端口改成 3001。', '把 src/index.ts 里的端口改成 3002。'));
});

test('redactor: basic auth, private key, AWS key, runtime secret, case-insensitive home', async () => {
  const { makeRedactor } = await import('../src/lib/redact.js');
  const r = makeRedactor();
  assert.match(r('Authorization: Basic dXNlcjpwYXNz'), /Basic <REDACTED_TOKEN>/);
  assert.match(r('PRIVATE_KEY=QUJDREVGMTIzNDU2Nzg5MA'), /PRIVATE_KEY=<REDACTED>/);
  assert.match(r('key AKIAIOSFODNN7EXAMPLE ok'), /<REDACTED_KEY>/);
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) assert.ok(!r('cd ' + home.toUpperCase() + '\proj').toUpperCase().includes(home.toUpperCase()));
  r.addSecret('tok_runtime_secret_1');
  assert.equal(r('echo tok_runtime_secret_1'), 'echo <REDACTED>');
});

test('isEchoHint: negation flip is NOT an echo', async () => {
  const { isEchoHint } = await import('../src/lib/brain.js');
  assert.ok(!isEchoHint('请先运行 npm install 再启动服务。', '请先不要运行 npm install，先检查 package.json。'));
  assert.ok(!isEchoHint('Run npm install first.', "Don't run npm install first."));
  // 纯换皮复读仍然要被抓
  assert.ok(isEchoHint('请在 package.json 中添加 "type": "module" 配置。', '请打开 package.json，加上 "type": "module" 配置。'));
});

test('isEchoHint negation signatures: codex counterexamples', async () => {
  const { isEchoHint } = await import('../src/lib/brain.js');
  // 两句都含"不要跳过检查"，但 npm install 的否定态翻转了 → 不是复读
  assert.ok(!isEchoHint('请运行 npm install，不要跳过检查。', '请不要运行 npm install，不要跳过检查。'));
  assert.ok(!isEchoHint('Run npm install; never skip tests.', 'Never run npm install; never skip tests.'));
  // 两句否定态一致的换皮复读，仍要被抓
  assert.ok(isEchoHint('请不要跳过 npm install 这一步。', '别跳过 npm install 这一步哦。'));
});

test('redactor: basic auth is case-insensitive', async () => {
  const { makeRedactor } = await import('../src/lib/redact.js');
  const r = makeRedactor();
  assert.match(r('authorization: basic dXNlcjpwYXNz'), /basic <REDACTED_TOKEN>/);
  assert.match(r('AUTHORIZATION: BASIC DXNLCJPWYXNZ00'), /BASIC <REDACTED_TOKEN>/);
});
