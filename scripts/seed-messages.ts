// Dev helper: fills #general in the hq workspace (data/db.json) with 2,000 older messages, so the
// virtualised message list and history paging can be tried on a long channel.
// Run it with the server stopped: node scripts/seed-messages.ts
// Running it again replaces the earlier seed (every seeded message's text starts with "seed-").
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COUNT = 2000;
const CHANNEL = 'general';
const GAP = 3 * 60_000;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data'), 'db.json');

interface Msg { id: string; channelId: string; userId: string; text: string; ts: number; reactions: Record<string, string[]> }
const db = JSON.parse(readFileSync(file, 'utf8')) as { users: Record<string, { bot?: boolean }>; messages: Msg[] };

const authors = Object.entries(db.users).filter(([, u]) => !u.bot).map(([id]) => id);
if (!authors.length) throw new Error('No people in the workspace to write the messages.');

const kept = db.messages.filter((m) => !m.text.startsWith('seed-'));
const oldest = Math.min(Date.now(), ...kept.filter((m) => m.channelId === CHANNEL).map((m) => m.ts));
const words = 'the quick brown fox jumps over a lazy dog while the build runs and the tests pass on the second try'.split(' ');

const seeded: Msg[] = [];
let author = authors[0];
for (let i = 0; i < COUNT; i++) {
  // Runs of two or three messages from one person, so grouping shows up.
  if (i % 3 === 0) author = authors[(i * 7) % authors.length];
  const length = 3 + ((i * 13) % 40);
  const text = `seed-${i + 1} ${Array.from({ length }, (_, k) => words[(i + k) % words.length]).join(' ')}`;
  seeded.push({ id: randomUUID(), channelId: CHANNEL, userId: author, text, ts: oldest - (COUNT - i) * GAP, reactions: {} });
}

db.messages = [...seeded, ...kept].sort((a, b) => a.ts - b.ts);
writeFileSync(file, JSON.stringify(db));
console.log(`Wrote ${COUNT} messages to #${CHANNEL} in ${file} (${db.messages.length} messages in total).`);
