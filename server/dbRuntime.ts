// Database events: creating a database, its properties and views, its rows, forms, templates and
// automations. The rules live in databases.ts; this wires them to sockets and keeps two-way relations in step.
import type { WebSocket } from 'ws';
import type { CalendarItem, ClientEvent, DbData, DbDelta, Page, PropValue, Row, Property, SchemaOp, ViewOp } from '../src/types.ts';
import {
  applySchemaOps, applyViewOp, automationEffects, cleanAutomation, cleanForm, cleanTemplate, emptyDb, formValues, isComputed, MAX_AUTOMATIONS,
  MAX_TEMPLATES, newRow, orderRowAfter, presetDb, relationDiff, rowById, setValues, LAYOUTS,
} from './databases.ts';
import { GENERAL, atLeast, cloneBlocks, newPage, cleanIcon, getPage, nodeFor, type PageBody } from './pages.ts';
import type { Core, Handler } from './pageCore.ts';

const DB_EVENTS = new Set<string>([
  'dbCreate', 'dbGet', 'dbClose', 'dbSchema', 'dbView', 'rowCreate', 'rowUpdate', 'rowRemove', 'rowMove', 'dbTemplate',
  'dbAutomation', 'dbForm', 'dbLock', 'formSubmit', 'rowButton', 'calendarFeed',
]);
const MAX_INITIAL_ROWS = 500;
const MAX_FEED = 2000;

export const titleOfRow = (db: DbData | undefined, row: Row): string => {
  const t = db?.props.find((p) => p.type === 'title');
  const v = t ? row.props[t.id] : '';
  return typeof v === 'string' ? v : '';
};

interface Open { page: Page; body: PageBody; db: DbData }

