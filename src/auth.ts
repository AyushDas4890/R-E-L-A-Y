// Client sign-up, sign-in, password reset and provider helpers. Each async helper takes the
// Supabase client (null in dev mode, which then uses the server's /api/dev routes). This module
// imports only types at the top so the pure helpers run under plain `node --test`.
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthResult = { ok: true; needsVerification?: boolean } | { ok: false; message: string };

// Window event that tells useAuthToken a dev session was just saved, so it signs in without a reload.
export const DEV_SESSION_EVENT = 'relay:dev-session';

const SUPABASE_MESSAGES: [string, string][] = [
  ['Invalid login credentials', 'Wrong email or password.'],
  ['User already registered', 'An account with this email already exists. Sign in instead.'],
  ['Email not confirmed', 'Check your inbox and confirm your email first.'],
  ['Password should be at least', 'Use at least 8 characters.'],
];

// Turns Supabase's auth error text into something people can act on; unknown messages pass through.
export function friendlyAuthError(message: string): string {
  for (const [match, text] of SUPABASE_MESSAGES) if (message.includes(match)) return text;
  return message;
}

const DEV_MESSAGES: Record<string, string> = {
  exists: 'An account with this email already exists. Sign in instead.',
  weak: 'Use at least 8 characters.',
  invalid: 'Enter a valid email address.',
  'bad-credentials': 'Wrong email or password.',
};

// Maps an error code from /api/dev/signup or /api/dev/login to user text.
export function devAuthError(code: string | undefined): string {
  return (code && DEV_MESSAGES[code]) || 'Sign-in failed. Try again.';
}

// Where Supabase sends people back to, carrying the invite code across the round trip.
export function redirectWithInvite(invite: string): string {
  return `${window.location.origin}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`;
}

async function devAuth(kind: 'signup' | 'login', body: { email: string; password: string; name?: string }, invite: string): Promise<AuthResult> {
  let data: { token?: string; error?: string };
  try {
    const res = await fetch(`/api/dev/${kind}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    data = await res.json();
  } catch (err) {
    console.warn('dev sign-in failed', err);
    return { ok: false, message: devAuthError(undefined) };
  }
  if (!data.token) return { ok: false, message: devAuthError(data.error) };
  // Loaded lazily: the store pulls in React and the Supabase client, which tests cannot load.
  const { saveDevSession } = await import('./store.ts');
  saveDevSession(data.token, invite);
  window.dispatchEvent(new CustomEvent(DEV_SESSION_EVENT));
  return { ok: true };
}

export async function signUpWithPassword(supabase: SupabaseClient | null, email: string, password: string, name: string, invite: string): Promise<AuthResult> {
  if (!supabase) return devAuth('signup', { email, password, name }, invite);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name }, emailRedirectTo: redirectWithInvite(invite) },
  });
  if (error) return { ok: false, message: friendlyAuthError(error.message) };
  // With "Confirm email" on, Supabase returns no session until the link in the email is opened.
  return { ok: true, needsVerification: !data.session };
}

export async function signInWithPassword(supabase: SupabaseClient | null, email: string, password: string, invite = ''): Promise<AuthResult> {
  if (!supabase) return devAuth('login', { email, password }, invite);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true };
}

export async function requestPasswordReset(supabase: SupabaseClient | null, email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Password reset needs Supabase.' };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` });
  return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true };
}

// Success fires USER_UPDATED, which clears useAuthToken's `recovery` flag.
export async function updatePassword(supabase: SupabaseClient | null, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Password reset needs Supabase.' };
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true };
}

// Sends the sign-up confirmation email again.
export async function resendConfirmation(supabase: SupabaseClient | null, email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Email confirmation needs Supabase.' };
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true };
}
export async function signInWithProvider(supabase: SupabaseClient | null, provider: 'google' | 'github' | 'azure', invite: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Provider sign-in needs Supabase.' };
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectWithInvite(invite),
      // Always show the provider's account chooser instead of silently reusing the browser's session.
      queryParams: { prompt: 'select_account' },
      scopes: provider === 'azure' ? 'email openid profile' : undefined,
    },
  });
  return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true };
}
