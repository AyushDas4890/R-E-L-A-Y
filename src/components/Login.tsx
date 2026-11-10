import { useEffect, useRef, useState } from 'react';
import { LogoMark } from './LogoIntro.tsx';
import { Icon } from './Icon.tsx';
import { Aurora } from './Aurora.tsx';
import LightBulbButton from './framer/LightBulbButton.tsx';
import '../apple.css';
import '../signin.css';
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

type Provider = 'github' | 'google' | 'email';

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
  const [code, setCode] = useState(invite);
  const [devName, setDevName] = useState('');
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [known, setKnown] = useState(() => { try { return localStorage.getItem('relay.lastEmail') ?? ''; } catch { return ''; } });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<Provider | null>(null);
  // Which OAuth providers the Supabase project has switched on (null until known).
  const [enabled, setEnabled] = useState<Record<string, boolean> | null>(null);
  const shownError = error || oauthError;

  useEffect(() => {
    if (!authEnabled) return;
    const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key ?? '' } })
      .then((r) => r.json())
      .then((d) => setEnabled(d.external ?? {}))
      .catch(() => setEnabled(null));
  }, []);

  // Back from the provider's page can restore this page from the back/forward cache with the
  // buttons still disabled on "Opening GitHub…"; re-enable them whenever the page is shown again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setBusy(null); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  // Email sign-in: Supabase mails a one-time link; opening it signs the person in on this site.
  async function emailLink(to = email) {
    setOauthError(null);
    if (!supabase) { setOauthError('Email sign-in needs Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, or continue with a name below.'); return; }
    setBusy('email');
    const emailRedirectTo = `${window.location.origin}${code ? `?invite=${encodeURIComponent(code)}` : ''}`;
    const { error } = await supabase.auth.signInWithOtp({ email: to, options: { emailRedirectTo } });
    setBusy(null);
    if (error) setOauthError(error.message); else setSent(true);
  }

  async function oauth(provider: 'github' | 'google') {
    if (!supabase) return;
    setOauthError(null);
    if (enabled && !enabled[provider]) {
      setOauthError(`${provider === 'google' ? 'Google' : 'GitHub'} sign-in isn't switched on for this workspace yet.`);
      return;
    }
    setBusy(provider);
    // Preserve the invite code across the OAuth redirect round-trip.
    const redirectTo = `${window.location.origin}${code ? `?invite=${encodeURIComponent(code)}` : ''}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      // Always show the provider's account chooser instead of silently reusing the browser's
      // session, so people can pick an account or sign in to a different one with a password.
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    });
    if (error) { setOauthError(error.message); setBusy(null); }
  }

  // Pointer tracking: the backdrop drifts, the visual tilts and a spotlight follows the cursor.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0, px = 0, py = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      px = e.clientX; py = e.clientY;
    };
    const tick = () => {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      el.style.setProperty('--mx', cx.toFixed(4));
      el.style.setProperty('--my', cy.toFixed(4));
      el.style.setProperty('--sx', `${px}px`);
      el.style.setProperty('--sy', `${py}px`);
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove);
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);

  // Little messages drifting over the visual: a taste of the workspace before signing in.
  const chips = [
    { who: 'M', text: 'deploy is green', when: 'now', style: { top: '9%', left: '8%', '--d': 18, '--t': '0s' } },
    { who: 'A', text: 'standup moved to 10:30', when: '2m', style: { top: '24%', right: '6%', '--d': -24, '--t': '-2s' } },
    { who: 'J', text: 'huddle? 🎧', when: '5m', style: { top: '46%', left: '12%', '--d': 30, '--t': '-4s' } },
  ] as const;

  return (
    <div className="ap-si si-v2" ref={root}>
      <div className="si-bg" aria-hidden><Aurora /></div>
      <div className="si-spot" aria-hidden />
      <header className="ap-si-nav">
        <button className="ap-brand" onClick={onBack} disabled={!onBack}><LogoMark size={22} />Relay</button>
        {onBack && <button className="ap-link-btn" onClick={onBack}><Icon n="back" size={14} /> Home</button>}
      </header>
      <main className="ap-si-main">
        <div className="si-visual" aria-hidden>
          <img src="/hf/relay-hero.jpg" alt="" />
          <div className="si-shine" />
          {chips.map((c) => (
            <span key={c.text} className="si-chip" style={c.style as React.CSSProperties}><i>{c.who}</i>{c.text}<small>{c.when}</small></span>
          ))}
          <div className="si-caption">
            <h2>Where the team actually talks.</h2>
            <p>Channels, pages, huddles and databases in one place.</p>
          </div>
        </div>
        <div className="ap-si-card">
          <span className="ap-si-mark" aria-hidden><LogoMark size={28} /></span>
          <h1>{signedIn ? 'Join a workspace' : 'Sign in to Relay'}</h1>
          <p className="ap-si-sub">{signedIn ? 'Paste the invite code your team sent you.' : 'Use GitHub, or get a sign-in link by email.'}</p>

          {!signedIn && (
            <LightBulbButton
              onClick={() => (authEnabled ? oauth('github') : setOauthError('GitHub sign-in needs Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, or continue with a name below.'))}
              disabled={!!busy}
              lightColor="#b3ff00"
              buttonColor="#16151f"
              substrateColor="#09080d"
              icon={<GithubIcon />}
              width="100%"
              height={46}
            >
              {busy === 'github' ? 'Opening GitHub…' : 'Continue with GitHub'}
            </LightBulbButton>
          )}
          {!signedIn && (
            sent ? (
              <p className="ap-si-sub" role="status">Check {email || known} for your sign-in link. You can close this tab.</p>
            ) : known ? (
              <>
                <LightBulbButton
                  disabled={!!busy}
                  onClick={() => { setEmail(known); void emailLink(known); }}
                  lightColor="#3ccf7c"
                  buttonColor="#1c1a26"
                  substrateColor="#0c0b12"
                  width="100%"
                  height={44}
                >
                  {busy === 'email' ? 'Sending link…' : `Continue as ${known}`}
                </LightBulbButton>
                <button className="ap-link-btn" onClick={() => setKnown('')}>Use a different email</button>
              </>
            ) : (
              <form className="ap-si-form" onSubmit={(e) => { e.preventDefault(); void emailLink(); }}>
                <label className="ap-si-field">
                  Email
                  <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="you@gmail.com" maxLength={120} />
                </label>
                <LightBulbButton
                  type="submit"
                  disabled={!email || !!busy}
                  lightColor="#f5a400"
                  buttonColor="#1c1a26"
                  substrateColor="#0c0b12"
                  width="100%"
                  height={44}
                >
                  {busy === 'email' ? 'Sending link…' : 'Continue with email'}
                </LightBulbButton>
              </form>
            )
          )}

          {signedIn ? (
            <>
              <label className="ap-si-field">
                Invite code
                <input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="Code" maxLength={32} autoFocus />
              </label>
              <LightBulbButton
                disabled={!code}
                onClick={() => onInvite(code)}
                lightColor="#9a6bff"
                buttonColor="#241838"
                substrateColor="#0e0717"
                width="100%"
                height={46}
              >
                Join with invite
              </LightBulbButton>
              <button className="ap-pill quiet full" onClick={onSignOut}>Use a different account</button>
            </>
          ) : authEnabled ? (
            <>
              <div className="ap-si-divider">Have an invite?</div>
              <label className="ap-si-field">
                Invite code
                <input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="Optional" maxLength={32} />
              </label>
            </>
          ) : (
            // Dev mode: no Supabase keys, so a plain name stands in for an account.
            <>
              <div className="ap-si-divider">or continue in dev mode</div>
              <form className="ap-si-form" onSubmit={(e) => {
                e.preventDefault();
                const name = devName.trim();
                if (name) onDevEnter(`${crypto.randomUUID()}:${name}`, code);
              }}>
                <label className="ap-si-field">
                  Your name
                  <input value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="Name" maxLength={40} autoFocus />
                </label>
                <label className="ap-si-field">
                  Invite code
                  <input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="Optional" maxLength={32} />
                </label>
                <LightBulbButton
                  type="submit"
                  disabled={!devName.trim()}
                  lightColor="#3ccf7c"
                  buttonColor="#18231c"
                  substrateColor="#08100a"
                  width="100%"
                  height={46}
                >
                  Continue
                </LightBulbButton>
              </form>
            </>
          )}

          {shownError && <p className="ap-si-error" role="alert">{shownError}</p>}
          <p className="ap-si-foot">Powered by Flo Studios</p>
        </div>
      </main>
    </div>
  );
}
