/**
 * The six new spells of SPEC 6.2 (effects registered in registry.ts, run from
 * spells.ts#effectsTick at order 500). Tier patches from profile.spellTiers are merged
 * into the params by spells.ts#spellsInit, so every tier is just different params:
 *
 *   salt_circle    zone: slow + holy dps; 3A bindRoot (root on first entry), 3B healPerSec
 *   global_stun    Matins Bell: stun everything; 2 interrupt (cancel a telegraphed boss step), 3A shatter
 *   burn_zone      Hellfire Pitch: x0..x1 burns; 3A slow (tar), 3B burstDamage on death in the pitch
 *   traps          Iron Jaw Traps: armed traps root + damage; 3A bleed, 3B pullRadius
 *   lance          Dawn Lance: piercing projectile down the lane; 2 knockback, 3A mark, 3B count
 *   army_buff      Rally Horn: army-wide damage / speed (+ 3B lifesteal)
 *   summon_units   Rally Horn 3A militia
 */
import { SIM_DT, type SimContext, type SpellEffect } from '../contracts';
import { interruptBoss } from './bosses';
import { explode } from './combat';
import { applyStatus, dealDamage, heal, knockback } from './damage';
import { blankShot, middleRowY, release, spawnEffect, spawnProjectile, spawnUnitAt } from './pool';
import { byId, refreshLists, setAnim, type ActiveEffect, type GState } from './state';
import { allyCount } from './summon';

type Params = SpellEffect['params'];
const n = (p: Params, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k] as number) : d);
const b = (p: Params, k: string): boolean => p[k] === true;

/** zone effects keep refreshing short statuses so they end soon after leaving the zone */
const ZONE_LINGER = 0.25;

export const NEW_EFFECTS: Readonly<Record<string, (st: GState, ctx: SimContext, fx: ActiveEffect) => void>> = {
  salt_circle: saltCircle,
  global_stun: globalStun,
  burn_zone: burnZone,
  traps,
  lance,
  army_buff: armyBuff,
  summon_units: summonUnits,
};

function impact(st: GState, fx: ActiveEffect, effect: string, x: number, radius: number): void {
  st.bus.emit('spell:impact', { spellId: fx.spellId, effect, x, y: middleRowY(st), radius });
}

/** Order 500, every tick: rally horn timer and hellfire death bursts. */
export function spellUpkeep(st: GState): void {
  if (st.army.left > 0) {
    st.army.left = Math.max(0, st.army.left - SIM_DT);
    if (st.army.left <= 0) {
      st.army.damage = 0;
      st.army.speed = 0;
      st.army.lifesteal = 0;
    }
  }
  if (st.bursts.length > 0) {
    refreshLists(st);
    for (let i = 0; i < st.bursts.length; i++) {
      const x = st.bursts[i];
      explode(st, 'player', x, st.burstRadius, st.burstDamage, false, 'fire', true, 1, 0, 0, st.world.ashId, false, -1);
      st.bus.emit('spell:impact', { spellId: 'hellfire_pitch', effect: 'burn_zone.burst', x, y: middleRowY(st), radius: st.burstRadius });
    }
    st.bursts.length = 0;
  }
}

function zoneFx(st: GState, fx: ActiveEffect, sprite: string, x: number, ttl: number): void {
  const s = spawnEffect(st, fx.effect, sprite, x, middleRowY(st), 0, ttl);
  fx.entityIds.push(st.world.entities[s].id);
}

function endZone(st: GState, fx: ActiveEffect): void {
  for (const id of fx.entityIds) {
    const s = st.idSlot.get(id);
    if (s !== undefined && st.world.entities[s].id === id) release(st, s);
  }
  fx.entityIds.length = 0;
  fx.active = false;
}

/** Salt Circle (see header). */
function saltCircle(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const radius = n(p, 'radius', 0);
  const duration = n(p, 'duration', 0);
  const slow = n(p, 'slow', 0);
  const dps = n(p, 'dps', 0) * fx.power;
  const bind = n(p, 'bindRoot', 0);
  const healPs = n(p, 'healPerSec', 0) * fx.power;
  const ents = st.world.entities;
  if (fx.t === 0) {
    zoneFx(st, fx, 'fx_magic_circle', fx.x, duration);
    impact(st, fx, 'salt_circle', fx.x, radius);
  }
  fx.t += SIM_DT;
  fx.acc += SIM_DT;
  const tickNow = fx.acc >= st.T.dotTick - 1e-9;
  const chunk = fx.acc;
  if (tickNow) fx.acc = 0;
  for (let i = 0; i < st.hostiles.length; i++) {
    const s = st.hostiles[i];
    const o = ents[s];
    if (o.hp <= 0 || Math.abs(o.x - fx.x) > radius) continue;
    if (slow > 0) applyStatus(st, o, 'slow', ZONE_LINGER, slow);
    if (bind > 0 && !fx.hit.includes(o.id)) {
      fx.hit.push(o.id);
      applyStatus(st, o, 'root', o.kind === 'boss' ? bind * st.T.bossStunMul : bind, 1);
    }
    if (tickNow && dps > 0) dealDamage(st, s, dps * chunk, 'holy', ctx.world.ashId, true, 1, NaN, false);
  }
  if (tickNow && healPs > 0) {
    for (let i = 0; i < st.players.length; i++) {
      const o = ents[st.players[i]];
      if (o.hp > 0 && Math.abs(o.x - fx.x) <= radius) heal(st, o, healPs * chunk);
    }
  }
  if (fx.t >= duration - 1e-9) endZone(st, fx);
}

