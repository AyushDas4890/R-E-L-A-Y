// The page events of one workspace: tree changes, opening a page, block edits. The decisions
// (who may do what, how ops merge) live in pages.ts; this file only wires them to sockets and storage.
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ClientEvent, Page, PageLevel, PageMeta, PageNode, ServerEvent } from '../src/types.ts';
import {
  MAX_OPS, MAX_OPS_BYTES, GENERAL, applyOps, atLeast, canMove, cleanCover, cleanIcon, cleanTitle, cloneBlocks, getPage,
  levelFor, newPage, nextOrder, nodeFor, orderAfter, subtree, visibleNodes, type PageBody, type Who,
} from './pages.ts';
import type { PageStore, PagesIndex } from './pageStore.ts';

export interface PageDeps {
  store: PageStore;
  index: PagesIndex;
  // Every open tab and the person behind it.
  clients: () => Iterable<[WebSocket, string]>;
  who: (userId: string) => Who | undefined;
  send: (ws: WebSocket, ev: ServerEvent) => void;
  audit: (actor: string, action: string, detail: string) => void;
  now?: () => number;
  newId?: () => string;
}

const PAGE_EVENTS = new Set<string>([
  'pageCreate', 'pageUpdate', 'pageMove', 'pageTrash', 'pageRestore', 'pageDelete', 'pageDuplicate',
  'pageFavorite', 'pageGet', 'pageClose', 'blockOps', 'pagePresence',
]);
const DENIED = 'You don’t have access to that page.';
const MAX_CACHED_BODIES = 200;
const MAX_DUPLICATE = 200;

