# Relay Pages: plan (Phase 0)

Status: plan only. No code changed. Feature source: `docs/notion/features.md`. Prompt: `docs/prompts/relay-notion-master-prompt.md`.

## 1. What the code does today (verified)

- One Node process. `server/index.ts` (1613 lines): `createRuntime(id, db, save, ...)` per workspace, `handle()` is a `switch (ev.t)`. `route()` handles `auth` and `createWorkspace`, then forwards everything else to `rt.handle`.
- Persistence: each workspace is ONE JSON document `DB`, saved whole 250 ms after `persist()` (`server/store.ts`: `createFileStore`, `createSupabaseStore`, rows `relay_state`, id `singleton` / `ws-<id>`). `flush()` runs on shutdown.
- Access: `canSee(ch, userId)` for channels; `server/access.ts` holds pure helpers (`userView`, `mergeWorkflows`, `applyListPatch`, `removeVerdict`). Roles `owner | admin | member | guest`; `isAdmin` in `src/premium.ts`. Guests only see channels they are members of.
- Snapshot: `snapshotFor(userId)` builds `init`. Messages are already paged (`server/history.ts`, cursor `{ts,id}`, `PAGE = 50`). Canvases are `Record<channelId, string>` (max 100k chars, whole-string replace); lists are `ListItem[]` per channel with per-item patches (`applyListPatch`, max 500).
- Limits: per-socket token bucket 200 burst / 50 per second; `maxPayload` 12 MB; 20 owned workspaces; heartbeat 30 s.
- Client: `src/store.ts` reducer over `ServerEvent`; `src/App.tsx` routes with `Place { view, channel }` and a history stack; themes in `src/appearance.ts`.
- Tests: `node --test` list in `package.json`; helper modules are pure and tested without sockets. New server logic MUST follow that pattern (pure module + `*.test.ts`, handler stays thin).
- Single-writer model: running two server instances is unsafe today (also said in `docs/relay-messages-table-proposal.md`). Pages inherit this limit.
- Note: the master prompt says `huddle-call.ts`, `App.tsx` and `Icon.tsx` have uncommitted edits, and that `server/index.ts` has about 1350 lines. `git status` at session start shows only `.claude/` and `.serena/` untracked, and the file has 1613 lines. Treat those two statements as stale.

## 2. Decisions (all three approved by the user on 2026-11-03)

1. **Storage layout.** Do NOT put pages in the workspace blob: a 2,000-row database or a long page would be rewritten on every message. Proposal, with no schema change (same `relay_state` table, new row ids, same `createStore`):
   - `pg-<ws>`: the page index (tree, props, databases, access, teamspaces). Small, no block bodies.
   - `pb-<ws>-<pageId>`: one row per page body (blocks, comments, last 25 versions).
   - File backend: `data/pages-<ws>.json` and `data/pages/<ws>/<pageId>.json`.
   New row ids are a storage-layout change, so Phase 2 does not start until you say yes. Fallback if you say no: one `pg-<ws>` row holding everything, with a hard cap of 500 pages and 5,000 rows per workspace.
2. **Protocol.** New events only; no existing event changes. Old clients ignore unknown events, so this is backward compatible.
3. **Admin visibility.** Proposal: admins and owners see all pages except another person's Private pages (creator-only), as in Notion. Owners can still use export and the audit log. Say if you want admins to read private pages.

## 3. Data model (`src/types.ts`, new section; names final unless the code says otherwise)

