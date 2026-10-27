import { useEffect, useRef } from 'react';

// Real-time pinned holographic cloth (WebGL 1, Verlet + distance constraints). The visitor can grab
// and drag it in 3D. Adds `no-cloth` to the host element when WebGL or the image is unavailable.

export const CLOTH_IMAGE = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/9212999e-7a4a-4f70-bc34-e4e1c4533b81.jpg';

const S = {
  size: 0.9, aspect: 1.12, spread: 0.98, pinRoll: 5.5, flutter: 0.35, damping: 0.3, stiffness: 0.6,
  crumple: 0.55, grabRadius: 0.12, carryRadius: 0.2, gravity: 2.6, tilt: -10, turn: -12, perspective: 0.45,
  maxSpeed: 12, steps: 8,
};
const COLS = 46, ROWS = 42, N = COLS * ROWS;
const CH = S.size, CW = S.size * S.aspect;
const D2R = Math.PI / 180;
const CAM = Math.exp(Math.log(18) * (1 - S.perspective) + Math.log(1.7) * S.perspective);
const t = S.tilt * D2R, r = S.turn * D2R;
const R0 = [Math.cos(r), 0, Math.sin(r)];
const R1 = [Math.sin(t) * Math.sin(r), Math.cos(t), -Math.sin(t) * Math.cos(r)];
const R2 = [-Math.cos(t) * Math.sin(r), Math.sin(t), Math.cos(t) * Math.cos(r)];

