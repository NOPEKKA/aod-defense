/**
 * Procedural effect sheets (fire, explosions, magic...). Drawn on a 2D canvas at 3 px per logical px,
 * box-filtered down to hd (1.5x) and sd (1x), trimmed, packed and written in the same layout as sprites:
 *   public/assets/sprites/{hd,sd}/<id>-N.webp + <id>.json (multiatlas, frames "play/N") + sprites/meta/<id>.json
 * The meta has the SpriteMeta shape plus `blend: "add" | "normal"` and `ground: boolean`.
 * Owner: items art agent.
 */
import { trim } from './engine';
import { multiatlasJson, pack, type PackItem } from './pack';
import { jsonFile, pngFile, webpFile, type OutFile } from './studio';

const S = 3; // master px per logical px
const GROUND = Math.sin((20 * Math.PI) / 180); // 0.342: ground circles are squashed by this

export interface FxCtx {
  g: CanvasRenderingContext2D;
  cv: HTMLCanvasElement;
  W: number;
  H: number;
  ax: number;
  ay: number;
  /** progress: loops i/n, one-shots i/(n-1) */
  t: number;
  i: number;
  n: number;
}
export interface FxDef {
  id: string;
  w: number;
  h: number;
  /** anchor inside the frame, logical px from the top-left */
  ax: number;
  ay: number;
  frames: number;
  duration: number;
  loop: boolean;
  blend: 'add' | 'normal';
  ground?: boolean;
  draw: (c: FxCtx) => void;
}

const defs = new Map<string, FxDef>();
export function defineFx(d: FxDef): void {
  if (defs.has(d.id)) throw new Error(`fx "${d.id}" defined twice`);
  defs.set(d.id, d);
}
export function fxIds(): string[] {
  return [...defs.keys()];
}
export function getFx(id: string): FxDef {
  const d = defs.get(id);
  if (!d) throw new Error(`unknown fx "${id}" (have: ${fxIds().join(', ')})`);
  return d;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const frac = (x: number): number => x - Math.floor(x);

function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** value noise, periodic in y with integer period py (x wraps every 64) */
function vnoise(x: number, y: number, py: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number): number => hash2(((a % 64) + 64) % 64, ((b % py) + py) % py);
  return lerp(lerp(h(ix, iy), h(ix + 1, iy), sx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), sx), sy);
}
/** 3 octave fbm in [0,1], periodic in y with period py (integer) */
function fbm(x: number, y: number, py: number): number {
  return vnoise(x, y, py) * 0.5 + vnoise(x * 2, y * 2, py * 2) * 0.3 + vnoise(x * 4, y * 4, py * 4) * 0.2;
}

function radial(g: CanvasRenderingContext2D, x: number, y: number, r: number, stops: Array<[number, string]>): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [p, c] of stops) gr.addColorStop(p, c);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
function ellipseGlow(g: CanvasRenderingContext2D, x: number, y: number, r: number, squash: number, stops: Array<[number, string]>): void {
  g.save();
  g.translate(x, y);
  g.scale(1, squash);
  radial(g, 0, 0, r, stops);
  g.restore();
}

// ---------------------------------------------------------------------------
// flames (per pixel, looping noise)
// ---------------------------------------------------------------------------
function ramp(d: number): [number, number, number] {
  const bands: Array<[number, [number, number, number]]> = [
    [0.0, [196, 38, 22]],
    [0.3, [240, 84, 24]],
    [0.52, [255, 150, 30]],
    [0.72, [255, 214, 70]],
    [0.9, [255, 248, 200]],
  ];
  let c = bands[0][1];
  for (let i = 0; i < bands.length; i++) {
    const [p, col] = bands[i];
    const k = smooth(p - 0.035, p + 0.035, d);
    if (i === 0) c = col;
    else c = [lerp(c[0], col[0], k), lerp(c[1], col[1], k), lerp(c[2], col[2], k)];
  }
  return c;
}

/** one tongue of flame composited over a premultiplied float buffer (BW x BH master px) */
function flame(buf: Float32Array, BW: number, BH: number, cx: number, baseY: number, w: number, h: number, t: number, seed: number): void {
  const x0 = Math.max(0, Math.floor((cx - w * 1.3) * S));
  const x1 = Math.min(BW - 1, Math.ceil((cx + w * 1.3) * S));
  const y0 = Math.max(0, Math.floor((baseY - h * 1.1) * S));
  const y1 = Math.min(BH - 1, Math.ceil(baseY * S));
  const s7 = seed * 7.37;
  for (let Y = y0; Y <= y1; Y++) {
    const v = (baseY - Y / S) / h;
    if (v < 0) continue;
    for (let X = x0; X <= x1; X++) {
      const u = (X / S - cx) / w;
      const n = fbm(u * 1.5 + s7, v * 3 - t * 3, 3);
      const sway = (fbm(1.7 + s7, v * 2 - t * 2, 2) - 0.5) * 0.7 * v + 0.1 * Math.sin(Math.PI * 2 * t + v * 3 + seed);
      const edge = 0.62 * (1 - Math.pow(Math.min(1, v), 1.5)) * (0.55 + 1.0 * n);
      if (edge <= 0) continue;
      let d = 1 - Math.abs(u - sway) / edge;
      d *= smooth(1.02, 0.5, v + (n - 0.5) * 0.4);
      if (d <= 0) continue;
      const k = d * (1 - 0.45 * v) + 0.08;
      const [r, g, b] = ramp(k);
      const i = (Y * BW + X) * 4;
      // over: src alpha 1 where d > 0 (hard toon edge, smoothed by the downsample)
      buf[i] = r / 255;
      buf[i + 1] = g / 255;
      buf[i + 2] = b / 255;
      buf[i + 3] = 1;
    }
  }
}
function flushBuf(c: FxCtx, buf: Float32Array): void {
  const img = new ImageData(c.cv.width, c.cv.height);
  for (let p = 0; p < buf.length; p += 4) {
    img.data[p] = Math.round(buf[p] * 255);
    img.data[p + 1] = Math.round(buf[p + 1] * 255);
    img.data[p + 2] = Math.round(buf[p + 2] * 255);
    img.data[p + 3] = Math.round(buf[p + 3] * 255);
  }
  c.g.putImageData(img, 0, 0);
}

