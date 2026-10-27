import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

// Motion logo: the Relay mark draws itself as a speech bubble with an "R" relay path, the wordmark
// types in letter by letter, a "Powered by Flo Studios" credit lands, then the splash lifts away.
// Plays once per browser session.

const SEEN = 'relay.intro-seen';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="rl-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path className="rl-bubble" d="M14 6h36a10 10 0 0 1 10 10v24a10 10 0 0 1-10 10H30l-12 10v-10h-4A10 10 0 0 1 4 40V16A10 10 0 0 1 14 6z" />
      <path className="rl-r" d="M22 40V18h11a7 7 0 0 1 0 14h-6l12 8" />
    </svg>
  );
}

export function LogoIntro({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN) === '1'; } catch { /* storage blocked */ }
    if (seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onDone(); return; }

    const ctx = gsap.context(() => {
      const paths = gsap.utils.toArray<SVGPathElement>('.rl-intro .rl-mark path');
      paths.forEach((p) => { const l = p.getTotalLength(); gsap.set(p, { strokeDasharray: l, strokeDashoffset: l }); });
      gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: () => { try { sessionStorage.setItem(SEEN, '1'); } catch { /* ignore */ } onDone(); },
      })
        .from('.rl-intro .rl-mark', { scale: 0.6, rotate: -12, duration: 0.9, ease: 'back.out(1.8)' })
        .to('.rl-intro .rl-bubble', { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' }, '<')
        .to('.rl-intro .rl-r', { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' }, '-=0.35')
        .to('.rl-intro .rl-bubble', { fill: '#f0b07a', duration: 0.4 }, '-=0.1')
        .from('.rl-word span', { yPercent: 120, opacity: 0, duration: 0.6, stagger: 0.06 }, '-=0.3')
        .from('.rl-pulse', { scale: 0.2, opacity: 0.8, duration: 0.9, ease: 'power2.out' }, '<')
        .to('.rl-pulse', { opacity: 0, duration: 0.4 }, '-=0.4')
        .from('.rl-credit', { y: 14, opacity: 0, duration: 0.6 }, '-=0.2')
        .from('.rl-credit b', { backgroundSize: '0% 2px', duration: 0.6, ease: 'power2.inOut' }, '-=0.3')
        .to('.rl-intro-inner', { scale: 0.92, opacity: 0, duration: 0.5, ease: 'power2.in' }, '+=0.7')
        .to('.rl-intro', { yPercent: -100, duration: 0.8, ease: 'expo.inOut' }, '-=0.15');
    }, root);
    return () => ctx.revert();
  }, [onDone]);

  return (
    <div className="rl-intro" ref={root} aria-hidden>
      <div className="rl-intro-inner">
        <div className="rl-lockup">
          <span className="rl-pulse" />
          <LogoMark size={88} />
          <div className="rl-word">{'relay'.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
        </div>
        <p className="rl-credit">Powered by <b>Flo Studios</b></p>
      </div>
    </div>
  );
}
