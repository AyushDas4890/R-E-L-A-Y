import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { GlowAscii } from './GlowAscii.tsx';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import BlurText from '../react-bits/BlurText.tsx';
import GradientText from '../react-bits/GradientText.tsx';
import ShinyText from '../react-bits/ShinyText.tsx';
import SpotlightCard from '../react-bits/SpotlightCard.tsx';
import FadeContent from '../react-bits/FadeContent.tsx';
import '../landing.css';

gsap.registerPlugin(ScrollTrigger);

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

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scroller = root.current;
    ScrollTrigger.defaults({ scroller });
    const ctx = gsap.context(() => {
      if (reduce) {
        gsap.set('.lp-feature', { opacity: 1 });
        gsap.utils.toArray<HTMLElement>('.lp-stat-num').forEach((el) => { el.textContent = el.dataset.value ?? '0'; });
        return;
      }
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.lp-nav', { y: -24, opacity: 0, duration: 0.7 })
        .from('.lp-badge', { y: 16, opacity: 0, duration: 0.6 }, '-=0.3')
        .from('.lp-sub', { y: 20, opacity: 0, duration: 0.7 }, '+=0.5')
        .from('.lp-cta > *', { y: 20, opacity: 0, duration: 0.6, stagger: 0.1 }, '-=0.4')
        .from('.lp-preview', { y: 60, opacity: 0, scale: 0.96, duration: 1 }, '-=0.5');

      gsap.to('.lp-preview', {
        yPercent: -8,
        ease: 'none',
        scrollTrigger: { trigger: '.lp-hero', start: 'top top', end: 'bottom top', scrub: true },
      });

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

      gsap.from('.lp-feature', {
        y: 40,
        opacity: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: 'power2.out',
        scrollTrigger: { trigger: '.lp-grid', start: 'top 80%', once: true },
      });
    }, root);
    return () => { ctx.revert(); ScrollTrigger.defaults({ scroller: undefined }); };
  }, []);

  return (
    <div className="lp" ref={root}>
      <div className="lp-bg" aria-hidden>
        <GlowAscii />
      </div>

      <header className="lp-nav">
        <div className="lp-brand"><span className="logo small">R</span><span>Relay</span></div>
        <nav className="lp-links">
          <a href="#features">Features</a>
          <a href="#stats">Why Relay</a>
        </nav>
        <button className="lp-btn lp-btn-ghost" onClick={onGetStarted}>Sign in</button>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-badge">
            <ShinyText text="Every premium feature, unlocked" speed={3} />
          </div>
          <h1 className="lp-title">
            <BlurText text="Team chat that keeps" delay={90} animateBy="words" direction="top" />
            <GradientText colors={['#f5a400', '#ffd977', '#5b8cff', '#f5a400']} animationSpeed={6}>
              everyone in sync
            </GradientText>
          </h1>
          <p className="lp-sub">
            Channels, threads, huddles, canvases and workflows in one fast workspace. No seat limits, no paywalls.
          </p>
          <div className="lp-cta">
            <button className="lp-btn lp-btn-primary" onClick={onGetStarted}>Get started</button>
            <a className="lp-btn lp-btn-ghost" href="#features">See features</a>
          </div>

          <div className="lp-preview" aria-hidden>
            <div className="lp-pv-side">
              <span className="lp-pv-dot" /><b># general</b>
              <span># design</span><span># launch</span><span># random</span>
            </div>
            <div className="lp-pv-main">
              <div className="lp-pv-msg"><i style={{ background: '#f5a400' }} /><div><b>Maya</b><p>Launch checklist is live in the canvas.</p></div></div>
              <div className="lp-pv-msg"><i style={{ background: '#5b8cff' }} /><div><b>Dev</b><p>Huddle in two minutes, join when ready.</p></div></div>
              <div className="lp-pv-msg"><i style={{ background: '#3ecf8e' }} /><div><b>Sam</b><p>Shipped. Notes are posted to the channel.</p></div></div>
            </div>
          </div>
        </section>

        <section id="features" className="lp-section">
          <FadeContent blur duration={800}>
            <h2 className="lp-h2">Everything your team needs, nothing locked away</h2>
          </FadeContent>
          <div className="lp-grid">
            {FEATURES.map((f) => (
              <div className="lp-feature" key={f.title}>
                <SpotlightCard className="lp-card" spotlightColor="rgba(245, 164, 0, 0.25)">
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

      <footer className="lp-foot">Relay. Built from public product behavior only.</footer>
    </div>
  );
}
