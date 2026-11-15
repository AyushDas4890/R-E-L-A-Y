import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DbData, Property, Row } from './types.ts';
import { addDays, aggregate, applyDelta, cellValue, groupRows, matchGroup, parseCell, parseCsv, toCsv, viewRows, weekStart, type Ctx } from './dbquery.ts';

const NOW = Date.UTC(2026, 10, 3, 12);
const ctx = (extra: Partial<Ctx> = {}): Ctx => ({ now: NOW, related: () => undefined, userName: (id) => id.toUpperCase(), ...extra });
const props: Property[] = [
  { id: 'n', name: 'Name', type: 'title' },
  { id: 's', name: 'Status', type: 'status', options: [{ id: 'o1', name: 'Todo', color: 'gray', group: 'todo' }, { id: 'o2', name: 'Done', color: 'green', group: 'done' }] },
  { id: 'q', name: 'Qty', type: 'number' },
  { id: 'd', name: 'Due', type: 'date' },
  { id: 'f', name: 'Total', type: 'formula', formula: 'prop("Qty") * 2' },
  { id: 'c', name: 'Ok', type: 'checkbox' },
];
const row = (id: string, order: number, p: Row['props']): Row => ({ id, props: p, createdBy: 'u', createdAt: 0, editedBy: 'u', editedAt: 0, order });
const db = (): DbData => ({
  props,
  views: [],
  rows: [
    row('a', 1, { n: 'Alpha', s: 'o1', q: 3, d: { start: '2026-11-02' } }),
    row('b', 2, { n: 'Beta', s: 'o2', q: 10, d: { start: '2026-11-05' }, c: true }),
    row('c', 3, { n: 'Gamma', q: 1 }),
  ],
  templates: [],
  automations: [],
  form: { enabled: false, title: '', description: '', fields: [], required: [], submitLabel: 'Submit' },
  locked: false,
});
const view = (extra: object = {}) => ({ id: 'v', name: 'V', layout: 'table' as const, visible: [], filter: { op: 'and' as const, items: [] }, sorts: [], calc: {}, colors: [], ...extra });

test('a formula property is computed from the row', () => {
  const d = db();
  assert.equal(cellValue(d, d.rows[1], props[4], ctx()), 20);
});

test('filters by type: select, number, date relative to today, checkbox, text', () => {
  const d = db();
  const ids = (f: object) => viewRows(d, view({ filter: f }), ctx()).map((r) => r.id);
  assert.deepEqual(ids({ op: 'and', items: [{ prop: 's', op: 'is', value: 'o2' }] }), ['b']);
  assert.deepEqual(ids({ op: 'and', items: [{ prop: 'q', op: 'gt', value: 2 }] }), ['a', 'b']);
  assert.deepEqual(ids({ op: 'and', items: [{ prop: 'd', op: 'before', value: 'today' }] }), ['a']);
  assert.deepEqual(ids({ op: 'and', items: [{ prop: 'd', op: 'after', value: 'today' }] }), ['b']);
  assert.deepEqual(ids({ op: 'and', items: [{ prop: 'c', op: 'checked' }] }), ['b']);
  assert.deepEqual(ids({ op: 'and', items: [{ prop: 'n', op: 'startsWith', value: 'ga' }] }), ['c']);
  assert.deepEqual(ids({ op: 'and', items: [{ prop: 's', op: 'empty' }] }), ['c']);
  assert.deepEqual(ids({ op: 'or', items: [{ prop: 'n', op: 'contains', value: 'alp' }, { prop: 'q', op: 'eq', value: 1 }] }), ['a', 'c']);
});

test('nested groups apply and/or', () => {
  const d = db();
  const f = { op: 'and' as const, items: [{ prop: 'q', op: 'gt' as const, value: 0 }, { op: 'or' as const, items: [{ prop: 's', op: 'is' as const, value: 'o1' }, { prop: 'c', op: 'checked' as const }] }] };
  assert.deepEqual(d.rows.filter((r) => matchGroup(f, d, r, ctx())).map((r) => r.id), ['a', 'b']);
});

