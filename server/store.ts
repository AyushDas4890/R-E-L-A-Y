// Persistence abstraction. Two backends:
//  - file: JSON on disk (local dev, CI, and fallback when Supabase env is absent)
//  - supabase: one JSONB row per document in the relay_state table (each workspace is a row;
//    the original workspace keeps the 'singleton' row)
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

export function createSupabaseStore<T>(client: SupabaseClient, seed: () => T, rowId: string = ROW_ID): Store<T> {
  return {
    async load() {
      const { data, error } = await client.from(TABLE).select('data').eq('id', rowId).maybeSingle();
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
        .upsert({ id: rowId, data: state, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) throw new Error(`relay_state save failed: ${error.message}`);
    },
  };
}

// Chooses the backend from the environment. Supabase when both vars are present,
// otherwise the file at `fallbackPath`.
export function createStore<T>(seed: () => T, fallbackPath: string, rowId?: string): Store<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const client = createClient(url, key, { auth: { persistSession: false } });
    return createSupabaseStore<T>(client, seed, rowId);
  }
  return createFileStore<T>(fallbackPath, seed);
}
