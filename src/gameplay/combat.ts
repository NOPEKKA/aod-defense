/**
 * Order 400: statuses, projectiles, unit/enemy attacks, healers, book damage.
 * Ash's own attacks live in ash.ts, hero abilities in heroes.ts (both called from here).
 *
 * Windup (SPEC v2.3): an attack starts (anim 'attack', animTime 0, entity:attack),
 * the hit lands / the projectile leaves `windup` seconds later if the target is still
 * live and within reach + combat.windupSlack, otherwise the swing whiffs. The rest of
 * `interval` is recovery. A stun during the windup cancels the swing.
 *
 * Projectiles fly in (x, alt): from the shooter's muzzle (row y, muzzle height) to the
 * target's hit point (row y, hit height), with an arc by projectile kind
 * (balance.tuning projectile.arc.<sprite>). Straight shots collide with bodies of the
 * aimed layer (ground / flying) along the way; lobs and book shots land at their aim x.
 */
import { SIM_DT, type AttackDef, type DamageKind, type EntityState } from '../contracts';
import { bookReach } from './ai';
import { ashCombat } from './ash';
import { applyStatus, dealDamage, heal, knockback, setStatus, statusMag, statusOf, tickStatuses } from './damage';
import { heroesTick } from './heroes';
import { aimAt, aimFrom, projectilePlace, release, shotFromAttack, spawnProjectile } from './pool';
import { BOOK, byId, isLive, NONE, POINT, refreshLists, restartAnim, W_IDLE, W_WINDUP, type GState, type Rt } from './state';
import { ashInReach, densestPlayers, nearestHostile, nearestPlayer } from './targeting';

export function combatTick(st: GState): void {
  refreshLists(st);
  const ents = st.world.entities;
  // statuses (burn can kill; lists hold slots and hp is re-checked)
  for (let i = 0; i < st.players.length; i++) tickStatuses(st, st.players[i]);
  for (let i = 0; i < st.hostiles.length; i++) tickStatuses(st, st.hostiles[i]);
  // projectiles
  for (let s = 0; s < ents.length; s++) {
    const e = ents[s];
    if (e.alive && e.kind === 'projectile') projectileTick(st, s);
  }
  ashCombat(st);
  heroesTick(st);
  for (let i = 0; i < st.players.length; i++) {
    const s = st.players[i];
    const e = ents[s];
    if (e.kind === 'ash' || e.hp <= 0) continue;
    const rt = st.rts[s];
    if (rt.healInterval > 0) healerTick(st, s);
    if (rt.attack) unitAttack(st, s);
  }
  for (let i = 0; i < st.hostiles.length; i++) {
    const s = st.hostiles[i];
    const e = ents[s];
    if (e.kind !== 'enemy' || e.hp <= 0) continue;
    if (st.rts[s].attack) unitAttack(st, s);
  }
}

export function damageBook(st: GState, amount: number): void {
  const book = st.world.book;
  if (amount <= 0 || book.hp <= 0) return;
  const dmg = Math.min(book.hp, amount);
  book.hp -= dmg;
  st.bus.emit('book:damaged', { amount: dmg, hp: book.hp });
}

/** damage multiplier from friendly auras and the rally horn around a player-side attacker */
export function playerDamageMul(st: GState, e: EntityState): number {
  let best = 0;
  const ents = st.world.entities;
  for (let i = 0; i < st.auraSources.length; i++) {
    const s = st.auraSources[i];
    const src = ents[s];
    if (src.hp <= 0) continue;
    const rt = st.rts[s];
    if (rt.auraRadius > 0 && Math.abs(src.x - e.x) <= rt.auraRadius && rt.auraValue > best) best = rt.auraValue;
  }
  let mul = 1 + best;
  if (st.army.left > 0) mul *= 1 + st.army.damage;
  return mul;
}

function stunned(e: EntityState): boolean {
  return !!statusOf(e, 'stun');
}

/** attack-speed multiplier (rally horn for the player side) */
function rateMul(st: GState, e: EntityState): number {
  return e.team === 'player' && st.army.left > 0 ? 1 + st.army.speed : 1;
}

