import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { gsap } from 'gsap';
import { Icon } from './Icon.tsx';
import { ENTER, EXIT, T, typeText, setText } from '../motion.ts';

// Motion-graphic "films" of the product. Each film is a mock of the real UI drawn on a fixed
// 960x560 canvas and a GSAP timeline with one label per chapter ('c0', 'c1', …). The same
// markup and timeline drive the full player (all chapters, with controls) and short clips
// (one chapter on a loop), so a page explains a feature once and then zooms into each step.

export interface Chapter { title: string; text: string }
export type Build = (q: (selector: string) => Element[]) => gsap.core.Timeline;

const CANVAS_W = 960;
const CANVAS_H = 560;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scales the fixed canvas to the width of its frame.
function Canvas({ children }: { children: ReactNode }) {
  const fit = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = fit.current!;
    const size = () => el.style.setProperty('--s', String(el.clientWidth / CANVAS_W));
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="fm-fit" ref={fit} style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}>
      <div className="fm-canvas" style={{ width: CANVAS_W, height: CANVAS_H }}>{children}</div>
    </div>
  );
}

const chapterBounds = (tl: gsap.core.Timeline, i: number, count: number): [number, number] => [
  tl.labels[`c${i}`] ?? 0,
  i + 1 < count ? tl.labels[`c${i + 1}`] : tl.duration(),
];

// Plays while on screen, pauses when scrolled away; a pause from the viewer sticks.
function useInView(el: RefObject<HTMLElement | null>, onChange: (visible: boolean) => void) {
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => onChange(e.isIntersecting), { threshold: 0.35 });
    io.observe(el.current!);
    return () => io.disconnect();
    // onChange reads refs only, so the observer is set up once.
  }, []);
}

