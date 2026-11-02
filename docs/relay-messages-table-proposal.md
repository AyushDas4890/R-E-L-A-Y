# Proposal: move messages into their own Supabase table

Status: **proposal only, nothing implemented.** It changes the Supabase schema and the `relay_state` row format, so it needs your approval first.

## Problem
Each workspace is one JSON document (`relay_state`), saved whole 250 ms after any change. Messages are most of it and only grow. Every new message rewrites every old one, a crash in the window loses writes, and two server instances overwrite each other's messages. Phase 3 cut what clients receive, not what the server stores and writes.

## Proposed table
```sql
create table relay_messages (
  workspace_id text   not null,           -- 'hq' or the workspace id
  id           text   not null,           -- the message uuid
  channel_id   text   not null,
  thread_id    text,
  user_id      text   not null,
  ts           bigint not null,           -- ms, server clock
  data         jsonb  not null,           -- text, reactions, files, preview, pinned, edited, system
  primary key (workspace_id, id)
);
create index relay_messages_page on relay_messages (workspace_id, channel_id, ts desc, id desc);
create index relay_messages_thread on relay_messages (workspace_id, thread_id) where thread_id is not null;
alter table relay_messages enable row level security;  -- no policies: only the service-role key reads or writes
```
The page index matches the `history` cursor `(ts, id)` exactly, so a page is one indexed query.

## How the server changes
- A message change (send, edit, react, pin, delete) writes **one row**, not the whole workspace.
- `history` and the join snapshot read the newest rows per channel from the table. A small per-channel cache keeps recent messages in memory for live broadcast.
- Retention and legal hold become `delete ... where ts < $cutoff` and a copy to a `preserved` flag. Export streams rows.
- Optional, same table: a `tsvector` index on `data->>'text'` gives real server-side search, which also fixes today's limit that search, Activity and unread counts only see loaded messages.
- `relay_state` loses its `messages` array (and `preserved`). Everything else in it is unchanged.

## Rollout (no downtime, each step reversible until the last)
1. Create the table (you run the SQL; I never touch production).
2. Dual-write: server keeps the old document and also writes rows. Reads stay on the document.
3. Backfill script copies existing messages into the table (idempotent upsert by `(workspace_id, id)`), then compares counts per channel.
4. Flip reads to the table behind an env flag (`RELAY_MESSAGES_TABLE=1`). Roll back by unsetting it.
5. After a quiet week, stop writing `messages` into `relay_state` and strip the array.

## Risks
- Per-message writes mean more small requests; a failed write must retry (today a failed save also waits for the next change). I would add a short write queue with retry.
- Files stay in Storage; only metadata moves.
- Only messages leave the single-writer model. Channels, users, canvases and lists stay in the document, so **running two server instances is still not safe**. That needs a separate step (per-workspace lock or the same split for the rest).
- Size: roughly 400 changed lines plus the backfill script and tests. I would split it into steps 2 to 3 and steps 4 to 5.

## What I need from you
1. Approve the schema above (or change it).
2. Approve changing the `relay_state` format at step 5.
3. Include server-side search now, or leave it for later?