export function createPageRuntime(deps: PageDeps) {
  const { store, index } = deps;
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? randomUUID;
  const bodies = new Map<string, PageBody>();
  const loading = new Map<string, Promise<PageBody>>();
  const dirty = new Set<string>();
  // Page id -> the tabs that have it open.
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
  const levelOf = (page: Page, userId: string): PageLevel => levelFor(index.pages, page, deps.who(userId));
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
        const node = page ? nodeFor(index.pages, page, who) : null;
        if (node) nodes.push(node);
        else gone.push(id);
      }
      if (nodes.length || gone.length) deps.send(ws, { t: 'pageNodes', nodes, gone });
      for (const id of gone) {
        if (open.get(id)?.delete(ws)) deps.send(ws, { t: 'pageRevoked', id });
      }
    }
  }

  // The page as `userId` may use it, or an error to the tab and null.
  function need(ws: WebSocket, userId: string, id: unknown, level: PageLevel): Page | null {
    const page = getPage(index.pages, id);
    if (!page || !atLeast(levelOf(page, userId), level)) {
      deps.send(ws, { t: 'error', message: DENIED });
      return null;
    }
    return page;
  }

  // Removes pages for good: open tabs are told, then the index entry, the cached body and the stored body go.
  function erase(ids: string[]): void {
    for (const id of ids) {
      for (const ws of open.get(id) ?? []) deps.send(ws, { t: 'pageRevoked', id });
      open.delete(id);
      delete index.pages[id];
      bodies.delete(id);
      dirty.delete(id);
      void store.removeBody(id).catch((err) => console.error('page delete failed:', err instanceof Error ? err.message : err));
    }
  }

  function broadcastToOpen(id: string, ev: ServerEvent, except?: WebSocket): void {
    for (const ws of open.get(id) ?? []) if (ws !== except) deps.send(ws, ev);
  }

  function edited(page: Page, userId: string): void {
    page.editedAt = now();
    page.editedBy = userId;
  }

  // ---- Events ----
  async function handle(ws: WebSocket, userId: string, ev: ClientEvent): Promise<boolean> {
    if (!PAGE_EVENTS.has(ev.t)) return false;
    const who = deps.who(userId);
    if (!who) return true;

    switch (ev.t) {
      case 'pageCreate': {
        const made = newPage(index.pages, { parentId: typeof ev.parentId === 'string' ? ev.parentId : null, shared: ev.shared === true, title: ev.title, icon: cleanIcon(ev.icon) }, who, newId(), now());
        if (typeof made === 'string') {
          deps.send(ws, { t: 'error', message: made });
          return true;
        }
        index.pages[made.id] = made;
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
        const teamspaceId = parentId ? null : ev.shared === true ? GENERAL : null;
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
        const sameSpot = parent ? atLeast(levelOf(parent, userId), 'edit') : page.teamspaceId !== null && who.role !== 'guest';
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
          index.pages[copy.id] = copy;
          const body = await bodyOf(id);
          bodies.set(copy.id, { id: copy.id, version: 1, blocks: cloneBlocks(body.blocks, newId) });
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
        const page = need(ws, userId, ev.id, 'view');
        if (!page) return true;
        const body = await bodyOf(page.id);
        // Access may have changed while the body loaded.
        const level = levelOf(page, userId);
        if (level === 'none') {
          deps.send(ws, { t: 'error', message: DENIED });
          return true;
        }
        const tabs = open.get(page.id) ?? new Set<WebSocket>();
        tabs.add(ws);
        open.set(page.id, tabs);
        deps.send(ws, { t: 'pageBody', id: page.id, page: metaOf(page), level, blocks: body.blocks, version: body.version });
        return true;
      }
      case 'pageClose': {
        if (typeof ev.id === 'string') open.get(ev.id)?.delete(ws);
        return true;
      }
      case 'blockOps': {
        const page = need(ws, userId, ev.id, 'edit');
        if (!page) return true;
        if (page.locked) {
          deps.send(ws, { t: 'error', message: 'This page is locked.' });
          return true;
        }
        if (!Array.isArray(ev.ops) || ev.ops.length === 0 || ev.ops.length > MAX_OPS || JSON.stringify(ev.ops).length > MAX_OPS_BYTES) {
          deps.send(ws, { t: 'error', message: 'That edit was too large to save.' });
          return true;
        }
        const body = await bodyOf(page.id);
        if (levelOf(page, userId) === 'none' || page.locked || page.trashedAt !== undefined) return true;
        const res = applyOps(body, ev.ops);
        if (res.applied.length) {
          edited(page, userId);
          touchBody(page.id);
          touchIndex();
          broadcastToOpen(page.id, { t: 'blockOps', id: page.id, ops: res.applied, version: body.version, by: userId }, ws);
          // The sender already has these edits; its copy only needs the revisions and version the server chose.
          deps.send(ws, { t: 'blockOps', id: page.id, ops: res.applied, version: body.version, by: userId, ack: true });
        }
        for (const block of res.conflicts) deps.send(ws, { t: 'blockConflict', id: page.id, block });
        if (res.rejected) deps.send(ws, { t: 'error', message: `${res.rejected} change${res.rejected === 1 ? ' was' : 's were'} not saved.` });
        return true;
      }
      case 'pagePresence': {
        const page = getPage(index.pages, ev.id);
        if (!page || !open.get(page.id)?.has(ws)) return true;
        const cursor = typeof ev.cursor === 'string' && ev.cursor.length <= 64 ? ev.cursor : null;
        broadcastToOpen(page.id, { t: 'pagePresence', id: page.id, userId, cursor }, ws);
        return true;
      }
    }
    return true;
  }

  function favoritesFor(userId: string): string[] {
    const who = deps.who(userId);
    return (index.favorites[userId] ?? []).filter((id) => {
      const page = getPage(index.pages, id);
      return !!page && nodeFor(index.pages, page, who) !== null;
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
    delete index.favorites[userId];
    touchIndex();
    syncNodes([...ids]);
  }

  return {
    handle,
    flush,
    drop,
    forget,
    nodesFor: (userId: string): PageNode[] => visibleNodes(index.pages, deps.who(userId)),
    favoritesFor,
    // A person's role or membership changed: what they may see did too.
    resync: (userId: string): void => {
      const who = deps.who(userId);
      const nodes = visibleNodes(index.pages, who);
      sendUser(userId, { t: 'pageNodes', nodes, gone: Object.keys(index.pages).filter((id) => !nodes.some((n) => n.id === id)) });
    },
  };
}

export type PageRuntime = ReturnType<typeof createPageRuntime>;
