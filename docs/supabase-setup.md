# Supabase setup for Relay

Relay uses Supabase for persistent storage and sign-in. Local dev works
without Supabase: state goes to `data/db.json`, and sign-in uses local
email and password accounts kept in `data/dev-auth.json` (scrypt hashes), with
a "Just try it with a name" link. In dev mode, password reset and the Google,
GitHub and Microsoft buttons show a "needs Supabase" message. Production needs
the steps below.

## 1. Create a project

Menu names, limits and values for Supabase, Resend and Azure change over time, so treat the ones below as a starting point and check each provider's current docs.

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

## 3. Email and password sign-in

Authentication → Providers → Email:

- Enable the Email provider.
- Turn **Confirm email** ON. The server treats a token as verified only when
  Supabase has set `email_confirmed_at`, and for locally verified JWTs it relies
  on Supabase having refused to issue a token before confirmation.
- Leave anonymous sign-ins OFF.

Magic-link sign-in is no longer offered.

### Custom SMTP

Supabase sends the confirmation and password-reset emails itself. Its built-in
sender is limited to a few emails per hour, which is not enough for real use,
so set up your own SMTP server. With Resend: verify a sending domain, create an
API key, then in Authentication → SMTP Settings enable custom SMTP with host
`smtp.resend.com`, port `465`, username `resend`, the API key as the password,
and a sender address on your verified domain.

This is separate from the app's own mailer (`RELAY_EMAIL_PROVIDER`,
`RESEND_API_KEY`, `RELAY_EMAIL_FROM`), which sends offline mention and DM
notifications and is configured on the server. See
[email-notifications.md](email-notifications.md). Both can use the same Resend
account.

## 4. OAuth providers

Authentication → Providers. Every provider uses the same callback URL:
`https://<your-project-ref>.supabase.co/auth/v1/callback`. Paste each Client ID
and Client Secret into Supabase, then enable the provider.

- **GitHub:** create an OAuth App at https://github.com/settings/developers and set the authorization callback URL to the callback above.
- **Google:** create an OAuth client in Google Cloud Console (configure the consent screen first) and add the callback as an authorized redirect URI.
- **Microsoft:** in Supabase this provider is called **Azure**. Register an application in Microsoft Entra ID (Azure portal → App registrations), add the callback as a Web redirect URI, and create a client secret. Paste the Application (client) ID and the secret value into Supabase. Set the Azure Tenant URL if you want to limit sign-in to one tenant. Relay requests the scopes `email openid profile`, and the account must return an email address. Microsoft lets tenant admins set any email on an account without proving it, so either register the app as single-tenant (Accounts in this organisational directory only) and set the Azure Tenant URL to your organisation's tenant, or enable the `xms_edov` optional claim so only domain-verified emails count. The allowed-domain and owner-email checks are only as strong as the emails they see. Remember too that turning **Confirm email** off makes every email trusted, for every provider.

### URL configuration

Authentication → URL Configuration:

- Set **Site URL** to your UI origin.
- Add to **Redirect URLs**: `<origin>` and `<origin>/reset` (password reset emails land on `/reset`), plus any Vercel preview URLs with the same two paths.

## 5. Environment variables

UI (Vercel):

- `VITE_SUPABASE_URL`: Project URL
- `VITE_SUPABASE_ANON_KEY`: anon public key
- `VITE_WS_URL`: `wss://<your-server-host>/ws`

Server (Render or any Node host):

- `SUPABASE_URL`: Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: service_role key. Keep it server-side only. Required for sign-in in production.
- `SUPABASE_JWT_SECRET`: Project Settings → API → JWT Settings → JWT Secret. The server then verifies tokens locally (HS256).
- `SUPABASE_JWKS_URL`: `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`. Use this instead of the secret if your project uses asymmetric signing keys. If neither is set, the server verifies each token with a network call to Supabase, which works but is slower.
- `RELAY_OWNER_EMAIL`: the email of the person who should own the workspace (see below).
- `RELAY_APP_URL`: the UI's public address, used in notification emails.
- `RELAY_ALLOW_DEV_AUTH=1`: allows the offline dev sign-in in production. Not recommended. With dev auth on, emails are unproven, so anyone could register the owner email first; never enable it on a public deployment.
- `PORT` (default 8787) and `DATA_DIR` as needed.

Redeploy both after setting variables. Vite bakes `VITE_*` values in at build time.

## 6. First sign-in and the owner

Set `RELAY_OWNER_EMAIL` to your own address before anyone signs in. The person
with that email becomes the workspace owner on first sign-in. Until they have
signed in, only people on an allowed domain or with an invite can join.

Without `RELAY_OWNER_EMAIL`, the first person to sign in becomes the owner, and
the Admin console shows a warning so you remember to set it.

## 7. Sign-up policy

The owner or an admin opens Admin console → Invites → **Sign-up policy** to set:

- Organisation name
- Allowed email domains, one per line
- Default role for new people: member or guest
- Default channels new people join
- Invite-only toggle

A new person is admitted when their email domain is in the allowed list, or they carry a valid invite, or, when no domains are listed and the organisation is not invite-only, anyone. A non-empty domain list therefore keeps out everyone else, even with invite-only off. Existing members
always sign in. People who were removed stay out.
