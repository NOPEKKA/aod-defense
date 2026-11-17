/**
 * Generated stand-in for the baked castle-courtyard backgrounds (ART_BIBLE section 6) used
 * while a chapter has no baked background yet. Same layout and layers as the baked ones:
 * sky (parallax 0), far (0.35), main (1, tiles of 1280) and a sparse front layer (1.2),
 * plus the anchors the game places animated props on. Painted once with Canvas 2D at the
 * asset quality scale and cached in the texture manager for the session.
 */
import type { Balance } from '../../contracts';
import type { BgMeta } from '../assets/library';

type Ctx = CanvasRenderingContext2D;
type World = Balance['world'];

export interface ChapterPalette {
  skyTop: string;
  skyMid: string;
  skyLow: string;
  moon: string;
  moonGlow: string;
  moonX: number;
  moonY: number;
  moonR: number;
  stars: number;
  clouds: string;
  farA: string;
  farB: string;
  stone: string;
  stoneDark: string;
  mortar: string;
  floor: string;
  floorLight: string;
  torch: string;
  ambient: string;
  spriteTint: string;
  weather: 'none' | 'rain' | 'embers' | 'fog';
  graves: boolean;
  fires: boolean;
}

export const PALETTES: ChapterPalette[] = [
  // 1 dusk
  { skyTop: '#1e1b3e', skyMid: '#6a3a62', skyLow: '#f08a52', moon: '#ffe6b0', moonGlow: 'rgba(255,190,120,0.35)', moonX: 0.72, moonY: 150, moonR: 30, stars: 18, clouds: 'rgba(120,70,110,0.55)', farA: '#3a2a4a', farB: '#2a1f38', stone: '#6e6676', stoneDark: '#3e3846', mortar: '#2a2430', floor: '#6a5440', floorLight: '#8e7456', torch: '#ff9a3c', ambient: 'rgba(255,150,90,0.10)', spriteTint: '#fff2e4', weather: 'none', graves: false, fires: false },
  // 2 storm
  { skyTop: '#151a24', skyMid: '#2e3a4a', skyLow: '#5a6a78', moon: '#dfe6ee', moonGlow: 'rgba(200,220,240,0.12)', moonX: 0.3, moonY: 110, moonR: 0, stars: 0, clouds: 'rgba(30,36,46,0.85)', farA: '#2a323e', farB: '#1e242e', stone: '#5e6672', stoneDark: '#323842', mortar: '#1e2228', floor: '#4e4a44', floorLight: '#6a665e', torch: '#ffa04a', ambient: 'rgba(120,150,200,0.08)', spriteTint: '#d4dcea', weather: 'rain', graves: false, fires: false },
  // 3 full-moon night
  { skyTop: '#060a1c', skyMid: '#14214a', skyLow: '#2e4a7a', moon: '#e8f0ff', moonGlow: 'rgba(160,190,255,0.35)', moonX: 0.62, moonY: 120, moonR: 46, stars: 120, clouds: 'rgba(40,56,96,0.5)', farA: '#1a2440', farB: '#10182e', stone: '#5a6280', stoneDark: '#2c3048', mortar: '#181a28', floor: '#4a4650', floorLight: '#66626e', torch: '#ff9a3c', ambient: 'rgba(110,140,230,0.10)', spriteTint: '#cfd8f4', weather: 'none', graves: false, fires: false },
  // 4 castle on fire
  { skyTop: '#140608', skyMid: '#4a1410', skyLow: '#c0461c', moon: '#ffb070', moonGlow: 'rgba(255,120,40,0.25)', moonX: 0.8, moonY: 130, moonR: 26, stars: 30, clouds: 'rgba(40,16,14,0.8)', farA: '#2e1210', farB: '#1c0a0a', stone: '#6a5650', stoneDark: '#3a2a28', mortar: '#201414', floor: '#5a4234', floorLight: '#7e5a40', torch: '#ff7a24', ambient: 'rgba(255,90,30,0.14)', spriteTint: '#ffd8bc', weather: 'embers', graves: false, fires: true },
  // 5 blood moon
  { skyTop: '#0c040c', skyMid: '#3a0a1c', skyLow: '#6a1830', moon: '#ff4a3a', moonGlow: 'rgba(255,40,40,0.35)', moonX: 0.68, moonY: 140, moonR: 50, stars: 60, clouds: 'rgba(60,16,40,0.6)', farA: '#2a0e1e', farB: '#180812', stone: '#5e4a5a', stoneDark: '#30222e', mortar: '#180e16', floor: '#4a3a3e', floorLight: '#62505a', torch: '#ff8a3c', ambient: 'rgba(180,40,120,0.12)', spriteTint: '#ecc8d8', weather: 'fog', graves: true, fires: false },
];

