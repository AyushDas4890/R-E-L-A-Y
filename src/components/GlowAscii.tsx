import { useEffect, useRef } from 'react';

// Glow ASCII: a procedural "Plasma" (or any image/video element) rendered as bold glyphs whose
// brightness carries the picture. One state pass at grid resolution + one full-screen render pass.

const CHARS = '/0#$%&@+=';
const FONT_FAMILY = 'ui-monospace, "SF Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace';
// Red/blue take on the thermal ramp: deep navy, blue, violet, red, hot pink.
const PALETTE = ['#0a0620', '#1d4ed8', '#7c3aed', '#e11d48', '#ff7a9a'];
const CELL_SIZE = 22;
const CELL_ASPECT = 1;
const BANDS = 24;
const THRESHOLD = 0.06;
const GLOW_GAMMA = 0.6;
const STABILITY = 0.5;
const GLYPH_FILL = 0.86;
const MAX_EDGE = 2048;
const FRAME_MS = 1000 / 30;

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const STATE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform sampler2D uPrev;
uniform vec2 uGrid;
uniform float uLod, uResponse, uStab, uBands;
uniform int uReset;
out vec4 o;
void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 uv = (cell + 0.5) / uGrid;
  vec3 c = textureLod(uSrc, uv, uLod).rgb;
  c = clamp((c - 0.5) * 1.3 + 0.5, 0.0, 1.0);
  float grey = dot(c, vec3(0.299, 0.587, 0.114));
  float lum = clamp(pow(grey, 1.0) * 1.2, 0.0, 1.0);
  float acc = c.r;
  float B = uBands - 1.0;
  vec4 p = texelFetch(uPrev, ivec2(cell), 0);
  float ema, held, aema;
  if (uReset == 1) {
    ema = lum; held = floor(lum * B) / B; aema = acc;
  } else {
    ema = mix(p.r, lum, uResponse);
    float want = floor(ema * B) / B;
    held = p.g;
    if (abs(want - held) > 2.5 * uStab / B) held = want;
    aema = mix(p.b, acc, uResponse);
  }
  o = vec4(ema, held, aema, 1.0);
}`;

const RENDER_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform ivec2 uCell;
uniform float uBands, uThreshold, uGamma, uAccentAmt;
uniform vec3 uPal[5];
uniform vec3 uAccent;
out vec4 o;
void main() {
  ivec2 fc = ivec2(floor(gl_FragCoord.xy));
  ivec2 cell = fc / uCell;
  ivec2 sc = min(cell, ivec2(uGrid) - 1);
  vec4 s = texelFetch(uState, sc, 0);
  float tone = s.r;
  int g = int(mod(floor(s.g * (uBands - 1.0) + 0.5), 9.0));
  ivec2 local = fc - cell * uCell;
  float ink = texelFetch(uAtlas, ivec2(g * uCell.x + local.x, uCell.y - 1 - local.y), 0).r;
  float lit = tone < uThreshold ? 0.0 : pow(tone, uGamma);
  int idx = min(int(floor(tone * 5.0)), 4);
  vec3 col = uPal[idx] * lit;
  col = mix(col, uAccent, uAccentAmt * smoothstep(0.4, 0.6, s.b));
  o = vec4(col * ink, 1.0);
}`;

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
  return sh;
}

