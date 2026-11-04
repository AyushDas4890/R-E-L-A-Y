// The living backdrop of Home: every workspace you belong to is a glowing node in a drifting constellation.
// Small "relay" packets hop between the nodes, the field leans away from your cursor, and clicking a node
// takes you into that workspace. Drag a node to put it where you like (it remembers), click empty space to
// send out a ripple. It is decoration with one shortcut, so it is hidden from assistive tech (the sidebar
// has the real buttons) and it freezes into a still picture when motion is reduced.
import { useEffect, useRef } from 'react';
import type { WorkspaceSummary } from '../types.ts';
import { wsInitials } from './Workspaces.tsx';

type RGB = [number, number, number];

function parseColor(c: string, fallback: RGB): RGB {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : fallback;
}
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

interface Dot { x: number; y: number; vx: number; vy: number; r: number }
interface Node { ws: WorkspaceSummary; col: RGB; ax: number; ay: number; x: number; y: number; ox: number; oy: number; r: number; phase: number; orbit: number; hover: number }
interface Packet { from: number; to: number; t: number; speed: number }
interface Ripple { x: number; y: number; t: number; col: RGB }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; col: RGB }

// Where you left each node, as fractions of the stage, so the layout survives a reload and a resize.
const POS_KEY = 'relay.constellation';
const loadPositions = (): Record<string, [number, number]> => {
  try { const v: unknown = JSON.parse(localStorage.getItem(POS_KEY) ?? '{}'); return v && typeof v === 'object' ? (v as Record<string, [number, number]>) : {}; } catch { return {}; }
};
const savePosition = (id: string, fx: number, fy: number) => {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ ...loadPositions(), [id]: [fx, fy] })); } catch { /* storage blocked: the move just won't stick */ }
};

