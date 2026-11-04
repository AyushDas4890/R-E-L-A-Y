// Step 2 of docs/relay-messages-table-proposal.md: mirror messages into the relay_messages table.
// The workspace document stays the source of truth and reads never touch this table yet.
// Pure diffing lives here so it can be tested without a database.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Message } from '../src/types.ts';

export interface MessageRow {
  workspace_id: string;
  id: string;
  channel_id: string;
  thread_id: string | null;
  user_id: string;
  ts: number;
  data: Message;
}

// The whole message goes in `data`, so a later read can rebuild it exactly; the columns exist for the indexes.
export function toRow(workspaceId: string, m: Message): MessageRow {
  return { workspace_id: workspaceId, id: m.id, channel_id: m.channelId, thread_id: m.threadId ?? null, user_id: m.userId, ts: m.ts, data: m };
}

// `synced` maps message id -> the JSON last written for it. Returns what must be written to bring the
// table level with `messages`; nothing is mutated, so the caller decides what counts as written.
export function diffMessages(synced: Map<string, string>, messages: Message[]): { upserts: { m: Message; json: string }[]; deletes: string[] } {
  const upserts: { m: Message; json: string }[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    seen.add(m.id);
    const json = JSON.stringify(m);
    if (synced.get(m.id) !== json) upserts.push({ m, json });
  }
  const deletes = [...synced.keys()].filter((id) => !seen.has(id));
  return { upserts, deletes };
}

export function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const BATCH = 200;

export interface MessageSync {
  // Brings the table level with these messages. Never throws: a failed batch is retried by the next call.
  sync(messages: Message[]): Promise<void>;
}

// Stays off unless RELAY_MESSAGES_DUAL_WRITE=1 and Supabase is configured.
export function createMessageSync(workspaceId: string, client: SupabaseClient | null, enabled: boolean): MessageSync | null {
  if (!enabled || !client) return null;
  const synced = new Map<string, string>();
  let running: Promise<void> = Promise.resolve();

  async function run(messages: Message[]): Promise<void> {
    const { upserts, deletes } = diffMessages(synced, messages);
    for (const batch of chunks(upserts, BATCH)) {
      const { error } = await client!.from('relay_messages').upsert(batch.map(({ m }) => toRow(workspaceId, m)), { onConflict: 'workspace_id,id' });
      if (error) { console.error(`relay_messages upsert failed (${workspaceId}):`, error.message); return; }
      for (const { m, json } of batch) synced.set(m.id, json);
    }
    for (const batch of chunks(deletes, BATCH)) {
      const { error } = await client!.from('relay_messages').delete().eq('workspace_id', workspaceId).in('id', batch);
      if (error) { console.error(`relay_messages delete failed (${workspaceId}):`, error.message); return; }
      for (const id of batch) synced.delete(id);
    }
  }

  return {
    // Calls run one after another so two flushes can't interleave their batches.
    sync(messages) {
      const snapshot = [...messages];
      running = running.then(() => run(snapshot)).catch((err) => console.error('relay_messages sync failed:', err instanceof Error ? err.message : err));
      return running;
    },
  };
}
