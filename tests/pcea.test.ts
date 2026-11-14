import assert from 'node:assert/strict';
import test from 'node:test';
import { hashCode, newRecoveryCode, normalizeCode } from '../lib/pcea/identity';
import { calibration, eventStats } from '../lib/pcea/stats';
import { addDays, isLocked, todayIn, viewerTime, zonedToInstant } from '../lib/pcea/time';

test('zonedToInstant handles offsets and DST', () => {
  assert.equal(new Date(zonedToInstant('2026-11-14', '19:00', 'America/New_York')).toISOString(), '2026-11-15T00:00:00.000Z');
  assert.equal(new Date(zonedToInstant('2026-07-04', '19:00', 'America/New_York')).toISOString(), '2026-07-04T23:00:00.000Z');
  assert.equal(new Date(zonedToInstant('2026-11-14', '08:30', 'Asia/Shanghai')).toISOString(), '2026-11-14T00:30:00.000Z');
  // The day DST ends in New York (Nov 1 2026): midnight is still EDT.
  assert.equal(new Date(zonedToInstant('2026-11-01', '00:00', 'America/New_York')).toISOString(), '2026-11-01T04:00:00.000Z');
});

test('an event locks when its own calendar day ends', () => {
  const endNy = zonedToInstant('2026-11-15', '00:00', 'America/New_York');
  assert.equal(isLocked('2026-11-14', 'America/New_York', endNy - 1), false);
  assert.equal(isLocked('2026-11-14', 'America/New_York', endNy), true);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(todayIn('Asia/Shanghai', Date.parse('2026-11-13T20:00:00Z')), '2026-11-14');
});

test('viewers in another timezone get their local time, same offset gets nothing', () => {
  const ev = { eventDate: '2026-11-14', startTime: '19:00', timezone: 'America/New_York' };
  const other = viewerTime(ev, 'Asia/Shanghai');
  assert.ok(other);
  assert.equal(other.text, 'Sun, Nov 15, 8:00 AM');
  assert.match(other.zone, /^Asia\/Shanghai/);
  assert.equal(viewerTime(ev, 'America/New_York'), null);
  assert.equal(viewerTime(ev, 'America/Toronto'), null);
  const allDay = viewerTime({ ...ev, startTime: null }, 'Europe/London');
  assert.equal(allDay?.text, null);
});

test('recovery codes round-trip through sloppy input', () => {
  const code = newRecoveryCode();
  assert.match(code, /^PCEA-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
  assert.equal(normalizeCode(code.toLowerCase().replace(/-/g, ' ')), code);
  assert.equal(normalizeCode(code.slice(5)), code);
  assert.equal(normalizeCode('PCEA-0OOOO-11ILL-22222'), 'PCEA-00000-11111-22222');
  assert.equal(normalizeCode('PCEA-123'), null);
  assert.equal(normalizeCode(42), null);
  assert.notEqual(hashCode(code), code);
});

test('event stats and calibration', () => {
  const s = eventStats([
    { probability: 100, interest: 'high', attended: null },
    { probability: 68, interest: 'some', attended: null },
    { probability: 20, interest: 'high', attended: null },
  ]);
  assert.equal(Number(s.expected.toFixed(2)), 1.88);
  assert.deepEqual([s.count, s.likely, s.sure], [3, 2, 1]);
  assert.deepEqual(s.interest, { high: 2, some: 1, none: 0 });

  assert.equal(calibration([{ probability: 50, attended: null }]).brier, null);
  const c = calibration([
    { probability: 80, attended: true },
    { probability: 80, attended: false },
    { probability: 0, attended: false },
  ]);
  assert.equal(c.resolved, 3);
  assert.equal(Number(c.brier!.toFixed(4)), Number(((0.04 + 0.64 + 0) / 3).toFixed(4)));
  assert.deepEqual(c.buckets.map(b => [b.label, b.n, b.actual]), [['0–19%', 1, 0], ['80–100%', 2, 0.5]]);
});
