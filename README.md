<div align="center">

<a href="https://slack-reverse.vercel.app"><img src="docs/readme/banner.svg" alt="Relay: team chat that talks back" width="100%"></a>

<p>
  <a href="https://slack-reverse.vercel.app"><img alt="Live demo" src="https://img.shields.io/badge/live%20demo-slack--reverse.vercel.app-9df5c5?style=for-the-badge&labelColor=1a0b07"></a>
  <img alt="React 18" src="https://img.shields.io/badge/React-18-f0b07a?style=for-the-badge&logo=react&logoColor=f0b07a&labelColor=1a0b07">
  <img alt="Node 24" src="https://img.shields.io/badge/Node-24-f0b07a?style=for-the-badge&logo=nodedotjs&logoColor=f0b07a&labelColor=1a0b07">
  <img alt="WebRTC" src="https://img.shields.io/badge/WebRTC-huddles-f0b07a?style=for-the-badge&logo=webrtc&logoColor=f0b07a&labelColor=1a0b07">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-auth%20%2B%20state-f0b07a?style=for-the-badge&logo=supabase&logoColor=f0b07a&labelColor=1a0b07">
</p>

**A Slack-style team chat with every premium feature unlocked, a bot teammate and a brand-new look.**

### 🌐 Try it live: **[slack-reverse.vercel.app](https://slack-reverse.vercel.app)**

<a href="https://slack-reverse.vercel.app"><img alt="Open Relay" src="https://img.shields.io/badge/%E2%96%B6%20%20Open%20Relay-slack--reverse.vercel.app-f0b07a?style=for-the-badge&labelColor=120806"></a>

<sub>Sign in with email and password, Google, GitHub or Microsoft. The server sleeps when idle, so the first visit can take up to a minute to connect.</sub>