export function Film({ chapters, build, label, children }: { chapters: Chapter[]; build: Build; label: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const heldByViewer = useRef(false);
  const visible = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [chap, setChap] = useState(0);

  useLayoutEffect(() => {
    const el = root.current!;
    const fills = el.querySelectorAll<HTMLElement>('.fm-chap i');
    const ctx = gsap.context(() => {
      const t = build(gsap.utils.selector(el.querySelector('.fm-canvas')));
      // Render once to the end and back so the opening frame shows before the film plays.
      t.pause().progress(1).progress(0);
      let last = -1;
      t.eventCallback('onUpdate', () => {
        const now = t.time();
        chapters.forEach((_, i) => {
          const [a, b] = chapterBounds(t, i, chapters.length);
          const p = Math.min(1, Math.max(0, (now - a) / (b - a)));
          fills[i]?.style.setProperty('transform', `scaleX(${p})`);
          if (now >= a && now < b && i !== last) { last = i; setChap(i); }
        });
      });
      // The last frame fades out, the film resets while invisible, and the first frame fades back in.
      const canvas = el.querySelector('.fm-canvas');
      t.eventCallback('onComplete', () => {
        gsap.to(canvas, { autoAlpha: 0, duration: T.reset, ease: EXIT, delay: 1.2, onComplete: () => {
          t.pause(0);
          gsap.to(canvas, { autoAlpha: 1, duration: T.reset, ease: ENTER, delay: 0.2, onComplete: () => { if (!heldByViewer.current && visible.current) t.play(); else setPlaying(false); } });
        } });
      });
      tl.current = t;
      (el as HTMLElement & { _tl?: gsap.core.Timeline })._tl = t; // console handle for checking frames
      // Reduced motion: no autoplay; show the first chapter's finished frame.
      if (reduceMotion()) t.seek(chapterBounds(t, 0, chapters.length)[1] - 0.01);
    }, el);
    return () => ctx.revert();
  }, [build, chapters]);

  useInView(root, (v) => {
    visible.current = v;
    const t = tl.current;
    if (!t || heldByViewer.current || reduceMotion()) return;
    if (v) t.play(); else t.pause();
    setPlaying(v);
  });

  const toggle = () => {
    const t = tl.current!;
    // Stopping or starting always cancels a reset fade, so the frame on screen is the real one.
    const canvas = root.current!.querySelector('.fm-canvas');
    gsap.killTweensOf(canvas);
    gsap.set(canvas, { autoAlpha: 1 });
    if (playing) { t.pause(); heldByViewer.current = true; setPlaying(false); return; }
    heldByViewer.current = false;
    if (t.progress() === 1) t.restart(); else t.play();
    setPlaying(true);
  };
  const jump = (i: number) => {
    const t = tl.current!;
    // Cancel a reset fade in progress so the chosen chapter is visible at once.
    const canvas = root.current!.querySelector('.fm-canvas');
    gsap.killTweensOf(canvas);
    gsap.set(canvas, { autoAlpha: 1 });
    heldByViewer.current = false;
    t.seek(`c${i}`).play();
    setPlaying(true);
  };

  return (
    <figure className="fm-film" ref={root} aria-label={label}>
      <div className="fm-stage"><Canvas>{children}</Canvas></div>
      <figcaption className="fm-controls">
        <button className="fm-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
            : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 1.5v11l9.5-5.5z" fill="currentColor" /></svg>}
        </button>
        <ol className="fm-chaps">
          {chapters.map((c, i) => (
            <li key={c.title}>
              <button className={`fm-chap ${i === chap ? 'on' : ''}`} onClick={() => jump(i)}>
                <span className="fm-bar"><i /></span>
                <span className="fm-chap-title">{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </figcaption>
      <p className="fm-caption" aria-live="polite"><b>{chapters[chap].title}.</b> {chapters[chap].text}</p>
    </figure>
  );
}

// One chapter of a film on a loop, for the detail sections under the player.
export function Clip({ build, chapter, count, children }: { build: Build; chapter: number; count: number; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const loop = useRef<gsap.core.Tween | null>(null);
  useLayoutEffect(() => {
    const el = root.current!;
    const ctx = gsap.context(() => {
      const t = build(gsap.utils.selector(el.querySelector('.fm-canvas')));
      t.pause().progress(1).progress(0);
      const [a, b] = chapterBounds(t, chapter, count);
      if (reduceMotion()) { t.seek(b - 0.01); return; }
      // One chapter, then a fade to its first frame and again.
      const canvas = el.querySelector('.fm-canvas');
      const pass = (): gsap.core.Tween => t.tweenFromTo(a, b - 0.01, { paused: true, ease: 'none', onComplete: () => {
        loop.current = gsap.to(canvas, { autoAlpha: 0, duration: T.reset, ease: EXIT, delay: 1.2, onComplete: () => {
          t.seek(a);
          loop.current = gsap.to(canvas, { autoAlpha: 1, duration: T.reset, ease: ENTER, delay: 0.2, onComplete: () => { loop.current = pass(); loop.current.play(); } });
        } });
      } });
      t.seek(a);
      loop.current = pass();
    }, el);
    return () => ctx.revert();
  }, [build, chapter, count]);
  useInView(root, (v) => { if (v) loop.current?.play(); else loop.current?.pause(); });
  return <div className="fm-clip" ref={root} aria-hidden><Canvas>{children}</Canvas></div>;
}

// ---- Mock UI kit: small pieces of Relay's own interface, drawn at canvas scale. ----

export const Av = ({ c, l, className = '' }: { c: string; l: string; className?: string }) => (
  <i className={`fm-av ${className}`} style={{ background: c }}>{l}</i>
);

export function Msg({ who, c, l, text, className = '', children }: { who: string; c: string; l: string; text?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={`fm-msg ${className}`}>
      <Av c={c} l={l} />
      <div><b>{who}</b>{text !== undefined && <p>{text}</p>}{children}</div>
    </div>
  );
}

export function Bot({ text, className = '', children }: { text?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={`fm-msg bot ${className}`}>
      <i className="fm-av bot"><Icon n="zap" size={14} /></i>
      <div><b>Relay Bot <em>app</em></b>{text !== undefined && <p>{text}</p>}{children}</div>
    </div>
  );
}

export const Cursor = () => (
  <svg className="fm-cursor mo-cursor" width="20" height="22" viewBox="0 0 18 20" aria-hidden>
    <path d="M2 1.5v14.2l3.9-3.5 2.7 6.1 2.6-1.1-2.6-6h5.6z" fill="#1d1d1f" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

// The app window every film is staged in: title bar, sidebar, channel header.
export function Win({ channel, topic, actions, children, side = true }: { channel: string; topic?: string; actions?: ReactNode; children: ReactNode; side?: boolean }) {
  return (
    <div className="fm-win">
      <div className="fm-win-bar"><i /><i /><i /><span>Relay</span></div>
      <div className={`fm-win-body ${side ? '' : 'no-side'}`}>
        {side && (
          <aside className="fm-side">
            <b>Flo Studios</b>
            {['launch', 'design', 'general', 'incidents'].map((c) => <span key={c} className={`fm-side-ch ${c === channel ? 'on' : ''}`} data-ch={c}># {c}</span>)}
            <em>Direct messages</em>
            <span><Av c="#c8705a" l="M" className="sm" />Maya</span>
            <span><Av c="#3c9a8f" l="K" className="sm" />Ken</span>
            <span><Av c="#7d68c4" l="P" className="sm" />Priya</span>
          </aside>
        )}
        <section className="fm-main">
          <header className="fm-head"><div><b># {channel}</b>{topic && <small>{topic}</small>}</div><div className="fm-head-actions">{actions}</div></header>
          {children}
        </section>
      </div>
    </div>
  );
}

// Typed text and cleared drafts, rendered by the timeline so scrubbing and chapter jumps stay correct.
export const typeInto = (tl: gsap.core.Timeline, el: Element | undefined, text: string, at: number | string, duration = text.length * 0.045) => typeText(tl, el, text, at, duration);
export const eraseText = (tl: gsap.core.Timeline, el: Element | undefined, text: string, at: number | string) => setText(tl, el, text, '', at);
