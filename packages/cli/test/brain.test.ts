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



test('redactor: basic auth is case-insensitive', async () => {
  const { makeRedactor } = await import('../src/lib/redact.js');
  const r = makeRedactor();
  assert.match(r('authorization: basic dXNlcjpwYXNz'), /basic <REDACTED_TOKEN>/);
  assert.match(r('AUTHORIZATION: BASIC DXNLCJPWYXNZ00'), /BASIC <REDACTED_TOKEN>/);
});




test('isEchoHint final: verbatim-only suppression', async () => {
  const { isEchoHint } = await import('../src/lib/brain.js');
  // 逐字相同（大小写/空白差异忽略）→ 抑制
  assert.ok(isEchoHint('请不要跳过 npm install 这一步。', '请不要跳过  npm install 这一步。'));
  assert.ok(isEchoHint('Run NPM install first.', 'run npm install first.'));
  // codex 六轮对抗全部反例：任何语义可能不同的都放行（返回 false）
  const pairs: Array<[string, string]> = [
    ['把 src/index.ts 里的端口改成 3001。', '把 src/index.ts 里的端口改成 3002。'],
    ['请先运行 npm install 再启动服务。', '请先不要运行 npm install，先检查 package.json。'],
    ['Run npm install first.', "Don't run npm install first."],
    ['先检查 npm install 日志，不要跳过测试，然后运行 npm install。', '先检查 npm install 日志，不要跳过测试，然后不要运行 npm install。'],
    ['Run npm install in dev; never run npm install in prod.', 'Never run npm install in dev; run npm install in prod.'],
    ['Never run npm install in dev and run npm test in prod.', 'Run npm install in dev and never run npm test in prod.'],
    ['开发环境不要运行 npm install 但生产环境运行 npm test。', '开发环境运行 npm install 但生产环境不要运行 npm test。'],
    ['Do not delete cache and restart the server.', 'Delete cache and do not restart the server.'],
    ['千万别在生产环境跑这个脚本，先在本地跑。', '在生产环境跑这个脚本，千万别先在本地跑。'],
    ['You cannot skip the build step.', 'You can skip the build step.'],
    // 换皮复读也放行——由冷却/prompt 纪律/hintsGiven 历史兜底
    ['请在 package.json 中添加 "type": "module" 配置。', '请打开 package.json，加上 "type": "module" 配置。'],
  ];
  for (const [a, b] of pairs) assert.ok(!isEchoHint(a, b), a.slice(0, 24));
});
