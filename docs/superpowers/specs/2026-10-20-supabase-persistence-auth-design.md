# Relay: Supabase Persistence + Real Auth — Design

Date: 2026-10-20
Status: Approved (pending spec review)

## Goal

Make Relay durable and multi-user with real accounts:

1. **Persistence** — replace the ephemeral `db.json` file store with Supabase Postgres so chat state survives restarts and redeploys (no paid Render disk needed).
2. **Real auth** — replace the "name in localStorage" identity with GitHub/Google OAuth via Supabase Auth.
3. **Ownership + invites** — the first person to sign in creates the workspace and becomes owner; everyone else joins via a shareable invite link/code the owner manages.

Out of scope for this spec: real audio huddles, LLM-backed AI features, SSO/SCIM, multiple workspaces. (LLM AI is a separate follow-up; user will supply an OpenAI key.)

## Decisions

| Decision | Choice |
| --- | --- |
| Scope | Persistence **and** real auth |
| Auth method | OAuth |
| Providers | GitHub **and** Google |
| Ownership | First authenticated user creates the workspace and becomes owner |
| Join model | Invitation required (except the first/owner) |
| Invite mechanism | Shareable invite link/code; owner generates and revokes from Admin panel |
| Persistence shape | Single-row JSONB snapshot of the whole DB object |
| Token verification | Server-side via Supabase admin client (`auth.getUser`) |

## Approach & rejected alternatives

### Persistence: single-row JSONB snapshot (chosen)

The server already loads the entire DB into memory (`load()` in `server/index.ts`) and
rewrites the whole object on every mutation via a debounced `persist()`. Keep that model
exactly; swap the file for one Postgres row.

- **Rejected — normalized tables** (users/channels/messages/…): a large rewrite of every
  event handler for query-ability the app never uses, since it holds everything in memory.
- **Rejected — Supabase Realtime replacing the WebSocket**: discards the working WS server
  for no real gain.

### Auth: verify the Supabase JWT server-side (chosen)

The browser performs OAuth with `supabase-js`. On WebSocket connect it sends its access
token; the server validates it with the Supabase **admin** client and derives identity
authoritatively. This also closes a real hole: today the client simply *claims* its
`userId`/`name` in the `hello` event.

- **Rejected — decode the JWT locally with the project secret**: slightly faster (no network
  per connect) but requires managing the secret and signing algorithm. `getUser` is simpler
  and robust; connection frequency is low.

## Architecture

### Data flow (auth + invites)

```
Browser loads
  └─ supabase-js checks for a session
       ├─ no session → Login screen: [Sign in with GitHub] [Sign in with Google]
       │                 (+ invite code field, auto-filled from ?invite=CODE)
       └─ session exists → open WebSocket, send { t:'auth', token, invite? }
                               │
                      Server verifies token (supabaseAdmin.auth.getUser)
                               │
          ┌────────────────────┼─────────────────────────────┐
     no owner yet          already a member              new user + valid invite
     → create owner        → let in, send init           → create member, send init
     (workspace created)                                  invalid/no invite → error
```

The server is the authority on identity (`id`, `name`, `avatarUrl`, `email` come from the
verified token). Invite codes live in the DB; the join link is `https://…/?invite=CODE`.

### Components

**Frontend**

- `src/supabase.ts` *(new)* — supabase-js client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- `src/components/Login.tsx` *(new)* — replaces the name-in-localStorage screen; GitHub/Google
  OAuth buttons and an invite-code field (auto-filled from `?invite=`).
- `src/store.ts` — identity derives from the Supabase session; the WS handshake sends the
  access token; handle `auth-required` / `invite-required` error states; sign-out.
- `src/components/Admin.tsx` — new **Invites** section (generate, copy link, revoke).

**Server**

- `server/store.ts` *(new)* — persistence abstraction `loadState()` / `saveState()`.
  Supabase-backed when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set; **file-backed
  fallback** otherwise (keeps local dev and existing tests working with no Supabase).
