# Supabase Persistence + Real Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Relay's state in Supabase Postgres (surviving restarts) and replace the name-in-localStorage identity with GitHub/Google OAuth, where the first authenticated user becomes owner and others join via shareable invite codes.

**Architecture:** Keep the existing in-memory DB + WebSocket server. Swap the file store for a single-row JSONB snapshot in Postgres behind a `server/store.ts` abstraction (file fallback when Supabase env is absent). The browser authenticates with `supabase-js`; on WebSocket connect it sends its access token; the server verifies it with the Supabase admin client and applies owner/invite logic from pure helpers in `server/invites.ts`.

**Tech Stack:** TypeScript, React 18, Vite 6, `ws`, Node built-in test runner (`node --test`), `@supabase/supabase-js`, Supabase (Postgres + Auth).

**Reference spec:** `docs/superpowers/specs/2026-10-20-supabase-persistence-auth-design.md`

---

## File Structure

**New files**
- `server/invites.ts` — pure invite/owner logic (`generateCode`, `validateInvite`, `decideRole`).
- `server/invites.test.ts` — unit tests for the above.
- `server/store.ts` — persistence abstraction (`createStore` → `{ load, save }`), file + Supabase backends.
- `server/store.test.ts` — unit tests for the file backend.
- `server/auth.ts` — `verifyToken(token, client)` → identity, using an injected Supabase admin client.
- `server/auth.test.ts` — unit tests with a mock client.
- `src/supabase.ts` — browser Supabase client from Vite env.
- `src/components/Login.tsx` — OAuth login screen + invite field.
- `docs/supabase-setup.md` — operator setup guide.

**Modified files**
- `src/types.ts` — `User.avatarUrl?`, `User.email?`; new `Invite`; `AdminData.invites`; `ClientEvent` (`auth`, `inviteCreate`, `inviteRevoke`) replacing `hello`; `ServerEvent.error.code?`.
- `server/index.ts` — use `createStore`; add `invites` to `DB`/seed/load/`adminData`; replace the `hello` branch with an `auth` branch; add invite handlers.
- `src/store.ts` — session-based identity; send `auth` with token; surface error codes; `signOut`.
- `src/App.tsx` — render `Login` instead of `Welcome`; pass session; sign-out control.
- `src/components/Admin.tsx` — Invites section (generate / copy link / revoke).
- `README.md` — document the new env vars.

---

## Task 1: Add dependency and type foundations

**Files:**
- Modify: `package.json`
- Modify: `src/types.ts`

- [ ] **Step 1: Add the Supabase dependency**

In `package.json`, add to `dependencies` (keep alphabetical-ish; `react` stays first is fine):

```json
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "ws": "^8.18.0"
  },
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: `@supabase/supabase-js` added, no errors.

- [ ] **Step 3: Extend `User` with auth fields**

In `src/types.ts`, replace the `User` interface (lines 8-16) with:

```ts
export interface User {
  id: string;
  name: string;
  color: string;
  title: string;
  status: UserStatus;
  bot?: boolean;
  role?: Role;
  avatarUrl?: string;
  email?: string;
}
```

- [ ] **Step 4: Add the `Invite` type**

In `src/types.ts`, immediately after the `User` interface, add:

```ts
export interface Invite {
  code: string;
  createdBy: string;
  createdAt: number;
  revoked: boolean;
}
```

- [ ] **Step 5: Expose invites to admins**

In `src/types.ts`, replace the `AdminData` interface (lines 106-111) with:

```ts
export interface AdminData {
  flags: Flag[];
  audit: AuditEntry[];
  legalHolds: string[];
  preservedCount: number;
  invites: Invite[];
}
```

- [ ] **Step 6: Swap the `hello` client event for `auth` and add invite events**

In `src/types.ts`, in `ClientEvent`, replace the `hello` line:

```ts
  | { t: 'hello'; userId: string; name: string }
```

with:

```ts
  | { t: 'auth'; token: string; invite?: string }
  | { t: 'inviteCreate' }
  | { t: 'inviteRevoke'; code: string }
```

- [ ] **Step 7: Add an error code to `ServerEvent`**

In `src/types.ts`, replace the error line in `ServerEvent`:

```ts
  | { t: 'error'; message: string };
```

with:

```ts
  | { t: 'error'; message: string; code?: 'auth-required' | 'invite-required' };
```

- [ ] **Step 8: Verify types compile**

Run: `npm run lint`
Expected: FAILS, because `server/index.ts` still references `ev.userId`/`ev.name` on the removed `hello` event and lacks `invites`. This is expected; later tasks fix it. (If you want a clean checkpoint, proceed to Task 2 before committing.)

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/types.ts
git commit -m "feat: add supabase dep and auth/invite types"
```

