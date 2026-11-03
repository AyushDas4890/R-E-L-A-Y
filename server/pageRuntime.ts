// The page events of one workspace: tree changes, opening a page, block edits. The decisions
// (who may do what, how ops merge) live in pages.ts; this file only wires them to sockets and storage.
// Databases (dbRuntime.ts) and sharing, comments, history, search and so on (collabRuntime.ts) plug into
// the same core.
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { Block, ClientEvent, InboxItem, Page, PageLevel, PageMeta, PageNode, ServerEvent, Teamspace } from '../src/types.ts';
import {
  MAX_OPS, MAX_OPS_BYTES, GENERAL, applyOps, atLeast, canMove, cleanCover, cleanIcon, cleanTitle, cloneBlocks, getPage,
  levelFor, newPage, nextOrder, nodeFor, orderAfter, subtree, visibleNodes, type PageBody, type Spaces,
} from './pages.ts';
import type { Core, Handler, PageDeps, Target } from './pageCore.ts';
import { createDbRuntime, titleOfRow } from './dbRuntime.ts';
import { createCollabRuntime, visibleSpaces } from './collabRuntime.ts';
import { templateFor } from '../src/templates.ts';
import { rowById } from './databases.ts';

export type { PageDeps } from './pageCore.ts';

const PAGE_EVENTS = new Set<string>([
  'pageCreate', 'pageUpdate', 'pageMove', 'pageTrash', 'pageRestore', 'pageDelete', 'pageDuplicate',
  'pageFavorite', 'pageGet', 'pageClose', 'blockOps', 'pagePresence',
]);
const DENIED = 'You don’t have access to that page.';
const MAX_CACHED_BODIES = 200;
const MAX_DUPLICATE = 200;
const MAX_INBOX = 200;

// The default teamspace is not stored; every non-guest member is in it.
export const defaultSpace = (name: string): Teamspace => ({ id: GENERAL, name, icon: '🏠', description: 'Everyone in the workspace', kind: 'default', members: {} });

