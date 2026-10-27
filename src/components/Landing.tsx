import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { SplitText } from 'gsap/SplitText';
import { GlowAscii } from './GlowAscii.tsx';
import { HeroChat } from './HeroChat.tsx';
import { LogoIntro, LogoMark } from './LogoIntro.tsx';
import { Robot } from './Robot.tsx';
import '../landing.css';
import '../nexus.css';
import '../tour.css';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

// Warm "voxel terrain" palette for the hero glyph field.
const TERRAIN = ['#1a0906', '#4a1c12', '#8a3a22', '#c8693c', '#f0b07a'];

// Feature, glyph, and the little message it "says" when the pulse reaches it.
const SIGNAL: [string, string, string][] = [
  ['Channels', '#', '#launch'],
  ['Threads', '↳', '3 replies'],
  ['Huddles', '◉', 'live now'],
  ['Canvases', '▤', 'draft v2'],
  ['Lists', '✓', '4 of 5 done'],
  ['Workflows', '⚡', 'ran 9:30'],
  ['Search', '⌕', '⌘K'],
  ['Clips', '▶', '0:12'],
  ['Reminders', '◔', 'in 10m'],
];

const NAV = [
  { label: 'How it works', href: '#tour' },
  { label: 'Huddles', href: '#huddles' },
  { label: 'Workflows', href: '#workflows' },
  { label: 'Search', href: '#search' },
];

type Mood = 'happy' | 'focus' | 'sad';

// What the robot says while each step of the tour is on screen.
const STEPS = [
  { id: 'channels', title: 'Talk in channels, branch into threads', text: 'Every team gets a channel. Side conversations become threads, so the main room stays readable.', say: 'Post in a channel. Replies fold into a thread.' },
  { id: 'huddles', title: 'Jump on a huddle', text: 'Start a call from any channel. When it ends, the notes land back in the conversation.', say: 'One click and everyone’s talking. I take the notes.' },
  { id: 'canvas', title: 'Write it down next to the chat', text: 'Each channel has a canvas for docs and a list for tracking work by status and owner.', say: 'Docs and to-dos live right beside the chat.' },
  { id: 'workflows', title: 'Let the bot do the busywork', text: 'Workflows welcome new people, answer common questions and send reminders on a schedule.', say: 'Tell me when, I’ll handle the what.' },
  { id: 'search', title: 'Find anything in a keystroke', text: 'Ctrl+K searches every message, person and channel at once, and suggests an answer.', say: 'Lost something? I’ll find it.' },
];

interface Props {
  onGetStarted: () => void;
}