const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv;
uniform vec3 uR0, uR1, uR2; uniform float uCam, uZoom, uAsp; uniform vec2 uC;
varying vec3 vN; varying vec3 vQ; varying vec2 vUv;
void main() {
  vec3 q = vec3(dot(uR0, aPos), dot(uR1, aPos), dot(uR2, aPos));
  float s = uCam / max(uCam - q.z, 0.001);
  vec2 sc = q.xy * s * uZoom;
  gl_Position = vec4(2.0 * (uC.x + sc.x / uAsp) - 1.0, 1.0 - 2.0 * (uC.y - sc.y), -q.z * 0.5, 1.0);
  vN = vec3(dot(uR0, aNor), dot(uR1, aNor), dot(uR2, aNor));
  vQ = q; vUv = aUv;
}`;

const FS_CLOTH = `
precision highp float;
varying vec3 vN; varying vec3 vQ; varying vec2 vUv;
uniform sampler2D uTex; uniform float uLoaded, uCam;
const vec3 KEY = vec3(-0.42, 0.45, 0.79);
float box(vec3 d, vec3 c, vec2 h, float soft) {
  float a = dot(d, c); if (a <= 0.0) return 0.0;
  vec3 up = abs(c.y) > 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 T = normalize(cross(up, c)); vec3 B = cross(c, T);
  vec2 l = vec2(dot(d, T), dot(d, B)) / a;
  vec2 e = (abs(l) - h) / soft;
  return (1.0 - smoothstep(-0.5, 0.5, e.x)) * (1.0 - smoothstep(-0.5, 0.5, e.y));
}
vec3 rainbow(float p) { return clamp(vec3(0.74, 0.58, 0.96) + vec3(0.26, 0.24, 0.10) * cos(6.2831853 * (p + vec3(0.0, 0.28, 0.62))), 0.0, 1.0); }
void main() {
  vec3 n = normalize(vN); bool back = n.z < 0.0; if (back) n = -n;
  vec3 V = normalize(vec3(0.0, 0.0, uCam) - vQ);
  vec3 Rf = reflect(-V, n); vec3 K = normalize(KEY);
  float nv = clamp(dot(n, V), 0.0, 1.0); float nl = max(dot(n, K), 0.0);
  vec3 print = uLoaded > 0.5 ? pow(texture2D(uTex, vUv).rgb, vec3(2.2)) : vec3(0.10, 0.02, 0.32);
  float shade = 0.46 + 0.68 * nl + 0.08 * n.y;
  float key = pow(max(dot(Rf, K), 0.0), 26.0);
  float strip = box(Rf, normalize(vec3(0.08, 0.93, 0.36)), vec2(1.1, 0.07), 0.22);
  float side = box(Rf, normalize(vec3(0.86, 0.12, 0.50)), vec2(0.06, 0.85), 0.20);
  float fill = box(Rf, K, vec2(0.42, 0.30), 0.35);
  float phase = 3.0 * (0.85 * dot(n.xy, vec2(0.6, 0.8)) + 0.75 * (1.0 - nv) + 0.3 * dot(Rf.xy, vec2(-0.8, 0.6))) + 0.4 * sin(5.0 * vUv.x + 7.0 * vUv.y);
  vec3 holo = mix(vec3(1.0), pow(rainbow(phase), vec3(2.2)), 0.8);
  float lum = dot(print, vec3(0.2126, 0.7152, 0.0722));
  float gloss = mix(1.0, 0.45, smoothstep(0.55, 0.9, lum));
  vec3 spec = holo * gloss * mix(vec3(1.0), print * 2.4 + 0.08, 0.65) * (0.34 * key + 0.11 * strip + 0.07 * side + 0.02 * fill);
  vec3 col = print * shade + spec + holo * print * 0.6 * pow(1.0 - nv, 3.0);
  if (back) { vec3 foil = vec3(0.30, 0.22, 0.52) * (0.35 + 0.9 * nl) + spec * 1.3; col = mix(foil, print * shade, 0.38); }
  col = min(col, vec3(0.8)) + 0.2 * (1.0 - exp(-max(col - 0.8, 0.0) / 0.2));
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

const FS_WHITE = `precision mediump float; void main() { gl_FragColor = vec4(1.0); }`;

const VS_FULL = `attribute vec2 aP; varying vec2 vUv; void main() { vUv = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;
const FS_SHADOW = `
precision mediump float; varying vec2 vUv;
uniform sampler2D uSh; uniform vec2 uTexel; uniform float uSpace; uniform vec2 uOff;
void main() {
  float a = 0.0, w = 0.0;
  for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {
    float d2 = float(i * i + j * j); float k = exp(-d2 / 6.0);
    a += k * texture2D(uSh, vUv - uOff + vec2(float(i), float(j)) * uTexel * uSpace).r; w += k;
  }
  a = a / w * 0.30;
  gl_FragColor = vec4(vec3(0.07, 0.07, 0.16) * a, a);
}`;

function compile(gl: WebGLRenderingContext, vs: string, fs: string) {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

const ridge = (x: number) => Math.sqrt(Math.sin(x) ** 2 + 0.03) - 0.64;
const crease = (u: number, v: number) => S.crumple * 0.045 * CH * (
  ridge(2.7 * u + 2.9 * v + 0.7) + 0.8 * ridge(-2.6 * u + 3.3 * v + 2.1) + 0.5 * Math.sin(4.9 * u - 1.4 * v + 2.2)
  + 0.55 * ridge(1.1 * u + 6.4 * v + 1.3) + 0.4 * ridge(8.3 * u + 3.9 * v + 0.2) + 0.3 * ridge(-5.7 * u + 9.1 * v + 1.6));

export function Cloth({ host }: { host: React.RefObject<HTMLElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const hero = host.current!, cv = canvas.current!;
    const fail = () => hero.classList.add('no-cloth');
    const gl = cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) { fail(); return; }
    let progCloth: WebGLProgram, progWhite: WebGLProgram, progShadow: WebGLProgram;
    try {
      progCloth = compile(gl, VS, FS_CLOTH); progWhite = compile(gl, VS, FS_WHITE); progShadow = compile(gl, VS_FULL, FS_SHADOW);
    } catch { fail(); return; }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- Simulation state ----------
    const idx = (c: number, row: number) => row * COLS + c;
    const pos = new Float32Array(N * 3), prev = new Float32Array(N * 3), rest = new Float32Array(N * 3), flat = new Float32Array(N * 2);
    const inv = new Float32Array(N).fill(1), weight = new Float32Array(N), held = new Uint8Array(N);
    const PL = idx(0, ROWS - 1), PR = idx(COLS - 1, ROWS - 1);
    const half = 0.5 * CW * S.spread, top = 0.5 * CH, roll = S.pinRoll * D2R;
    const pinL = [-half * Math.cos(roll), top + half * Math.sin(roll), 0];
    const pinR = [half * Math.cos(roll), top - half * Math.sin(roll), 0];
    inv[PL] = 0; inv[PR] = 0;
    for (let row = 0; row < ROWS; row++) for (let c = 0; c < COLS; c++) {
      const i = idx(c, row), u = c / (COLS - 1), v = row / (ROWS - 1);
      const fx = (u - 0.5) * CW, fy = (v - 0.5) * CH;
      flat[i * 2] = fx; flat[i * 2 + 1] = fy;
      rest[i * 3] = fx; rest[i * 3 + 1] = fy; rest[i * 3 + 2] = crease(u, v);
      const sx = fx * (S.spread + (1 - S.spread) * (1 - v) ** 2), sy = fy - top;
      const ca = Math.cos(-roll), sa = Math.sin(-roll);
      pos[i * 3] = sx * ca - sy * sa; pos[i * 3 + 1] = top + sx * sa + sy * ca; pos[i * 3 + 2] = rest[i * 3 + 2];
    }
    pos.set(pinL, PL * 3); pos.set(pinR, PR * 3); prev.set(pos);
    const flatDist = (a: number, b: number) => Math.hypot(flat[a * 2] - flat[b * 2], flat[a * 2 + 1] - flat[b * 2 + 1]);
    const tL = new Float32Array(N), tR = new Float32Array(N);
    for (let i = 0; i < N; i++) { tL[i] = 1.02 * flatDist(i, PL); tR[i] = 1.02 * flatDist(i, PR); }

    const la: number[] = [], lb: number[] = [], lk: number[] = [];
    const bend = 0.02 + (0.6 - 0.02) * S.stiffness;
    const link = (a: number, b: number, k: number) => { la.push(a); lb.push(b); lk.push(k); };
    for (let row = 0; row < ROWS; row++) for (let c = 0; c < COLS; c++) {
      const i = idx(c, row);
      if (c + 1 < COLS) link(i, idx(c + 1, row), 1);
      if (row + 1 < ROWS) link(i, idx(c, row + 1), 1);
      if (c + 1 < COLS && row + 1 < ROWS) { link(i, idx(c + 1, row + 1), 0.5); link(idx(c + 1, row), idx(c, row + 1), 0.5); }
      if (c + 2 < COLS) link(i, idx(c + 2, row), bend);
      if (row + 2 < ROWS) link(i, idx(c, row + 2), bend);
      if (c + 5 < COLS) link(i, idx(c + 5, row), bend * 0.5);
      if (row + 5 < ROWS) link(i, idx(c, row + 5), bend * 0.5);
    }
    const L = la.length, A = Int32Array.from(la), B = Int32Array.from(lb), K = Float32Array.from(lk), RL = new Float32Array(L);
    for (let l = 0; l < L; l++) {
      const a = A[l] * 3, b = B[l] * 3;
      RL[l] = Math.hypot(rest[a] - rest[b], rest[a + 1] - rest[b + 1], rest[a + 2] - rest[b + 2]);
    }

    let T = 0, flip = false, damping = S.damping;
    const grab = { on: false, i: -1, depth: 0, off: [0, 0, 0], px: 0, py: 0 };

    const tether = (i: number) => {
      for (const [p, max] of [[PL, tL[i]], [PR, tR[i]]] as const) {
        const dx = pos[i * 3] - pos[p * 3], dy = pos[i * 3 + 1] - pos[p * 3 + 1], dz = pos[i * 3 + 2] - pos[p * 3 + 2];
        const d = Math.hypot(dx, dy, dz);
        if (d > max) { const s = max / d; pos[i * 3] = pos[p * 3] + dx * s; pos[i * 3 + 1] = pos[p * 3 + 1] + dy * s; pos[i * 3 + 2] = pos[p * 3 + 2] + dz * s; }
      }
    };
    const unproject = (sx: number, sy: number, depth: number) => {
      const s = CAM / Math.max(CAM - depth, 0.001);
      const q = [sx / s, sy / s, depth];
      return [R0[0] * q[0] + R1[0] * q[1] + R2[0] * q[2], R0[1] * q[0] + R1[1] * q[1] + R2[1] * q[2], R0[2] * q[0] + R1[2] * q[1] + R2[2] * q[2]];
    };

    const step = (h: number) => {
      T += h;
      const damp = Math.exp(-(0.15 + 5.85 * damping) * h);
      const gust = 0.6 + 0.4 * Math.sin(0.37 * T) * Math.sin(0.23 * T + 1.0);
      const wind = reduce ? 0 : S.flutter * 2.4 * gust * (S.gravity / 2.6);
      const maxV = S.maxSpeed * h, h2 = h * h;
      held.fill(0);
      for (let row = 0; row < ROWS; row++) for (let c = 0; c < COLS; c++) {
        const i = idx(c, row); if (!inv[i]) continue;
        const u = c / (COLS - 1), v = row / (ROWS - 1), o = i * 3;
        const s1 = Math.sin(9.1 * u - 3.7 * v + 3.1 * T), s2 = Math.sin(6.3 * u + 7.9 * v - 2.3 * T + 1.3);
        const s3 = Math.sin(2.9 * u + 1.7 * T + 0.8 * Math.sin(0.5 * T)) * Math.cos(2.3 * v - 0.9 * T);
        const ax = wind * 0.25 * Math.sin(3.3 * v + 1.1 * T + u), ay = wind * 0.1 * s2 - S.gravity, az = wind * (0.45 * s1 + 0.35 * s2 + 0.3 * s3);
        let vx = (pos[o] - prev[o]) * damp + ax * h2, vy = (pos[o + 1] - prev[o + 1]) * damp + ay * h2, vz = (pos[o + 2] - prev[o + 2]) * damp + az * h2;
        const sp = Math.hypot(vx, vy, vz); if (sp > maxV) { const k = maxV / sp; vx *= k; vy *= k; vz *= k; }
        prev[o] = pos[o]; prev[o + 1] = pos[o + 1]; prev[o + 2] = pos[o + 2];
        pos[o] += vx; pos[o + 1] += vy; pos[o + 2] += vz;
      }
      if (grab.on) {
        const w = unproject(grab.px, grab.py, grab.depth);
        const g = grab.i * 3;
        const tgt = [w[0] + grab.off[0], w[1] + grab.off[1], w[2] + grab.off[2]];
        const keep = [pos[g], pos[g + 1], pos[g + 2]];
        pos[g] = tgt[0]; pos[g + 1] = tgt[1]; pos[g + 2] = tgt[2]; tether(grab.i);
        const d = [pos[g] - keep[0], pos[g + 1] - keep[1], pos[g + 2] - keep[2]];
        pos[g] = keep[0]; pos[g + 1] = keep[1]; pos[g + 2] = keep[2];
        for (let i = 0; i < N; i++) {
          const wt = weight[i]; if (!wt || !inv[i]) continue;
          const f = wt >= 0.98 ? 1 : wt, o = i * 3;
          for (let k = 0; k < 3; k++) { pos[o + k] += d[k] * f; prev[o + k] += d[k] * f; }
          if (wt >= 0.98) held[i] = 1;
        }
      }
      const im = (i: number) => (held[i] ? 0 : inv[i]);
      for (let n = 0; n < L; n++) {
        const l = flip ? L - 1 - n : n;
        const a = A[l], b = B[l], wa = im(a), wb = im(b), ws = wa + wb; if (!ws) continue;
        const ao = a * 3, bo = b * 3;
        const dx = pos[bo] - pos[ao], dy = pos[bo + 1] - pos[ao + 1], dz = pos[bo + 2] - pos[ao + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const corr = ((d - RL[l]) / d) * K[l] / ws;
        pos[ao] += dx * corr * wa; pos[ao + 1] += dy * corr * wa; pos[ao + 2] += dz * corr * wa;
        pos[bo] -= dx * corr * wb; pos[bo + 1] -= dy * corr * wb; pos[bo + 2] -= dz * corr * wb;
      }
      flip = !flip;
      for (let i = 0; i < N; i++) if (inv[i] && !held[i]) tether(i);
    };

    damping = 1;
    for (let k = 0; k < 360; k++) step(1 / 240);
    damping = S.damping;

    // ---------- GL buffers ----------
    const uv = new Float32Array(N * 2);
    for (let row = 0; row < ROWS; row++) for (let c = 0; c < COLS; c++) { const i = idx(c, row); uv[i * 2] = c / (COLS - 1); uv[i * 2 + 1] = 1 - row / (ROWS - 1); }
    const ind: number[] = [];
    for (let row = 0; row < ROWS - 1; row++) for (let c = 0; c < COLS - 1; c++) {
      const a = idx(c, row), b = idx(c + 1, row), cc = idx(c, row + 1), d = idx(c + 1, row + 1);
      ind.push(a, b, d, a, d, cc);
    }
    const nor = new Float32Array(N * 3);
    const bPos = gl.createBuffer(), bNor = gl.createBuffer(), bUv = gl.createBuffer(), bInd = gl.createBuffer(), bFull = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bUv); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bInd); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ind), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bFull); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferData(gl.ARRAY_BUFFER, pos.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bNor); gl.bufferData(gl.ARRAY_BUFFER, nor.byteLength, gl.DYNAMIC_DRAW);

    const tex = gl.createTexture();
    let loaded = 0;
    const shTex = gl.createTexture(), shFbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, shTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // ---------- View ----------
    let W = 1, H = 1, cssW = 1, cssH = 1, asp = 1, cx = 0.402, cy = 0.485, zoom = 1, sw = 1, sh = 1;
    const resize = () => {
      const rc = hero.getBoundingClientRect();
      cssW = rc.width; cssH = rc.height; asp = cssW / cssH;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(cssW * dpr)); H = Math.max(1, Math.round(cssH * dpr));
      cv.width = W; cv.height = H;
      if (cssW >= 1100 && asp >= 1.25) { cx = 0.402; cy = 0.485; zoom = Math.min(1, (0.58 * asp) / (CW * 1.12)); }
      else { cx = 0.5; cy = asp < 0.75 ? 0.41 : 0.43; zoom = Math.min(1, (0.92 * asp) / (CW * 1.12), (asp < 0.75 ? 0.6 : 0.66) / CH); }
      sw = Math.max(1, Math.round(W / 8)); sh = Math.max(1, Math.round(H / 8));
      gl.bindTexture(gl.TEXTURE_2D, shTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      draw();
    };

    const normals = () => {
      for (let row = 0; row < ROWS; row++) for (let c = 0; c < COLS; c++) {
        const i = idx(c, row);
        const l = idx(Math.max(c - 1, 0), row) * 3, rr = idx(Math.min(c + 1, COLS - 1), row) * 3;
        const dn = idx(c, Math.max(row - 1, 0)) * 3, up = idx(c, Math.min(row + 1, ROWS - 1)) * 3;
        const ax = pos[rr] - pos[l], ay = pos[rr + 1] - pos[l + 1], az = pos[rr + 2] - pos[l + 2];
        const bx = pos[up] - pos[dn], by = pos[up + 1] - pos[dn + 1], bz = pos[up + 2] - pos[dn + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m;
        nor[i * 3] = nx; nor[i * 3 + 1] = ny; nor[i * 3 + 2] = nz;
      }
    };

    const bindMesh = (p: WebGLProgram) => {
      gl.useProgram(p);
      const aP = gl.getAttribLocation(p, 'aPos'), aN = gl.getAttribLocation(p, 'aNor'), aU = gl.getAttribLocation(p, 'aUv');
      gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      if (aN >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bNor); gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0); }
      if (aU >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bUv); gl.enableVertexAttribArray(aU); gl.vertexAttribPointer(aU, 2, gl.FLOAT, false, 0, 0); }
      const u = (n: string) => gl.getUniformLocation(p, n);
      gl.uniform3fv(u('uR0'), R0); gl.uniform3fv(u('uR1'), R1); gl.uniform3fv(u('uR2'), R2);
      gl.uniform1f(u('uCam'), CAM); gl.uniform1f(u('uZoom'), zoom); gl.uniform1f(u('uAsp'), asp); gl.uniform2f(u('uC'), cx, cy);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bInd);
    };
    const unbindAttribs = () => { for (let k = 0; k < 3; k++) gl.disableVertexAttribArray(k); };

    function draw() {
      if (gl!.isContextLost()) return;
      normals();
      gl!.bindBuffer(gl!.ARRAY_BUFFER, bPos); gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, pos);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, bNor); gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, nor);
      // Shadow mask
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, shFbo); gl!.viewport(0, 0, sw, sh);
      gl!.disable(gl!.DEPTH_TEST); gl!.disable(gl!.BLEND); gl!.clearColor(0, 0, 0, 0); gl!.clear(gl!.COLOR_BUFFER_BIT);
      unbindAttribs(); bindMesh(progWhite); gl!.drawElements(gl!.TRIANGLES, ind.length, gl!.UNSIGNED_SHORT, 0);
      // Blurred shadow
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null); gl!.viewport(0, 0, W, H);
      gl!.clearColor(0, 0, 0, 0); gl!.clearDepth(1); gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
      unbindAttribs(); gl!.useProgram(progShadow);
      const aF = gl!.getAttribLocation(progShadow, 'aP');
      gl!.bindBuffer(gl!.ARRAY_BUFFER, bFull); gl!.enableVertexAttribArray(aF); gl!.vertexAttribPointer(aF, 2, gl!.FLOAT, false, 0, 0);
      gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, shTex);
      const us = (n: string) => gl!.getUniformLocation(progShadow, n);
      gl!.uniform1i(us('uSh'), 0); gl!.uniform2f(us('uTexel'), 1 / sw, 1 / sh);
      gl!.uniform1f(us('uSpace'), 0.9 + (1.5 * zoom * cssH) / 724);
      gl!.uniform2f(us('uOff'), (-0.012 * zoom) / asp, -0.045 * zoom);
      gl!.enable(gl!.BLEND); gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      // Cloth
      gl!.disable(gl!.BLEND); gl!.enable(gl!.DEPTH_TEST); gl!.depthFunc(gl!.LEQUAL); gl!.disable(gl!.CULL_FACE);
      unbindAttribs(); bindMesh(progCloth);
      gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, tex);
      gl!.uniform1i(gl!.getUniformLocation(progCloth, 'uTex'), 0);
      gl!.uniform1f(gl!.getUniformLocation(progCloth, 'uLoaded'), loaded);
      gl!.drawElements(gl!.TRIANGLES, ind.length, gl!.UNSIGNED_SHORT, 0);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      const an = gl.getExtension('EXT_texture_filter_anisotropic');
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      loaded = 1; draw();
    };
    img.onerror = fail;
    img.src = CLOTH_IMAGE;

    // ---------- Pointer ----------
    const toScreen = (e: { clientX: number; clientY: number }) => {
      const rc = cv.getBoundingClientRect();
      return [((e.clientX - rc.left) / rc.width - cx) * asp / zoom, (cy - (e.clientY - rc.top) / rc.height) / zoom];
    };
    const pick = (x: number, y: number) => {
      let best = -1, score = Infinity, depth = 0;
      for (let i = 0; i < N; i++) {
        const o = i * 3, p = [pos[o], pos[o + 1], pos[o + 2]];
        const q = [R0[0] * p[0] + R0[1] * p[1] + R0[2] * p[2], R1[0] * p[0] + R1[1] * p[1] + R1[2] * p[2], R2[0] * p[0] + R2[1] * p[1] + R2[2] * p[2]];
        const s = CAM / Math.max(CAM - q[2], 0.001);
        const d = Math.hypot(q[0] * s - x, q[1] * s - y);
        if (d > S.grabRadius / zoom) continue;
        const sc = d - 0.08 * q[2];
        if (sc < score) { score = sc; best = i; depth = q[2]; }
      }
      return { best, depth };
    };
    const start = (e: { clientX: number; clientY: number }) => {
      const [x, y] = toScreen(e);
      const { best, depth } = pick(x, y);
      if (best < 0 || !inv[best]) return false;
      const w = unproject(x, y, depth);
      grab.on = true; grab.i = best; grab.depth = depth; grab.px = x; grab.py = y;
      grab.off = [pos[best * 3] - w[0], pos[best * 3 + 1] - w[1], pos[best * 3 + 2] - w[2]];
      for (let i = 0; i < N; i++) {
        const d = flatDist(i, best) / (S.carryRadius * CH);
        weight[i] = !inv[i] ? 0 : i === best ? 1 : d < 1 ? (1 - d * d) ** 2 : 0;
      }
      cv.classList.add('is-held');
      return true;
    };
    const end = () => { grab.on = false; cv.classList.remove('is-held'); };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (start(e)) cv.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const [x, y] = toScreen(e);
      if (grab.on) { grab.px = x; grab.py = y; return; }
      if (e.pointerType === 'mouse') cv.classList.toggle('is-over', pick(x, y).best >= 0);
    };
    const onTouchStart = (e: TouchEvent) => {
      const tt = e.touches[0]; if (!tt) return;
      const [x, y] = toScreen(tt);
      if (pick(x, y).best >= 0) e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => { if (grab.on) e.preventDefault(); };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('lostpointercapture', end);
    cv.addEventListener('touchstart', onTouchStart, { passive: false });
    cv.addEventListener('touchmove', onTouchMove, { passive: false });
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail(); });

    // ---------- Loop ----------
    let raf = 0, last = 0, visible = true;
    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min((now - (last || now)) / 1000, 1 / 30); last = now;
      const h = dt / S.steps;
      if (h > 0) for (let k = 0; k < S.steps; k++) step(h);
      draw();
      schedule();
    };
    const schedule = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) { last = 0; schedule(); } });
    io.observe(hero);
    const onVis = () => { last = 0; schedule(); };
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(resize);
    ro.observe(hero);
    window.addEventListener('resize', resize);
    resize();
    schedule();

    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', end); cv.removeEventListener('pointercancel', end); cv.removeEventListener('lostpointercapture', end);
      cv.removeEventListener('touchstart', onTouchStart); cv.removeEventListener('touchmove', onTouchMove);
    };
  }, [host]);

  return (
    <>
      <canvas ref={canvas} className="hero__cloth" role="img" tabIndex={-1}
        aria-label="A violet holographic cloth showing a chrome octopus beneath the words Strange by design. Grab it then tug it around." />
      <img className="hero__still" alt="" decoding="async" src={CLOTH_IMAGE} />
    </>
  );
}
