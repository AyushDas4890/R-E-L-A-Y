// What a database shows: computed values, filters, sorts, groups and footer calculations. Pure, and
// used only in the browser (the server stores rows; it never evaluates formulas or filters).
import { dateOf, display, evaluate, type FV } from './formula.ts';
import type {
  DateValue, DbData, DbDelta, FilterGroup, FilterRule, Property, PropValue, RollupFn, Row, SelectOption, SortRule, View,
} from './types.ts';

export interface Ctx {
  now: number;
  // The database behind a relation, if this person may see it.
  related: (dbId: string) => DbData | undefined;
  userName: (id: string) => string;
  depth?: number;
}

const DAY = 86_400_000;
export const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => isoDay(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) + n * DAY);
// The Sunday that starts the week of `day`.
export const weekStart = (day: string): string => addDays(day, -new Date(`${day}T00:00:00Z`).getUTCDay());
const isDateValue = (v: PropValue | undefined): v is DateValue => !!v && typeof v === 'object' && !Array.isArray(v);

export const titleOf = (db: DbData, row: Row): string => {
  const t = db.props.find((p) => p.type === 'title');
  const v = t ? row.props[t.id] : '';
  return typeof v === 'string' ? v : '';
};

// ---- Values ----

function fromFV(v: FV): PropValue {
  if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((x) => display(x));
  return { start: isoDay(v.d) + (v.d % DAY ? new Date(v.d).toISOString().slice(10, 16) : '') };
}

function toFV(prop: Property, v: PropValue | undefined, db: DbData): FV {
  if (v === undefined || v === null) return null;
  if (prop.type === 'date' && isDateValue(v)) return dateOf(v.start);
  if (prop.type === 'select' || prop.type === 'status') return optionName(prop, v as string);
  if (prop.type === 'multi') return (v as string[]).map((id) => optionName(prop, id));
  if (isDateValue(v)) return dateOf(v.start);
  if (prop.type === 'title' || typeof v !== 'object') return v as FV;
  void db;
  return v as string[];
}

export const optionName = (prop: Property, id: string): string => prop.options?.find((o) => o.id === id)?.name ?? '';
export const optionOf = (prop: Property, id: unknown): SelectOption | undefined => prop.options?.find((o) => o.id === id);

// The value shown for a property in a row, including the computed kinds.
export function cellValue(db: DbData, row: Row, prop: Property, ctx: Ctx): PropValue {
  switch (prop.type) {
    case 'createdTime': return { start: new Date(row.createdAt).toISOString().slice(0, 16) };
    case 'editedTime': return { start: new Date(row.editedAt).toISOString().slice(0, 16) };
    case 'createdBy': return [row.createdBy];
    case 'editedBy': return [row.editedBy];
    case 'id': return `${db.rows.indexOf(row) + 1}`;
    case 'button': return null;
    case 'formula': {
      const depth = ctx.depth ?? 0;
      if (depth > 3) return null;
      const res = evaluate(prop.formula ?? '', {
        now: () => ctx.now,
        prop: (name) => {
          const p = db.props.find((x) => x.name === name);
          if (!p) throw new Error(`Unknown property “${name}”`);
          if (p.id === prop.id) throw new Error('A formula can’t use itself');
          return toFV(p, cellValue(db, row, p, { ...ctx, depth: depth + 1 }), db);
        },
      });
      return res.ok ? fromFV(res.value) : null;
    }
    case 'rollup': return rollupValue(db, row, prop, ctx);
    default: return row.props[prop.id] ?? null;
  }
}

// Text for a formula error, so the cell can say why it is empty.
export function formulaError(db: DbData, row: Row, prop: Property, ctx: Ctx): string | null {
  const res = evaluate(prop.formula ?? '', {
    now: () => ctx.now,
    prop: (name) => {
      const p = db.props.find((x) => x.name === name);
      if (!p) throw new Error(`Unknown property “${name}”`);
      return toFV(p, cellValue(db, row, p, { ...ctx, depth: (ctx.depth ?? 0) + 1 }), db);
    },
  });
  return res.ok ? null : res.error;
}

