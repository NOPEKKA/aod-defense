/**
 * The UI material kit ("war ledger" look): aged vellum pages in tooled-leather bindings with
 * iron corner guards, oak / oxblood-leather / brass plank buttons strapped with forged iron,
 * iron HUD plaques, wax seals and stamped coins. The art is procedural (numpy noise +
 * heightmap lighting, see output/ui-tools) baked at 2x logical px into public/assets/ui/kit:
 * one atlas (`uikit`) plus seamless tiles for large fills. Big surfaces are a TileSprite fill
 * under a NineSlice frame, so nothing stretches noticeably.
 */
import type { Rect } from '../../contracts';
import { icon as bakedIcon } from '../assets/library';
import { spriteFrame } from '../art/atlas';

export const KIT = 'uikit';
export const TILE_PARCH = 'uikit_parch';
export const TILE_WOOD = 'uikit_wood';
export const TILE_LEATHER = 'uikit_leather';
/** kit texture px per logical px */
export const KIT_RES = 2;
const KS = 1 / KIT_RES;

export const SKIN = {
  gold: 0xe9c463,
  goldText: '#e9c463',
  silver: 0xdfe6ee,
  silverText: '#e4eaf0',
  ink: '#1a0d06',
  inkN: 0x24160c,
  blood: 0x9a1c12,
  bone: 0xefe3c4,
} as const;

/** queue the kit (call from a preload; skipped once loaded) */
export function queueUiKit(scene: Phaser.Scene): void {
  const base = 'assets/ui/kit/';
  if (!scene.textures.exists(KIT)) scene.load.atlas(KIT, `${base}kit.webp`, `${base}kit.json`);
  if (!scene.textures.exists(TILE_PARCH)) scene.load.image(TILE_PARCH, `${base}parchment.webp`);
  if (!scene.textures.exists(TILE_WOOD)) scene.load.image(TILE_WOOD, `${base}wood.webp`);
  if (!scene.textures.exists(TILE_LEATHER)) scene.load.image(TILE_LEATHER, `${base}leather.webp`);
}

export function hasKit(scene: Phaser.Scene, frame?: string): boolean {
  if (!scene.textures.exists(KIT)) return false;
  return frame === undefined || scene.textures.get(KIT).has(frame);
}

/** [left, right, top, bottom] slice widths in kit texture px */
const NINE: Record<string, [number, number, number, number]> = {
  btn_primary: [44, 44, 34, 44],
  btn_secondary: [44, 44, 34, 44],
  btn_ghost: [44, 44, 34, 44],
  btn_danger: [44, 44, 34, 44],
  btn_gold: [44, 44, 34, 44],
  btn_selected: [44, 44, 34, 44],
  panel_frame: [72, 72, 72, 72],
  paper_edge: [80, 80, 80, 80],
  shadow: [48, 48, 48, 48],
  iron_plate: [28, 28, 28, 30],
  bar_trough: [18, 18, 14, 14],
  ribbon: [112, 112, 0, 0],
};

/**
 * NineSlice of a kit frame covering (x, y, w, h) logical px, origin top-left.
 * `res` < KIT_RES draws the borders thinner (e.g. 4 = half-thickness rims for small bars).
 */
export function nine(scene: Phaser.Scene, frame: string, x: number, y: number, w: number, h: number, res = KIT_RES): Phaser.GameObjects.NineSlice {
  const [l, r, t, b] = NINE[frame] ?? [8, 8, 8, 8];
  const ns = scene.add.nineslice(x, y, KIT, frame, Math.max(l + r, w * res), t + b > 0 ? Math.max(t + b, h * res) : undefined, l, r, t, b);
  ns.setOrigin(0, 0).setScale(1 / res);
  return ns;
}

/** resize a NineSlice made by nine() */
export function resizeNine(ns: Phaser.GameObjects.NineSlice, w: number, h: number): void {
  const res = 1 / ns.scaleX;
  ns.setSize(w * res, h * res);
}

/** plain kit image sized to w x h logical px (origin centre) */
export function kitImage(scene: Phaser.Scene, frame: string, x: number, y: number, w: number, h = w): Phaser.GameObjects.Image {
  const img = scene.add.image(x, y, KIT, frame);
  img.setDisplaySize(w, h);
  return img;
}

/** seamless material fill (TileSprite at kit resolution) */
export function tileFill(scene: Phaser.Scene, tex: string, x: number, y: number, w: number, h: number, seed = 0): Phaser.GameObjects.TileSprite {
  const ts = scene.add.tileSprite(x, y, Math.ceil(w * KIT_RES), Math.ceil(h * KIT_RES), tex);
  ts.setOrigin(0, 0).setScale(KS);
  ts.setTilePosition((seed * 137) % 512, (seed * 211) % 512);
  return ts;
}

