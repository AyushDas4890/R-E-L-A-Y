import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { GlowAscii } from './GlowAscii.tsx';
import BlurText from '../react-bits/BlurText.tsx';
import '../landing.css';
import { supabase, authEnabled } from '../supabase.ts';

interface Props {
  invite: string;
  onInvite: (code: string) => void;
  // Set when the server rejected a signed-in user (e.g. no valid invite).
  error?: string | null;
  signedIn?: boolean;
  onDevEnter: (token: string, invite: string) => void;
  onSignOut: () => void;
  onBack?: () => void;
}

export function Login({ invite, onInvite, error, signedIn, onDevEnter, onSignOut, onBack }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState(invite);
  const [devName, setDevName] = useState('');
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('.auth-card', { y: 40, opacity: 0, scale: 0.97, duration: 0.8, ease: 'power3.out' });
      gsap.from('.auth-card > *', { y: 14, opacity: 0, duration: 0.5, stagger: 0.07, delay: 0.25, ease: 'power2.out' });
      gsap.from('.auth-points li', { x: -20, opacity: 0, duration: 0.5, stagger: 0.1, delay: 0.6, ease: 'power2.out' });
    }, root);
    return () => ctx.revert();
  }, []);

  async function oauth(provider: 'github' | 'google') {
    if (!supabase) return;
    // Preserve the invite code across the OAuth redirect round-trip.
    const redirectTo = `${window.location.origin}${code ? `?invite=${encodeURIComponent(code)}` : ''}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) setOauthError(error.message);
  }

  return (
    <div className="auth" ref={root}>
      <div className="auth-bg" aria-hidden>
        <GlowAscii />
      </div>
      <section className="auth-brand">
        <div className="lp-brand" onClick={onBack}><span className="logo small">R</span><span>Relay</span></div>
        <div className="auth-pitch">
          <h2><BlurText text="Welcome back to your workspace" delay={80} animateBy="words" direction="top" /></h2>
          <p>Pick up where your team left off. Channels, threads, huddles and canvases are one sign-in away.</p>
          <ul className="auth-points">
            <li>Every premium feature unlocked</li>
            <li>Real-time messaging and presence</li>
            <li>Sign in with GitHub or Google</li>
          </ul>
        </div>
        <div className="auth-foot">Relay. Built from public product behavior only.</div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          {onBack && <button type="button" className="auth-back" onClick={onBack}>← Back to home</button>}
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
      </section>
    </div>
  );
}
