import { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { HeroChat } from './HeroChat.tsx';
import { Icon } from './Icon.tsx';
import { FeaturePage } from './Features.tsx';
import { HelpPage } from './Help.tsx';
import { LiveDemo } from './LiveDemo.tsx';
import { RouteLink, SiteFooter, SiteNav, useRoute, type Route } from './Site.tsx';
import '../tour.css';
import '../apple.css';

gsap.registerPlugin(ScrollTrigger);

// One statement, revealed word by word: the first words land dark, the rest follow.
const STATEMENT = 'Relay is team chat with a teammate built in. It answers, reminds and recaps, so the work keeps moving.';

// Each feature tile shows a looping motion graphic of the real UI doing that job.
const STEPS: { id: string; title: string; text: string; page: Route; wide?: boolean }[] = [
  { id: 'channels', title: 'Channels and threads', text: 'Every team gets a channel. Side conversations fold into threads, so the main room stays readable.', page: 'overview', wide: true },
  { id: 'huddles', title: 'Huddles', text: 'Start a call from any channel. When it ends, the notes land back in the conversation.', page: 'huddles' },
  { id: 'canvas', title: 'Canvases and lists', text: 'Docs and tracked work live beside the chat, by status and owner.', page: 'overview' },
  { id: 'workflows', title: 'Workflows', text: 'Welcome new people, answer common questions and send reminders on a schedule.', page: 'workflows' },
  { id: 'search', title: 'Search', text: 'Ctrl K searches every message, person and channel, and suggests the answer.', page: 'search' },
];

interface Props {
  onGetStarted: () => void;
}

// The public site: the home page here, and one page per feature in the nav.
export function Landing({ onGetStarted }: Props) {
  const [route, go] = useRoute();
  if (route === 'help') return <HelpPage go={go} onGetStarted={onGetStarted} signedIn={false} />;
  if (route !== 'home') return <FeaturePage page={route} go={go} onGetStarted={onGetStarted} />;
  return <Home go={go} onGetStarted={onGetStarted} />;
}

function Home({ go, onGetStarted }: Props & { go: (r: Route) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [poke, setPoke] = useState(0);

  useLayoutEffect(() => {
    const scroller = root.current!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      ScrollTrigger.defaults({ scroller });
      // Feature motion graphics loop while their tile is on screen and pause when it leaves.
      gsap.utils.toArray<HTMLElement>('.ap-tile').forEach((el) => {
        const sceneEl = el.querySelector<HTMLElement>('[data-scene]');
        if (!sceneEl) return;
        const tl = scene(sceneEl);
        if (reduce) { tl.progress(1); return; }
        tl.repeat(-1).repeatDelay(1.6);
        ScrollTrigger.create({ trigger: el, start: 'top 85%', end: 'bottom 15%', onToggle: (s) => (s.isActive ? tl.play() : tl.pause()) });
      });
      if (reduce) return;
      // Entrance: nav and window rise in on a soft, non-bouncing curve.
      gsap.timeline({ defaults: { ease: 'expo.out' } })
        .from('.ap-nav', { y: -16, opacity: 0, duration: 0.9 })
        .from('.ap-word', { opacity: 0.12, duration: 0.5, stagger: 0.035, ease: 'power1.out' }, 0.2)
        .from('.ap-hero-actions', { y: 12, opacity: 0, duration: 0.8 }, '-=0.6')
        .from('.ap-window', { y: 80, opacity: 0, duration: 1.4 }, '-=0.9');
      // The statement dims back as it scrolls away, the way the reference hero scrubs its text.
      gsap.to('.ap-statement', { opacity: 0.25, y: -40, ease: 'none', scrollTrigger: { trigger: '.ap-hero', start: 'top top', end: 'center top', scrub: 0.5 } });
      gsap.utils.toArray<HTMLElement>('.ap-reveal').forEach((el) => {
        gsap.from(el, { y: 40, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
      });
    }, root);
    return () => { ctx.revert(); ScrollTrigger.defaults({ scroller: window }); };
  }, []);

  return (
    <div className="ap" ref={root} id="top">
      <section className="ap-hero">
        <div className="ap-sky" aria-hidden />
        <SiteNav route="home" go={go} onGetStarted={onGetStarted} />

        <div className="ap-hero-copy">
          <h1 className="ap-statement">
            {STATEMENT.split(' ').map((w, i) => <span key={i} className="ap-word">{w} </span>)}
          </h1>
          <div className="ap-hero-actions">
            <button className="ap-pill blue" onClick={onGetStarted}>Get started free</button>
            <a className="ap-more" href="#tour">See how it works <Icon n="chevron" size={14} /></a>
          </div>
        </div>

        <div className="ap-window" aria-label="Relay product preview">
          <div className="ap-window-bar" aria-hidden><i /><i /><i /><span>Relay — #launch</span></div>
          <div className="ap-window-body">
            <aside className="ap-window-side" aria-hidden>
              <b>Flo Studios</b>
              <span className="on"># launch</span>
              <span># design</span>
              <span># general</span>
              <em>Direct messages</em>
              <span><i style={{ background: '#d7765a' }} />Maya</span>
              <span><i style={{ background: '#3aa79b' }} />Ken</span>
              <span><i style={{ background: '#5b6cf0' }} />Relay Bot</span>
            </aside>
            <div className="ap-window-chat">
              <HeroChat active onMood={() => {}} poke={poke} />
            </div>
          </div>
          <button className="ap-window-hint" onClick={() => setPoke((p) => p + 1)}>Try it: ask Relay Bot something</button>
        </div>
      </section>

      <section className="ap-intro ap-reveal">
        <h2>Everything your team says,<br />in one calm place</h2>
        <p>Chat, pages and databases side by side, with a teammate that keeps the follow-ups from slipping.</p>
      </section>

      <section className="ap-intro ap-reveal" id="live">
        <h2>See the workspace work</h2>
        <p>Pages, databases, sharing and search, running the way they do inside Relay.</p>
        <LiveDemo />
      </section>

      <section id="tour" className="ap-tour">
        {STEPS.map((s) => (
          <article key={s.id} id={s.id} className={`ap-tile ap-reveal ${s.wide ? 'wide' : ''}`}>
            <div className="ap-tile-copy">
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <RouteLink to={s.page} go={go} className="ap-more">Learn more <Icon n="chevron" size={14} /></RouteLink>
            </div>
            <div className="ap-tile-media" data-scene={s.id}><Scene id={s.id} /></div>
          </article>
        ))}
      </section>

      <section className="ap-final ap-reveal">
        <h2>Ready when your team is</h2>
        <p>Free to start. Every feature unlocked.</p>
        <button className="ap-pill blue" onClick={onGetStarted}>Get started free</button>
      </section>

      <SiteFooter go={go} />
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
        <div className="ms-msg"><Av c="#d7765a" l="M" /><div><b>Maya</b><p>Launch copy is ready for review</p></div></div>
        <div className="ms-msg"><Av c="#3aa79b" l="K" /><div><b>Ken</b><p>Looks great. One question on pricing</p><span className="ms-replies">3 replies</span></div></div>
        <div className="ms-msg"><Av c="#8a6bd8" l="P" /><div><b>Priya</b><p>Shipping at 4</p></div></div>
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
      <div className="ms-bar"># design · Huddle</div>
      <div className="ms-people">
        {[['#d7765a', 'M'], ['#3aa79b', 'K'], ['#8a6bd8', 'P']].map(([c, l]) => (
          <div key={l} className="ms-person"><Av c={c} l={l} /><span className="ms-meter"><i /><i /><i /><i /><i /></span></div>
        ))}
      </div>
      <div className="ms-msg ms-notes"><Av c="#f0b07a" l="R" /><div><b>Relay Bot</b><p>Huddle notes: ship Friday, Ken owns QA</p></div></div>
    </div>
  );
  if (id === 'canvas') return (
    <div className="ms ms-canvas" aria-hidden>
      <div className="ms-doc">
        <div className="ms-bar">Launch plan</div>
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
      <div className="ms-node trig">When someone joins #general</div>
      <svg className="ms-wire" viewBox="0 0 10 60" preserveAspectRatio="none"><path d="M5 0 V60" /></svg>
      <div className="ms-node act">Post a welcome message</div>
      <div className="ms-msg ms-welcome"><Av c="#f0b07a" l="R" /><div><b>Relay Bot</b><p>Welcome aboard, Sam. Start with #launch.</p></div></div>
    </div>
  );
  return (
    <div className="ms ms-search" aria-hidden>
      <div className="ms-query"><span><Icon n="search" /></span><span className="ms-q">launch</span><i className="ms-caret" /></div>
      <div className="ms-results">
        <div className="ms-res best"><b>Answer:</b> launch is Friday at 4 PM, per Priya in #launch</div>
        <div className="ms-res"># launch <small>channel</small></div>
        <div className="ms-res">Launch plan <small>canvas</small></div>
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
