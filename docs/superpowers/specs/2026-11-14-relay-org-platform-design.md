# Relay as an organisation platform: design

Date: 2026-11-14. Status: approved 2026-11-14 with scale deferred (owner: "for now no need to scale, complete other things").

## 1. Intent

Relay today is a prototype: a Slack-style chat whose whole workspace lives in one JSON document held in memory by one Node process and pushed in full to every browser on connect. Sign-in is Google or GitHub OAuth through Supabase only.

The goal is a standalone application one organisation deploys for itself. Anyone in the organisation signs up or logs in, finds any colleague, messages them directly, and does the day-to-day work a management app covers: channels and threads, tasks, calendar, announcements, documents, people directory, admin. It must look and feel like a finished product. Scale to 60,000 accounts is deferred (see section 3); the current single-process document store stays.

## 2. Goals

- One organisation per deployment. Every member can see the directory and DM any other member.
- Self-service sign-up with email and password (verified), plus Google, GitHub and Microsoft sign-in. Password reset. Admin-controlled allowed email domains and invite links.
- Keep the current document store (`relay_state` row or `data/db.json`) and single server process. New features extend the document.
- Management features beyond chat: tasks and projects, calendar and meetings, announcements with read receipts, polls, people directory with org chart, personal profile and availability, notifications centre with email digests, file library, full-text search.
- A redesigned app shell: three-pane layout, command palette, light and dark theme, virtualised message list, keyboard navigation, mobile layout, accessible contrast and focus states.
- Existing features keep working: threads, reactions, pins, saved items, canvases, lists, pages and databases, workflows, scheduled messages, huddles, admin console, audit, retention, legal hold, export.

## 3. Non-goals

- **Scale.** Owner decision 2026-11-14: no Postgres table split, no Redis, no replicas, no pagination rewrite for now. The earlier 60k design (sections 7.2 and 7.5 of the first draft) is in git history for later.

- Multi-tenant SaaS (several organisations on one deployment). The schema keeps an `org_id` column so it can come later, but the app and UI assume one organisation.
- SAML or SCIM provisioning. Supabase Auth supports SAML on paid plans; it is wired later, not now.
- Voice and video beyond the existing WebRTC huddles (max 6 peers). A media server (SFU) is a later project.
- Native mobile apps. The web app is responsive.
- End-to-end encryption.
- Message history import from Slack or Teams.

## 4. Anti-goals

- Losing the Relay look. The dark aurora identity, motion and robot stay on the public pages; the app shell gets more discipline, not a generic template.

## 5. Constraints

- Keep the current stack: React 18, Vite, TypeScript, Node 24, `ws`, Supabase. New libraries are allowed where they remove real work (see section 8).
- Keep deployment on Vercel (UI) and Render (server), one instance.
- Supabase project: Auth, Storage, and the existing `relay_state` table. The server uses the service-role key.
- Tests stay on `node --test` with the file store, as today.
- Windows development machine. Scripts must run under PowerShell and Git Bash.

## 6. Approaches considered

1. **Supabase-backed, own realtime server (chosen).** Auth and Storage from Supabase. Our Node server owns all reads and writes over the existing WebSocket protocol and document store. Owner then chose to defer the Postgres table split, Redis and replicas: features first, scale later.
2. **Fully self-hosted.** Docker Compose with Postgres, Redis, MinIO, own JWT auth and email. True standalone, but auth, password reset, email delivery, OAuth and file storage all become our code and our operations burden. Rejected for scope.
3. **Supabase Realtime and RLS from the browser.** Clients subscribe to Postgres changes directly. Least server code, but permission logic spreads into RLS policies, fan-out to thousands of subscribers per channel is costly on Supabase Realtime, and rate limiting and audit are harder. Rejected.

## 7. Architecture

```
Browser (React) ──HTTPS──▶ Vercel (static)
     │
     └──WSS /ws, HTTPS /api ──▶ Render: relay-server × 1 (Node)
                                     ├──▶ Supabase Auth (token verify), Storage (files)
                                     └──▶ Supabase Postgres: relay_state JSONB (or data/db.json locally)
```

### 7.1 Server

