import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LogoMark } from './LogoIntro.tsx';
import { Icon } from './Icon.tsx';
import { Aurora } from './Aurora.tsx';
import { MicrosoftIcon } from './MicrosoftIcon.tsx';
import LightBulbButton from './framer/LightBulbButton.tsx';
import '../apple.css';
import '../signin.css';
import { supabase, authEnabled } from '../supabase.ts';
import { saveDevSession } from '../store.ts';
import { DEV_SESSION_EVENT, requestPasswordReset, resendConfirmation, signInWithPassword, signInWithProvider, signUpWithPassword } from '../auth.ts';

interface Props {
  invite: string;
  onInvite: (code: string) => void;
  // Set when the server rejected a signed-in user (e.g. no valid invite).
  error?: string | null;
  signedIn?: boolean;
  onSignOut: () => void;
  onBack?: () => void;
  // Opens on a given screen, e.g. 'verify' when the server says the email is unconfirmed.
  initialMode?: Mode;
  // Prefills the email field; falls back to the last email used on this device.
  email?: string;
}

export type Mode ='signin' | 'signup' | 'forgot' | 'sent' | 'verify';
type Provider = 'google' | 'github' | 'azure';
type Busy = Provider | 'form' | null;

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

// Supabase's settings endpoint names Microsoft "azure".
const PROVIDERS: { id: Provider; label: string; icon: React.ReactNode }[] = [
  { id: 'google', label: 'Google', icon: <GoogleIcon /> },
  { id: 'github', label: 'GitHub', icon: <GithubIcon /> },
  { id: 'azure', label: 'Microsoft', icon: <MicrosoftIcon /> },
];

// A rough hint while choosing a password; length matters far more than character classes.
function strength(password: string): string | null {
  if (!password) return null;
  if (password.length < 10) return 'Weak';
  if (password.length < 14) return 'Good';
  return 'Strong';
}

const SUBTITLES: Record<Mode, string> = {
  signin: 'Welcome back. Sign in with your email and password.',
  signup: 'Create an account to join your team.',
  forgot: "Enter your email and we'll send you a reset link.",
  sent: 'Check your inbox.',
  verify: 'One more step.',
};

const TITLES: Record<Mode, string> = {
  signin: 'Sign in to Relay',
  signup: 'Create your account',
  forgot: 'Reset your password',
  sent: 'Reset link sent',
  verify: 'Confirm your email',
};

