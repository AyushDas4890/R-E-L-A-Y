// Verifies Supabase access tokens locally, without a round trip to the auth server.
// HS256 with the project's JWT secret, or asymmetric keys from the project's JWKS endpoint.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { identityFromUser, type Identity } from './auth.ts';

export interface JwtOptions { secret?: string; jwksUrl?: string; now?: () => number }

export interface JwtClaims {
  sub: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: { provider?: string; providers?: string[] };
  exp?: number;
}

// Returns null when neither a secret nor a JWKS URL is configured. The returned function
// resolves to the token's claims, or null for any invalid, expired or malformed token.
export function createJwtVerifier(opts: JwtOptions): ((token: string) => Promise<JwtClaims | null>) | null {
  const secret = opts.secret?.trim();
  const jwksUrl = opts.jwksUrl?.trim();
  if (!secret && !jwksUrl) return null;
  const currentDate = opts.now ? () => new Date(opts.now!()) : () => undefined;
  if (secret) {
    const key = new TextEncoder().encode(secret);
    return async (token) => {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], currentDate: currentDate() });
        return toClaims(payload);
      } catch {
        return null;
      }
    };
  }
  const jwks = createRemoteJWKSet(new URL(jwksUrl!));
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, jwks, { algorithms: ['ES256', 'RS256'], currentDate: currentDate() });
      return toClaims(payload);
    } catch {
      return null;
    }
  };
}

function toClaims(payload: Record<string, unknown>): JwtClaims | null {
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  return payload as unknown as JwtClaims;
}

// Every valid Supabase JWT counts as email-verified: Supabase only issues a session once
// "Confirm email" is satisfied. user_metadata is writable by the signed-in user, so its
// email_verified claim is never read here.
export function identityFromClaims(c: JwtClaims): Identity {
  const meta = (c.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const identity = identityFromUser({
    id: c.sub,
    email: typeof c.email === 'string' && c.email ? c.email : null,
    user_metadata: {
      full_name: str(meta.full_name),
      name: str(meta.name),
      user_name: str(meta.user_name),
      avatar_url: str(meta.avatar_url),
      picture: str(meta.picture),
    },
  });
  return { ...identity, emailVerified: true };
}
