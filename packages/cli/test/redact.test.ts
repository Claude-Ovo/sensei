import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRedactor } from '../src/lib/redact.js';

const redact = makeRedactor(['supersecretvalue123']);

test('redacts common API key shapes', () => {
  assert.equal(redact('key=AIzaSyBGIJysG3qEv3XazHYmxstLZG3HcvwHVrY'), 'key=<REDACTED_KEY>');
  assert.match(redact('token sk-abcdefghijklmnopqrstuvwxyz'), /<REDACTED_KEY>/);
  assert.match(redact('ghp_abcdefghijklmnopqrstuvwxyz1234567890'), /<REDACTED_KEY>/);
  assert.match(redact('Authorization: Bearer abcdefghijklmnop.qrstuvwxyz'), /Bearer <REDACTED_TOKEN>/);
});

test('redacts KEY=value secrets and emails', () => {
  assert.equal(redact('export OPENAI_API_KEY=abcdef123456'), 'export OPENAI_API_KEY=<REDACTED>');
  assert.equal(redact('password: hunter2222'), 'password: <REDACTED>');
  assert.equal(redact('mail me at someone@example.com now'), 'mail me at <EMAIL> now');
});

test('redacts explicit extra secrets and public IPs, keeps private IPs', () => {
  assert.equal(redact('x supersecretvalue123 y'), 'x <REDACTED> y');
  assert.equal(redact('curl 8.8.8.8 and 192.168.1.10'), 'curl <IP> and 192.168.1.10');
});

test('collapses the home directory to ~', () => {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (!home) return;
  assert.equal(redact(`cd ${home}\\proj`), 'cd ~\\proj');
  assert.equal(redact(`cd ${home.replace(/\\/g, '/')}/proj`), 'cd ~/proj');
});