export function Login({ invite, onInvite, error, signedIn, onSignOut, onBack, initialMode, email: initialEmail }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode ?? 'signin');
  const [code, setCode] = useState(invite);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => { if (initialEmail) return initialEmail; try { return localStorage.getItem('relay.lastEmail') ?? ''; } catch { return ''; } });
  const [resent, setResent] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [devName, setDevName] = useState('');
  const [showDevName, setShowDevName] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // Which OAuth providers the Supabase project has switched on (null until known).
  const [enabled, setEnabled] = useState<Record<string, boolean> | null>(null);
  const shownError = formError || error;

  useEffect(() => {
    if (!authEnabled) return;
    const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key ?? '' } })
      .then((r) => r.json())
      .then((d) => setEnabled(d.external ?? {}))
      .catch(() => setEnabled(null));
  }, []);

  // Back from the provider's page can restore this page from the back/forward cache with the
  // buttons still disabled; re-enable them whenever the page is shown again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setBusy(null); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setFormError(null);
    setResent(false);
    setPassword('');
    setConfirm('');
  }

  async function signIn() {
    setFormError(null);
    if (!email || !password) { setFormError('Enter your email and password.'); return; }
    setBusy('form');
    const result = await signInWithPassword(supabase, email, password, code);
    setBusy(null);
    if (!result.ok) { setFormError(result.message); return; }
    if (code) onInvite(code);
  }

  async function signUp() {
    setFormError(null);
    if (!name.trim()) { setFormError('Enter your name.'); return; }
    if (!email) { setFormError('Enter your email.'); return; }
    if (password.length < 8) { setFormError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setFormError("Passwords don't match."); return; }
    setBusy('form');
    const result = await signUpWithPassword(supabase, email, password, name.trim(), code);
    setBusy(null);
    if (!result.ok) { setFormError(result.message); return; }
    if (code) onInvite(code);
    if (result.needsVerification) switchMode('verify');
  }

  async function sendReset() {
    setFormError(null);
    if (!email) { setFormError('Enter your email.'); return; }
    setBusy('form');
    const result = await requestPasswordReset(supabase, email);
    setBusy(null);
    if (result.ok) switchMode('sent'); else setFormError(result.message);
  }

  async function resend() {
    setFormError(null);
    setResent(false);
    if (!email) { setFormError('Enter your email.'); return; }
    setBusy('form');
    const result = await resendConfirmation(supabase, email);
    setBusy(null);
    if (result.ok) setResent(true); else setFormError(result.message);
  }

  async function provider(id: Provider) {
    setFormError(null);
    setBusy(id);
    const result = await signInWithProvider(supabase, id, code);
    // On success the browser is already leaving for the provider, so the buttons stay disabled.
    if (!result.ok) { setFormError(result.message); setBusy(null); }
  }

  // Dev mode only: enter with just a name, using the legacy `uuid:name` token.
  function enterWithName() {
    const n = devName.trim();
    if (!n) return;
    saveDevSession(`${crypto.randomUUID()}:${n}`, code);
    window.dispatchEvent(new CustomEvent(DEV_SESSION_EVENT));
  }

  const inviteField = (
    <label className="ap-si-field">
      Invite code
      <input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="Optional" maxLength={32} />
    </label>
  );
  const emailField = (
    <label className="ap-si-field">
      Email
      <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="you@company.com" maxLength={120} required />
    </label>
  );
  const submit = (label: string, busyLabel: string) => (
    <LightBulbButton type="submit" disabled={!!busy} lightColor="#9a6bff" buttonColor="#241838" substrateColor="#0e0717" width="100%" height={46}>
      {busy === 'form' ? busyLabel : label}
    </LightBulbButton>
  );
  const hint = strength(password);
  // Hide a provider only when Supabase says it is off; in dev mode all three show and explain themselves.
  const providers = PROVIDERS.filter((p) => !enabled || enabled[p.id] !== false);

  function forms() {
    switch (mode) {
      case 'signin':
        return (
          <>
            <form className="ap-si-form" onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
              {emailField}
              <label className="ap-si-field">
                Password
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" maxLength={128} required />
              </label>
              <button type="button" className="si-forgot" onClick={() => switchMode('forgot')}>Forgot password?</button>
              {submit('Sign in', 'Signing in…')}
            </form>
            {providers.length > 0 && <div className="ap-si-divider">or continue with</div>}
            {providers.length > 0 && (
              <div className="si-providers">
                {providers.map((p) => (
                  <button key={p.id} type="button" className="si-provider" disabled={!!busy} onClick={() => void provider(p.id)}>
                    {p.icon}<span>{busy === p.id ? 'Opening…' : p.label}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="ap-si-divider">Have an invite?</div>
            {inviteField}
            <p className="si-switch">New here? <button type="button" onClick={() => switchMode('signup')}>Create an account</button></p>
          </>
        );
      case 'signup':
        return (
          <>
            <form className="ap-si-form" onSubmit={(e) => { e.preventDefault(); void signUp(); }}>
              <label className="ap-si-field">
                Name
                <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={40} required />
              </label>
              {emailField}
              <label className="ap-si-field">
                Password
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} maxLength={128} required aria-describedby="si-strength" />
              </label>
              <p id="si-strength" className="si-strength" data-level={hint?.toLowerCase()} aria-live="polite">{hint ?? ''}</p>
              <label className="ap-si-field">
                Confirm password
                <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" maxLength={128} required />
              </label>
              {inviteField}
              {submit('Create account', 'Creating account…')}
            </form>
            <p className="si-switch">Already have an account? <button type="button" onClick={() => switchMode('signin')}>Sign in</button></p>
          </>
        );
      case 'forgot':
        return (
          <>
            <form className="ap-si-form" onSubmit={(e) => { e.preventDefault(); void sendReset(); }}>
              {emailField}
              {submit('Send reset link', 'Sending…')}
            </form>
            <p className="si-switch"><button type="button" onClick={() => switchMode('signin')}>Back to sign in</button></p>
          </>
        );
      case 'sent':
        return (
          <>
            <p className="ap-si-sub" role="status">We sent a reset link to {email}.</p>
            <p className="si-switch"><button type="button" onClick={() => switchMode('signin')}>Back to sign in</button></p>
          </>
        );
      case 'verify':
        return (
          <>
            <p className="ap-si-sub" role="status">Check your inbox. We sent a confirmation link to {email || 'your email'}. Open it, then sign in.</p>
            {resent && <p className="ap-si-ok" role="status">Confirmation email sent.</p>}
            <button type="button" className="ap-pill quiet full" disabled={!!busy || !email} onClick={() => void resend()}>
              {busy === 'form' ? 'Sending…' : 'Resend confirmation'}
            </button>
            {signedIn
              ? <button type="button" className="ap-pill quiet full" onClick={onSignOut}>Sign out</button>
              : <p className="si-switch"><button type="button" onClick={() => switchMode('signin')}>Back to sign in</button></p>}
          </>
        );
    }
  }

  // A signed-in person the server turned away. The verify screen keeps its own layout (with a
  // Sign out button); every other case offers an invite code.
  const joinView = signedIn && mode !== 'verify';

  return (
    <SignInStage onBack={onBack}>
          <h1>{joinView ? 'Join a workspace' : TITLES[mode]}</h1>
          <p className="ap-si-sub">{joinView ? 'Paste the invite code your team sent you.' : SUBTITLES[mode]}</p>
          {shownError && <p className="ap-si-error" role="alert">{shownError}</p>}

          {joinView ? (
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
              <button className="ap-pill quiet full" onClick={onSignOut}>Sign out</button>
            </>
          ) : forms()}

          {!signedIn && !authEnabled && (mode === 'signin' || mode === 'signup') && (
            // Dev mode: a plain name still works as a throwaway account.
            showDevName ? (
              <form className="si-dev-name" onSubmit={(e) => { e.preventDefault(); enterWithName(); }}>
                <input value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="Your name" maxLength={40} aria-label="Your name" autoFocus />
                <button type="submit" disabled={!devName.trim()}>Go</button>
              </form>
            ) : (
              <p className="si-switch"><button type="button" onClick={() => setShowDevName(true)}>Just try it with a name</button></p>
            )
          )}

    </SignInStage>
  );
}

// Little messages drifting over the visual: a taste of the workspace before signing in.
const CHIPS = [
  { who: 'M', text: 'deploy is green', when: 'now', style: { top: '9%', left: '8%', '--d': 18, '--t': '0s' } },
  { who: 'A', text: 'standup moved to 10:30', when: '2m', style: { top: '24%', right: '6%', '--d': -24, '--t': '-2s' } },
  { who: 'J', text: 'huddle? 🎧', when: '5m', style: { top: '46%', left: '12%', '--d': 30, '--t': '-4s' } },
] as const;

// The sign-in page's backdrop, nav, visual and card. Login and the password reset page render
// their content inside the card.
export function SignInStage({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
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
          {CHIPS.map((c) => (
            <span key={c.text} className="si-chip" style={c.style as React.CSSProperties}><i>{c.who}</i>{c.text}<small>{c.when}</small></span>
          ))}
          <div className="si-caption">
            <h2>Where the team actually talks.</h2>
            <p>Channels, pages, huddles and databases in one place.</p>
          </div>
        </div>
        <div className="ap-si-card">
          <span className="ap-si-mark" aria-hidden><LogoMark size={28} /></span>
          {children}
          <p className="ap-si-foot">Powered by Flo Studios</p>
        </div>
      </main>
    </div>
  );
}
