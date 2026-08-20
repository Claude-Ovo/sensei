import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, msUntilPacificMidnight, orderModels, penalize } from '../src/agent/llm.js';

test('extractJson tolerates fences, prefixes and trailing prose', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! {"a":1,"b":[2]} hope this helps'), { a: 1, b: [2] });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson(''), null);
});

test('orderModels puts resting models last, sorted by soonest recovery, dropping none', () => {
  const models = ['m-a', 'm-b', 'm-c'];
  assert.deepEqual(orderModels(models), models);
  penalize('m-a', 60_000);
  assert.deepEqual(orderModels(models), ['m-b', 'm-c', 'm-a']);
  penalize('m-b', 120_000);
  penalize('m-c', 30_000);
  assert.deepEqual(orderModels(models), ['m-c', 'm-a', 'm-b']);
});

test('msUntilPacificMidnight is within a day and positive', () => {
  const ms = msUntilPacificMidnight();
  assert.ok(ms > 0 && ms <= 24 * 3600 * 1000 + 5000);
});
