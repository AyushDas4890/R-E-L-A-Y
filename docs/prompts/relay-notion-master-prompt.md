# Relay x Notion master prompt

Target: Claude Code (Opus 5.5 or Sonnet 5.5), run inside `C:\Users\ayush\Slack---reverse`, one phase per session.
Source of truth for features and visuals: `docs/notion/features.md`.
Paste everything under the line into Claude Code. Run Phase 0 first, then one phase at a time. Start each later phase with "Continue with Phase N".

---

You are a senior full-stack engineer working in the Relay repo (`C:\Users\ayush\Slack---reverse`). Relay is a Slack-style team chat. Your job: add the working core of Notion to Relay as a new "Pages" area, and give Relay a Notion-style workspace look. Ship it phase by phase. Each phase MUST leave `npm run lint`, `npm test` and `npm run build` green.

<context>
Stack (verify in source before relying on it):
- UI: React 18 + Vite + TypeScript in `src/`. Server: one Node 24 process, `server/index.ts`, HTTP plus one WebSocket at `/ws`. Typed `ClientEvent` and `ServerEvent` unions in `src/types.ts`. On join the server sends one `init` Snapshot, then deltas.
- Each workspace is one JSON document, held in memory and saved in full (Supabase `relay_state` row, or `data/*.json`). Roles: owner, admin, member, guest. Access rules live in `server/access.ts`; every event is checked there.
- Today Relay has `canvases: Record<channelId, string>` (one text doc per channel) and `lists` (a flat task board). These are the seeds of Pages and Databases. Keep them working; migrate them into Pages in Phase 7.
- Themes: `src/appearance.ts`, `src/minimal.css`, `src/apple.css`, `src/features.css`. The default is the "Minimal" look. Chat, huddles, workflows, admin and help MUST keep working.
- Tests run with `node --test` (see `package.json`). Style: match the surrounding code, comment density and naming. No new dependency without asking (see stop conditions).
- Product rule from the README: built from public product behavior only. No Notion code, assets, fonts or logos. Use Inter, not NotionInter. Relay has no LLM; AI features are local heuristics, labelled as such.

Reference: read `docs/notion/features.md` fully before Phase 1. It lists every feature scraped from Notion's public pages, the warm-gray color scale and the layout numbers. Items marked "(not verified from the scrape)" there are common Notion behavior; build them only if cheap.
</context>

<target_state>
A person opens Relay and sees a Notion-style workspace: warm-gray sidebar with Favorites, Teamspaces, Shared, Private, Recents and Trash; unlimited nested pages; a block editor with `/` menu, drag handles, markdown shortcuts and `@` mentions; databases with properties, views, filters, sorts, groups, relations, rollups and formulas; comments, sharing, history, publish to web, templates, search, inbox. Chat channels stay in the same sidebar as a "Channels" section, and each channel can link a page.
</target_state>

<phases>
Do exactly one phase per session. Finish it, verify it, stop. Never start the next phase on your own.

Phase 0 - Plan and data model (no UI)
- Read `src/types.ts`, `server/store.ts`, `server/access.ts`, `server/index.ts` event handling, `src/store.ts`, `src/App.tsx`.
- Write `docs/notion/plan.md`: the data model, the new events, the access rules and a test list. Keep it under 250 lines.
- Data model to propose (adjust to fit the code): `Page { id, workspaceId, parentId | null, teamspaceId | null, title, icon, cover, font: 'default'|'serif'|'mono', smallText, fullWidth, locked, blocks: Block[], props: Record<propId, Value>, databaseId?, createdBy, createdAt, editedBy, editedAt, trashedAt?, verified?: {by, until} }`. `Block { id, type, text (rich spans), children: Block[], checked?, language?, color?, url?, syncedFrom?, ... }`. `Database { id, pageId, title, props: Property[], views: View[], templates: PageTemplate[] }`. `Property` and `View` cover every type in `features.md` section 3. `PageAccess` rows hold subject (user, group, teamspace, link) and level.
- Pages are stored per workspace in their own collection, NOT inside each channel's blob, and `init` MUST send only the page tree (id, parentId, title, icon, order) and not block bodies. Block bodies load on open (`page:get`) and sync as ops.
- Concurrency: choose block-level operations (insert, update, move, delete by block id) with a per-page version, so two editors do not overwrite each other. Describe the merge rule in one paragraph.
- Done when: the plan file exists and names every new event, every access check and every test file.

