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

## Features (all unlocked)

Channels (public/private), DMs, threads, reactions, edit/delete, pins, saved items, mentions, rich text, file attachments, presence and typing, unread badges, Cmd/Ctrl+K search, huddles with mic meter, canvases, Workflow Builder, scheduled messages, `/remind` `/topic` `/me` `/shrug` `/huddle` `/summarize`, four themes.

## Notes

- Identity is a name stored in localStorage. No auth: run behind a trusted network.
- Huddles share presence and use the local mic for a level meter. No audio is relayed between users yet.
- `/summarize` is a local heuristic recap, not an LLM.
