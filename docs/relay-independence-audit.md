# Relay independence audit (Phase 0, read-only)

Scope: `server/index.ts`, `server/{auth,invites,store}.ts`, `src/types.ts`, `src/{store,notify,appearance}.ts`.
Baseline before any change: `npm test` 42 pass / 0 fail, `npm run lint` clean.
Line numbers are `server/index.ts` unless a path is given.

## 1. Journey trace

1. **First visit.** UI loads from Vercel; `useAuthToken` (`src/store.ts:152`) gets a Supabase session (Google/GitHub) or, with no Supabase env, a dev session kept in `localStorage` (`src/store.ts:124`).
2. **Sign in.** The socket opens and the client sends `auth` with the token, an optional invite and the remembered workspace id (`src/store.ts:198`). `route()` (`:1229`) calls `resolveIdentity` (`:210`), then `pickWorkspace` (`:1217`): invite owner, then requested id, then first workspace the user is in, then open HQ.
3. **Land in a workspace.** `join()` (`:473`) calls `decideRole`. The first signer becomes owner unless `meta.createdBy` reserves the seat. A new user is added to `#general` and `#random`. The server sends `init` with the full snapshot (`:321`), broadcasts the user (with email) and presence.
4. **Read and post.** `send`, thread replies, DMs (`openDM`), reactions, pins and edits are all handled in `handle()`. A broadcast reaches only the users who `canSee` the channel.
5. **Tools.** Canvas, lists, workflows, reminders and scheduled messages, huddles (WebRTC mesh, signaling relayed at `:760`), search, sections, stars, groups, retention, barriers, terms, audit, export.
6. **Second device.** A new `localStorage` means no unread state, DND, notification levels or last workspace. The server returns only saved, sections, starred and scheduled.
7. **Leave.** Nothing exists to leave a workspace, be removed, or delete an account. Only the channel `leave` (`:672`) exists.

## 2. ClientEvent permission table

"Today" is what the server enforces. "Should" is the target for Phases 1-3. "member" means any non-guest. "visible" means `canSee(channel)`.

| Event | Line | Today | Should |
|---|---|---|---|
| auth | 1229 | valid identity; join rules from `decideRole` | same. Reject removed users (needs a block list, see Q2) |
| createWorkspace | 1254 | any signed-in user, max 20 owned | same |
| renameWorkspace | 931 | admin | same + already audited |
| star | 941 | any user; does not check `canSee` | channel must be visible |
| inviteCreate / inviteRevoke | 914 / 922 | admin, audited | same |
| send | 522 | visible + postingPolicy + barrier | same |
| edit | 584 | author + visible; ignores postingPolicy and barrier | author + `mayPost` |
| delete | 597 | author, or admin; author need not still see the channel | author only while visible, or admin; keep audit of admin deletes |
| react | 609 | visible | same |
| pin | 622 | any user who can see the message | channel member only |
| save | 631 | own list, id not validated | own list; id must be a visible message |
| createChannel | 638 | any user, guests included | member+ only (guests cannot create) |
| join | 662 | public + visible | same |
| leave | 672 | channel member | same |
| openDM | 686 | any user id, barrier-checked; guests can DM anyone | guests: only users they share a channel with |
| typing | 695 | visible | same |
| profile | 701 | self; `name`/`status` not type-checked (throws on bad input) | self, validated |
| canvas | 710 | any user who can see the channel; whole-document overwrite | channel member only; keep whole doc but add `updatedBy`, audit nothing (high volume) |
| workflows | 718 | any non-guest; replaces everyone's list | creator or admin edits/deletes; `createdBy` field |
| schedule / unschedule | 726 / 742 | self, `mayPost` | same |
| huddle / rtc | 748 / 760 | visible, barrier-checked; signals only inside a shared call | same |
| list | 771 | any user who can see the channel; whole-list overwrite | channel member only; per-item patch event |
| sections | 786 | self | same (also push to all own tabs) |
| groups | 797 | admin, audited | same |
| flag | 810 | visible, 1 per user per message | same |
| resolveFlag | 827 | admin, audited | same |
| role | 845 | admin, with owner-only rules, audited | same |
| channelPolicy | 866 | admin, audited | same |
| addMember | 875 | any member of the channel; guests need admin | same |
| settings | 889 | admin, audited | same |
| legalHold | 907 | admin, audited | same |
| acceptTerms | 949 | self | same |
| fileSummary | 955 | visible | same |
| analytics | 968 | admin | same |
| export | 973 | admin, audited. Contains every private channel and DM, plus emails | admin; decide if DMs belong in it (Q3) |
| (missing) leaveWorkspace, removeMember, deleteMyAccount | none | none | Phase 2 |
| (missing) per-user state events, `history` | none | none | Phase 1 / 3 |

