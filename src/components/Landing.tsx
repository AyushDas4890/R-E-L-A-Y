import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { SplitText } from 'gsap/SplitText';
import { GlowAscii } from './GlowAscii.tsx';
import { LogoIntro, LogoMark } from './LogoIntro.tsx';
import SpotlightCard from '../react-bits/SpotlightCard.tsx';
import '../landing.css';
import '../nexus.css';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

// Warm "voxel terrain" palette for the hero glyph field.
const TERRAIN = ['#1a0906', '#4a1c12', '#8a3a22', '#c8693c', '#f0b07a'];

const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'Huddles', href: '#features' },
  { label: 'Workflows', href: '#features' },
  { label: 'Why Relay', href: '#stats' },
];

const FEATURES = [
  { icon: '#', title: 'Channels & threads', text: 'Public and private channels, threaded replies, pins and saved items keep every conversation findable.' },
  { icon: '◎', title: 'Huddles', text: 'Drop into live audio with a mic meter, then get notes posted to the channel when the huddle ends.' },
  { icon: '▤', title: 'Canvases & lists', text: 'Write docs beside the chat and track work on boards by status, assignee and due date.' },
  { icon: '⚡', title: 'Workflow Builder', text: 'Automate reminders, scheduled messages and slash commands without leaving the workspace.' },
  { icon: '⌕', title: 'Instant search', text: 'Press Ctrl+K to jump to any message, person or channel across the whole workspace.' },
  { icon: '✦', title: 'Everything unlocked', text: 'No seat limits and no paywalls. Every premium capability is on from the first message.' },
];

const STATS = [
  { value: 30, suffix: '+', label: 'Premium features' },
  { value: 4, suffix: '', label: 'Themes' },
  { value: 0, suffix: '', label: 'Seat limits' },
];

interface Props {
  onGetStarted: () => void;
}

