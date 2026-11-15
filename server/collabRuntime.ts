// Working together on pages: sharing, comments, page history, verification, publishing, teamspaces,
// the inbox and search. Every event checks the person's level on the page first (see pages.ts).
import { randomBytes } from 'node:crypto';
import type { Block, BlockOp, Page, PageComment, PageShare, SearchHit, Teamspace, ClientEvent } from '../src/types.ts';
import { GENERAL, applyOps, atLeast, cleanRich, getPage, nodeFor, plainText, subtree, type PageBody } from './pages.ts';
import type { Core, Handler } from './pageCore.ts';
import { titleOfRow } from './dbRuntime.ts';
import { cleanUpload } from './files.ts';

const COLLAB_EVENTS = new Set<string>([
  'pageUpload', 'unfurl', 'pageAccess', 'pageRequestAccess', 'suggest', 'suggestResolve', 'pageShare', 'comment', 'commentResolve', 'commentDelete', 'pageHistory', 'pageRestoreVersion', 'pageVerify',
  'pagePublish', 'teamspace', 'search', 'inboxRead', 'inboxArchive',
]);
const MAX_COMMENTS = 500;
const MAX_SHARES = 200;
const MAX_VERSIONS = 25;
const SNAPSHOT_EVERY_MS = 10 * 60_000;
const MAX_SNAPSHOT_BYTES = 400_000;
const MAX_SPACES = 50;
const MAX_SEARCH_LOADS = 400;
const LEVELS = new Set(['view', 'comment', 'edit-content', 'edit', 'full']);
const MENTION = /@\[([A-Za-z0-9_-]{1,64})\]/g;

// The teamspaces a person can see: the default one, open and closed ones, and private ones they belong to.
export function visibleSpaces(core: Core, userId: string): Teamspace[] {
  const who = core.deps.who(userId);
  if (!who || who.inactive) return [];
  const guest = who.role === 'guest';
  const out: Teamspace[] = [];
  if (!guest) out.push({ id: GENERAL, name: core.deps.workspaceName() || 'General', icon: '🏢', description: 'Everyone in the workspace', kind: 'default', members: {} });
  for (const s of Object.values(core.index.teamspaces)) {
    if (s.members[userId] || (!guest && s.kind !== 'private')) out.push(s);
  }
  return out;
}