function rollupValue(db: DbData, row: Row, prop: Property, ctx: Ctx): PropValue {
  const r = prop.rollup;
  if (!r || (ctx.depth ?? 0) > 2) return null;
  const rel = db.props.find((p) => p.id === r.relation);
  if (!rel?.relation) return null;
  const other = ctx.related(rel.relation.dbId);
  const target = other?.props.find((p) => p.id === r.prop);
  if (!other || !target) return null;
  const ids = row.props[rel.id];
  const rows = (Array.isArray(ids) ? ids : []).map((id) => other.rows.find((x) => x.id === id && x.trashedAt === undefined)).filter((x): x is Row => !!x);
  const values = rows.map((x) => cellValue(other, x, target, { ...ctx, depth: (ctx.depth ?? 0) + 1 }));
  return aggregate(r.fn, values, target, ctx);
}

const isEmpty = (v: PropValue | undefined): boolean => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const numbers = (vs: PropValue[]): number[] => vs.filter((v): v is number => typeof v === 'number');
const dayOf = (v: PropValue): string | null => (isDateValue(v) ? v.start.slice(0, 10) : null);

// A footer calculation or a rollup over values.
export function aggregate(fn: RollupFn | string, values: PropValue[], prop: Property, ctx?: Ctx): PropValue {
  const n = values.length;
  const filled = values.filter((v) => !isEmpty(v));
  switch (fn) {
    case 'count': return n;
    case 'countValues':
    case 'countNotEmpty': return filled.length;
    case 'countEmpty': return n - filled.length;
    case 'countUnique': return new Set(filled.map((v) => JSON.stringify(v))).size;
    case 'percentEmpty': return n ? Math.round(((n - filled.length) / n) * 100) : 0;
    case 'percentNotEmpty': return n ? Math.round((filled.length / n) * 100) : 0;
    case 'sum': return numbers(values).reduce((s, x) => s + x, 0);
    case 'avg': {
      const xs = numbers(values);
      return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
    }
    case 'median': {
      const xs = numbers(values).sort((a, b) => a - b);
      if (!xs.length) return null;
      const m = Math.floor(xs.length / 2);
      return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
    }
    case 'min': {
      const xs = numbers(values);
      return xs.length ? Math.min(...xs) : null;
    }
    case 'max': {
      const xs = numbers(values);
      return xs.length ? Math.max(...xs) : null;
    }
    case 'range': {
      const xs = numbers(values);
      return xs.length ? Math.max(...xs) - Math.min(...xs) : null;
    }
    case 'checked': return values.filter((v) => v === true).length;
    case 'unchecked': return values.filter((v) => v !== true).length;
    case 'percentChecked': return n ? Math.round((values.filter((v) => v === true).length / n) * 100) : 0;
    case 'earliest': {
      const ds = values.map(dayOf).filter((d): d is string => !!d).sort();
      return ds.length ? { start: ds[0] } : null;
    }
    case 'latest': {
      const ds = values.map(dayOf).filter((d): d is string => !!d).sort();
      return ds.length ? { start: ds[ds.length - 1] } : null;
    }
    case 'dateRange': {
      const ds = values.map(dayOf).filter((d): d is string => !!d).sort();
      return ds.length ? Math.round((Date.parse(ds[ds.length - 1]) - Date.parse(ds[0])) / DAY) : null;
    }
    case 'showOriginal': {
      const out: string[] = [];
      for (const v of filled) out.push(...asText(prop, v, ctx));
      return out;
    }
    default: return null;
  }
}

// Every value as text: select names, people names, dates, numbers.
export function asText(prop: Property, v: PropValue | undefined, ctx?: Ctx): string[] {
  if (isEmpty(v)) return [];
  switch (prop.type) {
    case 'select':
    case 'status': return [optionName(prop, v as string)];
    case 'multi': return (v as string[]).map((id) => optionName(prop, id));
    case 'person':
    case 'createdBy':
    case 'editedBy': return (v as string[]).map((id) => ctx?.userName(id) ?? id);
    case 'relation': {
      const other = prop.relation && ctx?.related(prop.relation.dbId);
      return (v as string[]).map((id) => {
        const r = other?.rows.find((x) => x.id === id);
        return other && r ? titleOf(other, r) || 'Untitled' : '';
      });
    }
    default:
      if (isDateValue(v)) return [v.end ? `${v.start} → ${v.end}` : v.start];
      if (typeof v === 'boolean') return [v ? 'Yes' : 'No'];
      if (Array.isArray(v)) return v;
      return [String(v)];
  }
}