## 3. Per-user state and where it lives

| State | Where today | File | Lost on new device |
|---|---|---|---|
| Last-read per channel (`relay.lastRead`) | browser localStorage, stamped with the client clock | `src/store.ts:293-305` | yes |
| Do Not Disturb until (`relay.dndUntil`) | browser localStorage, one value for all workspaces | `src/notify.ts:9,26` | yes |
| Channel notification levels (`relay.levels.<ws>`) | browser localStorage | `src/notify.ts:62-82` | yes |
| Active workspace (`relay.workspace`, `?ws=`) | browser localStorage | `src/store.ts:104-112`, `src/App.tsx:45` | yes |
| Theme, background, accent, custom background | browser localStorage | `src/appearance.ts:69+` | yes (not in the listed gaps) |
| Banner dismissed (`relay.alertBanner`) | browser localStorage | `src/App.tsx:104,578` | yes (cosmetic) |
| Dev session token | browser localStorage | `src/store.ts:124-148` | n/a |
| Saved items | `db.saved[userId]` | `:632` | no |
| Sidebar sections | `db.sections[userId]` | `:788` | no |
| Starred channels | `db.starred[userId]` | `:943` | no |
| Scheduled messages and reminders | `db.scheduled` | `:737` | no |
| Terms accepted | `db.termsAccepted[userId]` | `:950` | no |
| Profile, role | `db.users[userId]` | `:701` | no |

## 4. Known gaps, checked against code

| # | Verdict | Evidence | Planned fix |
|---|---|---|---|
| 1 | **Confirmed** | See table in section 3. Extra: the unread cutoff uses the client clock (`Date.now()` at `src/store.ts:301`), so a skewed device marks wrongly. | Phase 1 (Q1 below on DND and last workspace) |
| 2a | **Confirmed** | canvas overwrite `:713`; list overwrite `:774`. Any workspace member can write a public channel's canvas or list. | Phase 2 |
| 2b | **Confirmed, and worse** | `:720` replaces the whole list. In `cleanWorkflow`, a client-chosen `id` matching an existing workflow keeps the old target channel (`:454`, `:458`), so anyone can rewrite another person's workflow text. | Phase 2 |
| 2c | **Confirmed** | `:624-625` toggles `pinned` for anyone who can see the message. | Phase 2 |
| 3 | **Confirmed** | `users: db.users` at `:323` and `broadcast user` at `:507` carry `email`. `messages` at `:331` has no limit. Also the whole user list (including guests) goes to every user. | Emails: Phase 2. Pagination: Phase 3 |
| 4 | **Confirmed** | `leave` is channel-only (`:672`). No remove, deactivate or delete-account event in `ClientEvent` (`src/types.ts:218`). `edit` at `:586` never calls `canPost`. | Phase 2 |
| 5 | **Confirmed** | Full-document upsert `server/store.ts:43-47`, debounce `:241-256`. A failed save sets `dirty = true` but schedules no retry, so it waits for the next change. No version check, so two instances overwrite each other. Without Supabase, data goes to `data/*.json`, which does not survive a Render restart. | Deferred past Phase 3 (storage change needs your approval); Phase 3 proposal covers it |
| 6 | **Confirmed** | `src/notify.ts:130-142` uses the in-page `Notification` API only. No service worker or push code exists in the repo. | Phase 4 (email) |
| 7 | **Confirmed** | `:203-217`. No env in dev: anyone signs in as anyone. No env in production: all sign-ins refused. | Not fixed here (auth rules are a stop-and-ask item). Needs your decision (Q4) |