defineFx({
  id: 'fx_fire',
  w: 60,
  h: 90,
  ax: 30,
  ay: 86,
  frames: 12,
  duration: 0.6,
  loop: true,
  blend: 'normal',
  draw: (c) => {
    const buf = new Float32Array(c.cv.width * c.cv.height * 4);
    flame(buf, c.cv.width, c.cv.height, c.ax, c.ay, 26, 80, c.t, 1);
    flushBuf(c, buf);
  },
});

defineFx({
  id: 'fx_fire_big',
  w: 240,
  h: 130,
  ax: 120,
  ay: 112,
  frames: 12,
  duration: 0.7,
  loop: true,
  blend: 'normal',
  ground: true,
  draw: (c) => {
    // glowing scorched ground first, then flames back to front
    ellipseGlow(c.g, c.ax, c.ay - 8, 112, GROUND * 1.15, [[0, 'rgba(255,190,70,0.95)'], [0.55, 'rgba(240,90,20,0.8)'], [1, 'rgba(120,20,10,0)']]);
    const buf = new Float32Array(c.cv.width * c.cv.height * 4);
    const base = c.g.getImageData(0, 0, c.cv.width, c.cv.height).data;
    for (let p = 0; p < buf.length; p += 4) {
      const a = base[p + 3] / 255;
      buf[p] = (base[p] / 255) * a;
      buf[p + 1] = (base[p + 1] / 255) * a;
      buf[p + 2] = (base[p + 2] / 255) * a;
      buf[p + 3] = a;
    }
    const R = rng(11);
    const list: Array<[number, number, number, number, number]> = [];
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + 0.4;
      const px = c.ax + Math.cos(a) * 78 * (0.6 + 0.4 * R());
      const py = c.ay - 6 + Math.sin(a) * 78 * GROUND * (0.6 + 0.4 * R());
      list.push([py, px, 22 + 16 * R(), 55 + 38 * R(), R()]);
    }
    list.sort((p, q) => p[0] - q[0]);
    list.forEach(([py, px, w, h, ph], k) => flame(buf, c.cv.width, c.cv.height, px, py, w, h, frac(c.t + ph), k + 3));
    flushBuf(c, buf);
  },
});

// ---------------------------------------------------------------------------
// explosion, smoke, dust, bones
// ---------------------------------------------------------------------------
defineFx({
  id: 'fx_explosion',
  w: 220,
  h: 220,
  ax: 110,
  ay: 110,
  frames: 12,
  duration: 0.7,
  loop: false,
  blend: 'normal',
  draw: ({ g, t }) => {
    const R0 = rng(5);
    const e = easeOut(t);
    const R = 20 + 66 * e;
    const cx = 110;
    const cy = 110;
    // smoke
    const sm = smooth(0.1, 0.4, t) * (1 - smooth(0.7, 1, t));
    if (sm > 0) {
      const Rs = rng(9);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Rs();
        const d = R * (0.3 + 0.5 * Rs());
        radial(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d - t * 30, R * (0.5 + 0.3 * Rs()), [[0, `rgba(58,48,48,${0.95 * sm})`], [0.7, `rgba(40,32,36,${0.85 * sm})`], [1, 'rgba(30,24,28,0)']]);
      }
    }
    // fire lumps
    const fa = 1 - smooth(0.42, 0.85, t);
    if (fa > 0) {
      g.globalAlpha = fa;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + 0.3;
        const d = R * (0.1 + 0.5 * R0());
        const s = R * (0.5 + 0.25 * R0());
        radial(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d - t * 10, s, [[0, '#fff0a8'], [0.35, '#ffb02e'], [0.7, '#d8431a'], [1, 'rgba(110,20,10,0)']]);
      }
      g.globalAlpha = 1;
    }
    const core = Math.pow(1 - t, 1.4);
    if (core > 0.02) radial(g, cx, cy - t * 8, R * 0.62, [[0, `rgba(255,255,235,${core})`], [0.5, `rgba(255,230,120,${core})`], [1, 'rgba(255,170,40,0)']]);
    // shockwave ring and sparks
    if (t < 0.45) {
      const k = t / 0.45;
      g.strokeStyle = `rgba(255,244,214,${0.85 * (1 - k)})`;
      g.lineWidth = 5 * (1 - k) + 1;
      g.beginPath();
      g.arc(cx, cy, 24 + 84 * easeOut(k), 0, Math.PI * 2);
      g.stroke();
    }
    const Rk = rng(21);
    g.lineCap = 'round';
    for (let k = 0; k < 14; k++) {
      const a = Rk() * Math.PI * 2;
      const sp = 60 + 40 * Rk();
      const r1 = 16 + sp * easeOut(Math.min(1, t * 1.3));
      const r0 = Math.max(0, r1 - 14 * (1 - t));
      const al = 1 - smooth(0.4, 0.9, t);
      if (al <= 0) continue;
      g.strokeStyle = `rgba(255,${200 + Math.round(40 * Rk())},90,${al})`;
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 + t * 12 * Rk());
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 + t * 12 * Rk());
      g.stroke();
    }
  },
});