// ---- Filters ----

function dateTarget(value: PropValue | undefined, today: string): string | null {
  if (value === 'today') return today;
  if (value === 'tomorrow') return addDays(today, 1);
  if (value === 'yesterday') return addDays(today, -1);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return isDateValue(value) ? value.start.slice(0, 10) : null;
}

export function matchRule(rule: FilterRule, prop: Property | undefined, value: PropValue, ctx: Ctx): boolean {
  if (!prop) return true;
  const { op } = rule;
  if (op === 'empty') return isEmpty(value);
  if (op === 'notEmpty') return !isEmpty(value);
  const today = isoDay(ctx.now);
  switch (prop.type) {
    case 'number':
    case 'formula':
    case 'rollup':
      if (typeof value === 'number' || (isEmpty(value) && typeof rule.value === 'number')) {
        const a = typeof value === 'number' ? value : NaN;
        const b = Number(rule.value);
        if (op === 'eq' || op === 'is') return a === b;
        if (op === 'ne' || op === 'isNot') return a !== b;
        if (op === 'gt') return a > b;
        if (op === 'gte') return a >= b;
        if (op === 'lt') return a < b;
        if (op === 'lte') return a <= b;
      }
      break;
    case 'checkbox':
      return op === 'checked' ? value === true : op === 'unchecked' ? value !== true : (value === true) === (rule.value === true);
    case 'select':
    case 'status':
      if (op === 'is') return value === rule.value;
      if (op === 'isNot') return value !== rule.value;
      break;
    case 'multi':
    case 'person':
    case 'relation':
    case 'createdBy':
    case 'editedBy': {
      const list = Array.isArray(value) ? value : [];
      if (op === 'contains' || op === 'is') return typeof rule.value === 'string' && list.includes(rule.value);
      if (op === 'notContains' || op === 'isNot') return !(typeof rule.value === 'string' && list.includes(rule.value));
      break;
    }
    case 'date':
    case 'createdTime':
    case 'editedTime': {
      const day = dayOf(value);
      if (!day) return false;
      const end = isDateValue(value) && value.end ? value.end.slice(0, 10) : day;
      if (op === 'pastWeek') return day <= today && day >= addDays(today, -7);
      if (op === 'pastMonth') return day <= today && day >= addDays(today, -30);
      if (op === 'thisWeek') return day >= weekStart(today) && day <= addDays(weekStart(today), 6);
      if (op === 'nextWeek') return day >= addDays(weekStart(today), 7) && day <= addDays(weekStart(today), 13);
      if (op === 'nextMonth') return day > today && day <= addDays(today, 30);
      const t = dateTarget(rule.value, today);
      if (!t) return false;
      if (op === 'is') return day <= t && end >= t;
      if (op === 'before') return day < t;
      if (op === 'after') return end > t;
      if (op === 'onOrBefore') return day <= t;
      if (op === 'onOrAfter') return end >= t;
      return false;
    }
    default: break;
  }
  // Text-like: compare what the person reads.
  const hay = asText(prop, value, ctx).join(' ').toLowerCase();
  const needle = String(Array.isArray(rule.value) ? rule.value[0] ?? '' : isDateValue(rule.value) ? rule.value.start : rule.value ?? '').toLowerCase();
  switch (op) {
    case 'is':
    case 'eq': return hay === needle;
    case 'isNot':
    case 'ne': return hay !== needle;
    case 'contains': return hay.includes(needle);
    case 'notContains': return !hay.includes(needle);
    case 'startsWith': return hay.startsWith(needle);
    case 'endsWith': return hay.endsWith(needle);
    default: return true;
  }
}

export function matchGroup(g: FilterGroup, db: DbData, row: Row, ctx: Ctx): boolean {
  if (g.items.length === 0) return true;
  const test = (it: FilterRule | FilterGroup): boolean => {
    if ('items' in it) return matchGroup(it, db, row, ctx);
    const prop = db.props.find((p) => p.id === it.prop);
    return matchRule(it, prop, prop ? cellValue(db, row, prop, ctx) : null, ctx);
  };
  return g.op === 'or' ? g.items.some(test) : g.items.every(test);
}

