/**
 * The HUD / menu material (ART_BIBLE section 8): dark stone slabs with riveted iron rims,
 * wooden boards for the unit slots, round iron-ringed spell buttons, gold numbers with a black
 * edge. Everything is drawn into a Graphics object (cheap, batched with the rest of the HUD).
 */
import type { Rect } from '../../contracts';
import { icon as bakedIcon } from '../assets/library';
import { spriteFrame } from '../art/atlas';

export const SKIN = {
  stone: 0x2e2a34,
  stoneHi: 0x4a4552,
  stoneLo: 0x1a171f,
  iron: 0x15131a,
  ironHi: 0x7c7886,
  rivet: 0xb4ab98,
  wood: 0x5d3a26,
  woodHi: 0x8a5433,
  woodLo: 0x3a2418,
  gold: 0xffd76a,
  goldText: '#ffd76a',
  ink: '#140c08',
} as const;

function rivet(g: Phaser.GameObjects.Graphics, x: number, y: number, r = 2.6): void {
  g.fillStyle(0x0a080c, 0.9);
  g.fillCircle(x + 0.6, y + 0.8, r);
  g.fillStyle(SKIN.rivet, 1);
  g.fillCircle(x, y, r);
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(x - r * 0.35, y - r * 0.35, r * 0.4);
}

/** Dark stone slab with an iron rim and corner rivets. */
export function stonePanel(g: Phaser.GameObjects.Graphics, r: Rect, rad = 10, alpha = 0.94, rivets = true): void {
  // drop shadow
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(r.x + 1, r.y + 4, r.w, r.h, rad);
  // iron rim
  g.fillStyle(SKIN.iron, alpha);
  g.fillRoundedRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, rad + 2);
  // stone face: lighter top half, darker bottom
  g.fillStyle(SKIN.stone, alpha);
  g.fillRoundedRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, rad);
  g.fillStyle(SKIN.stoneHi, 0.35 * alpha);
  g.fillRoundedRect(r.x + 3, r.y + 3, r.w - 6, Math.max(4, (r.h - 6) * 0.45), { tl: rad - 2, tr: rad - 2, bl: 2, br: 2 });
  g.fillStyle(SKIN.stoneLo, 0.6 * alpha);
  g.fillRect(r.x + rad * 0.5, r.y + r.h - 6, r.w - rad, 3);
  // inner bevel line
  g.lineStyle(1, SKIN.ironHi, 0.45 * alpha);
  g.strokeRoundedRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, rad - 1);
  if (rivets && r.w > 30 && r.h > 30) {
    const k = Math.min(9, rad * 0.8 + 3);
    rivet(g, r.x + k, r.y + k);
    rivet(g, r.x + r.w - k, r.y + k);
    rivet(g, r.x + k, r.y + r.h - k);
    rivet(g, r.x + r.w - k, r.y + r.h - k);
  }
}

/** Wooden board (unit slots): planks with grain and iron corner brackets. */
export function woodPanel(g: Phaser.GameObjects.Graphics, r: Rect, rad = 8, alpha = 0.96): void {
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(r.x + 1, r.y + 4, r.w, r.h, rad);
  g.fillStyle(SKIN.iron, alpha);
  g.fillRoundedRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, rad + 2);
  g.fillStyle(SKIN.wood, alpha);
  g.fillRoundedRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, rad);
  // planks
  const n = 3;
  const pw = (r.w - 2) / n;
  for (let i = 0; i < n; i++) {
    const x = r.x + 1 + i * pw;
    g.fillStyle(i % 2 ? SKIN.woodHi : SKIN.wood, 0.35 * alpha);
    g.fillRect(x + 1, r.y + 4, pw - 2, r.h - 8);
    g.fillStyle(SKIN.woodLo, 0.7 * alpha);
    g.fillRect(x + pw - 1, r.y + 3, 1.5, r.h - 6);
    // grain
    g.fillStyle(SKIN.woodLo, 0.25 * alpha);
    g.fillRect(x + pw * 0.3, r.y + 8, 1, r.h * 0.35);
    g.fillRect(x + pw * 0.65, r.y + r.h * 0.45, 1, r.h * 0.4);
  }
  // top light and inner shadow
  g.fillStyle(0xffffff, 0.08 * alpha);
  g.fillRect(r.x + 3, r.y + 3, r.w - 6, 3);
  g.fillStyle(0x000000, 0.25 * alpha);
  g.fillRect(r.x + 3, r.y + r.h - 7, r.w - 6, 4);
  // iron corner brackets
  const b = 12;
  g.fillStyle(0x3a3640, alpha);
  for (const [cx, cy, sx, sy] of [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]] as const) {
    g.fillTriangle(cx, cy, cx + sx * b, cy, cx, cy + sy * b);
    rivet(g, cx + sx * 4.5, cy + sy * 4.5, 1.8);
  }
}