export function Constellation({ mine, onEnter }: { mine: WorkspaceSummary[]; onEnter: (id: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const enter = useRef(onEnter);
  enter.current = onEnter;
  // Rebuild only when the set of workspaces really changes, not on every parent render.
  const key = mine.map((w) => `${w.id}|${w.name}|${w.color}|${w.members}`).join(';');

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0, raf = 0, hovered = -1;
    const mouse = { x: -9999, y: -9999, on: false };
    let ink: RGB = [235, 235, 245];
    let dots: Dot[] = [];
    let nodes: Node[] = [];
    let packets: Packet[] = [];
    let ripples: Ripple[] = [];
    let sparks: Spark[] = [];
    let drag: { i: number; dx: number; dy: number; sx: number; sy: number; moved: boolean; tx: number; ty: number } | null = null;

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ink = parseColor(getComputedStyle(canvas).color, ink);
      const count = Math.round(Math.min(90, Math.max(28, (w * h) / 14000)));
      dots = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, r: 0.8 + Math.random() * 1.4 }));
      // Nodes sit on a gentle arc through the lower right, away from the notes at the top left.
      const n = mine.length;
      nodes = mine.map((ws, i) => {
        const f = n === 1 ? 0.5 : i / (n - 1);
        const wide = w > 700;
        const ax = wide ? w * (0.42 + 0.46 * f) : w * (0.2 + 0.6 * f);
        const ay = wide ? h * (0.78 - 0.34 * Math.sin(f * Math.PI) * (i % 2 ? 0.6 : 1)) : h * (0.72 - 0.18 * Math.sin(f * Math.PI) + (i % 2 ? 0.1 : 0));
        const kept = loadPositions()[ws.id];
        const px = kept ? Math.min(Math.max(kept[0] * w, 40), w - 40) : ax;
        const py = kept ? Math.min(Math.max(kept[1] * h, 40), h - 40) : ay;
        return { ws, col: parseColor(ws.color, [106, 167, 255]), ax: px, ay: py, x: px, y: py, ox: 0, oy: 0, r: 26 + Math.min(14, ws.members * 1.2), phase: i * 2.1, orbit: 14 + (i % 3) * 7, hover: 0 };
      });
      packets = [];
    };

    const spawnPacket = () => {
      if (nodes.length < 2 || packets.length > 5) return;
      const from = Math.floor(Math.random() * nodes.length);
      let to = Math.floor(Math.random() * nodes.length);
      if (to === from) to = (to + 1) % nodes.length;
      packets.push({ from, to, t: 0, speed: 0.004 + Math.random() * 0.004 });
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h);
      const sec = time / 1000;

      // Nodes drift on small orbits around their anchors.
      nodes.forEach((nd, i) => {
        const held = drag?.i === i;
        if (held && drag) { nd.ax += (drag.tx - nd.ax) * 0.4; nd.ay += (drag.ty - nd.ay) * 0.4; }
        if (!still) {
          // The orbit eases out while a node is held and back in when it is let go, so it never jumps.
          const tx = held ? 0 : Math.cos(sec * 0.35 + nd.phase) * nd.orbit, ty = held ? 0 : Math.sin(sec * 0.28 + nd.phase * 1.3) * nd.orbit * 0.7;
          nd.ox += (tx - nd.ox) * 0.1; nd.oy += (ty - nd.oy) * 0.1;
        }
        nd.x = nd.ax + nd.ox; nd.y = nd.ay + nd.oy;
        const d = Math.hypot(mouse.x - nd.x, mouse.y - nd.y);
        const target = held || (!drag && mouse.on && d < nd.r + 8) ? 1 : 0;
        nd.hover += (target - nd.hover) * 0.18;
        if (target && hovered !== i) hovered = i;
      });
      if (hovered >= 0 && nodes[hovered] && nodes[hovered].hover < 0.02 && !(mouse.on && Math.hypot(mouse.x - nodes[hovered].x, mouse.y - nodes[hovered].y) < nodes[hovered].r + 8)) hovered = -1;
      canvas.style.cursor = drag ? 'grabbing' : hovered >= 0 ? 'grab' : '';

      // Ambient dots: drift, lean away from the cursor, link to close neighbours.
      for (const d of dots) {
        if (!still) {
          const dx = d.x - mouse.x, dy = d.y - mouse.y, dist = Math.hypot(dx, dy);
          if (mouse.on && dist < 130 && dist > 0.1) { const f = (1 - dist / 130) * 0.9; d.vx += (dx / dist) * f * 0.12; d.vy += (dy / dist) * f * 0.12; }
          d.vx *= 0.985; d.vy *= 0.985;
          d.x += d.vx; d.y += d.vy;
          if (d.x < -10) d.x = w + 10; else if (d.x > w + 10) d.x = -10;
          if (d.y < -10) d.y = h + 10; else if (d.y > h + 10) d.y = -10;
        }
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dist = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
          if (dist < 110) { ctx.strokeStyle = rgba(ink, (1 - dist / 110) * 0.2); ctx.beginPath(); ctx.moveTo(dots[i].x, dots[i].y); ctx.lineTo(dots[j].x, dots[j].y); ctx.stroke(); }
        }
      }
      for (const d of dots) { ctx.fillStyle = rgba(ink, 0.5); ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }

      // Threads between workspaces, and the packets that travel along them.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          g.addColorStop(0, rgba(a.col, 0.4)); g.addColorStop(1, rgba(b.col, 0.4));
          ctx.strokeStyle = g; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      if (!still) {
        if (Math.random() < 0.012) spawnPacket();
        packets = packets.filter((p) => (p.t += p.speed) < 1);
        for (const p of packets) {
          const a = nodes[p.from], b = nodes[p.to];
          if (!a || !b) continue;
          const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
          const col: RGB = [a.col[0] + (b.col[0] - a.col[0]) * p.t, a.col[1] + (b.col[1] - a.col[1]) * p.t, a.col[2] + (b.col[2] - a.col[2]) * p.t].map(Math.round) as RGB;
          const glow = ctx.createRadialGradient(x, y, 0, x, y, 12);
          glow.addColorStop(0, rgba(col, 0.9)); glow.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        }
      }

      // The workspace nodes themselves: halo, breathing ring, disc, initials.
      nodes.forEach((nd) => {
        const pulse = still ? 0 : (Math.sin(sec * 1.4 + nd.phase) + 1) / 2;
        const R = nd.r + nd.hover * 6;
        const halo = ctx.createRadialGradient(nd.x, nd.y, R * 0.5, nd.x, nd.y, R * (2.6 + nd.hover * 0.8));
        halo.addColorStop(0, rgba(nd.col, 0.34 + nd.hover * 0.2)); halo.addColorStop(1, rgba(nd.col, 0));
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(nd.x, nd.y, R * (2.6 + nd.hover * 0.8), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(nd.col, 0.45 - pulse * 0.3); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(nd.x, nd.y, R + 7 + pulse * 7, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = rgba(nd.col, 1); ctx.beginPath(); ctx.arc(nd.x, nd.y, R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = `700 ${Math.round(R * 0.62)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(wsInitials(nd.ws.name), nd.x, nd.y + 1);
      });

      // Ripples and sparks from clicks and drops.
      ripples = ripples.filter((r) => (r.t += 0.018) < 1);
      for (const r of ripples) { ctx.strokeStyle = rgba(r.col, (1 - r.t) * 0.7); ctx.lineWidth = 2 * (1 - r.t) + 0.5; ctx.beginPath(); ctx.arc(r.x, r.y, 8 + r.t * 150, 0, Math.PI * 2); ctx.stroke(); }
      sparks = sparks.filter((sp) => (sp.life -= 0.02) > 0);
      for (const sp of sparks) { sp.x += sp.vx; sp.y += sp.vy; sp.vx *= 0.96; sp.vy *= 0.96; ctx.fillStyle = rgba(sp.col, Math.max(0, sp.life)); ctx.beginPath(); ctx.arc(sp.x, sp.y, 2.2 * sp.life + 0.4, 0, Math.PI * 2); ctx.fill(); }

      // Name tag for the node under the cursor (not while it is being moved).
      if (hovered >= 0 && nodes[hovered] && !drag) {
        const nd = nodes[hovered];
        const title = nd.ws.name, sub = `${nd.ws.members} member${nd.ws.members === 1 ? '' : 's'} · click to enter · drag to move`;
        ctx.font = '600 14px system-ui, sans-serif';
        const tw = Math.max(ctx.measureText(title).width, (ctx.font = '12px system-ui, sans-serif', ctx.measureText(sub).width));
        const bw = tw + 24, bh = 46;
        const bx = Math.min(Math.max(nd.x - bw / 2, 8), w - bw - 8), by = nd.y - nd.r - bh - 18 < 8 ? nd.y + nd.r + 18 : nd.y - nd.r - bh - 18;
        ctx.fillStyle = 'rgba(20,20,26,0.92)'; ctx.strokeStyle = rgba(nd.col, 0.8); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill(); ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#fff'; ctx.font = '600 14px system-ui, sans-serif'; ctx.fillText(title, bx + 12, by + 20);
        ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = '12px system-ui, sans-serif'; ctx.fillText(sub, bx + 12, by + 37);
      }
    };

    const frame = (t: number) => { draw(t); raf = requestAnimationFrame(frame); };
    layout();
    if (still) draw(0); else raf = requestAnimationFrame(frame);

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      mouse.on = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= r.width && mouse.y <= r.height;
      if (still) draw(0);
    };
    const onLeave = () => { mouse.on = false; mouse.x = mouse.y = -9999; if (still) draw(0); };
    const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const nodeAt = (x: number, y: number) => {
      let best = -1, bestD = Infinity;
      nodes.forEach((nd, i) => { const d = Math.hypot(x - nd.x, y - nd.y); if (d < nd.r + 8 && d < bestD) { best = i; bestD = d; } });
      return best;
    };
    // Empty space: a ripple that shoves the dots outward and throws a few sparks.
    const burst = (x: number, y: number, col: RGB = ink) => {
      ripples.push({ x, y, t: 0, col });
      for (const d of dots) {
        const dx = d.x - x, dy = d.y - y, dist = Math.hypot(dx, dy);
        if (dist < 190 && dist > 0.1) { const f = (1 - dist / 190) * 2.4; d.vx += (dx / dist) * f; d.vy += (dy / dist) * f; }
      }
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + Math.random() * 0.5, v = 1.2 + Math.random() * 2.2; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, col }); }
      if (still) draw(0);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const p = local(e);
      mouse.x = p.x; mouse.y = p.y; mouse.on = true;
      const i = nodeAt(p.x, p.y);
      if (i < 0) { burst(p.x, p.y); return; }
      drag = { i, dx: nodes[i].ax - p.x, dy: nodes[i].ay - p.y, sx: p.x, sy: p.y, moved: false, tx: nodes[i].ax, ty: nodes[i].ay };
      canvas.setPointerCapture(e.pointerId);
    };
    const onDrag = (e: PointerEvent) => {
      if (!drag) return;
      const p = local(e), nd = nodes[drag.i];
      if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 5) drag.moved = true;
      drag.tx = Math.min(Math.max(p.x + drag.dx, nd.r + 6), w - nd.r - 6);
      drag.ty = Math.min(Math.max(p.y + drag.dy, nd.r + 6), h - nd.r - 6);
      if (still) { nd.ax = drag.tx; nd.ay = drag.ty; draw(0); }
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      const d = drag, nd = nodes[d.i];
      drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!d.moved) { enter.current(nd.ws.id); return; }
      nd.ax = d.tx; nd.ay = d.ty;
      savePosition(nd.ws.id, nd.ax / w, nd.ay / h);
      burst(nd.ax, nd.ay, nd.col);
      // Dropped: a packet goes out to every other workspace.
      nodes.forEach((_, j) => { if (j !== d.i && packets.length < 8) packets.push({ from: d.i, to: j, t: 0, speed: 0.012 }); });
    };
    const ro = new ResizeObserver(() => { layout(); if (still) draw(0); });
    ro.observe(canvas);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointermove', onDrag);
    document.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointermove', onDrag);
      document.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <canvas ref={ref} className="hs-constellation" aria-hidden="true" />;
}