```ts
type PageId = string;
type Rich = { t: string; b?: 1; i?: 1; u?: 1; s?: 1; c?: 1; link?: string; color?: string;
              mention?: { kind: 'user' | 'page' | 'date'; id: string }; };   // inline spans

interface Block {
  id: string; type: BlockType; text: Rich[]; children: Block[];
  checked?: boolean; open?: boolean; language?: string; color?: string; bg?: string;
  url?: string; file?: FileAttachment; icon?: string;        // callout, image, bookmark, file
  rev: number;                                               // bumps on every change to this block
  syncedFrom?: { pageId: PageId; blockId: string };
}
type BlockType = 'text' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'todo' | 'toggle' | 'quote' | 'callout'
  | 'divider' | 'code' | 'image' | 'file' | 'bookmark' | 'table' | 'columns' | 'toc' | 'breadcrumb'
  | 'pageLink' | 'subpage' | 'equation' | 'dbInline' | 'button' | 'synced';

interface Page {
  id: PageId; parentId: PageId | null; teamspaceId: string | null;   // null parent+teamspace = Private
  title: string; icon: string; cover: string;                         // cover: preset id or stored url
  font: 'default' | 'serif' | 'mono'; smallText: boolean; fullWidth: boolean; locked: boolean;
  order: number;                                                      // sibling order (fractional)
  createdBy: string; createdAt: number; editedBy: string; editedAt: number;
  trashedAt?: number; verified?: { by: string; until: number };
  access: PageAccess;                                                 // see section 5
  database?: Database;                                                // present when the page IS a database
  rowOf?: PageId; props?: Record<string, PropValue>;                  // present when the page is a database row
  channelId?: string;                                                 // page linked from a channel header
  version: number;                                                    // bumps on every body op
}

interface Database { dataSources: DataSource[]; views: View[]; templates: PageTemplate[]; locked: boolean; }
interface DataSource { id: string; title: string; props: Property[]; }            // max 500 props
interface Property { id: string; name: string; type: PropType; options?: Option[]; format?: string;
  relation?: { dbPageId: PageId; twoWayPropId?: string; limit1?: boolean };
  rollup?: { relationPropId: string; targetPropId: string; fn: RollupFn }; formula?: string; }
type PropType = 'title' | 'text' | 'number' | 'select' | 'status' | 'multi' | 'date' | 'person' | 'file'
  | 'checkbox' | 'url' | 'email' | 'phone' | 'formula' | 'relation' | 'rollup' | 'createdTime' | 'createdBy'
  | 'editedTime' | 'editedBy' | 'button' | 'id' | 'place';                          // 23
type PropValue = string | number | boolean | string[] | { start: string; end?: string; time?: boolean } | null;
interface View { id: string; name: string; layout: 'table'|'board'|'list'|'gallery'|'calendar'|'timeline'|'chart'|'feed';
  visible: string[]; filter: FilterGroup; sorts: Sort[]; group?: string; subGroup?: string;
  calc: Record<string, string>; colors: ColorRule[]; openIn: 'side' | 'center' | 'full'; saveForEveryone: boolean; }
interface FilterGroup { op: 'and' | 'or'; items: (Filter | FilterGroup)[]; }      // nesting depth <= 3
```

Rules:
- A database row is a `Page` with `rowOf` set. Rows are NOT in the tree sent on `init`; they load with the database (`dbRows`).
- Server owns `id`, `createdBy/At`, `editedBy/At`, `version`. Clients never set them.
- Caps: 5,000 blocks per page, 200 nesting depth is not needed (cap 6 levels of block children), 100k chars per block text, 20,000 pages and 20,000 rows per workspace, 500 props per database, 3 MB per upload (existing rule).

## 4. Sync and merge rule

- `init` carries only `PageNode[]` (`id, parentId, teamspaceId, title, icon, order, trashed, hasChildren`) for pages the person can see, plus `teamspaces`, `favorites`, `pageInbox`. No bodies, no props, no comments.
- Opening a page sends `pageGet { id }`. Server replies `pageBody { id, blocks, version, comments, access summary }` or `error` if access is denied. The client then sends `blockOps` and receives `blockOps` echoes from others.
- **Merge rule (one paragraph).** Ops address blocks by id, never by index: `insert { id, after | parent, block }`, `update { id, patch, baseRev }`, `move { id, after | parent }`, `remove { id }`. The server applies a batch in order against the current page, bumps `block.rev` and `page.version`, and broadcasts the applied ops with the new version. Inserts, moves and removes on different blocks therefore never conflict. An `update` whose `baseRev` is older than the stored `rev` is a same-block conflict: the server merges text by common-prefix/suffix diff against the stored text when the edits do not overlap, else keeps the stored block and returns `{ conflict: id, block }` so the client rebases and re-sends. Edits to a removed block are dropped. Ops are idempotent by block id, so a resend after reconnect is safe.
- Client batches keystrokes for 150 ms; max 200 ops and 256 KB per event. Cursors and "typing in page" go out as a separate lightweight `pagePresence` event (not persisted, no rate-limit exemption).
- Persistence: a dirty set of page ids, flushed per page 250 ms after the last op and on shutdown (mirror `persist()`/`flush()`), with retry on failure.

