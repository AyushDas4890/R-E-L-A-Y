// A person's own Home: notes, to-do lists and links that live outside every workspace.
// Pure rules only (no I/O) so they can be unit-tested; index.ts stores and sends them.
import type { HomeItem, HomeKind, HomeTask } from '../src/types.ts';

export const HOME_MAX_ITEMS = 200;
const KINDS = new Set<string>(['note', 'todo', 'link']);
const MAX_TITLE = 120;
const MAX_TEXT = 5000;
const MAX_URL = 500;
const MAX_TASKS = 100;
const MAX_TASK = 200;

export const isKind = (k: unknown): k is HomeKind => typeof k === 'string' && KINDS.has(k);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

// Only web links: anything else (javascript:, data:) would run or leak when clicked.
export function cleanUrl(v: unknown): string {
  const s = str(v, MAX_URL).trim();
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

export function cleanTasks(v: unknown, newId: () => string): HomeTask[] | null {
  if (!Array.isArray(v) || v.length > MAX_TASKS) return null;
  const seen = new Set<string>();
  const out: HomeTask[] = [];
  for (const t of v) {
    if (!t || typeof t !== 'object') return null;
    const { id, text, done } = t as Partial<HomeTask>;
    let key = typeof id === 'string' && id && id.length <= 40 ? id : newId();
    if (seen.has(key)) key = newId();
    seen.add(key);
    out.push({ id: key, text: str(text, MAX_TASK), done: done === true });
  }
  return out;
}

export interface HomeFields { title?: unknown; text?: unknown; url?: unknown; tasks?: unknown }

// Adds an item, or says why not.
export function addItem(items: HomeItem[], kind: unknown, init: HomeFields, id: string, now: number, newId: () => string): HomeItem[] | string {
  if (!isKind(kind)) return 'Pick note, to-do list or link.';
  if (items.length >= HOME_MAX_ITEMS) return `Home holds up to ${HOME_MAX_ITEMS} items.`;
  const item: HomeItem = { id, kind, title: '', text: '', url: '', tasks: [], createdAt: now, updatedAt: now };
  const next = applyFields(item, init, newId);
  return next ? [next, ...items] : 'That doesn’t fit.';
}

function applyFields(item: HomeItem, f: HomeFields, newId: () => string): HomeItem | null {
  const out = { ...item };
  if (f.title !== undefined) out.title = str(f.title, MAX_TITLE);
  if (f.text !== undefined) out.text = str(f.text, MAX_TEXT);
  if (f.url !== undefined) out.url = cleanUrl(f.url);
  if (f.tasks !== undefined) {
    const t = cleanTasks(f.tasks, newId);
    if (!t) return null;
    out.tasks = t;
  }
  return out;
}

// Changes one item's fields. Unknown ids and bad values leave the list as it was.
export function updateItem(items: HomeItem[], id: unknown, patch: unknown, now: number, newId: () => string): HomeItem[] | null {
  if (typeof id !== 'string' || !patch || typeof patch !== 'object') return null;
  const at = items.findIndex((i) => i.id === id);
  if (at < 0) return null;
  const next = applyFields(items[at], patch as HomeFields, newId);
  if (!next) return null;
  next.updatedAt = now;
  return items.map((i, n) => (n === at ? next : i));
}

export function removeItem(items: HomeItem[], id: unknown): HomeItem[] {
  return typeof id === 'string' ? items.filter((i) => i.id !== id) : items;
}

// Stored documents may lack fields or hold junk; keep only what fits.
export function cleanHome(stored: unknown): HomeItem[] {
  const list = stored && typeof stored === 'object' && Array.isArray((stored as { items?: unknown }).items) ? (stored as { items: unknown[] }).items : [];
  const out: HomeItem[] = [];
  for (const raw of list.slice(0, HOME_MAX_ITEMS)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Partial<HomeItem>;
    if (typeof r.id !== 'string' || !isKind(r.kind)) continue;
    let n = 0;
    const tasks = cleanTasks(r.tasks ?? [], () => `t${n++}-${r.id}`) ?? [];
    out.push({ id: r.id, kind: r.kind, title: str(r.title, MAX_TITLE), text: str(r.text, MAX_TEXT), url: cleanUrl(r.url), tasks, createdAt: Number(r.createdAt) || 0, updatedAt: Number(r.updatedAt) || 0 });
  }
  return out;
}
