// Pure logic for databases: the schema, views, rows and automations. No I/O, so it is tested without
// sockets. A database is a page whose body holds a `DbData`; rows are kept inside it, not in the tree.
import type {
  Action, Automation, DbData, DbDelta, FilterGroup, FilterOp, FilterRule, FormConfig, Property, PropType, PropValue,
  RollupFn, Row, RowTemplate, SchemaOp, SelectOption, View, ViewLayout, ViewOp,
} from '../src/types.ts';
import { cleanRich } from './pages.ts';

export const MAX_PROPS = 500;
export const MAX_ROWS = 5000;
export const MAX_VIEWS = 50;
export const MAX_OPTIONS = 100;
export const MAX_AUTOMATIONS = 20;
export const MAX_TEMPLATES = 20;
export const MAX_FILTERS = 50;

export const PROP_TYPES: readonly PropType[] = [
  'title', 'text', 'number', 'select', 'status', 'multi', 'date', 'person', 'file', 'checkbox', 'url', 'email', 'phone',
  'formula', 'relation', 'rollup', 'createdTime', 'createdBy', 'editedTime', 'editedBy', 'button', 'id', 'place',
];
export const LAYOUTS: readonly ViewLayout[] = ['table', 'board', 'list', 'gallery', 'calendar', 'timeline', 'chart', 'feed'];
const COMPUTED = new Set<PropType>(['formula', 'rollup', 'createdTime', 'createdBy', 'editedTime', 'editedBy', 'button', 'id']);
const COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const COLOR = /^[a-z_]{1,24}$/;
const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const FILTER_OPS = new Set<string>([
  'is', 'isNot', 'contains', 'notContains', 'startsWith', 'endsWith', 'empty', 'notEmpty', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
  'before', 'after', 'onOrBefore', 'onOrAfter', 'checked', 'unchecked', 'pastWeek', 'pastMonth', 'thisWeek', 'nextWeek', 'nextMonth',
]);
const ROLLUPS = new Set<string>([
  'count', 'countValues', 'countUnique', 'countEmpty', 'countNotEmpty', 'percentEmpty', 'percentNotEmpty', 'sum', 'avg', 'min', 'max',
  'median', 'range', 'showOriginal', 'checked', 'unchecked', 'percentChecked', 'earliest', 'latest', 'dateRange',
]);

export type NewId = () => string;

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// ---- Starting points ----

export function defaultFilter(): FilterGroup {
  return { op: 'and', items: [] };
}

export function newView(layout: ViewLayout, props: Property[], id: string, name?: string): View {
  const label: Record<ViewLayout, string> = {
    table: 'Table', board: 'Board', list: 'List', gallery: 'Gallery', calendar: 'Calendar', timeline: 'Timeline', chart: 'Chart', feed: 'Feed',
  };
  const view: View = {
    id,
    name: name ?? `${label[layout]} view`,
    layout,
    visible: props.filter((p) => p.type !== 'title').map((p) => p.id),
    filter: defaultFilter(),
    sorts: [],
    calc: {},
    colors: [],
  };
  const pick = (type: PropType) => props.find((p) => p.type === type)?.id;
  if (layout === 'board') view.group = pick('status') ?? pick('select');
  if (layout === 'calendar' || layout === 'timeline') view.dateProp = pick('date');
  if (layout === 'chart') view.chart = { kind: 'bar', x: pick('status') ?? pick('select') ?? props[0]?.id ?? '', fn: 'count' };
  return view;
}

const opt = (id: string, name: string, color: string, group?: SelectOption['group']): SelectOption => ({ id, name, color, ...(group ? { group } : {}) });

export function statusOptions(newId: NewId): SelectOption[] {
  return [opt(newId(), 'Not started', 'gray', 'todo'), opt(newId(), 'In progress', 'blue', 'progress'), opt(newId(), 'Done', 'green', 'done')];
}

// An empty database: a Name column and a table view.
export function emptyDb(newId: NewId, layout: ViewLayout = 'table'): DbData {
  const props: Property[] = [{ id: newId(), name: 'Name', type: 'title' }];
  return {
    props,
    views: [newView(layout, props, newId())],
    rows: [],
    templates: [],
    automations: [],
    form: { enabled: false, title: '', description: '', fields: [], required: [], submitLabel: 'Submit' },
    locked: false,
  };
}

