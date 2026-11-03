// Pure logic for pages: who may see what, the page tree, and block edits. No I/O, so it can be
// unit-tested in isolation (see docs/notion/plan.md for the model and the merge rule).
import type { Block, BlockOp, BlockPatch, BlockType, DbData, Page, PageComment, PageLevel, PageNode, Rich, Teamspace, User } from '../src/types.ts';

export const MAX_PAGES = 20_000;
export const MAX_BLOCKS = 5000;
export const MAX_TITLE = 200;
export const MAX_TEXT = 100_000;
export const MAX_DEPTH = 6;
export const MAX_OPS = 200;
export const MAX_OPS_BYTES = 256 * 1024;
export const GENERAL = 'general';

export const BLOCK_TYPES: readonly BlockType[] = [
  'text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'toggle', 'quote', 'callout', 'divider',
  'code', 'image', 'file', 'bookmark', 'table', 'columns', 'column', 'toc', 'breadcrumb',
  'pageLink', 'subpage', 'equation', 'database',
];

export type Pages = Record<string, Page>;
export interface Who { id: string; role?: User['role']; inactive?: boolean; bot?: boolean; groups?: string[] }
export interface StoredVersion { id: string; at: number; by: string; title: string; blocks: Block[] }
export interface PageBody {
  id: string;
  version: number;
  blocks: Block[];
  // Present when the page is a database: its schema, views and rows.
  db?: DbData;
  comments?: PageComment[];
  // The last few snapshots of the blocks, for page history.
  versions?: StoredVersion[];
}
export type Spaces = Record<string, Teamspace>;

const RANK: Record<PageLevel, number> = { none: 0, view: 1, comment: 2, edit: 3, full: 4 };
const LEVELS: PageLevel[] = ['none', 'view', 'comment', 'edit', 'full'];
export const atLeast = (have: PageLevel, need: PageLevel): boolean => RANK[have] >= RANK[need];

// Ids come from clients, so never read them off a plain object without checking it is an own key.
export function getPage(pages: Pages, id: unknown): Page | undefined {
  return typeof id === 'string' && Object.hasOwn(pages, id) ? pages[id] : undefined;
}

// The page and its ancestors, nearest first. Stops on a cycle or a missing parent.
function chain(pages: Pages, page: Page): Page[] {
  const up: Page[] = [];
  const seen = new Set<string>();
  let node: Page | undefined = page;
  while (node && !seen.has(node.id) && up.length < 64) {
    seen.add(node.id);
    up.push(node);
    node = node.parentId ? getPage(pages, node.parentId) : undefined;
  }
  return up;
}

export function isTrashed(pages: Pages, page: Page): boolean {
  return chain(pages, page).some((p) => p.trashedAt !== undefined);
}

// A person's level on a page.
// - A private top-level page (no teamspace) belongs to its creator alone, admins included.
// - Pages in a teamspace are editable by every non-guest member; admins and owners get full access.
// - Guests only get what was shared with them by name. Bots only ever view.
// - An explicit share applies down the tree until a page marks itself restricted.
// - A trashed page (or one under a trashed page) is visible only to people with full access.
export function levelFor(pages: Pages, page: Page, who: Who | undefined, spaces?: Spaces): PageLevel {
  if (!who || who.inactive) return 'none';
  const up = chain(pages, page);
  const guest = who.role === 'guest';
  let best = 0;
  let restricted = false;
  for (const node of up) {
    for (const e of node.access.entries) {
      if ((e.who.kind === 'user' && e.who.id === who.id) || (e.who.kind === 'workspace' && !guest) || (e.who.kind === 'group' && !!who.groups?.includes(e.who.id))) best = Math.max(best, RANK[e.level]);
    }
    if (node.access.restricted) {
      restricted = true;
      break;
    }
  }
  const ts = up[up.length - 1].teamspaceId;
  const space = ts !== null && ts !== GENERAL && spaces ? spaces[ts] : undefined;
  const admin = who.role === 'owner' || who.role === 'admin';
  if (ts !== null && ts !== GENERAL && spaces && !space) {
    // The teamspace is gone: only its pages' creators keep them.
    if (page.createdBy !== who.id) best = 0;
  } else if (space) {
    // Teamspaces other than the default: members edit, owners manage, and the kind decides what outsiders see.
    const mine = space.members[who.id];
    if (mine === 'owner') best = RANK.full;
    else if (mine && !restricted) best = Math.max(best, RANK.edit);
    else if (space.kind !== 'private' && admin) best = RANK.full;
    else if (space.kind === 'open' && !guest && !restricted) best = Math.max(best, RANK.view);
    else if (space.kind === 'private' && !mine && page.createdBy !== who.id) best = 0;
  } else if (ts !== null) {
    if (!guest && !restricted) best = Math.max(best, RANK.edit);
    if (admin) best = RANK.full;
  }
  if (page.createdBy === who.id && (!space || space.members[who.id] || space.kind === 'default')) best = RANK.full;
  if (who.bot) best = Math.min(best, RANK.view);
  if (up.some((p) => p.trashedAt !== undefined) && best < RANK.full) best = 0;
  return LEVELS[best];
}