## 5. New findings, not in your list

| # | Severity | Evidence | Note |
|---|---|---|---|
| N1 | Medium | `:1268-1270` writes the directory entry before the workspace row. A crash between them leaves an id whose row is missing. On restart `loadRuntime` seeds it with `inviteOnly=false` and no `createdBy` (`:1192`, `:87`). The first person to connect to it becomes owner of an open workspace. | Fix: write the workspace row first, then the directory. Small change in Phase 2 |
| N2 | Medium | `export` (`:976`) includes all private channels and DMs. Admins can read every DM in a workspace through it. | Decision Q3 |
| N3 | Low | `saved` (`:634`) and `sections` (`:793`) reply only to the sending socket; the user's other tabs and devices stay stale. `star` (`:945`) handles this correctly. | Fix in Phase 1 |
| N4 | Low | Removing a member from an open workspace (HQ) has no effect unless the server keeps a block list, because `decideRole` lets anyone back in (`server/invites.ts:29`). Invites are shared codes, not per-user, so "revoke their invite" has no meaning. | Needs a `removed` list in the workspace DB (Q2) |
| N5 | Low | Dev auth: a `userId` such as `constructor` makes `db.users[userId]` truthy (`:475`), so `join()` writes properties onto a built-in object. Dev only. | Not fixed without your OK (auth rules) |
| N6 | Low | `profile`, `createChannel` and others assume string input; bad types throw and return "Server error" instead of a clean rejection. | Fix where each phase touches the handler |
| N7 | Info | `.env.production` is committed and holds the Supabase URL and the public anon key. The anon key is designed to be public and RLS is enabled on the table (`docs/supabase-setup.md:22`), so this is not a leak. I did not touch the file. | None |

## 6. Questions that block Phase 1 and 2

- **Q1. Where do cross-workspace per-user values live?** Last-active workspace and a global Do Not Disturb belong to the person, not to one workspace. Each workspace has its own DB, so a workspace DB cannot hold them. Options: (a) add a `users` map to the `directory` row (changes the row format, needs your approval); (b) a new `user-<id>` row in `relay_state` (same table, new row ids, needs your approval as a schema-adjacent change); (c) store DND per workspace and drop "last-active workspace" server-side, falling back to "first workspace you are in". Recommended: **(c) for Phase 1**, because it needs no format change. Unread and levels are per workspace and fit the workspace DB without question.
- **Q2. Removed members.** OK to add `removed: string[]` to the workspace DB so a removed user cannot rejoin (even an open one) until an admin re-adds them? Recommended: yes.
- **Q3. Export scope.** Should admin export keep DMs and private channels, or exclude them? Recommended: exclude DMs and private channels unless a legal hold covers the user.
- **Q4. Standalone auth.** For Gap 7 the real fix is Supabase env on the host; that is configuration, not code. I recommend leaving auth untouched and marking this one "deferred: deployment config".

## 7. Gap status (final status updated at the end of each phase)

| Gap | Status |
|---|---|
| 1 | **fixed in Phase 1** (unread, levels, DND on the server; last-active workspace stays in localStorage per Q1c, deferred) |
| 2 | **fixed in Phase 2a** (canvas, list, pin: channel members only; list is per-item patches; workflows: creator or admin, `createdBy`) |
| 3 | **fixed**: emails (Phase 2a); join snapshot now newest 50 per channel plus `history` paging (Phase 3). Known limit: search, Activity and unread counts only see loaded messages |
| 4 | **fixed in Phase 2** (edit respects postingPolicy; `leaveWorkspace`, `removeMember`, `restoreMember`, `deleteMyAccount`) |
| 5 | **deferred**: proposal in `docs/relay-messages-table-proposal.md`, waiting for your approval |
| 6 | **engine built in Phase 4** (offline detection, batching, opt-out, tests); sending is off until you choose a provider |
| 7 | open, pending Q4 |
| N3 | **fixed in Phase 1** |
| N1 | **fixed in Phase 2a** |
| N2, N4, N5, N6 | open |