- Stays `server/index.ts` plus modules. One process. The workspace document (`DB` interface) gains new collections; every change saves the document as today.
- New client events for every new feature, handled in `route()`/`handle()` with checks in `server/access.ts`. Input validated with `zod` so bad payloads return an `error` event instead of throwing.
- Existing `history` paging, `messageSync`, notifications, mailer, invites, pages, databases and collab runtimes are reused.
- Jobs (scheduled messages, workflow schedules, retention, digests, event reminders) keep running on the single process's timers.

### 7.2 Data model additions (document collections)

Added to the workspace document, all arrays of objects keyed by `id`:

- `users` gains: `handle`, `departmentId`, `managerId`, `phone`, `timezone`, `availability` (`available|busy|away|ooo`), `oooUntil`, `oooNote`, `workingHours`, `lastActiveAt`, `deactivatedAt`, `onboarded`.
- `departments[{id, name, parentId, leadId}]`
- `channels` gains: `kind` adds `group_dm` and `announcement`; `purpose`, `archivedAt`, `managers: string[]`, `pinnedLinks`.
- `channelState[userId][channelId]`: `{lastReadTs, level, muted}` (unread state moves server-side so a second device sees it).
- `readReceipts[channelId]: {userId: ts}` for DMs and group DMs.
- `messages` gain: `editHistory`, `forwardedFrom`, `pollId`, `taskId`.
- `announcements[{id, channelId, messageId, requiresAck, createdBy}]`, `announcementAcks[{announcementId, userId, ts}]`
- `polls[{id, messageId, question, options, multiple, anonymous, closesAt, createdBy}]`, `pollVotes[{pollId, userId, options: number[]}]`
- `projects[{id, name, description, channelId, ownerId, status}]`, `tasks[{id, projectId, channelId, title, description, status, priority, assigneeId, creatorId, dueAt, order, labels, checklist, comments, createdAt, completedAt, fromMessageId}]`
- `events[{id, title, description, startsAt, endsAt, allDay, location, channelId, huddle, organiserId, attendees: {userId, response}[], recurrence, reminderSent}]`
- `notifications[{id, userId, kind, actorId, channelId, messageId, data, readAt, ts}]` capped at 500 per user.
- `files[{id, channelId, messageId, uploadedBy, name, type, size, url, ts}]` index built from messages on load and kept in sync on send.
- `settings` gains: `allowedDomains`, `defaultChannels`, `defaultRole`, `fileQuotaMb`, `orgName`, `logoUrl`.
- `admin.imports[]`: CSV import jobs with progress.

The org is the `hq` workspace. The multi-workspace switcher is hidden in the UI; the server keeps the directory so nothing breaks.

### 7.3 Client

- `src/store.ts` keeps the snapshot model. New collections arrive in `init` and are patched by delta events, as today.
- Message list becomes virtualised (`@tanstack/react-virtual`) because long channels already stutter; this is a UI fix, not scale work.
- Unread state, notification levels and DND read from the server (`channelState`) with `localStorage` only as a cache.

### 7.4 Auth

- Supabase Auth with: email + password (email verification required), Google, GitHub, Microsoft (Azure) OAuth, magic link. Password reset through Supabase's flow with branded pages (`/reset`).
- On first token the server creates the user. Sign-up is accepted when: the email domain is in `settings.allowedDomains`, or the request carries a valid invite, or the org is open and not invite-only. Otherwise an `authError` with a clear message.
- `RELAY_OWNER_EMAIL` env var decides the owner; until that person has signed in, only allowed-domain or invited sign-ups succeed. Without the var, the first signer becomes owner (dev convenience) and the admin console shows a warning.
- OAuth emails count as verified only when the provider's `email_verified` claim is true.
- Token verification: JWKS when `SUPABASE_JWKS_URL` is set, else HS256 with `SUPABASE_JWT_SECRET`, else the existing network call to Supabase `getUser`. Deactivated users are rejected on connect.
- Dev mode (no Supabase env) keeps the name-only dev login and adds a dev email + password form that stores a salted hash in the document, so the whole sign-up flow is testable offline.

## 8. New dependencies (builder may swap for equivalents)