## 5. Access rules (new pure module `server/pageAccess.ts`)

`levelFor(page, user, ctx) -> 'none'|'view'|'comment'|'edit-content'|'edit'|'full'`, ordered. Steps:
1. Removed or inactive users: `none`. Bots: `view`.
2. Private page (no parent, no teamspace): `full` for the creator and any explicit grants, else `none`, including for admins (decision 3).
3. Walk from the page to the root. The first node with `access.restricted` stops inheritance; otherwise take the nearest node that has entries, and merge with the teamspace default.
4. Entries: `{ who: user | group | teamspace | workspace | link, level }`. Highest level wins. `workspace` and teamspace-default entries NEVER apply to guests. Guests need an explicit `user` entry on the page or an ancestor.
5. Teamspace: owners get `full` on its pages; members get the teamspace's member level; default teamspaces include every non-guest, non-removed member. Private teamspaces are invisible to non-members.
6. Information barriers (`settings.barriers` of two group ids): a person cannot be granted access via a group on the other side of a barrier from the page's creator. Test it.
7. Link access is read-only (`view`) unless the page has `link: comment`; never `edit`. Link requests are served by HTTP, not the socket (Phase 6).
8. `Can edit content` and `Can create` apply to database pages only; on a normal page they collapse to `edit`.
9. Trashed pages: `none` except `full` holders for restore. Locked pages: nobody edits blocks until unlocked, owners of the lock can unlock.

Every handler calls `levelFor` and returns `error` without side effects when below the needed level. Search, mentions, notifications, relations, rollups and backlinks MUST filter through the same function so nothing leaks (a rollup of a page you cannot see shows nothing, a relation shows "No access").

## 6. Events

Client to server (all require sign-in, workspace membership, rate limit, ID length <= 64, and the level in brackets):
`pageList` [member] · `pageGet {id}` [view] · `pageCreate {parentId|teamspaceId, title, template?}` [edit on parent] · `pageUpdate {id, patch}` (title, icon, cover, font, smallText, fullWidth, locked) [edit; lock needs full] · `pageMove {id, parentId, teamspaceId, after}` [full on page, edit on target] · `pageTrash`/`pageRestore`/`pageDelete {id}` [full; delete needs trashed] · `pageDuplicate {id}` [view, creates private copy] · `pageFavorite {id, on}` [view] · `blockOps {id, base, ops[]}` [edit] · `pagePresence {id, cursor}` [view] · `pageShare {id, entries, general, restricted}` [full] · `comment {id, anchor, text, parent?}` [comment] · `commentResolve {id, commentId, on}` [comment or author] · `suggest {id, op}` / `suggestResolve` [comment / edit] · `pageVerify {id, until|off}` [full] · `pageHistory {id}` / `pageRestoreVersion {id, versionId}` [edit] · `dbGet {id}` [view] · `dbSchema {id, patch}` [full, or edit when unlocked] · `dbView {id, view}` (save for everyone needs `full`; personal views stay in prefs) · `rowCreate`/`rowUpdate {id, rowId, props}`/`rowRemove` [edit-content] · `dbAutomation {id, automation}` [full] · `formSubmit {id, values}` [per form setting] · `teamspace {action, ...}` [admin or teamspace owner] · `search {q, filters}` · `inbox`/`inboxRead`/`inboxArchive` · `publish {id, on, options}` (Phase 6) · `pageImport`, `pageExport` (Phase 5).