// What the sidebar shows for one page, or null when this person may not see it. Pages under a
// trashed page are hidden; the trashed page itself shows (flagged) so it can be restored.
export function nodeFor(pages: Pages, page: Page, who: Who | undefined, spaces?: Spaces): PageNode | null {
  const level = levelFor(pages, page, who, spaces);
  if (level === 'none') return null;
  const up = chain(pages, page);
  if (up.slice(1).some((p) => p.trashedAt !== undefined)) return null;
  const node: PageNode = {
    id: page.id,
    parentId: page.parentId,
    teamspaceId: page.teamspaceId,
    title: page.title,
    icon: page.icon,
    order: page.order,
    createdBy: page.createdBy,
    editedAt: page.editedAt,
    level,
  };
  if (page.trashedAt !== undefined) node.trashed = true;
  if (page.kind === 'database') node.kind = 'database';
  if (page.source) node.source = page.source;
  if (page.publish) node.published = true;
  return node;
}

export function visibleNodes(pages: Pages, who: Who | undefined, spaces?: Spaces): PageNode[] {
  const out: PageNode[] = [];
  for (const page of Object.values(pages)) {
    const node = nodeFor(pages, page, who, spaces);
    if (node) out.push(node);
  }
  return out;
}

export function childrenIndex(pages: Pages): Map<string | null, Page[]> {
  const map = new Map<string | null, Page[]>();
  for (const page of Object.values(pages)) {
    const key = page.parentId && getPage(pages, page.parentId) ? page.parentId : null;
    const list = map.get(key);
    if (list) list.push(page);
    else map.set(key, [page]);
  }
  return map;
}

// The page and everything under it.
export function subtree(pages: Pages, id: string): string[] {
  const kids = childrenIndex(pages);
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const next = stack.pop()!;
    if (out.includes(next)) continue;
    out.push(next);
    for (const k of kids.get(next) ?? []) stack.push(k.id);
  }
  return out;
}