- `jose` for JWT verification; `zod` for input validation on every WS payload; `@tanstack/react-virtual` for the message list. Calendar math stays in `calendarMath.ts`.

## 9. Features to build

Existing features are listed only where they change.

### Chat
- Channels: public, private, announcement (admins post, everyone reads, optional acknowledgement), group DMs up to 9 people, archive, channel managers, channel description and pinned links, member list with roles, browse and join with member counts.
- Messages: markdown subset (bold, italic, code, code block, quote, lists, links), @user, @group, @channel/@here, #channel links, emoji picker with search and skin tones, reactions, edit with history, delete, pin, save, forward, copy link, thread with follow and unfollow, read receipts in DMs and group DMs only, unread divider, jump to date, drafts per channel kept locally.
- Composer: slash commands (existing `/remind`, `/poll` new, `/task` new, `/status`, `/dnd`), file drag and drop with progress, paste image, audio clip, scheduled send.
- Search: across messages, files, people, channels, tasks, pages; filters by from, in, before, after, has:file, has:link; server-side over the document, results paged 50 at a time.

### People
- Directory: card grid with search, filter by department, title, availability; sort by name. Profile page: title, department, manager, reports, phone, timezone with local time, working hours, status, out-of-office note, shared channels, "message" and "schedule meeting" actions.
- Org chart: tree from `manager_id`, collapsible, searchable.
- Presence and availability: online, away (10 min idle), DND, OOO with return date and automatic reply note shown in DM header.

### Tasks and projects
- Projects attached to a channel or standalone. Views: board by status, list, my tasks across projects, calendar by due date. Task drawer: description, assignee, due date, priority, labels, checklist, comments, link to a message ("create task from message"). Notifications on assign and due today.

### Calendar
- Personal and channel calendars. Create event, invite attendees, responses, recurrence (daily, weekly, monthly), reminders 10 minutes before, "start huddle" on events with `huddle`. Week, day, month, agenda views. Free/busy hint when picking attendees. The existing pages-calendar becomes this calendar.

### Announcements and polls
- Announcement channel posts show in a top banner until acknowledged when `requires_ack`. Admin sees ack percentage and who has not acknowledged, and can remind.
- Polls: single or multiple choice, anonymous or open, close time, live results.

### Notifications
- Notification centre (bell): mentions, replies, reactions on my messages, task assignments, event invites, announcements. Mark read, mark all read. Per-channel levels (all, mentions, nothing) and mute. Desktop notifications through the Notifications API. Daily email digest of unread mentions through the existing mailer, off by default per user.

### Files
- Channel file library tab: grid and list, type filter, preview for images, PDF and text, download. Upload through the server to Supabase Storage as today; 25 MB per file; org-level quota setting.

### Admin console (grows)
- Members: table with search, role, department, status, last active; bulk CSV import (name, email, title, department, manager) creating invites or pre-provisioned accounts; deactivate and restore; reset role.
- Departments: create, nest, set lead.
- Sign-up policy: allowed domains, invite-only toggle, default channels, default role.
- Channels: list, archive, convert public/private, posting policy, delete.
- Existing: audit log, retention, legal hold, flags, barriers, terms, analytics (messages per day, active users, top channels, computed from the document), export.

## 10. UI redesign

- **Shell:** left rail (Home, DMs, Activity, Tasks, Calendar, People, Pages, Search, Admin), collapsible sidebar with sections and unread badges, main pane, right pane for thread, profile, channel details, or task drawer. Width breakpoints: three panes above 1280 px, two above 900 px, single pane with bottom tab bar below.
- **Theme:** keep the aurora palette as the dark theme; add a light theme with the same accent. Both from CSS variables in one `tokens.css`. Density toggle (comfortable, compact). Font: keep current display font for headings; use system UI stack for body text.
- **Command palette** (`Ctrl+K`): channels, people, pages, tasks, commands ("Create task", "Set status", "Toggle theme"). Replaces the current search modal; search results page is separate.
- **Messages:** grouped by author within 5 minutes, hover toolbar (react, reply, save, more), inline thread preview with avatars, compact system messages, date dividers, "new messages" divider, smooth scroll anchoring on prepend.
- **Composer:** single-line that grows, toolbar below (format, emoji, mention, attach, slash, schedule), send on Enter, Shift+Enter newline, mention and emoji autocomplete popovers.
- **Empty states and onboarding:** first run asks for name, title, department, avatar, then suggests channels and people.
- **Accessibility:** every control reachable by keyboard, visible focus ring, `aria-live` for new messages off by default, colour contrast AA, reduced-motion respected (motion already has a flag).
- **Public pages** (landing, sign-in, help): keep the current design; sign-in page gets the email and password form, sign-up tab, forgot password, and the three OAuth buttons.