export function Landing({ onGetStarted }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [intro, setIntro] = useState(true);
  // `live` flips as the splash starts lifting; the hero is hidden until then so nothing pops.
  const [live, setLive] = useState(false);
  const [mood, setMood] = useState<Mood>('happy');
  const [poke, setPoke] = useState(0);
  const [step, setStep] = useState(0);
  const endIntro = useCallback(() => setIntro(false), []);
  const lift = useCallback(() => setLive(true), []);

  // Layout effect: start values are set before the browser paints the revealed hero.
  useLayoutEffect(() => {
    if (!live) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scroller = root.current!;
    const hero = scroller.querySelector<HTMLElement>('.nx-hero')!;
    let onMove: ((e: PointerEvent) => void) | null = null;

    const ctx = gsap.context(() => {
      // Tour steps still need to update the robot's line without motion.
      gsap.utils.toArray<HTMLElement>('.nx-step').forEach((el, i) => {
        ScrollTrigger.create({ trigger: el, start: 'top 55%', end: 'bottom 55%', onToggle: (s) => s.isActive && setStep(i) });
      });
      if (reduce) return;

      // Smooth scrolling first: ScrollTriggers made before it measure the wrong scroller.
      ScrollSmoother.create({ wrapper: scroller, content: '.nx-content', smooth: 1.1, effects: true, smoothTouch: 0.1 });

      gsap.timeline({ defaults: { ease: 'power4.out' } })
        .from('.nx-nav > *:not(.nx-line)', { y: -24, opacity: 0, duration: 0.8, stagger: 0.05, clearProps: 'transform' })
        .from('.nx-line-h', { scaleX: 0, duration: 1 }, '<')
        .from('.nx-line-v', { scaleY: 0, duration: 0.8 }, '<0.2')
        .from('.nx-ghost', { yPercent: 18, opacity: 0, duration: 1.4, ease: 'expo.out' }, '<')
        .from('.nx-hero .nx-bot', { yPercent: 40, opacity: 0, duration: 1.3, ease: 'expo.out' }, '<0.15')
        .from('.nx-head-line > span', { yPercent: 110, duration: 0.9, stagger: 0.1 }, '<0.2')
        .from('.nx-lede, .nx-actions', { y: 16, opacity: 0, duration: 0.7, stagger: 0.08 }, '-=0.5')
        .from('.hc', { x: 40, opacity: 0, rotateY: -12, duration: 1, ease: 'expo.out' }, '-=0.8');

      // Idle life for every robot: float, blink, one wave on arrival, breathing glow.
      gsap.to('.nx-bot-inner', { y: -12, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1, force3D: true });
      gsap.timeline({ repeat: -1, repeatDelay: 3.2, delay: 2 })
        .to('.nx-eye', { scaleY: 0.12, duration: 0.07, ease: 'none' })
        .to('.nx-eye', { scaleY: 1, duration: 0.1, ease: 'none' });
      gsap.to('.nx-glow', { opacity: 0.55, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });

      // Pointer: the hero robot looks at the cursor; the ghost wordmark drifts the other way.
      const turn = gsap.quickTo('.nx-hero .nx-bot-head', 'rotationY', { duration: 0.8, ease: 'power3.out' });
      const nod = gsap.quickTo('.nx-hero .nx-bot-head', 'rotationX', { duration: 0.8, ease: 'power3.out' });
      const fx = gsap.quickTo('.nx-hero .nx-face', 'x', { duration: 0.6, ease: 'power3.out' });
      const fy = gsap.quickTo('.nx-hero .nx-face', 'y', { duration: 0.6, ease: 'power3.out' });
      const gx = gsap.quickTo('.nx-ghost', 'x', { duration: 1.2, ease: 'power3.out' });
      onMove = (e: PointerEvent) => {
        const r = hero.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        turn(nx * 30); nod(-ny * 16); fx(nx * 18); fy(ny * 10); gx(-nx * 30);
      };
      hero.addEventListener('pointermove', onMove);

      const scrub = { trigger: '.nx-hero', start: 'top top', end: 'bottom top', scrub: 0.6 };
      gsap.fromTo('.nx-hero .nx-bot-scroll', { y: 0, scale: 1 }, { y: () => -window.innerHeight * 0.1, scale: 0.94, ease: 'none', immediateRender: false, scrollTrigger: { ...scrub, invalidateOnRefresh: true } });
      gsap.fromTo('.nx-ghost', { yPercent: 0 }, { yPercent: 30, ease: 'none', immediateRender: false, scrollTrigger: scrub });

      // Signal band: a pulse runs down the line and wakes each feature in turn, then the row flashes together.
      const nodes = gsap.utils.toArray<HTMLElement>('.nx-sig-node');
      const clear = () => nodes.forEach((n) => n.classList.remove('lit'));
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        nodes.forEach((n) => n.classList.add('lit'));
      } else {
        const gap = 0.55;
        const run = gap * (nodes.length - 1);
        const tl = gsap.timeline({
          repeat: -1,
          repeatDelay: 1.2,
          onRepeat: clear,
          scrollTrigger: { trigger: '.nx-signal', start: 'top 95%', toggleActions: 'play pause resume pause' },
        });
        tl.fromTo('.nx-sig-dot', { left: '0%' }, { left: '100%', duration: run, ease: 'none' }, 0)
          .fromTo('.nx-sig-fill', { scaleX: 0 }, { scaleX: 1, duration: run, ease: 'none' }, 0);
        nodes.forEach((n, i) => {
          tl.call(() => n.classList.add('lit'), [], i * gap)
            .fromTo(n.querySelector('.nx-sig-orb u'), { scale: 1, opacity: 0.85 }, { scale: 2.5, opacity: 0, duration: 0.9, ease: 'power2.out' }, i * gap);
        });
        tl.to('.nx-sig-orb', { scale: 1.14, duration: 0.22, ease: 'power2.out', yoyo: true, repeat: 1, stagger: 0.05 }, run + 0.5);
      }

      gsap.utils.toArray<HTMLElement>('.nx-split').forEach((h) => {
        const split = SplitText.create(h, { type: 'chars,words', mask: 'words' });
        gsap.from(split.chars, { yPercent: 110, duration: 0.9, stagger: 0.018, ease: 'power4.out', scrollTrigger: { trigger: h, start: 'top 85%', once: true } });
      });

      // CSS sticky doesn't survive the smoother's transform, so pin the narrator robot on wide screens.
      gsap.matchMedia().add('(min-width: 861px)', () => {
        const side = scroller.querySelector<HTMLElement>('.nx-tour-side')!;
        ScrollTrigger.create({ trigger: '.nx-tour-steps', pin: side, pinSpacing: false, start: 'top 18%', end: () => `bottom ${18 + (side.offsetHeight / window.innerHeight) * 100}%`, invalidateOnRefresh: true });
      });

      // Tour: each scene is a short motion graphic of the real product, replayed when you return to it.
      gsap.utils.toArray<HTMLElement>('.nx-step').forEach((el) => {
        const tl = scene(el);
        ScrollTrigger.create({ trigger: el, start: 'top 65%', onEnter: () => tl.restart(), onEnterBack: () => tl.restart() });
        gsap.from(el.querySelector('.nx-step-copy'), { y: 30, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 75%', once: true } });
      });

      gsap.fromTo('.nx-final-big', { scale: 0.7, opacity: 0.2 }, { scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: '.nx-final', start: 'top bottom', end: 'center center', scrub: 0.8 } });
    }, root);

    return () => {
      if (onMove) hero.removeEventListener('pointermove', onMove);
      ctx.revert();
      ScrollSmoother.get()?.kill();
    };
  }, [live]);

  // The tour robot reacts each time it gets a new line.
  useLayoutEffect(() => {
    if (!live || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo('.nx-tour-say', { y: 10, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)' });
    gsap.fromTo('.nx-tour .nx-bot-head', { rotationZ: -7 }, { rotationZ: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)' });
  }, [step, live]);

  const wave = () => {
    setPoke((p) => p + 1);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.timeline()
      .to('.nx-hero .nx-arm.r', { rotate: -140, duration: 0.4, ease: 'back.out(2)' })
      .to('.nx-hero .nx-arm.r', { rotate: -110, duration: 0.22, yoyo: true, repeat: 3, ease: 'sine.inOut' })
      .to('.nx-hero .nx-arm.r', { rotate: -14, duration: 0.5, ease: 'power2.inOut' });
  };

  return (
    <div className="lp nx" ref={root}>
      {intro && <LogoIntro onDone={endIntro} onLift={lift} />}
      <div className="nx-content">
        <section className={`nx-hero ${live ? 'is-live' : ''}`}>
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

          <div className="nx-ghost" aria-hidden>relay</div>

          <div className="nx-hero-grid">
            <div className="nx-copy">
              <h1 className="nx-head">
                <span className="nx-head-line"><span>Team chat</span></span>
                <span className="nx-head-line"><span>that talks back</span></span>
              </h1>
              <p className="nx-lede">Channels, threads, huddles and canvases, with a bot teammate that answers, reminds and recaps. Try it: ask it something.</p>
              <div className="nx-actions">
                <button className="nx-cta big" onClick={onGetStarted}>Get started <b>—</b></button>
                <a className="nx-ghost-btn" href="#tour">See how it works</a>
              </div>
            </div>
            <div className="nx-stage">
              <button className="nx-bot-hit" onClick={wave} aria-label="Say hi to Relay Bot"><Robot mood={mood} /></button>
              <HeroChat active={live} onMood={setMood} poke={poke} />
            </div>
          </div>
        </section>

        <div className="nx-signal" aria-hidden>
          <div className="nx-sig-line"><i className="nx-sig-fill" /><i className="nx-sig-dot" /></div>
          <ul className="nx-sig-nodes">
            {SIGNAL.map(([name, glyph, bubble]) => (
              <li key={name} className="nx-sig-node">
                <span className="nx-sig-bubble">{bubble}</span>
                <b className="nx-sig-orb"><u />{glyph}</b>
                <em>{name}</em>
              </li>
            ))}
          </ul>
        </div>

        <section id="tour" className="nx-tour">
          <h2 className="nx-split nx-tour-title">How Relay works</h2>
          <div className="nx-tour-grid">
            <aside className="nx-tour-side" aria-hidden>
              <p className="nx-tour-say" key={step}>{STEPS[step].say}</p>
              <Robot mood={step === 4 ? 'focus' : 'happy'} />
              <ol className="nx-tour-dots">{STEPS.map((s, i) => <li key={s.id} className={i === step ? 'on' : ''} />)}</ol>
            </aside>
            <div className="nx-tour-steps">
              {STEPS.map((s) => (
                <article key={s.id} id={s.id} className="nx-step" data-scene={s.id}>
                  <div className="nx-step-copy">
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                  <Scene id={s.id} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="nx-final">
          <h2 className="nx-final-big">Ready when<br />your team is</h2>
          <button className="nx-cta big" onClick={onGetStarted}>Get started <b>—</b></button>
        </section>

        <footer className="lp-foot"><span>Relay. Built from public product behavior only.</span><span className="nx-powered">Powered by <b>Flo Studios</b></span></footer>
      </div>
    </div>
  );
}

// ---- Tour scenes: tiny, honest mock-ups of the real UI. Markup here, motion in scene(). ----

const Av = ({ c, l }: { c: string; l: string }) => <i className="ms-av" style={{ background: c }}>{l}</i>;

function Scene({ id }: { id: string }) {
  if (id === 'channels') return (
    <div className="ms ms-chat" aria-hidden>
      <div className="ms-col">
        <div className="ms-bar"># launch</div>
        <div className="ms-msg"><Av c="#d7765a" l="M" /><div><b>Maya</b><p>Launch copy is ready for review 🚀</p></div></div>
        <div className="ms-msg"><Av c="#3aa79b" l="K" /><div><b>Ken</b><p>Looks great. One question on pricing</p><span className="ms-replies">💬 3 replies</span></div></div>
        <div className="ms-msg"><Av c="#8a6bd8" l="P" /><div><b>Priya</b><p>Shipping at 4 ✅</p></div></div>
      </div>
      <div className="ms-thread">
        <div className="ms-bar">Thread</div>
        <div className="ms-msg sm"><Av c="#d7765a" l="M" /><p>Pricing stays the same</p></div>
        <div className="ms-msg sm"><Av c="#3aa79b" l="K" /><p>Perfect, thanks!</p></div>
      </div>
    </div>
  );
  if (id === 'huddles') return (
    <div className="ms ms-huddle" aria-hidden>
      <div className="ms-bar"># design · 🎧 Huddle</div>
      <div className="ms-people">
        {[['#d7765a', 'M'], ['#3aa79b', 'K'], ['#8a6bd8', 'P']].map(([c, l]) => (
          <div key={l} className="ms-person"><Av c={c} l={l} /><span className="ms-meter"><i /><i /><i /><i /><i /></span></div>
        ))}
      </div>
      <div className="ms-msg ms-notes"><Av c="#f0b07a" l="R" /><div><b>Relay Bot</b><p>📝 Huddle notes: ship Friday, Ken owns QA</p></div></div>
    </div>
  );
  if (id === 'canvas') return (
    <div className="ms ms-canvas" aria-hidden>
      <div className="ms-doc">
        <div className="ms-bar">📄 Launch plan</div>
        <p className="ms-type t1">Goal: launch v2 on Friday</p>
        <p className="ms-type t2">• Final copy review</p>
        <p className="ms-type t3">• QA on mobile</p>
      </div>
      <div className="ms-board">
        <div className="ms-lane"><b>Doing</b><span className="ms-card mover">QA on mobile</span></div>
        <div className="ms-lane"><b>Done</b><span className="ms-card">Copy review</span><span className="ms-card ghost" /></div>
      </div>
    </div>
  );
  if (id === 'workflows') return (
    <div className="ms ms-flow" aria-hidden>
      <div className="ms-node trig">⚡ When someone joins #general</div>
      <svg className="ms-wire" viewBox="0 0 10 60" preserveAspectRatio="none"><path d="M5 0 V60" /></svg>
      <div className="ms-node act">💬 Post a welcome message</div>
      <div className="ms-msg ms-welcome"><Av c="#f0b07a" l="R" /><div><b>Relay Bot</b><p>Welcome aboard, Sam! 👋 Start with #launch.</p></div></div>
    </div>
  );
  return (
    <div className="ms ms-search" aria-hidden>
      <div className="ms-query"><span>⌕</span><span className="ms-q">launch</span><i className="ms-caret" /></div>
      <div className="ms-results">
        <div className="ms-res best">✨ <b>Answer:</b> launch is Friday at 4 PM, per Priya in #launch</div>
        <div className="ms-res"># launch <small>channel</small></div>
        <div className="ms-res">📄 Launch plan <small>canvas</small></div>
        <div className="ms-res">Maya: Launch copy is ready… <small>message</small></div>
      </div>
    </div>
  );
}

function scene(el: HTMLElement): gsap.core.Timeline {
  const q = gsap.utils.selector(el);
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  switch (el.dataset.scene) {
    case 'channels':
      tl.fromTo(q('.ms-col .ms-msg'), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.35 })
        .fromTo(q('.ms-replies'), { scale: 0.8 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' })
        .fromTo(q('.ms-thread'), { xPercent: 105 }, { xPercent: 0, duration: 0.7, ease: 'expo.out' }, '+=0.2')
        .fromTo(q('.ms-thread .ms-msg'), { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.3 });
      break;
    case 'huddles':
      tl.fromTo(q('.ms-person'), { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, stagger: 0.3, ease: 'back.out(2)' })
        .fromTo(q('.ms-meter i'), { scaleY: 0.2 }, { scaleY: () => 0.3 + Math.random() * 0.7, duration: 0.18, yoyo: true, repeat: 15, stagger: { each: 0.03, from: 'random' }, ease: 'sine.inOut' }, '<0.4')
        .fromTo(q('.ms-notes'), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, '+=0.2');
      break;
    case 'canvas':
      tl.fromTo(q('.ms-type'), { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.8, stagger: 0.5, ease: 'steps(18)' })
        .fromTo(q('.mover'), { x: 0, y: 0 }, { x: () => (q('.ghost')[0] as HTMLElement).offsetLeft - (q('.mover')[0] as HTMLElement).offsetLeft, y: () => (q('.ghost')[0] as HTMLElement).offsetTop - (q('.mover')[0] as HTMLElement).offsetTop, duration: 0.9, ease: 'power2.inOut' }, '+=0.2')
        .to(q('.mover'), { backgroundColor: '#2f5d4a', duration: 0.3 }, '-=0.2');
      break;
    case 'workflows':
      tl.fromTo(q('.trig'), { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 })
        .fromTo(q('.ms-wire path'), { strokeDashoffset: 60 }, { strokeDashoffset: 0, duration: 0.6, ease: 'none' })
        .fromTo(q('.act'), { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' })
        .fromTo(q('.ms-welcome'), { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, '+=0.15');
      break;
    default: {
      const word = 'launch';
      const qEl = q('.ms-q')[0] as HTMLElement;
      const typed = { n: 0 };
      tl.fromTo(typed, { n: 0 }, { n: word.length, duration: 0.7, ease: 'none', onUpdate: () => { qEl.textContent = word.slice(0, Math.round(typed.n)); } })
        .fromTo(q('.ms-res'), { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.12 })
        .fromTo(q('.best'), { boxShadow: '0 0 0 0 rgba(157,245,197,0)' }, { boxShadow: '0 0 0 2px rgba(157,245,197,.7)', duration: 0.4 });
    }
  }
  return tl;
}
