/**
 * Props, pickups, projectiles, particles and scenery (generated placeholder art).
 * Particle frames are white so render can tint them.
 */
import { bookGlyph, coinGlyph, manaGlyph } from './icons';
import {
  OUT,
  PAL,
  circle,
  ellipse,
  fillStroke,
  gloss,
  line,
  linear,
  poly,
  radial,
  rrect,
  shade,
  star,
  stick,
  type Ctx,
} from './kit';

type Draw = (ctx: Ctx, w: number, h: number) => void;

// ---- pickups --------------------------------------------------------------

export const drawCoin: Draw = (ctx, w, h) => coinGlyph(ctx, w / 2, h / 2, Math.min(w, h) / 2 - 2);

export const drawManaOrb: Draw = (ctx, w, h) => {
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, w / 2, h / 2, w / 2, [[0, 'rgba(120,200,255,0.6)'], [1, 'rgba(120,200,255,0)']]);
  ctx.fill();
  manaGlyph(ctx, w / 2, h / 2 + 1, w * 0.26);
};

export const drawFood: Draw = (ctx, w, h) => {
  ellipse(ctx, w / 2, h / 2 + 1, w / 2 - 3, h / 2 - 3, '#d9963f');
  gloss(ctx, w * 0.38, h * 0.38, w * 0.18, h * 0.12, 0.4);
  for (let i = 0; i < 3; i++) line(ctx, w * (0.32 + i * 0.16), h * 0.3, w * (0.26 + i * 0.16), h * 0.58, '#a8692a', 2);
};

// ---- projectiles (all point RIGHT) -----------------------------------------

export const drawShot: Draw = (ctx, w, h) => {
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
  ctx.fillStyle = linear(ctx, 0, 0, w, 0, [[0, 'rgba(255,200,90,0)'], [0.6, 'rgba(255,220,120,0.8)'], [1, '#fff8d0']]);
  ctx.fill();
  circle(ctx, w - h / 2, h / 2, h / 2 - 1.5, '#fff6c8', 0);
};

export const drawArrow: Draw = (ctx, w, h) => {
  const y = h / 2;
  stick(ctx, 4, y, w - 7, y, 2, PAL.cloth, 1.6);
  poly(ctx, [w - 1, y, w - 9, y - 3.6, w - 9, y + 3.6], PAL.steel, 1.6);
  poly(ctx, [2, y - 3.6, 9, y, 2, y + 3.6, 5, y], PAL.red, 1.4);
};

export const drawBolt: Draw = (ctx, w, h) => {
  const y = h / 2;
  stick(ctx, 3, y, w - 7, y, 3, '#6b4a2a', 1.6);
  poly(ctx, [w - 1, y, w - 9, y - 4, w - 9, y + 4], PAL.steelD, 1.6);
  poly(ctx, [2, y - 3, 7, y, 2, y + 3], PAL.cloth, 1.4);
};

export const drawFireball: Draw = (ctx, w, h) => {
  ctx.beginPath();
  ctx.moveTo(2, h / 2);
  ctx.quadraticCurveTo(w * 0.5, h * 0.05, w - h / 2, h * 0.12);
  ctx.arc(w - h / 2, h / 2, h / 2 - 1.5, -Math.PI / 2, Math.PI / 2);
  ctx.quadraticCurveTo(w * 0.5, h * 0.95, 2, h / 2);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, 0, w, 0, [[0, 'rgba(255,90,20,0.2)'], [0.5, PAL.fire], [1, PAL.fireL]]), 2);
  circle(ctx, w - h / 2, h / 2, h / 4, '#fff6c8', 0);
};

export const drawRock: Draw = (ctx, w, h) => {
  poly(ctx, [w * 0.2, h * 0.2, w * 0.6, h * 0.06, w * 0.92, h * 0.34, w * 0.86, h * 0.8, w * 0.42, h * 0.94, w * 0.1, h * 0.7], '#8f8a84', 2.5);
  circle(ctx, w * 0.4, h * 0.55, w * 0.08, '#6c6862', 0);
  gloss(ctx, w * 0.38, h * 0.3, w * 0.14, h * 0.08, 0.45);
};

// ---- particles & overlays (white, tinted at runtime) -----------------------

