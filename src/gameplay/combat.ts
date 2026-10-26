/**
 * Order 400: statuses, projectiles, unit/enemy attacks, healers, book damage.
 * Ash's own attacks live in ash.ts (called from here).
 */
import { SIM_DT, type AttackDef, type DamageKind, type EntityState } from '../contracts';
import { ashCombat } from './ash';
import { applyStatus, dealDamage, heal, knockback, statusOf, tickStatuses } from './damage';
import { aimY, muzzleY, release, shotFromAttack, spawnProjectile } from './pool';
import { BOOK, NONE, refreshLists, setAnim, type GState } from './state';
import { ashInReach, densestPlayers, nearestHostile, nearestPlayer } from './targeting';
import { CAST_ANIM_TIME } from './tuning';

export function combatTick(st: GState): void {
  refreshLists(st);
  const ents = st.world.entities;
  // statuses (burn can kill, so iterate copies of the lists' current content)
  for (let i = 0; i < st.players.length; i++) tickStatuses(st, st.players[i]);
  for (let i = 0; i < st.hostiles.length; i++) tickStatuses(st, st.hostiles[i]);
  // projectiles
  for (let s = 0; s < ents.length; s++) {
    const e = ents[s];
    if (e.alive && e.kind === 'projectile') projectileTick(st, s);
  }
  ashCombat(st);
  for (let i = 0; i < st.players.length; i++) {
    const s = st.players[i];
    const e = ents[s];
    if (e.kind === 'ash' || e.hp <= 0) continue;
    const rt = st.rts[s];
    if (rt.healInterval > 0) healerTick(st, s);
    if (rt.attack) allyAttack(st, s);
  }
  for (let i = 0; i < st.hostiles.length; i++) {
    const s = st.hostiles[i];
    const e = ents[s];
    if (e.kind !== 'enemy' || e.hp <= 0) continue;
    enemyAttack(st, s);
  }
}

export function damageBook(st: GState, amount: number): void {
  const book = st.world.book;
  if (amount <= 0 || book.hp <= 0) return;
  const dmg = Math.min(book.hp, amount);
  book.hp -= dmg;
  st.bus.emit('book:damaged', { amount: dmg, hp: book.hp });
}

/** damage multiplier from friendly auras around a player-side attacker */
function auraMul(st: GState, e: EntityState): number {
  let best = 0;
  const ents = st.world.entities;
  for (let i = 0; i < st.auraSources.length; i++) {
    const s = st.auraSources[i];
    const src = ents[s];
    if (src.hp <= 0) continue;
    const rt = st.rts[s];
    if (Math.abs(src.x - e.x) <= rt.auraRadius && rt.auraValue > best) best = rt.auraValue;
  }
  return 1 + best;
}

function stunned(e: EntityState): boolean {
  return !!statusOf(e, 'stun');
}

function allyAttack(st: GState, slot: number): void {
  const ents = st.world.entities;
  const e = ents[slot];
  const rt = st.rts[slot];
  const a = rt.attack!;
  if (stunned(e)) return;
  rt.attackTimer = Math.max(0, rt.attackTimer - SIM_DT);
  const t = nearestHostile(st, e.x, rt.range, a.hitsFlying, 0);
  rt.engaged = t >= 0;
  rt.targetId = t >= 0 ? ents[t].id : NONE;
  if (t < 0) return;
  const te = ents[t];
  if (te.x !== e.x) e.facing = te.x > e.x ? 1 : -1;
  if (rt.attackTimer > 0) return;
  rt.attackTimer = rt.interval;
  let dmg = rt.damage * auraMul(st, e);
  let kb = 0;
  if (rt.charged) {
    dmg *= rt.chargeMul;
    kb = rt.chargeKb;
    rt.charged = false;
    rt.chargeIdle = 0;
  }
  strike(st, slot, t, dmg, kb);
}