/** Choose what an enemy attacks right now: a slot, BOOK, POINT (sets rt.wPointX) or NONE. */
function enemyTarget(st: GState, slot: number): number {
  const ents = st.world.entities;
  const e = ents[slot];
  const rt = st.rts[slot];
  const w = st.data.balance.world;
  const toBook = e.x - w.bookX;
  const bookOk = toBook <= rt.range || (toBook <= bookReach(st, rt) && rt.settled);
  if (rt.siegeSlow >= 0) return bookOk ? BOOK : NONE;
  if (rt.artilleryMin >= 0) {
    const px = densestPlayers(st, e.x - rt.range, e.x - rt.artilleryMin, Math.max(rt.attack!.splashRadius, 40));
    if (px === px) {
      rt.wPointX = px;
      return POINT;
    }
    return bookOk ? BOOK : NONE;
  }
  if (rt.flyer) {
    const a = ashInReach(st, e.x, rt.range);
    if (a >= 0) return a;
    return bookOk ? BOOK : NONE;
  }
  // taunted (Evil Ash hero): hit the taunter if it is in reach
  if (e.statuses.length > 0) {
    const tid = statusMag(e, 'taunt');
    if (tid > 0) {
      const t = byId(st, tid);
      if (isLive(t)) {
        const ts = st.idSlot.get(t.id)!;
        if (Math.abs(t.x - e.x) - st.rts[ts].radius <= rt.range) return ts;
      }
    }
  }
  let t = -1;
  if (rt.preferAsh) t = ashInReach(st, e.x, rt.range);
  if (t < 0) t = nearestPlayer(st, e.x, rt.range, 0);
  if (t >= 0) return t;
  return bookOk ? BOOK : NONE;
}

/** Ally / hero / enemy attack loop with windup. */
function unitAttack(st: GState, slot: number): void {
  const ents = st.world.entities;
  const e = ents[slot];
  const rt = st.rts[slot];
  const rate = rateMul(st, e);
  rt.attackTimer = Math.max(0, rt.attackTimer - SIM_DT * rate);
  if (stunned(e) || rt.leapLeft > 0) {
    if (rt.wState === W_WINDUP) rt.wState = W_IDLE; // interrupted
    return;
  }
  if (rt.wState === W_WINDUP) {
    rt.wTimer -= SIM_DT * rate;
    if (rt.wTimer <= 1e-9) resolveSwing(st, slot);
    return;
  }
  const player = e.team === 'player';
  let target: number;
  if (player) {
    const a = rt.attack!;
    target = nearestHostile(st, e.x, rt.range, a.hitsFlying, 0);
    if (target < 0) target = NONE;
  } else target = enemyTarget(st, slot);
  rt.engaged = target !== NONE;
  rt.targetId = target >= 0 ? ents[target].id : target;
  if (target === NONE) return;
  const w = st.data.balance.world;
  const tx = target >= 0 ? ents[target].x : target === POINT ? rt.wPointX : w.bookX;
  if (tx !== e.x) e.facing = tx > e.x ? 1 : -1;
  if (rt.attackTimer > 0) return;

  // ---- start the swing ----
  let dmg = rt.damage;
  let kb = 0;
  if (player) {
    dmg *= playerDamageMul(st, e);
    if (rt.charged) {
      dmg *= rt.chargeMul;
      kb = rt.chargeKb;
      rt.charged = false;
      rt.chargeIdle = 0;
    } else if (rt.firstStrike) {
      dmg *= 1 + st.T.chargeBonus;
      rt.firstStrike = false;
      rt.chargeIdle = 0;
    }
  }
  rt.attackTimer = rt.interval;
  rt.wState = W_WINDUP;
  rt.wTimer = rt.windup;
  rt.wTarget = target >= 0 ? ents[target].id : target;
  rt.wDmg = dmg;
  rt.wKb = kb;
  restartAnim(e, 'attack', '');
  rt.animHold = Math.min(rt.interval, rt.windup + st.T.attackFollowThrough);
  st.bus.emit('entity:attack', { id: e.id, targetId: target >= 0 ? ents[target].id : null, x: e.x, y: e.y, ranged: rt.attack!.kind === 'ranged' });
  if (rt.windup <= 1e-9) resolveSwing(st, slot);
}

