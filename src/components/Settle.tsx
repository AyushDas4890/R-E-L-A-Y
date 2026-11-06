import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ENTER, reduceMotion } from '../motion.ts';
import { Icon, type IconName } from './Icon.tsx';
import '../settle.css';

// "One calm place", drawn: the things a team juggles start scattered and tilted, then drift into
// a single tidy channel when scrolled into view. Only transform and opacity move.
const THINGS: { label: string; icon: IconName; x: number; y: number; r: number }[] = [
  { label: 'Messages', icon: 'message', x: -240, y: -150, r: -14 },
  { label: 'Pages', icon: 'file', x: 120, y: -190, r: 11 },
  { label: 'Databases', icon: 'database', x: 300, y: -90, r: -9 },
  { label: 'Huddles', icon: 'headphones', x: -330, y: -40, r: 16 },
  { label: 'Reminders', icon: 'clock', x: 60, y: -120, r: -18 },
  { label: 'Files', icon: 'paperclip', x: -120, y: -210, r: 8 },
  { label: 'Workflows', icon: 'zap', x: 340, y: -180, r: 13 },
  { label: 'Search', icon: 'search', x: -40, y: -80, r: -7 },
];

export function Settle() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || reduceMotion()) return;
    const chips = el.querySelectorAll<HTMLElement>('.st-chip');
    const frame = el.querySelector<HTMLElement>('.st-frame');
    // Start scattered; the frame is faint until the things arrive.
    chips.forEach((c, i) => gsap.set(c, { x: THINGS[i].x, y: THINGS[i].y, rotate: THINGS[i].r, autoAlpha: 0 }));
    gsap.set(frame, { opacity: 0.35 });
    let played = false;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || played) return;
      played = true;
      const tl = gsap.timeline();
      tl.to(chips, { autoAlpha: 1, duration: 0.3, stagger: 0.05 }, 0)
        .to(chips, { x: 0, y: 0, rotate: 0, duration: 1.1, ease: ENTER, stagger: 0.09 }, 0.15)
        .to(frame, { opacity: 1, duration: 0.6, ease: ENTER }, 0.9);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); gsap.killTweensOf([...chips, frame]); gsap.set([...chips, frame], { clearProps: 'all' }); };
  }, []);

  return (
    <div className="st" ref={root} aria-label="Messages, pages, databases, huddles, reminders, files, workflows and search, all in one channel">
      <div className="st-frame">
        <div className="st-bar"><span className="st-hash">#</span> everything <em>one place, no tab hopping</em></div>
        <div className="st-row">
          {THINGS.map((t) => (
            <span key={t.label} className="st-chip"><Icon n={t.icon} size={16} />{t.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
