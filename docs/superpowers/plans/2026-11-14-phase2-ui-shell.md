# Phase 2: App Shell and UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The workspace feels like a finished product: long channels scroll smoothly, the command palette runs commands and finds people, the composer is complete, new people get onboarded, keyboard and screen-reader users can work, and the phone layout holds up.

**Architecture:** The existing shell (rail, sidebar, main, right panel), the 16-theme token system in `src/styles.css` and `src/appearance.ts`, the `SearchPalette`, and the mobile bottom tab bar all stay. This phase upgrades them in place: a virtualised `MessageList`, a palette with a command registry, a density attribute on `<html>`, a shortcuts layer in `App.tsx`, a richer `Composer`, a first-run `Onboarding` modal backed by a server `onboarded` flag, an accessibility pass, and a mobile pass verified in the browser at 375 px.

**Tech Stack:** React 18, Vite, TypeScript, `@tanstack/react-virtual` (new), existing CSS variables, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-relay-org-platform-design.md`, sections 10 (UI redesign) and 12 step 2. The spec's "light theme" and "three-pane layout" already exist (themes `daylight`, `switchboard`, `apple`, `notion`, `minimal`; `.panel` right pane), so this plan does not rebuild them.

## Global Constraints

- `npm test` and `npm run lint` green after every task. New pure modules get `node --test` files added to the `test` script.
- Keep every existing theme working; new colours come from existing tokens (`--bg`, `--panel`, `--raised`, `--text`, `--muted`, `--line`, `--accent`, `--accent-2`, `--hover`, `--on-accent`, `--side-*`). No hard-coded colours except through `color-mix` on tokens.
- Reduced motion: anything animated checks `prefers-reduced-motion` or sits under the existing `@media (prefers-reduced-motion: reduce)` rules.
- Normal prose in code, comments and commits. Conventional Commits. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never commit `.env`, `data/`, `.superpowers/`.
- Browser checks use `.claude/launch.json` configs `relay` (server, 8787) and `relay-web` (Vite, 5173) in dev mode (no Supabase env). Do not edit `.env`.
- Shell breakpoints already in CSS: 1100 px, 900 px, 768 px, 640 px. Keep them.

## Review Focus

1. A channel with 2,000 messages must scroll without jank and keep the reader's position when older messages prepend (Task 1 browser check with a seeded channel).
2. Keyboard-only use: Ctrl+K, arrows, Enter, Esc must reach every palette result and close cleanly (Task 2 check).
3. Density and theme changes must apply without reload and persist across reloads (Task 3 check).
4. Onboarding must never show twice for the same account and never block an existing account that predates the flag (Task 5 tests on `normalize` defaults and server event).
5. At 375 px wide nothing overflows horizontally, the composer stays reachable above the bottom tab bar, and the right panel is a full-screen sheet (Task 7 check).

---

### Task 1: Virtualised message list with unread divider and jump-to-latest

**Files:**
- Modify: `src/components/MessageList.tsx` (the `MessageList` function, lines ~135-200), `src/styles.css` (message list rules), `package.json` (dependency)
- Create: `src/messageRows.ts`, `src/messageRows.test.ts`

**Interfaces:**
- Produces in `src/messageRows.ts` (pure):
  ```ts
  export type Row =
    | { kind: 'day'; key: string; ts: number }
    | { kind: 'unread'; key: 'unread' }
    | { kind: 'msg'; key: string; m: Message; compact: boolean };
  // Groups consecutive messages by the same author within 5 minutes (compact), inserts a day row when the
  // calendar day changes, and inserts one unread row before the first message with ts > lastRead (when lastRead > 0
  // and such a message exists and is not the viewer's own).
  export function buildRows(messages: Message[], lastRead: number, me: string): Row[];
  ```
- `MessageList` props unchanged: `{ messages, inThread?, onOlder? }`. It reads `lastRead` for the current channel from `snap.prefs.lastRead[channelId]` via `useRelayCtx()` (check `UserPrefs` in `src/types.ts` and how `markRead` is sent today; the divider position is computed once when the channel opens and kept for the visit, so it does not jump as `markRead` updates).
- Virtualisation: `useVirtualizer` from `@tanstack/react-virtual` with `estimateSize: () => 56`, `overscan: 12`, dynamic measurement via `measureElement`. The list stays bottom-anchored: on first render and on a new message when the reader is within 120 px of the bottom, scroll to the last row; when older messages prepend (first id changes, last id unchanged), keep the reader's offset by adjusting `scrollTop` by the added height, as the current code does.
- "Jump to latest" pill (`.jump-latest`) appears when the reader is more than 400 px from the bottom and new messages arrived; clicking scrolls to the end.
- Thread link under a message shows up to three repliers' avatars (`Avatar` component, size 18) before the "N replies" text.

- [ ] **Step 1: Write failing tests** in `src/messageRows.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRows } from './messageRows.ts';
import type { Message } from './types.ts';
const m = (id: string, userId: string, ts: number, over: Partial<Message> = {}): Message => ({ id, channelId: 'c', userId, text: id, ts, reactions: {}, ...over });
const T0 = Date.UTC(2026, 0, 5, 10, 0, 0);

