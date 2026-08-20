import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, msUntilPacificMidnight, orderModels, penalize } from '../src/agent/llm.js';

test('extractJson tolerates fences, prefixes and trailing prose', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! {"a":1,"b":[2]} hope this helps'), { a: 1, b: [2] });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson(''), null);
});

test('orderModels skips resting models; walks all (soonest first) only when everything rests', () => {
  const models = ['m-a', 'm-b', 'm-c'];
  assert.deepEqual(orderModels(models), models);
  penalize('m-a', 60_000);
  assert.deepEqual(orderModels(models), ['m-b', 'm-c']); // 真跳过，不再殿后追打
  penalize('m-b', 120_000);
  penalize('m-c', 30_000);
  assert.deepEqual(orderModels(models), ['m-c', 'm-a', 'm-b']); // 全歇：按最早恢复走整条链
});

test('isInvalidArgument matches all Google spellings', async () => {
  const { isInvalidArgument } = await import('../src/agent/llm.js');
  assert.ok(isInvalidArgument('Request contains an invalid argument.'));
  assert.ok(isInvalidArgument('INVALID_ARGUMENT'));
  assert.ok(isInvalidArgument('code: invalid-argument'));
  assert.ok(!isInvalidArgument('permission denied'));
});

test('msUntilPacificMidnight is within a day and positive', () => {
  const ms = msUntilPacificMidnight();
  assert.ok(ms > 0 && ms <= 24 * 3600 * 1000 + 5000);
});