[Tour](#-take-the-tour) · [Inside the app](#-inside-the-app) · [Themes](#-make-it-yours) · [Features](#-everything-thats-unlocked) · [Architecture](#-how-it-works) · [Run it](#-run-it-locally) · [Deploy](#-deploy)

</div>

---

## 🎬 Take the tour

> Everything below is from the live site. Open **[slack-reverse.vercel.app](https://slack-reverse.vercel.app)** to try it yourself.

<table>
<tr>
<td width="50%" valign="top">

### The home page

A motion-graphic landing page with a robot that follows your cursor, a live demo chat and a scroll-driven tour of the product.

<a href="https://slack-reverse.vercel.app"><img src="docs/readme/hero.jpg" alt="Relay home page: Team chat that talks back, with the Relay robot and a live demo chat"></a>

</td>
<td width="50%" valign="top">

### The sign-in page

A 3D stage where the scene and the card tilt toward your cursor. Sign in with email and password, Google, GitHub or Microsoft, with an optional invite code.

<a href="https://slack-reverse.vercel.app"><img src="docs/readme/signin.jpg" alt="Relay sign-in page with a 3D robot and a glass card offering email, Google, GitHub and Microsoft sign-in"></a>

</td>
</tr>
</table>

<div align="center">

| The intro | Home → sign-in |
| :---: | :---: |
| <img src="docs/readme/intro.gif" alt="The Relay logo draws itself, then the splash lifts away" width="420"> | <img src="docs/readme/transition.gif" alt="Panels sweep across the screen as the home page changes to the sign-in page" width="420"> |
| The logo draws itself, then the splash lifts away. Click or press any key to skip it. | Panels sweep across the screen as the page changes underneath them. |

</div>

<details>
<summary><b>▶ Scroll the whole landing page</b> (3.8 MB GIF)</summary>
<br>
<div align="center"><img src="docs/readme/scroll.gif" alt="Scrolling through the whole Relay landing page" width="720"></div>
</details>

<details>
<summary><b>▶ See each scene of the scroll tour</b></summary>
<br>

| Threads | Huddles |
| :---: | :---: |
| <img src="docs/readme/tour-tour.jpg" alt="Tour scene: post in a channel, replies fold into a thread"> | <img src="docs/readme/tour-huddles.jpg" alt="Tour scene: huddles with voice and screen share"> |
| **Workflows** | **Search** |
| <img src="docs/readme/tour-workflows.jpg" alt="Tour scene: workflows welcome new people"> | <img src="docs/readme/tour-search.jpg" alt="Tour scene: Ctrl+K search"> |

</details>

<details>
<summary><b>▶ The robot is watching</b></summary>
<br>
<div align="center">
<img src="docs/readme/hero-look.jpg" alt="The hero robot turns its head toward the cursor" width="720">
<p><sub>Move your cursor around the hero and the robot's head follows it, while the big ghost wordmark drifts the other way.</sub></p>
</div>
</details>

---

## 💬 Inside the app

<div align="center">
<img src="docs/readme/app-channel.jpg" alt="The #launch channel with mentions, a pinned code block, reactions and a quote" width="100%">
<sub>#launch: mentions, a pinned code block, reactions, a quote, and a thread with 3 replies.</sub>
</div>
<br>

<table>
<tr>
<td width="50%" valign="top">
<b>🧵 Threads</b><br>
<sub>Replies fold into a side panel with its own composer and a one-click summary.</sub>
<img src="docs/readme/app-thread.jpg" alt="A thread open in the side panel">
</td>
<td width="50%" valign="top">
<b>📄 Canvases</b><br>
<sub>A shared doc in every channel, with headings, lists and live @mentions.</sub>
<img src="docs/readme/app-canvas.jpg" alt="The launch plan canvas">
</td>
</tr>
<tr>
<td width="50%" valign="top">
<b>☑ Lists</b><br>
<sub>A task board grouped by status, with assignees and due dates.</sub>
<img src="docs/readme/app-list.jpg" alt="The launch list grouped into To do, In progress and Done">
</td>
<td width="50%" valign="top">
<b>🔍 Search</b> <kbd>Ctrl</kbd> + <kbd>K</kbd><br>
<sub>Every message, person and channel at once. End with <code>?</code> for a best answer.</sub>
<img src="docs/readme/app-search.jpg" alt="Ctrl+K search results for 'deploy'">
</td>
</tr>
</table>

<details>
<summary><b>🛡️ Admin console</b>: analytics, members, invites, user groups, policies, flagged content, audit log</summary>
<br>
<img src="docs/readme/app-admin.jpg" alt="Admin console analytics: messages per day, most active channels and top posters">
</details>

<details>
<summary><b>📱 On your phone</b></summary>
<br>
<div align="center">

| Home | Workspace |
| :---: | :---: |
| <img src="docs/readme/mobile-hero.jpg" alt="Relay home page on a phone" width="260"> | <img src="docs/readme/app-mobile-home.jpg" alt="Relay workspace on a phone" width="260"> |

</div>
</details>

---

## 🎨 Make it yours

**Preferences → Appearance** picks a colour theme (Apple, Apple dark, or System, which follows your device's light or dark setting), an accent colour, the density, and a workspace background: Plain, or an image you upload (kept in your browser, up to 3 MB).

---

## ✨ Everything that's unlocked

Channels (public and private), DMs, threads, reactions, edit and delete, pins, saved items, mentions, rich text, file attachments with link previews, presence and typing, unread badges, <kbd>Ctrl</kbd>+<kbd>K</kbd> search, huddles with voice, screen sharing and speaking indicators, canvases, lists, Workflow Builder, scheduled messages, multiple workspaces with invite links, and `/remind` `/topic` `/me` `/shrug` `/huddle` `/summarize` `/recap` `/explain`.

Mapped from the public plan-comparison page (`docs/slack/pricing.md`). Everything runs with no seat limits.

<details open>
<summary><b>Premium feature coverage</b></summary>
<br>

| Area | What Relay has |
| --- | --- |
| 🚀 Productivity | Lists (board by status, assignee, due date), custom sidebar sections, user groups with `@handle` mentions, audio and screen clips, huddle notes posted when a huddle ends |
| 🤖 AI-style | `/recap` daily recap, `/explain <term>`, thread and channel summaries, file summaries for text files, "best answer" when a search ends in `?`. All are local heuristics, not an LLM |
| ⚡ Automation | Workflow Builder with keyword, join and scheduled triggers, conditional branching and starter templates |
| 🛡️ Security and admin | Roles (owner, admin, member, guest), guests see only channels they were added to, admins-only posting, admin console with analytics, audit log, flagged content review |
| 📜 Compliance | Retention policy, legal holds that preserve edited and deleted messages, information barriers between user groups, custom terms of service with re-acceptance, full JSON data export |

Not built because they need external services: Slack Connect, SSO and SCIM, EKM, DLP scanning, data residency, Salesforce/CRM and the app directory.

</details>

<details>
<summary><b>Slash commands cheat sheet</b></summary>
<br>

| Command | What it does |
| --- | --- |
| `/remind me <what> in 10m` | Relay Bot DMs you a reminder (`s`, `m`, `h` or `d`) |
| `/topic <text>` | Sets the channel topic |
| `/huddle` | Starts or joins the channel's huddle |
| `/summarize` | Recaps the channel, or the thread you're in |
| `/recap` | Your daily recap of everything you can see, sent as a DM |
| `/explain <term>` | Finds where your team defined or discussed a term |
| `/me <action>` · `/shrug` | The classics |
| `!help` | Asks Relay Bot what it can do |

</details>

---

## 🧭 How it works

<div align="center">
<img src="docs/readme/architecture.svg" alt="Relay architecture: browsers on Vercel talk over WebSockets to a Node server on Render, which uses Supabase for sign-in, state and file storage; huddle audio and screens go browser to browser over WebRTC" width="100%">
</div>

<details>
<summary><b>Huddles: voice and screen share</b></summary>
<br>

Huddle audio and screen sharing run peer to peer over WebRTC. Every browser in a huddle connects directly to every other one (a mesh), and the Relay server only relays the connection setup (offers, answers, ICE candidates) between tabs in the same huddle. Media never passes through the server. A mesh suits small teams, so a huddle holds up to 6 people (`MAX_HUDDLE` in `src/types.ts`): each person uploads their mic and screen once per other person, so bandwidth and CPU grow with every extra participant.

Browsers find each other with Google's public STUN servers. That works on most home networks, but strict NATs and firewalls (some office, campus and mobile networks) block direct connections, and then the huddle shows people stuck on "connecting". Fix that with a TURN relay (for example coturn, or a hosted one such as Cloudflare Calls, Twilio or Metered) and set these in the UI build:

- `VITE_TURN_URL`: one or more comma-separated URLs, e.g. `turn:turn.example.com:3478,turns:turn.example.com:5349`
- `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL`

They are baked into the UI bundle, so anyone using the app can read them. Use a TURN service with short-lived or usage-capped credentials. For bigger calls (more than about 6 people), the next step is an SFU such as LiveKit, where each browser uploads once and the server forwards the media.

In the console, `await relayHuddle.stats()` shows the bytes and frames sent and received per peer.
</details>

<details>
<summary><b>Security</b></summary>
<br>

- Sign-in is verified on every socket with Supabase, and only confirmed email addresses are accepted. The state table has row-level security on and is only reachable with the server's service key.
- Every event is checked against channel visibility, posting policy, roles and information barriers on the server.
- Attachments are accepted only as inline uploads; link previews refuse private, loopback and link-local addresses, including on redirects and DNS answers.
- Each socket is rate limited, dead sockets are dropped by a heartbeat, and pending writes are flushed when the host restarts the server.
- Without Supabase, identity is a local account (or just a name) stored on the server, so run that mode only behind a trusted network. With `NODE_ENV=production` the server refuses name-only sign-in unless `RELAY_ALLOW_DEV_AUTH=1` is set. With dev auth on, emails are unproven, so anyone could register the owner email first; never enable it on a public deployment.
</details>

---

## 🛠️ Run it locally

```bash
npm install
npm run dev        # API + WebSocket on :8787, UI on :5173
```

<details>
<summary>All scripts</summary>

```bash
npm run build && npm start   # one server on :8787 that also serves the UI
npm run lint                 # tsc --noEmit
npm test                     # node --test
```

Without Supabase settings, state persists to `data/db.json` and sign-in uses local accounts in `data/dev-auth.json` (create an account, sign in, or try it with just a name). Password reset and the Google, GitHub and Microsoft buttons need Supabase. The first person to join a workspace becomes its owner.
</details>

## 🚀 Deploy

The live instance runs this setup: the UI at **[slack-reverse.vercel.app](https://slack-reverse.vercel.app)** (Vercel) and the server at **[relay-server-m7b5.onrender.com](https://relay-server-m7b5.onrender.com/healthz)** (Render).

Relay needs a long-running server for WebSockets, so the server runs on a WebSocket-capable host and the UI on Vercel.

1. **Server:** on Render, create a Blueprint from this repo (`render.yaml`). It builds, starts `npm start`, health-checks `/healthz` and runs with `NODE_ENV=production`. Any Node host works: build with `npm run build`, run `npm start`, and set `PORT` (and `DATA_DIR` if you store state on disk).
2. **UI:** in Vercel, import the repo (framework Vite, `vercel.json` is included) and set `VITE_WS_URL=wss://<your-server-host>/ws`. Redeploy after changing it, since it is baked in at build time.
3. **Auth + persistence:** follow [docs/supabase-setup.md](docs/supabase-setup.md) to create the Supabase project, state table, email and password sign-in (with "Confirm email" on, plus custom SMTP) and the Google, GitHub and Microsoft providers. Then set the server and UI variables below.

Server environment variables:

| Name | Meaning |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase project URL and service_role key. Required for sign-in in production. |
| `SUPABASE_JWT_SECRET` | Project Settings → API → JWT Settings → JWT Secret. Lets the server verify tokens locally. |
| `SUPABASE_JWKS_URL` | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`, for projects on asymmetric signing keys. Use it instead of the secret. With neither set, the server checks each token with a call to Supabase. |
| `RELAY_OWNER_EMAIL` | The person with this email becomes owner on first sign-in. Without it, the first person to sign in becomes owner. |
| `RELAY_ALLOW_DEV_AUTH` | Set to `1` to allow offline dev sign-in in production. Not recommended. With dev auth on, emails are unproven, so anyone could register the owner email first; never enable it on a public deployment. |
| `RELAY_APP_URL` | The UI's public address, used in notification emails. |
| `RELAY_EMAIL_PROVIDER`, `RESEND_API_KEY`, `RELAY_EMAIL_FROM` | Notification email, see [docs/email-notifications.md](docs/email-notifications.md). |
| `PORT`, `DATA_DIR` | Listen port (default 8787) and where file state is stored. |

UI variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WS_URL`. Who may join (allowed email domains, default role and channels, invite-only) is set in the Admin console under Invites → Sign-up policy.

The server also serves the built UI itself, so you can skip Vercel and use the server URL directly.

---

<div align="center">
<sub>Built from publicly known Slack behavior only. No Slack code, assets or private APIs were inspected or copied.<br>
Screenshots: the home and sign-in pages are from the live site; the workspace views are from a local server with demo data.</sub>
</div>
