// Pure date helpers for the Calendar page. Dates are `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when timed,
// and are treated as plain calendar values (UTC arithmetic, no time zones) like the rest of the app.
import type { DateValue } from './types.ts';

const DAY = 86_400_000;
const dayMs = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDay = (day: string, n: number): string => iso(dayMs(day) + n * DAY);
export const daysBetween = (a: string, b: string): number => Math.round((dayMs(b) - dayMs(a)) / DAY);
export const hasTime = (s: string): boolean => s.length > 10;
// Minutes since midnight of a timed value, or null for an all-day one.
export const minutesOf = (s: string): number | null => (hasTime(s) ? Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16)) : null);
export const clock = (mins: number): string => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// Moves a date value so it starts on `day`, keeping its time of day and its length.
export function moveToDay(v: DateValue, day: string): DateValue {
  const by = daysBetween(v.start, day);
  const shift = (s: string) => addDay(s, by) + s.slice(10);
  return v.end ? { start: shift(v.start), end: shift(v.end) } : { start: shift(v.start) };
}

// Moves a timed value to start at `mins` on `day`, keeping its length (one hour when it had none).
export function moveToTime(v: DateValue, day: string, mins: number): DateValue {
  const startMins = minutesOf(v.start);
  const endMins = v.end ? minutesOf(v.end) : null;
  const length = v.end && startMins !== null && endMins !== null ? daysBetween(v.start, v.end) * 1440 + endMins - startMins : 60;
  const end = Math.max(length, 15) + mins;
  const endDay = addDay(day, Math.floor(end / 1440));
  return { start: `${day}T${clock(mins)}`, end: `${endDay}T${clock(end % 1440)}` };
}

// What the edit form holds: a date, an optional time, and an optional end.
export interface SpanInput { date: string; time: string; endDate: string; endTime: string }

export function spanOf(v: DateValue): SpanInput {
  return { date: v.start.slice(0, 10), time: hasTime(v.start) ? v.start.slice(11, 16) : '', endDate: v.end ? v.end.slice(0, 10) : '', endTime: v.end && hasTime(v.end) ? v.end.slice(11, 16) : '' };
}

// Turns form fields into a date value, or says what is wrong.
export function buildSpan(f: SpanInput): DateValue | string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return 'Pick a date.';
  const timed = !!f.time;
  const start = timed ? `${f.date}T${f.time}` : f.date;
  if (!f.endDate && !f.endTime) return { start };
  if (!timed) return f.endDate && f.endDate > f.date ? { start, end: f.endDate } : { start };
  const end = `${f.endDate || f.date}T${f.endTime || f.time}`;
  if (end < start) return 'The end is before the start.';
  return end === start ? { start } : { start, end };
}

// Side-by-side columns for events that overlap in a day, so none hides another.
// Input is [startMins, endMins) pairs; output is each one's column and how many columns its cluster needs.
export function lanes(spans: { start: number; end: number }[]): { lane: number; of: number }[] {
  const order = spans.map((s, i) => ({ ...s, i })).sort((a, b) => a.start - b.start || a.end - b.end);
  const out = new Array<{ lane: number; of: number }>(spans.length);
  let cluster: { i: number; lane: number }[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const close = () => { for (const c of cluster) out[c.i] = { lane: c.lane, of: laneEnds.length }; cluster = []; laneEnds = []; };
  for (const s of order) {
    if (cluster.length && s.start >= clusterEnd) close();
    let lane = laneEnds.findIndex((e) => e <= s.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = s.end;
    cluster.push({ i: s.i, lane });
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  close();
  return out;
}

// The days a view shows around `anchor`: one day, the Sunday-start week, or the month grid (5 or 6 weeks).
export function viewDays(view: 'month' | 'week' | 'day', anchor: string): string[] {
  const weekStart = (d: string) => addDay(d, -new Date(`${d}T00:00:00Z`).getUTCDay());
  if (view === 'day') return [anchor];
  if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDay(weekStart(anchor), i));
  const month = anchor.slice(0, 7);
  const first = weekStart(`${month}-01`);
  const all = Array.from({ length: 42 }, (_, i) => addDay(first, i));
  return all[35].slice(0, 7) === month ? all : all.slice(0, 35);
}

// Steps the anchor by one page of the view (a month keeps to the 1st so short months can't skip).
export function stepAnchor(view: 'month' | 'week' | 'day', anchor: string, dir: 1 | -1): string {
  if (view === 'day') return addDay(anchor, dir);
  if (view === 'week') return addDay(anchor, 7 * dir);
  const [y, m] = anchor.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10);
}