// Ready-made schemas, picked in the "New database" menu.
export function presetDb(preset: string, newId: NewId, layout?: ViewLayout): DbData {
  const db = emptyDb(newId);
  const add = (p: Omit<Property, 'id'>) => {
    const prop = { id: newId(), ...p };
    db.props.push(prop);
    return prop;
  };
  if (preset === 'tasks') {
    const status = add({ name: 'Status', type: 'status', options: statusOptions(newId) });
    add({ name: 'Assignee', type: 'person' });
    add({ name: 'Due', type: 'date' });
    add({ name: 'Priority', type: 'select', options: [opt(newId(), 'High', 'red'), opt(newId(), 'Medium', 'yellow'), opt(newId(), 'Low', 'gray')] });
    db.views = [newView('table', db.props, newId(), 'All tasks'), newView('board', db.props, newId(), 'By status'), newView('calendar', db.props, newId(), 'Calendar')];
    db.views[1].group = status.id;
  } else if (preset === 'projects') {
    add({ name: 'Status', type: 'status', options: statusOptions(newId) });
    add({ name: 'Owner', type: 'person' });
    add({ name: 'Timeline', type: 'date' });
    add({ name: 'Summary', type: 'text' });
    db.views = [newView('table', db.props, newId(), 'All projects'), newView('timeline', db.props, newId(), 'Timeline'), newView('board', db.props, newId(), 'Board')];
  } else if (preset === 'notes') {
    add({ name: 'Tags', type: 'multi', options: [opt(newId(), 'Idea', 'purple'), opt(newId(), 'Meeting', 'blue'), opt(newId(), 'Reference', 'green')] });
    add({ name: 'Created', type: 'createdTime' });
    db.views = [newView('gallery', db.props, newId(), 'Gallery'), newView('table', db.props, newId(), 'All notes')];
  } else if (preset === 'reading') {
    add({ name: 'Status', type: 'status', options: [opt(newId(), 'To read', 'gray', 'todo'), opt(newId(), 'Reading', 'blue', 'progress'), opt(newId(), 'Finished', 'green', 'done')] });
    add({ name: 'Author', type: 'text' });
    add({ name: 'Link', type: 'url' });
    add({ name: 'Rating', type: 'number', format: 'plain' });
    db.views = [newView('table', db.props, newId(), 'All'), newView('board', db.props, newId(), 'By status')];
  } else if (preset === 'people') {
    add({ name: 'Role', type: 'text' });
    add({ name: 'Email', type: 'email' });
    add({ name: 'Phone', type: 'phone' });
    db.views = [newView('table', db.props, newId(), 'Everyone'), newView('gallery', db.props, newId(), 'Cards')];
  }
  if (layout) db.views[0] = newView(layout, db.props, db.views[0].id, db.views[0].name);
  // Views made before the last property existed still show it.
  for (const v of db.views) v.visible = db.props.filter((p) => p.type !== 'title').map((p) => p.id);
  return db;
}

// ---- Values ----

const validDate = (s: string): boolean => DATE.test(s) && !Number.isNaN(Date.parse(s.slice(0, 10)));

