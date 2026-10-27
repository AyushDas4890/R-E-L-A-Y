import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Robot } from './Robot.tsx';
import { LogoMark } from './LogoIntro.tsx';
import '../nexus.css';
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

const BUBBLES = ['hey team 👋', '#launch', 'huddle?', 'shipped ✓', '@maya', 'canvas'];

export function Login({ invite, onInvite, error, signedIn, onDevEnter, onSignOut, onBack }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState(invite);
  const [devName, setDevName] = useState('');
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [focus, setFocus] = useState(false);
  // Which OAuth providers the Supabase project has switched on (null until known).
  const [enabled, setEnabled] = useState<Record<string, boolean> | null>(null);
  const shownError = error || oauthError;
  const mood = shownError ? 'sad' : focus ? 'focus' : 'happy';
  // The robot talks back as you fill the form.
  const first = devName.trim().split(/\s+/)[0];
  const say = shownError ? 'Hmm, that didn’t work…'
    : first ? `Nice to meet you, ${first}!`
    : focus ? 'I’m listening…'
    : signedIn ? 'Got an invite code?' : 'Hi! Who’s signing in?';
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo('.si-say', { scale: 0.6, y: 12, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: 'back.out(2.2)' });
  }, [say]);

  useEffect(() => {
    if (!authEnabled) return;
    const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key ?? '' } })
      .then((r) => r.json())
      .then((d) => setEnabled(d.external ?? {}))
      .catch(() => setEnabled(null));
  }, []);

  useEffect(() => {
    const el = root.current!;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      // Entrance: stage floor tilts up, rings spin in, the robot drops in, the card swings open in 3D.
      gsap.timeline({ defaults: { ease: 'power4.out' } })
        .from('.si-floor', { rotateX: 90, opacity: 0, duration: 1.4 })
        .from('.si-ring', { scale: 0.2, opacity: 0, duration: 1.2, stagger: 0.12 }, '<0.2')
        .from('.si-stage .nx-bot', { y: -260, opacity: 0, duration: 1.1, ease: 'bounce.out' }, '<0.1')
        .from('.si-card', { rotateY: -35, x: 80, opacity: 0, duration: 1.2, ease: 'expo.out' }, '<0.2')
        .from('.si-card > *', { y: 20, opacity: 0, duration: 0.6, stagger: 0.06 }, '-=0.8')
        .from('.si-bubble em', { scale: 0, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'back.out(2)' }, '-=0.8');

      // Continuous 3D life.
      gsap.to('.si-ring.a', { rotateZ: 360, duration: 18, ease: 'none', repeat: -1 });
      gsap.to('.si-ring.b', { rotateZ: -360, duration: 26, ease: 'none', repeat: -1 });
      gsap.to('.si-orbit', { rotateY: 360, duration: 22, ease: 'none', repeat: -1 });
      gsap.to('.si-bubble em', { rotateY: -360, duration: 22, ease: 'none', repeat: -1 });
      gsap.to('.si-floor-grid', { backgroundPositionY: '+=80px', duration: 3, ease: 'none', repeat: -1 });
      gsap.to('.si-stage .nx-bot-inner', { y: -16, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1, force3D: true });
      gsap.timeline({ repeat: -1, repeatDelay: 3, delay: 2 })
        .to('.si-stage .nx-eye', { scaleY: 0.12, duration: 0.07, ease: 'none' })
        .to('.si-stage .nx-eye', { scaleY: 1, duration: 0.1, ease: 'none' });
      gsap.timeline({ delay: 1.6 })
        .to('.si-stage .nx-arm.r', { rotate: -140, duration: 0.45, ease: 'back.out(2)' })
        .to('.si-stage .nx-arm.r', { rotate: -110, duration: 0.25, yoyo: true, repeat: 3, ease: 'sine.inOut' })
        .to('.si-stage .nx-arm.r', { rotate: 0, duration: 0.6, ease: 'power2.inOut' });

      // Pointer: the whole scene rotates in 3D, the robot looks at the cursor, the card tilts.
      const sx = gsap.quickTo('.si-scene', 'rotationY', { duration: 1, ease: 'power3.out' });
      const sy = gsap.quickTo('.si-scene', 'rotationX', { duration: 1, ease: 'power3.out' });
      const hx = gsap.quickTo('.si-stage .nx-bot-head', 'rotationY', { duration: 0.7, ease: 'power3.out' });
      const hy = gsap.quickTo('.si-stage .nx-bot-head', 'rotationX', { duration: 0.7, ease: 'power3.out' });
      const fx = gsap.quickTo('.si-stage .nx-face', 'x', { duration: 0.5, ease: 'power3.out' });
      const fy = gsap.quickTo('.si-stage .nx-face', 'y', { duration: 0.5, ease: 'power3.out' });
      const cx = gsap.quickTo('.si-card', 'rotationY', { duration: 0.8, ease: 'power3.out' });
      const cy = gsap.quickTo('.si-card', 'rotationX', { duration: 0.8, ease: 'power3.out' });
      const move = (e: PointerEvent) => {
        const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
        sx(nx * 10); sy(-ny * 6);
        hx(nx * 40); hy(-ny * 20); fx(nx * 20); fy(ny * 12);
        cx(nx * 8); cy(-ny * 8);
      };
      el.addEventListener('pointermove', move);
      return () => el.removeEventListener('pointermove', move);
    }, root);
    return () => ctx.revert();
  }, []);

  // Typing: the robot turns to watch the form and nods with each keystroke.
  useEffect(() => {
    if (!focus || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = gsap.to('.si-stage .nx-bot-head', { rotationY: 28, rotationX: -6, duration: 0.6, ease: 'power3.out' });
    return () => { t.kill(); };
  }, [focus]);
  const nod = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo('.si-stage .nx-screen', { scale: 1 }, { scale: 1.03, duration: 0.08, yoyo: true, repeat: 1, ease: 'power1.out' });
  };
  useEffect(() => {
    if (!shownError || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo('.si-stage .nx-bot-head', { rotationZ: -8 }, { rotationZ: 0, duration: 0.8, ease: 'elastic.out(1, 0.3)' });
    gsap.fromTo('.si-card', { x: -12 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.25)' });
  }, [shownError]);

  // A celebratory hop and spin before handing off to the workspace.
  const celebrate = (then: () => void) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { then(); return; }
    gsap.timeline({ onComplete: then })
      .to('.si-stage .nx-bot-scroll', { y: -60, duration: 0.35, ease: 'power2.out' })
      .to('.si-stage .nx-bot-scroll', { rotateY: 360, duration: 0.6, ease: 'power2.inOut' }, '<')
      .to('.si-stage .nx-bot-scroll', { y: 0, duration: 0.4, ease: 'bounce.out' });
  };

  // Back from the provider's page can restore this page from the back/forward cache with the
  // buttons still disabled on "Opening GitHub…"; re-enable them whenever the page is shown again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setBusy(null); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  async function oauth(provider: Provider) {
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

  const field = { onFocus: () => setFocus(true), onBlur: () => setFocus(false), onKeyDown: nod };

  return (
    <div className="si nx" ref={root}>
      <div className="si-sky" aria-hidden />
      <header className="si-nav">
        <button className="si-brand" onClick={onBack} disabled={!onBack}><LogoMark size={26} />relay</button>
        {onBack && <button className="nx-cta" onClick={onBack}><b>←</b> Home</button>}
      </header>

      <div className="si-scene">
        <div className="si-stage" aria-hidden>
          <div className="si-floor"><div className="si-floor-grid" /></div>
          <span className="si-ring a" /><span className="si-ring b" />
          <div className="si-orbit">
            {BUBBLES.map((b, i) => (
              <span key={b} className="si-bubble" style={{ transform: `rotateY(${(i * 360) / BUBBLES.length}deg) translateZ(calc(80 * var(--u))) translateY(${(i % 3) * -40}px)` }}>
                <em>{b}</em>
              </span>
            ))}
          </div>
          <Robot mood={mood} />
          <p className="si-say" key={say}>{say}</p>
        </div>

        <div className="si-card">
          <p className="si-kicker">{signedIn ? 'One more step' : 'Welcome back'}</p>
          <h1 className="si-title">{signedIn ? 'Join the workspace' : 'Sign in to Relay'}</h1>

          <label className="si-field">
            <span>Invite code</span>
            <input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="Optional" maxLength={32} {...field} />
          </label>

          {signedIn ? (
            <>
              <button className="si-btn primary" disabled={!code} onClick={() => celebrate(() => onInvite(code))}>Join with invite</button>
              <button className="si-btn" onClick={onSignOut}>Use a different account</button>
            </>
          ) : authEnabled ? (
            <>
              <button className="si-btn google" onClick={() => oauth('google')} disabled={!!busy}>
                <GoogleIcon />{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
              </button>
              <button className="si-btn" onClick={() => oauth('github')} disabled={!!busy}>
                <GithubIcon />{busy === 'github' ? 'Opening GitHub…' : 'Continue with GitHub'}
              </button>
            </>
          ) : (
            <form className="si-form" onSubmit={(e) => {
              e.preventDefault();
              const name = devName.trim();
              if (name) celebrate(() => onDevEnter(`${crypto.randomUUID()}:${name}`, code));
            }}>
              <label className="si-field">
                <span>Your name</span>
                <input value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="Dev mode: no Supabase configured" maxLength={40} {...field} />
              </label>
              <button className="si-btn primary" disabled={!devName.trim()}>Enter workspace <b>→</b></button>
            </form>
          )}

          {shownError && <p className="si-error" role="alert">{shownError}</p>}
          <p className="si-credit">Powered by <b>Flo Studios</b></p>
        </div>
      </div>
    </div>
  );
}