export function cleanTitle(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').slice(0, MAX_TITLE) : '';
}
// An emoji, or a short icon name. Anything longer is not an icon.
export function cleanIcon(v: unknown): string {
  return typeof v === 'string' && v.length <= 16 && !/[<>"'&]/.test(v) ? v : '';
}
// A built-in cover (`preset:<name>`) or an http(s) image.
export function cleanCover(v: unknown): string {
  if (typeof v !== 'string') return '';
  if (/^preset:[a-z0-9-]{1,24}$/.test(v)) return v;
  return v.length <= 2000 && /^https?:\/\//i.test(v) ? v : '';
}
const safeUrl = (v: unknown): string => (typeof v === 'string' && v.length <= 2000 && /^https?:\/\//i.test(v) ? v : '');

function siblings(pages: Pages, parentId: string | null, teamspaceId: string | null, except?: string): Page[] {
  return Object.values(pages).filter((p) => p.id !== except && p.parentId === parentId && (parentId !== null || p.teamspaceId === teamspaceId));
}

export const nextOrder = (pages: Pages, parentId: string | null, teamspaceId: string | null): number =>
  siblings(pages, parentId, teamspaceId).reduce((n, p) => Math.max(n, p.order), 0) + 1;

// A position just after `after` (or first when null / missing), between it and the next sibling.
export function orderAfter(pages: Pages, parentId: string | null, teamspaceId: string | null, after: string | null, except?: string): number {
  const list = siblings(pages, parentId, teamspaceId, except).sort((a, b) => a.order - b.order);
  if (after === null) return list.length ? list[0].order - 1 : 1;
  const i = list.findIndex((p) => p.id === after);
  if (i < 0) return (list.length ? list[list.length - 1].order : 0) + 1;
  return i === list.length - 1 ? list[i].order + 1 : (list[i].order + list[i + 1].order) / 2;
}

export interface NewPage { parentId: string | null; shared: boolean; teamspaceId?: string; title?: unknown; icon?: unknown; kind?: 'page' | 'database'; source?: unknown }

// Builds a page, or returns a reason it can't be made. `who` must be allowed to create where asked.
export function newPage(pages: Pages, input: NewPage, who: Who, id: string, now: number): Page | string {
  if (Object.keys(pages).length >= MAX_PAGES) return 'This workspace has reached its page limit.';
  let teamspaceId: string | null = null;
  if (input.parentId !== null) {
    const parent = getPage(pages, input.parentId);
    if (!parent || !atLeast(levelFor(pages, parent, who), 'edit') || parent.locked) return 'You can’t add pages there.';
    if (chain(pages, parent).length >= 30) return 'Pages can be nested up to 30 levels.';
  } else {
    if (who.role === 'guest') return 'Guests can’t create top-level pages.';
    teamspaceId = input.teamspaceId ?? (input.shared ? GENERAL : null);
  }
  return {
    id,
    parentId: input.parentId,
    teamspaceId,
    title: cleanTitle(input.title),
    icon: cleanIcon(input.icon),
    cover: '',
    font: 'default',
    smallText: false,
    fullWidth: false,
    locked: false,
    order: nextOrder(pages, input.parentId, teamspaceId),
    createdBy: who.id,
    createdAt: now,
    editedBy: who.id,
    editedAt: now,
    access: { entries: [] },
    ...(input.kind === 'database' ? { kind: 'database' as const } : {}),
    ...(typeof input.source === 'string' && /^[a-z]{1,12}:[A-Za-z0-9_-]{1,64}$/.test(input.source) ? { source: input.source } : {}),
  };
}

// Whether `id` may be moved under `parentId` (not itself, not one of its own descendants).
export const canMove = (pages: Pages, id: string, parentId: string | null): boolean =>
  parentId === null || !subtree(pages, id).includes(parentId);

// ---- Blocks ----

const COLOR = /^[a-z_]{1,24}$/;
const LANG = /^[A-Za-z0-9+#._-]{1,30}$/;

export function cleanRich(v: unknown): Rich[] | null {
  if (!Array.isArray(v) || v.length > 2000) return null;
  const out: Rich[] = [];
  let chars = 0;
  for (const raw of v) {
    if (!raw || typeof raw !== 'object' || typeof (raw as Rich).t !== 'string') return null;
    const r = raw as Rich;
    chars += r.t.length;
    if (chars > MAX_TEXT) return null;
    const span: Rich = { t: r.t };
    if (r.b) span.b = 1;
    if (r.i) span.i = 1;
    if (r.u) span.u = 1;
    if (r.s) span.s = 1;
    if (r.c) span.c = 1;
    const link = safeUrl(r.link) || (typeof r.link === 'string' && /^(mailto:[^\s]{1,200}|\/[^\s]{0,500})$/.test(r.link) ? r.link : '');
    if (link) span.link = link;
    if (typeof r.color === 'string' && COLOR.test(r.color)) span.color = r.color;
    const m = r.mention;
    if (m && (m.kind === 'user' || m.kind === 'page' || m.kind === 'date') && typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 64) {
      span.mention = { kind: m.kind, id: m.id };
    }
    out.push(span);
  }
  return out;
}

function cleanRows(v: unknown): string[][] | null {
  if (!Array.isArray(v) || v.length > 30) return null;
  const rows: string[][] = [];
  for (const row of v) {
    if (!Array.isArray(row) || row.length > 12 || row.some((c) => typeof c !== 'string')) return null;
    rows.push((row as string[]).map((c) => c.slice(0, 500)));
  }
  return rows;
}

// Keeps only the fields a patch may set, each checked. Returns null when nothing valid is left.
export function cleanPatch(raw: unknown): BlockPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const out: BlockPatch = {};
  if (typeof p.type === 'string' && (BLOCK_TYPES as readonly string[]).includes(p.type)) out.type = p.type as BlockType;
  if ('text' in p) {
    const text = cleanRich(p.text);
    if (text) out.text = text;
  }
  if (typeof p.checked === 'boolean') out.checked = p.checked;
  if (typeof p.open === 'boolean') out.open = p.open;
  if (typeof p.header === 'boolean') out.header = p.header;
  if (typeof p.language === 'string' && LANG.test(p.language)) out.language = p.language;
  if (typeof p.color === 'string' && (p.color === '' || COLOR.test(p.color))) out.color = p.color;
  if (typeof p.bg === 'string' && (p.bg === '' || COLOR.test(p.bg))) out.bg = p.bg;
  if (typeof p.url === 'string') out.url = safeUrl(p.url);
  if (typeof p.name === 'string') out.name = p.name.slice(0, 200);
  if (typeof p.icon === 'string') out.icon = cleanIcon(p.icon);
  if (typeof p.pageId === 'string' && p.pageId.length <= 64) out.pageId = p.pageId;
  if ('rows' in p) {
    const rows = cleanRows(p.rows);
    if (rows) out.rows = rows;
  }
  return Object.keys(out).length ? out : null;
}

export const countBlocks = (blocks: Block[]): number => blocks.reduce((n, b) => n + 1 + countBlocks(b.children), 0);
const height = (b: Block): number => 1 + b.children.reduce((n, c) => Math.max(n, height(c)), 0);

// Rebuilds a client-sent block from scratch so nothing unchecked is stored. `budget.left` caps the
// total number of blocks in one insert.
function cleanBlock(raw: unknown, depth: number, budget: { left: number }): Block | null {
  if (!raw || typeof raw !== 'object' || depth >= MAX_DEPTH || budget.left <= 0) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== 'string' || b.id.length === 0 || b.id.length > 64) return null;
  if (typeof b.type !== 'string' || !(BLOCK_TYPES as readonly string[]).includes(b.type)) return null;
  const text = b.text === undefined ? [] : cleanRich(b.text);
  if (!text) return null;
  budget.left -= 1;
  const block: Block = { id: b.id, type: b.type as BlockType, text, children: [], rev: 1 };
  const patch = cleanPatch({ ...b, type: undefined, text: undefined });
  if (patch) Object.assign(block, patch);
  if (Array.isArray(b.children)) {
    for (const c of b.children) {
      const kid = cleanBlock(c, depth + 1, budget);
      if (kid) block.children.push(kid);
    }
  }
  return block;
}

interface Loc { list: Block[]; index: number; parent: Block | null; depth: number }

function locate(blocks: Block[], id: string, parent: Block | null = null, depth = 0): Loc | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return { list: blocks, index: i, parent, depth };
    const inner = locate(blocks[i].children, id, blocks[i], depth + 1);
    if (inner) return inner;
  }
  return null;
}

