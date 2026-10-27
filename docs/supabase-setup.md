# Supabase setup for Relay

Relay uses Supabase for persistent storage and OAuth sign-in. Local dev works
without Supabase (file storage in `data/db.json` and a name-only dev login).
Production needs the steps below.

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
-- No policies: only the service_role key (used by the server) may read or write.
```

## 3. Enable OAuth providers

Authentication → Providers:

- **GitHub:** create an OAuth App at https://github.com/settings/developers.
  - Authorization callback URL: `https://<your-project-ref>.supabase.co/auth/v1/callback`
  - Paste the Client ID and Client Secret into Supabase, then enable GitHub.
- **Google:** create an OAuth client in Google Cloud Console (configure the consent screen first).
  - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
  - Paste the Client ID and Client Secret into Supabase, then enable Google.

Authentication → URL Configuration:

- Set **Site URL** to your UI origin.
- Add the UI origin and any Vercel preview URLs to **Redirect URLs**.

## 4. Environment variables

UI (Vercel):

- `VITE_SUPABASE_URL`: Project URL
- `VITE_SUPABASE_ANON_KEY`: anon public key
- `VITE_WS_URL`: `wss://<your-server-host>/ws`

Server (Render or any Node host):

- `SUPABASE_URL`: Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: service_role key. Keep it server-side only.

Redeploy both after setting variables. Vite bakes `VITE_*` values in at build time.

## 5. First sign-in

The first person to sign in becomes the workspace owner. The owner opens
Admin console → Invites to generate invite links for everyone else. Existing
members sign in again without an invite.