test('day row first, compact within 5 minutes by same author', () => {
  const rows = buildRows([m('a', 'u1', T0), m('b', 'u1', T0 + 60_000), m('c', 'u2', T0 + 120_000)], 0, 'me');
  assert.deepEqual(rows.map((r) => r.kind), ['day', 'msg', 'msg', 'msg']);
  assert.equal((rows[1] as { compact: boolean }).compact, false);
  assert.equal((rows[2] as { compact: boolean }).compact, true);
  assert.equal((rows[3] as { compact: boolean }).compact, false);
});
test('new day inserts a day row and breaks compacting', () => {
  const rows = buildRows([m('a', 'u1', T0), m('b', 'u1', T0 + 86_400_000)], 0, 'me');
  assert.deepEqual(rows.map((r) => r.kind), ['day', 'msg', 'day', 'msg']);
  assert.equal((rows[3] as { compact: boolean }).compact, false);
});
test('system message is never compact and breaks the run', () => {
  const rows = buildRows([m('a', 'u1', T0), m('s', 'u1', T0 + 1000, { system: true }), m('b', 'u1', T0 + 2000)], 0, 'me');
  assert.equal((rows[2] as { compact: boolean }).compact, false);
  assert.equal((rows[3] as { compact: boolean }).compact, false);
});
test('unread row sits before the first message newer than lastRead that is not mine', () => {
  const rows = buildRows([m('a', 'u1', T0), m('mine', 'me', T0 + 1000), m('b', 'u1', T0 + 2000)], T0 + 500, 'me');
  assert.deepEqual(rows.map((r) => r.kind), ['day', 'msg', 'msg', 'unread', 'msg']);
});
test('no unread row when lastRead is 0 or everything is read', () => {
  assert.equal(buildRows([m('a', 'u1', T0)], 0, 'me').some((r) => r.kind === 'unread'), false);
  assert.equal(buildRows([m('a', 'u1', T0)], T0 + 1, 'me').some((r) => r.kind === 'unread'), false);
});
test('keys are stable and unique', () => {
  const rows = buildRows([m('a', 'u1', T0), m('b', 'u1', T0 + 86_400_000)], 0, 'me');
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
});
```

- [ ] **Step 2: Run to verify failure.** `node --test src/messageRows.test.ts` → cannot find module.
- [ ] **Step 3: Implement `src/messageRows.ts`** (day key `day-<YYYY-MM-DD>` from local date, msg key = message id).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Install and wire virtualisation.** `npm install @tanstack/react-virtual@^3`. Rewrite `MessageList` to render `buildRows(...)` through `useVirtualizer` with the anchoring rules above. Row renderers: `day` → existing `.day-divider`; `unread` → `<div className="unread-divider" role="separator"><span>New messages</span></div>`; `msg` → existing `MessageRow`. Keep the GSAP pop-in for a newly arrived last message under the reduced-motion check. Add `.unread-divider` (accent line, small accent label) and `.jump-latest` (floating pill bottom-right of the list, `--panel` background, `--line` border, accent text) to `src/styles.css`.
- [ ] **Step 6: Thread repliers avatars** in `MessageRow`: compute unique `userId`s of `replies` (max 3) and render `Avatar` for each before the reply count.
- [ ] **Step 7: Lint, test, browser check.** Seed a long channel in dev mode: with the servers running, open the browser console on the app and send 300 messages through the socket is not practical; instead add a temporary script `scripts/seed-messages.ts` that writes 2,000 messages into `data/db.json`'s `hq` document for channel `general` when run with `node scripts/seed-messages.ts` (reads, appends, writes; idempotent by a marker text prefix `seed-`), run it with the server stopped, start the servers, open `#general`, scroll up fast and down; confirm no visible jank, position kept when older pages load, the unread divider shows after sending a message from a second account, and the jump pill works. Keep the script (it is useful later) and note it in the report.
- [ ] **Step 8: Commit** `feat(ui): virtualised message list with unread divider and jump to latest`.

