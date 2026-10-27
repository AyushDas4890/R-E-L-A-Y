// Verifies a Supabase access token and maps it to Relay identity fields.
// `AuthClient` is the slice of SupabaseClient we use, so tests can inject a fake.
export interface SupabaseUser {
  id: string;
  email: string | null;
  user_metadata: { full_name?: string; name?: string; user_name?: string; avatar_url?: string };
}

export interface AuthClient {
  auth: { getUser(token: string): Promise<{ data: { user: SupabaseUser | null }; error: { message: string } | null }> };
}

export interface Identity {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl?: string;
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
    avatarUrl: meta.avatar_url,
  };
}
