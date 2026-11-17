/**
 * Runtime texture atlas: every generated sprite is drawn with Canvas 2D into one
 * (rarely two) CanvasTexture pages at renderScale, registered as frames, and
 * looked up by sprite key. Also builds two bitmap fonts (ASCII) into the same
 * pages so numbers batch with the sprites instead of costing a texture each.
 */
import type { EntityKind } from '../../contracts';
import { OUT, type Ctx } from './kit';

export interface FrameInfo {
  tex: string;
  frame: string;
  /** logical size */
  w: number;
  h: number;
  /** origin (anchor) fractions */
  ax: number;
  ay: number;
}

export interface ArtItem {
  key: string;
  w: number;
  h: number;
  ax?: number;
  ay?: number;
  draw: (ctx: Ctx, w: number, h: number) => void;
}

export interface FontSpec {
  key: string;
  /** logical glyph size in px */
  base: number;
  outline: number;
  chars: string;
}

interface Glyph {
  code: number;
  ch: string;
  x: number;
  y: number;
  w: number;
  h: number;
  adv: number;
}

const PAD = 2;
const PAGE_PREFIX = 'aodd_atlas_';
export const NUM_FONT_FAMILY = 'Kanit, "Segoe UI", "Noto Sans", Tahoma, Arial, sans-serif';

const registry = new Map<string, FrameInfo>();
const warned = new Set<string>();
let atlasR = 1;

export function atlasScale(): number {
  return atlasR;
}

export function hasFrame(key: string): boolean {
  return registry.has(key);
}

export function frameOf(key: string): FrameInfo | undefined {
  return registry.get(key);
}

const FALLBACK_BY_KIND: Record<EntityKind, string> = {
  ash: 'ash',
  ally: 'fallback_ally',
  hero: 'fallback_hero',
  enemy: 'fallback_enemy',
  boss: 'fallback_boss',
  projectile: 'shot',
  pickup: 'coin',
  effect: 'fallback_effect',
};

const FALLBACK_BY_PREFIX: Array<[string, string]> = [
  ['unit_', 'fallback_ally'],
  ['hero_', 'fallback_hero'],
  ['enemy_', 'fallback_enemy'],
  ['boss_', 'fallback_boss'],
  ['icon_', 'fallback_icon'],
  ['relic_', 'fallback_relic'],
];

/** Frame for a sprite key; unknown keys fall back by entity kind / prefix (never throws). */
export function spriteFrame(key: string, kind?: EntityKind): FrameInfo {
  const hit = registry.get(key);
  if (hit) return hit;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`[render] no art for sprite "${key}", using a placeholder`);
  }
  let fb = kind ? FALLBACK_BY_KIND[kind] : undefined;
  if (!fb) for (const [p, f] of FALLBACK_BY_PREFIX) if (key.startsWith(p)) fb = f;
  return registry.get(fb ?? 'fallback_effect') ?? registry.get('px')!;
}

/** Sets an Image/Sprite to a registered frame, displayed at logical size * mul. */
export function applyFrame(img: Phaser.GameObjects.Image, f: FrameInfo, mul = 1): void {
  img.setTexture(f.tex, f.frame);
  img.setOrigin(f.ax, f.ay);
  img.setScale(mul / atlasR);
}

/** Adds an image of a registered key (with fallback) at logical size * mul. */
export function addArt(scene: Phaser.Scene, x: number, y: number, key: string, mul = 1, kind?: EntityKind): Phaser.GameObjects.Image {
  const f = spriteFrame(key, kind);
  const img = scene.add.image(x, y, f.tex, f.frame);
  img.setOrigin(f.ax, f.ay);
  img.setScale(mul / atlasR);
  return img;
}

/** Scale so the frame fits inside maxW x maxH logical px (never upscales past `cap`). */
export function fitScale(key: string, maxW: number, maxH: number, cap = 1.5, kind?: EntityKind): number {
  const f = spriteFrame(key, kind);
  return Math.min(cap, maxW / f.w, maxH / f.h);
}

// ---------------------------------------------------------------------------

interface Placed {
  item: ArtItem;
  page: number;
  x: number;
  y: number;
  pw: number;
  ph: number;
}

function layoutFont(spec: FontSpec, R: number): { item: ArtItem; glyphs: Glyph[]; lineH: number } {
  const meas = document.createElement('canvas').getContext('2d')!;
  meas.font = `bold ${spec.base}px ${NUM_FONT_FAMILY}`;
  const lineH = Math.ceil(spec.base * 1.32);
  // centre the digits by their real ink box (fonts such as Kanit sit high on a 'middle' baseline)
  const dm = meas.measureText('0123456789');
  const inkMid = ((dm.actualBoundingBoxAscent || spec.base * 0.72) - (dm.actualBoundingBoxDescent || 0)) / 2;
  const gh = Math.ceil((lineH + 2) * R);
  const maxRow = Math.ceil(520 * R);
  const glyphs: Glyph[] = [];
  let x = 0;
  let y = 0;
  let wMax = 0;
  for (const ch of spec.chars) {
    const adv = meas.measureText(ch).width;
    const gw = Math.ceil((adv + spec.outline * 2 + 2) * R);
    if (x + gw > maxRow) {
      x = 0;
      y += gh;
    }
    glyphs.push({ code: ch.codePointAt(0)!, ch, x, y, w: gw, h: gh, adv });
    x += gw;
    wMax = Math.max(wMax, x);
  }
  const wPhys = wMax;
  const hPhys = y + gh;
  const item: ArtItem = {
    key: `font_${spec.key}`,
    w: wPhys / R,
    h: hPhys / R,
    ax: 0,
    ay: 0,
    draw(ctx) {
      ctx.font = `bold ${spec.base}px ${NUM_FONT_FAMILY}`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.lineJoin = 'round';
      ctx.lineWidth = spec.outline * 2;
      ctx.strokeStyle = OUT;
      ctx.fillStyle = '#ffffff';
      for (const g of glyphs) {
        const lx = g.x / R + spec.outline + 1;
        const ly = g.y / R + (lineH + 2) / 2 + 1 + inkMid;
        ctx.strokeText(g.ch, lx, ly);
        ctx.fillText(g.ch, lx, ly);
      }
    },
  };
  return { item, glyphs, lineH };
}

