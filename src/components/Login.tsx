import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Cloth } from './Cloth.tsx';
import '../cloth.css';
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

type Provider = 'github' | 'google';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export function Login({ invite, onInvite, error, signedIn, onDevEnter, onSignOut, onBack }: Props) {
  const hero = useRef<HTMLElement>(null);
  const [code, setCode] = useState(invite);
  const [devName, setDevName] = useState('');
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  // Which OAuth providers the Supabase project has switched on (null until known).
  const [enabled, setEnabled] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (!authEnabled) return;
    const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key ?? '' } })
      .then((r) => r.json())
      .then((d) => setEnabled(d.external ?? {}))
      .catch(() => setEnabled(null));
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.nav > *', { y: 18, opacity: 0, duration: 0.9, stagger: 0.06 })
        .from('.hero__title > span', { y: 18, opacity: 0, duration: 0.9, stagger: 0.08 }, '<0.1')
        .from('.signin > *', { y: 22, opacity: 0, duration: 0.7, stagger: 0.07 }, '-=0.5');
    }, hero);
    return () => ctx.revert();
  }, []);

  async function oauth(provider: Provider) {
    if (!supabase) return;
    setOauthError(null);
    if (enabled && !enabled[provider]) {
      setOauthError(`${provider === 'google' ? 'Google' : 'GitHub'} sign-in isn't switched on for this workspace yet. Ask the admin to enable it in Supabase.`);
      return;
    }
    setBusy(provider);
    // Preserve the invite code across the OAuth redirect round-trip.
    const redirectTo = `${window.location.origin}${code ? `?invite=${encodeURIComponent(code)}` : ''}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) },
    });
    if (error) { setOauthError(error.message); setBusy(null); }
  }

  return (
    <section className="hero" id="hero" aria-label="Relay sign in" ref={hero}>
      <Cloth host={hero} />

      <header className="nav">
        <a className="nav__logo" href="#hero" onClick={(e) => { e.preventDefault(); onBack?.(); }}>Relay</a>
        <div className="nav__actions">
          {onBack && (
            <button className="pill pill--menu" type="button" onClick={onBack}>
              <span className="burger" aria-hidden="true"><i /><i /><i /></span>Home
            </button>
          )}
        </div>
      </header>

      <div className="hero__side">
        <h1 className="hero__title"><span>{signedIn ? 'Almost in' : 'Grab me'}</span><span className="soft">{signedIn ? 'add an invite' : 'then sign in'}</span></h1>

        <div className="signin">
          <label className="signin__field">
            <span>Invite code</span>
            <input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="Not needed for the first person" maxLength={32} />
          </label>

          {signedIn ? (
            <>
              <button className="pill pill--start pill--wide" disabled={!code} onClick={() => onInvite(code)}>Join with invite</button>
              <button className="pill pill--menu pill--wide" onClick={onSignOut}>Use a different account</button>
            </>
          ) : authEnabled ? (
            <>
              <button className="pill pill--google pill--wide" onClick={() => oauth('google')} disabled={!!busy}>
                <GoogleIcon />{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
              </button>
              <button className="pill pill--menu pill--wide" onClick={() => oauth('github')} disabled={!!busy}>
                <GithubIcon />{busy === 'github' ? 'Opening GitHub…' : 'Continue with GitHub'}
              </button>
            </>
          ) : (
            <form className="signin__form" onSubmit={(e) => { e.preventDefault(); if (devName.trim()) onDevEnter(`${crypto.randomUUID()}:${devName.trim()}`, code); }}>
              <label className="signin__field">
                <span>Your name</span>
                <input value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="Dev mode: no Supabase configured" maxLength={40} />
              </label>
              <button className="pill pill--start pill--wide" disabled={!devName.trim()}>Enter workspace</button>
            </form>
          )}

          {(error || oauthError) && <p className="signin__error" role="alert">{error || oauthError}</p>}
          <p className="signin__credit">Powered by <b>Flo Studios</b></p>
        </div>
      </div>
    </section>
  );
}