/** Matins Bell (see header). */
function globalStun(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const stun = n(p, 'stun', 0) * fx.power;
  const bossStun = n(p, 'bossStun', stun * st.T.bossStunMul) * fx.power;
  const shatter = n(p, 'shatter', 0);
  const ents = st.world.entities;
  for (let i = 0; i < st.hostiles.length; i++) {
    const s = st.hostiles[i];
    const o = ents[s];
    if (o.hp <= 0) continue;
    const d = o.kind === 'boss' ? bossStun : stun;
    if (o.kind === 'boss' && b(p, 'interrupt')) interruptBoss(st, s);
    applyStatus(st, o, 'stun', d, 1);
    if (shatter > 0) applyStatus(st, o, 'shatter', d, shatter);
  }
  const ash = byId(st, ctx.world.ashId);
  impact(st, fx, 'global_stun', ash ? ash.x : fx.x, 0);
  fx.active = false;
}

/** Hellfire Pitch (see header). */
function burnZone(st: GState, _ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const x0 = n(p, 'x0', 0);
  const x1 = n(p, 'x1', 0);
  const duration = n(p, 'duration', 0);
  const dps = n(p, 'dps', 0) * fx.power;
  const slow = n(p, 'slow', 0);
  const burst = n(p, 'burstDamage', 0) * fx.power;
  const ents = st.world.entities;
  if (fx.t === 0) {
    zoneFx(st, fx, 'fx_fire_big', (x0 + x1) / 2, duration);
    impact(st, fx, 'burn_zone', (x0 + x1) / 2, (x1 - x0) / 2);
  }
  fx.t += SIM_DT;
  if (burst > 0) {
    st.burstDamage = Math.max(st.burstDamage, burst);
    st.burstRadius = Math.max(st.burstRadius, n(p, 'burstRadius', 0));
  }
  for (let i = 0; i < st.hostiles.length; i++) {
    const s = st.hostiles[i];
    const o = ents[s];
    if (o.hp <= 0 || o.flying || o.x < x0 || o.x > x1) continue;
    if (dps > 0) applyStatus(st, o, 'burn', ZONE_LINGER * 2, dps);
    if (slow > 0) applyStatus(st, o, 'slow', ZONE_LINGER, slow);
    if (burst > 0) applyStatus(st, o, 'pitch', ZONE_LINGER, 1);
  }
  if (fx.t >= duration - 1e-9) {
    if (burst > 0) {
      st.burstDamage = 0;
      st.burstRadius = 0;
    }
    endZone(st, fx);
  }
}