// A value cleaned for a property, or `undefined` when it does not fit. `null` always clears.
export function coerce(prop: Property, v: unknown): PropValue | undefined {
  if (v === null) return null;
  switch (prop.type) {
    case 'title': return typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').slice(0, 200) : undefined;
    case 'text':
    case 'place':
    case 'phone': return typeof v === 'string' ? v.slice(0, 2000) : undefined;
    case 'email': return typeof v === 'string' ? v.slice(0, 320) : undefined;
    case 'url': return typeof v === 'string' ? v.slice(0, 2000) : undefined;
    case 'number': {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
    }
    case 'checkbox': return typeof v === 'boolean' ? v : undefined;
    case 'select':
    case 'status': return typeof v === 'string' && prop.options?.some((o) => o.id === v) ? v : undefined;
    case 'multi': {
      if (!Array.isArray(v) || v.length > 50 || v.some((x) => typeof x !== 'string')) return undefined;
      const ids = [...new Set(v as string[])];
      return ids.every((id) => prop.options?.some((o) => o.id === id)) ? ids : undefined;
    }
    case 'date': {
      if (!isObj(v) || typeof v.start !== 'string' || !validDate(v.start)) return undefined;
      if (v.end === undefined) return { start: v.start };
      return typeof v.end === 'string' && validDate(v.end) ? { start: v.start, end: v.end } : undefined;
    }
    case 'person':
    case 'relation': {
      if (!Array.isArray(v) || v.length > (prop.type === 'person' ? 50 : 200)) return undefined;
      if (v.some((x) => typeof x !== 'string' || x.length === 0 || x.length > 80)) return undefined;
      return [...new Set(v as string[])];
    }
    case 'file': {
      if (!Array.isArray(v) || v.length > 20) return undefined;
      return v.every((x) => typeof x === 'string' && x.length <= 2000 && /^https?:\/\//i.test(x)) ? (v as string[]) : undefined;
    }
    default: return undefined;
  }
}

export const isComputed = (type: PropType): boolean => COMPUTED.has(type);

// What a value becomes when its property changes type: text-like values carry over, the rest are dropped.
export function convertValue(from: Property, to: Property, v: PropValue | undefined): PropValue | undefined {
  if (v === undefined || v === null) return undefined;
  const text = (): string | undefined => {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) {
      const names = v.map((id) => from.options?.find((o) => o.id === id)?.name ?? id);
      return names.join(', ');
    }
    if (typeof v === 'object') return v.start;
    return undefined;
  };
  const label = from.type === 'select' || from.type === 'status' ? from.options?.find((o) => o.id === v)?.name : undefined;
  const asText = label ?? text();
  switch (to.type) {
    case 'title':
    case 'text':
    case 'place':
    case 'phone':
    case 'email':
    case 'url': return asText === undefined ? undefined : coerce(to, asText);
    case 'number': return typeof v === 'number' ? v : typeof asText === 'string' && asText.trim() !== '' && Number.isFinite(Number(asText)) ? Number(asText) : undefined;
    case 'checkbox': return typeof v === 'boolean' ? v : undefined;
    case 'select':
    case 'status': {
      const names = from.type === 'multi' ? (v as string[]).map((id) => from.options?.find((o) => o.id === id)?.name ?? '') : [asText ?? ''];
      const hit = to.options?.find((o) => o.name.toLowerCase() === (names[0] ?? '').toLowerCase());
      return hit?.id;
    }
    case 'multi': {
      const names = from.type === 'multi' ? (v as string[]).map((id) => from.options?.find((o) => o.id === id)?.name ?? '') : (asText ?? '').split(',').map((s) => s.trim());
      const ids = names.map((n) => to.options?.find((o) => o.name.toLowerCase() === n.toLowerCase())?.id).filter((x): x is string => !!x);
      return ids.length ? ids : undefined;
    }
    case 'date': return typeof asText === 'string' && validDate(asText) ? { start: asText } : typeof v === 'object' && !Array.isArray(v) ? v : undefined;
    case 'person':
    case 'relation': return from.type === to.type ? v : undefined;
    default: return undefined;
  }
}

// ---- Cleaning input ----

export function cleanOptions(raw: unknown, newId: NewId, status = false): SelectOption[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_OPTIONS) return null;
  const out: SelectOption[] = [];
  const seen = new Set<string>();
  for (const o of raw) {
    if (!isObj(o)) return null;
    const name = str(o.name, 100).trim();
    if (!name) continue;
    let id = typeof o.id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(o.id) ? o.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const color = typeof o.color === 'string' && COLOR.test(o.color) ? o.color : COLORS[out.length % COLORS.length];
    const group = o.group === 'todo' || o.group === 'progress' || o.group === 'done' ? o.group : undefined;
    out.push(opt(id, name, color, status ? (group ?? 'todo') : undefined));
  }
  return out;
}

function cleanAction(raw: unknown, props: Property[]): Action | null {
  if (!isObj(raw)) return null;
  if (raw.kind === 'setProp') {
    const prop = props.find((p) => p.id === raw.prop);
    if (!prop || isComputed(prop.type)) return null;
    const value = coerce(prop, raw.value);
    return value === undefined ? null : { kind: 'setProp', prop: prop.id, value };
  }
  if (raw.kind === 'notify') {
    const user = str(raw.user, 80);
    return user ? { kind: 'notify', user, text: str(raw.text, 500) } : null;
  }
  return null;
}
export const cleanActions = (raw: unknown, props: Property[]): Action[] =>
  (Array.isArray(raw) ? raw.slice(0, 10) : []).map((a) => cleanAction(a, props)).filter((a): a is Action => !!a);

