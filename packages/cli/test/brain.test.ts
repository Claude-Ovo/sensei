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




test('isEchoHint final: strict equality (trim only)', async () => {
  const { isEchoHint } = await import('../src/lib/brain.js');
  // 只有首尾空白差异 → 抑制
  assert.ok(isEchoHint('请不要跳过 npm install 这一步。', '  请不要跳过 npm install 这一步。 '));
  assert.ok(isEchoHint('Run npm install first.', 'Run npm install first.'));
  // 空格/大小写本身就是纠正内容（codex 末验四连）→ 一律放行
  const pairs: Array<[string, string]> = [
    ['把命令改成 npminstall 再试。', '把命令改成 npm install 再试。'],
    ['试试 git checkoutmain。', '试试 git checkout main。'],
    ['把文件名改成 Foo.ts。', '把文件名改成 foo.ts。'],
    ['环境变量写 API_KEY。', '环境变量写 api_key。'],
    ['请不要跳过 npm install 这一步。', '请不要跳过  npm install 这一步。'],
    ['Run NPM install first.', 'run npm install first.'],
    // 六轮语义反例继续站岗
    ['把 src/index.ts 里的端口改成 3001。', '把 src/index.ts 里的端口改成 3002。'],
    ['Run npm install in dev; never run npm install in prod.', 'Never run npm install in dev; run npm install in prod.'],
    ['开发环境不要运行 npm install 但生产环境运行 npm test。', '开发环境运行 npm install 但生产环境不要运行 npm test。'],
    ['千万别在生产环境跑这个脚本，先在本地跑。', '在生产环境跑这个脚本，千万别先在本地跑。'],
    ['You cannot skip the build step.', 'You can skip the build step.'],
    ['请在 package.json 中添加 "type": "module" 配置。', '请打开 package.json，加上 "type": "module" 配置。'],
  ];
  for (const [a, b] of pairs) assert.ok(!isEchoHint(a, b), a.slice(0, 24));
});