---

## Task 2: Pure invite + owner logic (`server/invites.ts`)

**Files:**
- Create: `server/invites.ts`
- Test: `server/invites.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/invites.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, validateInvite, decideRole } from './invites.ts';
import type { Invite } from '../src/types.ts';

function invite(code: string, revoked = false): Invite {
  return { code, createdBy: 'owner', createdAt: 0, revoked };
}

test('generateCode returns a url-safe code of reasonable length', () => {
  const code = generateCode(() => 0.5);
  assert.match(code, /^[0-9a-z]{8,}$/);
});

test('generateCode varies with the random source', () => {
  const a = generateCode(() => 0.1);
  const b = generateCode(() => 0.9);
  assert.notEqual(a, b);
});

test('validateInvite accepts an existing non-revoked code', () => {
  assert.equal(validateInvite('abc', [invite('abc')]), true);
});

test('validateInvite rejects missing or revoked codes', () => {
  assert.equal(validateInvite('nope', [invite('abc')]), false);
  assert.equal(validateInvite('abc', [invite('abc', true)]), false);
  assert.equal(validateInvite('', [invite('abc')]), false);
});

test('decideRole: first user with no owner becomes owner', () => {
  assert.equal(decideRole({ hasOwner: false, isMember: false, validInvite: false }), 'owner');
});

test('decideRole: existing member is admitted as member', () => {
  assert.equal(decideRole({ hasOwner: true, isMember: true, validInvite: false }), 'member');
});

test('decideRole: new user with a valid invite joins as member', () => {
  assert.equal(decideRole({ hasOwner: true, isMember: false, validInvite: true }), 'member');
});

test('decideRole: new user without a valid invite is rejected', () => {
  assert.equal(decideRole({ hasOwner: true, isMember: false, validInvite: false }), 'reject');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/invites.test.ts`
Expected: FAIL — `Cannot find module './invites.ts'`.

- [ ] **Step 3: Implement `server/invites.ts`**

Create `server/invites.ts`:

```ts
// Pure helpers for invite codes and the owner/member join decision.
// No I/O so they can be unit-tested in isolation.
import type { Invite } from '../src/types.ts';

// A short, url-safe, lowercase code. `rand` is injectable for deterministic tests.
export function generateCode(rand: () => number = Math.random): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let code = '';
  for (let i = 0; i < 10; i++) code += alphabet[Math.floor(rand() * alphabet.length)];
  return code;
}

export function validateInvite(code: string | undefined, invites: Invite[]): boolean {
  if (!code) return false;
  return invites.some((i) => i.code === code && !i.revoked);
}

export type JoinInputs = { hasOwner: boolean; isMember: boolean; validInvite: boolean };
export type JoinResult = 'owner' | 'member' | 'reject';

export function decideRole({ hasOwner, isMember, validInvite }: JoinInputs): JoinResult {
  if (!hasOwner) return 'owner';
  if (isMember) return 'member';
  if (validInvite) return 'member';
  return 'reject';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test server/invites.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/invites.ts server/invites.test.ts
git commit -m "feat: add pure invite and owner-decision helpers"
```

---

## Task 3: Persistence abstraction (`server/store.ts`)

**Files:**
- Create: `server/store.ts`
- Test: `server/store.test.ts`

The store is generic over the snapshot shape so `server/index.ts` can pass its `DB`. It takes a `seed` factory and returns `{ load, save }`. The file backend writes JSON to a path; the Supabase backend upserts a single row. `save` is debounced by the caller exactly as today, so the store's `save` is a plain async write.

- [ ] **Step 1: Write the failing tests (file backend)**

Create `server/store.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileStore } from './store.ts';

type Shape = { n: number; items: string[] };
const seed = (): Shape => ({ n: 1, items: [] });

test('file store seeds when the file is absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-'));
  try {
    const store = createFileStore<Shape>(join(dir, 'db.json'), seed);
    const state = await store.load();
    assert.deepEqual(state, { n: 1, items: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('file store round-trips saved state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-'));
  try {
    const path = join(dir, 'db.json');
    const a = createFileStore<Shape>(path, seed);
    await a.save({ n: 2, items: ['x'] });
    const b = createFileStore<Shape>(path, seed);
    assert.deepEqual(await b.load(), { n: 2, items: ['x'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/store.test.ts`
Expected: FAIL — `Cannot find module './store.ts'`.

- [ ] **Step 3: Implement `server/store.ts`**

Create `server/store.ts`:

```ts
// Persistence abstraction. Two backends:
//  - file: JSON on disk (local dev, CI, and fallback when Supabase env is absent)
//  - supabase: a single JSONB row keyed 'singleton' in the relay_state table
// Both expose the same async { load, save } interface over an opaque snapshot T.
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Store<T> {
  load(): Promise<T>;
  save(state: T): Promise<void>;
}

export function createFileStore<T>(filePath: string, seed: () => T): Store<T> {
  return {
    async load() {
      if (!fs.existsSync(filePath)) return seed();
      return JSON.parse(await fs.promises.readFile(filePath, 'utf8')) as T;
    },
    async save(state) {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, JSON.stringify(state));
    },
  };
}

const TABLE = 'relay_state';
const ROW_ID = 'singleton';

export function createSupabaseStore<T>(client: SupabaseClient, seed: () => T): Store<T> {
  return {
    async load() {
      const { data, error } = await client.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
      if (error) throw new Error(`relay_state load failed: ${error.message}`);
      if (!data) {
        const seeded = seed();
        await this.save(seeded);
        return seeded;
      }
      return data.data as T;
    },
    async save(state) {
      const { error } = await client
        .from(TABLE)
        .upsert({ id: ROW_ID, data: state, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) throw new Error(`relay_state save failed: ${error.message}`);
    },
  };
}

// Chooses the backend from the environment. Supabase when both vars are present,
// otherwise the file at `fallbackPath`.
export function createStore<T>(seed: () => T, fallbackPath: string): Store<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const client = createClient(url, key, { auth: { persistSession: false } });
    return createSupabaseStore<T>(client, seed);
  }
  return createFileStore<T>(fallbackPath, seed);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test server/store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/store.ts server/store.test.ts
git commit -m "feat: add file/supabase persistence abstraction"
```

---

## Task 4: Token verification (`server/auth.ts`)

**Files:**
- Create: `server/auth.ts`
- Test: `server/auth.test.ts`

`verifyToken` takes the token and a minimal client interface (so tests inject a fake). It maps the Supabase user to Relay identity fields, pulling display name and avatar from `user_metadata` (the shape GitHub/Google populate).

- [ ] **Step 1: Write the failing tests**

Create `server/auth.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyToken, type AuthClient } from './auth.ts';

function clientReturning(result: Awaited<ReturnType<AuthClient['auth']['getUser']>>): AuthClient {
  return { auth: { getUser: async () => result } };
}

test('verifyToken maps a valid user with metadata', async () => {
  const client = clientReturning({
    data: { user: { id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'Ada', avatar_url: 'http://x/a.png' } } },
    error: null,
  });
  const id = await verifyToken('tok', client);
  assert.deepEqual(id, { userId: 'u1', name: 'Ada', email: 'a@b.com', avatarUrl: 'http://x/a.png' });
});

test('verifyToken falls back to email prefix when name metadata is missing', async () => {
  const client = clientReturning({
    data: { user: { id: 'u2', email: 'bob@b.com', user_metadata: {} } },
    error: null,
  });
  const id = await verifyToken('tok', client);
  assert.equal(id?.name, 'bob');
});

test('verifyToken returns null on error', async () => {
  const client = clientReturning({ data: { user: null }, error: { message: 'bad jwt' } });
  assert.equal(await verifyToken('tok', client), null);
});

test('verifyToken returns null when no token is given', async () => {
  const client = clientReturning({ data: { user: { id: 'x', email: null, user_metadata: {} } }, error: null });
  assert.equal(await verifyToken('', client), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/auth.test.ts`
Expected: FAIL — `Cannot find module './auth.ts'`.

- [ ] **Step 3: Implement `server/auth.ts`**

Create `server/auth.ts`:

```ts
// Verifies a Supabase access token and maps it to Relay identity fields.
// `AuthClient` is the slice of SupabaseClient we use, so tests can inject a fake.
export interface SupabaseUser {
  id: string;
  email: string | null;
  user_metadata: { full_name?: string; name?: string; user_name?: string; avatar_url?: string };
}

export interface AuthClient {
  auth: { getUser(token: string): Promise<{ data: { user: SupabaseUser | null }; error: { message: string } | null }> };
}

export interface Identity {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl?: string;
}

export async function verifyToken(token: string, client: AuthClient): Promise<Identity | null> {
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const u = data.user;
  const meta = u.user_metadata ?? {};
  const name =
    meta.full_name?.trim() ||
    meta.name?.trim() ||
    meta.user_name?.trim() ||
    (u.email ? u.email.split('@')[0] : '') ||
    'Member';
  return {
    userId: u.id,
    name: name.slice(0, 40),
    email: u.email,
    avatarUrl: meta.avatar_url,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test server/auth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/auth.ts server/auth.test.ts
git commit -m "feat: add supabase token verification"
```