Phase 1 - Notion look and shell
- Add a "Notion" theme next to Minimal (`data-theme='notion'`, light and dark). Tokens from `features.md` section 11: Inter 16px, text `rgba(0,0,0,.95)`, warm grays `#f9f9f8 #f6f5f4 #dfdcd9 #a39e98 #78736f #615d59 #494744 #31302e #191918`, hairline 1px `#dfdcd9`, radii 4 to 10px, hover as a soft gray wash, blue primary. Dark theme uses the gray scale inverted, not pure black.
- New shell: collapsible sidebar (about 240px, drag to resize, `Ctrl+\`), top bar with breadcrumbs and Share, Comments, Updates, Favorite star and a ••• menu, content column about 708px centered with a Full width option.
- Sidebar sections: Search, Home, Inbox, Favorites, Channels, Teamspaces, Shared, Private, Trash, workspace switcher at the bottom. Rows show a toggle arrow, hover `⋯` and `+`. Reuse the existing channel list and workspace switcher.
- Make Notion the default for new accounts. Do NOT re-force it for people who already chose a look (see how commit 13c5e8c migrated people to Minimal and do not repeat that).
- Done when: the theme is selectable under Preferences → Appearance, every existing screen renders in it at 1440px and 375px with no clipped or unreadable text, and `src/appearance.test.ts` covers the new theme id.

Phase 2 - Pages and the block editor
- Server: page tree events (`page:create`, `page:rename`, `page:move`, `page:trash`, `page:restore`, `page:delete`, `page:favorite`) and block ops, with access checks and tests in `server/pages.test.ts`.
- Editor (build it on `contenteditable` with your own block model; do not add an editor library without asking): blocks Text, Heading 1-3, Bulleted, Numbered, To-do, Toggle, Quote, Callout, Divider, Code (with language picker), Image, File, Web bookmark (reuse `server/unfurl.ts`), Table (simple), Columns, Table of contents, Breadcrumb, Link to page, Sub-page, Equation (inline, KaTeX-free plain rendering is acceptable).
- Interactions: `/` menu with fuzzy search and recents; `+` and `⋮⋮` handles on hover; drag and drop with blue drop guides; Turn into; color and background color; floating selection toolbar (bold, italic, underline, strike, code, link, color, comment); all markdown shortcuts and the `Ctrl+Shift+0..9` shortcuts from `features.md` section 2; `@person`, `@page`, `@date`, `@remind`; `[[` and `+` page links; `Tab` and `Shift+Tab` nesting; undo and redo; paste markdown and HTML; Esc selects block, multi-select, `Ctrl+D`, `Ctrl+/`.
- Page chrome: emoji icon (picker), cover (gradient presets and upload, under the existing 3 MB rule), three typefaces, Small text, Full width, Lock page, page word count, Duplicate, Move to, Copy link, Export Markdown.
- Real-time: two browsers on one page see each other's edits and cursors within one second.
- Done when: `src/editor.test.ts` covers markdown shortcuts, Turn into, nesting and op merge; two tabs edit the same page without losing text; init payload size stays flat as page count grows (test it).

Phase 3 - Databases
- Property types: all 23 in `features.md` section 3. Formula needs a small safe expression language (arithmetic, comparison, `if`, `and`, `or`, `concat`, `length`, `contains`, `now`, `dateBetween`, `prop("name")`). Parse it yourself; NEVER use `eval` or `new Function`.
- Views: Table, Board, List, Gallery, Calendar, Timeline, Chart (bar, line, donut, drawn with SVG). Each view has its own layout, property visibility, filter (AND/OR groups nested 3 deep, "save for everyone" or only me), sort (multiple, reorderable), group, sub-group, calculations, conditional color and "open pages in" (side peek, center peek, full page).
- Rows are pages. Row page shows a properties list on top and free blocks below. Customize page: show, hide when empty, hide. Backlinks panel.
- Relations (one-way and two-way, limit 1 or none), rollups (count, sum, avg, min, max, percent, earliest, latest, unique), select tag editor, Status groups, sub-items, dependencies, ID property, Created and Last edited properties, linked views of another database, inline and full-page databases, lock database, 500-property cap.
- Templates per database, with a default; Buttons and database automations (triggers: page added, property edited, every {frequency}; actions: edit property, add page, send message to a Relay channel; automations never trigger automations). Reuse the scheduler in `server/` that runs workflows.
- Forms: a public-or-member form per database that appends a row.
- Done when: `server/databases.test.ts` and `src/formula.test.ts` pass; a 2,000-row table scrolls without jank (virtualize rows); a formula with bad syntax shows an inline error, not a crash.

Phase 4 - Collaboration, sharing, teamspaces
- Comments on blocks, text selections and pages; threads, resolve, `@` mentions, reactions. Suggesting mode (suggest edits, accept, reject).
- Share menu: invite people, groups, teamspaces; guests by email; general access (only invited, everyone in the workspace with "Hide in search", anyone with the link with optional expiry); levels Full access, Can edit, Can edit content, Can comment, Can view. Inheritance down the tree with override. A person with no access MUST NOT receive the page in `init`, search or the sidebar (extend `server/access.ts` and test denial for each level and for guests).
- Teamspaces: members, owners, default teamspace, private teamspaces, permissions per teamspace. Map existing roles onto them; do not weaken role checks.
- Inbox: mentions, comments, reminders, assignments, page updates; mark all read, archive, filter by type, per-page notification settings. Reuse `server/notifications.ts` and `src/notify.ts`.
- Page history (versions list, preview, restore), Updates panel, Verification (owner, expiry, banner), Synced blocks, Trash with 30-day restore, audit log entries for share, trash, delete and restore.
- Done when: `server/pages-access.test.ts` proves every denial case; a guest cannot read, search, mention or receive a notification for a page they lack access to.

Phase 5 - Search, Home, Library, templates
- `Ctrl+K` and `Ctrl+P`: one search over pages, database rows, messages, people, channels. Filters by type, creator, date, teamspace; snippet with highlighted match; recent pages first; keyboard navigation. Search MUST respect the access rules from Phase 4.
- Home (recents, favorites, assigned tasks, upcoming dates), My Tasks (rows with a Person property equal to me), Library (browse a section), in-page find `Ctrl+F`, back and forward `Ctrl+[` and `Ctrl+]`, tabs.
- Template gallery: docs, wiki, meeting notes, PRD, project tracker, OKRs, onboarding checklist, editorial calendar, engineering roadmap, daily standup, design system, CRM. Each is data (JSON) that creates pages and databases. Duplicate-template button.
- Import Markdown and CSV, export page or workspace to Markdown and CSV (extend the existing JSON export).
- Done when: search returns correct, access-filtered results with tests; every template creates without error.

Phase 6 - Publish, calendar, local AI
- Publish to web: public read-only page at `/p/<slug>`, optional expiry, theme light or dark, navigation bar with breadcrumbs and search, noindex toggle, remove-branding toggle. Server renders it without sign-in and without leaking unrelated pages. Custom domains are out of scope.
- Calendar: a Calendar view across all date properties, drag to change dates, day, week and month layouts, time zones. Meeting notes page template with action items.
- Local "AI" (heuristics, no LLM, labelled "local assist"): summarize page, extract action items into to-dos, fix spelling via browser spellcheck, translate is out of scope, autofill for select and date properties from keywords, "Ask" over the workspace using the Phase 5 search with citations to pages. Reuse patterns from `/summarize` and `/explain`.
- Done when: a signed-out browser reads a published page and nothing else; calendar drag updates the date for everyone.

Phase 7 - Migration, polish, hardening
- Migrate each channel's canvas to a page (linked from the channel header) and each list to a database. Idempotent: running twice creates no duplicates. Old data MUST remain readable.
- Performance: lazy-load block bodies, virtualize long pages and large tables, debounce saves, cap block count per page and rows per database with clear errors.
- Accessibility: every control reachable by keyboard, visible focus, `aria` roles for the editor, tree and menus, `prefers-reduced-motion` respected, 4.5:1 contrast in light and dark.
- Mobile at 375px: sidebar as a drawer, editor toolbar above the keyboard (as Notion does, since hover handles do not exist on touch), database views scroll horizontally.
- Update `README.md` (new section, screenshots taken from a local server with demo data), `docs/notion/features.md` coverage table (built, partly built, skipped with reason), and the help center (`src/help.ts`).
- Done when: full test suite green; a fresh workspace and a migrated one both open; lighthouse-style manual check at 375px and 1440px shows no layout break.
</phases>

<out_of_scope>
Do not build: SAML SSO, SCIM, EKM, DLP or SIEM connections, real LLM calls, Notion Agents with external tools, enterprise search over third-party apps, custom domains, the Notion public API, native desktop and mobile apps, Notion Calendar as a separate app, payment or seat billing. List each as "not built because it needs an external service" in the coverage table.
</out_of_scope>

<constraints>
- Every new server event MUST be checked for sign-in, workspace membership, role, page access and rate limit before it changes state. Access control comes before UI.
- Persisted objects get ownership and version checks. No last-write-wins on whole pages, databases or workflows.
- Do not send all page bodies in `init`. Do not send member emails to people who do not need them.
- Do not use `eval`, `new Function`, `dangerouslySetInnerHTML` with unsanitized input, or inline user HTML. Sanitize pasted HTML and Markdown by whitelist.
- Do not copy Notion assets, icons, fonts, logos, copy text or illustrations. Write your own copy and use the existing `Icon.tsx` set, adding icons in the same style.
- Keep the uncommitted work in `src/huddle-call.ts`, `src/App.tsx`, `src/components/Icon.tsx` unless a phase needs to touch it; do not revert it.
- Only make changes the current phase asks for. Do not add features, refactors or abstractions beyond it. Match existing naming, comments and file layout.
- Never put secrets, tokens or env values in code, docs or tests.
- Commit after each phase with a `feat(pages): ...` message. Do not push. Do not touch `render.yaml`, `vercel.json`, Supabase schema or CI without asking.
</constraints>

<stop_conditions>
Stop and ask before: adding any dependency, deleting any file you did not create, changing the Supabase table or storage layout, changing auth, changing the WebSocket protocol in a way old clients cannot read, or when two phases seem to conflict. Stop and report if a phase needs more than about 25 files changed, if tests fail twice after a fix attempt, or if you are unsure whether an access rule is safe.
After each phase, stop. Do not begin the next phase.
</stop_conditions>

<verification>
For every phase run and show the real output of: `npm run lint`, `npm test`, `npm run build`. Then start `npm run dev` and check the changed screens in a browser at 1440px and 375px, light and dark, with the Notion theme and the Minimal theme. Report only what you observed. If something was not checked, say so.
Do not claim a feature works because it type-checks.
</verification>

<output_format>
After each phase, output:
1. ✅ list of what was completed, one line each, with file paths.
2. Test and build results (pass counts, any failures).
3. Known gaps and anything skipped, with the reason.
4. The exact next phase to run.
</output_format>