defineFx({
  id: 'fx_smoke_puff',
  w: 110,
  h: 110,
  ax: 55,
  ay: 62,
  frames: 8,
  duration: 0.8,
  loop: false,
  blend: 'normal',
  draw: ({ g, t }) => {
    const R = rng(3);
    const grow = easeOut(t);
    const alpha = smooth(0, 0.12, t) * (1 - smooth(0.45, 1, t));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.5;
      const d = 8 + 18 * grow * (0.6 + 0.4 * R());
      const x = 55 + Math.cos(a) * d;
      const y = 62 + Math.sin(a) * d * 0.8 - 26 * t * (0.5 + R());
      const r = 11 + 17 * grow * (0.7 + 0.5 * R());
      radial(g, x, y, r, [[0, `rgba(120,112,116,${alpha})`], [0.65, `rgba(84,76,84,${alpha * 0.95})`], [1, 'rgba(60,52,62,0)']]);
      radial(g, x - r * 0.25, y - r * 0.3, r * 0.6, [[0, `rgba(176,168,170,${alpha * 0.55})`], [1, 'rgba(150,140,146,0)']]);
    }
  },
});

defineFx({
  id: 'fx_dust_puff',
  w: 90,
  h: 56,
  ax: 45,
  ay: 46,
  frames: 6,
  duration: 0.45,
  loop: false,
  blend: 'normal',
  ground: true,
  draw: ({ g, t }) => {
    const R = rng(7);
    const grow = easeOut(t);
    const alpha = smooth(0, 0.1, t) * (1 - smooth(0.35, 1, t));
    for (let k = 0; k < 9; k++) {
      const x = 45 + ((k - 4) / 4) * 32 * grow + (R() - 0.5) * 6;
      const y = 44 - 3 - 12 * grow * (0.3 + R());
      const r = 6 + 9 * grow * (0.7 + 0.6 * R());
      radial(g, x, y, r, [[0, `rgba(196,174,138,${alpha})`], [0.7, `rgba(160,140,108,${alpha * 0.9})`], [1, 'rgba(130,112,86,0)']]);
    }
  },
});

function bone(g: CanvasRenderingContext2D, x: number, y: number, len: number, rot: number, a: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha = a;
  for (const pass of [0, 1]) {
    g.fillStyle = pass === 0 ? '#2a1d24' : '#eedbc4';
    const e = pass === 0 ? 1.4 : 0;
    g.fillRect(-len / 2, -2.2 - e, len, 4.4 + e * 2);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      g.beginPath();
      g.arc((sx * len) / 2, sy * 2.4, 3 + e, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}
defineFx({
  id: 'fx_bone_burst',
  w: 140,
  h: 140,
  ax: 70,
  ay: 76,
  frames: 6,
  duration: 0.6,
  loop: false,
  blend: 'normal',
  draw: ({ g, t }) => {
    const R = rng(33);
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (R() - 0.5) * 2.8;
      const v = 70 + 50 * R();
      const x = 70 + Math.cos(a) * v * t;
      const y = 76 + Math.sin(a) * v * t + 110 * t * t * (0.7 + 0.3 * R());
      const len = 11 + 9 * R();
      bone(g, x, y, len, t * (4 + 8 * R()) * (k % 2 ? 1 : -1) + R() * 6, 1 - smooth(0.7, 1, t));
    }
    if (t < 0.35) {
      const al = 1 - t / 0.35;
      radial(g, 70, 76, 20 + 20 * t, [[0, `rgba(238,219,196,${0.85 * al})`], [1, 'rgba(238,219,196,0)']]);
    }
  },
});

// ---------------------------------------------------------------------------
// additive hits: sparks, muzzle flash, slash
// ---------------------------------------------------------------------------
defineFx({
  id: 'fx_spark_burst',
  w: 110,
  h: 110,
  ax: 55,
  ay: 55,
  frames: 6,
  duration: 0.3,
  loop: false,
  blend: 'add',
  draw: ({ g, t }) => {
    g.globalCompositeOperation = 'lighter';
    const R = rng(17);
    g.lineCap = 'round';
    if (t < 0.5) radial(g, 55, 55, 24 * (1 - t), [[0, `rgba(255,250,220,${1 - t * 1.6})`], [0.5, `rgba(255,200,90,${0.7 - t})`], [1, 'rgba(255,140,40,0)']]);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + R() * 0.3;
      const sp = 28 + 24 * R();
      const r1 = 6 + sp * easeOut(t);
      const len = (6 + 10 * R()) * (1 - t * 0.7);
      const al = 1 - smooth(0.5, 1, t);
      g.strokeStyle = `rgba(255,${190 + Math.round(60 * R())},${70 + Math.round(60 * R())},${al})`;
      g.lineWidth = 2.6 * (1 - t * 0.5);
      g.beginPath();
      g.moveTo(55 + Math.cos(a) * (r1 - len), 55 + Math.sin(a) * (r1 - len) + t * 6);
      g.lineTo(55 + Math.cos(a) * r1, 55 + Math.sin(a) * r1 + t * 6);
      g.stroke();
    }
  },
});

