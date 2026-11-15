// Pure helpers for who may see or change what. No I/O so they can be unit-tested in isolation.
import type { ListItem, User, Workflow } from '../src/types.ts';
import { isAdmin } from '../src/premium.ts';

// Emails are only for admins and the person themself.
export function userView(u: User, viewer: User | undefined): User {
  if (!u.email || u.id === viewer?.id || isAdmin(viewer)) return u;
  const { email: _email, ...rest } = u;
  return rest;
}

export interface Actor { id: string; admin: boolean }

// A workflow belongs to whoever published it. Admins may change any; ones without an owner
// (the seeded defaults) are admin-only.
export function canEditWorkflow(w: Workflow, actor: Actor): boolean {
  return actor.admin || (!!w.createdBy && w.createdBy === actor.id);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// The editor sends the whole list back. Fold it into the stored one without letting it touch
// workflows its sender doesn't own: those keep their stored version, and omitting one doesn't delete it.
// `rejected` counts refused changes; `overrode` counts changes an admin made to other people's workflows.
export function mergeWorkflows(prev: Workflow[], incoming: Workflow[], actor: Actor, max = 50): { list: Workflow[]; rejected: number; overrode: number } {
  const byId = new Map(prev.map((w) => [w.id, w]));
  const seen = new Set<string>();
  const list: Workflow[] = [];
  let rejected = 0;
  let overrode = 0;
  for (const w of incoming) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    const old = byId.get(w.id);
    if (!old) {
      list.push({ ...w, createdBy: actor.id });
      continue;
    }
    const next = { ...w, createdBy: old.createdBy };
    if (same(next, old)) {
      list.push(old);
    } else if (canEditWorkflow(old, actor)) {
      list.push(next);
      if (old.createdBy !== actor.id) overrode += 1;
    } else {
      list.push(old);
      rejected += 1;
    }
  }
  for (const old of prev) {
    if (seen.has(old.id)) continue;
    if (canEditWorkflow(old, actor)) {
      if (old.createdBy !== actor.id) overrode += 1;
    } else {
      list.push(old);
      rejected += 1;
    }
  }
  return { list: list.slice(0, max), rejected, overrode };
}

export interface ListPatch { id: unknown; patch?: unknown; remove?: unknown }

const MAX_ITEMS = 500;

// Applies one change to one list item, so two people editing different items don't overwrite each
// other. Returns null when the change is invalid or does nothing.
export function applyListPatch(items: ListItem[], ev: ListPatch, isUser: (id: string) => boolean): ListItem[] | null {
  if (typeof ev.id !== 'string' || !ev.id || ev.id.length > 64) return null;
  const old = items.find((it) => it.id === ev.id);
  if (ev.remove === true) return old ? items.filter((it) => it.id !== ev.id) : null;
  if (!ev.patch || typeof ev.patch !== 'object') return null;
  const p = ev.patch as Record<string, unknown>;
  if (!old && items.length >= MAX_ITEMS) return null;
  const next: ListItem = old ? { ...old } : { id: ev.id, title: '', done: false, assignee: '', due: '', status: 'todo' };
  if (typeof p.title === 'string') next.title = p.title.trim().slice(0, 200);
  if (p.status === 'todo' || p.status === 'doing' || p.status === 'done') {
    next.status = p.status;
    next.done = p.status === 'done';
  }
  if (typeof p.assignee === 'string') next.assignee = isUser(p.assignee) ? p.assignee : '';
  if (typeof p.due === 'string') next.due = p.due.slice(0, 10);
  if (!next.title) return null;
  return old ? items.map((it) => (it.id === ev.id ? next : it)) : [...items, next];
}

// Admins may remove members and guests; only an owner may remove an admin or another owner.
// Nobody removes themself this way (that is leaveWorkspace) or a bot.
export function removeVerdict(actor: User | undefined, target: User | undefined): 'ok' | 'owner-only' | 'no' {
  if (!actor || !isAdmin(actor) || !target || target.bot || target.inactive || target.id === actor.id) return 'no';
  return (target.role === 'owner' || target.role === 'admin') && actor.role !== 'owner' ? 'owner-only' : 'ok';
}