export function paletteOf(chapter: number): ChapterPalette {
  return PALETTES[Math.max(0, Math.min(PALETTES.length - 1, chapter - 1))];
}

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(c: string, k: number): string {
  const [r, g, b] = hex(c);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rgba(c: string, a: number): string {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------------------------------------------------------------------------
// layout of the generated courtyard (logical px), derived from balance.world

export interface CourtyardGeo {
  gy: number;
  wallBase: number;
  wallTop: number;
  bookX: number;
  castleRight: number;
  stairsX: number;
  pitL: number;
  pitR: number;
  fieldRight: number;
  width: number;
  smithL: number;
  smithR: number;
  forgeX: number;
  torches: number[];
}

export function courtyardGeo(w: World): CourtyardGeo {
  const torches: number[] = [];
  for (let x = 880; x < w.fieldRight - 120; x += 330) torches.push(x);
  return {
    gy: w.groundY,
    wallBase: w.groundY - 90,
    wallTop: 150,
    bookX: w.bookX,
    castleRight: w.castleRight,
    stairsX: w.stairsX,
    pitL: w.pit.left,
    pitR: w.pit.right,
    fieldRight: w.fieldRight,
    width: w.width,
    smithL: 520,
    smithR: 760,
    forgeX: 590,
    torches,
  };
}

/** BgMeta for the generated courtyard (same shape as a baked one). */
export function fallbackMeta(chapter: number, w: World): BgMeta {
  const g = courtyardGeo(w);
  const p = paletteOf(chapter);
  const W = w.width;
  return {
    id: `fallback_${chapter}`,
    chapter,
    worldW: W,
    viewH: 720,
    layers: [
      { id: 'sky', parallax: 0, w: 1600, h: 720, tileW: 1600, tiles: 1, alpha: false },
      { id: 'far', parallax: 0.35, w: 1940, h: 720, tileW: 1940, tiles: 1, alpha: true },
      { id: 'main', parallax: 1, w: W, h: 720, tileW: 1280, tiles: Math.ceil(W / 1280), alpha: false },
      { id: 'front', parallax: 1.2, w: 2820, h: 720, tileW: 1410, tiles: 2, alpha: true, over: true },
    ],
    anchors: {
      book: { x: g.bookX, y: g.gy - 52 },
      smith: { x: 668, y: g.gy - 50 },
      forge: { x: g.forgeX, y: g.gy - 96 },
      archers: [
        { x: g.castleRight - 110, y: 196 },
        { x: g.castleRight - 70, y: 196 },
        { x: g.castleRight - 30, y: 196 },
        { x: g.castleRight - 150, y: 196 },
        { x: 70, y: 96 },
        { x: 120, y: 96 },
      ],
      catapult: { x: 150, y: 96 },
      pit: { x: g.pitL, y: g.gy - 10, w: g.pitR - g.pitL, h: 34 },
      torches: [
        { x: 40, y: 318, scale: 0.8 },
        { x: 176, y: 318, scale: 0.8 },
        { x: g.castleRight - 128, y: 300, scale: 0.9 },
        { x: g.castleRight - 12, y: 300, scale: 0.9 },
        ...g.torches.map((x) => ({ x, y: 282, scale: 1 })),
      ],
      glows: [
        { x: g.bookX, y: g.gy - 110, r: 150, color: '#7dff9a', a: 0.22 },
        { x: g.forgeX, y: g.gy - 92, r: 210, color: '#ff8a2a', a: 0.4 },
      ],
    },
    grade: { spriteTint: p.spriteTint, fog: p.weather === 'fog' ? 0.5 : 0, weather: p.weather },
  };
}

// ---------------------------------------------------------------------------
// painters (ctx is pre-scaled to logical px)

export function paintSky(ctx: Ctx, w: number, h: number, p: ChapterPalette): void {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.75);
  g.addColorStop(0, p.skyTop);
  g.addColorStop(0.55, p.skyMid);
  g.addColorStop(1, p.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rnd = lcg(11);
  for (let i = 0; i < p.stars; i++) {
    const x = rnd() * w;
    const y = rnd() * h * 0.45;
    const r = rnd() < 0.12 ? 1.6 : 0.9;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.moonR > 0) {
    const mx = w * p.moonX;
    const my = p.moonY;
    const glow = ctx.createRadialGradient(mx, my, p.moonR * 0.6, mx, my, p.moonR * 5);
    glow.addColorStop(0, p.moonGlow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - p.moonR * 5, my - p.moonR * 5, p.moonR * 10, p.moonR * 10);
    const mg = ctx.createRadialGradient(mx - p.moonR * 0.3, my - p.moonR * 0.3, 1, mx, my, p.moonR);
    mg.addColorStop(0, shade(p.moon, 0.4));
    mg.addColorStop(1, p.moon);
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(mx, my, p.moonR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (const [dx, dy, r] of [[-0.3, 0.1, 0.22], [0.25, -0.3, 0.14], [0.2, 0.35, 0.12]]) {
      ctx.beginPath();
      ctx.arc(mx + dx * p.moonR, my + dy * p.moonR, r * p.moonR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // cloud banks
  const cr = lcg(23);
  for (let i = 0; i < 14; i++) {
    const cx = cr() * w;
    const cy = 60 + cr() * 220;
    const rw = 120 + cr() * 220;
    const rh = 14 + cr() * 22;
    ctx.fillStyle = p.clouds;
    ctx.globalAlpha = 0.35 + cr() * 0.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + rw * 0.3, cy - rh * 0.6, rw * 0.5, rh * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function paintFar(ctx: Ctx, w: number, h: number, p: ChapterPalette): void {
  const rnd = lcg(5);
  // mountain ridge
  ctx.fillStyle = p.farB;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 40; x += 40) ctx.lineTo(x, 150 - Math.abs(Math.sin(x * 0.004 + 1.3)) * 70 - Math.sin(x * 0.013) * 18 - rnd() * 10);
  ctx.lineTo(w + 40, h);
  ctx.closePath();
  ctx.fill();
  // distant towers and keeps
  ctx.fillStyle = p.farA;
  const towers = [[160, 70, 34], [420, 40, 44], [470, 80, 26], [880, 60, 38], [1230, 30, 52], [1290, 76, 30], [1650, 56, 40], [1840, 84, 28]];
  for (const [x, top, tw] of towers) {
    ctx.fillRect(x - tw / 2, top, tw, h - top);
    // pointed roof
    ctx.beginPath();
    ctx.moveTo(x - tw / 2 - 5, top);
    ctx.lineTo(x, top - tw * 1.1);
    ctx.lineTo(x + tw / 2 + 5, top);
    ctx.closePath();
    ctx.fill();
    // lit window
    ctx.fillStyle = rgba(p.torch, 0.7);
    ctx.fillRect(x - 3, top + 22, 6, 9);
    ctx.fillStyle = p.farA;
  }
  // tree line
  ctx.fillStyle = p.farA;
  for (let x = 0; x < w; x += 9 + rnd() * 10) {
    const th = 22 + rnd() * 30;
    ctx.beginPath();
    ctx.moveTo(x - 9, 160);
    ctx.lineTo(x, 160 - th);
    ctx.lineTo(x + 9, 160);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(0, 158, w, h - 158);
}

/** One stone course of the wall: staggered blocks with bevel light and mortar. */
function stones(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, p: ChapterPalette, seed: number, bw = 46, bh = 26): void {
  const rnd = lcg(seed);
  ctx.fillStyle = p.mortar;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  let row = 0;
  for (let y = y0; y < y1; y += bh, row++) {
    const off = row % 2 ? bw * 0.5 : 0;
    for (let x = x0 - off; x < x1; x += bw) {
      const w = bw - 3 - rnd() * 4;
      const hh = bh - 3;
      const k = (rnd() - 0.5) * 0.16;
      ctx.fillStyle = shade(p.stone, k);
      ctx.fillRect(x + 1.5, y + 1.5, w, hh);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + 1.5, y + 1.5, w, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + 1.5, y + hh - 2, w, 3.5);
      if (rnd() < 0.18) {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(x + 4 + rnd() * w * 0.5, y + 6, 6 + rnd() * 10, 3);
      }
      if (rnd() < 0.08) {
        // moss
        ctx.fillStyle = 'rgba(70,96,50,0.35)';
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y + hh, w * 0.4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function crenels(ctx: Ctx, x0: number, x1: number, top: number, p: ChapterPalette): void {
  for (let x = x0; x < x1; x += 46) {
    ctx.fillStyle = p.stoneDark;
    ctx.fillRect(x, top - 26, 28, 30);
    ctx.fillStyle = shade(p.stone, -0.05);
    ctx.fillRect(x + 2, top - 24, 24, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 2, top - 24, 24, 4);
  }
}

function torchLight(ctx: Ctx, x: number, y: number, r: number, color: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 4, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.45, rgba(color, a * 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function plank(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, rnd: () => number): void {
  ctx.fillStyle = shade(base, (rnd() - 0.5) * 0.2);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x, y, w, 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const yy = y + 3 + rnd() * (h - 6);
    ctx.moveTo(x + 2, yy);
    ctx.lineTo(x + w - 2, yy + (rnd() - 0.5) * 2);
    ctx.stroke();
  }
}

function barrel(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.fillStyle = '#5a3a22';
  ctx.beginPath();
  ctx.ellipse(x, y - 22 * s, 16 * s, 24 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a5232';
  ctx.fillRect(x - 15 * s, y - 40 * s, 30 * s, 36 * s);
  ctx.fillStyle = '#3c3a40';
  ctx.fillRect(x - 16 * s, y - 36 * s, 32 * s, 4 * s);
  ctx.fillRect(x - 16 * s, y - 12 * s, 32 * s, 4 * s);
  ctx.fillStyle = '#4a2e1a';
  ctx.beginPath();
  ctx.ellipse(x, y - 40 * s, 15 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(x - 11 * s, y - 38 * s, 5 * s, 30 * s);
}

function crate(ctx: Ctx, x: number, y: number, s: number, rnd: () => number): void {
  const w = 40 * s;
  plank(ctx, x - w / 2, y - w, w, w, '#7a5434', rnd);
  ctx.strokeStyle = '#3a2414';
  ctx.lineWidth = 3 * s;
  ctx.strokeRect(x - w / 2 + 1.5, y - w + 1.5, w - 3, w - 3);
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 3, y - w + 3);
  ctx.lineTo(x + w / 2 - 3, y - 3);
  ctx.stroke();
}

function banner(ctx: Ctx, x: number, y: number, len: number, color: string): void {
  ctx.fillStyle = '#3a3036';
  ctx.fillRect(x - 22, y - 4, 44, 6);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 18, y);
  ctx.lineTo(x + 18, y);
  ctx.lineTo(x + 18, y + len);
  ctx.lineTo(x, y + len - 14);
  ctx.lineTo(x - 18, y + len);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 6, y, 12, len - 8);
  ctx.fillStyle = '#e8b83a';
  ctx.fillRect(x - 18, y + 4, 36, 3);
  // emblem
  ctx.beginPath();
  ctx.moveTo(x, y + len * 0.3);
  ctx.lineTo(x + 8, y + len * 0.42);
  ctx.lineTo(x, y + len * 0.56);
  ctx.lineTo(x - 8, y + len * 0.42);
  ctx.closePath();
  ctx.fill();
}

function sconce(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = '#26222a';
  ctx.fillRect(x - 3, y, 6, 22);
  ctx.fillRect(x - 9, y + 16, 18, 4);
  ctx.fillStyle = '#4a3a2a';
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x + 7, y);
  ctx.lineTo(x + 4, y + 10);
  ctx.lineTo(x - 4, y + 10);
  ctx.closePath();
  ctx.fill();
}

function grave(ctx: Ctx, x: number, y: number, s: number, rnd: () => number): void {
  ctx.fillStyle = '#4a4450';
  ctx.beginPath();
  ctx.moveTo(x - 14 * s, y);
  ctx.lineTo(x - 14 * s, y - 30 * s);
  ctx.arc(x, y - 30 * s, 14 * s, Math.PI, 0);
  ctx.lineTo(x + 14 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(x - 12 * s, y - 40 * s, 4 * s, 36 * s);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x - 6 * s, y - 34 * s, 12 * s, 3 * s);
  ctx.fillRect(x - 1.5 * s, y - 40 * s, 3 * s, 16 * s);
  void rnd;
}

function deadTree(ctx: Ctx, x: number, y: number, s: number, rnd: () => number): void {
  ctx.strokeStyle = '#1e1418';
  ctx.lineCap = 'round';
  const branch = (bx: number, by: number, ang: number, len: number, wdt: number, depth: number) => {
    const ex = bx + Math.cos(ang) * len;
    const ey = by + Math.sin(ang) * len;
    ctx.lineWidth = wdt;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (depth <= 0) return;
    branch(ex, ey, ang - 0.4 - rnd() * 0.4, len * 0.68, wdt * 0.62, depth - 1);
    branch(ex, ey, ang + 0.3 + rnd() * 0.4, len * 0.6, wdt * 0.6, depth - 1);
  };
  branch(x, y, -Math.PI / 2, 70 * s, 12 * s, 4);
}

/**
 * The main layer: castle keep with the Necronomicon alcove, gate with battlement, stairs,
 * pit, blacksmith shed, the long back wall with torches and banners, packed-earth floor,
 * and the broken gate where the dead come in.
 */
export function paintMain(ctx: Ctx, W: number, h: number, p: ChapterPalette, g: CourtyardGeo): void {
  const rnd = lcg(97);
  const gy = g.gy;
  const base = g.wallBase;
  // --- sky gap is transparent? no: the main layer is opaque below the wall top; above it the sky shows
  ctx.clearRect(0, 0, W, h);

  // --- back wall
  stones(ctx, g.castleRight - 10, g.wallTop, g.fieldRight + 20, base, p, 3);
  crenels(ctx, g.castleRight - 6, g.fieldRight + 10, g.wallTop, p);
  // walkway lip
  ctx.fillStyle = p.stoneDark;
  ctx.fillRect(g.castleRight - 10, g.wallTop + 26, g.fieldRight - g.castleRight + 30, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(g.castleRight - 10, g.wallTop + 26, g.fieldRight - g.castleRight + 30, 3);
  // buttresses
  for (let x = 820; x < g.fieldRight - 60; x += 420) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x + 38, g.wallTop + 36, 14, base - g.wallTop - 36);
    stones(ctx, x, g.wallTop + 36, x + 40, base, p, x, 40, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, g.wallTop + 36, 6, base - g.wallTop - 36);
  }
  // arched niches with arrow slits
  for (let x = 1040; x < g.fieldRight - 100; x += 420) {
    ctx.fillStyle = '#120e16';
    ctx.beginPath();
    ctx.moveTo(x - 8, 300);
    ctx.lineTo(x - 8, 252);
    ctx.arc(x, 252, 8, Math.PI, 0);
    ctx.lineTo(x + 8, 300);
    ctx.closePath();
    ctx.fill();
  }
  // vertical shading: darker towards the base and the top
  let vg = ctx.createLinearGradient(0, g.wallTop, 0, base);
  vg.addColorStop(0, 'rgba(0,0,0,0.25)');
  vg.addColorStop(0.35, 'rgba(0,0,0,0.0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(g.castleRight - 10, g.wallTop - 30, g.fieldRight - g.castleRight + 30, base - g.wallTop + 30);
  // banners between torches
  for (let i = 0; i < g.torches.length - 1; i++) {
    const x = (g.torches[i] + g.torches[i + 1]) / 2;
    if (i % 2 === 0) banner(ctx, x, 200, 110, p.weather === 'fog' ? '#3a2a6a' : '#2f5ab8');
  }
  // torch light pools on the wall + sconces
  for (const x of g.torches) {
    torchLight(ctx, x, 280, 190, p.torch, 0.42);
    sconce(ctx, x, 284);
  }

  // --- the castle keep (left) with the Necronomicon alcove
  const kx1 = Math.max(160, g.castleRight - 140);
  stones(ctx, 0, 60, kx1, gy - 20, p, 7, 40, 24);
  crenels(ctx, 0, kx1 - 10, 60, p);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(kx1 - 14, 60, 14, gy - 80);
  // alcove (deep, green-lit)
  const ax0 = Math.max(20, g.bookX - 70);
  const ax1 = Math.min(kx1 - 14, g.bookX + 70);
  const aTop = gy - 230;
  ctx.fillStyle = '#0c0a10';
  ctx.beginPath();
  ctx.moveTo(ax0, gy - 30);
  ctx.lineTo(ax0, aTop + (ax1 - ax0) / 2);
  ctx.arc((ax0 + ax1) / 2, aTop + (ax1 - ax0) / 2, (ax1 - ax0) / 2, Math.PI, 0);
  ctx.lineTo(ax1, gy - 30);
  ctx.closePath();
  ctx.fill();
  torchLight(ctx, g.bookX, gy - 110, 120, '#6aff8a', 0.32);
  ctx.strokeStyle = p.stoneDark;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = shade(p.stone, 0.1);
  ctx.lineWidth = 3;
  ctx.stroke();
  // window high on the keep
  ctx.fillStyle = rgba(p.torch, 0.85);
  ctx.fillRect(56, 120, 14, 26);
  ctx.fillRect(110, 120, 14, 26);
  ctx.fillStyle = '#1a1418';
  ctx.fillRect(62, 120, 2, 26);
  ctx.fillRect(116, 120, 2, 26);

  // --- gate section with battlement (archers stand at y ~ 196)
  const gx0 = kx1;
  const gx1 = g.castleRight;
  stones(ctx, gx0, 196, gx1, gy - 20, p, 13, 44, 26);
  ctx.fillStyle = p.stoneDark;
  ctx.fillRect(gx0 - 4, 186, gx1 - gx0 + 8, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(gx0 - 4, 186, gx1 - gx0 + 8, 3);
  // merlons behind the archers
  for (let x = gx0; x < gx1 - 10; x += 40) {
    ctx.fillStyle = shade(p.stone, -0.12);
    ctx.fillRect(x + 4, 150, 22, 38);
  }
  // gate arch
  const gc = (gx0 + gx1) / 2;
  const gw = Math.min(110, gx1 - gx0 - 20);
  const archTop = gy - 200;
  ctx.fillStyle = '#0e0b12';
  ctx.beginPath();
  ctx.moveTo(gc - gw / 2, gy - 20);
  ctx.lineTo(gc - gw / 2, archTop + gw / 2);
  ctx.arc(gc, archTop + gw / 2, gw / 2, Math.PI, 0);
  ctx.lineTo(gc + gw / 2, gy - 20);
  ctx.closePath();
  ctx.fill();
  // warm light from inside the gate
  vg = ctx.createLinearGradient(0, archTop, 0, gy - 20);
  vg.addColorStop(0, 'rgba(255,150,60,0)');
  vg.addColorStop(1, rgba(p.torch, 0.35));
  ctx.fillStyle = vg;
  ctx.fill();
  // raised portcullis teeth
  ctx.strokeStyle = '#2a2630';
  ctx.lineWidth = 4;
  for (let x = gc - gw / 2 + 8; x < gc + gw / 2; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, archTop + 10);
    ctx.lineTo(x, archTop + 50);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(gc - gw / 2 + 4, archTop + 30);
  ctx.lineTo(gc + gw / 2 - 4, archTop + 30);
  ctx.stroke();
  // arch voussoirs
  ctx.strokeStyle = shade(p.stone, 0.12);
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(gc, archTop + gw / 2, gw / 2 + 6, Math.PI, 0);
  ctx.stroke();
  ctx.strokeStyle = p.mortar;
  ctx.lineWidth = 2;
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI + (k / 8) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(gc + Math.cos(a) * (gw / 2 + 1), archTop + gw / 2 + Math.sin(a) * (gw / 2 + 1));
    ctx.lineTo(gc + Math.cos(a) * (gw / 2 + 11), archTop + gw / 2 + Math.sin(a) * (gw / 2 + 11));
    ctx.stroke();
  }
  banner(ctx, gx0 + 18, 210, 80, '#2f5ab8');
  banner(ctx, gx1 - 18, 210, 80, '#2f5ab8');

  // --- floor (packed earth, flagstones near the castle)
  const fl = ctx.createLinearGradient(0, base, 0, h);
  fl.addColorStop(0, shade(p.floor, -0.35));
  fl.addColorStop(0.3, p.floor);
  fl.addColorStop(0.55, p.floorLight);
  fl.addColorStop(0.75, p.floor);
  fl.addColorStop(1, shade(p.floor, -0.45));
  ctx.fillStyle = fl;
  ctx.fillRect(0, base, W, h - base);
  // wall foot shadow
  vg = ctx.createLinearGradient(0, base, 0, base + 40);
  vg.addColorStop(0, 'rgba(0,0,0,0.5)');
  vg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, base, W, 40);
  // flagstones (in perspective: rows get taller towards the camera)
  let y = base + 4;
  let row = 0;
  const flagR = g.pitL - 20;
  while (y < h) {
    const rh = 10 + (y - base) * 0.12;
    const bw = 44 + (y - base) * 0.25;
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -off; x < flagR; x += bw) {
      ctx.fillStyle = shade(p.stone, -0.18 + (rnd() - 0.5) * 0.14);
      ctx.fillRect(x + 1.5, y + 1, bw - 3, rh - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x + 1.5, y + 1, bw - 3, 2);
    }
    y += rh;
    row++;
  }
  // flagstone edge fades into the dirt
  vg = ctx.createLinearGradient(flagR - 60, 0, flagR + 10, 0);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, p.floor);
  ctx.fillStyle = vg;
  ctx.fillRect(flagR - 60, base, 70, h - base);
  // dirt: pebbles, ruts, tufts
  for (let i = 0; i < 900; i++) {
    const x = flagR + rnd() * (W - flagR);
    const yy = base + 8 + rnd() * (h - base - 8);
    const r = 1 + rnd() * 3 * (0.5 + (yy - base) / 300);
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.ellipse(x, yy, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 3;
  for (const ry of [gy - 22, gy + 30]) {
    ctx.beginPath();
    ctx.moveTo(flagR, ry);
    for (let x = flagR; x < W; x += 60) ctx.lineTo(x, ry + Math.sin(x * 0.01) * 3);
    ctx.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const x = g.castleRight + rnd() * (W - g.castleRight);
    const yy = base + 2 + rnd() * 14;
    ctx.strokeStyle = 'rgba(80,110,50,0.55)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(x + k * 2, yy);
      ctx.lineTo(x + k * 2 + (rnd() - 0.5) * 4, yy - 4 - rnd() * 6);
      ctx.stroke();
    }
  }
  if (p.weather === 'rain') {
    for (let i = 0; i < 26; i++) {
      const x = g.pitR + rnd() * (W - g.pitR);
      const yy = gy - 30 + rnd() * 120;
      const pg = ctx.createRadialGradient(x, yy, 2, x, yy, 40);
      pg.addColorStop(0, 'rgba(150,170,200,0.28)');
      pg.addColorStop(1, 'rgba(150,170,200,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.ellipse(x, yy, 50, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- stairs from the gate down to the field
  const sx = g.castleRight - 6;
  for (let k = 0; k < 4; k++) {
    const sy = gy - 40 + k * 10;
    ctx.fillStyle = shade(p.stone, -0.05 - k * 0.04);
    ctx.fillRect(sx - 30 - k * 4, sy, 70 + k * 8, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(sx - 30 - k * 4, sy, 70 + k * 8, 2);
  }

  // --- the pit (hole under the lid sprite)
  ctx.fillStyle = '#07050a';
  ctx.beginPath();
  ctx.ellipse((g.pitL + g.pitR) / 2, gy - 8, (g.pitR - g.pitL) / 2 + 10, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(p.stone, -0.2);
  ctx.lineWidth = 5;
  ctx.stroke();

  // --- blacksmith shed (520..760)
  const s0 = g.smithL;
  const s1 = g.smithR;
  const roofY = base - 130;
  // back wall of the shed (timber)
  for (let x = s0; x < s1; x += 24) plank(ctx, x, roofY + 20, 24, base - roofY - 20, '#5a3a24', rnd);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(s0, roofY + 20, s1 - s0, base - roofY - 20);
  // forge: stone hearth with a glowing mouth and chimney
  const fx = g.forgeX;
  stones(ctx, fx - 46, base - 92, fx + 46, base + 14, p, 41, 22, 16);
  ctx.fillStyle = '#1a0c06';
  ctx.beginPath();
  ctx.ellipse(fx, base - 34, 26, 20, 0, Math.PI, 0);
  ctx.lineTo(fx + 26, base - 20);
  ctx.lineTo(fx - 26, base - 20);
  ctx.closePath();
  ctx.fill();
  torchLight(ctx, fx, base - 30, 90, '#ff8a2a', 0.85);
  ctx.fillStyle = '#ffb040';
  ctx.beginPath();
  ctx.ellipse(fx, base - 24, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  stones(ctx, fx - 20, roofY - 70, fx + 20, base - 92, p, 43, 20, 14);
  // posts
  for (const x of [s0 + 4, s1 - 16]) {
    plank(ctx, x, roofY + 6, 12, gy - roofY - 26, '#6a4428', rnd);
  }
  // thatched roof (sloping towards the camera)
  ctx.fillStyle = p.fires ? '#5a4022' : '#8a6a3a';
  ctx.beginPath();
  ctx.moveTo(s0 - 26, roofY + 34);
  ctx.lineTo(s0 + 10, roofY - 26);
  ctx.lineTo(s1 - 10, roofY - 26);
  ctx.lineTo(s1 + 26, roofY + 34);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  for (let x = s0 - 20; x < s1 + 20; x += 7) {
    ctx.beginPath();
    ctx.moveTo(x, roofY + 32 + rnd() * 3);
    ctx.lineTo(x + 6, roofY - 22);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(s0 - 26, roofY + 30, s1 - s0 + 52, 6);
  // anvil and tools
  const ax = 720;
  ctx.fillStyle = '#3a3a42';
  ctx.fillRect(ax - 16, gy - 74, 32, 26);
  ctx.fillStyle = '#56565e';
  ctx.beginPath();
  ctx.moveTo(ax - 30, gy - 86);
  ctx.lineTo(ax + 34, gy - 86);
  ctx.lineTo(ax + 22, gy - 76);
  ctx.lineTo(ax - 22, gy - 76);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(ax - 28, gy - 86, 56, 2);
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(ax - 22, gy - 50, 44, 20);
  // weapon rack on the shed wall
  ctx.strokeStyle = '#9aa0aa';
  ctx.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(s1 - 70 + k * 12, roofY + 50);
    ctx.lineTo(s1 - 70 + k * 12, roofY + 110);
    ctx.stroke();
  }
  ctx.fillStyle = '#6a4428';
  ctx.fillRect(s1 - 80, roofY + 96, 52, 6);

  // --- props along the wall
  const propR = lcg(311);
  for (let x = 860; x < g.fieldRight - 140; x += 150 + propR() * 160) {
    const kind = propR();
    const yy = base + 6 + propR() * 6;
    if (kind < 0.4) barrel(ctx, x, yy, 0.9 + propR() * 0.2);
    else if (kind < 0.7) {
      crate(ctx, x, yy, 1, propR);
      if (propR() < 0.5) crate(ctx, x + 10, yy - 38, 0.8, propR);
    } else if (kind < 0.85 && p.graves) grave(ctx, x, yy + 10, 1.1, propR);
    else if (kind < 0.85) {
      // hay bale
      ctx.fillStyle = '#b08a42';
      ctx.fillRect(x - 30, yy - 30, 60, 30);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let k = 0; k < 6; k++) ctx.fillRect(x - 28 + k * 10, yy - 28, 2, 26);
    } else {
      barrel(ctx, x, yy, 1);
      barrel(ctx, x + 30, yy + 2, 0.9);
    }
  }
  if (p.graves) {
    const gr = lcg(73);
    for (let i = 0; i < 9; i++) grave(ctx, 900 + gr() * 1400, base + 20 + gr() * 18, 0.9 + gr() * 0.3, gr);
    for (const x of [1180, 1960]) deadTree(ctx, x, base + 10, 1.2, gr);
  }
  if (p.fires) {
    // scorch marks and a burnt cart
    for (let i = 0; i < 6; i++) {
      const x = 900 + rnd() * 1400;
      const sg = ctx.createRadialGradient(x, base + 30, 4, x, base + 30, 70);
      sg.addColorStop(0, 'rgba(0,0,0,0.45)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(x - 70, base - 40, 140, 140);
    }
  }

  // --- broken gate on the right (where the dead come in)
  const bx = g.fieldRight;
  ctx.clearRect(bx + 10, 0, W - bx, base - 10);
  // dark breach with fog
  const bg2 = ctx.createLinearGradient(bx, 0, W, 0);
  bg2.addColorStop(0, 'rgba(10,8,14,0.0)');
  bg2.addColorStop(0.3, 'rgba(10,8,14,0.85)');
  bg2.addColorStop(1, 'rgba(10,8,14,1)');
  ctx.fillStyle = bg2;
  ctx.fillRect(bx, 120, W - bx, base - 110);
  // broken wall stubs
  ctx.fillStyle = p.stoneDark;
  ctx.beginPath();
  ctx.moveTo(bx - 20, base);
  ctx.lineTo(bx - 20, g.wallTop + 20);
  ctx.lineTo(bx + 14, g.wallTop + 70);
  ctx.lineTo(bx + 4, g.wallTop + 130);
  ctx.lineTo(bx + 30, 300);
  ctx.lineTo(bx + 18, base);
  ctx.closePath();
  ctx.fill();
  // rubble pile
  for (let i = 0; i < 40; i++) {
    const rx = bx - 30 + rnd() * (W - bx + 30);
    const ry = base + 10 - rnd() * 50 * (1 - Math.abs(rx - bx - 40) / 120);
    const rs = 6 + rnd() * 14;
    ctx.fillStyle = shade(p.stone, -0.1 - rnd() * 0.3);
    ctx.beginPath();
    ctx.moveTo(rx - rs, ry);
    ctx.lineTo(rx - rs * 0.4, ry - rs * 0.8);
    ctx.lineTo(rx + rs * 0.7, ry - rs * 0.6);
    ctx.lineTo(rx + rs, ry);
    ctx.closePath();
    ctx.fill();
  }
  const fogG = ctx.createLinearGradient(0, base - 60, 0, base + 40);
  fogG.addColorStop(0, 'rgba(120,140,120,0)');
  fogG.addColorStop(0.6, 'rgba(120,150,110,0.22)');
  fogG.addColorStop(1, 'rgba(120,150,110,0)');
  ctx.fillStyle = fogG;
  ctx.fillRect(bx - 40, base - 60, W - bx + 40, 100);

  // --- chapter ambient wash + light pool over the lane
  ctx.fillStyle = p.ambient;
  ctx.fillRect(0, 0, W, h);
  const lane = ctx.createLinearGradient(0, gy - 70, 0, gy + 70);
  lane.addColorStop(0, 'rgba(255,240,210,0)');
  lane.addColorStop(0.5, 'rgba(255,240,210,0.06)');
  lane.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = lane;
  ctx.fillRect(0, gy - 70, W, 140);
  // the sky shows above the wall: cut it out (main layer is drawn over the far layer)
  ctx.clearRect(g.castleRight + 20, 0, g.fieldRight - g.castleRight - 10, g.wallTop - 26);
  for (let x = g.castleRight - 6; x < g.fieldRight + 10; x += 46) ctx.clearRect(x + 28, g.wallTop - 26, 18, 26);
  ctx.clearRect(kx1, 0, g.castleRight - kx1 + 20, 150);
  ctx.clearRect(0, 0, kx1, 34);
}

/** Sparse dark foreground (parallax 1.2): pillars with chains and rubble at the bottom edge. */
export function paintFront(ctx: Ctx, w: number, h: number, p: ChapterPalette): void {
  ctx.clearRect(0, 0, w, h);
  const rnd = lcg(51);
  const dark = shade(p.stoneDark, -0.55);
  for (const x of [1180, 2240]) {
    ctx.fillStyle = dark;
    ctx.fillRect(x - 26, 0, 52, h);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x - 26, 0, 6, h);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let y = 30; y < h; y += 46) ctx.fillRect(x - 26, y, 52, 3);
    // hanging chain
    ctx.strokeStyle = 'rgba(20,16,24,0.95)';
    ctx.lineWidth = 3;
    for (let y = 0; y < 220; y += 10) {
      ctx.beginPath();
      ctx.ellipse(x + 40, y + 5, 3, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w;
    const s = 10 + rnd() * 24;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(x, h - 40 + rnd() * 30, s * 1.6, s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
