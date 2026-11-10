import { Aurora } from './Aurora.tsx';
import { useGlow } from '../glow.ts';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FeatureShelf } from './FeatureShelf.tsx';
import { Icon } from './Icon.tsx';
import { FeaturePage } from './Features.tsx';
import { HelpPage } from './Help.tsx';
import { LiveDemo } from './LiveDemo.tsx';
import { Settle } from './Settle.tsx';
import { Tour } from './TourScenes.tsx';
import { ENTER } from '../motion.ts';
import { RouteLink, SiteFooter, SiteNav, useRoute, type Route } from './Site.tsx';
import LightBulbButton from './framer/LightBulbButton.tsx';
import '../tour.css';
import '../apple.css';
import '../hero.css';

gsap.registerPlugin(ScrollTrigger);

// The closer-look panel plays a motion graphic of the real UI doing each job (TourScenes.tsx).
const STEPS: { id: string; title: string; text: string; page: Route }[] = [
  { id: 'channels', title: 'Channels and threads', text: 'Every team gets a channel. Side conversations fold into threads, so the main room stays readable.', page: 'overview' },
  { id: 'huddles', title: 'Huddles', text: 'Start a call from any channel. When it ends, the notes land back in the conversation.', page: 'huddles' },
  { id: 'canvas', title: 'Canvases and lists', text: 'Docs and tracked work live beside the chat, by status and owner.', page: 'overview' },
  { id: 'workflows', title: 'Workflows', text: 'Welcome new people, answer common questions and send reminders on a schedule.', page: 'workflows' },
  { id: 'search', title: 'Search', text: 'Ctrl K searches every message, person and channel, and suggests the answer.', page: 'search' },
];

// Splits a line into word spans for the scroll reveal; the text itself is unchanged.
const words = (line: string) => line.split(' ').map((w, i, a) => <span key={i} className="w">{w}{i < a.length - 1 ? ' ' : ''}</span>);

// Messages that drift around the hero title: a taste of the workspace before you sign in.
const CHIPS = [
  { who: 'M', text: 'deploy is green', when: 'now', style: { top: '19%', left: '9%', '--d': 22, '--t': '0s', '--p': 0 } },
  { who: 'A', text: 'standup moved to 10:30', when: '2m', style: { top: '16%', right: '8%', '--d': -26, '--t': '-2.5s', '--p': 1 } },
  { who: 'J', text: 'huddle? 🎧', when: '5m', style: { top: '40%', left: '5%', '--d': 34, '--t': '-4s', '--p': 2 } },
  { who: 'R', text: 'Recap: 3 decisions, 1 blocker', when: '9m', style: { top: '37%', right: '4%', '--d': -36, '--t': '-1.2s', '--p': 3 } },
] as const;

interface Props {
  onGetStarted: () => void;
}

// The public site: the home page here, and one page per feature in the nav.
export function Landing({ onGetStarted }: Props) {
  const [route, go] = useRoute();
  // Keyed by route so each page mounts fresh and plays its entrance (site.css: ap-page).
  if (route === 'help') return <HelpPage key="help" go={go} onGetStarted={onGetStarted} signedIn={false} />;
  if (route !== 'home') return <FeaturePage key={route} page={route} go={go} onGetStarted={onGetStarted} />;
  return <Home key="home" go={go} onGetStarted={onGetStarted} />;
}

