/**
 * Spell icons, relic icons and UI icons (generated placeholder art).
 * Spell/relic icons are round badges; UI icons are bold glyphs on transparent.
 */
import { ASH_SPEC, portrait } from './characters';
import {
  OUT,
  PAL,
  circle,
  ellipse,
  fillStroke,
  gloss,
  hashKey,
  hsl,
  line,
  poly,
  radial,
  rrect,
  shade,
  star,
  stick,
  type Ctx,
} from './kit';

// ---------------------------------------------------------------------------
// shared glyph pieces (drawn around a centre, unit size ~ 40 px)
// ---------------------------------------------------------------------------

export function coinGlyph(ctx: Ctx, x: number, y: number, r: number): void {
  circle(ctx, x, y, r, PAL.gold, Math.max(1.5, r * 0.22));
  ctx.beginPath();
  ctx.arc(x, y, r * 0.66, 0, Math.PI * 2);
  ctx.strokeStyle = PAL.goldD;
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.stroke();
  star(ctx, x, y, r * 0.38, r * 0.17, 4, '#fff1b0', 0);
  gloss(ctx, x - r * 0.35, y - r * 0.4, r * 0.3, r * 0.18, 0.55);
}

export function manaGlyph(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.2);
  ctx.bezierCurveTo(x + r * 0.9, y - r * 0.2, x + r, y + r * 0.2, x + r, y + r * 0.35);
  ctx.arc(x, y + r * 0.35, r, 0, Math.PI);
  ctx.bezierCurveTo(x - r, y + r * 0.2, x - r * 0.9, y - r * 0.2, x, y - r * 1.2);
  ctx.closePath();
  fillStroke(ctx, radial(ctx, x - r * 0.2, y, r * 1.4, [[0, '#bfe6ff'], [0.5, '#4aa8ff'], [1, '#2457b8']]), Math.max(1.5, r * 0.2));
  gloss(ctx, x - r * 0.35, y + r * 0.05, r * 0.22, r * 0.38, 0.6);
}

export function ironGlyph(ctx: Ctx, x: number, y: number, r: number): void {
  poly(ctx, [x - r * 1.1, y + r * 0.6, x + r * 1.1, y + r * 0.6, x + r * 0.75, y - r * 0.45, x - r * 0.75, y - r * 0.45], PAL.steel, Math.max(1.5, r * 0.2));
  poly(ctx, [x - r * 0.75, y - r * 0.45, x + r * 0.75, y - r * 0.45, x + r * 0.55, y - r * 0.05, x - r * 0.55, y - r * 0.05], '#dfe6ee', 0);
  ctx.fillStyle = '#dfe6ee';
  ctx.fill();
  line(ctx, x - r * 0.9, y + r * 0.6, x + r * 0.9, y + r * 0.6, PAL.steelD, Math.max(1, r * 0.15));
}

export function bookGlyph(ctx: Ctx, x: number, y: number, r: number): void {
  rrect(ctx, x - r, y - r * 0.8, r * 2, r * 1.6, r * 0.25, '#6b3d24', Math.max(1.5, r * 0.18));
  rrect(ctx, x - r * 0.72, y - r * 0.55, r * 1.44, r * 1.1, r * 0.2, '#8f5a36', 0);
  // face
  ellipse(ctx, x - r * 0.3, y - r * 0.1, r * 0.18, r * 0.22, '#f1e3b0', Math.max(1, r * 0.08));
  ellipse(ctx, x + r * 0.3, y - r * 0.1, r * 0.18, r * 0.22, '#f1e3b0', Math.max(1, r * 0.08));
  circle(ctx, x - r * 0.28, y - r * 0.08, r * 0.08, OUT, 0);
  circle(ctx, x + r * 0.32, y - r * 0.08, r * 0.08, OUT, 0);
  ctx.beginPath();
  ctx.arc(x, y + r * 0.45, r * 0.3, Math.PI * 1.1, Math.PI * 1.9);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.stroke();
  line(ctx, x - r * 0.9, y + r * 0.8, x + r * 0.9, y + r * 0.8, '#e8dcc0', Math.max(1, r * 0.12));
}

