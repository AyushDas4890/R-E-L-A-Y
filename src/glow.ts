import { useEffect, type RefObject } from 'react';

// Pointer-reactive surfaces for the public pages. Cards matching GLOW get a spotlight that follows
// the cursor (CSS reads --gx/--gy); panels matching TILT lean a few degrees toward it and settle
// back when the pointer leaves. One delegated listener per page, nothing per element.
const GLOW = '.gl, .fp-fact, .hp-card, .hp-hit, .hp-foot, .hp-note, .tr, .st-frame, .ws-group, .ap-cta, .fp-detail-media, .fm-stage, .fm-clip';
const TILT = '.tilt, .fp-film, .ld-frame, .tr-stage, .ap-cta';

export function useGlow(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let tilted: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      const g = t?.closest?.(GLOW) as HTMLElement | null;
      if (g) { const r = g.getBoundingClientRect(); g.style.setProperty('--gx', `${e.clientX - r.left}px`); g.style.setProperty('--gy', `${e.clientY - r.top}px`); }
      const p = t?.closest?.(TILT) as HTMLElement | null;
      if (p !== tilted && tilted) { tilted.style.transform = ''; tilted = null; }
      if (p) {
        const r = p.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
        p.style.transform = `perspective(1400px) rotateY(${(dx * 5).toFixed(2)}deg) rotateX(${(-dy * 5).toFixed(2)}deg)`;
        tilted = p;
      }
    };
    const onLeave = () => { if (tilted) { tilted.style.transform = ''; tilted = null; } };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave); onLeave(); };
  }, [root]);
}
