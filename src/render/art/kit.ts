/**
 * Tiny Canvas 2D drawing kit for the generated placeholder art.
 * Every helper works in logical px (the atlas builder scales the context by
 * renderScale before calling a draw function) and uses the thick dark outline
 * of the bright-cartoon art direction (SPEC §0).
 */
export type Ctx = CanvasRenderingContext2D;
export type Fill = string | CanvasGradient | null;

/** outline colour used everywhere */
export const OUT = '#1b1424';
export const LW = 3;
/** current default outline width (art scaled up uses a thinner one so outlines stay ~3-4 px on screen) */
let curLW = LW;
export function setLW(v: number): void {
  curLW = v;
}
export function getLW(): number {
  return curLW;
}

export const PAL = {
  steel: '#b6c0cc',
  steelD: '#7d8896',
  iron: '#8e98a6',
  wood: '#9a6634',
  woodD: '#62401f',
  bone: '#efe5c8',
  boneD: '#c9bb94',
  gold: '#f5c542',
  goldD: '#b9862a',
  skin: '#f4c9a1',
  skinD: '#d9a27a',
  red: '#d9413b',
  redD: '#8f2420',
  blue: '#3f74d6',
  blueD: '#284b94',
  green: '#4f9a45',
  greenD: '#2f6129',
  purple: '#7d4bb3',
  purpleD: '#4b2a73',
  leather: '#7a4f2c',
  cloth: '#e8dcc0',
  fire: '#ff8a2a',
  fireL: '#ffd34a',
  ghoul: '#93a77c',
  ghoulD: '#5f7150',
  eyeRed: '#ff3b2f',
  eyeYellow: '#ffe14a',
  dark: '#2a1f33',
} as const;

export function fillStroke(ctx: Ctx, fill: Fill, lw = curLW, stroke: string = OUT): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

export function circle(ctx: Ctx, x: number, y: number, r: number, fill: Fill, lw = curLW): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  fillStroke(ctx, fill, lw);
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: Fill, lw = curLW, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  fillStroke(ctx, fill, lw);
}

export function rrectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: Fill, lw = curLW): void {
  rrectPath(ctx, x, y, w, h, r);
  fillStroke(ctx, fill, lw);
}

export function poly(ctx: Ctx, pts: readonly number[], fill: Fill, lw = curLW, close = true): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  if (close) ctx.closePath();
  fillStroke(ctx, fill, lw);
}

/** An outlined thick stroke (limbs, shafts, blades). */
export function stick(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, width: number, fill: string, lw = curLW): void {
  ctx.lineCap = 'round';
  if (lw > 0) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = width + lw * 2;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = fill;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Plain line without outline. */
export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Soft cartoon highlight. */
export function gloss(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.28): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.fill();
}

export function radial(ctx: Ctx, x: number, y: number, r: number, stops: Array<[number, string]>): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Array<[number, string]>): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Five-point (or n-point) star path. */
export function star(ctx: Ctx, x: number, y: number, rOut: number, rIn: number, points: number, fill: Fill, lw = curLW, rot = -Math.PI / 2): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = rot + (i * Math.PI) / points;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  fillStroke(ctx, fill, lw);
}

// ---- colour helpers -------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** amt > 0 lightens towards white, < 0 darkens towards black. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  return rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
}

export function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** Stable small hash for generated variants of unknown sprite keys. */
export function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