/** The windup is over: land the hit / launch the projectile, or whiff. */
function resolveSwing(st: GState, slot: number): void {
  const ents = st.world.entities;
  const e = ents[slot];
  const rt = st.rts[slot];
  const a = rt.attack!;
  rt.wState = W_IDLE;
  const w = st.data.balance.world;
  const slack = st.T.windupSlack;
  if (rt.wTarget === BOOK) {
    if (e.x - w.bookX > bookReach(st, rt) + slack) {
      st.stats.whiffs++;
      return;
    }
    if (a.kind === 'ranged' && a.projectile) {
      const shot = shotFromAttack(a, e.team, e.id, rt.wDmg);
      aimFrom(st, shot, e, rt);
      shot.targetX = w.bookX;
      shot.targetY = w.groundY;
      shot.targetAlt = st.T.bookAlt;
      shot.toBook = true;
      spawnProjectile(st, shot);
    } else damageBook(st, rt.wDmg);
    return;
  }
  if (rt.wTarget === POINT) {
    const shot = shotFromAttack(a, e.team, e.id, rt.wDmg);
    aimFrom(st, shot, e, rt);
    shot.targetX = rt.wPointX;
    shot.targetY = st.world.entities[slot].y;
    shot.targetAlt = 0;
    shot.lob = true;
    spawnProjectile(st, shot);
    return;
  }
  const te = byId(st, rt.wTarget);
  const ts = te ? st.idSlot.get(te.id)! : -1;
  if (!isLive(te) || st.rts[ts].hidden || (te.flying && !a.hitsFlying && e.team === 'player') || Math.abs(te.x - e.x) - st.rts[ts].radius > rt.range + slack) {
    st.stats.whiffs++;
    return;
  }
  if (te.x !== e.x) e.facing = te.x > e.x ? 1 : -1;
  strikeNow(st, slot, ts, rt.wDmg, rt.wKb);
}

/** The hit itself: projectile or instant hit with cleave/splash and on-hit effects. */
export function strikeNow(st: GState, attacker: number, target: number, dmg: number, kb: number): void {
  const ents = st.world.entities;
  const e = ents[attacker];
  const rt = st.rts[attacker];
  const a = rt.attack!;
  const te = ents[target];
  const trt = st.rts[target];
  if (a.kind === 'ranged' && a.projectile) {
    const shot = shotFromAttack(a, e.team, e.id, dmg);
    aimFrom(st, shot, e, rt);
    const lob = rt.artilleryMin >= 0 || (a.splashRadius > 0 && te.flying === false && st.T.projectileArc(a.projectile) >= 0.15);
    aimAt(shot, te, trt, !lob);
    shot.flyLayer = te.flying;
    shot.lob = lob;
    shot.mark = rt.markBonus;
    shot.markDur = rt.markDur;
    spawnProjectile(st, shot);
    return;
  }
  let dealt = hitBody(st, attacker, target, dmg, a, kb, e.facing, a.kind === 'ranged' ? e.x : NaN);
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
        if (!o.alive || o.hp <= 0 || (o.flying && !a.hitsFlying) || st.rts[s].hidden) continue;
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
      dealt += hitBody(st, attacker, best, dmg, a, kb, e.facing, NaN);
    }
  }
  if (a.splashRadius > 0) {
    explode(st, e.team === 'player' ? 'player' : 'enemy', te.x, a.splashRadius, dmg, a.hitsFlying, a.damageKind, a.armorPierce, a.bonusVsLarge, a.burn ? a.burn.dps : 0, a.burn ? a.burn.duration : 0, e.id, false, target);
  }
  const steal = rt.lifesteal + (e.team === 'player' && st.army.left > 0 ? st.army.lifesteal : 0);
  if (steal > 0 && dealt > 0) heal(st, e, dealt * steal);
}

/** One melee hit with burn, knockback and the attacker's on-hit effects (mark, shred). */
function hitBody(st: GState, attacker: number, target: number, dmg: number, a: AttackDef, kb: number, dir: number, shieldFromX: number): number {
  const ents = st.world.entities;
  const e = ents[attacker];
  const rt = st.rts[attacker];
  const te = ents[target];
  const dealt = dealDamage(st, target, dmg, a.damageKind, e.id, a.armorPierce, a.bonusVsLarge, shieldFromX, false);
  if (te.hp > 0) {
    onHitEffects(st, rt, te);
    if (a.burn) applyStatus(st, te, 'burn', a.burn.duration, a.burn.dps);
    if (kb > 0) knockback(st, te, st.rts[target], kb, te.x >= e.x ? dir : -dir);
  }
  return dealt;
}

/** Silver Mark (Garrick) and Shred (Sheila). */
export function onHitEffects(st: GState, rt: Rt, te: EntityState): void {
  if (rt.markBonus > 0) applyStatus(st, te, 'mark', rt.markDur, rt.markBonus);
  if (rt.shredPer > 0 && te.armor > 0) {
    const cur = statusMag(te, 'shred');
    setStatus(st, te, 'shred', st.T.shredDuration, Math.min(rt.shredMax, cur + rt.shredPer));
  }
}