## 11. Migration from the prototype

- Document format changes are additive. `load()` runs an `upgrade(doc)` step that fills missing collections and fields with defaults, so existing `relay_state` rows and `data/db.json` keep working. No separate script.
- Existing workspaces other than `hq` stay in storage but are hidden from the UI.

## 12. Delivery order (for the plan)

1. Auth: email + password sign-up and sign-in, verification, reset, Microsoft, allowed domains, owner bootstrap, deactivation, dev offline auth. Document `upgrade()` and `zod` validation scaffold.
2. App shell and UI redesign: tokens, light theme, three-pane layout, rail, command palette, virtualised message list, composer, message rendering, mobile layout, onboarding.
3. People: profile fields, directory, org chart, departments, availability and OOO, presence rules, guest scoping.
4. Chat growth: group DMs, announcement channels, archive, channel managers, forward, edit history, read receipts, server-side unread state, search filters and search page.
5. Notifications centre, per-channel levels, desktop notifications, email digests.
6. Tasks and projects (board, list, my tasks, drawer, task from message).
7. Calendar (events, attendees, recurrence, reminders, huddle from event, views).
8. Announcements with acks, polls, file library.
9. Admin console growth: members table, CSV import, departments, sign-up policy, channel management, analytics.
10. Docs (`docs/supabase-setup.md` rewrite, `docs/deploy.md`), README update, final test and lint pass.

Each step ends with `npm test` and `npm run lint` green and is committed on its own.

## 13. Left to the builder

- Component file layout under `src/components`, CSS file split, icon additions.
- Exact wording of empty states, errors, and emails.
- Choice between `jose` and `jsonwebtoken`.

## 14. Calls made without asking (correct me)

- One organisation per deployment; the workspace switcher is hidden in the app UI. Other prototype workspaces stay in storage, hidden.
- Microsoft sign-in added alongside Google and GitHub because most organisations run on Microsoft 365 or Google Workspace.
- Email verification required for password sign-up; OAuth emails count as verified.
- Guests remain a role but cannot use the directory or DM people outside their channels.
- Huddles stay WebRTC mesh at 6 peers; calendar events can start one.
- Read receipts only in DMs and group DMs, not in channels.
- Email digests off by default; mentions and DMs can turn on instant email when the user is offline for over 10 minutes (uses existing mailer).
- Light theme added; dark stays default.

## 15. Builder check: decisions

Answers 1, 2, 4, 8, 11 and 12 below referred to the table and Redis design and are superseded by the no-scale decision. Answers 3, 5, 6, 7, 9 and 10 still apply, with 6 reduced to the additive `upgrade()` step.

A reviewer read this document as a builder and asked twelve questions. Answers below; each is a decision unless marked as a question for the owner.

