/**
 * Shared look: fonts, colours, text helpers and small allocation-free helpers.
 */
import { getApp } from '../core/app';
import { FONT_UI, FONT_UI_L } from './art/build';

/**
 * Bundled SIL OFL fonts (public/fonts, loaded in render.preloadBoot): Taviraj (Thai + Latin
 * book serif) for body text, Pirata One (blackletter) for headings with Chonburi (Thai display
 * serif) picking up the Thai glyphs Pirata does not have. System Thai stacks are last resorts.
 */
export const FONT = 'Taviraj, "Leelawadee UI", "Leelawadee", "Thonburi", Tahoma, serif';
export const FONT_HEAD = '"Pirata One", Chonburi, Taviraj, "Leelawadee UI", serif';
/** Tall Thai stacks (above + below marks) so Phaser measures enough line height. */
export const THAI_TEST = '|MÉqgyปั้ญู่ฐฎ';

export const C = {
  /** text on parchment */
  ink: '#24160c',
  inkN: 0x24160c,
  inkSoft: '#5e4630',
  /** rubricated (red ink) headings on parchment */
  rubric: '#8a1a10',
  rubricN: 0x8a1a10,
  /** text on wood / iron / the dark backdrop */
  text: '#f1e4c4',
  textDim: '#bcaa86',
  gold: '#e9c463',
  goldN: 0xe9c463,
  /** gold numbers printed on parchment */
  goldInk: '#8a5a0c',
  red: '#e0533c',
  redN: 0xe0533c,
  green: '#a8d27a',
  greenN: 0x8fc46a,
  /** positive note on parchment */
  greenInk: '#3d6a22',
  blue: '#8ec4ff',
  blueN: 0x6aa8ff,
  silver: '#e4eaf0',
  silverN: 0xdfe6ee,
  panelN: 0x231a14,
  disabledN: 0x4a4452,
} as const;

export interface TextOpts {
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  /** outline px; light text gets a thin dark edge by default, ink text none */
  stroke?: number;
  wrap?: number;
  originX?: number;
  originY?: number;
  /** heavier drop shadow (floating titles over the battlefield) */
  shadow?: boolean;
  /** 'head' = blackletter / Thai display face */
  font?: 'body' | 'head';
}

/** true for dark ink colours (printed on parchment) */
function isInk(color: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return false;
  const v = parseInt(m[1], 16);
  const l = 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
  return l < 110;
}

/**
 * Thai-safe crisp text (resolution = renderScale). Light text is engraved (thin dark edge and
 * a hard drop shadow), ink text is letterpressed (a faint light edge below).
 */
export function addText(scene: Phaser.Scene, x: number, y: number, text: string, size: number, o: TextOpts = {}): Phaser.GameObjects.Text {
  const R = getApp().renderScale;
  const color = o.color ?? C.text;
  const ink = isInk(color);
  const head = o.font === 'head';
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: head ? FONT_HEAD : FONT,
    fontSize: `${size}px`,
    fontStyle: head ? 'normal' : o.bold === false ? '400' : '600',
    color,
    align: o.align ?? 'left',
    stroke: ink ? '#f3e6c4' : '#1a0d06',
    strokeThickness: o.stroke ?? (ink ? 0 : Math.max(1, Math.round(size / 13))),
    padding: { left: 3, right: 3, top: Math.ceil(size * 0.22), bottom: Math.ceil(size * 0.16) },
    testString: THAI_TEST,
  };
  if (o.wrap) style.wordWrap = { width: o.wrap, useAdvancedWrap: true };
  const t = scene.add.text(x, y, text, style);
  t.setResolution(R);
  t.setOrigin(o.originX ?? 0, o.originY ?? 0);
  if (ink) t.setShadow(0, 1, 'rgba(255,244,214,0.45)', 0, false, true);
  else if (o.shadow) t.setShadow(0, Math.max(2, size / 14), 'rgba(8,3,1,0.85)', Math.max(3, size / 8), true, true);
  else t.setShadow(0, Math.max(1, size / 18), 'rgba(8,3,1,0.8)', 1, true, true);
  return t;
}

/** Gold-leaf fill for a big heading (call after the text is set). */
export function gildText(t: Phaser.GameObjects.Text, top = '#fff0b0', mid = '#e2b54a', bottom = '#8a5a14'): void {
  const ctx = t.context;
  const h = t.height / t.scaleY;
  const g = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.85);
  g.addColorStop(0, top);
  g.addColorStop(0.5, mid);
  g.addColorStop(1, bottom);
  t.setFill(g);
}

/** Shrinks font size until the text fits in maxW (single line), down to minSize. */
export function fitText(t: Phaser.GameObjects.Text, maxW: number, minSize = 10): void {
  let size = parseFloat(String(t.style.fontSize)) || 16;
  while (t.width > maxW && size > minSize) {
    size -= 1;
    t.setFontSize(size);
  }
}

export function addNum(scene: Phaser.Scene, x: number, y: number, text: string, size: number, large = false): Phaser.GameObjects.BitmapText {
  return scene.add.bitmapText(x, y, large ? FONT_UI_L : FONT_UI, text, size);
}

// ---- allocation-free number strings ---------------------------------------

const numCache: string[] = [];
const plusCache: string[] = [];
/** String for a non-negative integer, cached (no garbage in per-frame HUD updates). */
export function numStr(n: number): string {
  const i = n < 0 ? 0 : n | 0;
  if (i > 99999) return String(i);
  return numCache[i] ?? (numCache[i] = String(i));
}
export function plusStr(n: number): string {
  const i = n < 0 ? 0 : n | 0;
  if (i > 99999) return `+${i}`;
  return plusCache[i] ?? (plusCache[i] = `+${i}`);
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};
export const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

/** Chapter look [เดา]: SPEC §1.3 lists dusk, fog, rain, burning night, blood moon. */
export interface ChapterLook {
  skyTop: number;
  skyBottom: number;
  far: number;
  near: number;
  grass: number;
  dirt: number;
  moon: number;
  stars: boolean;
}
export const CHAPTERS: ChapterLook[] = [
  { skyTop: 0x2b2d5c, skyBottom: 0xf08a5d, far: 0x5a4778, near: 0x3a3154, grass: 0x5d7d3a, dirt: 0x6b4a2e, moon: 0xffe9b0, stars: false },
  { skyTop: 0x4a5a6a, skyBottom: 0xb3bcc0, far: 0x7c8a90, near: 0x5d6b72, grass: 0x5a7448, dirt: 0x5e4a36, moon: 0xf0f0e8, stars: false },
  { skyTop: 0x1f2a38, skyBottom: 0x55667a, far: 0x34404e, near: 0x26313d, grass: 0x3f5e3a, dirt: 0x4e3c2c, moon: 0xcfd8e8, stars: false },
  { skyTop: 0x1a0d16, skyBottom: 0xb2401f, far: 0x46201f, near: 0x2e1517, grass: 0x4a4a2a, dirt: 0x4a3020, moon: 0xffb070, stars: true },
  { skyTop: 0x12060c, skyBottom: 0x5e1020, far: 0x2e1018, near: 0x1f0a12, grass: 0x3a3a26, dirt: 0x3e261c, moon: 0xff4a4a, stars: true },
];

export function chapterLook(chapter: number): ChapterLook {
  return CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, chapter - 1))];
}
