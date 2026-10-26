/**
 * Background layers drawn with Graphics (static, redrawn only on resize):
 * sky gradient, moon, stars, two parallax hill bands and the ground strip.
 */
import type { ChapterLook } from './style';

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export function drawSky(g: Phaser.GameObjects.Graphics, w: number, h: number, look: ChapterLook): void {
  g.clear();
  g.fillGradientStyle(look.skyTop, look.skyTop, look.skyBottom, look.skyBottom, 1);
  g.fillRect(0, 0, w, h);
  if (look.stars) {
    const rnd = lcg(7);
    for (let i = 0; i < 70; i++) {
      g.fillStyle(0xffffff, 0.25 + rnd() * 0.6);
      g.fillCircle(rnd() * w, rnd() * h * 0.55, rnd() < 0.15 ? 1.6 : 1);
    }
  }
  // moon
  const mx = w * 0.78;
  const my = 118;
  g.fillStyle(look.moon, 0.12);
  g.fillCircle(mx, my, 70);
  g.fillStyle(look.moon, 0.2);
  g.fillCircle(mx, my, 50);
  g.fillStyle(look.moon, 1);
  g.fillCircle(mx, my, 34);
  g.fillStyle(mix(look.moon, 0x000000, 0.12), 1);
  g.fillCircle(mx - 10, my + 6, 7);
  g.fillCircle(mx + 9, my - 9, 4.5);
}

/** Rolling hill band from x=0..width with its baseline at `baseY`. */
export function drawHills(
  g: Phaser.GameObjects.Graphics,
  width: number,
  baseY: number,
  amp: number,
  color: number,
  seed: number,
  pines: boolean,
  bottom = 720,
): void {
  const pts: Phaser.Types.Math.Vector2Like[] = [{ x: 0, y: bottom }];
  const step = 24;
  const rnd = lcg(seed);
  const p1 = rnd() * 6;
  const p2 = rnd() * 6;
  for (let x = 0; x <= width + step; x += step) {
    const y = baseY - amp * (0.55 + 0.3 * Math.sin(x * 0.0042 + p1) + 0.18 * Math.sin(x * 0.0113 + p2));
    pts.push({ x, y });
  }
  pts.push({ x: width + step, y: bottom });
  g.fillStyle(color, 1);
  g.fillPoints(pts, true);
  if (pines) {
    for (let i = 1; i < pts.length - 2; i += 2) {
      if (rnd() < 0.45) continue;
      const p = pts[i];
      const h = 18 + rnd() * 26;
      g.fillTriangle(p.x - h * 0.32, p.y + 4, p.x + h * 0.32, p.y + 4, p.x, p.y - h);
    }
  }
}

export function drawGround(g: Phaser.GameObjects.Graphics, x0: number, x1: number, groundY: number, look: ChapterLook, seed = 3): void {
  const top = groundY - 22;
  g.fillStyle(look.dirt, 1);
  g.fillRect(x0, top, x1 - x0, 720 - top + 40);
  // darker lower band
  g.fillStyle(mix(look.dirt, 0x000000, 0.25), 1);
  g.fillRect(x0, groundY + 40, x1 - x0, 720 - groundY);
  // lane (worn path)
  g.fillStyle(mix(look.dirt, 0xffffff, 0.08), 1);
  g.fillRect(x0, groundY - 14, x1 - x0, 30);
  // grass lip
  g.fillStyle(look.grass, 1);
  g.fillRect(x0, top - 6, x1 - x0, 10);
  g.lineStyle(3, 0x1b1424, 1);
  g.lineBetween(x0, top - 6, x1, top - 6);
  const rnd = lcg(seed);
  g.fillStyle(look.grass, 1);
  for (let x = x0; x < x1; x += 14 + rnd() * 26) {
    const h = 5 + rnd() * 8;
    g.fillTriangle(x, top - 4, x + 5, top - 4, x + 2 + rnd() * 3, top - 4 - h);
  }
  // stones
  for (let x = x0 + 20; x < x1; x += 50 + rnd() * 90) {
    const y = groundY + 26 + rnd() * 70;
    const r = 3 + rnd() * 6;
    g.fillStyle(mix(look.dirt, 0x000000, 0.3), 1);
    g.fillEllipse(x, y + 1.5, r * 2.4, r * 1.3);
    g.fillStyle(mix(look.dirt, 0xffffff, 0.22), 1);
    g.fillEllipse(x, y, r * 2.2, r * 1.1);
  }
}