// ---- Sorting and grouping ----

function sortKey(prop: Property, v: PropValue, ctx: Ctx): string | number | null {
  if (isEmpty(v)) return null;
  switch (prop.type) {
    case 'number': return typeof v === 'number' ? v : null;
    case 'checkbox': return v === true ? 1 : 0;
    case 'select':
    case 'status': {
      const i = prop.options?.findIndex((o) => o.id === v) ?? -1;
      return i < 0 ? null : i;
    }
    case 'date':
    case 'createdTime':
    case 'editedTime': return dayOf(v) ?? null;
    case 'formula':
    case 'rollup': return typeof v === 'number' ? v : isDateValue(v) ? v.start : asText(prop, v, ctx).join(' ').toLowerCase();
    default: return asText(prop, v, ctx).join(' ').toLowerCase();
  }
}

export function sortRows(rows: Row[], sorts: SortRule[], db: DbData, ctx: Ctx): Row[] {
  const out = [...rows].sort((a, b) => a.order - b.order);
  if (!sorts.length) return out;
  const rules = sorts.map((s) => ({ prop: db.props.find((p) => p.id === s.prop), dir: s.dir === 'desc' ? -1 : 1 })).filter((s): s is { prop: Property; dir: number } => !!s.prop);
  const keys = new Map<string, (string | number | null)[]>(out.map((r) => [r.id, rules.map((s) => sortKey(s.prop, cellValue(db, r, s.prop, ctx), ctx))]));
  return out.sort((a, b) => {
    const ka = keys.get(a.id)!;
    const kb = keys.get(b.id)!;
    for (let i = 0; i < rules.length; i++) {
      const x = ka[i];
      const y = kb[i];
      if (x === y) continue;
      // Empty values go last whichever way the column is sorted.
      if (x === null) return 1;
      if (y === null) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      if (c !== 0) return c * rules[i].dir;
    }
    return 0;
  });
}

export interface Group { key: string; label: string; color?: string; rows: Row[]; option?: SelectOption }

export function groupRows(rows: Row[], prop: Property | undefined, db: DbData, ctx: Ctx): Group[] {
  if (!prop) return [{ key: '', label: '', rows }];
  const groups = new Map<string, Group>();
  const get = (key: string, label: string, option?: SelectOption): Group => {
    let g = groups.get(key);
    if (!g) {
      g = { key, label, color: option?.color, rows: [], option };
      groups.set(key, g);
    }
    return g;
  };
  // Every option is a column even when empty, so a board has somewhere to drop a card.
  if (prop.type === 'select' || prop.type === 'status' || prop.type === 'multi') for (const o of prop.options ?? []) get(o.id, o.name, o);
  const none = `No ${prop.name.toLowerCase()}`;
  for (const row of rows) {
    const v = cellValue(db, row, prop, ctx);
    if (isEmpty(v)) {
      get('', none).rows.push(row);
    } else if (prop.type === 'select' || prop.type === 'status') {
      get(v as string, optionName(prop, v as string), optionOf(prop, v)).rows.push(row);
    } else if (prop.type === 'multi' || prop.type === 'person' || prop.type === 'relation') {
      for (const id of v as string[]) get(id, asText(prop, [id], ctx)[0] || id, optionOf(prop, id)).rows.push(row);
    } else if (prop.type === 'checkbox') {
      get(v === true ? 'yes' : 'no', v === true ? 'Checked' : 'Unchecked').rows.push(row);
    } else if (isDateValue(v)) {
      const month = v.start.slice(0, 7);
      get(month, month).rows.push(row);
    } else {
      const t = asText(prop, v, ctx).join(' ');
      get(t, t).rows.push(row);
    }
  }
  const list = [...groups.values()];
  // "No value" first for boards (Notion shows it first), the rest in option or alphabetical order.
  const isOptions = prop.type === 'select' || prop.type === 'status' || prop.type === 'multi';
  const head = list.filter((g) => g.key === '');
  const rest = list.filter((g) => g.key !== '');
  if (!isOptions) rest.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return [...head, ...rest].filter((g) => g.key !== '' || g.rows.length > 0 || prop.type !== 'checkbox');
}