/** Round iron ring around a circular button. */
export function ironRing(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rad: number, fill = 0x221c2a, alpha = 0.95): void {
  g.fillStyle(0x000000, 0.4);
  g.fillCircle(cx + 1, cy + 4, rad + 3);
  g.fillStyle(SKIN.iron, alpha);
  g.fillCircle(cx, cy, rad + 3);
  g.fillStyle(0x4a4652, alpha);
  g.fillCircle(cx, cy, rad);
  g.fillStyle(fill, alpha);
  g.fillCircle(cx, cy, rad - 5);
  g.lineStyle(1, SKIN.ironHi, 0.5);
  g.strokeCircle(cx, cy, rad - 1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    rivet(g, cx + Math.cos(a) * (rad - 2.5), cy + Math.sin(a) * (rad - 2.5), 1.7);
  }
}

/** Recessed bar trough (HP, book, wave, smith progress). */
export function trough(g: Phaser.GameObjects.Graphics, r: Rect, rad?: number): void {
  const k = rad ?? r.h / 2;
  g.fillStyle(SKIN.iron, 0.95);
  g.fillRoundedRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, k + 3);
  g.fillStyle(0x0c0a10, 1);
  g.fillRoundedRect(r.x, r.y, r.w, r.h, k);
  g.fillStyle(0x000000, 0.5);
  g.fillRect(r.x + k * 0.5, r.y + 1, r.w - k, 2);
}

/** Glossy fill inside a trough. */
export function barFill(g: Phaser.GameObjects.Graphics, r: Rect, frac: number, color: number, rad?: number): void {
  const w = r.w * (frac < 0 ? 0 : frac > 1 ? 1 : frac);
  if (w <= 0.5) return;
  const k = Math.min(rad ?? r.h / 2, w / 2);
  g.fillStyle(color, 1);
  g.fillRoundedRect(r.x, r.y, w, r.h, k);
  g.fillStyle(0xffffff, 0.28);
  g.fillRoundedRect(r.x + 2, r.y + 2, Math.max(0, w - 4), Math.max(1, r.h * 0.28), Math.min(k, r.h * 0.14));
  g.fillStyle(0x000000, 0.2);
  g.fillRect(r.x + k * 0.5, r.y + r.h - 3, Math.max(0, w - k), 2);
}

// ---- icons ---------------------------------------------------------------------------

/**
 * Shows a baked icon / portrait (`portrait_unit_archer`, `icon_chainsaw`, `ui_gold`) on an image,
 * fitted into maxW x maxH logical px; falls back to a generated atlas frame. Returns true if baked.
 */
export function setIcon(img: Phaser.GameObjects.Image, id: string, fallback: string, maxW: number, maxH: number): boolean {
  const b = bakedIcon(id);
  if (b && img.scene.textures.exists(b.key)) {
    img.setTexture(b.key, b.frame);
    const f = img.frame;
    img.setOrigin(0.5, 0.5);
    img.setScale(Math.min(maxW / f.realWidth, maxH / f.realHeight));
    return true;
  }
  const f = spriteFrame(fallback);
  img.setTexture(f.tex, f.frame);
  img.setOrigin(0.5, 0.5);
  const fr = img.frame;
  img.setScale(Math.min(maxW / fr.realWidth, maxH / fr.realHeight));
  return false;
}

/** Adds a fitted icon image (see setIcon). */
export function addIcon(scene: Phaser.Scene, x: number, y: number, id: string, fallback: string, maxW: number, maxH = maxW): Phaser.GameObjects.Image {
  const f = spriteFrame('px');
  const img = scene.add.image(x, y, f.tex, f.frame);
  setIcon(img, id, fallback, maxW, maxH);
  return img;
}

/** Bold gold number / title style for Text objects. */
export function goldStyle(size: number, color: string = SKIN.goldText): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: 'Kanit, "Noto Sans Thai", Tahoma, sans-serif',
    fontStyle: 'bold',
    fontSize: `${size}px`,
    color,
    stroke: SKIN.ink,
    strokeThickness: Math.max(3, Math.round(size / 5)),
  };
}