/**
 * Area damage on the opposing side of `team` around x. `skip` = a slot already
 * hit by the direct impact (or -1). Returns the number of bodies hit.
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
    // (Ash's bias can push his score below 0)
    for (let i = 0; i < st.players.length; i++) {
      const s = st.players[i];
      if (chosen.includes(s)) continue;
      const o = ents[s];
      if (!o.alive || o.hp <= 0 || o.hp >= o.maxHp) continue;
      const isAsh = o.kind === 'ash';
      if (Math.abs(o.x - e.x) > rt.healRadius * (isAsh ? st.T.healAshReach : 1)) continue;
      // Ash comes first: he counts as more hurt than he is
      const frac = o.hp / o.maxHp - (isAsh ? st.T.healAshBias : 0);
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
  restartAnim(e, 'cast', 'heal');
  rt.animHold = st.T.castAnimTime;
  st.bus.emit('entity:attack', { id: e.id, targetId: ents[chosen[0]].id, x: e.x, y: e.y, ranged: true });
}

function projectileTick(st: GState, slot: number): void {
  const ents = st.world.entities;
  const p = ents[slot];
  const rt = st.rts[slot];
  const x0 = p.x;
  rt.pT += SIM_DT;
  p.ttl -= SIM_DT;
  if (!rt.pStraight) {
    // lob / book shot: lands at pX1 after pTotal
    if (rt.pT >= rt.pTotal - 1e-9) {
      p.x = rt.pX1;
      p.y = rt.pY1;
      p.alt = rt.pAlt1;
      if (rt.pToBook) damageBook(st, p.value);
      const team = p.team === 'player' ? 'player' : 'enemy';
      if (rt.pSplash > 0) {
        explode(st, team, rt.pX1, rt.pSplash, p.value, rt.pHitsFlying, rt.pKind, rt.pArmorPierce, rt.pBonusLarge, rt.pBurnDps, rt.pBurnDur, rt.pOwner, rt.pFromAsh || p.team === 'player', -1);
        st.bus.emit('spectacle:hit', { x: rt.pX1, y: rt.pY1, big: true });
      }
      release(st, slot);
      return;
    }
    projectilePlace(p, rt);
    if (p.ttl <= 0) release(st, slot);
    return;
  }
  // straight shot: swept collision with bodies of the other side in its layer
  projectilePlace(p, rt);
  const x1 = p.x;
  const dir = rt.pDir;
  const lo = Math.min(x0, x1) - 4;
  const hi = Math.max(x0, x1) + 4;
  const list = p.team === 'player' ? st.hostiles : st.players;
  for (;;) {
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const o = ents[s];
      if (!o.alive || o.hp <= 0) continue;
      const ort = st.rts[s];
      if (ort.hidden) continue;
      if (rt.pBoth) {
        if (o.flying && !rt.pHitsFlying) continue;
      } else {
        if (o.flying !== rt.pFlyLayer) continue;
        if (o.flying && !rt.pHitsFlying) continue;
      }
      const r = ort.radius;
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
    const team = p.team === 'player' ? 'player' : 'enemy';
    dealDamage(st, best, p.value, rt.pKind, rt.pOwner, rt.pArmorPierce, rt.pBonusLarge, rt.pX0, rt.pFromAsh);
    if (o.hp > 0) {
      if (rt.pBurnDps > 0) applyStatus(st, o, 'burn', rt.pBurnDur, rt.pBurnDps);
      if (rt.pMark > 0) applyStatus(st, o, 'mark', rt.pMarkDur, rt.pMark);
      if (rt.pKb > 0) knockback(st, o, st.rts[best], rt.pKb, dir);
    }
    if (rt.pSplash > 0) {
      explode(st, team, o.x, rt.pSplash, p.value, rt.pHitsFlying, rt.pKind, rt.pArmorPierce, rt.pBonusLarge, rt.pBurnDps, rt.pBurnDur, rt.pOwner, rt.pFromAsh, best);
      release(st, slot);
      return;
    }
    rt.pHit.push(o.id);
    rt.pPierce--;
    if (rt.pPierce < 0) {
      release(st, slot);
      return;
    }
  }
  // past the aim point and down on the ground, out of time or off the field
  const grounded = rt.pT > rt.pTotal && p.alt <= 0;
  if (grounded || p.ttl <= 0 || x1 < 0 || x1 > st.data.balance.world.width) release(st, slot);
}

/** keeps a transient anim on a body for `t` seconds (hero abilities, boss steps) */
export function holdAnim(st: GState, slot: number, anim: EntityState['anim'], action: string, t: number): void {
  const e = st.world.entities[slot];
  restartAnim(e, anim, action);
  st.rts[slot].animHold = t;
}