// Rows a view shows: not trashed, filtered, sorted.
export function viewRows(db: DbData, view: View, ctx: Ctx, search = ''): Row[] {
  const q = search.trim().toLowerCase();
  const live = db.rows.filter((r) => r.trashedAt === undefined);
  const kept = live.filter((r) => matchGroup(view.filter, db, r, ctx) && (!q || rowText(db, r, ctx).includes(q)));
  return sortRows(kept, view.sorts, db, ctx);
}

export function rowText(db: DbData, row: Row, ctx: Ctx): string {
  return db.props.map((p) => asText(p, cellValue(db, row, p, ctx), ctx).join(' ')).join(' ').toLowerCase();
}

// ---- Display ----

export function formatNumber(n: number, format = 'plain'): string {
  const body = (digits = 2) => n.toLocaleString(undefined, { maximumFractionDigits: digits });
  switch (format) {
    case 'commas': return body();
    case 'percent': return `${body()}%`;
    case 'usd': return `$${body()}`;
    case 'eur': return `€${body()}`;
    case 'gbp': return `£${body()}`;
    case 'inr': return `₹${body()}`;
    default: return String(Math.round(n * 1e9) / 1e9);
  }
}

export function formatDateValue(v: DateValue): string {
  const part = (s: string) => {
    const t = dateOf(s);
    return t && typeof t === 'object' && !Array.isArray(t) ? display(t) : s;
  };
  return v.end ? `${part(v.start)} → ${part(v.end)}` : part(v.start);
}

export const CALC_CHOICES: { id: string; label: string; types?: string[] }[] = [
  { id: '', label: 'None' },
  { id: 'count', label: 'Count all' },
  { id: 'countValues', label: 'Count values' },
  { id: 'countUnique', label: 'Count unique' },
  { id: 'countEmpty', label: 'Count empty' },
  { id: 'percentEmpty', label: 'Percent empty' },
  { id: 'percentNotEmpty', label: 'Percent not empty' },
  { id: 'sum', label: 'Sum', types: ['number'] },
  { id: 'avg', label: 'Average', types: ['number'] },
  { id: 'median', label: 'Median', types: ['number'] },
  { id: 'min', label: 'Min', types: ['number'] },
  { id: 'max', label: 'Max', types: ['number'] },
  { id: 'range', label: 'Range', types: ['number'] },
  { id: 'checked', label: 'Checked', types: ['checkbox'] },
  { id: 'unchecked', label: 'Unchecked', types: ['checkbox'] },
  { id: 'percentChecked', label: 'Percent checked', types: ['checkbox'] },
  { id: 'earliest', label: 'Earliest date', types: ['date', 'createdTime', 'editedTime'] },
  { id: 'latest', label: 'Latest date', types: ['date', 'createdTime', 'editedTime'] },
  { id: 'dateRange', label: 'Date range (days)', types: ['date', 'createdTime', 'editedTime'] },
];

// Which filter operators suit a property, in the order the menu lists them.
export function opsFor(type: Property['type']): { op: FilterRule['op']; label: string; noValue?: boolean }[] {
  const empty = [{ op: 'empty' as const, label: 'Is empty', noValue: true }, { op: 'notEmpty' as const, label: 'Is not empty', noValue: true }];
  switch (type) {
    case 'number':
    case 'formula':
    case 'rollup':
      return [{ op: 'eq', label: '=' }, { op: 'ne', label: '≠' }, { op: 'gt', label: '>' }, { op: 'gte', label: '≥' }, { op: 'lt', label: '<' }, { op: 'lte', label: '≤' }, ...empty];
    case 'checkbox': return [{ op: 'checked', label: 'Is checked', noValue: true }, { op: 'unchecked', label: 'Is not checked', noValue: true }];
    case 'select':
    case 'status': return [{ op: 'is', label: 'Is' }, { op: 'isNot', label: 'Is not' }, ...empty];
    case 'multi':
    case 'person':
    case 'relation':
    case 'createdBy':
    case 'editedBy': return [{ op: 'contains', label: 'Contains' }, { op: 'notContains', label: 'Does not contain' }, ...empty];
    case 'date':
    case 'createdTime':
    case 'editedTime':
      return [
        { op: 'is', label: 'Is' }, { op: 'before', label: 'Is before' }, { op: 'after', label: 'Is after' }, { op: 'onOrBefore', label: 'Is on or before' },
        { op: 'onOrAfter', label: 'Is on or after' }, { op: 'thisWeek', label: 'Is this week', noValue: true }, { op: 'nextWeek', label: 'Is next week', noValue: true },
        { op: 'nextMonth', label: 'Is in the next 30 days', noValue: true }, { op: 'pastWeek', label: 'Is in the past week', noValue: true },
        { op: 'pastMonth', label: 'Is in the past 30 days', noValue: true }, ...empty,
      ];
    default:
      return [{ op: 'contains', label: 'Contains' }, { op: 'notContains', label: 'Does not contain' }, { op: 'is', label: 'Is' }, { op: 'isNot', label: 'Is not' }, { op: 'startsWith', label: 'Starts with' }, { op: 'endsWith', label: 'Ends with' }, ...empty];
  }
}

