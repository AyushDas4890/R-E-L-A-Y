import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

// Motion logo: the two Relay blocks slide in from opposite sides and spin into place, the wordmark
// types in letter by letter, a "Powered by Flo Studios" credit lands, then the splash lifts away.
// Plays once per browser session.

const SEEN = 'relay.intro-seen';

// The two Relay blocks, traced from the original artwork. They hand off around the centre.
const TOP = 'M34 -92 L36 -92 L40 -92 L42 -92 L46 -92 L48 -92 L52 -92 L54 -92 L58 -92 L60 -92 L64 -92 L66 -92 L70 -92 L72 -92 L76 -92 L78 -92 L80 -92 L84 -91 L86 -91 L90 -91 L92 -91 L95 -91 L98 -90 L100 -90 L102 -88 L104 -88 L106 -86 L108 -86 L110 -84 L111 -83 L113 -82 L114 -80 L116 -79 L118 -77 L118 -75 L120 -74 L121 -72 L122 -70 L123 -68 L124 -66 L125 -64 L126 -62 L126 -59 L127 -57 L127 -54 L127 -51 L127 -48 L127 -45 L127 -42 L127 -39 L126 -37 L125 -34 L125 -32 L124 -30 L123 -28 L122 -26 L121 -23 L120 -22 L119 -20 L118 -18 L116 -16 L115 -14 L114 -13 L112 -11 L111 -10 L110 -8 L108 -7 L106 -5 L105 -4 L103 -3 L101 -1 L100 -0 L98 1 L96 2 L94 3 L91 4 L89 5 L87 5 L84 6 L82 6 L80 7 L76 7 L74 7 L70 7 L68 7 L64 7 L62 7 L58 7 L56 7 L52 7 L50 7 L46 7 L44 7 L42 6 L41 4 L40 2 L39 -0 L38 -2 L37 -4 L36 -6 L34 -8 L32 -9 L31 -10 L29 -11 L27 -12 L24 -13 L22 -14 L20 -14 L16 -14 L14 -14 L10 -14 L8 -14 L4 -14 L2 -14 L-2 -14 L-4 -14 L-8 -14 L-10 -14 L-13 -15 L-15 -16 L-17 -16 L-19 -18 L-21 -19 L-22 -20 L-24 -22 L-25 -24 L-25 -26 L-26 -29 L-26 -31 L-26 -34 L-26 -36 L-25 -39 L-25 -42 L-24 -44 L-23 -46 L-23 -48 L-22 -50 L-21 -52 L-20 -54 L-19 -56 L-18 -58 L-16 -60 L-15 -62 L-14 -64 L-13 -66 L-12 -68 L-10 -69 L-9 -70 L-7 -72 L-6 -74 L-4 -75 L-3 -76 L-1 -78 L0 -80 L2 -81 L4 -82 L6 -83 L7 -84 L9 -86 L11 -87 L13 -88 L16 -88 L18 -89 L20 -90 L22 -91 L24 -91 L28 -91 L30 -91 L33 -92Z';
const BOT = 'M-76 -6 L-74 -6 L-70 -6 L-68 -6 L-64 -6 L-62 -6 L-58 -6 L-56 -6 L-52 -6 L-50 -6 L-48 -5 L-44 -5 L-42 -5 L-40 -3 L-39 -1 L-38 1 L-37 3 L-36 4 L-35 6 L-34 8 L-32 10 L-30 11 L-28 12 L-26 13 L-24 14 L-22 15 L-20 15 L-17 16 L-14 16 L-12 16 L-8 16 L-6 16 L-2 16 L-0 15 L2 15 L6 15 L8 15 L10 16 L14 16 L16 16 L18 17 L20 18 L22 19 L24 21 L25 22 L26 24 L27 26 L27 29 L28 32 L28 34 L27 37 L27 40 L27 42 L26 44 L25 46 L24 49 L23 51 L22 53 L21 55 L20 57 L19 59 L18 61 L17 62 L16 64 L14 66 L13 68 L12 70 L10 71 L9 72 L7 74 L6 76 L4 77 L3 78 L1 80 L-0 82 L-2 82 L-4 84 L-6 85 L-8 86 L-10 87 L-12 88 L-14 89 L-16 90 L-18 91 L-20 91 L-22 92 L-26 92 L-28 93 L-30 93 L-34 93 L-36 93 L-40 93 L-42 93 L-46 93 L-48 93 L-52 93 L-54 93 L-58 93 L-60 93 L-64 93 L-66 93 L-70 93 L-72 93 L-76 93 L-78 93 L-82 93 L-84 93 L-88 93 L-90 93 L-92 92 L-95 92 L-98 91 L-100 90 L-102 89 L-104 88 L-106 87 L-108 86 L-110 85 L-111 84 L-113 82 L-114 81 L-116 79 L-117 78 L-119 76 L-120 75 L-121 73 L-122 71 L-123 69 L-124 67 L-125 64 L-125 62 L-126 60 L-126 57 L-127 54 L-127 52 L-127 49 L-127 46 L-127 44 L-126 41 L-126 39 L-125 36 L-125 34 L-124 31 L-123 29 L-122 27 L-121 25 L-120 23 L-119 21 L-118 19 L-117 18 L-116 16 L-114 14 L-113 13 L-111 11 L-110 10 L-108 8 L-107 7 L-105 5 L-103 4 L-102 3 L-100 2 L-98 0 L-96 -0 L-94 -2 L-92 -2 L-90 -3 L-87 -4 L-85 -4 L-82 -5 L-80 -5 L-77 -6Z';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="rl-mark" width={size} height={size} viewBox="-135 -135 270 270" aria-hidden>
      <g className="rl-spin">
        <path className="rl-top" d={TOP} />
        <path className="rl-bot" d={BOT} />
        <circle className="rl-spark" r="10" />
      </g>
    </svg>
  );
}