---

### Task 2: Command palette with commands, people and keyboard navigation

**Files:**
- Create: `src/commands.ts`, `src/commands.test.ts`
- Modify: `src/components/Modals.tsx` (`SearchPalette`), `src/App.tsx` (palette props), `src/styles.css` (`.palette*`)

**Interfaces:**
- `src/commands.ts` (pure):
  ```ts
  export interface Command { id: string; label: string; hint?: string; keywords?: string[]; group: 'Navigate' | 'Create' | 'Preferences' | 'Admin'; adminOnly?: boolean }
  export const COMMANDS: Command[];  // go-home, go-dms, go-activity, go-saved, go-people, go-calendar, go-pages, new-channel, new-dm, set-status, toggle-density, theme-dark, theme-light, shortcuts, admin-console, invite-people
  export function rankCommands(q: string, cmds: Command[], isAdmin: boolean): Command[];   // empty q → all allowed in group order; else substring on label or keywords, label matches first; adminOnly hidden unless isAdmin
  export interface Recent { id: string; ts: number }
  export function pushRecent(list: Recent[], id: string, now: number, max = 8): Recent[];  // move-to-front, dedupe, cap
  ```
- `SearchPalette` gains props `onCommand: (id: string) => void`, `onPerson: (userId: string) => void`, `isAdmin: boolean`. Sections in order: Commands (when `q` starts with `>` or when `q` matches a command), People (users whose name or title contains `q`, not inactive, max 5), Channels, Pages, Messages, Answer. Arrow keys move a highlighted index across all rendered rows; Enter activates; Esc closes; the input keeps focus. Recent items (`localStorage['relay.recent']`, JSON `Recent[]`) show when `q` is empty, labelled "Recent".
- `App.tsx` implements `onCommand` by id: `go-*` → `showView`; `new-channel` → `setModal('new')`; `new-dm` → `showView('dms')`; `set-status` → `setModal('profile')`; `toggle-density` → appearance `setDensity` (Task 3; until then toggles `document.documentElement.dataset.density`); `theme-dark` → `appearance.setTheme('aurora')`; `theme-light` → `appearance.setTheme('daylight')`; `shortcuts` → `setModal('shortcuts')` (Task 3 adds the modal; until then a no-op is acceptable but must be replaced in Task 3); `admin-console` → `setModal('admin')`; `invite-people` → `setModal('invite')`. `onPerson` opens a DM (`send({ t: 'openDM', userId })` as `DirectoryView` does today).

- [ ] **Step 1: Failing tests** in `src/commands.test.ts`: `rankCommands('', COMMANDS, false)` hides adminOnly and keeps group order; `rankCommands('dark', ...)` returns `theme-dark` first; `rankCommands('dens', ...)` finds `toggle-density` by keyword `density`; `pushRecent` dedupes, moves to front, caps at 8.
- [ ] **Step 2: Verify failure. Step 3: Implement. Step 4: Verify pass.**
- [ ] **Step 5: Rebuild `SearchPalette`** per the interface; highlighted row class `.is-active`; `aria-activedescendant` on the input with `role="listbox"`/`role="option"` ids; section headers `.palette-section`.
- [ ] **Step 6: Wire `App.tsx`.** Lint, test. Browser check: Ctrl+K, type `>` see commands, arrow to "Switch to light theme", Enter, theme changes; type a colleague's name, Enter opens the DM; Esc closes; reopen shows Recent.
- [ ] **Step 7: Commit** `feat(ui): command palette with commands, people and keyboard navigation`.

