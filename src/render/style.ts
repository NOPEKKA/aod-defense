/**
 * Shared look: fonts, colours, text helpers and small allocation-free helpers.
 */
import { getApp } from '../core/app';
import { FONT_L, FONT_S } from './art/build';

/** Bundled Kanit (public/fonts, @font-face in style.css), then system stacks that render Thai well. */
export const FONT = 'Kanit, "Noto Sans Thai", "Leelawadee UI", "Leelawadee", "Thonburi", Tahoma, "Segoe UI", system-ui, sans-serif';
/** Tall Thai stacks (above + below marks) so Phaser measures enough line height. */
const THAI_TEST = '|MÉqgyปั้ญู่ฐฎ';

export const C = {
  ink: '#1b1424',
  inkN: 0x1b1424,
  text: '#fff7e6',
  textDim: '#c9bfd6',
  gold: '#ffd34d',
  goldN: 0xffd34d,
  red: '#ff5a4f',
  redN: 0xff5a4f,
  green: '#7ee07a',
  greenN: 0x7ee07a,
  blue: '#4aa8ff',
  blueN: 0x4aa8ff,
  panelN: 0x231a30,
  panel2N: 0x31263f,
  panelEdgeN: 0x5c4a73,
  primaryN: 0xe0902f,
  secondaryN: 0x4a5f9a,
  dangerN: 0xc0392b,
  ghostN: 0x3a2f48,
  disabledN: 0x4a4452,
} as const;

export interface TextOpts {
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  stroke?: number;
  wrap?: number;
  originX?: number;
  originY?: number;
  shadow?: boolean;
}

/** Thai-safe crisp text (resolution = renderScale). */
export function addText(scene: Phaser.Scene, x: number, y: number, text: string, size: number, o: TextOpts = {}): Phaser.GameObjects.Text {
  const R = getApp().renderScale;
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: o.bold === false ? 'normal' : 'bold',
    color: o.color ?? C.text,
    align: o.align ?? 'left',
    stroke: C.ink,
    strokeThickness: o.stroke ?? Math.max(2, Math.round(size / 6)),
    padding: { left: 2, right: 2, top: Math.ceil(size * 0.18), bottom: Math.ceil(size * 0.12) },
    testString: THAI_TEST,
  };
  if (o.wrap) style.wordWrap = { width: o.wrap, useAdvancedWrap: true };
  const t = scene.add.text(x, y, text, style);
  t.setResolution(R);
  t.setOrigin(o.originX ?? 0, o.originY ?? 0);
  if (o.shadow) t.setShadow(0, 2, 'rgba(0,0,0,0.45)', 2, true, true);
  return t;
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
  return scene.add.bitmapText(x, y, large ? FONT_L : FONT_S, text, size);
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