---

## Task 5: Wire persistence into the server

**Files:**
- Modify: `server/index.ts`

Replace the synchronous file load and the file-writing `persist()` with the store abstraction. `load()` becomes async at boot; `persist()` keeps its 250ms debounce but calls `store.save(db)`.

- [ ] **Step 1: Import the store and admin auth client**

In `server/index.ts`, near the other imports at the top, add:

```ts
import { createStore } from './store.ts';
import { createClient } from '@supabase/supabase-js';
```

- [ ] **Step 2: Add `invites` to the `DB` interface**

In `server/index.ts`, in the `DB` interface (lines 49-66), add after `preserved: Message[];`:

```ts
  invites: Invite[];
```

Add `Invite` to the existing `import type { ... } from './...types'` line (the type import near the top of the file that lists `User`, `Channel`, etc.). Example: add `Invite` to that list.

- [ ] **Step 3: Seed and load `invites`**

In `seed()` (the returned `db` object, near lines 88-131), add after `preserved: [],`:

```ts
    invites: [],
```

In `load()` the function is being replaced below, so no change needed there yet.

- [ ] **Step 4: Replace synchronous load/persist with the store**

In `server/index.ts`, replace the block from `function load(): DB {` through the end of `function persist(): void { ... }` (lines 143-176) with:

```ts
const store = createStore<DB>(seed, dataFile);

function normalize(stored: Partial<DB> & Pick<DB, 'users' | 'channels' | 'messages'>): DB {
  // Databases written before newer features lack some fields; fill defaults.
  return {
    canvases: {},
    workflows: [],
    scheduled: [],
    saved: {},
    lists: {},
    sections: {},
    groups: [],
    termsAccepted: {},
    flags: [],
    audit: [],
    legalHolds: [],
    preserved: [],
    invites: [],
    ...stored,
    settings: { ...DEFAULT_SETTINGS, ...stored.settings },
  };
}

const db = normalize((await store.load()) as Partial<DB> & Pick<DB, 'users' | 'channels' | 'messages'>);

let saveTimer: NodeJS.Timeout | undefined;
function persist(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.save(db).catch((err) => console.error('persist failed:', err instanceof Error ? err.message : err));
  }, 250);
}
```

Note: this removes the old `const db = load();` line (line 166). The top-level `await` is valid because the server file is an ES module.

- [ ] **Step 5: Include invites in `adminData()`**

In `server/index.ts`, replace the `adminData()` function (lines 199-201) with:

```ts
function adminData(): AdminData {
  return {
    flags: db.flags,
    audit: db.audit.slice(-200),
    legalHolds: db.legalHolds,
    preservedCount: db.preserved.length,
    invites: db.invites,
  };
}
```

- [ ] **Step 6: Verify the file backend still works (no Supabase env)**

Run: `npm run test`
Expected: existing tests still PASS (the server module itself is not imported by tests; this confirms types/helpers are intact).

Run: `node --test server/store.test.ts server/invites.test.ts server/auth.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/index.ts
git commit -m "feat: persist server state through the store abstraction"
```

---

## Task 6: Replace `hello` with token auth + invite handlers

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Create the admin auth client and import helpers**

In `server/index.ts`, after the `const store = ...` line added in Task 5, add:

```ts
// Admin client used only to verify access tokens. Null when auth is not configured,
// in which case the server runs in no-auth dev mode (token treated as the identity).
const authAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;
```

Add these imports near the top with the other local imports:

```ts
import { verifyToken, type Identity } from './auth.ts';
import { generateCode, validateInvite, decideRole } from './invites.ts';
```

- [ ] **Step 2: Add a dev-mode identity fallback helper**

In `server/index.ts`, just above `function handle(` (line 324), add:

```ts
// Resolve an identity from the auth payload. With Supabase configured, verify the JWT.
// Without it (local dev), accept the token as a raw userId:name so the app still runs.
async function resolveIdentity(token: string, fallbackName?: string): Promise<Identity | null> {
  if (authAdmin) return verifyToken(token, authAdmin);
  if (!token) return null;
  const [userId, name] = token.split(':');
  if (!userId) return null;
  return { userId: userId.slice(0, 64), name: (name || fallbackName || 'Member').slice(0, 40), email: null };
}
```

- [ ] **Step 3: Make `handle` async and replace the `hello` branch**

In `server/index.ts`, change the signature:

```ts
function handle(ws: WebSocket, ev: ClientEvent): void {
```

to:

```ts
async function handle(ws: WebSocket, ev: ClientEvent): Promise<void> {
```

Then replace the entire `if (ev.t === 'hello') { ... }` block (lines 325-352) with:

```ts
  if (ev.t === 'auth') {
    const identity = await resolveIdentity(ev.token);
    if (!identity) {
      send(ws, { t: 'error', message: 'Sign in to continue.', code: 'auth-required' });
      return;
    }
    const { userId, name, email, avatarUrl } = identity;
    let user = db.users[userId];
    const isMember = !!user;
    const hasOwner = Object.values(db.users).some((u) => u.role === 'owner');
    const role = decideRole({ hasOwner, isMember, validInvite: validateInvite(ev.invite, db.invites) });

    if (role === 'reject') {
      send(ws, { t: 'error', message: 'You need a valid invite to join this workspace.', code: 'invite-required' });
      return;
    }

    if (!user) {
      user = {
        id: userId,
        name,
        color: COLORS[Object.keys(db.users).length % COLORS.length],
        title: '',
        status: { emoji: '', text: '' },
        role: role === 'owner' ? 'owner' : 'member',
        email: email ?? undefined,
        avatarUrl,
      };
      db.users[userId] = user;
      for (const id of ['general', 'random']) ensureMember(db.channels[id], userId);
    } else {
      // Keep profile details fresh from the identity provider.
      user.name = name;
      user.avatarUrl = avatarUrl;
      user.email = email ?? user.email;
      if (role === 'owner') user.role = 'owner';
      user.role ??= 'member';
    }

    clients.set(ws, userId);
    send(ws, { t: 'init', snapshot: snapshotFor(userId) });
    broadcast({ t: 'user', user });
    broadcast({ t: 'presence', online: onlineIds() });
    if (!isMember) runJoinWorkflows('general');
    persist();
    return;
  }
```

- [ ] **Step 4: Update the "not authed yet" guard message**

In `server/index.ts`, the guard right after the removed block (was lines 354-358) reads `message: 'Send hello first'`. Replace that line with:

```ts
    send(ws, { t: 'error', message: 'Sign in to continue.', code: 'auth-required' });
```

- [ ] **Step 5: Add invite admin handlers**

In `server/index.ts`, inside the `switch (ev.t)` block, add two new cases next to the other admin cases (e.g., right after the `case 'legalHold':` block, before `case 'acceptTerms':`):

```ts
    case 'inviteCreate': {
      if (!isAdmin(db.users[userId])) return;
      const inv = { code: generateCode(), createdBy: userId, createdAt: Date.now(), revoked: false };
      db.invites.push(inv);
      audit(userId, 'invite.create', inv.code);
      persist();
      return;
    }
    case 'inviteRevoke': {
      if (!isAdmin(db.users[userId])) return;
      const inv = db.invites.find((i) => i.code === ev.code);
      if (!inv) return;
      inv.revoked = true;
      audit(userId, 'invite.revoke', ev.code);
      persist();
      return;
    }
```

(`audit()` already calls `broadcastAdmin()`, which pushes the updated `adminData()` — including `invites` — to admins, so no extra broadcast is needed.)

- [ ] **Step 6: Await `handle` at the call site**

In `server/index.ts`, find the connection handler (around line 842-843):

```ts
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
```

Replace the `ws.on('message', (raw) => {` body's call to `handle(...)` so errors are caught. Change the message listener to:

```ts
  ws.on('message', (raw) => {
    let ev: ClientEvent;
    try {
      ev = JSON.parse(String(raw)) as ClientEvent;
    } catch {
      return;
    }
    void handle(ws, ev).catch((err) => {
      console.error('handle failed:', err instanceof Error ? err.message : err);
      send(ws, { t: 'error', message: 'Something went wrong.' });
    });
  });
```

If the existing body already parses `raw` differently, preserve its parsing but wrap the `handle(ws, ev)` call as `void handle(ws, ev).catch(...)` as shown. Read lines 843-859 first and adapt precisely.

- [ ] **Step 7: Verify compile and tests**

Run: `npm run lint`
Expected: PASS (no type errors).

Run: `npm run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/index.ts
git commit -m "feat: authenticate connections via token and add invites"
```

---

## Task 7: Browser Supabase client (`src/supabase.ts`)

**Files:**
- Create: `src/supabase.ts`
- Modify: `src/vite-env.d.ts`

- [ ] **Step 1: Declare the new Vite env vars**

In `src/vite-env.d.ts`, inside the `ImportMetaEnv` interface (which already has `VITE_WS_URL?`), add:

```ts
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
```

- [ ] **Step 2: Create the client**

Create `src/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when auth is not configured (local dev); the app then runs in no-auth mode.
export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;

export const authEnabled = !!supabase;
```