---

### Task 3: Density, system theme, keyboard shortcuts and shortcuts help

**Files:**
- Modify: `src/appearance.ts`, `src/components/Appearance.tsx`, `src/styles.css`, `src/App.tsx`, `src/components/Modals.tsx`
- Test: `src/appearance.test.ts` (exists; extend)

**Interfaces:**
- `useAppearance()` gains `density: 'comfortable' | 'compact'`, `setDensity`, persisted at `relay.density`, applied as `document.documentElement.dataset.density`. CSS: `[data-density='compact']` sets `--msg-pad: 2px 20px`, `--side-row: 28px`, `--font-size: 14px`; comfortable defaults `--msg-pad: 6px 20px`, `--side-row: 34px`, `--font-size: 15px`. `.msg`, `.side-item` and `body` read these variables.
- Theme list gains `{ id: 'system', label: 'System (Aurora / Daylight)' }`: `useAppearance` resolves `system` to `aurora` when `prefers-color-scheme: dark` else `daylight`, re-resolving on the media query change event; `dataset.theme` always holds the resolved id, `relay.theme` stores `system`. Default for a new browser becomes `system` (change `firstLook`'s fallback and the `read('relay.theme', 'notion')` default; existing stored values untouched). Add a pure `resolveTheme(stored: string, prefersDark: boolean): string` and test it.
- Shortcuts in `App.tsx` `onKey`: `Alt+ArrowUp/ArrowDown` previous/next channel in sidebar order; `Alt+Shift+ArrowUp/Down` previous/next unread channel; `Ctrl/Cmd+Shift+K` → DMs view; `Ctrl/Cmd+Shift+A` → Activity; `Escape` closes the right panel when no modal is open; `Shift+?` (the `?` key) opens the shortcuts modal when focus is not in an input or textarea. Pure helper `nextChannel(ids: string[], current: string, dir: 1 | -1, unreadOnly: boolean, unread: Record<string, number>): string | null` in `src/shortcuts.ts` with tests in `src/shortcuts.test.ts`.
- `ShortcutsModal` in `Modals.tsx`: a two-column list of the shortcuts above plus Ctrl+K, Enter/Shift+Enter, Ctrl+\ (sidebar). `Modal` type gains `'shortcuts'`.
- `AppearanceSettings` gets a Density segmented control (Comfortable / Compact) above the theme grid.

- [ ] **Step 1: Failing tests** for `resolveTheme` (system+dark → aurora; system+light → daylight; `midnight` → `midnight`) and `nextChannel` (wraps around; unreadOnly skips zero-unread; returns null when no candidate).
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Wire** density, system theme, shortcuts, modal, settings UI. Replace Task 2's temporary `toggle-density` and `shortcuts` handlers.
- [ ] **Step 6: Lint, test, browser check:** toggle density, reload, still compact; pick System theme and flip the pane with `resize_window` colorScheme dark/light; Alt+Down moves channel; `?` opens the modal; Esc closes the thread panel.
- [ ] **Step 7: Commit** `feat(ui): density setting, system theme and keyboard shortcuts`.

---

### Task 4: Composer completion

**Files:**
- Modify: `src/components/Composer.tsx`, `src/format.tsx` (EMOJI list → named list), `src/styles.css`
- Create: `src/emoji.ts`, `src/emoji.test.ts`, `src/slash.ts` (client-side list of slash commands with descriptions; the server already executes them in `server/slash.ts`, read it for the names), `src/slash.test.ts`

**Interfaces:**
- `src/emoji.ts`: `export const EMOJI_NAMED: { ch: string; name: string; keywords: string[] }[]` (at least 120 common emoji across smileys, gestures, hearts, objects, symbols, with lower-case names like `thumbs_up`); `export function searchEmoji(q: string, list = EMOJI_NAMED, max = 40)` (empty q → first `max`; else name/keyword substring, name-prefix matches first). `format.tsx` `EMOJI` becomes `EMOJI_NAMED.map((e) => e.ch)` so existing imports keep working.
- `src/slash.ts`: `export const SLASH: { cmd: string; args: string; help: string }[]` built from the names in `server/slash.ts`; `export function matchSlash(text: string): { cmd: string; args: string; help: string }[]` returns matches when `text` starts with `/` and has no space yet, else `[]`.
- Composer changes: format bar gains Quote (`> ` line prefix), Bulleted list (`- ` prefix), Code block (wrap with triple backticks on their own lines), Link (wraps selection as `[text](url)` and places the caret in the url; `format.tsx` inline renderer must render `[text](url)` as a link through `safeUrl`; add that to `inline` if absent). Emoji popover gets a search input (autofocus) over `searchEmoji`, with skin-tone free list. Slash popover appears under the box while `matchSlash(text)` is non-empty, arrow/Enter/Tab completes the command. A hint line under the textarea: "Enter to send, Shift+Enter for a new line" shown only while the textarea is focused and empty. Existing drag and drop, clips, mentions and schedule stay.

- [ ] **Step 1: Failing tests** for `searchEmoji` (empty → 40; `thumb` → `👍` first; no match → `[]`) and `matchSlash` (`/rem` → remind; `/remind me` → `[]`; `hello` → `[]`) and a `format` test in `src/format.test.ts` if it exists (else create) that `inline('[docs](https://x.io)')` yields an anchor with `href` `https://x.io` and `javascript:` urls are dropped (use `renderToStaticMarkup` from `react-dom/server`).
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Composer UI.** Lint, test, browser check: type `/re`, pick remind, Tab completes; open emoji, search `heart`, insert; Quote button prefixes; send a `[link](https://example.com)` and see it rendered as a link.
- [ ] **Step 6: Commit** `feat(composer): slash and emoji search, more formatting, send hint`.

---

### Task 5: First-run onboarding

**Files:**
- Modify: `src/types.ts` (`User.onboarded?: boolean`; `ClientEvent` `profile` gains `onboarded?: true`), `server/index.ts` (`profile` handler ~line 975 sets `user.onboarded = true` when `ev.onboarded === true`; `normalize` leaves it undefined), `src/App.tsx` (show modal), `src/styles.css`
- Create: `src/components/Onboarding.tsx`, `server/onboarding.test.ts`

**Interfaces:**
- `Onboarding` props `{ onDone: () => void }`. Three steps in one modal with a progress dots row: (1) "Tell people who you are": display name (prefilled), title, status emoji + text; (2) "Pick your channels": checkboxes over public channels the person is not in yet (max 8 shown, sorted by member count), default channels pre-checked and disabled with the label "you are already in"; (3) "You are set": a short list of three tips (Ctrl+K, `?` for shortcuts, Profile for themes) and a Finish button. Finish sends `profile` with the fields and `onboarded: true`, then `join` for each checked channel (`{ t: 'join', channelId }` as the sidebar uses), then `onDone`.
- Shown when `snap.users[snap.me].onboarded !== true` and the account was created after the flag exists. To avoid blocking existing accounts (Review Focus 4): the server sets `onboarded: true` on every existing user once in `normalize` (`for (const u of Object.values(db.users)) u.onboarded ??= true`) and `join()` creates new users with `onboarded: false`. Test this in `server/onboarding.test.ts` by exercising the exported pure helpers: extract `markExistingOnboarded(users: Record<string, User>): void` into `server/onboarding.ts` and test that existing users get `true` and ones already `false` stay `false`.
- Dismissing the modal (Esc or the close button) sends `profile` with `onboarded: true` and no other fields, so it never shows again.

- [ ] **Step 1: Failing tests** for `markExistingOnboarded`.
- [ ] **Step 2-4: fail, implement (including the server hook in `normalize` and `join`), pass.**
- [ ] **Step 5: Build `Onboarding.tsx`** and show it from `App.tsx` once `snap` exists. Lint, test, browser check: create a fresh dev account, see the three steps, join a channel, finish, reload, no modal; sign in as an older account, no modal.
- [ ] **Step 6: Commit** `feat(onboarding): first-run profile and channel picker`.

---

### Task 6: Accessibility pass

**Files:**
- Modify: `src/App.tsx`, `src/components/MessageList.tsx`, `src/components/Composer.tsx`, `src/components/Modals.tsx`, `src/components/Views.tsx`, `src/styles.css`, `src/components/Appearance.tsx`, `src/appearance.ts`

**Interfaces:**
- Every icon-only `button` and `label` gets `aria-label` (grep `className="icon-btn"`, `rail-btn`, `rail-create`, `.actions button`, format bar, composer actions; where a `title` exists, mirror it as `aria-label`).
- Landmarks: `nav.rail` gets `aria-label="Primary"`, `aside.sidebar` `aria-label="Channels"`, `main` keeps `main`, `.panel` becomes `aside aria-label` with the panel title. A skip link `<a className="skip-link" href="#main">Skip to messages</a>` first in the shell, visible on focus; `main` gets `id="main"` and `tabIndex={-1}`.
- `Modal` traps focus (first focusable on open, Tab cycles, Esc closes, focus returns to the opener) and sets `role="dialog" aria-modal="true" aria-labelledby`.
- Live region: `<div className="sr-only" aria-live="polite">` in `MessageList` announcing "New message from {name} in {channel}" for messages that arrive while the reader is not at the bottom, only when `appearance.announce` is on (new preference `relay.announce`, default off, toggle in `AppearanceSettings` labelled "Announce new messages to screen readers").
- Sidebar rows are `button`s already; ensure `:focus-visible` is visible on `.side-item`, `.rail-btn`, `.msg .actions button` by adding rules using `--accent` outlines (the global rule exists; check these selectors do not override `outline: none`).
- Contrast: `--muted` in `aurora` (`#7fa597` on `#07130f`) and `sunset` are fine; check `daylight` `--muted #6d6a85` on `#fbfbfd` (4.9:1 ok). Add a `src/contrast.test.ts` with a small WCAG contrast function that asserts `--text`/`--bg` ≥ 7 and `--muted`/`--bg` ≥ 4.5 for every theme block parsed from `src/styles.css` (parse `[data-theme='x'] { ... }` blocks with a regex; skip blocks that use `color-mix`). Fix any theme that fails by nudging `--muted`.

- [ ] **Step 1: Write `src/contrast.test.ts`** with `contrastRatio(hexA, hexB)` in `src/contrast.ts` and the theme assertions. Run; note failures.
- [ ] **Step 2: Fix failing theme tokens; make the test pass.**
- [ ] **Step 3: Apply labels, landmarks, skip link, modal focus trap, live region, focus rings.** Lint, test. Browser check: Tab from page load reaches the skip link, Enter jumps to messages; open a modal, Tab cycles inside, Esc returns focus; `read_page` shows every rail and composer button with a name.
- [ ] **Step 4: Commit** `feat(a11y): labels, landmarks, focus trap, live region and contrast test`.

---

### Task 7: Mobile pass

**Files:**
- Modify: `src/styles.css` (the 900 px, 768 px and 640 px blocks), `src/App.tsx` (bottom tab bar), `src/components/Composer.tsx` (if needed)

**Interfaces:**
- Below 900 px: `.panel` becomes a fixed full-screen sheet (`position: fixed; inset: 0; z-index` above main) with a visible close button in its header; the sidebar is the existing drawer (`nav-open`).
- Below 768 px: bottom tab bar gets a fifth item "Search" opening the palette; the composer sits above the tab bar (`padding-bottom: calc(var(--tabbar) + env(safe-area-inset-bottom))` on `.main` or a sticky composer), message text wraps long URLs (`overflow-wrap: anywhere`), `.channel-head` collapses secondary buttons into the existing more menu, images in messages cap at `100%` width.
- No horizontal scroll at 375 px: `html, body { overflow-x: hidden }` is a last resort; find offenders with `document.documentElement.scrollWidth > innerWidth` in the browser and fix their widths.

- [ ] **Step 1: Browser check first** with `resize_window` preset `mobile`: list every overflow and reachability problem on sign-in, channel, thread panel, DMs, People, Admin.
- [ ] **Step 2: Fix them** per the interface. Re-check at 375 px and 768 px, then back to desktop.
- [ ] **Step 3: Lint, test. Commit** `fix(mobile): full-screen panel sheet, search tab, composer above tab bar, overflow fixes`.
