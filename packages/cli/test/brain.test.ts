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
