import { LiveStarfield } from './LiveStarfield.tsx';
import { useLayoutEffect, useRef } from 'react';
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
import ScrollZoomReveal from './framer/ScrollZoomReveal.tsx';
import LightBulbButton from './framer/LightBulbButton.tsx';
import '../tour.css';
import '../apple.css';

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

  return (
    <div className="ap" ref={root} id="top">
      <div className="ap-stars-wrap" aria-hidden><LiveStarfield /></div>
      <section className="ap-hero">
        <div className="ap-sky" aria-hidden />
        <SiteNav route="home" go={go} onGetStarted={onGetStarted} />

        <FeatureShelf onGetStarted={onGetStarted} />
      </section>

      <section className="ap-intro ap-words">
        <h2>{words('Everything your team says,')}<br />{words('in one calm place')}</h2>
        <p>Chat, pages and databases side by side, with a teammate that keeps the follow-ups from slipping.</p>
        <Settle />
      </section>

      <section className="ap-zoom-section" id="zoom-reveal" style={{ position: 'relative', overflow: 'hidden' }}>
        <ScrollZoomReveal
          leftText="One calm place"
          rightText="See it work"
          buttonText="Enter Workspace"
          buttonLink="#live"
          textColor="#ece8f3"
          buttonTextColor="#10233f"
          buttonBgColor="#f5a400"
          iconType="play"
          image={{
            src: '/bg/silver-line-waves.jpg',
            alt: 'Relay workspace preview',
          }}
          scrollDistance="220vh"
          onButtonClick={() => {
            const el = document.getElementById('live');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
        />
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
        <h2>Ready when your team is</h2>
        <p>Free to start. Every feature unlocked.</p>
        <div style={{ display: 'inline-block', marginTop: 12 }}>
          <LightBulbButton onClick={onGetStarted} lightColor="#b3ff00" height={48}>Get started free</LightBulbButton>
        </div>
      </section>

      <SiteFooter go={go} />
    </div>
  );
}

