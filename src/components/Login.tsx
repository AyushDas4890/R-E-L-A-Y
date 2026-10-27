import { useState } from 'react';
import { supabase, authEnabled } from '../supabase.ts';

interface Props {
  invite: string;
  onInvite: (code: string) => void;
  // Set when the server rejected a signed-in user (e.g. no valid invite).
  error?: string | null;
  signedIn?: boolean;
  onDevEnter: (token: string, invite: string) => void;
  onSignOut: () => void;
}

export function Login({ invite, onInvite, error, signedIn, onDevEnter, onSignOut }: Props) {
  const [code, setCode] = useState(invite);
  const [devName, setDevName] = useState('');
  const [oauthError, setOauthError] = useState<string | null>(null);

  async function oauth(provider: 'github' | 'google') {
    if (!supabase) return;
    // Preserve the invite code across the OAuth redirect round-trip.
    const redirectTo = `${window.location.origin}${code ? `?invite=${encodeURIComponent(code)}` : ''}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) setOauthError(error.message);
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="logo">R</div>
        <h1>{signedIn ? 'Join the workspace' : 'Sign in to Relay'}</h1>
        <p className="muted">Team chat with channels, threads, huddles and canvases.</p>

        <label className="field">
          <span>Invite code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            placeholder="Not needed for the first person"
            maxLength={32}
          />
        </label>

        {signedIn ? (
          <div className="oauth-buttons">
            <button className="send-btn" disabled={!code} onClick={() => onInvite(code)}>Join with invite</button>
            <button className="ghost-btn" onClick={onSignOut}>Use a different account</button>
          </div>
        ) : authEnabled ? (
          <div className="oauth-buttons">
            <button className="oauth-btn" onClick={() => oauth('github')}>Continue with GitHub</button>
            <button className="oauth-btn" onClick={() => oauth('google')}>Continue with Google</button>
          </div>
        ) : (
          <form
            className="oauth-buttons"
            onSubmit={(e) => {
              e.preventDefault();
              if (devName.trim()) onDevEnter(`${crypto.randomUUID()}:${devName.trim()}`, code);
            }}
          >
            <label className="field">
              <span>Your name</span>
              <input autoFocus value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="Dev mode: no Supabase configured" maxLength={40} />
            </label>
            <button className="send-btn" disabled={!devName.trim()}>Enter workspace</button>
          </form>
        )}

        {(error || oauthError) && <p className="login-error">{error || oauthError}</p>}
      </div>
    </div>
  );
}