1. **Step 1 scope.** Step 1 keeps the existing screens and swaps the data layer under them. Minimum working set at the end of step 1: sign-in (all methods), org join policy, sidebar channel list with unread counts, channel history with upward paging, send, DMs, presence, typing. Everything else stays on the old code path only if it can; features that cannot run without the blob are disabled behind a flag until step 2. Screens are touched twice (step 1 data, step 3 look); the store rewrite in 7.3 is done once in step 1 with the old components adapted to it.
2. **Local development and tests.** Supabase CLI local stack (`supabase start`, needs Docker Desktop on Windows) provides Postgres, Auth and Storage; Redis runs from the same Docker Compose file. Tests that need a database run when `RELAY_TEST_DB_URL` is set; otherwise they are skipped and `npm test` stays green. Tests mint tokens with a test HS256 secret through `jose`; the server reads `SUPABASE_JWT_SECRET` for HS256 and falls back to the project JWKS URL when the secret is absent.
3. **Token verification.** Both: JWKS (asymmetric, cached, refreshed hourly) when `SUPABASE_JWKS_URL` is set, HS256 shared secret otherwise. The live project is checked at step 1 and the docs state which to set.
4. **Default channels.** `channels.is_default` marks a channel every active non-guest user belongs to without a `channel_members` row. A row is created on first read (`last_read_ts`), mute, star, or leave (`left_at` set). Leaving a default channel is allowed; the row with `left_at` is the override. Flipping `is_default` off keeps implicit members as members by inserting rows in a background job (chunked, 5,000 at a time). Guests never get implicit membership. `member_count` for default channels is `active non-guest users minus left rows`, computed on read and cached in Redis for 60 seconds. Fan-out and unread counts treat implicit members the same as rows.
5. **Guests.** Section 2 applies to members; guests are the exception. A guest sees only the members of channels they belong to, can DM only those people, is excluded from directory search and org chart, and cannot be @-mentioned from outside. Information barriers apply on top for everyone.
6. **Migration.** Private channels keep their kind and members. Name collisions get the workspace prefix (`ws-name--channel`). Per-workspace roles collapse to the highest role the person held anywhere, except owner, which only the `hq` owner keeps. Pages and teamspaces import with a teamspace per former workspace. *Question for the owner: is there real production data on the live deployment worth migrating, or only demo data? With demo data only, the script still runs but is not polished.*
7. **Bootstrap.** `RELAY_OWNER_EMAIL` env var: the first sign-in with that email becomes owner; until an owner exists, nobody else can sign up unless their domain is allowed by `RELAY_ALLOWED_DOMAINS` (seed for `orgs.allowed_domains`). No first-come owner. OAuth emails count as verified only when the provider's `email_verified` claim is true; Microsoft accounts without it go through the same email verification as password sign-up.
8. **Collaboration across replicas.** No sticky routing (Render has none). Each replica keeps an in-memory copy of the documents its sockets are editing. Ops are published on Redis `page:<id>`; every replica applies ops from Redis to its copy and to its sockets. Persistence is a debounced write with a `version` column and `where version = $expected` optimistic check; on conflict the replica reloads and reapplies. This reuses the existing op-based `collabRuntime.ts` and adds a Redis layer, not a merge engine.
9. **Scope limits.** Recurrence: daily, weekly (chosen weekdays), monthly (same day), with `until`; editing applies to the whole series; no per-occurrence exceptions; times stored in UTC with the organiser's timezone recorded for display. Free/busy hint: overlap check against attendees' accepted events for the chosen slot. Task checklist: `checklist jsonb` on `tasks`. Sections: per-user sidebar groups, as today. Quota: checked at signed-URL issue time against a `files` size sum cached per org. Audio clips: as today. Forward: new message quoting the original with a link to it.
10. **Email.** Supabase Auth sends verification, magic link and reset mail through custom SMTP (Resend) configured in the Supabase dashboard; the docs walk through it. Our mailer sends digests and instant mention mail. CSV import creates invite links by default; the "pre-provision" option calls the Supabase admin `inviteUserByEmail` API in batches of 50 with a 1-second gap, run as a background job with progress shown in the admin console. Arrival of 60k accounts is expected over weeks, not in one burst.
11. **Search.** `tsvector` with GIN, ranked by `ts_rank_cd` then `ts desc`. Visibility is a per-query SQL filter: `channel_id in (my channel_members rows where left_at is null union channels where is_default and I am not a guest and no left_at row)`, plus barrier exclusion. Trigram search is for people and channel names only.
12. **Load targets.** The numbers in 7.5 are checked on a Render staging service with two Starter instances and a Starter Redis before the final step; the load script also runs locally for correctness at 200 simulated users. If staging is not available, the numbers stay targets and the README says they are unverified. *Question for the owner: 60k needs paid infrastructure (Render Starter or above for two instances and Redis, Supabase Pro for pooling and storage). Is that budget acceptable?*
