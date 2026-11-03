// Where pages are kept. Not inside the workspace document: a long page or a big database would be
// rewritten on every chat message. Each workspace has
//   - one index (the page tree, sharing and favorites; small, no block bodies), and
//   - one body per page (its blocks).
// In Supabase these are rows of the existing relay_state table (ids `pg-<ws>` and `pb-<ws>-<page>`),
// so there is no schema change. Without Supabase they are JSON files under the data directory.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createFileStore, createSupabaseStore, type Store } from './store.ts';
import type { InboxItem, Page, Reminder, Teamspace } from '../src/types.ts';
import type { PageBody } from './pages.ts';

export interface PagesIndex {
  v: 1;
  pages: Record<string, Page>;
  // User id -> favorite page ids.
  favorites: Record<string, string[]>;
  // Teamspaces other than the default one (id `general`).
  teamspaces: Record<string, Teamspace>;
  // User id -> notifications about pages.
  inbox: Record<string, InboxItem[]>;
  // Times people asked to be reminded about a page (a date with a time, @-mentioned in it).
  reminders: Reminder[];
}

export interface PageStore {
  loadIndex(): Promise<PagesIndex>;
  saveIndex(index: PagesIndex): Promise<void>;
  loadBody(id: string): Promise<PageBody>;
  saveBody(body: PageBody): Promise<void>;
  removeBody(id: string): Promise<void>;
}

export const emptyIndex = (): PagesIndex => ({ v: 1, pages: {}, favorites: {}, teamspaces: {}, inbox: {}, reminders: [] });
export const emptyBody = (id: string): PageBody => ({ id, version: 0, blocks: [] });

// Page ids are made by the server (uuids). Anything else never reaches a file name or a row id.
// A row's page id is `<database id>.<row id>`; each part is a plain id, so nothing reaches a path.
const SAFE_ID = /^[A-Za-z0-9-]{1,64}(.[A-Za-z0-9-]{1,64})?$/;
const safe = (id: string): string => {
  if (!SAFE_ID.test(id)) throw new Error('bad page id');
  return id;
};

export function createPageStore(workspaceId: string, dataDir: string): PageStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

  const indexStore: Store<PagesIndex> = client
    ? createSupabaseStore<PagesIndex>(client, emptyIndex, `pg-${workspaceId}`)
    : createFileStore<PagesIndex>(path.join(dataDir, `pages-${workspaceId}.json`), emptyIndex);
  const bodyStore = (id: string): Store<PageBody> =>
    client
      ? createSupabaseStore<PageBody>(client, () => emptyBody(id), `pb-${workspaceId}-${safe(id)}`)
      : createFileStore<PageBody>(path.join(dataDir, 'pages', workspaceId, `${safe(id)}.json`), () => emptyBody(id));

  return {
    async loadIndex() {
      const raw = (await indexStore.load()) as Partial<PagesIndex>;
      return { v: 1, pages: raw.pages ?? {}, favorites: raw.favorites ?? {}, teamspaces: raw.teamspaces ?? {}, inbox: raw.inbox ?? {}, reminders: raw.reminders ?? [] };
    },
    saveIndex: (index) => indexStore.save(index),
    async loadBody(id) {
      const raw = (await bodyStore(id).load()) as Partial<PageBody>;
      return { ...raw, id, version: raw.version ?? 0, blocks: raw.blocks ?? [] };
    },
    saveBody: (body) => bodyStore(body.id).save(body),
    async removeBody(id) {
      if (client) {
        const { error } = await client.from('relay_state').delete().eq('id', `pb-${workspaceId}-${safe(id)}`);
        if (error) throw new Error(`relay_state delete failed: ${error.message}`);
      } else {
        await fs.promises.rm(path.join(dataDir, 'pages', workspaceId, `${safe(id)}.json`), { force: true });
      }
    },
  };
}

// For tests: the same interface, in memory.
export function createMemoryPageStore(): PageStore & { bodies: Map<string, PageBody>; index: PagesIndex } {
  const bodies = new Map<string, PageBody>();
  let index = emptyIndex();
  return {
    bodies,
    get index() {
      return index;
    },
    async loadIndex() {
      return structuredClone(index);
    },
    async saveIndex(i) {
      index = structuredClone(i);
    },
    async loadBody(id) {
      return structuredClone(bodies.get(id) ?? emptyBody(id));
    },
    async saveBody(b) {
      bodies.set(b.id, structuredClone(b));
    },
    async removeBody(id) {
      bodies.delete(id);
    },
  };
}