export interface PageOpts {
  /** leather binding + iron corner guards (default true); false = bare deckled sheet */
  bound?: boolean;
  shadow?: boolean;
  seed?: number;
  /** multiplies the parchment colour (e.g. 0xe8dcc8 to age it) */
  tint?: number;
}

/**
 * A vellum page in a tooled-leather binding (all menu panels, dialogs, pause). Returns a
 * container positioned at (x, y); children use local coordinates.
 */
export function page(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: PageOpts = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const bound = o.bound ?? true;
  if (o.shadow ?? true) c.add(nine(scene, 'shadow', -18, -12, w + 36, h + 34));
  if (bound) {
    const fill = tileFill(scene, TILE_PARCH, 8, 8, w - 16, h - 16, o.seed ?? Math.round(x + y));
    if (o.tint !== undefined) fill.setTint(o.tint);
    c.add(fill);
    c.add(nine(scene, 'panel_frame', 0, 0, w, h));
  } else {
    const fill = tileFill(scene, TILE_PARCH, 20, 20, w - 40, h - 40, o.seed ?? Math.round(x + y));
    if (o.tint !== undefined) fill.setTint(o.tint);
    c.add(fill);
    const edge = nine(scene, 'paper_edge', 0, 0, w, h);
    if (o.tint !== undefined) edge.setTint(o.tint);
    c.add(edge);
  }
  return c;
}

/** dark forged-iron plaque (HUD readouts, toasts, badges) */
export function ironPlate(scene: Phaser.Scene, r: Rect, res = KIT_RES): Phaser.GameObjects.NineSlice {
  return nine(scene, 'iron_plate', r.x, r.y, r.w, r.h, res);
}

/**
 * Blood-red cloth banner centred on (cx, cy) wide enough for `minW` px of text.
 * Returns the banner; place the title text over it.
 */
export function ribbon(scene: Phaser.Scene, cx: number, cy: number, minW: number): Phaser.GameObjects.NineSlice {
  const w = Math.max(260, minW + 150);
  const ns = nine(scene, 'ribbon', cx - w / 2, cy - 34, w, 64);
  return ns;
}

/** ornamental rule; gold for dark backgrounds, ink for parchment */
export function divider(scene: Phaser.Scene, cx: number, cy: number, w: number, gold = false): Phaser.GameObjects.Image {
  const img = scene.add.image(cx, cy, KIT, gold ? 'divider_gold' : 'divider_ink');
  img.setDisplaySize(w, Math.min(26, w * (48 / 512)));
  return img;
}

/** hand-ruled ink line on parchment */
export function inkRule(g: Phaser.GameObjects.Graphics, x0: number, y: number, x1: number, alpha = 0.35): void {
  g.lineStyle(1.5, SKIN.inkN, alpha);
  g.lineBetween(x0, y, x1, y + 0.5);
  g.lineStyle(1, SKIN.inkN, alpha * 0.4);
  g.lineBetween(x0 + 6, y + 2.5, x1 - 10, y + 2);
}

export type Coin = 'gold' | 'silver';
export function coin(scene: Phaser.Scene, x: number, y: number, kind: Coin, size: number): Phaser.GameObjects.Image {
  return kitImage(scene, kind === 'gold' ? 'coin_gold' : 'coin_silver', x, y, size, size);
}

// ---- icons ---------------------------------------------------------------------------

/** currency icons are kit coins whatever the caller asked for */
const KIT_ALIAS: Record<string, string> = {
  ui_gold: 'coin_gold',
  ui_iron: 'coin_silver',
  ui_silver: 'coin_silver',
  coin_gold: 'coin_gold',
  coin_silver: 'coin_silver',
  ui_star: 'star_gold',
  ui_star_empty: 'star_ink',
};

/**
 * Shows a baked icon / portrait (`portrait_unit_archer`, `icon_chainsaw`), a kit frame (coins,
 * stars) or a generated atlas frame, fitted into maxW x maxH logical px. Returns true unless
 * it fell back to generated art.
 */
export function setIcon(img: Phaser.GameObjects.Image, id: string, fallback: string, maxW: number, maxH: number): boolean {
  const kit = KIT_ALIAS[id];
  if (kit && hasKit(img.scene, kit)) {
    img.setTexture(KIT, kit);
    img.setOrigin(0.5, 0.5);
    img.setScale(Math.min(maxW / img.frame.realWidth, maxH / img.frame.realHeight));
    return true;
  }
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