function mentionsIn(blocks: Block[]): string[] {
  const out: string[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      for (const r of b.text) if (r.mention?.kind === 'user') out.push(r.mention.id);
      walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

export function createCollabRuntime(core: Core): Handler {
  const { index } = core;
  const texts = new Map<string, { version: number; text: string }>();
  // Access requests already sent (one per person per page until restart).
  const asked = new Set<string>();
  // Link previews already fetched, kept for an hour.
  const previews = new Map<string, { at: number; value: import('../src/types.ts').LinkPreview | null }>();

  function pushSpaces(): void {
    for (const [ws, uid] of core.deps.clients()) core.deps.send(ws, { t: 'teamspaces', list: visibleSpaces(core, uid) });
  }
  // Re-sync the tree for everything that lives in a teamspace.
  function resyncSpace(id: string): void {
    const ids = Object.values(index.pages).filter((p) => p.teamspaceId === id && p.parentId === null).flatMap((p) => subtree(index.pages, p.id));
    if (ids.length) core.syncNodes(ids);
  }
  const spaceOf = (id: unknown): Teamspace | undefined => (typeof id === 'string' && Object.hasOwn(index.teamspaces, id) ? index.teamspaces[id] : undefined);

  // ---- History and mentions ride on the edit hooks ----
  core.hooks.beforeEdit = (page, body, userId) => {
    const last = body.versions?.[body.versions.length - 1];
    if (last && core.now() - last.at < SNAPSHOT_EVERY_MS) return;
    if (!body.blocks.length) return;
    const json = JSON.stringify(body.blocks);
    if (json.length > MAX_SNAPSHOT_BYTES) return;
    const versions = body.versions ?? (body.versions = []);
    versions.push({ id: core.newId(), at: core.now(), by: page.editedBy || userId, title: page.title, blocks: JSON.parse(json) as Block[] });
    if (versions.length > MAX_VERSIONS) versions.splice(0, versions.length - MAX_VERSIONS);
  };
  core.hooks.afterEdit = (page, id, _body, userId, ops: BlockOp[]) => {
    const named = new Set<string>();
    const texts: Block[] = [];
    for (const op of ops) {
      if (op.op === 'insert') texts.push(op.block);
      else if (op.op === 'update' && op.patch.text) texts.push({ id: op.id, type: 'text', text: op.patch.text, children: [], rev: 0 });
    }
    for (const m of mentionsIn(texts)) named.add(m);
    // A date with a time, mentioned in the text, is a reminder for the person who wrote it.
    const walk = (list: Block[]) => {
      for (const b of list) {
        for (const r of b.text) {
          const m = r.mention?.kind === 'date' ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(r.mention.id) : null;
          const at = m ? Date.parse(`${m[1]}T${m[2]}:00Z`) : NaN;
          if (!Number.isFinite(at) || at <= core.now() || at > core.now() + 366 * 86_400_000) continue;
          const mine = index.reminders.filter((x) => x.userId === userId);
          if (mine.length >= 200 || mine.some((x) => x.pageId === id && x.at === at)) continue;
          index.reminders.push({ id: core.newId(), userId, pageId: id, at, text: page.title || 'Untitled' });
          core.touchIndex();
        }
        walk(b.children);
      }
    };
    walk(texts);
    for (const uid of named) {
      const recent = (index.inbox[uid] ?? []).some((i) => i.kind === 'mention' && i.pageId === id && i.by === userId && !i.read && core.now() - i.at < 30 * 60_000);
      if (!recent) core.notify(uid, { kind: 'mention', pageId: id, by: userId, text: page.title || 'Untitled' });
    }
  };

  // ---- Search ----
  async function textOf(page: Page): Promise<string> {
    const cached = texts.get(page.id);
    const body = await core.bodyOf(page.id);
    if (cached && cached.version === body.version) return cached.text;
    let text = plainText(body.blocks);
    if (body.db) {
      for (const r of body.db.rows) {
        if (r.trashedAt !== undefined) continue;
        text += `\n${body.db.props.filter((p) => ['title', 'text', 'url', 'email', 'phone', 'place'].includes(p.type)).map((p) => (typeof r.props[p.id] === 'string' ? r.props[p.id] : '')).join(' ')}`;
      }
    }
    texts.set(page.id, { version: body.version, text });
    if (texts.size > 3000) texts.delete(texts.keys().next().value as string);
    return text;
  }
  const snippet = (text: string, q: string): string => {
    const at = text.toLowerCase().indexOf(q);
    if (at < 0) return text.slice(0, 120).replace(/\s+/g, ' ');
    const from = Math.max(0, at - 40);
    return `${from > 0 ? '…' : ''}${text.slice(from, at + q.length + 80).replace(/\s+/g, ' ')}`;
  };

  async function search(userId: string, raw: string): Promise<SearchHit[]> {
    const q = raw.trim().toLowerCase().slice(0, 100);
    if (!q) return [];
    const who = core.deps.who(userId);
    const hits: SearchHit[] = [];
    let loads = 0;
    for (const page of Object.values(index.pages)) {
      const node = nodeFor(index.pages, page, who, core.spaces());
      if (!node || node.trashed) continue;
      const title = (page.title || '').toLowerCase();
      let score = title === q ? 120 : title.startsWith(q) ? 100 : title.includes(q) ? 70 : 0;
      let text = '';
      if (texts.has(page.id) || loads < MAX_SEARCH_LOADS) {
        if (!texts.has(page.id)) loads += 1;
        text = await textOf(page);
        const n = text.toLowerCase().split(q).length - 1;
        if (n > 0) score += Math.min(30, 10 + n * 3);
      }
      if (score > 0) {
        hits.push({ id: page.id, kind: page.kind === 'database' ? 'database' : 'page', title: page.title || 'Untitled', icon: page.icon, snippet: snippet(text, q), parentId: page.parentId, editedAt: page.editedAt, score });
      }
      // Rows of a database show up on their own.
      if (page.kind === 'database') {
        const db = (await core.bodyOf(page.id)).db;
        for (const r of db?.rows ?? []) {
          if (r.trashedAt !== undefined || !db) continue;
          const t = titleOfRow(db, r);
          const rs = t.toLowerCase().includes(q) ? (t.toLowerCase().startsWith(q) ? 90 : 60) : 0;
          if (rs) hits.push({ id: `${page.id}.${r.id}`, kind: 'row', title: t || 'Untitled', icon: r.icon ?? '', snippet: page.title || 'Untitled', parentId: page.id, editedAt: r.editedAt, score: rs });
        }
      }
    }
    return hits.sort((a, b) => b.score - a.score || b.editedAt - a.editedAt).slice(0, 30);
  }

  const cleanShares = (raw: unknown): PageShare[] | null => {
    if (!Array.isArray(raw) || raw.length > MAX_SHARES) return null;
    const people = core.deps.people();
    const out: PageShare[] = [];
    for (const e of raw as unknown[]) {
      if (!e || typeof e !== 'object') return null;
      const { who, level } = e as { who?: { kind?: string; id?: unknown }; level?: unknown };
      if (typeof level !== 'string' || !LEVELS.has(level) || !who) return null;
      const lv = level as PageShare['level'];
      if (who.kind === 'workspace') out.push({ who: { kind: 'workspace' }, level: lv });
      else if (who.kind === 'user' && typeof who.id === 'string' && Object.hasOwn(people, who.id)) out.push({ who: { kind: 'user', id: who.id }, level: lv });
      else if (who.kind === 'group' && typeof who.id === 'string' && who.id.length > 0 && who.id.length <= 64) out.push({ who: { kind: 'group', id: who.id }, level: lv });
    }
    // One entry per person or group; the highest level wins.
    const rank = { view: 1, comment: 2, 'edit-content': 3, edit: 4, full: 5 } as const;
    const merged = new Map<string, PageShare>();
    for (const e of out) {
      const key = e.who.kind === 'workspace' ? 'w' : `${e.who.kind}:${(e.who as { id: string }).id}`;
      const had = merged.get(key);
      if (!had || rank[e.level] > rank[had.level]) merged.set(key, e);
    }
    return [...merged.values()];
  };

  function sendComments(id: string, body: PageBody): void {
    core.broadcastToOpen(id, { t: 'comments', id, comments: (body.comments ?? []).slice(-MAX_COMMENTS) });
  }

  return async (ws, userId, ev: ClientEvent) => {
    if (!COLLAB_EVENTS.has(ev.t)) return false;
    const who = core.deps.who(userId);
    if (!who) return true;

    switch (ev.t) {
      case 'pageUpload': {
        const t = await core.target(ws, userId, ev.id, 'edit');
        if (!t) return true;
        const file = cleanUpload(ev.file);
        if (!file || !core.deps.offload || typeof ev.blockId !== 'string' || ev.blockId.length > 64) {
          core.deps.send(ws, { t: 'error', message: file ? 'File uploads aren’t set up on this server. Paste a link instead.' : 'That file couldn’t be uploaded (limit 10 MB).' });
          return true;
        }
        try {
          const stored = await core.deps.offload(file);
          if (!stored.url) throw new Error('no url');
          core.deps.send(ws, { t: 'pageUploaded', id: t.id, blockId: ev.blockId, url: stored.url, name: stored.name });
        } catch {
          core.deps.send(ws, { t: 'error', message: 'The upload failed. Try again, or paste a link.' });
        }
        return true;
      }
      case 'unfurl': {
        const url = typeof ev.url === 'string' && ev.url.length <= 2000 && /^https?:[/][/]/i.test(ev.url) ? ev.url : '';
        if (!url || !core.deps.unfurl) return true;
        const hit = previews.get(url);
        let value = hit && core.now() - hit.at < 3_600_000 ? hit.value : undefined;
        if (value === undefined) {
          value = await core.deps.unfurl(url).catch(() => null);
          if (previews.size > 500) previews.clear();
          previews.set(url, { at: core.now(), value });
        }
        core.sendUser(userId, { t: 'linkPreview', url, preview: value });
        return true;
      }
      case 'pageRequestAccess': {
        // The same quiet answer whether or not the page exists, so ids can't be probed.
        const page = getPage(index.pages, ev.id);
        const key = `${userId}:${typeof ev.id === 'string' ? ev.id : ''}`;
        if (page && core.levelOf(page, userId) === 'none' && who.role !== 'guest' && !asked.has(key) && asked.size < 5000) {
          asked.add(key);
          const holders = new Set<string>([page.createdBy]);
          for (const uid of Object.keys(core.deps.people())) if (core.levelOf(page, uid) === 'full') holders.add(uid);
          for (const uid of [...holders].slice(0, 20)) core.notify(uid, { kind: 'request', pageId: page.id, by: userId, text: page.title || 'Untitled' });
        }
        core.deps.send(ws, { t: 'error', message: 'If that page exists, its owners have been asked.' });
        return true;
      }
      case 'suggest': {
        const t = await core.target(ws, userId, ev.id, 'comment');
        if (!t) return true;
        const body = await core.bodyOf(t.id);
        const text = cleanRich(ev.text);
        const find = (list: Block[]): Block | undefined => { for (const b of list) { if (b.id === ev.blockId) return b; const x = find(b.children); if (x) return x; } return undefined; };
        const block = typeof ev.blockId === 'string' ? find(body.blocks) : undefined;
        const list = body.suggestions ?? (body.suggestions = []);
        if (!block || !text || list.length >= 200) {
          core.deps.send(ws, { t: 'error', message: 'That suggestion couldn’t be saved.' });
          return true;
        }
        list.push({ id: core.newId(), blockId: block.id, by: userId, at: core.now(), was: block.text.map((r) => r.t).join(''), text });
        body.version += 1;
        core.touchBody(t.id);
        core.broadcastToOpen(t.id, { t: 'suggestions', id: t.id, suggestions: list });
        core.notify(t.page.createdBy, { kind: 'suggestion', pageId: t.id, by: userId, text: t.meta.title || 'Untitled' });
        return true;
      }
      case 'suggestResolve': {
        const t = await core.target(ws, userId, ev.id, 'comment');
        if (!t) return true;
        const body = await core.bodyOf(t.id);
        const s = body.suggestions?.find((x) => x.id === ev.suggestionId);
        if (!s) return true;
        // Anyone may withdraw their own; accepting or rejecting others' needs edit access.
        const canJudge = atLeast(core.levelOf(t.page, userId), 'edit') && !t.page.locked;
        if (!(canJudge || (s.by === userId && ev.accept !== true))) return core.denied(ws), true;
        if (ev.accept === true) {
          const cur = (function find(list: Block[]): Block | undefined { for (const b of list) { if (b.id === s.blockId) return b; const x = find(b.children); if (x) return x; } return undefined; })(body.blocks);
          if (cur) {
            const res = applyOps(body, [{ op: 'update', id: cur.id, patch: { text: s.text }, baseRev: cur.rev }]);
            for (const op of res.applied) {
              core.broadcastToOpen(t.id, { t: 'blockOps', id: t.id, ops: [op], version: body.version, by: userId });
            }
            if (!t.row) core.edited(t.page, userId);
          }
        }
        body.suggestions = (body.suggestions ?? []).filter((x) => x.id !== s.id);
        body.version += 1;
        core.touchBody(t.id);
        core.touchIndex();
        core.broadcastToOpen(t.id, { t: 'suggestions', id: t.id, suggestions: body.suggestions });
        if (s.by !== userId) core.notify(s.by, { kind: 'suggestion', pageId: t.id, by: userId, text: `${ev.accept === true ? 'Accepted' : 'Declined'}: ${t.meta.title || 'Untitled'}` });
        return true;
      }
      case 'pageAccess': {
        const page = core.need(ws, userId, ev.id, 'full');
        if (page) core.deps.send(ws, { t: 'pageAccess', id: page.id, access: page.access });
        return true;
      }
      case 'pageShare': {
        const page = core.need(ws, userId, ev.id, 'full');
        if (!page) return true;
        let entries = cleanShares(ev.entries);
        if (entries && core.deps.barred) {
          // Nobody may be connected to the page's creator across an information barrier.
          const barred = core.deps.barred;
          const before = entries.length;
          entries = entries.filter((e) => {
            if (e.who.kind === 'user') return !barred(page.createdBy, e.who.id);
            if (e.who.kind === 'group') return !(core.deps.groupMembers?.(e.who.id) ?? []).some((m) => barred(page.createdBy, m));
            return true;
          });
          if (entries.length < before) core.deps.send(ws, { t: 'error', message: 'Some people couldn’t be added because of an information barrier.' });
        }
        if (!entries) {
          core.deps.send(ws, { t: 'error', message: 'That share list isn’t valid.' });
          return true;
        }
        const had = new Set(page.access.entries.filter((e) => e.who.kind === 'user').map((e) => (e.who as { id: string }).id));
        page.access = { entries, ...(ev.restricted === true ? { restricted: true } : {}) };
        core.edited(page, userId);
        core.touchIndex();
        core.syncNodes(subtree(index.pages, page.id));
        for (const e of entries) {
          if (e.who.kind === 'user' && !had.has(e.who.id)) core.notify(e.who.id, { kind: 'share', pageId: page.id, by: userId, text: `${page.title || 'Untitled'} — ${e.level === 'view' ? 'can view' : e.level === 'comment' ? 'can comment' : e.level === 'edit' ? 'can edit' : 'full access'}` });
        }
        for (const [tab, uid] of core.deps.clients()) {
          if (core.openTabs(page.id).has(tab) && atLeast(core.levelOf(page, uid), 'full')) core.deps.send(tab, { t: 'pageAccess', id: page.id, access: page.access });
        }
        core.deps.send(ws, { t: 'pageAccess', id: page.id, access: page.access });
        core.deps.audit(userId, 'page.share', `${page.title || 'Untitled'} (${entries.length} entries${page.access.restricted ? ', restricted' : ''})`);
        return true;
      }
      case 'comment': {
        const t = await core.target(ws, userId, ev.id, 'comment');
        if (!t) return true;
        const text = typeof ev.text === 'string' ? ev.text.trim().slice(0, 2000) : '';
        if (!text) return true;
        const body = await core.bodyOf(t.id);
        const list = body.comments ?? (body.comments = []);
        const parent = typeof ev.parent === 'string' ? list.find((c) => c.id === ev.parent && !c.parent) : undefined;
        if (list.length >= MAX_COMMENTS) {
          core.deps.send(ws, { t: 'error', message: `A page can have up to ${MAX_COMMENTS} comments.` });
          return true;
        }
        const c: PageComment = {
          id: core.newId(),
          by: userId,
          at: core.now(),
          text,
          ...(parent ? { parent: parent.id, ...(parent.blockId ? { blockId: parent.blockId } : {}) } : typeof ev.blockId === 'string' && ev.blockId.length <= 64 ? { blockId: ev.blockId } : {}),
        };
        list.push(c);
        body.version += 1;
        core.touchBody(t.id);
        sendComments(t.id, body);
        const heard = new Set<string>();
        for (const m of text.matchAll(MENTION)) {
          heard.add(m[1]);
          core.notify(m[1], { kind: 'mention', pageId: t.id, by: userId, text });
        }
        if (parent && !heard.has(parent.by)) core.notify(parent.by, { kind: 'reply', pageId: t.id, by: userId, text });
        if (!heard.has(t.page.createdBy) && t.page.createdBy !== parent?.by) core.notify(t.page.createdBy, { kind: 'comment', pageId: t.id, by: userId, text });
        return true;
      }
      case 'commentResolve':
      case 'commentDelete': {
        const t = await core.target(ws, userId, ev.id, 'comment');
        if (!t) return true;
        const body = await core.bodyOf(t.id);
        const c = body.comments?.find((x) => x.id === ev.commentId);
        if (!c) return true;
        if (ev.t === 'commentResolve') {
          const root = c.parent ? body.comments?.find((x) => x.id === c.parent) ?? c : c;
          if (ev.on) root.resolved = true;
          else delete root.resolved;
        } else {
          if (c.by !== userId && !atLeast(core.levelOf(t.page, userId), 'full')) {
            core.denied(ws);
            return true;
          }
          body.comments = (body.comments ?? []).filter((x) => x.id !== c.id && x.parent !== c.id);
        }
        body.version += 1;
        core.touchBody(t.id);
        sendComments(t.id, body);
        return true;
      }
      case 'pageHistory': {
        const t = await core.target(ws, userId, ev.id, 'edit');
        if (!t) return true;
        const body = await core.bodyOf(t.id);
        const versions = [...(body.versions ?? [])].reverse();
        const preview = typeof ev.versionId === 'string' ? versions.find((v) => v.id === ev.versionId) : undefined;
        core.deps.send(ws, {
          t: 'pageHistory',
          id: t.id,
          versions: versions.map(({ id, at, by, title }) => ({ id, at, by, title })),
          ...(preview ? { preview: { id: preview.id, blocks: preview.blocks } } : {}),
        });
        return true;
      }
      case 'pageRestoreVersion': {
        const t = await core.target(ws, userId, ev.id, 'edit');
        if (!t || t.page.locked) return true;
        const body = await core.bodyOf(t.id);
        const v = body.versions?.find((x) => x.id === ev.versionId);
        if (!v) return true;
        // What is there now is kept as a version first, so a restore can be undone.
        const now = JSON.stringify(body.blocks);
        if (now.length <= MAX_SNAPSHOT_BYTES) {
          (body.versions ??= []).push({ id: core.newId(), at: core.now(), by: userId, title: t.meta.title, blocks: JSON.parse(now) as Block[] });
          if (body.versions.length > MAX_VERSIONS) body.versions.splice(0, body.versions.length - MAX_VERSIONS);
        }
        body.blocks = JSON.parse(JSON.stringify(v.blocks)) as Block[];
        body.version += 1;
        core.touchBody(t.id);
        if (!t.row) {
          core.edited(t.page, userId);
          core.touchIndex();
        }
        for (const tab of core.openTabs(t.id)) {
          core.deps.send(tab, { t: 'pageBody', id: t.id, page: t.meta, level: core.levelOf(t.page, [...core.deps.clients()].find(([w]) => w === tab)?.[1] ?? userId), blocks: body.blocks, version: body.version, comments: body.comments ?? [], suggestions: body.suggestions ?? [] });
        }
        core.deps.audit(userId, 'page.restoreVersion', t.meta.title || 'Untitled');
        return true;
      }
      case 'pageVerify': {
        const page = core.need(ws, userId, ev.id, 'full');
        if (!page) return true;
        const days = typeof ev.days === 'number' && Number.isFinite(ev.days) ? Math.floor(ev.days) : 0;
        if (days <= 0) delete page.verified;
        else page.verified = { by: userId, until: core.now() + Math.min(days, 365) * 86_400_000 };
        core.edited(page, userId);
        core.touchIndex();
        core.broadcastToOpen(page.id, { t: 'pageMeta', page: core.metaOf(page) });
        return true;
      }
      case 'pagePublish': {
        const page = core.need(ws, userId, ev.id, 'full');
        if (!page) return true;
        if (ev.on === true) {
          page.publish = { token: page.publish?.token ?? `${core.deps.workspaceId}.${randomBytes(18).toString('base64url')}`, at: page.publish?.at ?? core.now(), duplicate: ev.duplicate === true };
        } else delete page.publish;
        core.edited(page, userId);
        core.touchIndex();
        core.syncNodes([page.id]);
        core.broadcastToOpen(page.id, { t: 'pageMeta', page: core.metaOf(page) });
        core.deps.audit(userId, ev.on === true ? 'page.publish' : 'page.unpublish', page.title || 'Untitled');
        return true;
      }
      case 'teamspace': {
        const isAdmin = who.role === 'owner' || who.role === 'admin';
        const space = spaceOf(ev.id);
        const owns = !!space && space.members[userId] === 'owner';
        const manage = !!space && (owns || (isAdmin && space.kind !== 'private'));
        const fail = (message: string) => core.deps.send(ws, { t: 'error', message });
        const people = core.deps.people();
        const onlyOwner = (s: Teamspace, uid: string) => s.members[uid] === 'owner' && !Object.entries(s.members).some(([u, r]) => u !== uid && r === 'owner');
        if (ev.op === 'create') {
          if (who.role === 'guest') return fail('Guests can’t create teamspaces.'), true;
          if (Object.keys(index.teamspaces).length >= MAX_SPACES) return fail(`A workspace can have up to ${MAX_SPACES} teamspaces.`), true;
          const name = typeof ev.name === 'string' ? ev.name.trim().slice(0, 60) : '';
          if (!name) return fail('Give the teamspace a name.'), true;
          const id = core.newId();
          const kind = ev.kind === 'closed' || ev.kind === 'private' ? ev.kind : 'open';
          index.teamspaces[id] = { id, name, icon: typeof ev.icon === 'string' && ev.icon.length <= 16 && !/[<>"'&]/.test(ev.icon) ? ev.icon : '👥', description: typeof ev.description === 'string' ? ev.description.slice(0, 300) : '', kind, members: { [userId]: 'owner' } };
          core.touchIndex();
          pushSpaces();
          core.deps.audit(userId, 'teamspace.create', name);
          return true;
        }
        if (!space) return fail('That teamspace no longer exists.'), true;
        if (ev.op === 'update') {
          if (!manage) return core.denied(ws), true;
          if (typeof ev.name === 'string' && ev.name.trim()) space.name = ev.name.trim().slice(0, 60);
          if (typeof ev.icon === 'string' && ev.icon.length <= 16 && !/[<>"'&]/.test(ev.icon)) space.icon = ev.icon;
          if (typeof ev.description === 'string') space.description = ev.description.slice(0, 300);
          if (ev.kind === 'open' || ev.kind === 'closed' || ev.kind === 'private') space.kind = ev.kind;
        } else if (ev.op === 'delete') {
          if (!manage) return core.denied(ws), true;
          if (Object.values(index.pages).some((p) => p.teamspaceId === space.id)) return fail('Move or delete this teamspace’s pages first.'), true;
          delete index.teamspaces[space.id];
          core.deps.audit(userId, 'teamspace.delete', space.name);
        } else if (ev.op === 'join') {
          if (who.role === 'guest' || space.kind !== 'open') return fail('You can’t join that teamspace on your own.'), true;
          space.members[userId] = 'member';
        } else if (ev.op === 'leave') {
          if (!space.members[userId]) return true;
          if (onlyOwner(space, userId) && Object.keys(space.members).length > 1) return fail('Make someone else an owner before you leave.'), true;
          delete space.members[userId];
        } else if (ev.op === 'setMember') {
          if (!manage) return core.denied(ws), true;
          const uid = typeof ev.userId === 'string' ? ev.userId : '';
          if (!Object.hasOwn(people, uid) || core.deps.who(uid)?.role === 'guest') return fail('That person can’t join a teamspace.'), true;
          if (space.members[uid] === 'owner' && ev.role !== 'owner' && onlyOwner(space, uid)) return fail('A teamspace needs an owner.'), true;
          space.members[uid] = ev.role === 'owner' ? 'owner' : 'member';
          if (uid !== userId) core.notify(uid, { kind: 'share', pageId: '', by: userId, text: `You were added to ${space.name}` });
        } else if (ev.op === 'removeMember') {
          if (!manage) return core.denied(ws), true;
          const uid = typeof ev.userId === 'string' ? ev.userId : '';
          if (onlyOwner(space, uid) && Object.keys(space.members).length > 1) return fail('A teamspace needs an owner.'), true;
          delete space.members[uid];
        } else return true;
        core.touchIndex();
        pushSpaces();
        resyncSpace(space.id);
        return true;
      }
      case 'search': {
        const q = typeof ev.q === 'string' ? ev.q : '';
        core.sendUser(userId, { t: 'searchResults', q, hits: await search(userId, q) });
        return true;
      }
      case 'inboxRead':
      case 'inboxArchive': {
        const list = index.inbox[userId] ?? [];
        for (const item of list) {
          if (ev.id !== 'all' && item.id !== ev.id) continue;
          if (ev.t === 'inboxRead') item.read = true;
          else item.archived = true;
        }
        core.touchIndex();
        core.sendUser(userId, { t: 'inbox', items: list.filter((i) => !i.archived) });
        return true;
      }
    }
    return true;
  };
}