defineFx({
  id: 'fx_muzzle_flash',
  w: 132,
  h: 80,
  ax: 18,
  ay: 40,
  frames: 4,
  duration: 0.12,
  loop: false,
  blend: 'add',
  draw: ({ g, i }) => {
    g.translate(12, 0);
    g.globalCompositeOperation = 'lighter';
    const R = rng(40 + i * 5);
    const k = [1, 0.85, 0.6, 0.35][i];
    const al = [1, 1, 0.8, 0.5][i];
    const spike = (len: number, wid: number, ang: number, col: string): void => {
      g.save();
      g.translate(6, 40);
      g.rotate(ang);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, -wid);
      g.quadraticCurveTo(len * 0.35, -wid * 0.9, len, 0);
      g.quadraticCurveTo(len * 0.35, wid * 0.9, 0, wid);
      g.closePath();
      g.fill();
      g.restore();
    };
    ellipseGlow(g, 14, 40, 34 * k, 1, [[0, `rgba(255,236,170,${al})`], [0.5, `rgba(255,150,40,${0.6 * al})`], [1, 'rgba(255,90,20,0)']]);
    spike(108 * k, 9 * k, 0, `rgba(255,170,60,${al})`);
    spike(86 * k, 5.5 * k, 0, `rgba(255,236,160,${al})`);
    for (const sgn of [-1, 1]) {
      spike((50 + 16 * R()) * k, 5 * k, sgn * (0.42 + 0.12 * R()), `rgba(255,150,40,${al})`);
      spike((32 + 12 * R()) * k, 4 * k, sgn * (0.95 + 0.2 * R()), `rgba(255,190,70,${al})`);
    }
    spike(60 * k, 3.4 * k, 0, `rgba(255,255,255,${al})`);
  },
});

defineFx({
  id: 'fx_slash',
  w: 150,
  h: 150,
  ax: 75,
  ay: 75,
  frames: 5,
  duration: 0.2,
  loop: false,
  blend: 'add',
  draw: ({ g, t }) => {
    g.globalCompositeOperation = 'lighter';
    // crescent facing right: arc centre sits to the left, sweep from top to bottom
    const cx = 18;
    const cy = 75;
    const Rr = 72;
    const a0 = -1.05;
    const a1 = 1.05;
    const head = clamp(t * 1.5 + 0.2);
    const tail = clamp((t - 0.25) * 1.6);
    const al = 1 - smooth(0.7, 1, t);
    const steps = 28;
    const poly = (grow: number, col: string): void => {
      const pts: Array<[number, number]> = [];
      const inner: Array<[number, number]> = [];
      for (let k = 0; k <= steps; k++) {
        const s = lerp(tail, head, k / steps);
        const a = lerp(a0, a1, s);
        const th = grow * 30 *Math.pow(Math.sin(Math.PI * clamp((s - tail * 0.0))), 0.85) * (0.55 + 0.45 * Math.sin(Math.PI * (k / steps)));
        pts.push([cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr]);
        inner.push([cx + Math.cos(a) * (Rr - th), cy + Math.sin(a) * (Rr - th)]);
      }
      g.fillStyle = col;
      g.beginPath();
      pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      for (let k = inner.length - 1; k >= 0; k--) g.lineTo(inner[k][0], inner[k][1]);
      g.closePath();
      g.fill();
    };
    if (head - tail > 0.02) {
      poly(1.9, `rgba(120,200,255,${0.35 * al})`);
      poly(1.35, `rgba(200,235,255,${0.7 * al})`);
      poly(0.85, `rgba(255,255,255,${al})`);
      // flying sparks along the leading edge
      const a = lerp(a0, a1, head);
      radial(g, cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr, 12, [[0, `rgba(255,255,255,${al})`], [1, 'rgba(160,220,255,0)']]);
    }
  },
});

// ---------------------------------------------------------------------------
// magic on the ground
// ---------------------------------------------------------------------------
function rune(g: CanvasRenderingContext2D, k: number): void {
  // a small glyph made of strokes, determined by k
  const R = rng(k * 13 + 1);
  g.beginPath();
  g.moveTo(0, -5);
  g.lineTo(0, 5);
  for (let s = 0; s < 3; s++) {
    const y = -4 + R() * 8;
    const dir = R() > 0.5 ? 1 : -1;
    g.moveTo(0, y);
    g.lineTo(dir * (2 + R() * 3.5), y + (R() - 0.5) * 6);
  }
  g.stroke();
}

