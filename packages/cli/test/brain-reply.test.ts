import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 隔离的 SENSEI_HOME：必须在任何 src 模块加载前设好
process.env.SENSEI_HOME = mkdtempSync(join(tmpdir(), 'sensei-test-'));

type BrainT = typeof import('../src/lib/brain.js');
type SessionT = typeof import('../src/lib/session.js');
type ProfileT = typeof import('../src/lib/profile.js');
let BrainMod: BrainT;
let SessionMod: SessionT;
let ProfileMod: ProfileT;

before(async () => {
  BrainMod = await import('../src/lib/brain.js');
  SessionMod = await import('../src/lib/session.js');
  ProfileMod = await import('../src/lib/profile.js');
});

function makeBrain() {
  const log = new SessionMod.LocalSessionLog('test-' + Math.random().toString(36).slice(2, 8));
  const said: string[] = [];
  const brain = new BrainMod.Brain({
    cfg: {
      geminiApiKey: undefined, // 让 agents 构造失败：coach=null，专测 reply/fb 路径
      model: 'x',
      observerModel: 'x',
      cheapModel: '',
      serviceAccountPath: join(process.env.SENSEI_HOME!, 'none.json'),
      projectId: undefined,
      proxy: undefined,
      cloudEnabled: false,
    },
    sessionId: 'test',
    goal: null,
    log,
    say: (t) => said.push(t),
  });
  return { brain, said, log };
}

test('panel reply without/with empty questionId is rejected; matching id consumes the question', async () => {
  const { brain } = makeBrain();
  // 私有字段注入当前待答问题（测试通道）
  (brain as unknown as { pendingQuestion: { id?: string; text: string } | null }).pendingQuestion = {
    id: 'current-id',
    text: 'Q?',
  };
  const missing = (await brain.handle('/reply', { text: 'x', fromPanel: true })) as { ok: boolean; reason?: string };
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'stale-question');
  const empty = (await brain.handle('/reply', { text: 'x', questionId: '', fromPanel: true })) as { ok: boolean };
  assert.equal(empty.ok, false);
  const stale = (await brain.handle('/reply', { text: 'x', questionId: 'stale-id', fromPanel: true })) as { ok: boolean };
  assert.equal(stale.ok, false);
  // 问题仍在
  assert.ok((brain as unknown as { pendingQuestion: unknown }).pendingQuestion);
  const okRes = (await brain.handle('/reply', { text: 'yes', questionId: 'current-id', fromPanel: true })) as { ok: boolean };
  assert.equal(okRes.ok, true);
  assert.equal((brain as unknown as { pendingQuestion: unknown }).pendingQuestion, null);
});

test('terminal reply without id keeps working', async () => {
  const { brain } = makeBrain();
  (brain as unknown as { pendingQuestion: { id?: string; text: string } | null }).pendingQuestion = {
    id: 'q2',
    text: 'Q2?',
  };
  const r = (await brain.handle('/reply', { text: 'from terminal' })) as { ok: boolean };
  assert.equal(r.ok, true);
});

test('anonymous feedback adjusts the in-memory profile but never persists', async () => {
  const { brain } = makeBrain();
  const file = join(process.env.SENSEI_HOME!, 'profile.json');
  const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
  await brain.handle('/fb', { value: 'just-tell-me', anon: true });
  assert.equal(brain.profile.style, 'answer-first'); // 本场生效
  const after = existsSync(file) ? readFileSync(file, 'utf8') : null;
  assert.equal(after, before); // 未持久化
  // 具名反馈才落盘
  await brain.handle('/fb', { value: 'let-me-try' });
  const persisted = JSON.parse(readFileSync(file, 'utf8')) as { style: string };
  assert.equal(persisted.style, 'hint-first');
  void ProfileMod; // keep import referenced
});