- [ ] **Step 3: Verify compile**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/supabase.ts src/vite-env.d.ts
git commit -m "feat: add browser supabase client"
```

---

## Task 8: Login screen (`src/components/Login.tsx`)

**Files:**
- Create: `src/components/Login.tsx`

- [ ] **Step 1: Implement the login screen**

Create `src/components/Login.tsx`:

```tsx
import { useState } from 'react';
import { supabase, authEnabled } from '../supabase.ts';

// Reads ?invite=CODE from the URL so an invite link pre-fills the field.
function inviteFromUrl(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('invite') ?? '';
}

export function Login({ onDevEnter }: { onDevEnter: (token: string, invite: string) => void }) {
  const [invite, setInvite] = useState(inviteFromUrl);
  const [devName, setDevName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function oauth(provider: 'github' | 'google') {
    if (!supabase) return;
    // Preserve the invite code across the OAuth redirect round-trip.
    const redirectTo = `${window.location.origin}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) setError(error.message);
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="logo">R</div>
        <h1>Relay</h1>
        <p>Team chat where every premium feature is already on.</p>

        <input
          value={invite}
          onChange={(e) => setInvite(e.target.value.trim())}
          placeholder="Invite code (not needed for the first user)"
          maxLength={32}
        />

        {authEnabled ? (
          <div className="oauth-buttons">
            <button className="send-btn" onClick={() => oauth('github')}>Sign in with GitHub</button>
            <button className="send-btn" onClick={() => oauth('google')}>Sign in with Google</button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (devName.trim()) onDevEnter(`${crypto.randomUUID()}:${devName.trim()}`, invite);
            }}
          >
            <input value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="Your name (dev mode)" maxLength={40} />
            <button className="send-btn" disabled={!devName.trim()}>Enter workspace →</button>
          </form>
        )}

        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add minimal styles**

In `src/styles.css`, append:

```css
.oauth-buttons { display: flex; flex-direction: column; gap: 8px; }
.login-error { color: #ff6b8b; font-size: 13px; margin-top: 8px; }
```

- [ ] **Step 3: Verify compile**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/Login.tsx src/styles.css
git commit -m "feat: add oauth login screen with invite field"
```

---

## Task 9: Session-based identity and token handshake (`src/store.ts`)

**Files:**
- Modify: `src/store.ts`

The client now derives identity from a Supabase session (or a dev token), passes the token + invite to `useRelay`, and sends `{ t: 'auth', token, invite }` on connect instead of `hello`. Error codes from the server surface to the UI.

- [ ] **Step 1: Add a session hook and token plumbing**

In `src/store.ts`, add near the top imports:

```ts
import { supabase, authEnabled } from './supabase.ts';
```

Replace `getIdentity` / `saveIdentity` (lines 93-108) with a session hook and a dev-token store:

```ts
export interface Session {
  token: string;
  invite: string;
}

// Dev mode (no Supabase): identity is a `uuid:name` token kept in localStorage.
export function getDevSession(): Session | null {
  if (authEnabled) return null;
  try {
    const raw = localStorage.getItem('relay.dev-session');
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveDevSession(token: string, invite: string): Session {
  const s = { token, invite };
  localStorage.setItem('relay.dev-session', JSON.stringify(s));
  return s;
}

export function clearDevSession(): void {
  localStorage.removeItem('relay.dev-session');
}
```

- [ ] **Step 2: Add a hook that resolves the live Supabase session token**

In `src/store.ts`, add:

```ts
import { useEffect as _useEffect, useState as _useState } from 'react';

// Returns the current access token (or null) and tracks auth state changes.
export function useAuthToken(): { token: string | null; ready: boolean; signOut: () => Promise<void> } {
  const [token, setToken] = _useState<string | null>(null);
  const [ready, setReady] = _useState(!authEnabled);

  _useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    else clearDevSession();
    setToken(null);
  };

  return { token, ready, signOut };
}
```

(If `src/store.ts` already imports `useEffect`/`useState`, reuse those instead of the aliased imports and delete the extra import line.)

- [ ] **Step 3: Change `useRelay` to accept a session and send `auth`**

In `src/store.ts`, change the `useRelay` signature (line 110):

```ts
export function useRelay(identity: { userId: string; name: string } | null) {
```

to:

```ts
export function useRelay(session: { token: string; invite: string } | null) {
```

Inside the effect, replace the guard `if (!identity) return;` with `if (!session) return;`.

Replace the `ws.onopen` handler that sends `hello` (around lines 126-130) with:

```ts
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        ws.send(JSON.stringify({ t: 'auth', token: session.token, invite: session.invite || undefined } satisfies ClientEvent));
      };
```

Update the effect dependency array at the end of the effect to `[session?.token, session?.invite]` (replace the existing `[identity]` dependency).

- [ ] **Step 4: Surface auth/invite errors to the reducer**

In `src/store.ts`, the reducer already handles `{ t: 'error' }`. Confirm the `error` branch stores the message; if it only stores `message`, also store `code`. Find the reducer's error handling and ensure it does:

```ts
    case 'error':
      return { ...state, error: { message: ev.message, code: ev.code } };
```

If `error` is currently typed as `string | null`, change the state's `error` field type to `{ message: string; code?: string } | null` in the `useReducer` initial value and the `State` type, and update any reader of `state.error` to use `state.error?.message`. Grep for `.error` usages in `src/App.tsx` and adjust (e.g., the error toast renders `error?.message`).

- [ ] **Step 5: Verify compile**

Run: `npm run lint`
Expected: FAILS only in `src/App.tsx` (still calls `useRelay(identity)` and `getIdentity`). Fixed in Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/store.ts
git commit -m "feat: derive identity from supabase session, send auth token"
```

---

## Task 10: App wiring and sign-out (`src/App.tsx`)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Swap imports**

In `src/App.tsx`, replace the store import line (line 4):

```ts
import { getIdentity, saveIdentity, useLastRead, useRelay, useUnread } from './store.ts';
```

with:

```ts
import { useLastRead, useRelay, useUnread, useAuthToken, getDevSession, saveDevSession } from './store.ts';
import { authEnabled } from './supabase.ts';
import { Login } from './components/Login.tsx';
```

- [ ] **Step 2: Remove the old `Welcome` component**

In `src/App.tsx`, delete the `Welcome` function (lines 27-42).

- [ ] **Step 3: Resolve the session and gate rendering**

In `src/App.tsx`, replace the top of `App()` (lines 45-46) with:

```ts
export default function App() {
  const { token, ready, signOut } = useAuthToken();
  const [devSession, setDevSession] = useState(getDevSession);
  const invite = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('invite') ?? '' : '';

  // In auth mode the session token comes from Supabase; in dev mode from localStorage.
  const session = authEnabled
    ? token
      ? { token, invite }
      : null
    : devSession;

  const { snap, typing, error, analytics, connected, send, clearError } = useRelay(session);
```

- [ ] **Step 4: Render `Login` until signed in**

In `src/App.tsx`, find where the old code rendered `<Welcome .../>` when there was no identity (search for `Welcome` / `identity`). Replace that gate with:

```tsx
  if (authEnabled ? !token : !devSession) {
    if (!ready) return <div className="welcome"><div className="welcome-card"><div className="logo">R</div></div></div>;
    return (
      <Login
        onDevEnter={(tok, inv) => setDevSession(saveDevSession(tok, inv))}
      />
    );
  }
```

Place this guard before the main workspace JSX is returned (right after the hooks, matching where `Welcome` used to gate).

- [ ] **Step 5: Add a sign-out control**

In `src/App.tsx`, in the profile area / sidebar header where user actions live (near the existing profile modal trigger), add a button:

```tsx
<button className="signout-btn" onClick={() => { signOut(); setDevSession(null); }}>Sign out</button>
```

Add to `src/styles.css`:

```css
.signout-btn { background: none; border: none; color: var(--muted, #9aa); cursor: pointer; font-size: 12px; }
.signout-btn:hover { color: #fff; }
```

- [ ] **Step 6: Verify compile and build**

Run: `npm run lint`
Expected: PASS.

Run: `npm run build`
Expected: PASS (tsc + vite build succeed).

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "feat: gate app behind oauth login and add sign-out"
```

---

## Task 11: Invites admin UI (`src/components/Admin.tsx`)

**Files:**
- Modify: `src/components/Admin.tsx`

- [ ] **Step 1: Read the current Admin component structure**

Run: `rtk read src/components/Admin.tsx`
Confirm how it receives `admin` data and the `send` function (it already renders flags/audit/legal holds from `AdminData`). Note the prop names used (e.g., `admin`, `send`).

- [ ] **Step 2: Add an Invites section**

In `src/components/Admin.tsx`, inside the admin modal body (alongside the existing flags/audit sections), add a section. Use the actual prop names found in Step 1 (shown here as `admin` and `send`):

```tsx
<section className="admin-section">
  <h3>Invites</h3>
  <button className="send-btn" onClick={() => send({ t: 'inviteCreate' })}>Generate invite link</button>
  <ul className="invite-list">
    {admin.invites.map((inv) => {
      const link = `${window.location.origin}/?invite=${inv.code}`;
      return (
        <li key={inv.code} className={inv.revoked ? 'invite revoked' : 'invite'}>
          <code>{inv.code}</code>
          {inv.revoked ? (
            <span className="invite-tag">revoked</span>
          ) : (
            <>
              <button onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
              <button onClick={() => send({ t: 'inviteRevoke', code: inv.code })}>Revoke</button>
            </>
          )}
        </li>
      );
    })}
    {admin.invites.length === 0 && <li className="muted">No invites yet.</li>}
  </ul>
</section>
```

- [ ] **Step 3: Add styles**

In `src/styles.css`, append:

```css
.invite-list { list-style: none; padding: 0; margin: 8px 0; display: flex; flex-direction: column; gap: 6px; }
.invite { display: flex; align-items: center; gap: 8px; }
.invite.revoked code { text-decoration: line-through; opacity: 0.6; }
.invite-tag { font-size: 11px; color: #ff6b8b; }
```

- [ ] **Step 4: Verify compile and build**

Run: `npm run lint`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Admin.tsx src/styles.css
git commit -m "feat: add invite management to the admin console"
```

---

## Task 12: Operator setup guide (`docs/supabase-setup.md`)

**Files:**
- Create: `docs/supabase-setup.md`
- Modify: `README.md`

- [ ] **Step 1: Write the setup guide**

Create `docs/supabase-setup.md`:

```markdown
# Supabase setup for Relay

Relay uses Supabase for persistent storage and OAuth sign-in. Local dev works
without Supabase (file storage + a name-only dev login); production needs the
steps below.

## 1. Create a project
1. Create a project at https://supabase.com.
2. Project Settings → API: copy the **Project URL**, the **anon public key**, and the **service_role key**.

## 2. Create the state table
In the SQL editor, run:

```sql
create table if not exists relay_state (
  id text primary key default 'singleton',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table relay_state enable row level security;
-- No policies: only the service_role key (used by the server) may read/write.
```

## 3. Enable OAuth providers
Authentication → Providers:

- **GitHub:** create an OAuth App at https://github.com/settings/developers.
  - Authorization callback URL: `https://<your-project-ref>.supabase.co/auth/v1/callback`
  - Paste the Client ID and Client Secret into Supabase, enable GitHub.
- **Google:** create an OAuth client in Google Cloud Console (configure the consent screen first).
  - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
  - Paste the Client ID and Client Secret into Supabase, enable Google.

Authentication → URL Configuration:
- Add your UI origin (`https://slack-reverse.vercel.app`) to **Redirect URLs**.
- Add any Vercel preview URLs you test from.

## 4. Environment variables
UI (Vercel):
- `VITE_SUPABASE_URL` = Project URL
- `VITE_SUPABASE_ANON_KEY` = anon public key
- `VITE_WS_URL` = `wss://<your-server-host>/ws` (already set)

Server (Render):
- `SUPABASE_URL` = Project URL
- `SUPABASE_SERVICE_ROLE_KEY` = service_role key

Redeploy both after setting variables (Vite bakes `VITE_*` at build time).

## 5. First sign-in
The first person to sign in becomes the workspace owner. The owner opens the
Admin console → Invites to generate invite links for everyone else.
```

- [ ] **Step 2: Reference it from the README**

In `README.md`, in the Deploy section, add a line after the server/UI steps:

```markdown
3. **Auth + persistence:** follow `docs/supabase-setup.md` to create the Supabase project, state table, and OAuth providers, then set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (server) and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (UI).
```

- [ ] **Step 3: Commit**

```bash
git add docs/supabase-setup.md README.md
git commit -m "docs: add supabase setup guide"
```

---

## Task 13: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test`
Expected: PASS.

Run: `node --test server/invites.test.ts server/store.test.ts server/auth.test.ts`
Expected: PASS.

- [ ] **Step 2: Type-check and build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Local smoke test in no-auth (dev) mode**

Run: `npm run dev` (no Supabase env set).
Open the UI, enter a dev name, confirm the workspace loads and messages persist to `data/db.json`.
Expected: file `data/db.json` is written and survives a server restart.

- [ ] **Step 4: Commit any fixes, then open a PR branch as usual**

```bash
git add -A
git commit -m "chore: verification fixes for supabase auth + persistence" || echo "nothing to commit"
```

---

## Post-implementation (operator, outside this plan)

These require your Supabase/Vercel/Render dashboards and are documented in `docs/supabase-setup.md`:
1. Create the Supabase project, run the table SQL, enable GitHub + Google.
2. Set the four `*_SUPABASE_*` env vars (two on Vercel, two on Render) plus existing `VITE_WS_URL`.
3. Redeploy UI (Vercel) and server (Render).
4. Sign in first to claim ownership; generate invite links from Admin → Invites.