defineFx({
  id: 'fx_magic_circle',
  w: 230,
  h: 84,
  ax: 115,
  ay: 42,
  frames: 8,
  duration: 1.6,
  loop: true,
  blend: 'add',
  ground: true,
  draw: ({ g, t }) => {
    g.globalCompositeOperation = 'lighter';
    g.save();
    g.translate(115, 42);
    g.scale(1, GROUND);
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    radial(g, 0, 0, 108, [[0, `rgba(120,190,255,${0.16 + 0.1 * pulse})`], [0.8, `rgba(90,150,255,${0.07})`], [1, 'rgba(90,150,255,0)']]);
    g.lineCap = 'round';
    const ring = (r: number, w: number, col: string): void => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    };
    ring(104, 6, 'rgba(120,190,255,0.35)');
    ring(104, 2.6, 'rgba(220,244,255,0.95)');
    ring(92, 1.8, 'rgba(255,214,110,0.9)');
    ring(70, 2.4, 'rgba(200,235,255,0.9)');
    ring(40, 1.8, 'rgba(255,214,110,0.9)');
    // outer ticks turn one tick per loop
    g.strokeStyle = 'rgba(255,230,150,0.95)';
    g.lineWidth = 2.4;
    const nt = 24;
    for (let k = 0; k < nt; k++) {
      const a = ((k + t) / nt) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 96, Math.sin(a) * 96);
      g.lineTo(Math.cos(a) * 102, Math.sin(a) * 102);
      g.stroke();
    }
    // runes between rings turn the other way, one step per loop
    g.strokeStyle = 'rgba(230,248,255,0.95)';
    g.lineWidth = 1.8;
    const nr = 12;
    for (let k = 0; k < nr; k++) {
      const a = ((k - t) / nr) * Math.PI * 2;
      g.save();
      g.translate(Math.cos(a) * 81, Math.sin(a) * 81);
      g.rotate(a + Math.PI / 2);
      g.scale(1.5, 1.5);
      rune(g, k % 6);
      g.restore();
    }
    // hexagram turns one sixth per loop
    g.strokeStyle = 'rgba(255,224,130,0.95)';
    g.lineWidth = 2.6;
    for (const off of [0, Math.PI / 3]) {
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = off + (t * Math.PI) / 3 + (k / 3) * Math.PI * 2 - Math.PI / 2;
        k ? g.lineTo(Math.cos(a) * 66, Math.sin(a) * 66) : g.moveTo(Math.cos(a) * 66, Math.sin(a) * 66);
      }
      g.closePath();
      g.stroke();
    }
    radial(g, 0, 0, 22, [[0, `rgba(255,255,255,${0.7 + 0.3 * pulse})`], [1, 'rgba(160,210,255,0)']]);
    g.restore();
  },
});