export function createPageRuntime(deps: PageDeps) {
  const { store, index } = deps;
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? randomUUID;
  const bodies = new Map<string, PageBody>();
  const loading = new Map<string, Promise<PageBody>>();
  const dirty = new Set<string>();
  // Page id (or database row id) -> the tabs that have it open.
  const open = new Map<string, Set<WebSocket>>();
  let indexDirty = false;
  let timer: NodeJS.Timeout | undefined;

  // ---- Saving: the same debounce as the workspace document, per piece ----
  function schedule(ms = 250): void {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  }
  async function flush(): Promise<void> {
    clearTimeout(timer);
    let failed = false;
    if (indexDirty) {
      indexDirty = false;
      await store.saveIndex(index).catch((err) => {
        indexDirty = true;
        failed = true;
        console.error('pages index save failed:', err instanceof Error ? err.message : err);
      });
    }
    for (const id of [...dirty]) {
      dirty.delete(id);
      const body = bodies.get(id);
      if (!body) continue;
      await store.saveBody(body).catch((err) => {
        dirty.add(id);
        failed = true;
        console.error('page save failed:', err instanceof Error ? err.message : err);
      });
    }
    if (failed) schedule(5000);
  }
  const touchIndex = () => {
    indexDirty = true;
    schedule();
  };
  const touchBody = (id: string) => {
    dirty.add(id);
    schedule();
  };

  async function bodyOf(id: string): Promise<PageBody> {
    const cached = bodies.get(id);
    if (cached) return cached;
    let p = loading.get(id);
    if (!p) {
      p = store.loadBody(id).then((b) => {
        // Two loads of one page can overlap; the first to finish wins so everyone shares one copy.
        const have = bodies.get(id);
        if (have) return have;
        bodies.set(id, b);
        evict();
        return b;
      }).finally(() => loading.delete(id));
      loading.set(id, p);
    }
    return p;
  }
  // Keeps memory bounded: drop the oldest bodies nobody has open and nothing is waiting to save.
  function evict(): void {
    for (const id of bodies.keys()) {
      if (bodies.size <= MAX_CACHED_BODIES) return;
      if (dirty.has(id) || (open.get(id)?.size ?? 0) > 0) continue;
      bodies.delete(id);
    }
  }

  // ---- Helpers ----
  const metaOf = (page: Page): PageMeta => {
    const { access: _access, ...meta } = page;
    return meta;
  };
  const spaces = (): Spaces => index.teamspaces;
  const levelOf = (page: Page, userId: string): PageLevel => levelFor(index.pages, page, deps.who(userId), spaces());
  const sendUser = (userId: string, ev: ServerEvent) => {
    for (const [ws, uid] of deps.clients()) if (uid === userId) deps.send(ws, ev);
  };

  // Tells each person what the given pages now look like to them, and what vanished from their view.
  function syncNodes(ids: string[]): void {
    for (const [ws, uid] of deps.clients()) {
      const who = deps.who(uid);
      const nodes: PageNode[] = [];
      const gone: string[] = [];
      for (const id of ids) {
        const page = getPage(index.pages, id);
        const node = page ? nodeFor(index.pages, page, who, spaces()) : null;
        if (node) nodes.push(node);
        else gone.push(id);
      }
      if (nodes.length || gone.length) deps.send(ws, { t: 'pageNodes', nodes, gone });
      for (const id of gone) revokeOpen(ws, id);
    }
  }
  // Closes the page (and any of its rows) in one tab.
  function revokeOpen(ws: WebSocket, id: string): void {
    for (const [key, tabs] of open) {
      if ((key === id || key.startsWith(`${id}.`)) && tabs.delete(ws)) deps.send(ws, { t: 'pageRevoked', id: key });
    }
  }

  const denied = (ws: WebSocket) => deps.send(ws, { t: 'error', message: DENIED });

  // The page as `userId` may use it, or an error to the tab and null.
  function need(ws: WebSocket, userId: string, id: unknown, level: PageLevel): Page | null {
    const page = getPage(index.pages, id);
    if (!page || !atLeast(levelOf(page, userId), level)) {
      denied(ws);
      return null;
    }
    return page;
  }

  // Like `need`, and also understands a database row's id (`<database>.<row>`): the row inherits the database's level.
  async function target(ws: WebSocket, userId: string, id: unknown, level: PageLevel): Promise<Target | null> {
    if (typeof id !== 'string') {
      denied(ws);
      return null;
    }
    const dot = id.indexOf('.');
    if (dot < 0) {
      const page = need(ws, userId, id, level);
      return page ? { page, id: page.id, meta: metaOf(page), level: levelOf(page, userId) } : null;
    }
    const page = need(ws, userId, id.slice(0, dot), level);
    if (!page || page.kind !== 'database') {
      if (page) denied(ws);
      return null;
    }
    const db = (await bodyOf(page.id)).db;
    const row = db && rowById(db, id.slice(dot + 1));
    if (!row || row.trashedAt !== undefined) {
      denied(ws);
      return null;
    }
    const meta: PageMeta = {
      ...metaOf(page),
      id,
      parentId: page.id,
      kind: 'page',
      title: titleOfRow(db, row),
      icon: row.icon ?? '',
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      editedBy: row.editedBy,
      editedAt: row.editedAt,
    };
    delete meta.publish;
    return { page, id, meta, level: levelOf(page, userId), row: { dbId: page.id } };
  }

  // Removes pages for good: open tabs are told, then the index entry, the cached body and the stored body go.
  function erase(ids: string[]): void {
    for (const id of ids) {
      const rowKeys = [...open.keys()].filter((k) => k.startsWith(`${id}.`));
      for (const key of [id, ...rowKeys]) {
        for (const ws of open.get(key) ?? []) deps.send(ws, { t: 'pageRevoked', id: key });
        open.delete(key);
      }
      // Rows of a database keep their own bodies; remove those too.
      const body = bodies.get(id);
      for (const r of body?.db?.rows ?? []) {
        bodies.delete(`${id}.${r.id}`);
        dirty.delete(`${id}.${r.id}`);
        void store.removeBody(`${id}.${r.id}`).catch(() => undefined);
      }
      delete index.pages[id];
      bodies.delete(id);
      dirty.delete(id);
      void store.removeBody(id).catch((err) => console.error('page delete failed:', err instanceof Error ? err.message : err));
    }
  }

  const openTabs = (id: string): Set<WebSocket> => {
    let tabs = open.get(id);
    if (!tabs) {
      tabs = new Set();
      open.set(id, tabs);
    }
    return tabs;
  };
  function broadcastToOpen(id: string, ev: ServerEvent, except?: WebSocket): void {
    for (const ws of open.get(id) ?? []) if (ws !== except) deps.send(ws, ev);
  }

  function edited(page: Page, userId: string): void {
    page.editedAt = now();
    page.editedBy = userId;
  }

  // ---- Inbox ----
  const inboxFor = (userId: string): InboxItem[] => (index.inbox[userId] ?? []).filter((i) => !i.archived);
  function notify(userId: string, item: Omit<InboxItem, 'id' | 'at'>): void {
    const who = deps.who(userId);
    if (!who || who.inactive || who.bot || userId === item.by) return;
    // A person only hears about pages they can open.
    const page = getPage(index.pages, item.pageId.split('.')[0]);
    if (!page || levelOf(page, userId) === 'none') return;
    const list = index.inbox[userId] ?? [];
    list.push({ ...item, id: newId(), at: now() });
    index.inbox[userId] = list.slice(-MAX_INBOX);
    touchIndex();
    sendUser(userId, { t: 'inbox', items: inboxFor(userId) });
  }

  // The collaboration module watches edits (for page history and mentions) through these.
  const hooks: Core['hooks'] = { beforeEdit: () => undefined, afterEdit: () => undefined };
  const core: Core = {
    deps, index, now, newId, spaces, levelOf, need, target, bodyOf, touchBody, touchIndex, metaOf, sendUser, syncNodes,
    broadcastToOpen, openTabs, edited, notify, erase, denied, hooks,
  };
  const extras: Handler[] = [createDbRuntime(core), createCollabRuntime(core)];

  // ---- Events ----
  async function handle(ws: WebSocket, userId: string, ev: ClientEvent): Promise<boolean> {
    if (!PAGE_EVENTS.has(ev.t)) {
      for (const h of extras) if (await h(ws, userId, ev)) return true;
      return false;
    }
    const who = deps.who(userId);
    if (!who) return true;

    switch (ev.t) {
      case 'pageCreate': {
        const tpl = typeof ev.template === 'string' ? templateFor(ev.template, newId) : null;
        const made = newPage(index.pages, {
          parentId: typeof ev.parentId === 'string' ? ev.parentId : null,
          shared: ev.shared === true,
          teamspaceId: placeIn(ev.teamspaceId),
          title: ev.title ?? tpl?.title,
          icon: cleanIcon(ev.icon ?? tpl?.icon),
          source: ev.source,
        }, who, newId(), now());
        if (typeof made === 'string') {
          deps.send(ws, { t: 'error', message: made });
          return true;
        }
        if (made.teamspaceId && made.teamspaceId !== GENERAL && !spaceAllows(made.teamspaceId, userId)) {
          deps.send(ws, { t: 'error', message: 'You can’t add pages to that teamspace.' });
          return true;
        }
        index.pages[made.id] = made;
        if (tpl) {
          bodies.set(made.id, { id: made.id, version: 1, blocks: tpl.blocks });
          touchBody(made.id);
        }
        touchIndex();
        syncNodes([made.id]);
        deps.send(ws, { t: 'pageCreated', id: made.id });
        return true;
      }
      case 'pageUpdate': {
        const page = need(ws, userId, ev.id, 'edit');
        if (!page || !ev.patch || typeof ev.patch !== 'object') return true;
        const p = ev.patch;
        // A locked page changes only by unlocking it, and that needs full access.
        const lockOnly = Object.keys(p).length === 1 && 'locked' in p;
        if ((page.locked && !lockOnly) || ('locked' in p && !atLeast(levelOf(page, userId), 'full'))) {
          deps.send(ws, { t: 'error', message: page.locked ? 'This page is locked.' : DENIED });
          return true;
        }
        if (typeof p.title === 'string') page.title = cleanTitle(p.title);
        if (typeof p.icon === 'string') page.icon = cleanIcon(p.icon);
        if (typeof p.cover === 'string') page.cover = cleanCover(p.cover);
        if (p.font === 'default' || p.font === 'serif' || p.font === 'mono') page.font = p.font;
        if (typeof p.smallText === 'boolean') page.smallText = p.smallText;
        if (typeof p.fullWidth === 'boolean') page.fullWidth = p.fullWidth;
        if (typeof p.locked === 'boolean') page.locked = p.locked;
        edited(page, userId);
        touchIndex();
        syncNodes([page.id]);
        broadcastToOpen(page.id, { t: 'pageMeta', page: metaOf(page) });
        return true;
      }
      case 'pageMove': {
        const page = need(ws, userId, ev.id, 'full');
        if (!page) return true;
        const parentId = typeof ev.parentId === 'string' ? ev.parentId : null;
        const target = parentId ? need(ws, userId, parentId, 'edit') : null;
        if (parentId && !target) return true;
        if (target?.locked || !canMove(index.pages, page.id, parentId) || (!parentId && who.role === 'guest')) {
          deps.send(ws, { t: 'error', message: 'You can’t move the page there.' });
          return true;
        }
        const teamspaceId = parentId ? null : placeIn(typeof ev.teamspaceId === 'string' ? ev.teamspaceId : undefined) ?? (ev.shared === true ? GENERAL : null);
        if (teamspaceId && teamspaceId !== GENERAL && !spaceAllows(teamspaceId, userId)) {
          deps.send(ws, { t: 'error', message: 'You can’t move pages into that teamspace.' });
          return true;
        }
        page.order = orderAfter(index.pages, parentId, teamspaceId, typeof ev.after === 'string' ? ev.after : null, page.id);
        page.parentId = parentId;
        page.teamspaceId = teamspaceId;
        edited(page, userId);
        touchIndex();
        syncNodes(subtree(index.pages, page.id));
        return true;
      }
      case 'pageTrash':
      case 'pageRestore': {
        const page = need(ws, userId, ev.id, 'full');
        if (!page) return true;
        const trash = ev.t === 'pageTrash';
        if (trash === (page.trashedAt !== undefined)) return true;
        if (trash) page.trashedAt = now();
        else delete page.trashedAt;
        edited(page, userId);
        touchIndex();
        syncNodes(subtree(index.pages, page.id));
        deps.audit(userId, trash ? 'page.trash' : 'page.restore', page.title || 'Untitled');
        return true;
      }
      case 'pageDelete': {
        const page = need(ws, userId, ev.id, 'full');
        if (!page) return true;
        if (page.trashedAt === undefined) {
          deps.send(ws, { t: 'error', message: 'Move the page to the trash before deleting it for good.' });
          return true;
        }
        const ids = subtree(index.pages, page.id);
        // Rows of a database being erased need the body in memory to find their own bodies.
        for (const id of ids) if (index.pages[id]?.kind === 'database') await bodyOf(id);
        erase(ids);
        for (const [uid, list] of Object.entries(index.favorites)) index.favorites[uid] = list.filter((f) => !ids.includes(f));
        touchIndex();
        syncNodes(ids);
        deps.audit(userId, 'page.delete', `${page.title || 'Untitled'} (${ids.length} pages)`);
        return true;
      }
      case 'pageDuplicate': {
        const page = need(ws, userId, ev.id, 'view');
        if (!page || page.trashedAt !== undefined) return true;
        const ids = subtree(index.pages, page.id);
        if (ids.length > MAX_DUPLICATE) {
          deps.send(ws, { t: 'error', message: `That page has too many sub-pages to duplicate at once (limit ${MAX_DUPLICATE}).` });
          return true;
        }
        // Next to the original when the person may edit there, otherwise as a private page of their own.
        const parent = page.parentId ? getPage(index.pages, page.parentId) : undefined;
        const sameSpot = parent ? atLeast(levelOf(parent, userId), 'edit') : page.teamspaceId !== null && atLeast(levelOf(page, userId), 'edit') && who.role !== 'guest';
        const made = new Map<string, string>();
        for (const id of ids) made.set(id, newId());
        const t = now();
        for (const id of ids) {
          const src = index.pages[id];
          if (levelOf(src, userId) === 'none') continue;
          const root = id === page.id;
          const copy: Page = {
            ...src,
            id: made.get(id)!,
            parentId: root ? (sameSpot ? page.parentId : null) : made.get(src.parentId ?? '') ?? null,
            teamspaceId: root ? (sameSpot ? page.teamspaceId : null) : null,
            title: root ? cleanTitle(`${src.title || 'Untitled'} (copy)`) : src.title,
            order: root ? nextOrder(index.pages, sameSpot ? page.parentId : null, sameSpot ? page.teamspaceId : null) : src.order,
            createdBy: userId,
            createdAt: t,
            editedBy: userId,
            editedAt: t,
            locked: false,
            access: { entries: [] },
          };
          delete copy.trashedAt;
          delete copy.publish;
          delete copy.verified;
          index.pages[copy.id] = copy;
          const body = await bodyOf(id);
          const next: PageBody = { id: copy.id, version: 1, blocks: cloneBlocks(body.blocks, newId) };
          if (body.db) {
            // Rows are copied with new ids; relations to other databases are kept as they were.
            next.db = structuredClone(body.db);
            for (const r of next.db.rows) {
              const old = r.id;
              r.id = newId();
              const rb = await bodyOf(`${id}.${old}`);
              if (rb.blocks.length) {
                bodies.set(`${copy.id}.${r.id}`, { id: `${copy.id}.${r.id}`, version: 1, blocks: cloneBlocks(rb.blocks, newId) });
                touchBody(`${copy.id}.${r.id}`);
              }
            }
          }
          bodies.set(copy.id, next);
          touchBody(copy.id);
        }
        touchIndex();
        syncNodes([...made.values()]);
        deps.send(ws, { t: 'pageCreated', id: made.get(page.id)! });
        return true;
      }
      case 'pageFavorite': {
        const page = need(ws, userId, ev.id, 'view');
        if (!page) return true;
        const list = (index.favorites[userId] ?? []).filter((id) => id !== page.id);
        if (ev.on === true) list.push(page.id);
        index.favorites[userId] = list.slice(-100);
        touchIndex();
        sendUser(userId, { t: 'pageFavorites', list: favoritesFor(userId) });
        return true;
      }
      case 'pageGet': {
        const t = await target(ws, userId, ev.id, 'view');
        if (!t) return true;
        const body = await bodyOf(t.id);
        // Access may have changed while the body loaded.
        const level = levelOf(t.page, userId);
        if (level === 'none') {
          denied(ws);
          return true;
        }
        openTabs(t.id).add(ws);
        const comments = (body.comments ?? []).slice(-500);
        deps.send(ws, { t: 'pageBody', id: t.id, page: t.meta, level, blocks: body.blocks, version: body.version, comments });
        return true;
      }
      case 'pageClose': {
        if (typeof ev.id === 'string') open.get(ev.id)?.delete(ws);
        return true;
      }
      case 'blockOps': {
        const t = await target(ws, userId, ev.id, 'edit');
        if (!t) return true;
        const page = t.page;
        if (page.locked || page.trashedAt !== undefined) {
          deps.send(ws, { t: 'error', message: page.locked ? 'This page is locked.' : 'This page is in the trash.' });
          return true;
        }
        if (!Array.isArray(ev.ops) || ev.ops.length === 0 || ev.ops.length > MAX_OPS || JSON.stringify(ev.ops).length > MAX_OPS_BYTES) {
          deps.send(ws, { t: 'error', message: 'That edit was too large to save.' });
          return true;
        }
        const body = await bodyOf(t.id);
        if (levelOf(page, userId) === 'none' || page.locked || page.trashedAt !== undefined) return true;
        // History keeps the text from before this edit if the last snapshot is old.
        hooks.beforeEdit(page, body, userId);
        const res = applyOps(body, ev.ops);
        if (res.applied.length) {
          if (t.row) {
            const dbBody = await bodyOf(t.row.dbId);
            const row = dbBody.db && rowById(dbBody.db, t.id.split('.')[1]);
            if (row) {
              row.editedAt = now();
              row.editedBy = userId;
              touchBody(t.row.dbId);
            }
          } else {
            edited(page, userId);
            touchIndex();
          }
          touchBody(t.id);
          broadcastToOpen(t.id, { t: 'blockOps', id: t.id, ops: res.applied, version: body.version, by: userId }, ws);
          // The sender already has these edits; its copy only needs the revisions and version the server chose.
          deps.send(ws, { t: 'blockOps', id: t.id, ops: res.applied, version: body.version, by: userId, ack: true });
          hooks.afterEdit(page, t.id, body, userId, res.applied);
        }
        for (const block of res.conflicts) deps.send(ws, { t: 'blockConflict', id: t.id, block });
        if (res.rejected) deps.send(ws, { t: 'error', message: `${res.rejected} change${res.rejected === 1 ? ' was' : 's were'} not saved.` });
        return true;
      }
      case 'pagePresence': {
        const key = typeof ev.id === 'string' ? ev.id : '';
        if (!open.get(key)?.has(ws)) return true;
        const cursor = typeof ev.cursor === 'string' && ev.cursor.length <= 64 ? ev.cursor : null;
        broadcastToOpen(key, { t: 'pagePresence', id: key, userId, cursor }, ws);
        return true;
      }
    }
    return true;
  }

  // A teamspace id from the client, or null when none was asked for (or it does not exist).
  function placeIn(id: unknown): string | undefined {
    if (typeof id !== 'string') return undefined;
    return id === GENERAL || Object.hasOwn(index.teamspaces, id) ? id : undefined;
  }
  // May this person add pages to the teamspace? Members and owners do; admins may in any teamspace that is not private.
  function spaceAllows(id: string, userId: string): boolean {
    const space = Object.hasOwn(index.teamspaces, id) ? index.teamspaces[id] : undefined;
    if (!space) return false;
    const role = deps.who(userId)?.role;
    return !!space.members[userId] || (space.kind !== 'private' && (role === 'owner' || role === 'admin'));
  }

  function favoritesFor(userId: string): string[] {
    const who = deps.who(userId);
    return (index.favorites[userId] ?? []).filter((id) => {
      const page = getPage(index.pages, id);
      return !!page && nodeFor(index.pages, page, who, spaces()) !== null;
    });
  }

  // A tab went away.
  function drop(ws: WebSocket): void {
    for (const tabs of open.values()) tabs.delete(ws);
  }

  // Erases what a deleted account owned: its private pages go, its other pages stay credited to `ghost`.
  function forget(userId: string, ghost: string): void {
    const doomed = Object.values(index.pages).filter((p) => p.createdBy === userId && p.parentId === null && p.teamspaceId === null);
    const ids = new Set(doomed.flatMap((p) => subtree(index.pages, p.id)));
    erase([...ids]);
    for (const page of Object.values(index.pages)) {
      if (page.createdBy === userId) page.createdBy = ghost;
      if (page.editedBy === userId) page.editedBy = ghost;
      page.access.entries = page.access.entries.filter((e) => !(e.who.kind === 'user' && e.who.id === userId));
    }
    for (const space of Object.values(index.teamspaces)) delete space.members[userId];
    delete index.favorites[userId];
    delete index.inbox[userId];
    touchIndex();
    syncNodes([...ids]);
  }

  return {
    handle,
    flush,
    drop,
    forget,
    nodesFor: (userId: string): PageNode[] => visibleNodes(index.pages, deps.who(userId), spaces()),
    favoritesFor,
    inboxFor,
    teamspacesFor: (userId: string): Teamspace[] => visibleSpaces(core, userId),
    // A person's role or membership changed: what they may see did too.
    resync: (userId: string): void => {
      const who = deps.who(userId);
      const nodes = visibleNodes(index.pages, who, spaces());
      sendUser(userId, { t: 'pageNodes', nodes, gone: Object.keys(index.pages).filter((id) => !nodes.some((n) => n.id === id)) });
    },
    // For a signed-out reader of a published page.
    published: async (token: string): Promise<{ page: Page; blocks: Block[]; db?: PageBody['db'] } | null> => {
      const page = Object.values(index.pages).find((p) => p.publish?.token === token && p.trashedAt === undefined);
      if (!page) return null;
      const body = await bodyOf(page.id);
      return { page, blocks: body.blocks, db: body.db };
    },
    core,
  };
}

export type PageRuntime = ReturnType<typeof createPageRuntime>;
