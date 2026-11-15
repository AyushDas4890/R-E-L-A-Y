// Sign-up policy for the organisation workspace: who may join, and with which role.
// Pure functions only, so the rules can be tested without a server.

export interface SignupInputs {
  email: string | null;
  emailVerified: boolean;
  isMember: boolean;
  removed: boolean;
  hasOwner: boolean;
  ownerEmail: string | undefined; // process.env.RELAY_OWNER_EMAIL
  allowedDomains: string[]; // settings.allowedDomains
  inviteOnly: boolean;
  validInvite: boolean;
  defaultRole: 'member' | 'guest';
}

export type SignupVerdict =
  | { ok: true; role: 'owner' | 'member' | 'guest' }
  | { ok: false; reason: 'removed' | 'unverified' | 'invite-required' | 'domain' | 'owner-pending' };

const MAX_DOMAINS = 50;

const lower = (s: string) => s.trim().toLowerCase();

// The part after the last '@', lowercased. Null when there is no usable domain.
function domainOf(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return lower(email.slice(at + 1));
}

// Exact domain match only: a listed 'b.co' does not admit 'sub.b.co'.
export function domainAllowed(email: string | null, domains: string[]): boolean {
  const d = domainOf(email);
  if (!d || domains.length === 0) return false;
  return domains.some((x) => lower(x) === d);
}

// Lowercase, trimmed, without a leading '@', no blanks or duplicates, at most 50.
export function normalizeDomains(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const d = lower(item).replace(/^@+/, '').trim();
    if (!d || out.includes(d)) continue;
    out.push(d);
    if (out.length >= MAX_DOMAINS) break;
  }
  return out;
}

export function decideSignup(i: SignupInputs): SignupVerdict {
  if (i.removed) return { ok: false, reason: 'removed' };
  if (!i.emailVerified) return { ok: false, reason: 'unverified' };
  if (i.isMember) return { ok: true, role: 'member' };
  const ownerEmail = i.ownerEmail?.trim();
  if (ownerEmail && i.email && lower(i.email) === lower(ownerEmail)) return { ok: true, role: 'owner' };
  if (!i.hasOwner && !ownerEmail) return { ok: true, role: 'owner' };
  if (i.validInvite) return { ok: true, role: i.defaultRole };
  if (domainAllowed(i.email, i.allowedDomains)) return { ok: true, role: i.defaultRole };
  if (!i.hasOwner && ownerEmail) return { ok: false, reason: 'owner-pending' };
  if (i.allowedDomains.length > 0) return { ok: false, reason: 'domain' };
  if (i.inviteOnly) return { ok: false, reason: 'invite-required' };
  return { ok: true, role: i.defaultRole };
}
