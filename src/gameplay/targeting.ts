/**
 * Target queries. Reach is measured from the attacker's centre to the target's
 * body edge: reach = |dx| - target.radius. Lists come from refreshLists()
 * (slot indices of live bodies); hp is re-checked because targets can die
 * mid-band.
 */
import { byId, type GState } from './state';

const INF = Number.POSITIVE_INFINITY;

/**
 * Nearest live hostile (enemy/boss) a player-side attacker at x can hit.
 * @param dir 0 = either side, 1/-1 = only that side (overlapping bodies count)
 */
export function nearestHostile(st: GState, x: number, reach: number, hitsFlying: boolean, dir: number, groundOnly = false): number {
  const ents = st.world.entities;
  const list = st.hostiles;
  let best = -1;
  let bestD = INF;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const e = ents[s];
    if (!e.alive || e.hp <= 0) continue;
    if (e.flying && (!hitsFlying || groundOnly)) continue;
    if (st.rts[s].hidden) continue;
    const r = st.rts[s].radius;
    const dx = e.x - x;
    if (dir !== 0 && dx * dir < -r) continue;
    const d = Math.abs(dx) - r;
    if (d > reach) continue;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Nearest live player body (Ash, ally, hero) an enemy at x can hit. */
export function nearestPlayer(st: GState, x: number, reach: number, dir: number): number {
  const ents = st.world.entities;
  const list = st.players;
  let best = -1;
  let bestD = INF;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const e = ents[s];
    if (!e.alive || e.hp <= 0) continue;
    const r = st.rts[s].radius;
    const dx = e.x - x;
    if (dir !== 0 && dx * dir < -r) continue;
    const d = Math.abs(dx) - r;
    if (d > reach) continue;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Ash's slot if Ash is alive and within reach of x, else -1. */
export function ashInReach(st: GState, x: number, reach: number): number {
  const ash = byId(st, st.world.ashId);
  if (!ash || ash.hp <= 0) return -1;
  const s = st.idSlot.get(ash.id)!;
  return Math.abs(ash.x - x) - st.rts[s].radius <= reach ? s : -1;
}

/**
 * Densest cluster of hostiles: returns the mean x of the best cluster (members
 * within `radius` of a candidate) among candidates within `searchRange` of
 * centerX and below maxX, or NaN when there is none.
 */
export function densestHostiles(st: GState, centerX: number, searchRange: number, radius: number, maxX: number, includeFlying: boolean): number {
  const ents = st.world.entities;
  const list = st.hostiles;
  let bestCount = 0;
  let bestDist = INF;
  let bestX = NaN;
  for (let i = 0; i < list.length; i++) {
    const c = ents[list[i]];
    if (!c.alive || c.hp <= 0 || c.x > maxX || (c.flying && !includeFlying) || st.rts[list[i]].hidden) continue;
    const dist = Math.abs(c.x - centerX);
    if (dist > searchRange) continue;
    let count = 0;
    let sum = 0;
    for (let j = 0; j < list.length; j++) {
      const o = ents[list[j]];
      if (!o.alive || o.hp <= 0 || (o.flying && !includeFlying)) continue;
      if (Math.abs(o.x - c.x) <= radius) {
        count++;
        sum += o.x;
      }
    }
    if (count > bestCount || (count === bestCount && dist < bestDist)) {
      bestCount = count;
      bestDist = dist;
      bestX = sum / count;
    }
  }
  return bestX;
}

/** Densest cluster of player bodies with x in [minX, maxX] (enemy artillery). */
export function densestPlayers(st: GState, minX: number, maxX: number, radius: number): number {
  const ents = st.world.entities;
  const list = st.players;
  let bestCount = 0;
  let bestX = NaN;
  for (let i = 0; i < list.length; i++) {
    const c = ents[list[i]];
    if (!c.alive || c.hp <= 0 || c.x < minX || c.x > maxX) continue;
    let count = 0;
    let sum = 0;
    for (let j = 0; j < list.length; j++) {
      const o = ents[list[j]];
      if (!o.alive || o.hp <= 0) continue;
      if (Math.abs(o.x - c.x) <= radius) {
        count++;
        sum += o.x;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestX = sum / count;
    }
  }
  return bestX;
}
