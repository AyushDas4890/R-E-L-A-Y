// Verifies a Supabase access token and maps it to Relay identity fields.
// `AuthClient` is the slice of SupabaseClient we use, so tests can inject a fake.
export interface SupabaseUser {
  id: string;
  email: string | null;
  email_confirmed_at?: string | null;
  user_metadata: { full_name?: string; name?: string; user_name?: string; avatar_url?: string; picture?: string; email_verified?: boolean };
}

export interface AuthClient {
  auth: { getUser(token: string): Promise<{ data: { user: SupabaseUser | null }; error: { message: string } | null }> };
}

export interface Identity {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl?: string;
  // Whether the provider vouches for the email address. Sign-up policy refuses unverified emails.
  emailVerified: boolean;
}

export async function verifyToken(token: string, client: AuthClient): Promise<Identity | null> {
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const u = data.user;
  const meta = u.user_metadata ?? {};
  const name =
    meta.full_name?.trim() ||
    meta.name?.trim() ||
    meta.user_name?.trim() ||
    (u.email ? u.email.split('@')[0] : '') ||
    'Member';
  return {
    userId: u.id,
    name: name.slice(0, 40),
    email: u.email,
    // GitHub sends avatar_url; Google sends picture (Supabase usually copies it to avatar_url too).
    avatarUrl: meta.avatar_url ?? meta.picture,
    // Only email_confirmed_at counts: Supabase sets it server-side. user_metadata is writable by the
    // signed-in user (auth.updateUser), so an email_verified flag there could be spoofed.
    emailVerified: !!u.email_confirmed_at,
  };
}