function Home({ go, onGetStarted }: Props & { go: (r: Route) => void }) {
  const root = useRef<HTMLDivElement>(null);
  useGlow(root);

  useLayoutEffect(() => {
    const scroller = root.current!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      ScrollTrigger.defaults({ scroller });
      if (reduce) return;
      // Entrance: the nav eases in on a soft, non-bouncing curve.
      gsap.from('.ap-nav', { y: -12, opacity: 0, duration: 0.8, ease: ENTER });
      // The statement reads itself in: each word darkens as it scrolls into the middle of the screen.
      gsap.fromTo('.ap-words .w', { opacity: 0.16 }, { opacity: 1, ease: 'none', stagger: 0.1, scrollTrigger: { trigger: '.ap-words h2', start: 'top 80%', end: 'bottom 45%', scrub: 0.6 } });
      gsap.from('.ap-words p', { y: 16, opacity: 0, duration: 0.9, ease: ENTER, scrollTrigger: { trigger: '.ap-words p', start: 'top 90%' } });
      gsap.utils.toArray<HTMLElement>('.ap-reveal').forEach((el) => {
        gsap.from(el, { y: 24, opacity: 0, duration: 0.9, ease: ENTER, scrollTrigger: { trigger: el, start: 'top 90%' } });
      });
    }, root);
    return () => { ctx.revert(); ScrollTrigger.defaults({ scroller: window }); };
  }, []);

  // Hero interaction. Runs after the shelf has mounted its DOM (a child effect), so the title and
  // buttons it renders exist: the backdrop and chips drift with the pointer, a spotlight follows
  // the cursor, the buttons pull toward a nearby cursor, and the video eases back as you scroll.
  useEffect(() => {
    const hero = root.current?.querySelector<HTMLElement>('.ap-hero.hf');
    const scroller = root.current;
    if (!hero || !scroller || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0, px = 0, py = 0;
    const buttons = Array.from(hero.querySelectorAll<HTMLElement>('.fs-act-row > *'));
    const onMove = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      px = e.clientX - r.left; py = e.clientY - r.top;
      for (const b of buttons) {
        const br = b.getBoundingClientRect(), dx = e.clientX - (br.left + br.width / 2), dy = e.clientY - (br.top + br.height / 2);
        const dist = Math.hypot(dx, dy), pull = Math.max(0, 1 - dist / 110);
        b.style.transform = pull ? `translate(${(dx * 0.35 * pull).toFixed(1)}px, ${(dy * 0.35 * pull).toFixed(1)}px)` : '';
      }
    };
    const tick = () => {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      hero.style.setProperty('--mx', cx.toFixed(4)); hero.style.setProperty('--my', cy.toFixed(4));
      hero.style.setProperty('--sx', `${px.toFixed(0)}px`); hero.style.setProperty('--sy', `${py.toFixed(0)}px`);
      raf = requestAnimationFrame(tick);
    };
    hero.addEventListener('pointermove', onMove);
    raf = requestAnimationFrame(tick);
    // Entrances are CSS keyframes (hero.css); only the scroll parallax needs GSAP.
    const ctx = gsap.context(() => {
      gsap.to('.fs-h, .fs-sub, .fs-act-row', { yPercent: 30, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: hero, scroller, start: 'top top', end: 'bottom top', scrub: 0.4 } });
    }, root);
    return () => { hero.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); ctx.revert(); };
  }, []);

  return (
    <div className="ap" ref={root} id="top">
      <div className="ap-stars-wrap" aria-hidden><Aurora /></div>
      <section className="ap-hero hf">
        <div className="ap-sky" aria-hidden />
        <div className="hf-bg" aria-hidden>
          <div className="hf-shade" />
          <div className="hf-spot" />
          <div className="hf-grain" />
        </div>
        <SiteNav route="home" go={go} onGetStarted={onGetStarted} />

        <div className="hf-chips" aria-hidden>
          {CHIPS.map((c) => <span key={c.text} className="hf-chip" style={c.style as React.CSSProperties}><i>{c.who}</i><b>{c.text}</b><small>{c.when}</small></span>)}
        </div>
        <FeatureShelf onGetStarted={onGetStarted} />
      </section>

      <section className="ap-intro ap-words">
        <h2>{words('Everything your team says,')}<br />{words('in one calm place')}</h2>
        <p>Chat, pages and databases side by side, with a teammate that keeps the follow-ups from slipping.</p>
        <Settle />
      </section>

      <section className="ap-intro ap-reveal" id="live">
        <h2>See the workspace work</h2>
        <p>Pages, databases, sharing and search, running the way they do inside Relay.</p>
        <LiveDemo />
      </section>

      <section id="tour" className="ap-tour ap-reveal">
        <Tour steps={STEPS} more={(s) => <RouteLink to={STEPS.find((x) => x.id === s.id)!.page} go={go} className="ap-more">Learn more <Icon n="chevron" size={14} /></RouteLink>} />
      </section>

      <section className="ap-final ap-reveal">
        <div className="ap-cta">
          <h2>Ready when your team is</h2>
          <p>Free to start. Every feature unlocked.</p>
          <div style={{ display: 'inline-block' }}>
            <LightBulbButton onClick={onGetStarted} lightColor="#c4b5fd" buttonColor="#1c1430" substrateColor="#0b0618" height={48}>Get started free</LightBulbButton>
          </div>
        </div>
      </section>

      <SiteFooter go={go} />
    </div>
  );
}