// onLift fires as the splash starts lifting, so the page behind can begin its entrance
// while it is being uncovered instead of popping in after.
export function LogoIntro({ onDone, onLift }: { onDone: () => void; onLift: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN) === '1'; } catch { /* storage blocked */ }
    if (seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onLift(); onDone(); return; }

    const ctx = gsap.context(() => {
      gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: () => { try { sessionStorage.setItem(SEEN, '1'); } catch { /* ignore */ } onDone(); },
      })
        .from('.rl-intro .rl-top', { x: 120, y: -120, opacity: 0, duration: 0.8 })
        .from('.rl-intro .rl-bot', { x: -120, y: 120, opacity: 0, duration: 0.8 }, '<')
        .from('.rl-intro .rl-spin', { rotate: -360, svgOrigin: '0 0', duration: 1.1, ease: 'expo.inOut' }, '-=0.35')
        .from('.rl-word span', { yPercent: 120, opacity: 0, duration: 0.6, stagger: 0.06 }, '-=0.3')
        .from('.rl-pulse', { scale: 0.2, opacity: 0.8, duration: 0.9, ease: 'power2.out' }, '<')
        .to('.rl-pulse', { opacity: 0, duration: 0.4 }, '-=0.4')
        .from('.rl-credit', { y: 14, opacity: 0, duration: 0.6 }, '-=0.2')
        .from('.rl-credit b', { backgroundSize: '0% 2px', duration: 0.6, ease: 'power2.inOut' }, '-=0.3')
        .to('.rl-intro-inner', { scale: 0.92, opacity: 0, duration: 0.5, ease: 'power2.in' }, '+=0.7')
        .call(onLift)
        // The context is scoped to this element, so it is targeted directly (a '.rl-intro'
        // selector only searches inside it and never matched, so the splash never lifted).
        .to(root.current, { yPercent: -100, duration: 0.8, ease: 'expo.inOut' }, '-=0.15');
    }, root);
    return () => ctx.revert();
  }, [onDone, onLift]);

  // Click or press a key to skip the splash.
  const skip = () => {
    try { sessionStorage.setItem(SEEN, '1'); } catch { /* ignore */ }
    onLift();
    onDone();
  };
  useEffect(() => {
    window.addEventListener('keydown', skip, { once: true });
    return () => window.removeEventListener('keydown', skip);
  });

  return (
    <div className="rl-intro" ref={root} aria-hidden onClick={skip}>
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