/** Iron Jaw Traps (see header). */
function traps(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const count = Math.max(1, Math.round(n(p, 'count', 1)));
  const spread = n(p, 'spread', 60);
  const w = ctx.data.balance.world;
  const ents = st.world.entities;
  if (fx.t === 0) {
    for (let i = 0; i < count; i++) {
      const off = count === 1 ? 0 : (-spread * (count - 1)) / 2 + spread * i;
      const tx = Math.max(w.pit.right, Math.min(w.fieldRight, fx.x + off));
      const s = spawnEffect(st, 'bear_trap', 'bear_trap', tx, middleRowY(st), 0, st.T.trapLifetime);
      fx.entityIds.push(ents[s].id);
    }
    impact(st, fx, 'traps', fx.x, (spread * (count - 1)) / 2);
  }
  fx.t += SIM_DT;
  const dmg = n(p, 'damage', 0) * fx.power;
  const root = n(p, 'root', 0);
  const trig = n(p, 'triggerRadius', 24);
  const bleed = n(p, 'bleedDps', 0) * fx.power;
  const bleedDur = n(p, 'bleedDuration', 0);
  const pull = n(p, 'pullRadius', 0);
  let armed = 0;
  for (let k = 0; k < fx.entityIds.length; k++) {
    const trap = byId(st, fx.entityIds[k]);
    if (!trap) continue;
    let victim = -1;
    for (let i = 0; i < st.hostiles.length; i++) {
      const s = st.hostiles[i];
      const o = ents[s];
      if (o.hp <= 0 || o.flying || o.alt > 1 || st.rts[s].hidden) continue;
      if (Math.abs(o.x - trap.x) <= trig + st.rts[s].radius * 0.5) {
        victim = s;
        break;
      }
    }
    if (victim < 0) {
      armed++;
      continue;
    }
    const o = ents[victim];
    dealDamage(st, victim, dmg, 'physical', ctx.world.ashId, false, 1, NaN, true);
    if (o.hp > 0) {
      if (root > 0) applyStatus(st, o, 'root', o.kind === 'boss' ? root * st.T.bossStunMul : root, 1);
      if (bleed > 0) applyStatus(st, o, 'bleed', bleedDur, bleed);
    }
    if (pull > 0) {
      for (let i = 0; i < st.hostiles.length; i++) {
        const s = st.hostiles[i];
        const q = ents[s];
        if (s === victim || q.hp <= 0 || q.flying) continue;
        const d = trap.x - q.x;
        if (Math.abs(d) <= pull && Math.abs(d) > 4) knockback(st, q, st.rts[s], Math.abs(d) * 0.8, Math.sign(d));
      }
    }
    st.bus.emit('spell:impact', { spellId: fx.spellId, effect: 'traps.snap', x: trap.x, y: trap.y, radius: pull });
    // the sprung trap stays a moment to show its jaws snapping shut, then expires on its own
    setAnim(trap, 'attack');
    trap.ttl = 0.7;
    fx.entityIds.splice(k, 1);
    k--;
  }
  if (armed === 0 || fx.t >= st.T.trapLifetime) endZone(st, fx);
}

/** Dawn Lance (see header). */
function lance(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const count = Math.max(1, Math.round(n(p, 'count', 1)));
  const gap = n(p, 'gap', 0.4);
  if (fx.n < count && fx.t >= fx.n * gap - 1e-9) {
    fx.n++;
    const ash = byId(st, ctx.world.ashId);
    if (ash && ash.hp > 0) {
      const rt = st.rts[st.idSlot.get(ash.id)!];
      const dir = fx.n === 1 ? fx.dir : ash.facing;
      const shot = blankShot('lance', 'player', ash.id, n(p, 'damage', 0) * fx.power);
      shot.x = ash.x + dir * rt.radius;
      shot.y = ash.y;
      shot.alt = rt.hitH;
      shot.targetX = ash.x + dir * st.T.lanceRange;
      shot.targetY = ash.y;
      shot.targetAlt = rt.hitH;
      shot.range = st.T.lanceRange;
      shot.pierce = 999;
      shot.hitsFlying = true;
      shot.both = true;
      shot.kind = 'holy';
      shot.fromAsh = true;
      shot.speed = n(p, 'speed', 0);
      shot.knockback = n(p, 'knockback', 0);
      shot.mark = n(p, 'mark', 0);
      shot.markDur = n(p, 'markDuration', 0);
      spawnProjectile(st, shot);
      impact(st, fx, 'lance', ash.x, 0);
    }
  }
  fx.t += SIM_DT;
  if (fx.n >= count) fx.active = false;
}

/** Rally Horn (see header). */
function armyBuff(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const dur = n(p, 'duration', 0);
  const a = st.army;
  a.left = Math.max(a.left, dur);
  a.damage = Math.max(a.damage, n(p, 'damage', 0) * fx.power);
  a.speed = Math.max(a.speed, n(p, 'speed', 0));
  a.lifesteal = Math.max(a.lifesteal, n(p, 'lifesteal', 0));
  const ents = st.world.entities;
  for (let i = 0; i < st.players.length; i++) {
    const o = ents[st.players[i]];
    if (o.hp > 0) applyStatus(st, o, 'buff', dur, 1 + a.damage);
  }
  const ash = byId(st, ctx.world.ashId);
  impact(st, fx, 'army_buff', ash ? ash.x : fx.x, 0);
  fx.active = false;
}

/** Rally Horn 3A militia: `count` units of `unit` at the stairs; they get the running army buff. */
function summonUnits(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  fx.active = false;
  const def = ctx.data.units.get(String(p.unit));
  if (!def) return;
  const count = Math.round(n(p, 'count', 0));
  const cap = ctx.data.balance.limits.maxAllies;
  const sx = ctx.data.balance.world.stairsX;
  const ents = st.world.entities;
  for (let i = 0; i < count && (def.kind === 'hero' || allyCount(st) < cap); i++) {
    const s = spawnUnitAt(st, def, sx - i * st.T.escortStep);
    if (st.army.left > 0) applyStatus(st, ents[s], 'buff', st.army.left, 1 + st.army.damage);
  }
  impact(st, fx, 'summon_units', sx, 0);
}