function cleanFormula(v: unknown): string {
  return typeof v === 'string' ? v.slice(0, 2000) : '';
}

// Builds a property from client input. `existing` keeps the id and anything the client may not change.
function buildProp(raw: Record<string, unknown>, newId: NewId, existing?: Property): Property | null {
  const type = typeof raw.type === 'string' && (PROP_TYPES as readonly string[]).includes(raw.type) ? (raw.type as PropType) : existing?.type;
  if (!type) return null;
  const name = raw.name === undefined && existing ? existing.name : str(raw.name, 100).trim();
  if (!name) return null;
  const prop: Property = { id: existing?.id ?? newId(), name, type };
  if (type === 'select' || type === 'multi' || type === 'status') {
    const options = raw.options !== undefined ? cleanOptions(raw.options, newId, type === 'status') : existing?.options;
    if (!options) return null;
    prop.options = options.length || type !== 'status' ? options : statusOptions(newId);
  }
  if (type === 'number') prop.format = typeof raw.format === 'string' && /^[a-z]{1,10}$/.test(raw.format) ? raw.format : existing?.format ?? 'plain';
  if (type === 'formula') prop.formula = raw.formula !== undefined ? cleanFormula(raw.formula) : existing?.formula ?? '';
  if (type === 'relation') {
    const r = isObj(raw.relation) ? raw.relation : existing?.relation;
    if (!r || typeof r.dbId !== 'string' || r.dbId.length > 64) return null;
    prop.relation = { dbId: r.dbId, ...(typeof r.twoWay === 'string' ? { twoWay: r.twoWay } : {}) };
  }
  if (type === 'rollup') {
    const r = isObj(raw.rollup) ? raw.rollup : existing?.rollup;
    if (!r || typeof r.relation !== 'string' || typeof r.prop !== 'string' || typeof r.fn !== 'string' || !ROLLUPS.has(r.fn)) return null;
    prop.rollup = { relation: r.relation, prop: r.prop, fn: r.fn as RollupFn };
  }
  return prop;
}

export function cleanFilter(raw: unknown, props: Property[], depth = 0, budget = { left: MAX_FILTERS }): FilterGroup {
  const out = defaultFilter();
  if (!isObj(raw)) return out;
  if (raw.op === 'or') out.op = 'or';
  if (!Array.isArray(raw.items)) return out;
  for (const it of raw.items) {
    if (budget.left <= 0 || !isObj(it)) break;
    if ('items' in it) {
      if (depth < 2) out.items.push(cleanFilter(it, props, depth + 1, budget));
      continue;
    }
    const prop = props.find((p) => p.id === it.prop);
    if (!prop || typeof it.op !== 'string' || !FILTER_OPS.has(it.op)) continue;
    budget.left -= 1;
    const rule: FilterRule = { prop: prop.id, op: it.op as FilterOp };
    if (it.value !== undefined) {
      const v = it.value;
      if (typeof v === 'string') rule.value = v.slice(0, 500);
      else if (typeof v === 'number' && Number.isFinite(v)) rule.value = v;
      else if (typeof v === 'boolean') rule.value = v;
      else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) rule.value = (v as string[]).slice(0, 50);
      else if (isObj(v) && typeof v.start === 'string') rule.value = { start: v.start.slice(0, 16) };
    }
    out.items.push(rule);
  }
  return out;
}

const hasProp = (props: Property[], id: unknown): id is string => typeof id === 'string' && props.some((p) => p.id === id);

