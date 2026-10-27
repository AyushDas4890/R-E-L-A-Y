import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { GlowAscii } from './GlowAscii.tsx';
import { LogoIntro, LogoMark } from './LogoIntro.tsx';
import SpotlightCard from '../react-bits/SpotlightCard.tsx';
import FadeContent from '../react-bits/FadeContent.tsx';
import '../landing.css';
import '../nexus.css';

gsap.registerPlugin(ScrollTrigger);

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
    ScrollTrigger.defaults({ scroller });
    let onMove: ((e: PointerEvent) => void) | null = null;
    const hero = scroller.querySelector<HTMLElement>('.nx-hero')!;

    const ctx = gsap.context(() => {
      if (reduce) {
        gsap.set('.lp-feature', { opacity: 1 });
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

      gsap.utils.toArray<HTMLElement>('.lp-stat-num').forEach((el) => {
        const target = Number(el.dataset.value);
        const counter = { n: 0 };
        gsap.to(counter, {
          n: target,
          duration: 1.6,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          onUpdate: () => { el.textContent = String(Math.round(counter.n)); },
        });
      });

      gsap.to('.nx-marquee-track', { xPercent: -50, duration: 28, ease: 'none', repeat: -1 });
      gsap.to('.nx-marquee', { skewY: -2, ease: 'none', scrollTrigger: { trigger: '.nx-marquee', start: 'top bottom', end: 'bottom top', scrub: true } });
      gsap.utils.toArray<HTMLElement>('.lp-h2').forEach((h) => {
        gsap.from(h, { y: 50, opacity: 0, rotateX: -40, transformOrigin: '50% 100%', duration: 1, ease: 'power3.out', scrollTrigger: { trigger: h, start: 'top 88%', once: true } });
      });
      gsap.from('.lp-stat', { y: 30, opacity: 0, scale: 0.9, duration: 0.8, stagger: 0.12, ease: 'back.out(1.6)', scrollTrigger: { trigger: '.lp-stats', start: 'top 85%', once: true } });
      gsap.from('.lp-final .lp-btn', { scale: 0.6, opacity: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)', scrollTrigger: { trigger: '.lp-final', start: 'top 80%', once: true } });
      gsap.from('.lp-foot > *', { y: 16, opacity: 0, duration: 0.6, stagger: 0.15, scrollTrigger: { trigger: '.lp-foot', start: 'top 98%', once: true } });

      gsap.from('.lp-feature', {
        y: 40,
        opacity: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: 'power2.out',
        scrollTrigger: { trigger: '.lp-grid', start: 'top 80%', once: true },
      });
    }, root);
    return () => {
      if (onMove) hero.removeEventListener('pointermove', onMove);
      ctx.revert();
      ScrollTrigger.defaults({ scroller: undefined });
    };
  }, [intro]);

  return (
    <div className="lp nx" ref={root}>
      {intro && <LogoIntro onDone={endIntro} />}
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
        <section id="features" className="lp-section">
          <FadeContent blur duration={800}>
            <h2 className="lp-h2">Everything your team needs, nothing locked away</h2>
          </FadeContent>
          <div className="lp-grid">
            {FEATURES.map((f) => (
              <div className="lp-feature" key={f.title}>
                <SpotlightCard className="lp-card" spotlightColor="rgba(240, 176, 122, 0.25)">
                  <span className="lp-icon">{f.icon}</span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </SpotlightCard>
              </div>
            ))}
          </div>
        </section>

        <section id="stats" className="lp-section lp-stats">
          {STATS.map((s) => (
            <div key={s.label} className="lp-stat">
              <div><span className="lp-stat-num" data-value={s.value}>0</span>{s.suffix}</div>
              <span>{s.label}</span>
            </div>
          ))}
        </section>

        <section className="lp-section lp-final">
          <FadeContent duration={800}>
            <h2 className="lp-h2">Ready when your team is</h2>
            <button className="lp-btn lp-btn-primary" onClick={onGetStarted}>Get started</button>
          </FadeContent>
        </section>
      </main>

      <footer className="lp-foot"><span>Relay. Built from public product behavior only.</span><span className="nx-powered">Powered by <b>Flo Studios</b></span></footer>
    </div>
  );
}