- `server/auth.ts` *(new)* — `verifyToken(token) -> { userId, name, avatarUrl, email }` using
  the Supabase admin client.
- `server/invites.ts` *(new)* — pure helpers: `generateCode()`, `validateInvite(code, invites)`,
  and `decideRole({ hasOwner, isMember, validInvite })`. Pure so they are unit-testable.
- `server/index.ts` — swap `load()`/`persist()` for the abstraction; replace the `hello`
  handler with the token-verifying `auth` flow; add invite admin events.

**Types** (`src/types.ts`)

- `User`: add `avatarUrl?: string`, `email?: string`.
- New `Invite` type: `{ code: string; createdBy: string; createdAt: number; revoked: boolean }`.
- `DB`: add `invites: Invite[]`.

### Persistence table

```sql
create table if not exists relay_state (
  id text primary key default 'singleton',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
-- RLS stays enabled with no policies: only the service-role key (server) can read/write.
alter table relay_state enable row level security;
```

`loadState()` selects `data` where `id='singleton'`; if absent, `seed()` then insert.
`saveState()` upserts the row (debounced, as today).

### Auth flow details

- Client: `supabase.auth.signInWithOAuth({ provider: 'github' | 'google' })`, redirect back to
  the app origin; supabase-js persists the session. On connect, send
  `{ t: 'auth', token: session.access_token, invite?: string }`.
- Server: on `auth`, call `supabaseAdmin.auth.getUser(token)`. On failure → `error`
  (`auth-required`). On success, map to a Relay user and apply the owner/invite decision,
  then send `init` (including the user's role) or `error` (`invite-required`).
- Ownership: if no user with role `owner` exists in the DB, the authenticated user becomes
  `owner` (workspace created). Otherwise, if already a member → admit. Otherwise require a
  valid, non-revoked invite to join as `member`.

### Invites

- `DB.invites: Invite[]`. Owner-only admin events:
  - `invite-create` → push `{ code: generateCode(), createdBy, createdAt, revoked: false }`.
  - `invite-revoke` → set `revoked = true` for a code.
- Admin panel lists codes with copyable `?invite=` links and a revoke action.
- Joining: the server validates the submitted code against `invites` (exists and not revoked).

## Environment variables

| Where | Var | Purpose |
| --- | --- | --- |
| Vercel (build) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | browser OAuth (plus existing `VITE_WS_URL`) |
| Render (server) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | persistence + token verification |

The service-role key is server-only and never shipped to the browser. If the server's
Supabase vars are absent, it falls back to the file store, so local dev and CI need no
Supabase.

## Supabase setup (operator steps)

Documented in `docs/supabase-setup.md` (to be written during implementation):

1. Create a Supabase project; copy Project URL, anon key, service_role key.
2. Run the `relay_state` SQL above in the SQL editor.
3. Authentication → Providers: enable GitHub and Google.
   - Create a GitHub OAuth App and a Google OAuth client; paste each client ID/secret.
   - Set the provider callback to Supabase's auth callback URL; add
     `https://slack-reverse.vercel.app` to allowed redirect URLs.

## Dependencies

- Add `@supabase/supabase-js` (used by both client and server).

## Testing

- `server/store.ts` file-fallback keeps `slash.test.ts` and `premium.test.ts` running untouched.
- New unit tests for `server/invites.ts`: `generateCode` uniqueness/format, `validateInvite`
  (missing / revoked / valid), `decideRole` (owner-vs-member across the branch table).
- Auth mapping tested with a mocked admin client (token → user).
- Migration sanity check: an existing `db.json` payload loads into the JSONB row cleanly.

## Risks & notes

- A single JSONB row rewritten on each change is fine for a single trusted workspace (the
  app's stated scope); it is not built for very large histories. Retention/legal-hold logic
  already bounds growth.
- OAuth redirect URLs must include every host the UI is served from (Vercel prod domain and
  any preview domains used for testing).
- The owner/invite decision is centralized in `server/invites.ts` so it is testable and has a
  single source of truth.