// Applies a patch to a view, keeping only valid fields.
export function patchView(view: View, raw: unknown, props: Property[]): View {
  if (!isObj(raw)) return view;
  const v: View = { ...view };
  if (typeof raw.name === 'string' && raw.name.trim()) v.name = raw.name.trim().slice(0, 60);
  if (typeof raw.layout === 'string' && (LAYOUTS as readonly string[]).includes(raw.layout)) v.layout = raw.layout as ViewLayout;
  if (Array.isArray(raw.visible)) v.visible = [...new Set(raw.visible.filter((id): id is string => hasProp(props, id)))];
  if ('filter' in raw) v.filter = cleanFilter(raw.filter, props);
  if (Array.isArray(raw.sorts)) {
    v.sorts = raw.sorts
      .filter((s): s is Record<string, unknown> => isObj(s) && hasProp(props, s.prop))
      .slice(0, 5)
      .map((s) => ({ prop: s.prop as string, dir: s.dir === 'desc' ? 'desc' as const : 'asc' as const }));
  }
  if ('group' in raw) {
    if (raw.group === null || raw.group === '') delete v.group;
    else if (hasProp(props, raw.group)) v.group = raw.group;
  }
  if ('dateProp' in raw) {
    if (raw.dateProp === null) delete v.dateProp;
    else if (hasProp(props, raw.dateProp)) v.dateProp = raw.dateProp;
  }
  if ('endProp' in raw) {
    if (raw.endProp === null) delete v.endProp;
    else if (hasProp(props, raw.endProp)) v.endProp = raw.endProp;
  }
  if (isObj(raw.calc)) {
    v.calc = {};
    for (const [k, fn] of Object.entries(raw.calc)) if (hasProp(props, k) && typeof fn === 'string' && /^[A-Za-z]{1,24}$/.test(fn)) v.calc[k] = fn;
  }
  if (typeof raw.wrap === 'boolean') v.wrap = raw.wrap;
  if (raw.cardSize === 'small' || raw.cardSize === 'medium' || raw.cardSize === 'large') v.cardSize = raw.cardSize;
  if (typeof raw.cardCover === 'string' && /^(none|page|prop:[A-Za-z0-9-]{1,64})$/.test(raw.cardCover)) v.cardCover = raw.cardCover;
  if (Array.isArray(raw.colors)) {
    v.colors = raw.colors
      .filter((c): c is Record<string, unknown> => isObj(c) && hasProp(props, c.prop) && typeof c.op === 'string' && FILTER_OPS.has(c.op) && typeof c.color === 'string' && COLOR.test(c.color))
      .slice(0, 10)
      .map((c) => ({ prop: c.prop as string, op: c.op as FilterOp, ...(c.value !== undefined && (typeof c.value === 'string' || typeof c.value === 'number') ? { value: c.value } : {}), color: c.color as string }));
  }
  if (isObj(raw.chart)) {
    const c = raw.chart;
    const kind = c.kind === 'line' || c.kind === 'donut' ? c.kind : 'bar';
    const fn = c.fn === 'sum' || c.fn === 'avg' ? c.fn : 'count';
    v.chart = { kind, fn, x: hasProp(props, c.x) ? c.x : v.chart?.x ?? '', ...(hasProp(props, c.y) ? { y: c.y } : {}) };
  }
  return v;
}

// ---- Schema ----

export interface SchemaResult { delta: DbDelta; rejected: number; error?: string }

