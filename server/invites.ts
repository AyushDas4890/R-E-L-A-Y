// Pure helpers for invite codes and the owner/member join decision.
// No I/O so they can be unit-tested in isolation.
import { randomInt } from 'node:crypto';
import type { Invite } from '../src/types.ts';

// A short, url-safe, lowercase code. `rand` is injectable for deterministic tests; the default
// is cryptographic so codes can't be predicted from earlier ones.
export function generateCode(rand: () => number = () => randomInt(0x7fffffff) / 0x7fffffff): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let code = '';
  for (let i = 0; i < 10; i++) code += alphabet[Math.floor(rand() * alphabet.length)];
  return code;
}

export function validateInvite(code: string | undefined, invites: Invite[]): boolean {
  if (!code) return false;
  return invites.some((i) => i.code === code && !i.revoked);
}

// `reservedForOther` is set when the workspace was created by someone else who has not joined
// yet: the owner seat is theirs, so a stranger who finds the id first can't claim it.
export type JoinInputs = { hasOwner: boolean; isMember: boolean; validInvite: boolean; inviteOnly?: boolean; reservedForOther?: boolean };
export type JoinResult = 'owner' | 'member' | 'reject';

// Open workspaces let anyone who signs in join; invite-only ones need a valid code.
export function decideRole({ hasOwner, isMember, validInvite, inviteOnly = false, reservedForOther = false }: JoinInputs): JoinResult {
  if (!hasOwner && !reservedForOther) return 'owner';
  if (isMember) return 'member';
  if (validInvite || !inviteOnly) return 'member';
  return 'reject';
}
