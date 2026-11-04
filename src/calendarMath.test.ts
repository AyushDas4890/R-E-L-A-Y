import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpan, lanes, moveToDay, moveToTime, spanOf, stepAnchor, viewDays } from './calendarMath.ts';

test('moveToDay keeps time of day and length, across month ends', () => {
  assert.deepEqual(moveToDay({ start: '2026-11-20' }, '2026-12-02'), { start: '2026-12-02' });
  assert.deepEqual(moveToDay({ start: '2026-11-28', end: '2026-12-01' }, '2026-12-05'), { start: '2026-12-05', end: '2026-12-08' });
  assert.deepEqual(moveToDay({ start: '2026-11-20T09:30', end: '2026-11-20T10:30' }, '2026-11-18'), { start: '2026-11-18T09:30', end: '2026-11-18T10:30' });
});

test('moveToTime keeps the length, one hour by default, and rolls past midnight', () => {
  assert.deepEqual(moveToTime({ start: '2026-11-20' }, '2026-11-21', 540), { start: '2026-11-21T09:00', end: '2026-11-21T10:00' });
  assert.deepEqual(moveToTime({ start: '2026-11-20T09:00', end: '2026-11-20T09:45' }, '2026-11-20', 600), { start: '2026-11-20T10:00', end: '2026-11-20T10:45' });
  assert.deepEqual(moveToTime({ start: '2026-11-20T09:00', end: '2026-11-20T10:00' }, '2026-11-20', 23 * 60 + 30), { start: '2026-11-20T23:30', end: '2026-11-21T00:30' });
});

test('buildSpan: all-day, timed, ranges, and bad input', () => {
  const f = { date: '2026-11-20', time: '', endDate: '', endTime: '' };
  assert.deepEqual(buildSpan(f), { start: '2026-11-20' });
  assert.deepEqual(buildSpan({ ...f, endDate: '2026-11-22' }), { start: '2026-11-20', end: '2026-11-22' });
  assert.deepEqual(buildSpan({ ...f, endDate: '2026-11-19' }), { start: '2026-11-20' });
  assert.deepEqual(buildSpan({ ...f, time: '09:00', endTime: '10:30' }), { start: '2026-11-20T09:00', end: '2026-11-20T10:30' });
  assert.equal(buildSpan({ ...f, time: '09:00', endTime: '08:00' }), 'The end is before the start.');
  assert.equal(buildSpan({ ...f, date: '' }), 'Pick a date.');
});

test('spanOf is the inverse of buildSpan', () => {
  for (const v of [{ start: '2026-11-20' }, { start: '2026-11-20', end: '2026-11-22' }, { start: '2026-11-20T09:00', end: '2026-11-21T10:30' }]) assert.deepEqual(buildSpan(spanOf(v)), v);
});

test('lanes put overlapping events side by side and reuse columns once free', () => {
  assert.deepEqual(lanes([{ start: 60, end: 120 }, { start: 90, end: 150 }, { start: 200, end: 260 }]), [{ lane: 0, of: 2 }, { lane: 1, of: 2 }, { lane: 0, of: 1 }]);
  assert.deepEqual(lanes([{ start: 0, end: 100 }, { start: 10, end: 20 }, { start: 30, end: 40 }]), [{ lane: 0, of: 2 }, { lane: 1, of: 2 }, { lane: 1, of: 2 }]);
  assert.deepEqual(lanes([]), []);
});

test('viewDays and stepAnchor', () => {
  assert.equal(viewDays('day', '2026-11-04').length, 1);
  assert.deepEqual(viewDays('week', '2026-11-04').slice(0, 2), ['2026-11-01', '2026-11-02']);
  assert.equal(viewDays('month', '2026-11-04').length, 35);
  assert.equal(viewDays('month', '2026-08-04').length, 42);
  assert.equal(stepAnchor('month', '2026-01-31', 1), '2026-02-01');
  assert.equal(stepAnchor('month', '2026-01-15', -1), '2025-12-01');
  assert.equal(stepAnchor('week', '2026-11-04', 1), '2026-11-11');
  assert.equal(stepAnchor('day', '2026-12-31', 1), '2027-01-01');
});