// Applies property edits. Mutates `db`. Removing a property also clears it from rows, views and automations.
export function applySchemaOps(db: DbData, ops: SchemaOp[], newId: NewId, maxProps = MAX_PROPS): SchemaResult {
  const delta: DbDelta = {};
  const touched = new Map<string, Property>();
  const touchedRows = new Map<string, Row>();
  const touchedViews = new Map<string, View>();
  let rejected = 0;
  let error: string | undefined;
  let orderChanged = false;
  for (const raw of ops) {
    const op = raw as unknown as Record<string, unknown>;
    if (!isObj(op)) {
      rejected += 1;
      continue;
    }
    if (op.op === 'addProp' && isObj(op.prop)) {
      if (db.props.length >= maxProps) {
        error = `A database can have up to ${maxProps} properties.`;
        rejected += 1;
        continue;
      }
      const prop = buildProp(op.prop, newId);
      if (!prop || (prop.type === 'title' && db.props.some((p) => p.type === 'title'))) {
        rejected += 1;
        continue;
      }
      db.props.push(prop);
      touched.set(prop.id, prop);
      // Every view shows the new property.
      for (const v of db.views) {
        v.visible = [...v.visible, prop.id];
        touchedViews.set(v.id, v);
      }
    } else if (op.op === 'patchProp' && typeof op.id === 'string' && isObj(op.patch)) {
      const prop = db.props.find((p) => p.id === op.id);
      if (!prop) {
        rejected += 1;
        continue;
      }
      const merged = buildProp({ ...op.patch, type: op.patch.type ?? prop.type }, newId, prop);
      // The title column keeps its type; a name is always required.
      if (!merged || (prop.type === 'title' && merged.type !== 'title') || (merged.type === 'title' && prop.type !== 'title')) {
        rejected += 1;
        continue;
      }
      if (merged.type !== prop.type) {
        for (const row of db.rows) {
          const had = row.props[prop.id];
          if (had === undefined) continue;
          const next = convertValue(prop, merged, had);
          if (next === undefined) delete row.props[prop.id];
          else row.props[prop.id] = next;
          touchedRows.set(row.id, row);
        }
      } else if (merged.options && prop.options) {
        // Options that went away are cleared from the rows that used them.
        const keep = new Set(merged.options.map((o) => o.id));
        const gone = prop.options.filter((o) => !keep.has(o.id)).map((o) => o.id);
        if (gone.length) {
          for (const row of db.rows) {
            const had = row.props[prop.id];
            if (typeof had === 'string' && gone.includes(had)) delete row.props[prop.id];
            else if (Array.isArray(had) && (had as string[]).some((x) => gone.includes(x))) row.props[prop.id] = (had as string[]).filter((x) => !gone.includes(x));
            else continue;
            touchedRows.set(row.id, row);
          }
        }
      }
      Object.assign(prop, merged);
      touched.set(prop.id, prop);
    } else if (op.op === 'removeProp' && typeof op.id === 'string') {
      const at = db.props.findIndex((p) => p.id === op.id);
      if (at < 0 || db.props[at].type === 'title') {
        rejected += 1;
        continue;
      }
      const id = db.props[at].id;
      db.props.splice(at, 1);
      touched.delete(id);
      (delta.propsRemoved ??= []).push(id);
      for (const row of db.rows) {
        if (id in row.props) {
          delete row.props[id];
          touchedRows.set(row.id, row);
        }
      }
      for (const v of db.views) {
        const before = JSON.stringify(v);
        v.visible = v.visible.filter((x) => x !== id);
        v.sorts = v.sorts.filter((s) => s.prop !== id);
        v.filter = cleanFilter(v.filter, db.props);
        v.colors = v.colors.filter((c) => c.prop !== id);
        delete v.calc[id];
        if (v.group === id) delete v.group;
        if (v.dateProp === id) delete v.dateProp;
        if (v.endProp === id) delete v.endProp;
        if (v.chart?.x === id) v.chart.x = db.props[0]?.id ?? '';
        if (v.chart?.y === id) delete v.chart.y;
        if (JSON.stringify(v) !== before) touchedViews.set(v.id, v);
      }
      // Properties built on the removed one stop working; drop them with it so no stale reference remains.
      db.automations = db.automations.filter((a) => !(a.trigger.kind === 'propChanged' && a.trigger.prop === id));
    } else if (op.op === 'moveProp' && typeof op.id === 'string') {
      const at = db.props.findIndex((p) => p.id === op.id);
      if (at < 0) {
        rejected += 1;
        continue;
      }
      const [prop] = db.props.splice(at, 1);
      const after = typeof op.after === 'string' ? db.props.findIndex((p) => p.id === op.after) : -1;
      db.props.splice(after + 1, 0, prop);
      // Keep the title first.
      const title = db.props.findIndex((p) => p.type === 'title');
      if (title > 0) db.props.unshift(...db.props.splice(title, 1));
      orderChanged = true;
    } else {
      rejected += 1;
    }
  }
  if (touched.size) delta.props = [...touched.values()];
  if (touchedRows.size) delta.rows = [...touchedRows.values()];
  if (touchedViews.size) delta.views = [...touchedViews.values()];
  if (orderChanged || delta.propsRemoved) delta.propOrder = db.props.map((p) => p.id);
  if (delta.propsRemoved) delta.automations = db.automations;
  return { delta, rejected, error };
}

// ---- Views ----