// Where a block goes: the child list of `parent` (null = top), and the index after `after`.
function slot(body: PageBody, parentId: string | null, after: string | null): { list: Block[]; index: number; depth: number } | null {
  let list = body.blocks;
  let depth = 0;
  if (parentId !== null) {
    const p = locate(body.blocks, parentId);
    if (!p) return null;
    list = p.list[p.index].children;
    depth = p.depth + 1;
  }
  if (after === null) return { list, index: 0, depth };
  const at = list.findIndex((b) => b.id === after);
  return { list, index: at < 0 ? list.length : at + 1, depth };
}

export interface OpResult {
  applied: BlockOp[];
  // The stored version of any block whose text someone else changed after the sender last saw it.
  conflicts: Block[];
  // Ops that were invalid or refused. Replays of ops that already took effect are not counted.
  rejected: number;
}

// Applies a batch in order. Mutates `body`; `body.version` goes up once if anything changed.
// Same-block rule: a text or type change whose `baseRev` is older than the stored `rev` is NOT applied;
// the stored block comes back as a conflict and the sender re-sends on top of it. Everything else is
// applied (last writer wins per field), and ops on different blocks never interfere.
export function applyOps(body: PageBody, ops: BlockOp[], maxBlocks = MAX_BLOCKS): OpResult {
  const res: OpResult = { applied: [], conflicts: [], rejected: 0 };
  let total = countBlocks(body.blocks);
  for (const raw of ops) {
    const op = raw as unknown as Record<string, unknown>;
    if (!op || typeof op !== 'object') {
      res.rejected += 1;
      continue;
    }
    if (op.op === 'insert') {
      const budget = { left: Math.max(0, maxBlocks - total) };
      const block = cleanBlock(op.block, 0, budget);
      const parent = op.parent === null || typeof op.parent === 'string' ? (op.parent as string | null) : undefined;
      const after = op.after === null || typeof op.after === 'string' ? (op.after as string | null) : undefined;
      if (!block || parent === undefined || after === undefined) {
        res.rejected += 1;
        continue;
      }
      if (locate(body.blocks, block.id)) continue; // a replay after a reconnect
      const to = slot(body, parent, after);
      if (!to || to.depth + height(block) > MAX_DEPTH) {
        res.rejected += 1;
        continue;
      }
      to.list.splice(to.index, 0, block);
      total += countBlocks([block]);
      res.applied.push({ op: 'insert', parent, after, block });
    } else if (op.op === 'update') {
      const loc = typeof op.id === 'string' ? locate(body.blocks, op.id) : null;
      const patch = cleanPatch(op.patch);
      if (!loc || !patch) {
        if (!loc && typeof op.id === 'string') continue; // edited a block that is already gone
        res.rejected += 1;
        continue;
      }
      const block = loc.list[loc.index];
      const baseRev = typeof op.baseRev === 'number' ? op.baseRev : 0;
      if ((patch.text !== undefined || patch.type !== undefined) && baseRev < block.rev) {
        res.conflicts.push(block);
        continue;
      }
      Object.assign(block, patch);
      block.rev += 1;
      res.applied.push({ op: 'update', id: block.id, patch, baseRev, rev: block.rev });
    } else if (op.op === 'move') {
      const loc = typeof op.id === 'string' ? locate(body.blocks, op.id) : null;
      const parent = op.parent === null || typeof op.parent === 'string' ? (op.parent as string | null) : undefined;
      const after = op.after === null || typeof op.after === 'string' ? (op.after as string | null) : undefined;
      if (!loc || parent === undefined || after === undefined) {
        res.rejected += 1;
        continue;
      }
      const block = loc.list[loc.index];
      // Not into itself or one of its own children, and not after itself.
      if (parent === block.id || locate(block.children, parent ?? '') || after === block.id) {
        res.rejected += 1;
        continue;
      }
      loc.list.splice(loc.index, 1);
      const to = slot(body, parent, after);
      if (!to || to.depth + height(block) > MAX_DEPTH) {
        loc.list.splice(loc.index, 0, block); // put it back where it was
        res.rejected += 1;
        continue;
      }
      to.list.splice(to.index, 0, block);
      res.applied.push({ op: 'move', id: block.id, parent, after });
    } else if (op.op === 'remove') {
      const loc = typeof op.id === 'string' ? locate(body.blocks, op.id) : null;
      if (!loc) {
        if (typeof op.id !== 'string') res.rejected += 1;
        continue;
      }
      total -= countBlocks([loc.list[loc.index]]);
      loc.list.splice(loc.index, 1);
      res.applied.push({ op: 'remove', id: op.id as string });
    } else {
      res.rejected += 1;
    }
  }
  if (res.applied.length) body.version += 1;
  return res;
}