export function skullGlyph(ctx: Ctx, x: number, y: number, r: number): void {
  rrect(ctx, x - r * 0.5, y + r * 0.3, r, r * 0.6, r * 0.2, PAL.bone, Math.max(1.5, r * 0.15));
  circle(ctx, x, y - r * 0.1, r * 0.85, PAL.bone, Math.max(1.5, r * 0.15));
  ellipse(ctx, x - r * 0.33, y - r * 0.05, r * 0.24, r * 0.28, '#2a1d30', 0);
  ellipse(ctx, x + r * 0.33, y - r * 0.05, r * 0.24, r * 0.28, '#2a1d30', 0);
  poly(ctx, [x, y + r * 0.2, x + r * 0.12, y + r * 0.42, x - r * 0.12, y + r * 0.42], '#2a1d30', 0);
  for (let i = -1; i <= 1; i++) line(ctx, x + i * r * 0.22, y + r * 0.55, x + i * r * 0.22, y + r * 0.8, '#2a1d30', Math.max(1, r * 0.08));
}

function lockGlyph(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y - r * 0.2, r * 0.55, Math.PI, Math.PI * 2);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = r * 0.42;
  ctx.stroke();
  ctx.strokeStyle = PAL.steel;
  ctx.lineWidth = r * 0.22;
  ctx.stroke();
  rrect(ctx, x - r * 0.85, y - r * 0.25, r * 1.7, r * 1.25, r * 0.2, PAL.gold, Math.max(1.5, r * 0.15));
  circle(ctx, x, y + r * 0.25, r * 0.16, OUT, 0);
  stick(ctx, x, y + r * 0.3, x, y + r * 0.6, r * 0.12, OUT, 0);
}

// ---------------------------------------------------------------------------
// spell badges (80x80)
// ---------------------------------------------------------------------------