export function applyViewOp(db: DbData, raw: ViewOp, newId: NewId): { delta: DbDelta; error?: string } {
  const op = raw as unknown as Record<string, unknown>;
  if (!isObj(op)) return { delta: {}, error: 'Bad view change.' };
  if (op.op === 'add' && isObj(op.view)) {
    if (db.views.length >= MAX_VIEWS) return { delta: {}, error: `A database can have up to ${MAX_VIEWS} views.` };
    const layout = typeof op.view.layout === 'string' && (LAYOUTS as readonly string[]).includes(op.view.layout) ? (op.view.layout as ViewLayout) : 'table';
    const view = patchView(newView(layout, db.props, newId(), typeof op.view.name === 'string' && op.view.name.trim() ? op.view.name.trim().slice(0, 60) : undefined), op.view, db.props);
    db.views.push(view);
    return { delta: { views: [view] } };
  }
  if (op.op === 'patch' && typeof op.viewId === 'string') {
    const at = db.views.findIndex((v) => v.id === op.viewId);
    if (at < 0) return { delta: {}, error: 'That view no longer exists.' };
    db.views[at] = patchView(db.views[at], op.patch, db.props);
    return { delta: { views: [db.views[at]] } };
  }
  if (op.op === 'remove' && typeof op.viewId === 'string') {
    if (db.views.length <= 1) return { delta: {}, error: 'A database needs at least one view.' };
    const at = db.views.findIndex((v) => v.id === op.viewId);
    if (at < 0) return { delta: {} };
    db.views.splice(at, 1);
    return { delta: { viewsRemoved: [op.viewId as string] } };
  }
  if (op.op === 'duplicate' && typeof op.viewId === 'string') {
    const src = db.views.find((v) => v.id === op.viewId);
    if (!src) return { delta: {}, error: 'That view no longer exists.' };
    if (db.views.length >= MAX_VIEWS) return { delta: {}, error: `A database can have up to ${MAX_VIEWS} views.` };
    const copy: View = { ...structuredClone(src), id: newId(), name: `${src.name} (copy)`.slice(0, 60) };
    db.views.splice(db.views.indexOf(src) + 1, 0, copy);
    return { delta: { views: [copy] } };
  }
  return { delta: {}, error: 'Bad view change.' };
}

// ---- Rows ----

export interface RowActor { id: string }

export function newRow(db: DbData, props: Record<string, unknown> | undefined, who: RowActor, id: string, now: number): Row | string {
  if (db.rows.filter((r) => r.trashedAt === undefined).length >= MAX_ROWS) return `A database can have up to ${MAX_ROWS} rows.`;
  const row: Row = {
    id,
    props: {},
    createdBy: who.id,
    createdAt: now,
    editedBy: who.id,
    editedAt: now,
    order: db.rows.reduce((n, r) => Math.max(n, r.order), 0) + 1,
  };
  if (props) setValues(db, row, props);
  return row;
}

// Sets values on a row, checking each against its property. Returns the property ids that changed.
export function setValues(db: DbData, row: Row, values: Record<string, unknown>): { changed: string[]; rejected: number } {
  const changed: string[] = [];
  let rejected = 0;
  for (const [pid, raw] of Object.entries(values)) {
    const prop = db.props.find((p) => p.id === pid);
    if (!prop || isComputed(prop.type)) {
      rejected += 1;
      continue;
    }
    const v = coerce(prop, raw);
    if (v === undefined) {
      rejected += 1;
      continue;
    }
    const before = JSON.stringify(row.props[pid] ?? null);
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete row.props[pid];
    else row.props[pid] = v;
    if (JSON.stringify(row.props[pid] ?? null) !== before) changed.push(pid);
  }
  return { changed, rejected };
}

export function rowById(db: DbData, id: unknown): Row | undefined {
  return typeof id === 'string' ? db.rows.find((r) => r.id === id) : undefined;
}

// Where a row goes: just after `after` (null = first), in manual order.
export function orderRowAfter(db: DbData, rowId: string, after: string | null): number {
  const list = db.rows.filter((r) => r.id !== rowId && r.trashedAt === undefined).sort((a, b) => a.order - b.order);
  if (after === null) return list.length ? list[0].order - 1 : 1;
  const i = list.findIndex((r) => r.id === after);
  if (i < 0) return (list.length ? list[list.length - 1].order : 0) + 1;
  return i === list.length - 1 ? list[i].order + 1 : (list[i].order + list[i + 1].order) / 2;
}

// For a two-way relation: which linked rows were added and removed by an edit.
export function relationDiff(before: PropValue | undefined, after: PropValue | undefined): { added: string[]; removed: string[] } {
  const a = new Set(Array.isArray(before) ? (before as string[]) : []);
  const b = new Set(Array.isArray(after) ? (after as string[]) : []);
  return { added: [...b].filter((x) => !a.has(x)), removed: [...a].filter((x) => !b.has(x)) };
}

