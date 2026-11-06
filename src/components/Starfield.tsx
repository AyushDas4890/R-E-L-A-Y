// A still backdrop for the public pages: a sparse field of dots joined by hairline threads, drawn once.
// It does not move, glow or react to the pointer. The ink is the canvas's CSS `color`, so the same
// drawing suits a light or a dark page, and it is redrawn when the window is resized.
import { useEffect, useRef } from 'react';

const LINK = 110; // px: dots closer than this get a thread

// A small seeded generator so the pattern is the same on every visit and every resize.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const draw = () => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(getComputedStyle(canvas).color);
      const [r, g, b] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [29, 29, 31];
      const rand = seeded(7);
      const count = Math.round(Math.min(70, Math.max(20, (w * h) / 18000)));
      const dots = Array.from({ length: count }, () => ({ x: rand() * w, y: rand() * h, r: 0.8 + rand() * 0.8 }));
      ctx.lineWidth = 1;
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const d = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
          if (d < LINK) { ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - d / LINK) * 0.12})`; ctx.beginPath(); ctx.moveTo(dots[i].x, dots[i].y); ctx.lineTo(dots[j].x, dots[j].y); ctx.stroke(); }
        }
      }
      ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
      for (const d of dots) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return <canvas ref={ref} className="ap-stars" aria-hidden="true" />;
}
