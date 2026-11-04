-- Step 1 of docs/relay-messages-table-proposal.md.
-- Run by hand in the Supabase SQL editor (staging first). Nothing in the app uses this table yet;
-- creating it changes no behaviour. Safe to re-run: every statement is idempotent.

create table if not exists relay_messages (
  workspace_id text   not null,   -- 'hq' (the singleton row) or the workspace id
  id           text   not null,   -- the message uuid
  channel_id   text   not null,
  thread_id    text,              -- parent message id for replies
  user_id      text   not null,
  ts           bigint not null,   -- ms, server clock
  data         jsonb  not null,   -- text, reactions, files, preview, pinned, edited, system, preserved
  primary key (workspace_id, id)
);

-- Matches the history cursor (ts, id): one page is one indexed range scan.
create index if not exists relay_messages_page
  on relay_messages (workspace_id, channel_id, ts desc, id desc);

create index if not exists relay_messages_thread
  on relay_messages (workspace_id, thread_id) where thread_id is not null;

-- No policies on purpose: only the server's service-role key (which bypasses RLS) can read or write.
alter table relay_messages enable row level security;

-- Rollback (only while nothing writes to it): drop table relay_messages;