export const drawDot: Draw = (ctx, w, h) => {
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, w / 2, h / 2, w / 2, [[0, '#ffffff'], [0.45, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fill();
};

export const drawSpark: Draw = (ctx, w, h) => {
  ctx.save();
  ctx.scale(1, h / w);
  ctx.beginPath();
  ctx.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, w / 2, w / 2, w / 2, [[0, '#ffffff'], [0.35, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fill();
  ctx.restore();
};

export const drawSmoke: Draw = (ctx, w, h) => {
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, w / 2, h / 2, w / 2, [[0, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fill();
};

export const drawGlow: Draw = (ctx, w, h) => {
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, w / 2, h / 2, w / 2, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fill();
};

export const drawRing: Draw = (ctx, w, h) => {
  const r = w / 2 - 4;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3.5;
  ctx.stroke();
};

export const drawStar4: Draw = (ctx, w, h) => star(ctx, w / 2, h / 2, w / 2 - 1, w * 0.12, 4, '#ffffff', 0);

export const drawShard: Draw = (ctx, w, h) => poly(ctx, [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2], '#ffffff', 0);

export const drawBoneChip: Draw = (ctx, w, h) => {
  stick(ctx, 3.5, h / 2, w - 3.5, h / 2, 2.6, PAL.bone, 1.2);
  circle(ctx, 3, h / 2 - 1.4, 2, PAL.bone, 1.1);
  circle(ctx, 3, h / 2 + 1.4, 2, PAL.bone, 1.1);
  circle(ctx, w - 3, h / 2 - 1.4, 2, PAL.bone, 1.1);
  circle(ctx, w - 3, h / 2 + 1.4, 2, PAL.bone, 1.1);
};

export const drawShadow: Draw = (ctx, w, h) => {
  ctx.save();
  ctx.scale(1, h / w);
  ctx.beginPath();
  ctx.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, w / 2, w / 2, w / 2, [[0, 'rgba(0,0,0,0.5)'], [0.6, 'rgba(0,0,0,0.32)'], [1, 'rgba(0,0,0,0)']]);
  ctx.fill();
  ctx.restore();
};

/** White edges, clear centre: tinted red for the Ash-hurt vignette. */
export const drawVignette: Draw = (ctx, w, h) => {
  ctx.save();
  ctx.scale(1, h / w);
  const r = (w / 2) * 1.25;
  ctx.fillStyle = radial(ctx, w / 2, w / 2, r, [[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(255,255,255,0)'], [0.85, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0.95)']]);
  ctx.fillRect(0, 0, w, w);
  ctx.restore();
};

export const drawPx: Draw = (ctx, w, h) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
};

// ---- Necronomicon + stand ---------------------------------------------------

export const drawBook: Draw = (ctx, w, h) => bookGlyph(ctx, w / 2, h / 2, Math.min(w / 2, h / 1.6) - 2);

export const drawBookStand: Draw = (ctx, w, h) => {
  poly(ctx, [w * 0.12, h * 0.22, w * 0.88, h * 0.1, w * 0.92, h * 0.24, w * 0.16, h * 0.36], PAL.wood, 3);
  stick(ctx, w * 0.5, h * 0.3, w * 0.5, h - 10, 8, PAL.woodD);
  poly(ctx, [w * 0.2, h - 3, w * 0.8, h - 3, w * 0.66, h - 12, w * 0.34, h - 12], PAL.woodD, 3);
  // candle
  rrect(ctx, w * 0.82, h * 0.32, 6, 14, 2, '#efe6cf', 2);
  ellipse(ctx, w * 0.82 + 3, h * 0.32 - 4, 3, 5, PAL.fireL, 1.5);
};

export const drawWallCatapult: Draw = (ctx, w, h) => {
  rrect(ctx, 4, h - 14, w - 8, 10, 3, PAL.woodD);
  stick(ctx, w * 0.3, h - 12, w * 0.5, h * 0.38, 4, PAL.woodD);
  stick(ctx, w * 0.7, h - 12, w * 0.5, h * 0.38, 4, PAL.woodD);
  stick(ctx, w * 0.62, h - 16, w * 0.16, h * 0.2, 4.5, PAL.wood);
  ellipse(ctx, w * 0.14, h * 0.18, 7, 4.5, PAL.woodD, 2);
  poly(ctx, [w * 0.78, h * 0.3, w * 0.96, h * 0.36, w * 0.78, h * 0.42], PAL.blue, 2);
  stick(ctx, w * 0.78, h * 0.3, w * 0.78, h - 14, 2, PAL.woodD, 1.5);
};

// ---- castle (world x 0..420; canvas y = worldY - (groundY - 340)) ---------------

function bricks(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, bw = 28, bh = 14): void {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const dark = shade(base, -0.28);
  const light = shade(base, 0.12);
  for (let row = 0, yy = y; yy < y + h; row++, yy += bh) {
    const off = row % 2 ? bw / 2 : 0;
    for (let xx = x - off; xx < x + w; xx += bw) {
      ctx.fillStyle = (row * 7 + Math.round(xx)) % 5 === 0 ? light : base;
      ctx.fillRect(xx + 1, yy + 1, bw - 2, bh - 2);
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(xx + 1, yy + 1, bw - 2, bh - 2);
    }
  }
  ctx.restore();
}

function crenels(ctx: Ctx, x0: number, x1: number, y: number, h: number, color: string, mw = 18, gap = 12): void {
  for (let x = x0; x + mw <= x1 + 0.5; x += mw + gap) rrect(ctx, x, y - h, mw, h + 4, 2, color, 3);
}

/** 420 x 370; the ground line is at canvas y = 340. */
export const drawCastle: Draw = (ctx) => {
  const gy = 340;
  const stone = '#8a8299';
  const stoneD = '#5d556c';
  // --- book room (x 0..160): back wall interior
  bricks(ctx, 0, 120, 162, gy - 120, '#4a4258', 26, 13);
  ctx.fillStyle = 'rgba(10,6,18,0.35)';
  ctx.fillRect(0, 120, 162, gy - 120);
  // window
  ctx.beginPath();
  ctx.moveTo(48, 250);
  ctx.lineTo(48, 196);
  ctx.arc(70, 196, 22, Math.PI, 0);
  ctx.lineTo(92, 250);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, 174, 0, 250, [[0, '#2b2d5c'], [1, '#c76f5d']]), 4);
  line(ctx, 70, 176, 70, 250, OUT, 3);
  line(ctx, 48, 214, 92, 214, OUT, 3);
  // banner
  poly(ctx, [118, 150, 146, 150, 146, 222, 132, 210, 118, 222], PAL.blue, 3);
  star(ctx, 132, 178, 8, 3.5, 5, PAL.gold, 1.5);
  // torch sconces
  for (const x of [22, 104]) {
    rrect(ctx, x - 3, 232, 6, 18, 2, PAL.iron, 2);
    ellipse(ctx, x, 224, 5, 9, PAL.fire, 2);
    ellipse(ctx, x, 227, 2.6, 4.5, PAL.fireL, 0);
  }
  // floor
  rrect(ctx, -4, gy - 4, 170, 40, 2, '#5d556c', 3);
  // room ceiling mass + tower
  bricks(ctx, 0, 40, 168, 82, stone, 28, 14);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 40, 168, 82);
  rrect(ctx, -4, 112, 176, 12, 3, stoneD, 3);
  crenels(ctx, 2, 164, 40, 18, stone, 20, 10);
  // --- curtain wall (x 160..340)
  bricks(ctx, 164, 28, 176, gy - 28, stone, 30, 15);
  ctx.fillStyle = linear(ctx, 0, 28, 0, gy, [[0, 'rgba(255,255,255,0.06)'], [1, 'rgba(0,0,0,0.25)']]);
  ctx.fillRect(164, 28, 176, gy - 28);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3.5;
  ctx.strokeRect(164, 28, 176, gy - 28 + 4);
  crenels(ctx, 166, 340, 28, 20, stone, 20, 11);
  rrect(ctx, 160, 52, 184, 9, 3, stoneD, 3);
  // arrow slits
  for (const x of [192, 252, 312]) rrect(ctx, x - 3, 96, 6, 26, 3, '#1d1724', 2);
  // gate arch (open)
  ctx.beginPath();
  ctx.moveTo(204, gy + 2);
  ctx.lineTo(204, 214);
  ctx.arc(252, 214, 48, Math.PI, 0);
  ctx.lineTo(300, gy + 2);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, 166, 0, gy, [[0, '#120d18'], [1, '#2a2234']]), 4);
  // raised portcullis
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(204, 214);
  ctx.arc(252, 214, 46, Math.PI, 0);
  ctx.lineTo(300, 236);
  ctx.lineTo(204, 236);
  ctx.closePath();
  ctx.clip();
  for (let x = 210; x < 300; x += 12) line(ctx, x, 160, x, 236, '#3a3440', 4);
  for (let y = 180; y < 238; y += 14) line(ctx, 200, y, 304, y, '#3a3440', 3);
  ctx.restore();
  // keystone + arch stones
  ctx.beginPath();
  ctx.arc(252, 214, 52, Math.PI, 0);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.strokeStyle = '#a49cb2';
  ctx.lineWidth = 8;
  ctx.stroke();
  rrect(ctx, 244, 152, 16, 18, 3, '#a49cb2', 3);
  // wall banner
  poly(ctx, [318, 70, 336, 70, 336, 130, 327, 122, 318, 130], PAL.blue, 3);
  // --- stairs (x 340..400)
  const steps: Array<[number, number]> = [[340, gy - 18], [360, gy - 12], [380, gy - 6]];
  for (const [x, top] of steps) {
    rrect(ctx, x - 2, top, 24, gy - top + 8, 2, '#8a8299', 3);
    line(ctx, x, top + 2, x + 20, top + 2, 'rgba(255,255,255,0.25)', 2);
  }
};