function badge(ctx: Ctx, w: number, h: number, inner: string, outer: string): void {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  fillStroke(ctx, radial(ctx, cx - r * 0.3, cy - r * 0.3, r * 1.4, [[0, inner], [1, outer]]), 3);
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,220,140,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

type IconDraw = (ctx: Ctx, w: number, h: number) => void;

const SPELL_ICONS: Record<string, IconDraw> = {
  icon_super_boomstick(ctx, w, h) {
    badge(ctx, w, h, '#7a4a2a', '#3a1f14');
    star(ctx, w * 0.72, h * 0.3, 16, 7, 8, PAL.fireL, 2.5);
    star(ctx, w * 0.72, h * 0.3, 8, 4, 8, '#fff6c8', 0);
    stick(ctx, w * 0.2, h * 0.78, w * 0.4, h * 0.62, 9, PAL.wood);
    stick(ctx, w * 0.36, h * 0.64, w * 0.66, h * 0.36, 6, '#5b5f6a');
    line(ctx, w * 0.39, h * 0.6, w * 0.64, h * 0.36, '#9aa0aa', 1.5);
  },
  icon_arrow_volley(ctx, w, h) {
    badge(ctx, w, h, '#3f7a4a', '#1c3a22');
    for (const [dx, dy] of [[-14, -8], [2, -14], [14, 2]]) {
      const x = w / 2 + dx;
      const y = h / 2 + dy;
      stick(ctx, x - 12, y - 14, x + 8, y + 12, 3, PAL.cloth, 2);
      poly(ctx, [x + 10, y + 16, x + 3, y + 11, x + 11, y + 7], PAL.steel, 2);
      poly(ctx, [x - 12, y - 14, x - 15, y - 6, x - 9, y - 10], PAL.red, 1.5);
    }
  },
  icon_magic_words(ctx, w, h) {
    badge(ctx, w, h, '#4f3a7a', '#221838');
    const cx = w / 2;
    const cy = h / 2 + 6;
    poly(ctx, [cx, cy - 10, cx - 24, cy - 16, cx - 24, cy + 12, cx, cy + 16], '#efe2bf', 2.5);
    poly(ctx, [cx, cy - 10, cx + 24, cy - 16, cx + 24, cy + 12, cx, cy + 16], '#f7ecd0', 2.5);
    for (let i = 0; i < 3; i++) {
      line(ctx, cx - 19, cy - 8 + i * 7, cx - 5, cy - 5 + i * 7, '#7dffa0', 2);
      line(ctx, cx + 5, cy - 5 + i * 7, cx + 19, cy - 8 + i * 7, '#7dffa0', 2);
    }
    star(ctx, cx, cy - 24, 8, 3, 4, '#a8ffbe', 1.5);
  },
  icon_catapult_volley(ctx, w, h) {
    badge(ctx, w, h, '#6a6a7a', '#2a2a36');
    for (let i = 0; i < 3; i++) line(ctx, w * 0.18 + i * 6, h * 0.26 + i * 4, w * 0.42 + i * 6, h * 0.46 + i * 4, 'rgba(255,255,255,0.55)', 3);
    circle(ctx, w * 0.6, h * 0.6, 16, '#8f8a84');
    circle(ctx, w * 0.54, h * 0.66, 4, '#6c6862', 0);
    circle(ctx, w * 0.66, h * 0.54, 3, '#6c6862', 0);
    gloss(ctx, w * 0.55, h * 0.53, 6, 3.5, 0.45);
  },
  icon_wrong_book(ctx, w, h) {
    badge(ctx, w, h, '#5a2a6e', '#1e0c26');
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, 24 - i * 7, i * 1.3, i * 1.3 + Math.PI * 1.5);
      ctx.strokeStyle = i % 2 ? '#7dff7a' : '#c07dff';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    circle(ctx, cx, cy, 4, '#0c0410', 2);
  },
  icon_chainsaw(ctx, w, h) {
    badge(ctx, w, h, '#7a2a2a', '#2e0e0e');
    rrect(ctx, w * 0.16, h * 0.46, 24, 18, 5, PAL.red);
    rrect(ctx, w * 0.42, h * 0.5, 30, 10, 5, PAL.steel);
    for (let i = 0; i < 6; i++) poly(ctx, [w * 0.44 + i * 5, h * 0.5, w * 0.44 + i * 5 + 2.5, h * 0.44, w * 0.44 + i * 5 + 5, h * 0.5], PAL.steelD, 1.2);
    stick(ctx, w * 0.2, h * 0.46, w * 0.3, h * 0.36, 4, '#3a3a40', 2);
  },
  icon_deathcoaster(ctx, w, h) {
    badge(ctx, w, h, '#7a5a2a', '#2e200e');
    ellipse(ctx, w * 0.28, h * 0.58, 12, 6, PAL.fire, 2);
    ellipse(ctx, w * 0.24, h * 0.58, 6, 3, PAL.fireL, 0);
    rrect(ctx, w * 0.3, h * 0.38, 34, 20, 6, '#4a4a58');
    rrect(ctx, w * 0.5, h * 0.28, 14, 12, 3, '#6a6a7a');
    circle(ctx, w * 0.42, h * 0.66, 7, '#2a2a30');
    circle(ctx, w * 0.68, h * 0.66, 7, '#2a2a30');
    circle(ctx, w * 0.42, h * 0.66, 2.5, PAL.steel, 0);
    circle(ctx, w * 0.68, h * 0.66, 2.5, PAL.steel, 0);
  },
};

export function drawSpellIcon(key: string): IconDraw {
  const known = SPELL_ICONS[key];
  if (known) return known;
  const hue = hashKey(key) % 360;
  return (ctx, w, h) => {
    badge(ctx, w, h, hsl(hue, 0.45, 0.42), hsl(hue, 0.5, 0.14));
    star(ctx, w / 2, h / 2, 20, 9, 5, hsl(hue, 0.9, 0.72), 2.5);
  };
}