defineFx({
  id: 'fx_portal',
  w: 260,
  h: 100,
  ax: 130,
  ay: 50,
  frames: 12,
  duration: 1.2,
  loop: true,
  blend: 'normal',
  ground: true,
  draw: (c) => {
    const { cv, g, t } = c;
    const img = new ImageData(cv.width, cv.height);
    const rx = 118 * S;
    const ry = rx * GROUND;
    const cx = (c.ax) * S;
    const cy = (c.ay) * S;
    for (let Y = 0; Y < cv.height; Y++) {
      for (let X = 0; X < cv.width; X++) {
        const dx = (X - cx) / rx;
        const dy = (Y - cy) / ry;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > 1.04) continue;
        const th = Math.atan2(dy, dx);
        const swirl = th * 3 - r * 6 + t * Math.PI * 2 * 2;
        const arm = 0.5 + 0.5 * Math.sin(swirl + 1.3 * Math.sin(r * 5 - t * Math.PI * 2));
        const n = vnoise(Math.cos(th + t * 6.283) * 2 + 3, r * 4 - t * 4, 4);
        // colour: dark violet core, purple arms, green lightning at the rim
        const rim = smooth(0.62, 0.98, r);
        const core = 1 - smooth(0.0, 0.55, r);
        let R = lerp(40, 150, arm * (1 - core * 0.8)) * (1 - core * 0.7);
        let G = lerp(10, 40, arm) + 220 * rim * (0.45 + 0.55 * n) * arm;
        let B = lerp(60, 210, arm) * (1 - core * 0.6);
        R = lerp(R, 110, rim * 0.5);
        G = Math.min(255, G + 130 * Math.pow(arm, 3) * smooth(0.3, 0.9, r));
        const a = smooth(1.04, 0.9, r);
        const i = (Y * cv.width + X) * 4;
        img.data[i] = clamp(R / 255) * 255;
        img.data[i + 1] = clamp(G / 255) * 255;
        img.data[i + 2] = clamp(B / 255) * 255;
        img.data[i + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
    // a bright green ring on the lip
    g.save();
    g.translate(c.ax, c.ay);
    g.scale(1, GROUND);
    g.strokeStyle = 'rgba(150,255,110,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 116, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  },
});

defineFx({
  id: 'fx_shockwave',
  w: 300,
  h: 110,
  ax: 150,
  ay: 55,
  frames: 8,
  duration: 0.45,
  loop: false,
  blend: 'add',
  ground: true,
  draw: ({ g, t }) => {
    g.globalCompositeOperation = 'lighter';
    g.save();
    g.translate(150, 55);
    g.scale(1, GROUND);
    const e = easeOut(t);
    const r = 20 + 122 * e;
    const al = 1 - smooth(0.4, 1, t);
    radial(g, 0, 0, r, [[0, 'rgba(255,230,170,0)'], [0.7, `rgba(255,220,150,${0.07 * al})`], [1, 'rgba(255,230,170,0)']]);
    g.strokeStyle = `rgba(255,150,60,${0.5 * al})`;
    g.lineWidth = 16 * (1 - e * 0.6);
    g.beginPath();
    g.arc(0, 0, r - 3, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = `rgba(255,240,210,${al})`;
    g.lineWidth = 7 * (1 - e * 0.7) + 1.5;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  },
});

defineFx({
  id: 'fx_poison_pool',
  w: 190,
  h: 80,
  ax: 95,
  ay: 40,
  frames: 8,
  duration: 1.2,
  loop: true,
  blend: 'normal',
  ground: true,
  draw: ({ g, t }) => {
    const blob = (rx: number, ry: number, col: string, ph: number, amp: number): void => {
      g.fillStyle = col;
      g.beginPath();
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        const wob = 1 + amp * Math.sin(a * 3 + ph) * Math.cos(a * 2 - ph) + amp * 0.5 * Math.sin(a * 5 + Math.PI * 2 * t);
        const x = 95 + Math.cos(a) * rx * wob;
        const y = 40 + Math.sin(a) * ry * wob;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      g.fill();
    };
    blob(84, 29, '#17391b', 0.3, 0.06);
    blob(78, 26, '#2a7a2c', 0.3, 0.06);
    blob(70, 22, '#52c23a', 1.7, 0.05);
    blob(56, 16, '#7cea4e', 2.9, 0.07);
    g.fillStyle = 'rgba(200,255,150,0.35)';
    g.beginPath();
    g.ellipse(80, 33, 28, 5, -0.1, 0, Math.PI * 2);
    g.fill();
    // bubbles: grow, pop
    const R = rng(51);
    for (let k = 0; k < 8; k++) {
      const bx = 95 + (R() - 0.5) * 120;
      const by = 40 + (R() - 0.5) * 32;
      const life = frac(t + R());
      const rad = (3 + 5 * R()) * (0.35 + 0.65 * smooth(0, 0.8, life));
      if (life < 0.82) {
        g.fillStyle = 'rgba(190,255,140,0.55)';
        g.strokeStyle = 'rgba(30,90,30,0.9)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(bx, by, rad, rad * 0.8, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255,255,230,0.85)';
        g.beginPath();
        g.arc(bx - rad * 0.3, by - rad * 0.3, rad * 0.25, 0, Math.PI * 2);
        g.fill();
      } else {
        const k2 = (life - 0.82) / 0.18;
        g.strokeStyle = `rgba(210,255,160,${1 - k2})`;
        g.lineWidth = 1.4;
        g.beginPath();
        g.ellipse(bx, by, rad * (1 + k2 * 0.8), rad * 0.8 * (1 + k2 * 0.8), 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
  },
});

// ---------------------------------------------------------------------------
// heal, holy beam, lightning, soul, ember
// ---------------------------------------------------------------------------
function star4(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  g.fillStyle = col;
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 2 ? r * 0.28 : r;
    k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

defineFx({
  id: 'fx_heal',
  w: 100,
  h: 140,
  ax: 50,
  ay: 128,
  frames: 8,
  duration: 0.9,
  loop: true,
  blend: 'add',
  draw: ({ g, t }) => {
    g.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    ellipseGlow(g, 50, 128, 40, GROUND, [[0, `rgba(255,236,150,${0.5 + 0.2 * pulse})`], [0.6, 'rgba(255,200,80,0.25)'], [1, 'rgba(255,200,80,0)']]);
    g.strokeStyle = `rgba(255,240,170,${0.6 + 0.3 * pulse})`;
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(50, 128, 34, 34 * GROUND, 0, 0, Math.PI * 2);
    g.stroke();
    const R = rng(61);
    for (let k = 0; k < 12; k++) {
      const x0 = 50 + (R() - 0.5) * 56;
      const life = frac(t + R());
      const y = 124 - life * 112;
      const x = x0 + Math.sin(life * Math.PI * 3 + k) * 5;
      const al = Math.sin(Math.PI * life);
      const s = 2.6 + 3.2 * R();
      radial(g, x, y, s * 2.4, [[0, `rgba(255,236,150,${0.7 * al})`], [1, 'rgba(255,200,80,0)']]);
      if (k % 3 === 0) star4(g, x, y, s * 1.8, `rgba(255,250,215,${al})`);
      else {
        g.fillStyle = `rgba(255,250,220,${al})`;
        g.beginPath();
        g.arc(x, y, s * 0.7, 0, Math.PI * 2);
        g.fill();
      }
    }
  },
});

defineFx({
  id: 'fx_holy_beam',
  w: 150,
  h: 440,
  ax: 75,
  ay: 420,
  frames: 8,
  duration: 0.8,
  loop: false,
  blend: 'add',
  draw: ({ g, t, i }) => {
    g.globalCompositeOperation = 'lighter';
    const env = smooth(0, 0.22, t) * (1 - smooth(0.7, 1, t));
    const width = 12 + 24 * smooth(0, 0.25, t) - 10 * smooth(0.7, 1, t);
    const cx = 75;
    const flick = 0.9 + 0.1 * Math.sin(i * 2.3);
    // soft wide column
    const col = (w: number, a: number, c: string): void => {
      const gr = g.createLinearGradient(cx - w, 0, cx + w, 0);
      gr.addColorStop(0, `rgba(${c},0)`);
      gr.addColorStop(0.5, `rgba(${c},${a * env * flick})`);
      gr.addColorStop(1, `rgba(${c},0)`);
      const vg = g.createLinearGradient(0, 0, 0, 420);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(cx - w * 0.75, 0);
      g.lineTo(cx + w * 0.75, 0);
      g.lineTo(cx + w, 420);
      g.lineTo(cx - w, 420);
      g.closePath();
      g.fill();
      void vg;
    };
    col(width * 1.5, 0.35, '255,225,140');
    col(width, 0.55, '255,240,190');
    col(width * 0.45, 0.95, '255,255,245');
    // fade the very top away
    g.globalCompositeOperation = 'destination-out';
    const top = g.createLinearGradient(0, 0, 0, 120);
    top.addColorStop(0, 'rgba(0,0,0,1)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, 150, 120);
    g.globalCompositeOperation = 'lighter';
    // rising motes
    const R = rng(71);
    for (let k = 0; k < 14; k++) {
      const x = cx + (R() - 0.5) * width * 1.4;
      const life = frac(t * 1.5 + R());
      const y = 410 - life * 380;
      const al = Math.sin(Math.PI * life) * env;
      radial(g, x, y, 5, [[0, `rgba(255,250,220,${al})`], [1, 'rgba(255,220,120,0)']]);
    }
    // ground flare
    ellipseGlow(g, cx, 420, 62 * (0.5 + env), GROUND, [[0, `rgba(255,252,230,${env})`], [0.5, `rgba(255,220,130,${0.6 * env})`], [1, 'rgba(255,200,90,0)']]);
    g.strokeStyle = `rgba(255,240,180,${0.8 * env})`;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(cx, 420, 50 * (0.6 + 0.6 * t), 50 * (0.6 + 0.6 * t) * GROUND, 0, 0, Math.PI * 2);
    g.stroke();
  },
});

defineFx({
  id: 'fx_lightning',
  w: 110,
  h: 340,
  ax: 55,
  ay: 330,
  frames: 4,
  duration: 0.2,
  loop: false,
  blend: 'add',
  draw: ({ g, i }) => {
    g.globalCompositeOperation = 'lighter';
    const R = rng(100 + i * 17);
    const bolt = (x0: number, y0: number, x1: number, y1: number, disp: number, out: Array<[number, number]>): void => {
      if (disp < 3) {
        out.push([x1, y1]);
        return;
      }
      const mx = (x0 + x1) / 2 + (R() - 0.5) * disp;
      const my = (y0 + y1) / 2;
      bolt(x0, y0, mx, my, disp / 2, out);
      bolt(mx, my, x1, y1, disp / 2, out);
    };
    const path = (pts: Array<[number, number]>, w: number, col: string): void => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    };
    const main: Array<[number, number]> = [[55 + (R() - 0.5) * 30, 0]];
    bolt(main[0][0], 0, 55, 328, 70, main);
    const fl = [1, 0.85, 1, 0.6][i];
    path(main, 14, `rgba(110,150,255,${0.3 * fl})`);
    path(main, 7, `rgba(170,200,255,${0.55 * fl})`);
    path(main, 3.4, `rgba(255,255,255,${fl})`);
    // branches
    for (let b = 0; b < 3; b++) {
      const k = 6 + Math.floor(R() * (main.length - 14));
      const [sx, sy] = main[k];
      const br: Array<[number, number]> = [[sx, sy]];
      bolt(sx, sy, sx + (R() - 0.5) * 90, sy + 50 + R() * 70, 34, br);
      path(br, 4, `rgba(150,190,255,${0.5 * fl})`);
      path(br, 1.8, `rgba(255,255,255,${0.9 * fl})`);
    }
    ellipseGlow(g, 55, 330, 42, GROUND * 1.2, [[0, `rgba(230,240,255,${fl})`], [0.5, `rgba(120,160,255,${0.5 * fl})`], [1, 'rgba(100,140,255,0)']]);
  },
});

defineFx({
  id: 'fx_soul',
  w: 60,
  h: 96,
  ax: 30,
  ay: 30,
  frames: 8,
  duration: 0.8,
  loop: true,
  blend: 'add',
  draw: ({ g, t }) => {
    g.globalCompositeOperation = 'lighter';
    const ph = t * Math.PI * 2;
    const hx = 30 + Math.sin(ph) * 2;
    const hy = 30 + Math.cos(ph) * 1.5;
    for (let k = 14; k >= 1; k--) {
      const u = k / 14;
      const x = 30 + Math.sin(ph - u * 3.2) * (3 + 8 * u) * (0.5 + u);
      const y = 32 + u * 58;
      const r = 12 * (1 - u * 0.85);
      radial(g, x, y, r, [[0, `rgba(170,255,225,${0.55 * (1 - u)})`], [1, 'rgba(60,200,180,0)']]);
    }
    radial(g, hx, hy, 24, [[0, 'rgba(120,255,210,0.5)'], [1, 'rgba(60,200,180,0)']]);
    radial(g, hx, hy, 13, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(190,255,235,0.95)'], [1, 'rgba(90,220,190,0)']]);
  },
});

defineFx({
  id: 'fx_ember',
  w: 40,
  h: 56,
  ax: 20,
  ay: 24,
  frames: 8,
  duration: 0.8,
  loop: true,
  blend: 'add',
  draw: ({ g, t }) => {
    g.globalCompositeOperation = 'lighter';
    const ph = t * Math.PI * 2;
    const x = 20 + Math.sin(ph) * 3;
    const y = 24 + Math.cos(ph) * 2;
    const f = 0.8 + 0.2 * Math.sin(ph * 2);
    for (let k = 5; k >= 1; k--) {
      const u = k / 5;
      radial(g, 20 + Math.sin(ph - u * 1.6) * 3, y + u * 18, 4 * (1 - u * 0.6), [[0, `rgba(255,150,50,${0.35 * (1 - u)})`], [1, 'rgba(255,100,20,0)']]);
    }
    radial(g, x, y, 15 * f, [[0, 'rgba(255,170,60,0.55)'], [1, 'rgba(255,100,20,0)']]);
    radial(g, x, y, 6.5 * f, [[0, 'rgba(255,250,210,1)'], [0.5, 'rgba(255,200,80,1)'], [1, 'rgba(255,120,30,0)']]);
  },
});

defineFx({
  id: 'fx_glow',
  w: 120,
  h: 120,
  ax: 60,
  ay: 60,
  frames: 4,
  duration: 0.8,
  loop: true,
  blend: 'add',
  draw: ({ g, t }) => {
    g.globalCompositeOperation = 'lighter';
    const f = 0.88 + 0.12 * Math.sin(t * Math.PI * 2);
    radial(g, 60, 60, 58 * f, [[0, 'rgba(255,255,255,0.95)'], [0.25, 'rgba(255,255,255,0.5)'], [0.6, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']]);
  },
});

// ---------------------------------------------------------------------------
// bake: render, filter, pack, preview
// ---------------------------------------------------------------------------
function boxDown(src: HTMLCanvasElement, f: number): HTMLCanvasElement {
  const w = Math.floor(src.width / f);
  const h = Math.floor(src.height / f);
  const d = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height).data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const og = out.getContext('2d', { willReadFrequently: true })!;
  const o = og.createImageData(w, h);
  const inv = 1 / (f * f);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const i = ((y * f + dy) * src.width + x * f + dx) * 4;
          const al = d[i + 3];
          r += d[i] * al;
          g += d[i + 1] * al;
          b += d[i + 2] * al;
          a += al;
        }
      }
      const j = (y * w + x) * 4;
      if (a > 0) {
        o.data[j] = r / a;
        o.data[j + 1] = g / a;
        o.data[j + 2] = b / a;
        o.data[j + 3] = a * inv;
      }
    }
  }
  og.putImageData(o, 0, 0);
  return out;
}

export interface FxBake {
  files: OutFile[];
  preview: HTMLCanvasElement;
}

export function bakeFx(def: FxDef): FxBake {
  const masters: HTMLCanvasElement[] = [];
  for (let i = 0; i < def.frames; i++) {
    const cv = document.createElement('canvas');
    cv.width = def.w * S;
    cv.height = def.h * S;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    g.scale(S, S);
    const t = def.loop ? i / def.frames : def.frames === 1 ? 0 : i / (def.frames - 1);
    def.draw({ g, cv, W: def.w, H: def.h, ax: def.ax, ay: def.ay, t, i, n: def.frames });
    masters.push(cv);
  }
  const scales: Record<string, { div: number; scale: number }> = { hd: { div: 2, scale: 1.5 }, sd: { div: 3, scale: 1 } };
  const files: OutFile[] = [];
  const pages: Record<string, number> = {};
  const hdFrames: HTMLCanvasElement[] = [];
  for (const [s, { div }] of Object.entries(scales)) {
    const items: PackItem[] = [];
    masters.forEach((m, i) => {
      const c = boxDown(m, div);
      if (s === 'hd') hdFrames.push(c);
      const t = trim(c, 1);
      items.push({ name: `play/${i}`, canvas: t.canvas, trimX: t.x, trimY: t.y, sourceW: t.sourceW, sourceH: t.sourceH });
    });
    const packed = pack(items, 2048, 2);
    pages[s] = packed.length;
    packed.forEach((p, i) => files.push(webpFile(`public/assets/sprites/${s}/${def.id}-${i}.webp`, p.canvas, 0.95)));
    files.push(jsonFile(`public/assets/sprites/${s}/${def.id}.json`, multiatlasJson(packed, (i) => `${def.id}-${i}.webp`)));
  }
  const meta = {
    id: def.id,
    frameW: def.w,
    frameH: def.h,
    anchorX: def.ax,
    anchorY: def.ay,
    height: def.ay,
    facing: 1,
    shadow: false,
    pages,
    anims: { play: { frames: def.frames, duration: def.duration, loop: def.loop } },
    blend: def.blend,
    ground: !!def.ground,
  };
  files.push(jsonFile(`public/assets/sprites/meta/${def.id}.json`, meta));

  // preview strip on a dark stone background; additive frames use 'lighter'
  const z = Math.min(1, 1880 / (def.frames * (def.w + 6) * 1.5));
  const cell = (def.w + 6) * 1.5;
  const prev = document.createElement('canvas');
  prev.width = Math.ceil(def.frames * cell * z);
  prev.height = Math.ceil((def.h + 6) * 1.5 * z) + 14;
  const pg = prev.getContext('2d')!;
  pg.fillStyle = '#1d2029';
  pg.fillRect(0, 0, prev.width, prev.height);
  pg.fillStyle = '#262a35';
  for (let y = 0; y < prev.height; y += 24) for (let x = (y / 24) % 2 ? 0 : 24; x < prev.width; x += 48) pg.fillRect(x, y, 24, 24);
  hdFrames.forEach((c, i) => {
    pg.globalCompositeOperation = def.blend === 'add' ? 'lighter' : 'source-over';
    pg.drawImage(c, 0, 0, c.width, c.height, (i * cell + 4.5) * z, 4.5 * z, c.width * z, c.height * z);
    pg.globalCompositeOperation = 'source-over';
    pg.strokeStyle = 'rgba(255,255,255,0.18)';
    const ax = (i * cell + 4.5 + def.ax * 1.5) * z;
    const ay = (4.5 + def.ay * 1.5) * z;
    pg.beginPath();
    pg.moveTo(ax - 4, ay);
    pg.lineTo(ax + 4, ay);
    pg.moveTo(ax, ay - 4);
    pg.lineTo(ax, ay + 4);
    pg.stroke();
  });
  pg.fillStyle = '#fff';
  pg.font = '11px monospace';
  pg.fillText(`${def.id}  ${def.frames}f ${def.duration}s ${def.loop ? 'loop' : 'once'} ${def.blend}${def.ground ? ' ground' : ''}  frame ${def.w}x${def.h} anchor ${def.ax},${def.ay}`, 4, prev.height - 3);
  files.push(pngFile(`output/bake/preview/${def.id}.png`, prev));
  return { files, preview: prev };
}
