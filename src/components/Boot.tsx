import { useEffect, useRef, useState } from 'react';
import { LogoMark } from './LogoIntro.tsx';
import { Aurora } from './Aurora.tsx';
import '../signin.css';

// The loading screen shown while the app boots, connects to the server and loads a workspace.
// A Higgsfield-generated loop plays behind the logo; the layers drift with the pointer, a click
// or tap drops a ripple, and the status line reports where the connection stands.

interface Props {
  // What is happening right now, in words ("Connecting to Relay server…").
  status: string;
  // Extra line shown under the status (for example, that the server may be waking up).
  hint?: string;
  // Rough progress, 0..1. Left out for an indeterminate bar.
  progress?: number;
}

const WORDS = ['channels', 'pages', 'huddles', 'databases', 'canvases', 'threads'];

export function Boot({ status, hint, progress }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [word, setWord] = useState(0);
  const [seconds, setSeconds] = useState(0);

  // Pointer parallax: the video, the glow and the lockup each move a different amount.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const tick = () => {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      el.style.setProperty('--mx', cx.toFixed(4));
      el.style.setProperty('--my', cy.toFixed(4));
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove);
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);

  // Rotate the "warming up …" word and count the seconds waited.
  useEffect(() => {
    const w = setInterval(() => setWord((i) => (i + 1) % WORDS.length), 1400);
    const s = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => { clearInterval(w); clearInterval(s); };
  }, []);

  const ripple = (e: React.PointerEvent) => {
    const id = Date.now() + Math.random();
    setRipples((r) => [...r.slice(-6), { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 1200);
  };

  return (
    <div className="rl-boot" ref={root} onPointerDown={ripple} role="status" aria-live="polite">
      <div className="rl-boot-video"><Aurora intensity={1.1} motes={36} /></div>
      <div className="rl-boot-shade" aria-hidden />
      <div className="rl-boot-glow" aria-hidden />
      {ripples.map((r) => <span key={r.id} className="rl-boot-ripple" style={{ left: r.x, top: r.y }} aria-hidden />)}

      <div className="rl-boot-lockup">
        <span className="rl-boot-mark"><LogoMark size={64} /></span>
        <div className="rl-boot-word" aria-hidden>{'relay'.split('').map((c, i) => <span key={i} style={{ animationDelay: `${i * 0.08}s` }}>{c}</span>)}</div>
        <p className="rl-boot-status">{status}</p>
        <div className="rl-boot-bar" aria-hidden>
          <i style={progress == null ? undefined : { width: `${Math.round(progress * 100)}%`, animation: 'none' }} />
        </div>
        <p className="rl-boot-warm" aria-hidden>
          warming up <b key={word}>{WORDS[word]}</b>
        </p>
        {hint && seconds > 2 && <p className="rl-boot-hint">{hint}</p>}
      </div>
      <p className="rl-boot-foot" aria-hidden>{seconds > 0 ? `${seconds}s` : ''} · click anywhere · Powered by Flo Studios</p>
    </div>
  );
}
