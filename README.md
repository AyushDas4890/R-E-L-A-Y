# Relay

A Slack-style team chat, rebuilt from public product behavior with every premium capability unlocked and a new UI.

Built from publicly known Slack behavior only. No Slack code, assets, or private APIs were inspected or copied. The sandbox that built this could not reach slack.com, so no site crawl was done.

## Run

```
npm install
npm run dev        # API+WS on :8787, UI on :5173
npm run build && npm start   # single server on :8787
npm run lint       # tsc --noEmit
npm test
```

State persists to `data/db.json`.

## Deploy (UI on Vercel, server elsewhere)

Relay needs a long-running server for WebSockets and a disk for state, so it can't run on Vercel functions. Host the server on a WebSocket-capable host and the UI on Vercel.

1. **Server:** on Render, create a Blueprint from this repo (`render.yaml`). It builds, starts `npm start`, health-checks `/healthz`, and stores state in `DATA_DIR` on a persistent disk. Any Node host works: build with `npm run build`, run `npm start`, set `PORT` and `DATA_DIR`.
2. **UI:** in Vercel, import the repo (framework Vite, `vercel.json` is included) and set `VITE_WS_URL=wss://<your-server-host>/ws`. Redeploy after changing it, since it is baked in at build time.
3. **Auth + persistence:** follow [docs/supabase-setup.md](docs/supabase-setup.md) to create the Supabase project, state table and OAuth providers, then set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (server) and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (UI). Without them the app runs in dev mode: file storage and name-only sign-in.

The server also serves the built UI itself, so you can skip Vercel and use the server URL directly.

## Huddles (voice and screen share)

Huddle audio and screen sharing run peer to peer over WebRTC. Every browser in a huddle connects directly to every other one (a mesh), and the Relay server only relays the connection setup (offers, answers, ICE candidates) between tabs in the same huddle. Media never passes through the server. A mesh suits small teams, so a huddle holds up to 6 people (`MAX_HUDDLE` in `src/types.ts`): each person uploads their mic and screen once per other person, so bandwidth and CPU grow with every extra participant.

Browsers find each other with Google's public STUN servers. That works on most home networks, but strict NATs and firewalls (some office, campus and mobile networks) block direct connections, and then the huddle shows people stuck on "connecting". Fix that with a TURN relay (for example coturn, or a hosted one such as Cloudflare Calls, Twilio or Metered) and set these in the UI build:

- `VITE_TURN_URL`: one or more comma-separated URLs, e.g. `turn:turn.example.com:3478,turns:turn.example.com:5349`
- `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL`

They are baked into the UI bundle, so anyone using the app can read them. Use a TURN service with short-lived or usage-capped credentials. For bigger calls (more than about 6 people), the next step is an SFU such as LiveKit, where each browser uploads once and the server forwards the media.

In the console, `await relayHuddle.stats()` shows the bytes and frames sent and received per peer.

## Backgrounds and themes

Preferences → Appearance picks a workspace background, a colour theme and an accent colour. Each bundled background has a theme matched to it (switch off "Match colours to the background" to mix freely), and a strength slider sets how much of it shows through. You can also upload your own image (kept in your browser, up to 3 MB).

To add a background, put a looping 1080p H.264 `.mp4` (no audio) and a `.jpg` poster in `public/bg/`, then add an entry to `BACKGROUNDS` in `src/appearance.ts`.

Moon Walk, Material Hills, Purple Desert and Metal Human backgrounds © GetLayers (getlayers.ai), re-encoded to 1080p for the web.

## Features (all unlocked)

Channels (public/private), DMs, threads, reactions, edit/delete, pins, saved items, mentions, rich text, file attachments, presence and typing, unread badges, Cmd/Ctrl+K search, huddles with voice, screen sharing and speaking indicators, canvases, Workflow Builder, scheduled messages, `/remind` `/topic` `/me` `/shrug` `/huddle` `/summarize`, four themes.

## Premium feature coverage

Mapped from the public plan-comparison page (`docs/slack/pricing.md`). Everything runs locally with no seat limits.

| Area | What Relay has |
| --- | --- |
| Productivity | Lists (board by status, assignee, due date), custom sidebar sections, user groups with `@handle` mentions, audio and screen clips, huddle notes posted when a huddle ends |
| AI-style | `/recap` daily recap, `/explain <term>`, thread and channel summaries, file summaries for text files, "best answer" when a search ends in `?`. All are local heuristics, not an LLM |
| Automation | Workflow Builder with conditional branching and starter templates |
| Security and admin | Roles (owner, admin, member, guest), guests see only channels they were added to, admins-only posting, admin console with analytics, audit log, flagged content review |
| Compliance | Retention policy, legal holds that preserve edited and deleted messages, information barriers between user groups, custom terms of service with re-acceptance, full JSON data export |

Not built because they need external services or a multi-org backend: Slack Connect, SSO and SCIM, EKM, DLP scanning, data residency, Salesforce/CRM, the app directory, and multiple workspaces. The first person to sign in becomes the owner.

## Notes

- Identity is a name stored in localStorage. No auth: run behind a trusted network.
- Huddles are peer to peer with up to 6 people. Strict NATs need a TURN relay (see Huddles above).
- `/summarize` is a local heuristic recap, not an LLM.