/** One attack of `attacker` (ally or enemy) on body `target`: projectile or instant hit with cleave/splash. */
export function strike(st: GState, attacker: number, target: number, dmg: number, kb: number): void {
  const ents = st.world.entities;
  const e = ents[attacker];
  const rt = st.rts[attacker];
  const a = rt.attack!;
  const te = ents[target];
  st.bus.emit('entity:attack', { id: e.id, targetId: te.id, x: e.x, y: e.y, ranged: a.kind === 'ranged' });
  if (e.anim === 'attack') e.animTime = 0;
  else setAnim(e, 'attack');
  if (a.kind === 'ranged' && a.projectile) {
    const shot = shotFromAttack(a, e.team, e.id, dmg);
    shot.x = e.x + e.facing * rt.radius * 0.5;
    shot.y = muzzleY(e);
    shot.targetX = te.x;
    shot.targetY = aimY(te);
    shot.flyLayer = te.flying;
    shot.arc = rt.artilleryMin >= 0;
    spawnProjectile(st, shot);
    return;
  }
  hitBody(st, e.id, e.x, target, dmg, a, kb, e.facing, a.kind === 'ranged' ? e.x : NaN);
  if (a.maxTargets > 1) {
    // cleave: next nearest bodies in front, within reach
    const chosen = st.scratch;
    chosen.length = 0;
    chosen.push(target);
    const list = e.team === 'player' ? st.hostiles : st.players;
    for (let n = 1; n < a.maxTargets; n++) {
      let best = -1;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (chosen.includes(s)) continue;
        const o = ents[s];
        if (!o.alive || o.hp <= 0 || (o.flying && !a.hitsFlying)) continue;
        const r = st.rts[s].radius;
        const dx = (o.x - e.x) * e.facing;
        if (dx < -r) continue;
        const d = Math.abs(o.x - e.x) - r;
        if (d <= rt.range && d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (best < 0) break;
      chosen.push(best);
      hitBody(st, e.id, e.x, best, dmg, a, kb, e.facing, NaN);
    }
  }
  if (a.splashRadius > 0) {
    explode(st, e.team === 'player' ? 'player' : 'enemy', te.x, a.splashRadius, dmg, a.hitsFlying, a.damageKind, a.armorPierce, a.bonusVsLarge, a.burn ? a.burn.dps : 0, a.burn ? a.burn.duration : 0, e.id, false, target);
  }
}

function hitBody(st: GState, sourceId: number, fromX: number, target: number, dmg: number, a: AttackDef, kb: number, dir: number, shieldFromX: number): void {
  const te = st.world.entities[target];
  dealDamage(st, target, dmg, a.damageKind, sourceId, a.armorPierce, a.bonusVsLarge, shieldFromX, false);
  if (te.hp > 0) {
    if (a.burn) applyStatus(st, te, 'burn', a.burn.duration, a.burn.dps);
    if (kb > 0) knockback(st, te, st.rts[target], kb, te.x >= fromX ? dir : -dir);
  }
}

/**
 * Area damage on the opposing side of `team` around x. `skip` = a slot already
 * hit by the direct impact (or -1).
 */
export function explode(
  st: GState,
  team: 'player' | 'enemy',
  x: number,
  radius: number,
  dmg: number,
  hitsFlying: boolean,
  kind: DamageKind,
  armorPierce: boolean,
  bonusVsLarge: number,
  burnDps: number,
  burnDur: number,
  sourceId: number,
  spectacle: boolean,
  skip: number,
): number {
  const ents = st.world.entities;
  const list = team === 'player' ? st.hostiles : st.players;
  let hits = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s === skip) continue;
    const o = ents[s];
    if (!o.alive || o.hp <= 0 || (o.flying && !hitsFlying)) continue;
    if (Math.abs(o.x - x) > radius + st.rts[s].radius) continue;
    dealDamage(st, s, dmg, kind, sourceId, armorPierce, bonusVsLarge, NaN, spectacle);
    if (burnDps > 0 && o.hp > 0) applyStatus(st, o, 'burn', burnDur, burnDps);
    hits++;
  }
  return hits;
}