Server to client: `pageTree {nodes}` (delta), `pageBody`, `blockOps` (echo with version), `blockConflict`, `pagePresence`, `pageShared {id, level}` and `pageRevoked {id}` (client drops the page and its cache), `comments`, `rows`, `dbSchema`, `teamspaces`, `pageInbox`, `searchResults`, `pageHistory`.

Existing events kept: `canvas`, `listItem`, `lists` until Phase 7 migration.

## 7. Client plan (for Phases 1 to 3)

- `store.ts`: add `pages: { nodes, open: Record<id, PageBody>, teamspaces, favorites, inbox }`. Reducer handles the new server events. Drop a page body from cache on `pageRevoked`.
- `App.tsx`: `View` gains `'page'`; `Place` gains `page?: string`. Deep link `?p=<id>` (hash-free, same pattern as `?invite`).
- New files (Phase 1 to 3): `src/components/pages/{Sidebar,Topbar,PageView,Editor,SlashMenu,Toolbar,Share,Comments,History}.tsx`, `src/components/db/{Database,Table,Board,Calendar,Timeline,Gallery,List,Chart,Filter,Props}.tsx`, `src/editor.ts` (pure model: ops, markdown shortcuts, turn-into), `src/formula.ts`, `src/notion.css`.
- Theme: `data-theme='notion'` plus `'notion-dark'` in `THEMES`. Tokens from `features.md` section 11. Keep Minimal intact.

## 8. Test plan (all `node --test`, pure modules, added to `package.json` `test` script in the phase that creates them)

| File | Phase | Covers |
| --- | --- | --- |
| `src/appearance.test.ts` (extend) | 1 | new theme ids exist, old ids still valid |
| `server/pages.test.ts` | 2 | tree ops (create, move, cycle refusal, trash, restore, delete), order, caps, init payload size flat as page count grows |
| `src/editor.test.ts` | 2 | markdown shortcuts, turn-into, nesting, undo, op apply and merge, same-block conflict |
| `server/pageAccess.test.ts` | 2 and 4 | every level, inheritance, restricted, guest denial, private page, barriers, trash, lock |
| `server/pages-access.test.ts` | 4 | handler-level denial: read, edit, comment, search, mention, notification, relation, rollup for no-access and guest |
| `server/databases.test.ts` | 3 | property coercion, 500-prop cap, relation two-way sync, rollups, views filter/sort/group, row caps |
| `src/formula.test.ts` | 3 | parser, functions, bad syntax returns an error value, no `eval` |
| `server/automations.test.ts` | 3 | triggers, actions, no automation triggers another, restricted pages skipped |
| `server/comments.test.ts`, `server/history-pages.test.ts` | 4 | threads, resolve, suggestions, versions list and restore |
| `server/search.test.ts` | 5 | access-filtered results, ranking, filters |
| `server/publish.test.ts` | 6 | signed-out read of a published page returns only that page and its published children |
| `server/migrate-canvas.test.ts` | 7 | canvas and list migration, idempotent, old data intact |

## 9. Risks and open questions

- Rich text inside `contenteditable` is the hardest part (caret, IME, undo). Phase 2 may need more than 25 files; if so, split it into 2a (tree and server) and 2b (editor).
- 12 MB `maxPayload` and 50 events/s rate limit are fine for batched ops but not for per-keystroke events; batching is mandatory.
- Search over bodies needs an in-memory index built at load; memory grows with pages. Cap it, or wait for the messages-table work.
- Formula language scope is a guess from the help docs; the full Notion function list was not scraped.
- Relation rollups across pages with mixed access cost a `levelFor` call per row; cache per request.

## 10. Phase 0 exit check

- [x] Data model, events, access rules, merge rule, tests named.
- [x] The three decisions in section 2 are approved: per-page rows in `relay_state` (no schema change), new events only, admins do not read other people's Private pages.
- Next: Phase 1 (theme and shell).