// Applies an op the server already checked and broadcast (a browser replays these on its copy).
// Unlike applyOps it trusts the op, never reports conflicts, and sets the revision the server chose.
export function applyApplied(body: PageBody, op: BlockOp): void {
  if (op.op === 'insert') {
    if (locate(body.blocks, op.block.id)) return;
    const to = slot(body, op.parent, op.after);
    if (to) to.list.splice(to.index, 0, op.block);
  } else if (op.op === 'update') {
    const loc = locate(body.blocks, op.id);
    if (!loc) return;
    const block = loc.list[loc.index];
    Object.assign(block, op.patch);
    block.rev = op.rev ?? block.rev + 1;
  } else if (op.op === 'move') {
    const loc = locate(body.blocks, op.id);
    if (!loc) return;
    const block = loc.list[loc.index];
    if (op.parent === block.id || locate(block.children, op.parent ?? '') || op.after === block.id) return;
    loc.list.splice(loc.index, 1);
    const to = slot(body, op.parent, op.after);
    if (to) to.list.splice(to.index, 0, block);
    else loc.list.splice(loc.index, 0, block);
  } else {
    const loc = locate(body.blocks, op.id);
    if (loc) loc.list.splice(loc.index, 1);
  }
}

// Copies blocks with fresh ids (for duplicating a page).
export function cloneBlocks(blocks: Block[], newId: () => string): Block[] {
  return blocks.map((b) => ({ ...b, id: newId(), rev: 1, text: b.text.map((r) => ({ ...r })), children: cloneBlocks(b.children, newId), rows: b.rows?.map((r) => [...r]) }));
}

// The text of a page body as plain lines, for search and summaries.
export function plainText(blocks: Block[]): string {
  const lines: string[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      const line = b.text.map((r) => r.t).join('');
      if (line) lines.push(line);
      if (b.rows) for (const r of b.rows) lines.push(r.join(' '));
      walk(b.children);
    }
  };
  walk(blocks);
  return lines.join('\n');
}
