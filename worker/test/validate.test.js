// Unit tests for the telemetry payload checks. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/validate.js';

const NOW = new Date('2026-11-13T12:00:00Z');
const good = { v: 1, type: 'counts', ext: '0.2.0', day: '2026-11-12', counts: [{ site: 'x', kind: 'signal', n: 14 }, { site: 'linkedin', kind: 'label', n: 2 }] };

test('accepts a normal daily counts payload', () => {
  const r = validate(good, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.value.counts.length, 2);
});
test('accepts an install ping and stamps it with today (UTC)', () => {
  const r = validate({ v: 1, type: 'install', ext: '0.2.0' }, NOW);
  assert.deepEqual(r, { ok: true, value: { type: 'install', ext: '0.2.0', day: '2026-11-13' } });
});
test('rejects any extra field, so nothing identifying can be smuggled in', () => {
  assert.equal(validate({ ...good, id: 'abc' }, NOW).ok, false);
  assert.equal(validate({ v: 1, type: 'install', ext: '0.2.0', url: 'https://x.com' }, NOW).ok, false);
  assert.equal(validate({ ...good, counts: [{ site: 'x', kind: 'signal', n: 1, text: 'hello' }] }, NOW).ok, false);
});
test('rejects unknown sites and reasons', () => {
  assert.equal(validate({ ...good, counts: [{ site: 'facebook', kind: 'signal', n: 1 }] }, NOW).ok, false);
  assert.equal(validate({ ...good, counts: [{ site: 'x', kind: 'other', n: 1 }] }, NOW).ok, false);
});
test('rejects silly numbers', () => {
  for (const n of [0, -1, 1.5, 5001, '3', null]) assert.equal(validate({ ...good, counts: [{ site: 'x', kind: 'signal', n }] }, NOW).ok, false, String(n));
});
test('rejects duplicate site+reason entries and empty lists', () => {
  assert.equal(validate({ ...good, counts: [{ site: 'x', kind: 'signal', n: 1 }, { site: 'x', kind: 'signal', n: 1 }] }, NOW).ok, false);
  assert.equal(validate({ ...good, counts: [] }, NOW).ok, false);
});
test('only accepts days from the last week (one day of leeway for time zones)', () => {
  assert.equal(validate({ ...good, day: '2026-11-13' }, NOW).ok, true);
  assert.equal(validate({ ...good, day: '2026-11-14' }, NOW).ok, true);
  assert.equal(validate({ ...good, day: '2026-11-15' }, NOW).ok, false);
  assert.equal(validate({ ...good, day: '2026-11-05' }, NOW).ok, true);
  assert.equal(validate({ ...good, day: '2026-11-04' }, NOW).ok, false);
  assert.equal(validate({ ...good, day: '13/11/2026' }, NOW).ok, false);
});
test('rejects wrong version, type and malformed input', () => {
  assert.equal(validate({ ...good, v: 2 }, NOW).ok, false);
  assert.equal(validate({ ...good, ext: 'latest' }, NOW).ok, false);
  assert.equal(validate({ ...good, type: 'events' }, NOW).ok, false);
  assert.equal(validate(null, NOW).ok, false);
  assert.equal(validate([good], NOW).ok, false);
});