function enemyAttack(st: GState, slot: number): void {
  const ents = st.world.entities;
  const e = ents[slot];
  const rt = st.rts[slot];
  const a = rt.attack;
  if (!a || stunned(e) || rt.leapLeft > 0) return;
  rt.attackTimer = Math.max(0, rt.attackTimer - SIM_DT);
  const w = st.data.balance.world;
  const bookInReach = e.x - w.bookX <= rt.range;
  let target = -1;
  let pointX = NaN;
  if (rt.siegeSlow >= 0) {
    // siege: only the book
  } else if (rt.artilleryMin >= 0) {
    pointX = densestPlayers(st, e.x - rt.range, e.x - rt.artilleryMin, Math.max(a.splashRadius, 40));
  } else if (rt.flyer) {
    target = ashInReach(st, e.x, rt.range);
  } else {
    if (rt.preferAsh) target = ashInReach(st, e.x, rt.range);
    if (target < 0) target = nearestPlayer(st, e.x, rt.range, 0);
  }
  const engaged = target >= 0 || pointX === pointX || bookInReach;
  rt.engaged = engaged;
  rt.targetId = target >= 0 ? ents[target].id : bookInReach ? BOOK : NONE;
  if (!engaged) return;
  if (target >= 0) {
    const tx = ents[target].x;
    if (tx !== e.x) e.facing = tx > e.x ? 1 : -1;
  } else e.facing = -1;
  if (rt.attackTimer > 0) return;
  rt.attackTimer = rt.interval;
  const dmg = rt.damage;
  if (target >= 0) {
    strike(st, slot, target, dmg, 0);
    return;
  }
  st.bus.emit('entity:attack', { id: e.id, targetId: null, x: e.x, y: e.y, ranged: a.kind === 'ranged' });
  if (e.anim === 'attack') e.animTime = 0;
  else setAnim(e, 'attack');
  if (pointX === pointX || (a.kind === 'ranged' && a.projectile)) {
    const shot = shotFromAttack(a, 'enemy', e.id, dmg);
    shot.x = e.x - rt.radius * 0.5;
    shot.y = muzzleY(e);
    if (pointX === pointX) {
      shot.targetX = pointX;
      shot.targetY = w.groundY - 20;
      shot.arc = true;
    } else {
      shot.targetX = w.bookX;
      shot.targetY = w.groundY - 30;
      shot.toBook = true;
      shot.arc = rt.artilleryMin >= 0;
    }
    spawnProjectile(st, shot);
    return;
  }
  damageBook(st, dmg);
}

function healerTick(st: GState, slot: number): void {
  const ents = st.world.entities;
  const e = ents[slot];
  const rt = st.rts[slot];
  if (stunned(e)) return;
  rt.healTimer = Math.max(0, rt.healTimer - SIM_DT);
  if (rt.healTimer > 0) return;
  const chosen = st.scratch;
  chosen.length = 0;
  for (let n = 0; n < rt.healTargets; n++) {
    let best = -1;
    let bestFrac = 1;
    for (let i = 0; i < st.players.length; i++) {
      const s = st.players[i];
      if (chosen.includes(s)) continue;
      const o = ents[s];
      if (!o.alive || o.hp <= 0 || o.hp >= o.maxHp) continue;
      if (Math.abs(o.x - e.x) > rt.healRadius) continue;
      const frac = o.hp / o.maxHp;
      if (frac < bestFrac) {
        bestFrac = frac;
        best = s;
      }
    }
    if (best < 0) break;
    chosen.push(best);
  }
  if (chosen.length === 0) return;
  for (let i = 0; i < chosen.length; i++) heal(st, ents[chosen[i]], rt.healAmount);
  rt.healTimer = rt.healInterval;
  setAnim(e, 'cast');
  e.animTime = 0;
  rt.animHold = CAST_ANIM_TIME;
  st.bus.emit('entity:attack', { id: e.id, targetId: ents[chosen[0]].id, x: e.x, y: e.y, ranged: true });
}

