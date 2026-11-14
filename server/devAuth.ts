// Offline email and password sign-in for local dev, used when Supabase is not configured.
// Accounts and the token signing secret live in one JSON file beside the other dev data.
// Tokens look like `dev.<base64url json {id,email,name}>.<hmac-sha256 hex>`, so the server can
// tell them apart from legacy `uuid:name` tokens and from Supabase JWTs.
import fs from 'node:fs';
import path from 'node:path';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Identity } from './auth.ts';

export interface DevAccount { id: string; email: string; name: string; hash: string; salt: string; createdAt: number }
export interface DevAuthDoc { secret: string; accounts: DevAccount[] }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const PREFIX = 'dev.';

const cleanEmail = (email: string) => email.trim().toLowerCase();

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64, { N: 16384 }).toString('hex');
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function mintToken(doc: DevAuthDoc, account: DevAccount): string {
  const body = Buffer.from(JSON.stringify({ id: account.id, email: account.email, name: account.name })).toString('base64url');
  return `${PREFIX}${body}.${sign(doc.secret, body)}`;
}

export function verifyDevToken(doc: DevAuthDoc, token: string): Identity | null {
  if (typeof token !== 'string' || !token.startsWith(PREFIX)) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, body, sig] = parts;
  if (!body || !sig || !/^[0-9a-f]{64}$/.test(sig) || !sameHex(sig, sign(doc.secret, body))) return null;
  let claims: unknown;
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  const { id, email, name } = (claims ?? {}) as Record<string, unknown>;
  if (typeof id !== 'string' || typeof email !== 'string' || typeof name !== 'string') return null;
  // A deleted account's tokens stop working even though their signature is still valid.
  if (!doc.accounts.some((a) => a.id === id)) return null;
  return { userId: id, name, email, emailVerified: true };
}

export function signup(doc: DevAuthDoc, email: string, password: string, name: string):
  { ok: true; token: string } | { ok: false; error: 'exists' | 'weak' | 'invalid' } {
  const clean = cleanEmail(String(email ?? ''));
  if (!EMAIL_RE.test(clean) || clean.length > 254) return { ok: false, error: 'invalid' };
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return { ok: false, error: 'weak' };
  if (doc.accounts.some((a) => a.email === clean)) return { ok: false, error: 'exists' };
  const salt = randomBytes(16).toString('hex');
  const account: DevAccount = {
    id: randomUUID(),
    email: clean,
    name: String(name ?? '').trim().slice(0, 40) || clean.split('@')[0].slice(0, 40),
    hash: hashPassword(password, salt),
    salt,
    createdAt: Date.now(),
  };
  doc.accounts.push(account);
  return { ok: true, token: mintToken(doc, account) };
}

export function login(doc: DevAuthDoc, email: string, password: string):
  { ok: true; token: string } | { ok: false; error: 'bad-credentials' } {
  const clean = cleanEmail(String(email ?? ''));
  const account = doc.accounts.find((a) => a.email === clean);
  // Hash even for an unknown email, so the response time does not reveal which emails exist.
  const hash = hashPassword(typeof password === 'string' ? password : '', account?.salt ?? 'no-such-account');
  if (!account || !sameHex(hash, account.hash)) return { ok: false, error: 'bad-credentials' };
  return { ok: true, token: mintToken(doc, account) };
}

export async function createDevAuth(filePath: string): Promise<{ doc: DevAuthDoc; save(): Promise<void> }> {
  let doc: DevAuthDoc;
  try {
    const raw = JSON.parse(await fs.promises.readFile(filePath, 'utf8')) as Partial<DevAuthDoc>;
    doc = {
      secret: typeof raw.secret === 'string' && raw.secret ? raw.secret : randomBytes(32).toString('hex'),
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    doc = { secret: randomBytes(32).toString('hex'), accounts: [] };
  }
  const save = async () => {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(doc, null, 2), { mode: 0o600 });
  };
  // Write the seeded secret straight away so tokens survive a restart.
  await save();
  return { doc, save };
}
