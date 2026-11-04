// Drag and drop helpers shared across Relay. The pure functions are unit-tested in dnd.test.ts; the hooks
// are thin wrappers that give an element the props it needs to be dragged or dropped on.
import { useCallback, useState, useSyncExternalStore } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';

// ── Pure helpers ───────────────────────────────────────────────────────────

// Moves `id` so it sits just before `before` (or last when `before` is null). Unknown ids change nothing.
export function moveBefore(ids: readonly string[], id: string, before: string | null): string[] {
  if (!ids.includes(id) || id === before || (before !== null && !ids.includes(before))) return [...ids];
  const rest = ids.filter((x) => x !== id);
  const at = before === null ? rest.length : rest.indexOf(before);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

// Moves `id` one place earlier (-1) or later (1): the keyboard version of dragging.
export function nudge(ids: readonly string[], id: string, dir: -1 | 1): string[] {
  const at = ids.indexOf(id);
  if (at < 0) return [...ids];
  const to = at + dir;
  if (to < 0 || to >= ids.length) return [...ids];
  const out = [...ids];
  [out[at], out[to]] = [out[to], out[at]];
  return out;
}

// Puts items in the order saved by the user; anything the saved list doesn't know keeps its place at the end.
export function orderBy<T>(items: readonly T[], key: (t: T) => string, saved: readonly string[]): T[] {
  const rank = new Map(saved.map((id, i) => [id, i]));
  return items
    .map((t, i) => ({ t, i, r: rank.get(key(t)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.t);
}

export type Dropped =
  | { kind: 'link'; url: string; title: string }
  | { kind: 'text'; title: string; text: string }
  | { kind: 'file'; file: File };

const looksLikeUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

// What a drop onto Home carries: a web link, some text, or files. Links win over text when both are present.
export function classifyDrop(data: { uri: string; text: string; files: File[] }): Dropped[] {
  const out: Dropped[] = [];
  for (const f of data.files) out.push({ kind: 'file', file: f });
  if (out.length) return out;
  const uri = data.uri.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#')) ?? '';
  const plain = data.text.trim();
  const url = looksLikeUrl(uri) ? uri : looksLikeUrl(plain) ? plain : '';
  if (url) {
    let title = '';
    try { title = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep empty */ }
    return [{ kind: 'link', url, title }];
  }
  if (plain) {
    const first = plain.split(/\r?\n/)[0].slice(0, 60);
    return [{ kind: 'text', title: first, text: plain }];
  }
  return [];
}

export const isTextFile = (f: { name: string; type: string }) => f.type.startsWith('text/') || /\.(txt|md|markdown|csv|json|log)$/i.test(f.name);

// True while the thing being dragged is one or more files from the computer.
export const carriesFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types).includes('Files');
// True while it is a link or some text (dragged from another tab or app), not one of our own internal drags.
export const carriesTextOrLink = (dt: DataTransfer | null) => !!dt && !Array.from(dt.types).includes(INTERNAL) && Array.from(dt.types).some((t) => t === 'text/uri-list' || t === 'text/plain');
export const INTERNAL = 'application/x-relay-drag';

// ── Hooks ──────────────────────────────────────────────────────────────────

// Reordering a list by dragging. `handleProps(id)` goes on the grip (or the whole item), `targetProps(id)` on
// the item that can be dropped onto. `onMove(from, before)` is told where the dragged item should land.
export function useReorder(onMove: (from: string, before: string | null) => void) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const end = useCallback(() => { setDrag(null); setOver(null); }, []);
  const handleProps = (id: string, image?: () => HTMLElement | null) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(INTERNAL, id);
      e.dataTransfer.setData('text/plain', '');
      const el = image?.();
      if (el) e.dataTransfer.setDragImage(el, 16, 16);
      setDrag(id);
    },
    onDragEnd: end,
  });
  const targetProps = (id: string) => ({
    onDragOver: (e: DragEvent) => { if (drag && drag !== id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== id) setOver(id); } },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && over === id) setOver(null); },
    onDrop: (e: DragEvent) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); if (drag !== id) onMove(drag, id); end(); },
  });
  const classOf = (id: string) => `${drag === id ? 'dnd-dragging' : ''} ${over === id && drag !== id ? 'dnd-over' : ''}`.trim();
  // Keyboard version of dragging: arrow keys on a grip move the item one place; on a whole item it takes Alt + arrow.
  const keyProps = (onNudge: (dir: -1 | 1) => void, needAlt = false) => ({
    onKeyDown: (e: KeyboardEvent) => {
      const dir = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0;
      if (dir && (!needAlt || e.altKey)) { e.preventDefault(); onNudge(dir); }
    },
  });
  return { drag, over, handleProps, targetProps, classOf, keyProps, end };
}

// A drop zone for files from the computer. `active` is true while a file hovers over it.
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [active, setActive] = useState(false);
  const props = {
    onDragEnter: (e: DragEvent) => { if (carriesFiles(e.dataTransfer)) { e.preventDefault(); setActive(true); } },
    onDragOver: (e: DragEvent) => { if (carriesFiles(e.dataTransfer)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!active) setActive(true); } },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(false); },
    onDrop: (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return;
      e.preventDefault();
      setActive(false);
      onFiles(Array.from(e.dataTransfer.files));
    },
  };
  return { active, props };
}

// ── Saved order (per browser) ──────────────────────────────────────────────
// For lists whose order is the user's own taste and which the server doesn't store, like workspaces.
const listeners = new Set<() => void>();
const readOrder = (key: string): string[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
};
const cache = new Map<string, { raw: string; value: string[] }>();
const snapshotOf = (key: string): string[] => {
  let raw = '[]';
  try { raw = localStorage.getItem(key) ?? '[]'; } catch { /* storage blocked */ }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  const value = readOrder(key);
  cache.set(key, { raw, value });
  return value;
};

export function useSavedOrder(key: string): [string[], (next: string[]) => void] {
  const order = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => snapshotOf(key), () => []);
  const set = useCallback((next: string[]) => {
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage blocked: the order just won't stick */ }
    cache.delete(key);
    listeners.forEach((l) => l());
  }, [key]);
  return [order, set];
}

export const WORKSPACE_ORDER_KEY = 'relay.workspaceOrder';