function program(gl: WebGL2RenderingContext, frag: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

// Rasterise each glyph white on black into a cell-sized slot, fitted so the tallest ink box is 86% of the cell.
function buildAtlas(cellW: number, cellH: number) {
  const probe = document.createElement('canvas').getContext('2d')!;
  const test = 100;
  probe.font = `800 ${test}px ${FONT_FAMILY}`;
  let maxH = 1, maxW = 1;
  for (const ch of CHARS) {
    const m = probe.measureText(ch);
    maxH = Math.max(maxH, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
    maxW = Math.max(maxW, m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
  }
  const px = Math.min((GLYPH_FILL * cellH) / maxH, (0.9 * cellW) / maxW) * test;
  const cv = document.createElement('canvas');
  cv.width = cellW * CHARS.length;
  cv.height = cellH;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${px}px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  [...CHARS].forEach((ch, i) => {
    const m = ctx.measureText(ch);
    const cx = i * cellW + cellW / 2;
    const x = cx - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
    const y = cellH / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    ctx.fillText(ch, x, y);
  });
  return cv;
}

// Procedural plasma drawn at low resolution; the cell box-reduce makes the detail loss invisible.
function drawPlasma(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / h * 6, v = y / h * 6;
      let s = Math.sin(u * 1.1 + t * 0.7) + Math.sin(v * 1.3 - t * 0.55);
      s += Math.sin((u + v) * 0.8 + t * 0.4);
      s += Math.sin(Math.hypot(u - 4 + Math.sin(t * 0.3) * 2, v - 3 + Math.cos(t * 0.35) * 2) * 1.4 - t * 0.9);
      const n = Math.pow(Math.min(1, Math.max(0, (s + 4) / 8)), 1.6);
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.round(n * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

interface Props {
  className?: string;
  /** Optional photo or video element; defaults to a procedural plasma. */
  source?: HTMLImageElement | HTMLVideoElement | null;
}

export function GlowAscii({ className, source }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    const host = box.current!;
    // A fresh canvas per mount: a context lost in cleanup can't be revived on the same element (StrictMode remounts).
    const cv = document.createElement('canvas');
    cv.style.cssText = 'width:100%;height:100%;display:block';
    host.appendChild(cv);
    const gl = cv.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) { cv.remove(); return; }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let stateProg: WebGLProgram, renderProg: WebGLProgram;
    try {
      stateProg = program(gl, STATE_FRAG);
      renderProg = program(gl, RENDER_FRAG);
    } catch (e) {
      console.warn('GlowAscii shader failed', e);
      cv.remove();
      return;
    }
    const floatOk = !!gl.getExtension('EXT_color_buffer_float');
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const tex = (filter: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const srcTex = tex(gl.LINEAR_MIPMAP_LINEAR);
    const atlasTex = tex(gl.NEAREST);

    const offscreen = document.createElement('canvas');
    const off = offscreen.getContext('2d')!;
    const plasma = document.createElement('canvas');
    const pctx = plasma.getContext('2d')!;

    let W = 0, H = 0, cellW = 4, cellH = 4, GW = 1, GH = 1;
    let states: { tex: WebGLTexture; fbo: WebGLFramebuffer }[] = [];
    let flip = 0;
    let reset = true;

    const makeState = () => {
      states.forEach((s) => { gl.deleteTexture(s.tex); gl.deleteFramebuffer(s.fbo); });
      states = [0, 1].map(() => {
        const t = tex(gl.NEAREST);
        if (floatOk) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, GW, GH, 0, gl.RGBA, gl.HALF_FLOAT, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        return { tex: t, fbo };
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      reset = true;
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      let w = host.clientWidth * dpr, h = host.clientHeight * dpr;
      if (w < 2 || h < 2) return;
      const k = Math.min(1, MAX_EDGE / Math.max(w, h));
      w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
      if (w === W && h === H) return;
      W = w; H = h;
      cv.width = W; cv.height = H;
      offscreen.width = W; offscreen.height = H;
      const ref = Math.min(W, H) / 1080;
      cellW = Math.max(Math.round(CELL_SIZE * ref), 4);
      cellH = Math.max(Math.round(cellW * CELL_ASPECT), 4);
      GW = Math.max(1, Math.floor(W / cellW)); GH = Math.max(1, Math.floor(H / cellH));
      plasma.width = 160; plasma.height = Math.max(8, Math.round(160 * H / W));
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildAtlas(cellW, cellH));
      makeState();
    };

    const drawSource = (t: number) => {
      off.imageSmoothingEnabled = true;
      off.imageSmoothingQuality = 'high';
      const el = sourceRef.current;
      const sw = el instanceof HTMLVideoElement ? el.videoWidth : el?.naturalWidth;
      const sh = el instanceof HTMLVideoElement ? el.videoHeight : el?.naturalHeight;
      if (el && sw && sh) {
        const s = Math.max(W / sw, H / sh);
        off.drawImage(el, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
      } else {
        drawPlasma(pctx, plasma.width, plasma.height, t);
        off.drawImage(plasma, 0, 0, W, H);
      }
    };

    const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
    const pal = new Float32Array(PALETTE.flatMap(hex));

    const draw = (t: number) => {
      if (!W) return;
      drawSource(t);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);
      gl.generateMipmap(gl.TEXTURE_2D);

      const prev = states[flip], next = states[1 - flip];
      gl.bindFramebuffer(gl.FRAMEBUFFER, next.fbo);
      gl.viewport(0, 0, GW, GH);
      gl.useProgram(stateProg);
      gl.uniform1i(u(stateProg, 'uSrc'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, prev.tex);
      gl.uniform1i(u(stateProg, 'uPrev'), 1);
      gl.uniform2f(u(stateProg, 'uGrid'), GW, GH);
      gl.uniform1f(u(stateProg, 'uLod'), Math.max(0, Math.log2(cellW)));
      gl.uniform1f(u(stateProg, 'uResponse'), 1 - 0.85 * STABILITY);
      gl.uniform1f(u(stateProg, 'uStab'), STABILITY);
      gl.uniform1f(u(stateProg, 'uBands'), BANDS);
      gl.uniform1i(u(stateProg, 'uReset'), reset ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      reset = false;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(renderProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, next.tex);
      gl.uniform1i(u(renderProg, 'uState'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(u(renderProg, 'uAtlas'), 1);
      gl.uniform2f(u(renderProg, 'uGrid'), GW, GH);
      gl.uniform2i(u(renderProg, 'uCell'), cellW, cellH);
      gl.uniform1f(u(renderProg, 'uBands'), BANDS);
      gl.uniform1f(u(renderProg, 'uThreshold'), THRESHOLD);
      gl.uniform1f(u(renderProg, 'uGamma'), GLOW_GAMMA);
      gl.uniform1f(u(renderProg, 'uAccentAmt'), 0);
      gl.uniform3f(u(renderProg, 'uAccent'), ...hex('#23faad'));
      gl.uniform3fv(u(renderProg, 'uPal'), pal);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      flip = 1 - flip;
    };

    resize();
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(0); });
    ro.observe(host);

    let raf = 0, last = 0;
    const start = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < FRAME_MS) return;
      last = now;
      draw((now - start) / 1000);
    };
    if (reduce) draw(0); else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      cv.remove();
    };
  }, []);

  return (
    <div ref={box} className={className} style={{ position: 'absolute', inset: 0 }} aria-hidden />
  );
}