/**
 * Packs and draws every item, registers frames and bitmap fonts.
 * Safe to call more than once (later calls are ignored).
 */
export function buildAtlas(scene: Phaser.Scene, items: ArtItem[], fonts: FontSpec[], R: number): void {
  if (scene.textures.exists(`${PAGE_PREFIX}0`)) return;
  atlasR = R;
  const renderer = scene.sys.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const maxTex = typeof renderer.getMaxTextureSize === 'function' ? renderer.getMaxTextureSize() : 4096;
  const pageW = Math.min(2048, maxTex);
  const maxH = Math.min(4096, maxTex);

  const fontLayouts = fonts.map((f) => ({ spec: f, ...layoutFont(f, R) }));
  const all = [...items, ...fontLayouts.map((f) => f.item)];
  const seen = new Set<string>();
  const unique = all.filter((it) => (seen.has(it.key) ? false : (seen.add(it.key), true)));
  const sorted = unique
    .map((item) => ({ item, pw: Math.ceil(item.w * R) + PAD * 2, ph: Math.ceil(item.h * R) + PAD * 2 }))
    .sort((a, b) => b.ph - a.ph || b.pw - a.pw);

  const placed: Placed[] = [];
  const pageHeights: number[] = [];
  let page = 0;
  let x = 0;
  let y = 0;
  let shelfH = 0;
  for (const s of sorted) {
    const pw = Math.min(s.pw, pageW);
    if (x + pw > pageW) {
      y += shelfH;
      x = 0;
      shelfH = 0;
    }
    if (y + s.ph > maxH) {
      pageHeights[page] = y;
      page++;
      x = 0;
      y = 0;
      shelfH = 0;
    }
    placed.push({ item: s.item, page, x, y, pw, ph: s.ph });
    x += pw;
    shelfH = Math.max(shelfH, s.ph);
  }
  pageHeights[page] = y + shelfH;

  const textures: Phaser.Textures.CanvasTexture[] = [];
  for (let p = 0; p <= page; p++) {
    const tex = scene.textures.createCanvas(`${PAGE_PREFIX}${p}`, pageW, Math.max(4, pageHeights[p]));
    if (!tex) throw new Error('could not create atlas canvas');
    textures.push(tex);
  }

  for (const pl of placed) {
    const tex = textures[pl.page];
    const ctx = tex.getContext();
    const cw = Math.min(Math.ceil(pl.item.w * R), pageW - PAD * 2);
    const ch = Math.ceil(pl.item.h * R);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pl.x + PAD, pl.y + PAD, cw, ch);
    ctx.clip();
    ctx.translate(pl.x + PAD, pl.y + PAD);
    ctx.scale(R, R);
    try {
      pl.item.draw(ctx, pl.item.w, pl.item.h);
    } catch (err) {
      console.warn(`[render] art for "${pl.item.key}" failed`, err);
    }
    ctx.restore();
    tex.add(pl.item.key, 0, pl.x + PAD, pl.y + PAD, cw, ch);
    registry.set(pl.item.key, {
      tex: tex.key,
      frame: pl.item.key,
      w: cw / R,
      h: ch / R,
      ax: pl.item.ax ?? 0.5,
      ay: pl.item.ay ?? 1,
    });
  }
  for (const t of textures) t.refresh();

  // bitmap fonts
  for (const fl of fontLayouts) {
    const pl = placed.find((p) => p.item === fl.item);
    if (!pl) continue;
    const tex = textures[pl.page];
    const fx = pl.x + PAD;
    const fy = pl.y + PAD;
    const tw = tex.width;
    const th = tex.height;
    const chars: Record<number, unknown> = {};
    for (const g of fl.glyphs) {
      chars[g.code] = {
        x: g.x,
        y: g.y,
        width: g.w,
        height: g.h,
        centerX: Math.floor(g.w / 2),
        centerY: Math.floor(g.h / 2),
        xOffset: -Math.round((fl.spec.outline + 1) * R),
        yOffset: 0,
        xAdvance: Math.round(g.adv * R),
        data: {},
        kerning: {},
        u0: (fx + g.x) / tw,
        v0: (fy + g.y) / th,
        u1: (fx + g.x + g.w) / tw,
        v1: (fy + g.y + g.h) / th,
      };
    }
    const data = { font: fl.spec.key, size: fl.spec.base * R, lineHeight: Math.round(fl.lineH * R), retroFont: false, chars };
    scene.cache.bitmapFont.add(fl.spec.key, { data, texture: tex.key, frame: fl.item.key });
  }
}
