// Pure helpers for invite codes and the owner/member join decision.
// No I/O so they can be unit-tested in isolation.
import type { Invite } from '../src/types.ts';

// A short, url-safe, lowercase code. `rand` is injectable for deterministic tests.
export function generateCode(rand: () => number = Math.random): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let code = '';
  for (let i = 0; i < 10; i++) code += alphabet[Math.floor(rand() * alphabet.length)];
  return code;
}

export function validateInvite(code: string | undefined, invites: Invite[]): boolean {
  if (!code) return false;
  return invites.some((i) => i.code === code && !i.revoked);
}

export type JoinInputs = { hasOwner: boolean; isMember: boolean; validInvite: boolean };
export type JoinResult = 'owner' | 'member' | 'reject';

export function decideRole({ hasOwner, isMember, validInvite }: JoinInputs): JoinResult {
  if (!hasOwner) return 'owner';
  if (isMember) return 'member';
  if (validInvite) return 'member';
  return 'reject';
}