export function drawRelicIcon(key: string): IconDraw {
  const hue = hashKey(key) % 360;
  return (ctx, w, h) => {
    rrect(ctx, 3, 3, w - 6, h - 6, 12, radial(ctx, w * 0.4, h * 0.35, w, [[0, '#4a3a5a'], [1, '#1c1424']]), 3);
    const cx = w / 2;
    const cy = h / 2;
    poly(ctx, [cx, cy - 18, cx + 15, cy - 4, cx, cy + 18, cx - 15, cy - 4], hsl(hue, 0.8, 0.6), 2.5);
    poly(ctx, [cx, cy - 18, cx + 15, cy - 4, cx, cy - 1, cx - 15, cy - 4], hsl(hue, 0.8, 0.78), 0);
    ctx.fillStyle = hsl(hue, 0.8, 0.78);
    ctx.fill();
    stick(ctx, cx - 10, cy - 20, cx, cy - 26, 2, PAL.gold, 1.4);
    stick(ctx, cx + 10, cy - 20, cx, cy - 26, 2, PAL.gold, 1.4);
  };
}

// ---------------------------------------------------------------------------
// UI icons (48x48)
// ---------------------------------------------------------------------------

export const UI_ICONS: Record<string, IconDraw> = {
  ui_pause(ctx, w, h) {
    rrect(ctx, w * 0.28, h * 0.2, w * 0.16, h * 0.6, 3, '#ffffff');
    rrect(ctx, w * 0.56, h * 0.2, w * 0.16, h * 0.6, 3, '#ffffff');
  },
  ui_speed(ctx, w, h) {
    poly(ctx, [w * 0.14, h * 0.24, w * 0.5, h * 0.5, w * 0.14, h * 0.76], '#ffffff');
    poly(ctx, [w * 0.48, h * 0.24, w * 0.84, h * 0.5, w * 0.48, h * 0.76], '#ffffff');
  },
  ui_play(ctx, w, h) {
    poly(ctx, [w * 0.3, h * 0.2, w * 0.8, h * 0.5, w * 0.3, h * 0.8], '#ffffff');
  },
  ui_dodge(ctx, w, h) {
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.52, w * 0.28, Math.PI * 0.9, Math.PI * 2.2);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.stroke();
    poly(ctx, [w * 0.86, h * 0.52, w * 0.66, h * 0.66, w * 0.92, h * 0.76], '#ffffff', 2.5);
    for (let i = 0; i < 3; i++) line(ctx, w * 0.08, h * (0.36 + i * 0.14), w * 0.2, h * (0.36 + i * 0.14), '#ffffff', 3);
  },
  ui_iron(ctx, w, h) {
    ironGlyph(ctx, w / 2, h / 2 + 2, w * 0.36);
  },
  ui_mana(ctx, w, h) {
    manaGlyph(ctx, w / 2, h / 2 - 1, w * 0.3);
  },
  ui_gold(ctx, w, h) {
    coinGlyph(ctx, w / 2, h / 2, w * 0.4);
  },
  ui_star(ctx, w, h) {
    star(ctx, w / 2, h / 2 + 2, w * 0.46, w * 0.2, 5, PAL.gold, 3);
    gloss(ctx, w * 0.42, h * 0.42, w * 0.1, h * 0.06, 0.6);
  },
  ui_star_empty(ctx, w, h) {
    star(ctx, w / 2, h / 2 + 2, w * 0.46, w * 0.2, 5, '#3a3046', 3);
  },
  ui_lock(ctx, w, h) {
    lockGlyph(ctx, w / 2, h / 2 + 3, w * 0.36);
  },
  ui_skull(ctx, w, h) {
    skullGlyph(ctx, w / 2, h / 2, w * 0.4);
  },
  ui_book(ctx, w, h) {
    bookGlyph(ctx, w / 2, h / 2, w * 0.4);
  },
  ui_ash(ctx, w) {
    ctx.save();
    const k = w / 48;
    ctx.scale(k * 1.15, k * 1.15);
    ctx.translate(-9, -7);
    portrait(ctx, ASH_SPEC);
    ctx.restore();
  },
  ui_cancel(ctx, w, h) {
    stick(ctx, w * 0.26, h * 0.26, w * 0.74, h * 0.74, 7, '#ffffff', 3);
    stick(ctx, w * 0.74, h * 0.26, w * 0.26, h * 0.74, 7, '#ffffff', 3);
  },
  ui_heart(ctx, w, h) {
    const x = w / 2;
    const y = h * 0.42;
    const r = w * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, y + r * 2);
    ctx.bezierCurveTo(x - r * 3, y, x - r * 1.4, y - r * 2, x, y - r * 0.6);
    ctx.bezierCurveTo(x + r * 1.4, y - r * 2, x + r * 3, y, x, y + r * 2);
    ctx.closePath();
    fillStroke(ctx, PAL.red, 3);
    gloss(ctx, x - r, y - r * 0.4, r * 0.5, r * 0.3, 0.5);
  },
  ui_sword(ctx, w, h) {
    stick(ctx, w * 0.24, h * 0.76, w * 0.78, h * 0.22, 6, PAL.steel);
    stick(ctx, w * 0.2, h * 0.58, w * 0.42, h * 0.8, 4, PAL.gold, 2);
    stick(ctx, w * 0.24, h * 0.76, w * 0.14, h * 0.86, 4, PAL.leather, 2);
  },
  ui_castle(ctx, w, h) {
    poly(ctx, [w * 0.18, h * 0.88, w * 0.18, h * 0.3, w * 0.3, h * 0.3, w * 0.3, h * 0.4, w * 0.42, h * 0.4, w * 0.42, h * 0.3, w * 0.58, h * 0.3, w * 0.58, h * 0.4, w * 0.7, h * 0.4, w * 0.7, h * 0.3, w * 0.82, h * 0.3, w * 0.82, h * 0.88], '#a8a0b8');
    ctx.beginPath();
    ctx.moveTo(w * 0.4, h * 0.88);
    ctx.lineTo(w * 0.4, h * 0.66);
    ctx.arc(w * 0.5, h * 0.66, w * 0.1, Math.PI, 0);
    ctx.lineTo(w * 0.6, h * 0.88);
    ctx.closePath();
    fillStroke(ctx, '#2a2032', 2);
  },
  ui_spellbook(ctx, w, h) {
    const cx = w / 2;
    const cy = h * 0.56;
    poly(ctx, [cx, cy - 7, cx - 18, cy - 12, cx - 18, cy + 10, cx, cy + 14], '#efe2bf', 2.5);
    poly(ctx, [cx, cy - 7, cx + 18, cy - 12, cx + 18, cy + 10, cx, cy + 14], '#f7ecd0', 2.5);
    star(ctx, cx, cy - 20, 7, 2.6, 4, '#a8ffbe', 1.5);
  },
  ui_gear(ctx, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? w * 0.42 : w * 0.32;
      const a0 = (i / 16) * Math.PI * 2 - 0.12;
      const a1 = (i / 16) * Math.PI * 2 + 0.12;
      ctx.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
      ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    }
    ctx.closePath();
    fillStroke(ctx, '#d8d0e4', 3);
    circle(ctx, cx, cy, w * 0.13, '#2a2032', 2);
  },
  ui_back(ctx, w, h) {
    poly(ctx, [w * 0.18, h * 0.5, w * 0.52, h * 0.18, w * 0.52, h * 0.36, w * 0.84, h * 0.36, w * 0.84, h * 0.64, w * 0.52, h * 0.64, w * 0.52, h * 0.82], '#ffffff');
  },
  ui_shop(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.3);
    ctx.quadraticCurveTo(w * 0.1, h * 0.9, w * 0.5, h * 0.9);
    ctx.quadraticCurveTo(w * 0.9, h * 0.9, w * 0.7, h * 0.3);
    ctx.closePath();
    fillStroke(ctx, '#b07a3a', 3);
    rrect(ctx, w * 0.28, h * 0.16, w * 0.44, h * 0.16, 4, '#8a5a2a', 2.5);
    coinGlyph(ctx, w * 0.5, h * 0.62, w * 0.16);
  },
  ui_retry(ctx, w, h) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.28, Math.PI * 0.3, Math.PI * 1.85);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.stroke();
    poly(ctx, [w * 0.66, h * 0.08, w * 0.86, h * 0.3, w * 0.58, h * 0.36], '#ffffff', 2.5);
  },
  ui_map(ctx, w, h) {
    poly(ctx, [w * 0.12, h * 0.22, w * 0.38, h * 0.14, w * 0.62, h * 0.22, w * 0.88, h * 0.14, w * 0.88, h * 0.78, w * 0.62, h * 0.86, w * 0.38, h * 0.78, w * 0.12, h * 0.86], '#e8d6a8', 3);
    line(ctx, w * 0.38, h * 0.16, w * 0.38, h * 0.78, shade('#e8d6a8', -0.3), 2);
    line(ctx, w * 0.62, h * 0.22, w * 0.62, h * 0.84, shade('#e8d6a8', -0.3), 2);
    ctx.setLineDash([3, 3]);
    line(ctx, w * 0.2, h * 0.7, w * 0.72, h * 0.36, PAL.red, 2.5);
    ctx.setLineDash([]);
    stick(ctx, w * 0.7, h * 0.3, w * 0.8, h * 0.4, 2.5, PAL.red, 1.5);
    stick(ctx, w * 0.8, h * 0.3, w * 0.7, h * 0.4, 2.5, PAL.red, 1.5);
  },
  ui_check(ctx, w, h) {
    poly(ctx, [w * 0.16, h * 0.52, w * 0.3, h * 0.38, w * 0.44, h * 0.54, w * 0.74, h * 0.2, w * 0.88, h * 0.34, w * 0.44, h * 0.8], '#7ee07a', 3);
  },
  ui_up(ctx, w, h) {
    poly(ctx, [w * 0.5, h * 0.12, w * 0.86, h * 0.5, w * 0.64, h * 0.5, w * 0.64, h * 0.88, w * 0.36, h * 0.88, w * 0.36, h * 0.5, w * 0.14, h * 0.5], '#7ee07a', 3);
  },
  ui_export(ctx, w, h) {
    rrect(ctx, w * 0.14, h * 0.56, w * 0.72, h * 0.3, 4, '#a8a0b8', 3);
    poly(ctx, [w * 0.5, h * 0.08, w * 0.76, h * 0.34, w * 0.6, h * 0.34, w * 0.6, h * 0.6, w * 0.4, h * 0.6, w * 0.4, h * 0.34, w * 0.24, h * 0.34], '#ffffff', 2.5);
  },
  ui_import(ctx, w, h) {
    rrect(ctx, w * 0.14, h * 0.56, w * 0.72, h * 0.3, 4, '#a8a0b8', 3);
    poly(ctx, [w * 0.5, h * 0.66, w * 0.76, h * 0.4, w * 0.6, h * 0.4, w * 0.6, h * 0.1, w * 0.4, h * 0.1, w * 0.4, h * 0.4, w * 0.24, h * 0.4], '#ffffff', 2.5);
  },
  ui_trash(ctx, w, h) {
    rrect(ctx, w * 0.24, h * 0.3, w * 0.52, h * 0.58, 4, '#e86a5a', 3);
    rrect(ctx, w * 0.16, h * 0.2, w * 0.68, h * 0.1, 2, '#e86a5a', 2.5);
    rrect(ctx, w * 0.4, h * 0.1, w * 0.2, h * 0.1, 2, '#e86a5a', 2.5);
    for (const x of [0.38, 0.5, 0.62]) line(ctx, w * x, h * 0.4, w * x, h * 0.78, OUT, 2);
  },
  ui_crown(ctx, w, h) {
    poly(ctx, [w * 0.14, h * 0.76, w * 0.14, h * 0.3, w * 0.32, h * 0.5, w * 0.5, h * 0.2, w * 0.68, h * 0.5, w * 0.86, h * 0.3, w * 0.86, h * 0.76], PAL.gold, 3);
    circle(ctx, w * 0.5, h * 0.6, w * 0.07, PAL.red, 1.5);
  },
  ui_globe(ctx, w, h) {
    circle(ctx, w / 2, h / 2, w * 0.38, '#4aa8ff', 3);
    ellipse(ctx, w / 2, h / 2, w * 0.16, w * 0.38, null, 2);
    line(ctx, w * 0.14, h * 0.5, w * 0.86, h * 0.5, OUT, 2);
  },
};
