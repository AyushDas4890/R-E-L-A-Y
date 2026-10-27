// File storage. With Supabase configured, uploads go to a public Storage bucket under
// unguessable paths and messages keep only the URL; without it, files stay inline as data URLs.
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FileAttachment } from '../src/types.ts';

export const BUCKET = 'relay-files';

export interface FileStore {
  // Returns the attachment with `url` set and `dataUrl` dropped, or unchanged when there is nothing to store.
  offload(file: FileAttachment): Promise<FileAttachment>;
  read(file: FileAttachment): Promise<Buffer>;
}

export function decodeDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

// Keeps a readable, path-safe tail of the original name after the random prefix.
export function storagePath(name: string, id: string = randomUUID()): string {
  const safe = name.replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
  return `${id}/${safe}`;
}

export const inlineFiles: FileStore = {
  async offload(file) {
    return file;
  },
  async read(file) {
    if (file.dataUrl) return decodeDataUrl(file.dataUrl);
    const res = await fetch(file.url!);
    return Buffer.from(await res.arrayBuffer());
  },
};

export function createSupabaseFiles(client: SupabaseClient): FileStore {
  return {
    async offload(file) {
      if (!file.dataUrl || file.url) return file;
      const path = storagePath(file.name);
      const { error } = await client.storage
        .from(BUCKET)
        .upload(path, decodeDataUrl(file.dataUrl), { contentType: file.type || 'application/octet-stream' });
      if (error) throw new Error(`upload ${file.name} failed: ${error.message}`);
      const { data } = client.storage.from(BUCKET).getPublicUrl(path);
      return { name: file.name, type: file.type, size: file.size, url: data.publicUrl };
    },
    read: inlineFiles.read,
  };
}

export function createFiles(): FileStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return inlineFiles;
  return createSupabaseFiles(createClient(url, key, { auth: { persistSession: false } }));
}