// ---- Templates, automations, forms ----

export function cleanTemplate(db: DbData, raw: unknown, id: string): RowTemplate | null {
  if (!isObj(raw)) return null;
  const name = str(raw.name, 80).trim();
  if (!name) return null;
  const row = { props: {} } as Row;
  if (isObj(raw.props)) setValues(db, row, raw.props);
  return { id, name, props: row.props, blocks: [] };
}

export function cleanAutomation(db: DbData, raw: unknown, id: string): Automation | string {
  if (!isObj(raw)) return 'Bad automation.';
  const name = str(raw.name, 80).trim() || 'Automation';
  const t = isObj(raw.trigger) ? raw.trigger : {};
  let trigger: Automation['trigger'];
  if (t.kind === 'propChanged') {
    const prop = db.props.find((p) => p.id === t.prop);
    if (!prop) return 'Pick a property for the trigger.';
    const to = t.to === undefined || t.to === null ? undefined : coerce(prop, t.to);
    trigger = { kind: 'propChanged', prop: prop.id, ...(to !== undefined && to !== null ? { to } : {}) };
  } else {
    trigger = { kind: 'rowAdded' };
  }
  const actions = cleanActions(raw.actions, db.props);
  if (!actions.length) return 'Add at least one action.';
  return { id, name, on: raw.on !== false, trigger, actions };
}

// What an automation does when a row is added or a property changes. Pure: returns setProp values to
// apply and notifications to send. Actions never trigger another automation.
export interface Effects { values: Record<string, PropValue>; notify: { user: string; text: string }[] }

export function automationEffects(db: DbData, row: Row, event: { kind: 'rowAdded' } | { kind: 'propChanged'; prop: string }): Effects {
  const out: Effects = { values: {}, notify: [] };
  for (const a of db.automations) {
    if (!a.on) continue;
    if (a.trigger.kind !== event.kind) continue;
    if (a.trigger.kind === 'propChanged' && event.kind === 'propChanged') {
      if (a.trigger.prop !== event.prop) continue;
      if (a.trigger.to !== undefined && JSON.stringify(a.trigger.to) !== JSON.stringify(row.props[event.prop] ?? null)) continue;
    }
    for (const act of a.actions) {
      if (act.kind === 'setProp' && act.prop) out.values[act.prop] = act.value ?? null;
      else if (act.kind === 'notify' && act.user) out.notify.push({ user: act.user === 'creator' ? row.createdBy : act.user, text: act.text || a.name });
    }
  }
  return out;
}

export function cleanForm(db: DbData, raw: unknown, prev: FormConfig): FormConfig {
  if (!isObj(raw)) return prev;
  const f: FormConfig = { ...prev };
  if (typeof raw.enabled === 'boolean') f.enabled = raw.enabled;
  if (typeof raw.title === 'string') f.title = raw.title.slice(0, 120);
  if (typeof raw.description === 'string') f.description = raw.description.slice(0, 500);
  if (typeof raw.submitLabel === 'string') f.submitLabel = raw.submitLabel.trim().slice(0, 40) || 'Submit';
  const askable = (id: unknown): id is string => typeof id === 'string' && db.props.some((p) => p.id === id && !isComputed(p.type));
  if (Array.isArray(raw.fields)) f.fields = [...new Set(raw.fields.filter(askable))];
  f.required = (Array.isArray(raw.required) ? raw.required.filter(askable) : f.required).filter((id) => f.fields.includes(id));
  return f;
}

// Checks a form answer: only the asked fields, required ones filled. Returns the values or a reason.
export function formValues(db: DbData, values: unknown): Record<string, PropValue> | string {
  if (!db.form.enabled) return 'This form isn’t open.';
  if (!isObj(values)) return 'Bad answers.';
  const out: Record<string, PropValue> = {};
  for (const id of db.form.fields) {
    const prop = db.props.find((p) => p.id === id);
    if (!prop) continue;
    const v = coerce(prop, values[id] ?? null);
    if (v === undefined) return `“${prop.name}” has a value that doesn’t fit.`;
    const empty = v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty && db.form.required.includes(id)) return `“${prop.name}” is required.`;
    if (!empty) out[id] = v;
  }
  return out;
}

// A body for a row template or an imported row: plain text lines become text blocks.
export const richText = (text: string) => cleanRich([{ t: text }]) ?? [];
