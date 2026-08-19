import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTerminal, normalizeCarriage, stripAnsi } from '../src/lib/ansi.js';
import { Chunker } from '../src/lib/chunker.js';
import { Transcript } from '../src/lib/transcript.js';

test('strips CSI / OSC sequences', () => {
  assert.equal(stripAnsi('\x1b[93mecho\x1b[m hi'), 'echo hi');
  assert.equal(stripAnsi('\x1b]0;title\x07PS>'), 'PS>');
  assert.equal(stripAnsi('\x1b]0;title\x1b\\PS>'), 'PS>');
  assert.equal(stripAnsi('\x1b[?25l\x1b[2J\x1b[Hx'), 'x');
});

test('carriage returns keep the last frame of a progress bar', () => {
  assert.equal(normalizeCarriage('10%\r50%\r100%\ndone'), '100%\ndone');
  assert.equal(cleanTerminal('a\x1b[31mb\x1b[0m\r\nc'), 'ab\nc'.replace('ab\nc', 'ab\nc'));
});

test('chunker flushes on size and on idle', async () => {
  const out: string[] = [];
  const c = new Chunker((t) => out.push(t), 30, 10);
  c.push('12345');
  c.push('67890'); // hits maxBytes → flush
  assert.deepEqual(out, ['1234567890']);
  c.push('abc');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(out, ['1234567890', 'abc']);
});

test('transcript window renders commands and output in order', () => {
  const t = new Transcript();
  t.push({ t: '', seq: 1, kind: 'in', text: 'git status' });
  t.push({ t: '', seq: 2, kind: 'out', text: 'fatal: not a git repository\n' });
  t.push({ t: '', seq: 3, kind: 'user', text: 'why?' });
  const w = t.window();
  assert.equal(w.text, '$ git status\nfatal: not a git repository\n[user → sensei] why?');
  assert.equal(w.toSeq, 3);
  assert.equal(t.hasNewSince(2), true);
  assert.equal(t.hasNewSince(3), false);
});