export function Landing({ onGetStarted }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [intro, setIntro] = useState(true);
  const endIntro = useCallback(() => setIntro(false), []);

  useEffect(() => {
    if (intro) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scroller = root.current!;
    let onMove: ((e: PointerEvent) => void) | null = null;
    const hero = scroller.querySelector<HTMLElement>('.nx-hero')!;

    const ctx = gsap.context(() => {
      if (reduce) {
        gsap.utils.toArray<HTMLElement>('.lp-stat-num').forEach((el) => { el.textContent = el.dataset.value ?? '0'; });
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
      tl.from('.nx-nav > *:not(.nx-line)', { y: -30, opacity: 0, duration: 0.8, stagger: 0.05 })
        .from('.nx-line-h', { scaleX: 0, duration: 1 }, '<')
        .from('.nx-line-v', { scaleY: 0, duration: 0.8 }, '<0.2')
        .from('.nx-word-a', { xPercent: -60, opacity: 0, duration: 1.2 }, '-=0.6')
        .from('.nx-word-b', { xPercent: 60, opacity: 0, duration: 1.2 }, '<')
        .from('.nx-bot', { yPercent: 45, opacity: 0, duration: 1.4, ease: 'expo.out' }, '-=1.1')
        .from('.nx-head-line > span', { yPercent: 110, duration: 0.9, stagger: 0.12 }, '-=0.8')
        .from('.nx-tag', { opacity: 0, y: 12, duration: 0.6 }, '-=0.5');

      // Idle life: float, blink every few seconds, wave once, breathing screen glow.
      gsap.to('.nx-bot-inner', { y: -14, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      gsap.timeline({ repeat: -1, repeatDelay: 3.2, delay: 2 })
        .to('.nx-eye', { scaleY: 0.12, duration: 0.07, ease: 'none' })
        .to('.nx-eye', { scaleY: 1, duration: 0.1, ease: 'none' });
      gsap.timeline({ delay: 1.8 })
        .to('.nx-arm.r', { rotate: -140, duration: 0.45, ease: 'back.out(2)' })
        .to('.nx-arm.r', { rotate: -110, duration: 0.25, yoyo: true, repeat: 3, ease: 'sine.inOut' })
        .to('.nx-arm.r', { rotate: 0, duration: 0.6, ease: 'power2.inOut' });
      gsap.to('.nx-glow', { opacity: 0.55, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });

      // Pointer parallax: the head turns toward the cursor, the wordmark halves drift the other way.
      const turn = gsap.quickTo('.nx-bot-head', 'rotationY', { duration: 0.8, ease: 'power3.out' });
      const nod = gsap.quickTo('.nx-bot-head', 'rotationX', { duration: 0.8, ease: 'power3.out' });
      const fx = gsap.quickTo('.nx-face', 'x', { duration: 0.6, ease: 'power3.out' });
      const fy = gsap.quickTo('.nx-face', 'y', { duration: 0.6, ease: 'power3.out' });
      const wa = gsap.quickTo('.nx-word-a', 'x', { duration: 1.2, ease: 'power3.out' });
      const wb = gsap.quickTo('.nx-word-b', 'x', { duration: 1.2, ease: 'power3.out' });
      onMove = (e: PointerEvent) => {
        const r = hero.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        turn(nx * 30); nod(-ny * 16); fx(nx * 18); fy(ny * 10);
        wa(-nx * 36); wb(-nx * 36);
      };
      hero.addEventListener('pointermove', onMove);

      const scrub = { trigger: '.nx-hero', start: 'top top', end: 'bottom top', scrub: true };
      gsap.to('.nx-bot', { yPercent: 20, ease: 'none', scrollTrigger: scrub });
      gsap.to('.nx-word-a', { xPercent: -30, ease: 'none', scrollTrigger: scrub });
      gsap.to('.nx-word-b', { xPercent: 30, ease: 'none', scrollTrigger: scrub });

      // Smooth scrolling for the whole page.
      ScrollSmoother.create({ wrapper: scroller, content: '.nx-content', smooth: 1.2, effects: true, smoothTouch: 0.1 });

      gsap.to('.nx-marquee-track', { xPercent: -50, duration: 28, ease: 'none', repeat: -1 });
      gsap.to('.nx-marquee', { skewY: -3, ease: 'none', scrollTrigger: { trigger: '.nx-marquee', start: 'top bottom', end: 'bottom top', scrub: true } });

      // Headings: characters rise and settle as they scroll in.
      gsap.utils.toArray<HTMLElement>('.nx-split').forEach((h) => {
        const split = SplitText.create(h, { type: 'chars,words', mask: 'words' });
        gsap.from(split.chars, { yPercent: 110, rotate: 8, duration: 0.9, stagger: 0.018, ease: 'power4.out', scrollTrigger: { trigger: h, start: 'top 85%', once: true } });
      });

      // Statement: words light up one by one as you scrub through.
      const words = SplitText.create('.nx-statement p', { type: 'words' }).words;
      gsap.fromTo(words, { opacity: 0.12 }, { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: '.nx-statement', start: 'top 70%', end: 'bottom 50%', scrub: 0.6 } });

      // Feature reel: pinned, scrolls sideways; each card lifts and straightens as it enters.
      const track = scroller.querySelector<HTMLElement>('.nx-reel-track')!;
      const dist = () => track.scrollWidth - window.innerWidth + 48;
      const reel = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '.nx-reel', start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: 1, invalidateOnRefresh: true } });
      gsap.utils.toArray<HTMLElement>('.nx-card').forEach((card) => {
        gsap.from(card, { y: 80, rotate: 6, opacity: 0.2, ease: 'power2.out', scrollTrigger: { trigger: card, containerAnimation: reel, start: 'left 95%', end: 'left 55%', scrub: true } });
      });
      gsap.to('.nx-reel-progress i', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.nx-reel', start: 'top top', end: () => `+=${dist()}`, scrub: true } });

      // Stats: count up with filling bars.
      gsap.utils.toArray<HTMLElement>('.nx-stat').forEach((el, i) => {
        const num = el.querySelector<HTMLElement>('.lp-stat-num')!;
        const counter = { n: 0 };
        gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 85%', once: true }, delay: i * 0.12 })
          .from(el, { y: 50, opacity: 0, duration: 0.8, ease: 'power3.out' })
          .to(counter, { n: Number(num.dataset.value), duration: 1.6, ease: 'power2.out', onUpdate: () => { num.textContent = String(Math.round(counter.n)); } }, '<0.1')
          .from(el.querySelector('.nx-bar i'), { scaleX: 0, duration: 1.4, ease: 'power3.inOut' }, '<');
      });

      // Finale: the giant line scales into place; the button has a magnetic pull.
      gsap.fromTo('.nx-final-big', { scale: 0.55, opacity: 0.2 }, { scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: '.nx-final', start: 'top bottom', end: 'center center', scrub: 0.8 } });
      const btn = scroller.querySelector<HTMLElement>('.nx-final .nx-cta')!;
      const bx = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' });
      const by = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' });
      btn.addEventListener('pointermove', (e) => { const r = btn.getBoundingClientRect(); bx((e.clientX - r.left - r.width / 2) * 0.35); by((e.clientY - r.top - r.height / 2) * 0.35); });
      btn.addEventListener('pointerleave', () => { bx(0); by(0); });
      gsap.from('.lp-foot > *', { y: 16, opacity: 0, duration: 0.6, stagger: 0.15, scrollTrigger: { trigger: '.lp-foot', start: 'top 98%', once: true } });
    }, root);
    return () => {
      if (onMove) hero.removeEventListener('pointermove', onMove);
      ctx.revert();
      ScrollSmoother.get()?.kill();
    };
  }, [intro]);

  return (
    <div className="lp nx" ref={root}>
      {intro && <LogoIntro onDone={endIntro} />}
      <div className="nx-content">
      <section className="nx-hero">
        <div className="nx-terrain" aria-hidden><GlowAscii palette={TERRAIN} /></div>
        <div className="nx-sun" aria-hidden />

        <header className="nx-nav">
          <div className="nx-brand"><LogoMark size={26} />relay</div>
          <nav className={`nx-links ${menu ? 'open' : ''}`}>
            {NAV.map((n) => <a key={n.label} href={n.href} onClick={() => setMenu(false)}>{n.label}</a>)}
            <button className="nx-links-cta" onClick={onGetStarted}>Sign in</button>
          </nav>
          <button className="nx-cta" onClick={onGetStarted}>Get started <b>—</b></button>
          <button className="nx-menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>Menu <b>=</b></button>
          <span className="nx-line nx-line-h" aria-hidden />
          <span className="nx-line nx-line-v l" aria-hidden><i /></span>
          <span className="nx-line nx-line-v r" aria-hidden><i /></span>
        </header>

        <div className="nx-word nx-word-a" aria-hidden>re</div>
        <div className="nx-word nx-word-b" aria-hidden>lay</div>

        <div className="nx-bot" aria-hidden>
          <div className="nx-bot-inner">
            <div className="nx-bot-head">
              <span className="nx-ear l" /><span className="nx-ear r" />
              <div className="nx-screen">
                <span className="nx-glow" />
                <div className="nx-face">
                  <i className="nx-eye l" /><i className="nx-eye r" />
                  <i className="nx-mouth" />
                </div>
                <span className="nx-shine" />
              </div>
            </div>
            <div className="nx-bot-body">
              <span className="nx-arm l" /><span className="nx-arm r" />
              <div className="nx-chest"><span /><span /><span /></div>
            </div>
          </div>
        </div>

        <div className="nx-copy">
          <p className="nx-tag">Every conversation starts as a question.<br />Relay turns it into an answer.</p>
          <h1 className="nx-head">
            <span className="nx-head-line"><span>Team chat</span></span>
            <span className="nx-head-line"><span>that talks back</span></span>
          </h1>
        </div>
      </section>

      <div className="nx-marquee" aria-hidden>
        <div className="nx-marquee-track">
          {[0, 1].map((k) => (
            <span key={k}>
              {['Channels', 'Threads', 'Huddles', 'Canvases', 'Lists', 'Workflows', 'Search', 'Clips', 'Reminders'].map((w) => <em key={w}>{w}<i>✦</i></em>)}
            </span>
          ))}
        </div>
      </div>

      <main>
        <section className="nx-statement">
          <p>One workspace for every conversation. Channels, threads, huddles and canvases, all moving at the speed of your team.</p>
        </section>

        <section id="features" className="nx-reel">
          <div className="nx-reel-head">
            <h2 className="nx-split">Everything, unlocked</h2>
            <div className="nx-reel-progress"><i /></div>
          </div>
          <div className="nx-reel-track">
            {FEATURES.map((f, i) => (
              <SpotlightCard key={f.title} className="nx-card" spotlightColor="rgba(157, 245, 197, 0.22)">
                <span className="nx-card-num">0{i + 1}</span>
                <span className="lp-icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </SpotlightCard>
            ))}
          </div>
        </section>

        <section id="stats" className="nx-stats">
          {STATS.map((s, i) => (
            <div key={s.label} className="nx-stat">
              <div className="nx-stat-num"><span className="lp-stat-num" data-value={s.value}>0</span>{s.suffix}</div>
              <span>{s.label}</span>
              <div className="nx-bar"><i style={{ width: `${[100, 70, 100][i]}%` }} /></div>
            </div>
          ))}
        </section>

        <section className="nx-final">
          <h2 className="nx-final-big">Ready when<br />your team is</h2>
          <button className="nx-cta" onClick={onGetStarted}>Get started <b>—</b></button>
        </section>
      </main>

      <footer className="lp-foot"><span>Relay. Built from public product behavior only.</span><span className="nx-powered">Powered by <b>Flo Studios</b></span></footer>
      </div>
    </div>
  );
}