// ---- CSV ----

const csvCell = (s: string): string => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(db: DbData, rows: Row[], ctx: Ctx): string {
  const head = db.props.map((p) => csvCell(p.name)).join(',');
  const body = rows.map((r) => db.props.map((p) => csvCell(asText(p, cellValue(db, r, p, ctx), ctx).join(', '))).join(','));
  return [head, ...body].join('\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((x) => x !== '') || row.length > 1) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '') || row.length > 1) rows.push(row);
  return rows;
}

// Reads text into a value for a property (used by CSV import and paste). Undefined when it does not fit.
export function parseCell(prop: Property, text: string): PropValue | undefined {
  const t = text.trim();
  if (t === '') return null;
  switch (prop.type) {
    case 'number': {
      const n = Number(t.replace(/[,$€£₹%]/g, ''));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'checkbox': return /^(true|yes|1|checked|x)$/i.test(t);
    case 'select':
    case 'status': return prop.options?.find((o) => o.name.toLowerCase() === t.toLowerCase())?.id;
    case 'multi': {
      const ids = t.split(',').map((s) => prop.options?.find((o) => o.name.toLowerCase() === s.trim().toLowerCase())?.id).filter((x): x is string => !!x);
      return ids.length ? ids : undefined;
    }
    case 'date': {
      const ms = Date.parse(t);
      if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(t)) return { start: t };
      return Number.isNaN(ms) ? undefined : { start: new Date(ms).toISOString().slice(0, 10) };
    }
    case 'text':
    case 'title':
    case 'url':
    case 'email':
    case 'phone':
    case 'place': return t;
    default: return undefined;
  }
}

// ---- Deltas ----

function upsert<T extends { id: string }>(list: T[], items: T[] | undefined, gone: string[] | undefined): T[] {
  let out = list;
  if (gone?.length) out = out.filter((x) => !gone.includes(x.id));
  if (items?.length) {
    out = [...out];
    for (const it of items) {
      const at = out.findIndex((x) => x.id === it.id);
      if (at >= 0) out[at] = it;
      else out.push(it);
    }
  }
  return out;
}

// Merges one delta into a database. Returns a new object; the old one is not touched.
export function applyDelta(db: DbData, d: DbDelta): DbData {
  let props = upsert(db.props, d.props, d.propsRemoved);
  if (d.propOrder) {
    const by = new Map(props.map((p) => [p.id, p]));
    const ordered = d.propOrder.map((id) => by.get(id)).filter((p): p is DbData['props'][number] => !!p);
    props = [...ordered, ...props.filter((p) => !d.propOrder!.includes(p.id))];
  }
  // A removed automation arrives with the whole list, so take the list as it is.
  const automations = d.automationsRemoved
    ? (d.automations ?? db.automations).filter((a) => !d.automationsRemoved!.includes(a.id))
    : upsert(db.automations, d.automations, undefined);
  return {
    props,
    views: upsert(db.views, d.views, d.viewsRemoved),
    rows: upsert(db.rows, d.rows, d.rowsRemoved),
    templates: upsert(db.templates, d.templates, d.templatesRemoved),
    automations,
    form: d.form ?? db.form,
    locked: d.locked ?? db.locked,
  };
}