export function createDbRuntime(core: Core): Handler {
  const { index } = core;

  async function openDb(ws: WebSocket, userId: string, id: unknown, level: 'view' | 'edit-content' | 'edit' | 'full', opts: { live?: boolean } = {}): Promise<Open | null> {
    const page = core.need(ws, userId, id, level);
    if (!page) return null;
    if (page.kind !== 'database') {
      core.denied(ws);
      return null;
    }
    if (opts.live !== false && page.trashedAt !== undefined && level !== 'view') {
      core.deps.send(ws, { t: 'error', message: 'This database is in the trash.' });
      return null;
    }
    const body = await core.bodyOf(page.id);
    if (!body.db) body.db = emptyDb(core.newId);
    // Access may have changed while the body loaded.
    if (!atLeast(core.levelOf(page, userId), level)) {
      core.denied(ws);
      return null;
    }
    return { page, body, db: body.db };
  }

  function changed(o: Open, userId: string, delta: DbDelta): void {
    o.body.version += 1;
    core.edited(o.page, userId);
    core.touchBody(o.page.id);
    core.touchIndex();
    core.broadcastToOpen(o.page.id, { t: 'dbDelta', id: o.page.id, delta, by: userId });
  }

  // Person ids that exist in this workspace.
  const knownPeople = () => core.deps.people();

  // Values a client sent, with people and related rows that don't exist (or can't be seen) taken out.
  async function sanitize(userId: string, db: DbData, values: Record<string, PropValue>): Promise<Record<string, PropValue>> {
    const out: Record<string, PropValue> = {};
    const people = knownPeople();
    for (const [pid, v] of Object.entries(values)) {
      const prop = db.props.find((p) => p.id === pid);
      if (!prop) continue;
      if (prop.type === 'person' && Array.isArray(v)) out[pid] = (v as string[]).filter((id) => Object.hasOwn(people, id));
      else if (prop.type === 'relation' && Array.isArray(v) && prop.relation) {
        const other = getPage(index.pages, prop.relation.dbId);
        if (!other || other.kind !== 'database' || !atLeast(core.levelOf(other, userId), 'view')) {
          out[pid] = [];
          continue;
        }
        const odb = (await core.bodyOf(other.id)).db;
        out[pid] = (v as string[]).filter((id) => !!odb && !!rowById(odb, id) && rowById(odb, id)?.trashedAt === undefined);
      } else out[pid] = v;
    }
    return out;
  }

  // Keeps the other side of a two-way relation in step with an edit to this side.
  async function syncRelations(o: Open, row: Row, before: Record<string, PropValue | undefined>, propIds: string[], userId: string): Promise<void> {
    for (const pid of propIds) {
      const prop = o.db.props.find((p) => p.id === pid);
      if (!prop?.relation?.twoWay) continue;
      const { added, removed } = relationDiff(before[pid], row.props[pid]);
      if (!added.length && !removed.length) continue;
      const other = getPage(index.pages, prop.relation.dbId);
      if (!other || other.kind !== 'database') continue;
      const ob = await core.bodyOf(other.id);
      const rev = ob.db?.props.find((p) => p.id === prop.relation!.twoWay);
      if (!ob.db || !rev || rev.type !== 'relation') continue;
      const touched: Row[] = [];
      for (const rid of added) {
        const r = rowById(ob.db, rid);
        if (!r) continue;
        const list = Array.isArray(r.props[rev.id]) ? (r.props[rev.id] as string[]) : [];
        if (!list.includes(row.id)) {
          r.props[rev.id] = [...list, row.id];
          r.editedAt = core.now();
          r.editedBy = userId;
          touched.push(r);
        }
      }
      for (const rid of removed) {
        const r = rowById(ob.db, rid);
        if (!r || !Array.isArray(r.props[rev.id])) continue;
        const next = (r.props[rev.id] as string[]).filter((x) => x !== row.id);
        if (next.length) r.props[rev.id] = next;
        else delete r.props[rev.id];
        touched.push(r);
      }
      if (touched.length) {
        ob.version += 1;
        core.touchBody(other.id);
        core.broadcastToOpen(other.id, { t: 'dbDelta', id: other.id, delta: { rows: touched }, by: userId });
      }
    }
  }

  // Applies what automations ask for on a row. Returns the delta addition.
  async function runAutomations(o: Open, row: Row, event: { kind: 'rowAdded' } | { kind: 'propChanged'; prop: string }, userId: string): Promise<void> {
    const fx = automationEffects(o.db, row, event);
    if (Object.keys(fx.values).length) {
      const before = { ...row.props };
      const clean = await sanitize(userId, o.db, fx.values);
      const res = setValues(o.db, row, clean);
      await syncRelations(o, row, before, res.changed, userId);
    }
    for (const n of fx.notify.slice(0, 20)) {
      core.notify(n.user, { kind: 'notify', pageId: `${o.page.id}.${row.id}`, by: userId, text: `${n.text} — ${titleOfRow(o.db, row) || 'Untitled'}` });
    }
  }

  function setBody(rowKey: string, blocks: PageBody['blocks']): void {
    // A body made from a template; the cache is filled so the first open does not hit the store.
    void core.bodyOf(rowKey).then((b) => {
      b.blocks = blocks;
      b.version += 1;
      core.touchBody(rowKey);
    });
  }

  return async (ws, userId, ev: ClientEvent) => {
    if (!DB_EVENTS.has(ev.t)) return false;
    const who = core.deps.who(userId);
    if (!who) return true;

    switch (ev.t) {
      case 'dbCreate': {
        const parentId = typeof ev.parentId === 'string' ? ev.parentId : null;
        const space = typeof ev.teamspaceId === 'string' && (ev.teamspaceId === GENERAL || Object.hasOwn(index.teamspaces, ev.teamspaceId)) ? ev.teamspaceId : undefined;
        const made = newPage(index.pages, { parentId, shared: ev.shared === true, teamspaceId: space, title: ev.title ?? 'Untitled database', icon: cleanIcon(ev.icon), kind: 'database', source: ev.source }, who, core.newId(), core.now());
        if (typeof made === 'string') {
          core.deps.send(ws, { t: 'error', message: made });
          return true;
        }
        const layout = typeof ev.layout === 'string' && (LAYOUTS as readonly string[]).includes(ev.layout) ? ev.layout : undefined;
        const db = typeof ev.preset === 'string' ? presetDb(ev.preset, core.newId, layout) : emptyDb(core.newId, layout);
        // Extra properties and starting rows (a list or CSV being turned into a database). Rows are keyed by property name.
        if (Array.isArray(ev.props) && ev.props.length) {
          const ops: SchemaOp[] = ev.props.slice(0, 50).filter((p) => p && typeof p.name === 'string' && typeof p.type === 'string' && p.type !== 'title').map((p) => ({ op: 'addProp' as const, prop: p as Partial<Property> & { type: Property['type']; name: string } }));
          applySchemaOps(db, ops, core.newId);
        }
        if (Array.isArray(ev.rows)) {
          const byName = new Map(db.props.map((p) => [p.name, p]));
          for (const raw of ev.rows.slice(0, MAX_INITIAL_ROWS)) {
            if (!raw || typeof raw !== 'object') continue;
            const values: Record<string, PropValue> = {};
            for (const [name, v] of Object.entries(raw)) {
              const p = byName.get(name);
              if (!p || isComputed(p.type) || p.type === 'relation') continue;
              // Options may be given by name; people must exist in this workspace.
              const named = (x: unknown) => p.options?.find((o) => o.id === x || o.name.toLowerCase() === String(x).toLowerCase())?.id;
              if (p.type === 'select' || p.type === 'status') values[p.id] = (named(v) ?? null) as PropValue;
              else if (p.type === 'multi' && Array.isArray(v)) values[p.id] = v.map(named).filter((x): x is string => !!x);
              else if (p.type === 'person' && Array.isArray(v)) values[p.id] = v.filter((x) => typeof x === 'string' && Object.hasOwn(knownPeople(), x));
              else values[p.id] = v;
            }
            const row = newRow(db, values, who, core.newId(), core.now());
            if (typeof row !== 'string') db.rows.push(row);
          }
        }
        index.pages[made.id] = made;
        const body = await core.bodyOf(made.id);
        body.db = db;
        body.version += 1;
        core.touchBody(made.id);
        core.touchIndex();
        core.syncNodes([made.id]);
        core.deps.send(ws, { t: 'pageCreated', id: made.id });
        return true;
      }
      case 'dbGet': {
        const o = await openDb(ws, userId, ev.id, 'view', { live: false });
        if (!o) return true;
        core.openTabs(o.page.id).add(ws);
        core.deps.send(ws, { t: 'dbData', id: o.page.id, page: core.metaOf(o.page), level: core.levelOf(o.page, userId), db: o.db, version: o.body.version });
        return true;
      }
      case 'dbClose': {
        if (typeof ev.id === 'string') core.openTabs(ev.id).delete(ws);
        return true;
      }
      case 'dbSchema': {
        const o = await openDb(ws, userId, ev.id, 'edit');
        if (!o || !Array.isArray(ev.ops) || ev.ops.length === 0 || ev.ops.length > 100) return true;
        if (o.db.locked && !atLeast(core.levelOf(o.page, userId), 'full')) {
          core.deps.send(ws, { t: 'error', message: 'This database is locked.' });
          return true;
        }
        // A relation must point at a database this person can see.
        const ops: SchemaOp[] = [];
        for (const op of ev.ops) {
          const rel = (op as { prop?: Partial<Property>; patch?: Partial<Property> }).prop?.relation ?? (op as { patch?: Partial<Property> }).patch?.relation;
          if (rel) {
            const other = getPage(index.pages, rel.dbId);
            if (!other || other.kind !== 'database' || !atLeast(core.levelOf(other, userId), 'view')) {
              core.deps.send(ws, { t: 'error', message: 'You can’t relate to that database.' });
              continue;
            }
          }
          ops.push(op);
        }
        const before = new Set(o.db.props.map((p) => p.id));
        const res = applySchemaOps(o.db, ops, core.newId);
        // New two-way relations get a matching property in the other database.
        for (const p of o.db.props) {
          if (before.has(p.id) || p.type !== 'relation' || !p.relation) continue;
          if (p.relation.twoWay !== 'create') {
            delete p.relation.twoWay;
            continue;
          }
          const other = getPage(index.pages, p.relation.dbId);
          const ob: Open | null | undefined = other && (other.id === o.page.id ? o : await openDb(ws, userId, other.id, 'edit'));
          if (!ob) {
            delete p.relation.twoWay;
            continue;
          }
          const rev: Property = { id: core.newId(), name: `Related to ${o.page.title || 'Untitled'}`.slice(0, 100), type: 'relation', relation: { dbId: o.page.id, twoWay: p.id } };
          ob.db.props.push(rev);
          for (const v of ob.db.views) v.visible = [...v.visible, rev.id];
          p.relation.twoWay = rev.id;
          if (ob !== o) changed(ob, userId, { props: [rev], views: ob.db.views });
          else (res.delta.props ??= []).push(rev);
        }
        if (res.delta.props) res.delta.props = res.delta.props.map((p) => o.db.props.find((x) => x.id === p.id) ?? p);
        if (res.error) core.deps.send(ws, { t: 'error', message: res.error });
        else if (res.rejected) core.deps.send(ws, { t: 'error', message: `${res.rejected} change${res.rejected === 1 ? ' was' : 's were'} not saved.` });
        if (Object.keys(res.delta).length) changed(o, userId, res.delta);
        return true;
      }
      case 'dbView': {
        const o = await openDb(ws, userId, ev.id, 'edit');
        if (!o) return true;
        const res = applyViewOp(o.db, ev.op as ViewOp, core.newId);
        if (res.error) core.deps.send(ws, { t: 'error', message: res.error });
        else if (Object.keys(res.delta).length) changed(o, userId, res.delta);
        return true;
      }
      case 'rowCreate': {
        const o = await openDb(ws, userId, ev.id, 'edit');
        if (!o) return true;
        const tpl = typeof ev.template === 'string' ? o.db.templates.find((t) => t.id === ev.template) : undefined;
        const values = await sanitize(userId, o.db, { ...(tpl?.props ?? {}), ...(ev.props && typeof ev.props === 'object' ? ev.props : {}) });
        const row = newRow(o.db, values, who, core.newId(), core.now());
        if (typeof row === 'string') {
          core.deps.send(ws, { t: 'error', message: row });
          return true;
        }
        if ('after' in ev && (ev.after === null || typeof ev.after === 'string')) row.order = orderRowAfter(o.db, row.id, ev.after);
        o.db.rows.push(row);
        if (tpl?.blocks.length) setBody(`${o.page.id}.${row.id}`, cloneBlocks(tpl.blocks, core.newId));
        await runAutomations(o, row, { kind: 'rowAdded' }, userId);
        changed(o, userId, { rows: [row] });
        return true;
      }
      case 'rowUpdate': {
        const o = await openDb(ws, userId, ev.id, 'edit');
        const row = o && rowById(o.db, ev.rowId);
        if (!o || !row) {
          if (o) core.deps.send(ws, { t: 'error', message: 'That row no longer exists.' });
          return true;
        }
        const before = { ...row.props };
        let ids: string[] = [];
        if (ev.props && typeof ev.props === 'object') {
          const values = await sanitize(userId, o.db, ev.props);
          const res = setValues(o.db, row, values);
          ids = res.changed;
          if (res.rejected) core.deps.send(ws, { t: 'error', message: `${res.rejected} value${res.rejected === 1 ? ' doesn’t' : 's don’t'} fit its property.` });
        }
        if (typeof ev.icon === 'string') row.icon = cleanIcon(ev.icon);
        if (!ids.length && typeof ev.icon !== 'string') return true;
        row.editedAt = core.now();
        row.editedBy = userId;
        await syncRelations(o, row, before, ids, userId);
        for (const pid of ids) await runAutomations(o, row, { kind: 'propChanged', prop: pid }, userId);
        // Someone newly named in a person property hears about it.
        for (const pid of ids) {
          const prop = o.db.props.find((p) => p.id === pid);
          if (prop?.type !== 'person') continue;
          const was = new Set(Array.isArray(before[pid]) ? (before[pid] as string[]) : []);
          for (const uid of (row.props[pid] as string[] | undefined) ?? []) {
            if (!was.has(uid)) core.notify(uid, { kind: 'assigned', pageId: `${o.page.id}.${row.id}`, by: userId, text: titleOfRow(o.db, row) || 'Untitled' });
          }
        }
        changed(o, userId, { rows: [row] });
        return true;
      }
      case 'rowRemove': {
        const o = await openDb(ws, userId, ev.id, 'edit');
        const row = o && rowById(o.db, ev.rowId);
        if (!o || !row) return true;
        if (ev.restore === true) {
          delete row.trashedAt;
          changed(o, userId, { rows: [row] });
        } else if (row.trashedAt === undefined) {
          row.trashedAt = core.now();
          changed(o, userId, { rows: [row] });
        } else {
          o.db.rows = o.db.rows.filter((r) => r !== row);
          void core.deps.store.removeBody(`${o.page.id}.${row.id}`).catch(() => undefined);
          changed(o, userId, { rowsRemoved: [row.id] });
        }
        return true;
      }
      case 'rowMove': {
        const o = await openDb(ws, userId, ev.id, 'edit');
        const row = o && rowById(o.db, ev.rowId);
        if (!o || !row) return true;
        row.order = orderRowAfter(o.db, row.id, typeof ev.after === 'string' ? ev.after : null);
        changed(o, userId, { rows: [row] });
        return true;
      }
      case 'dbTemplate': {
        const o = await openDb(ws, userId, ev.id, 'edit');
        if (!o || !ev.op) return true;
        if (ev.op.op === 'remove') {
          o.db.templates = o.db.templates.filter((t) => t.id !== (ev.op as { templateId: string }).templateId);
          changed(o, userId, { templatesRemoved: [(ev.op as { templateId: string }).templateId] });
        } else if (ev.op.op === 'set') {
          const raw = ev.op.template;
          const existing = typeof raw.id === 'string' ? o.db.templates.find((t) => t.id === raw.id) : undefined;
          if (!existing && o.db.templates.length >= MAX_TEMPLATES) {
            core.deps.send(ws, { t: 'error', message: `A database can have up to ${MAX_TEMPLATES} templates.` });
            return true;
          }
          const t = cleanTemplate(o.db, raw, existing?.id ?? core.newId());
          if (!t) return true;
          t.props = await sanitize(userId, o.db, t.props);
          if (existing) {
            t.blocks = existing.blocks;
            Object.assign(existing, t);
          } else o.db.templates.push(t);
          changed(o, userId, { templates: [existing ?? t] });
        }
        return true;
      }
      case 'dbAutomation': {
        const o = await openDb(ws, userId, ev.id, 'full');
        if (!o || !ev.op) return true;
        if (ev.op.op === 'remove') {
          o.db.automations = o.db.automations.filter((a) => a.id !== (ev.op as { automationId: string }).automationId);
          changed(o, userId, { automations: o.db.automations, automationsRemoved: [(ev.op as { automationId: string }).automationId] });
        } else if (ev.op.op === 'set') {
          const raw = ev.op.automation;
          const existing = typeof raw.id === 'string' ? o.db.automations.find((a) => a.id === raw.id) : undefined;
          if (!existing && o.db.automations.length >= MAX_AUTOMATIONS) {
            core.deps.send(ws, { t: 'error', message: `A database can have up to ${MAX_AUTOMATIONS} automations.` });
            return true;
          }
          const a = cleanAutomation(o.db, raw, existing?.id ?? core.newId());
          if (typeof a === 'string') {
            core.deps.send(ws, { t: 'error', message: a });
            return true;
          }
          if (existing) Object.assign(existing, a);
          else o.db.automations.push(a);
          changed(o, userId, { automations: [existing ?? a] });
        }
        return true;
      }
      case 'dbForm': {
        const o = await openDb(ws, userId, ev.id, 'full');
        if (!o) return true;
        o.db.form = cleanForm(o.db, ev.patch, o.db.form);
        changed(o, userId, { form: o.db.form });
        return true;
      }
      case 'dbLock': {
        const o = await openDb(ws, userId, ev.id, 'full');
        if (!o) return true;
        o.db.locked = ev.locked === true;
        changed(o, userId, { locked: o.db.locked });
        return true;
      }
      case 'formSubmit': {
        const o = await openDb(ws, userId, ev.id, 'view');
        if (!o) return true;
        const values = formValues(o.db, ev.values);
        if (typeof values === 'string') {
          core.deps.send(ws, { t: 'error', message: values });
          return true;
        }
        const row = newRow(o.db, await sanitize(userId, o.db, values), who, core.newId(), core.now());
        if (typeof row === 'string') {
          core.deps.send(ws, { t: 'error', message: row });
          return true;
        }
        o.db.rows.push(row);
        await runAutomations(o, row, { kind: 'rowAdded' }, userId);
        changed(o, userId, { rows: [row] });
        return true;
      }
      case 'rowButton': {
        const o = await openDb(ws, userId, ev.id, 'edit');
        const row = o && rowById(o.db, ev.rowId);
        const prop = o?.db.props.find((p) => p.id === ev.prop && p.type === 'button');
        if (!o || !row || !prop?.button) return true;
        const values: Record<string, PropValue> = {};
        for (const a of prop.button.actions) {
          if (a.kind === 'setProp' && a.prop) values[a.prop] = a.value ?? null;
          else if (a.kind === 'notify' && a.user) core.notify(a.user === 'creator' ? row.createdBy : a.user, { kind: 'notify', pageId: `${o.page.id}.${row.id}`, by: userId, text: a.text || prop.button.label });
        }
        const before = { ...row.props };
        const res = setValues(o.db, row, await sanitize(userId, o.db, values));
        if (res.changed.length) {
          row.editedAt = core.now();
          row.editedBy = userId;
          await syncRelations(o, row, before, res.changed, userId);
          changed(o, userId, { rows: [row] });
        }
        return true;
      }
      case 'calendarFeed': {
        const items: CalendarItem[] = [];
        for (const page of Object.values(index.pages)) {
          if (page.kind !== 'database' || items.length >= MAX_FEED) continue;
          if (!nodeFor(index.pages, page, who, core.spaces())) continue;
          const db = (await core.bodyOf(page.id)).db;
          if (!db) continue;
          for (const p of db.props.filter((x) => x.type === 'date')) {
            for (const r of db.rows) {
              const v = r.props[p.id];
              if (r.trashedAt !== undefined || !v || typeof v !== 'object' || Array.isArray(v)) continue;
              items.push({ rowId: r.id, dbId: page.id, dbTitle: page.title || 'Untitled', title: titleOfRow(db, r) || 'Untitled', start: v.start, ...(v.end ? { end: v.end } : {}), prop: p.name });
              if (items.length >= MAX_FEED) break;
            }
          }
        }
        core.sendUser(userId, { t: 'calendarFeed', items });
        return true;
      }
    }
    return true;
  };
}