function projectileTick(st: GState, slot: number): void {
  const ents = st.world.entities;
  const p = ents[slot];
  const rt = st.rts[slot];
  const x0 = p.x;
  const x1 = x0 + rt.pVx * SIM_DT;
  const dir = rt.pVx >= 0 ? 1 : -1;
  const span = Math.max(1, Math.abs(rt.pEndX - rt.pStartX));
  p.ttl -= SIM_DT;
  if (rt.pArcH >= 0) {
    // arcing / book shot: lands at pEndX
    const arrived = (x1 - rt.pEndX) * dir >= 0;
    const nx = arrived ? rt.pEndX : x1;
    const prog = Math.min(1, Math.abs(nx - rt.pStartX) / span);
    p.x = nx;
    p.y = rt.pStartY + (rt.pEndY - rt.pStartY) * prog - rt.pArcH * 4 * prog * (1 - prog);
    if (arrived) {
      if (rt.pToBook) damageBook(st, p.value);
      if (rt.pSplash > 0) {
        explode(st, p.team === 'player' ? 'player' : 'enemy', rt.pEndX, rt.pSplash, p.value, rt.pHitsFlying, rt.pKind, rt.pArmorPierce, rt.pBonusLarge, rt.pBurnDps, rt.pBurnDur, rt.pOwner, rt.pFromAsh || p.team === 'player', -1);
        st.bus.emit('spectacle:hit', { x: rt.pEndX, y: st.data.balance.world.groundY, big: true });
      }
      release(st, slot);
    } else if (p.ttl <= 0) release(st, slot);
    return;
  }
  // straight shot: swept collision with bodies of the other side in its layer
  const lo = Math.min(x0, x1) - 4;
  const hi = Math.max(x0, x1) + 4;
  const list = p.team === 'player' ? st.hostiles : st.players;
  p.x = x1;
  const prog = Math.min(1, Math.abs(x1 - rt.pStartX) / span);
  p.y = rt.pStartY + (rt.pEndY - rt.pStartY) * prog;
  for (;;) {
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const o = ents[s];
      if (!o.alive || o.hp <= 0 || o.flying !== rt.pFlyLayer) continue;
      if (o.flying && !rt.pHitsFlying) continue;
      const r = st.rts[s].radius;
      if (o.x + r < lo || o.x - r > hi) continue;
      if (rt.pHit.includes(o.id)) continue;
      const d = (o.x - x0) * dir;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (best < 0) break;
    const o = ents[best];
    if (rt.pSplash > 0) {
      dealDamage(st, best, p.value, rt.pKind, rt.pOwner, rt.pArmorPierce, rt.pBonusLarge, rt.pStartX, rt.pFromAsh);
      if (rt.pBurnDps > 0 && o.hp > 0) applyStatus(st, o, 'burn', rt.pBurnDur, rt.pBurnDps);
      explode(st, p.team === 'player' ? 'player' : 'enemy', o.x, rt.pSplash, p.value, rt.pHitsFlying, rt.pKind, rt.pArmorPierce, rt.pBonusLarge, rt.pBurnDps, rt.pBurnDur, rt.pOwner, rt.pFromAsh, best);
      release(st, slot);
      return;
    }
    dealDamage(st, best, p.value, rt.pKind, rt.pOwner, rt.pArmorPierce, rt.pBonusLarge, rt.pStartX, rt.pFromAsh);
    if (rt.pBurnDps > 0 && o.hp > 0) applyStatus(st, o, 'burn', rt.pBurnDur, rt.pBurnDps);
    rt.pHit.push(o.id);
    rt.pPierce--;
    if (rt.pPierce < 0) {
      release(st, slot);
      return;
    }
  }
  if (p.ttl <= 0 || x1 < 0 || x1 > st.data.balance.world.width) release(st, slot);
}