test('sorting puts empty values last in either direction and breaks ties by the next rule', () => {
  const d = db();
  assert.deepEqual(viewRows(d, view({ sorts: [{ prop: 'd', dir: 'asc' }] }), ctx()).map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(viewRows(d, view({ sorts: [{ prop: 'd', dir: 'desc' }] }), ctx()).map((r) => r.id), ['b', 'a', 'c']);
  assert.deepEqual(viewRows(d, view({ sorts: [{ prop: 'q', dir: 'desc' }] }), ctx()).map((r) => r.id), ['b', 'a', 'c']);
});

test('search narrows rows by any visible text; trashed rows never show', () => {
  const d = db();
  d.rows[2].trashedAt = 1;
  assert.deepEqual(viewRows(d, view(), ctx()).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(viewRows(d, view(), ctx(), 'beta').map((r) => r.id), ['b']);
});

test('grouping by status makes a column for every option, and one for no value', () => {
  const d = db();
  const g = groupRows(viewRows(d, view(), ctx()), props[1], d, ctx());
  assert.deepEqual(g.map((x) => [x.label, x.rows.length]), [['No status', 1], ['Todo', 1], ['Done', 1]]);
});

test('aggregate: counts, numbers, dates, checks', () => {
  assert.equal(aggregate('sum', [1, 2, 3], props[2]), 6);
  assert.equal(aggregate('avg', [1, 2, null, 6], props[2]), 3);
  assert.equal(aggregate('countEmpty', [1, null, ''], props[2]), 2);
  assert.equal(aggregate('percentChecked', [true, false, true, true], props[5]), 75);
  assert.deepEqual(aggregate('earliest', [{ start: '2026-02-01' }, { start: '2026-01-05' }], props[3]), { start: '2026-01-05' });
  assert.equal(aggregate('median', [5, 1, 3, 9], props[2]), 4);
});

test('a rollup reads the related database and respects what the viewer can see', () => {
  const other: DbData = { ...db(), rows: db().rows };
  const mine: DbData = {
    ...db(),
    props: [
      { id: 'n', name: 'Name', type: 'title' },
      { id: 'rel', name: 'Items', type: 'relation', relation: { dbId: 'other' } },
      { id: 'sum', name: 'Sum', type: 'rollup', rollup: { relation: 'rel', prop: 'q', fn: 'sum' } },
    ],
    rows: [row('m', 1, { n: 'Mine', rel: ['a', 'b', 'gone'] })],
  };
  const sees = ctx({ related: (id) => (id === 'other' ? other : undefined) });
  assert.equal(cellValue(mine, mine.rows[0], mine.props[2], sees), 13);
  assert.equal(cellValue(mine, mine.rows[0], mine.props[2], ctx()), null);
});

test('dates: week start is Sunday and addDays crosses months', () => {
  assert.equal(weekStart('2026-11-03'), '2026-11-01');
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
});

test('csv round trip keeps commas, quotes and newlines', () => {
  const d = db();
  d.rows[0].props.n = 'He said "hi", then\nleft';
  const csv = toCsv(d, d.rows, ctx());
  const parsed = parseCsv(csv);
  assert.equal(parsed[0][0], 'Name');
  assert.equal(parsed[1][0], 'He said "hi", then\nleft');
  assert.equal(parsed.length, 4);
});

test('parseCell reads text into a value for the property', () => {
  assert.equal(parseCell(props[2], '$1,200'), 1200);
  assert.equal(parseCell(props[1], 'done'), 'o2');
  assert.equal(parseCell(props[1], 'nonsense'), undefined);
  assert.deepEqual(parseCell(props[3], '2026-12-25'), { start: '2026-12-25' });
  assert.equal(parseCell(props[5], 'Yes'), true);
  assert.equal(parseCell(props[0], '  '), null);
});

test('a delta merges whole changed items into a copy and leaves the old one alone', () => {
  const d = db();
  const next = applyDelta(d, {
    rows: [{ ...d.rows[0], props: { ...d.rows[0].props, n: 'Alpha 2' } }, row('z', 9, { n: 'New' })],
    rowsRemoved: ['b'],
    props: [{ id: 'q', name: 'Quantity', type: 'number' }],
    propOrder: ['q', 'n', 's', 'd', 'f', 'c'],
  });
  assert.deepEqual(next.rows.map((r) => r.id), ['a', 'c', 'z']);
  assert.equal(next.rows[0].props.n, 'Alpha 2');
  assert.equal(next.props[0].name, 'Quantity');
  assert.equal(d.rows[0].props.n, 'Alpha');
  const removed = applyDelta({ ...d, automations: [{ id: 'a1', name: 'x', on: true, trigger: { kind: 'rowAdded' }, actions: [] }] }, { automations: [], automationsRemoved: ['a1'] });
  assert.equal(removed.automations.length, 0);
});
