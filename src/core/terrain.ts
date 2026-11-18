/**
 * The battlefield's ground profile (balance.world.terrain): the castle sits on high ground on
 * the left, the road runs downhill to the demon lair on the right. terrainAt(x) is how many px
 * the ground at x lies below world.groundY. Gameplay keeps every ground body on it; render
 * (camera, ground fx, telegraphs) and the background bake use the same curve.
 */
import type { GameData } from '../contracts';

type Pts = ReadonlyArray<readonly [number, number]>;

const cache = new WeakMap<object, Pts>();

function pointsOf(data: GameData): Pts {
  const w = data.balance.world;
  let p = cache.get(w);
  if (!p) {
    p = [...(w.terrain ?? [])].sort((a, b) => a[0] - b[0]);
    cache.set(w, p);
  }
  return p;
}

/** px below groundY at world x (0 on flat ground); smoothstep between profile points */
export function terrainAt(data: GameData, x: number): number {
  const p = pointsOf(data);
  const n = p.length;
  if (n === 0) return 0;
  if (x <= p[0][0]) return p[0][1];
  if (x >= p[n - 1][0]) return p[n - 1][1];
  for (let i = 1; i < n; i++) {
    const b = p[i];
    if (x <= b[0]) {
      const a = p[i - 1];
      const t = (x - a[0]) / Math.max(1e-6, b[0] - a[0]);
      const s = t * t * (3 - 2 * t);
      return a[1] + (b[1] - a[1]) * s;
    }
  }
  return p[n - 1][1];
}

/** ground y on screen at world x for the middle depth row */
export function groundAt(data: GameData, x: number): number {
  return data.balance.world.groundY + terrainAt(data, x);
}
