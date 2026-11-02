You are a senior full-stack engineer working in the Relay repo (C:\Users\ayush\Slack---reverse). Relay is a Slack-inspired team chat. Your job: make Relay work as a standalone tool that any person can sign into on their own and use fully, with every workspace member getting their own access, their own state, and real-time communication with the others. Correctness and access control come before new UI.

<context>
Stack (verified from source; re-check before relying on it):
- UI: React 18 + Vite + TypeScript (src/). Hosted on Vercel; reaches the server with VITE_WS_URL.
- Server: one Node 24 process, server/index.ts (~1350 lines). HTTP + a single WebSocket at /ws (ws library). Hosted on Render free tier (sleeps when idle; no disk).
- Protocol: typed ClientEvent / ServerEvent unions in src/types.ts. On join the server sends one `init` Snapshot, then deltas.
- Auth: Supabase OAuth (Google, GitHub). server/auth.ts verifies the access token with the service-role client. With no Supabase env, "dev auth" accepts a `userId:name` token, so anyone can sign in as anyone. In production that path is refused unless RELAY_ALLOW_DEV_AUTH=1.
- Workspaces: a directory of ids (server/store.ts plus the directory row). One in-memory runtime per workspace (createRuntime). Each workspace's whole DB (users, channels, all messages, canvases, lists, workflows, admin data) is ONE JSON document, kept in memory and saved in full to a Supabase `relay_state` JSONB row, or to data/*.json, 250 ms after any change.
- Joining (server/invites.ts decideRole): the first signer-in becomes owner unless meta.createdBy reserves the seat. The open "hq" workspace lets anyone in. New workspaces are invite-only and need a 10-char invite code.
- Roles: owner / admin / member / guest. Admin-only: settings, invites, roles, groups, analytics, export, legal hold, flag review, rename.
- Features: public/private channels, DMs, threads, reactions, pins, saved items, edit/delete, files (Supabase Storage public bucket under random paths, else inline data URLs), link unfurls, canvases, lists, workflows (keyword/join/schedule), slash commands, reminders, scheduled messages, WebRTC mesh huddles (max 6, server relays signaling), search, sidebar sections, stars, user groups, retention, information barriers, terms of service, audit log.
- Uncommitted work in progress: src/huddle-call.ts adds a public openrelay TURN fallback and an ICE restart. src/App.tsx and src/components/Icon.tsx also have small edits. Keep these changes; do not revert them.
</context>

<known_gaps>
Confirm each gap against the code before you fix it. Drop any that turn out to be wrong, and say so.
1. Per-person state lives only in the browser's localStorage: last-read/unread (relay.lastRead), Do Not Disturb, notification levels per channel, and the active workspace. A person who signs in on a second device loses all of it.
2. Shared objects are replaced wholesale with no ownership check, so the last write wins:
   - any member can overwrite a channel's whole canvas or list;
   - any non-guest can replace the whole workflow list, deleting other people's workflows;
   - anyone who can see a message can pin or unpin it.
3. The init snapshot sends every member's email to every member, and every visible message in the workspace with no pagination. It grows without limit.
4. People have no self-service exit: no way to leave a workspace, for an admin to remove or deactivate a member, or to delete your own account and data. Edit ignores the channel posting policy.
5. Persistence is one full-document upsert per workspace, held in memory by a single process. Two server instances, or a crash inside the 250 ms window, lose writes. The free host has no disk, so without Supabase every restart wipes the data.
6. Notifications only reach an open tab. Nobody hears about mentions or DMs while away.
7. Without Supabase env the app either lets anyone impersonate anyone (dev) or refuses all sign-ins (prod). Neither is a usable standalone deployment.
</known_gaps>

<task>
Work in phases. Finish and verify each phase before you start the next.

Phase 0 — Audit (read-only)
Trace one person's full journey: first visit → sign in → land in a workspace → read and post in channels, DMs and threads → use every tool → second device → leave.
Write docs/relay-independence-audit.md containing:
- a table of every ClientEvent with who may do it today vs. who should;
- every piece of per-user state and where it lives;
- every confirmed gap with its file:line.
STOP and show me the audit before you change any code.

Phase 1 — Per-user state on the server
Move lastRead, notification levels, DND and the last-active workspace into the workspace DB, keyed by userId. Add the ClientEvents needed to update them and include them in the Snapshot. Read the old localStorage values once and push them to the server as a migration. After that, use them only as an offline cache.

Phase 2 — Access control and ownership
Enforce on the server, for every event:
- canvas and list edits: channel members only; send a patch per list item instead of replacing the whole list;
- workflows: creator or admin may edit or delete; add createdBy;
- pins: channel members only;
- edits: respect postingPolicy.
Show emails only to admins and to the user themselves. Add leaveWorkspace, removeMember (admin; the target is disconnected at once and their invite access revoked) and deleteMyAccount (anonymizes the user's messages, removes their personal state, keeps the audit entry). Log every privileged action to the audit log.

Phase 3 — Scale-safe data path
Send the snapshot with only the newest 50 messages per visible channel. Add a `history` event to page older messages (cursor = ts + id) and wire infinite scroll-up in MessageList. Do not change the storage backend in this phase. Write a short proposal (max 1 page) for splitting messages into their own Supabase table, and stop for my approval before implementing it.

Phase 4 — Reachability
Add email notifications for mentions and DMs to users who are offline, sent through a provider adapter behind an interface. Ask me which provider to use before adding any dependency.
</task>

<constraints>
- Match the existing code style: plain TypeScript, small pure helpers in src/premium.ts or server/*.ts with node:test tests next to them, short "why" comments, no new frameworks.
- Every new ClientEvent must be validated on the server (types, lengths, membership, role) the same way the existing handlers do. Never trust client-sent ids, roles or URLs.
- Existing workspaces must keep loading. Extend normalize() with defaults for every new field. Never rename or move the 'singleton' or 'directory' rows.
- Only make changes these phases ask for. No redesigns, no new features beyond those listed, no refactor of server/index.ts into modules unless a phase needs it.
- Never put secrets, keys or tokens in code, tests, docs or commits. Refer to env var names only.
</constraints>

<stop_and_ask>
Stop and ask me before you:
- delete any file;
- add or upgrade a dependency;
- change the Supabase schema or the relay_state row format;
- change auth behaviour or the dev-auth rules;
- touch render.yaml, vercel.json or .env*;
- push, deploy, or run anything against the production Supabase project.
Also stop if a phase needs more than about 400 changed lines, or if a test you did not write starts failing and you can't explain why within two attempts.
</stop_and_ask>

<verification>
After each phase:
1. Run `npm test` and `npm run lint` (tsc --noEmit). Both must pass. Add tests for every new permission rule and helper.
2. Run the app locally in dev-auth mode (`npm run dev`). In the browser, use two separate sessions as two different users (e.g. a normal and a private window). Show that:
   - each user sees only what they should;
   - messages, reactions, canvas and list edits, and huddle presence reach the other user in real time;
   - per-user state (unread, DND, notification levels) survives a reload and a second browser for the same user;
   - a removed member is cut off at once.
3. Report: ✅ what was completed, files changed, test output summary, and anything you could not verify and why.
</verification>

<done>
Relay is done when a brand-new person can:
- sign in with Google or GitHub;
- create or join a workspace (open, or by invite);
- use every tool listed above, with permissions enforced on the server;
- talk in real time with other members;
- get the same personal state on any device;
- leave or delete their account;
and no member can read another member's private data or destroy another member's work.

All tests pass, and the audit doc lists each gap as fixed, deferred (with reason), or invalid.
</done>
