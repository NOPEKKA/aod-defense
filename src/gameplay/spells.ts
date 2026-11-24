/**
 * Spells: slots from ctx.wave.spells (order 100 init/cooldowns/cast) and the
 * registered effects, which run at order 500 (some over several ticks).
 *
 * Spell power: every damage / heal / effect strength is multiplied by
 * mods.apply(1, 'spell.<id>.power'). Mana via 'spell.<id>.mana' (picks up
 * 'spell.*.mana'), cooldown via 'spell.<id>.cooldown'.
 */
import { groundAt } from '../core/terrain';
import { SIM_DT, type DamageKind, type SimCommand, type SimContext, type SpellEffect } from '../contracts';
import { applyStatus, dealDamage, heal, kill, knockback } from './damage';
import { middleRowY, release, spawnEffect, spawnUnitAt } from './pool';
import { byId, refreshLists, restartAnim, type ActiveEffect, type GState } from './state';
import { allyCount } from './summon';
import { NEW_EFFECTS } from './spells_new';
import { densestHostiles } from './targeting';

type Params = SpellEffect['params'];
const n = (p: Params, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k] as number) : d);
const b = (p: Params, k: string): boolean => p[k] === true;

export function spellsInit(st: GState, ctx: SimContext): void {
  const mods = ctx.services.mods;
  ctx.world.spellSlots.length = 0;
  st.spells.length = 0;
  for (const fx of st.effects) fx.active = false;
  for (const id of ctx.wave.spells) {
    const def = ctx.data.spells.get(id);
    if (!def) continue;
    const effects: SpellEffect[] = def.effects.map((ef) => ({ effect: ef.effect, params: { ...ef.params } }));
    let mana = def.mana;
    let cooldown = def.cooldown;
    const tier = ctx.profile.spellTiers[id];
    if (def.tree && tier && tier.tier > 0) {
      const patches = [def.tree.tier1];
      if (tier.tier >= 2) patches.push(def.tree.tier2);
      if (tier.tier >= 3) patches.push(tier.branch === 'B' ? def.tree.tier3B : def.tree.tier3A);
      for (const p of patches) {
        p.paramOverrides.forEach((o, i) => {
          if (effects[i]) Object.assign(effects[i].params, o);
        });
        for (const ef of p.addEffects) effects.push({ effect: ef.effect, params: { ...ef.params } });
        if (p.manaCost !== undefined) mana = p.manaCost;
        if (p.cooldown !== undefined) cooldown = p.cooldown;
      }
    }
    ctx.world.spellSlots.push({
      spellId: id,
      manaCost: Math.max(0, mods.apply(mana, `spell.${id}.mana`)),
      cooldownLeft: 0,
      cooldownTotal: Math.max(0, mods.apply(cooldown, `spell.${id}.cooldown`)),
      targeting: def.targeting,
      aimRadius: def.aimRadius,
    });
    st.spells.push({ spellId: id, effects, power: Math.max(0, mods.apply(1, `spell.${id}.power`)) });
  }
}

export function spellsCooldownTick(ctx: SimContext): void {
  for (const s of ctx.world.spellSlots) s.cooldownLeft = Math.max(0, s.cooldownLeft - SIM_DT);
}

export function castCommand(st: GState, ctx: SimContext, cmd: Extract<SimCommand, { type: 'cast' }>): void {
  const index = cmd.slot;
  const slot = ctx.world.spellSlots[index];
  const rs = st.spells[index];
  const deny = (reason: 'mana' | 'cooldown' | 'empty' | 'no_target') => st.bus.emit('spell:denied', { slot: index, reason });
  if (!slot || !rs) return deny('empty');
  if (slot.cooldownLeft > 0) return deny('cooldown');
  const ash = byId(st, ctx.world.ashId);
  if (!ash || ash.hp <= 0) return deny('no_target');
  const w = ctx.data.balance.world;
  let x = ash.x;
  if (slot.targeting === 'point') {
    if (cmd.target === 'auto') {
      refreshLists(st);
      x = densestHostiles(st, ash.x, st.T.autoTargetRange, slot.aimRadius > 0 ? slot.aimRadius : st.T.autoTargetRadius, Number.POSITIVE_INFINITY, true);
      if (x !== x) return deny('no_target');
    } else x = Math.max(0, Math.min(w.width, cmd.target.x));
  }
  if (!ctx.services.economy.spend('mana', slot.manaCost)) return deny('mana');
  slot.cooldownLeft = slot.cooldownTotal;
  st.bus.emit('spell:cast', { slot: index, spellId: rs.spellId, x });
  st.bus.emit('spectacle:action', { action: 'cast', x, y: groundAt(st.data, x) });
  if (st.ash.dodgeLeft <= 0) {
    st.ash.wKind = 0; // casting cancels a swing
    restartAnim(ash, 'cast', rs.spellId);
    st.rts[st.idSlot.get(ash.id)!].animHold = st.T.castAnimTime;
  }
  for (const ef of rs.effects) startEffect(st, ctx, rs.spellId, ef, rs.power, x, ash.facing);
}

function freeEffect(st: GState): ActiveEffect {
  for (const fx of st.effects) if (!fx.active) return fx;
  const fx: ActiveEffect = { active: false, spellId: '', effect: '', params: {}, power: 1, x: 0, dir: 1, t: 0, n: 0, m: 0, acc: 0, flaming: false, entityIds: [], hit: [] };
  st.effects.push(fx);
  return fx;
}

function startEffect(st: GState, ctx: SimContext, spellId: string, ef: SpellEffect, power: number, x: number, dir: 1 | -1): void {
  const fx = freeEffect(st);
  fx.active = true;
  fx.spellId = spellId;
  fx.effect = ef.effect;
  fx.params = ef.params;
  fx.power = power;
  fx.x = x;
  fx.dir = dir;
  fx.t = 0;
  fx.n = 0;
  fx.m = 0;
  fx.acc = 0;
  fx.flaming = false;
  fx.entityIds.length = 0;
  fx.hit.length = 0;
  const w = ctx.data.balance.world;
  const p = ef.params;
  if (ef.effect === 'area_rain') {
    const at = n(p, 'flamingAtLevel', 0);
    fx.flaming = at > 0 && (ctx.profile.upgrades[`spell.${spellId}`] ?? 0) >= at;
  } else if (ef.effect === 'area_strike') {
    const count = Math.max(1, Math.round(n(p, 'count', 1)));
    for (let i = 0; i < count; i++) {
      const rx = rockX(fx, i, count, w.width);
      const s = spawnEffect(st, 'catapult_rock', 'rock', rx, middleRowY(st), st.T.strikeFallHeight, n(p, 'delay', 0) + i * st.T.strikeStagger + 0.5);
      fx.entityIds.push(st.world.entities[s].id);
    }
  } else if (ef.effect === 'dash_vehicle') {
    const x0 = w.castleRight + st.T.vehicleStartDx;
    const speed = Math.max(1, n(p, 'speed', 900));
    const s = spawnEffect(st, 'deathcoaster', 'fx_deathcoaster', x0, middleRowY(st), 0, (w.fieldRight - x0) / speed + 0.5);
    const e = st.world.entities[s];
    e.facing = 1;
    e.anim = 'walk';
    fx.entityIds.push(e.id);
    fx.m = x0;
    st.bus.emit('spell:impact', { spellId, effect: ef.effect, x: x0, y: groundAt(st.data, x0), radius: 0 });
  }
}

function rockX(fx: ActiveEffect, i: number, count: number, width: number): number {
  const spread = n(fx.params, 'spread', 0);
  const off = count === 1 ? 0 : -spread + (2 * spread * i) / (count - 1);
  return Math.max(0, Math.min(width, fx.x + off));
}

/** Order 500: run active spell effects. */
export function effectsTick(st: GState, ctx: SimContext): void {
  if (st.effects.length === 0) return;
  refreshLists(st);
  for (const fx of st.effects) {
    if (!fx.active) continue;
    switch (fx.effect) {
      case 'line_blast': lineBlast(st, ctx, fx); break;
      case 'area_rain': areaRain(st, ctx, fx); break;
      case 'random_boon': randomBoon(st, ctx, fx); break;
      case 'area_strike': areaStrike(st, ctx, fx); break;
      case 'portal_execute': portalExecute(st, ctx, fx); break;
      case 'self_buff': selfBuff(st, ctx, fx); break;
      case 'dash_vehicle': dashVehicle(st, ctx, fx); break;
      default: {
        const run = NEW_EFFECTS[fx.effect];
        if (run) run(st, ctx, fx);
        else fx.active = false;
      }
    }
  }
}

function impact(st: GState, fx: ActiveEffect, effect: string, x: number, radius: number): void {
  st.bus.emit('spell:impact', { spellId: fx.spellId, effect, x, y: groundAt(st.data, x), radius });
}

function lineBlast(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const length = n(p, 'length', 0);
  const dmg = n(p, 'damage', 0) * fx.power;
  const kb = n(p, 'knockback', 0);
  const hitsFlying = b(p, 'hitsFlying');
  const kind = (typeof p.damageKind === 'string' ? p.damageKind : 'physical') as DamageKind;
  const ents = st.world.entities;
  for (let i = 0; i < st.hostiles.length; i++) {
    const s = st.hostiles[i];
    const o = ents[s];
    if (!o.alive || o.hp <= 0 || (o.flying && !hitsFlying)) continue;
    const r = st.rts[s].radius;
    const d = (o.x - fx.x) * fx.dir;
    if (d < -r || d > length + r) continue;
    dealDamage(st, s, dmg, kind, ctx.world.ashId, false, 1, NaN, true);
    if (o.hp > 0) knockback(st, o, st.rts[s], kb, fx.dir);
  }
  // recoil: the blast throws Ash back
  const recoil = n(p, 'recoil', 0);
  const ash = byId(st, ctx.world.ashId);
  if (recoil > 0 && ash && ash.hp > 0) knockback(st, ash, st.rts[st.idSlot.get(ash.id)!], recoil, -fx.dir);
  impact(st, fx, 'line_blast', fx.x + (fx.dir * length) / 2, length / 2);
  fx.active = false;
}

function areaRain(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const hits = Math.max(1, Math.round(n(p, 'hits', 1)));
  const interval = n(p, 'duration', 1) / hits;
  const half = n(p, 'width', 0) / 2;
  const dmg = n(p, 'damage', 0) * fx.power;
  const hitsFlying = b(p, 'hitsFlying');
  const burnDps = n(p, 'burnDps', 0) * fx.power;
  const burnDur = n(p, 'burnDuration', 0);
  const ents = st.world.entities;
  fx.t += SIM_DT;
  while (fx.n < hits && fx.t >= (fx.n + 1) * interval - 1e-9) {
    fx.n++;
    for (let i = 0; i < st.hostiles.length; i++) {
      const s = st.hostiles[i];
      const o = ents[s];
      if (!o.alive || o.hp <= 0 || (o.flying && !hitsFlying)) continue;
      if (Math.abs(o.x - fx.x) > half + st.rts[s].radius) continue;
      dealDamage(st, s, dmg, fx.flaming ? 'fire' : 'pierce', ctx.world.ashId, false, 1, NaN, false);
      if (fx.flaming && burnDps > 0 && o.hp > 0) applyStatus(st, o, 'burn', burnDur, burnDps);
    }
    impact(st, fx, fx.flaming ? 'area_rain.flaming' : 'area_rain', fx.x, half);
  }
  if (fx.n >= hits) fx.active = false;
}

function randomBoon(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const ents = st.world.entities;
  const ash = byId(st, ctx.world.ashId);
  const x = ash ? ash.x : fx.x;
  const choice = ctx.rng.int(0, 2);
  if (choice === 0) {
    const frac = n(p, 'healFrac', 0) * fx.power;
    for (let i = 0; i < st.players.length; i++) {
      const o = ents[st.players[i]];
      if (o.hp > 0) heal(st, o, o.maxHp * frac);
    }
    impact(st, fx, 'random_boon.heal', x, 0);
  } else if (choice === 1) {
    const pool = ctx.wave.units.map((id) => ctx.data.units.get(id)).filter((u) => !!u && u.kind === 'troop');
    if (pool.length === 0) for (const u of ctx.data.units.values()) if (u.kind === 'troop' && u.unlockWave <= ctx.wave.wave) pool.push(u);
    const count = Math.round(n(p, 'summonCount', 0));
    const cap = ctx.data.balance.limits.maxAllies;
    const sx = ctx.data.balance.world.stairsX;
    for (let i = 0; i < count && pool.length > 0 && allyCount(st) < cap; i++) {
      const def = ctx.rng.pick(pool)!;
      spawnUnitAt(st, def, sx - i * 18);
    }
    impact(st, fx, 'random_boon.summon', sx, 0);
  } else {
    const stun = n(p, 'stun', 0) * fx.power;
    for (let i = 0; i < st.hostiles.length; i++) {
      const o = ents[st.hostiles[i]];
      if (o.hp > 0) applyStatus(st, o, 'stun', o.kind === 'boss' ? stun * st.T.bossStunMul : stun, 1);
    }
    impact(st, fx, 'random_boon.stun', x, 0);
  }
  fx.active = false;
}

function areaStrike(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const count = Math.max(1, Math.round(n(p, 'count', 1)));
  const delay = n(p, 'delay', 0);
  const radius = n(p, 'radius', 0);
  const dmg = n(p, 'damage', 0) * fx.power;
  const kb = n(p, 'knockback', 0);
  const w = ctx.data.balance.world;
  const ents = st.world.entities;
  fx.t += SIM_DT;
  // falling rocks (visual)
  for (let i = fx.n; i < count; i++) {
    const rock = byId(st, fx.entityIds[i]);
    if (!rock) continue;
    const land = delay + i * st.T.strikeStagger;
    const prog = land <= 0 ? 1 : Math.min(1, fx.t / land);
    rock.alt = st.T.strikeFallHeight * (1 - prog * prog);
  }
  while (fx.n < count && fx.t >= delay + fx.n * st.T.strikeStagger - 1e-9) {
    const i = fx.n++;
    const rx = rockX(fx, i, count, w.width);
    for (let k = 0; k < st.hostiles.length; k++) {
      const s = st.hostiles[k];
      const o = ents[s];
      if (!o.alive || o.hp <= 0 || o.flying) continue;
      if (Math.abs(o.x - rx) > radius + st.rts[s].radius) continue;
      dealDamage(st, s, dmg, 'physical', ctx.world.ashId, false, 1, NaN, true);
      if (o.hp > 0) knockback(st, o, st.rts[s], kb, o.x >= rx ? 1 : -1);
    }
    const rock = byId(st, fx.entityIds[i]);
    if (rock) release(st, st.idSlot.get(rock.id)!);
    impact(st, fx, 'area_strike', rx, radius);
    st.bus.emit('spectacle:hit', { x: rx, y: groundAt(st.data, rx), big: true });
  }
  if (fx.n >= count) fx.active = false;
}

function portalExecute(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const radius = n(p, 'radius', 0);
  const thr = Math.min(st.T.portalMaxHpFrac, n(p, 'hpFrac', 0) * fx.power);
  const slow = n(p, 'slow', 0);
  const slowDur = n(p, 'slowDuration', 0);
  const ents = st.world.entities;
  for (let i = 0; i < st.hostiles.length; i++) {
    const s = st.hostiles[i];
    const o = ents[s];
    if (!o.alive || o.hp <= 0) continue;
    if (Math.abs(o.x - fx.x) > radius + st.rts[s].radius) continue;
    if (o.kind === 'enemy' && o.hp / o.maxHp < thr) kill(st, s, ctx.world.ashId, 'portal');
    else if (slow > 0) applyStatus(st, o, 'slow', slowDur, slow);
  }
  impact(st, fx, 'portal_execute', fx.x, radius);
  fx.active = false;
}

function selfBuff(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const ash = byId(st, ctx.world.ashId);
  fx.active = false;
  if (!ash || ash.hp <= 0) return;
  const dur = n(p, 'duration', 0);
  const a = st.ash;
  a.buffLeft = dur;
  a.buffMeleeMul = n(p, 'meleeMul', 1) * fx.power;
  a.buffSpeedMul = n(p, 'attackSpeedMul', 1);
  a.buffLifesteal = n(p, 'lifesteal', 0);
  applyStatus(st, ash, 'buff', dur, a.buffMeleeMul);
  impact(st, fx, 'self_buff', ash.x, 0);
}

function dashVehicle(st: GState, ctx: SimContext, fx: ActiveEffect): void {
  const p = fx.params;
  const w = ctx.data.balance.world;
  const speed = Math.max(1, n(p, 'speed', 900));
  const dmg = n(p, 'damage', 0) * fx.power;
  const kb = n(p, 'knockback', 0);
  const prev = fx.m;
  fx.m = Math.min(w.fieldRight, fx.m + speed * SIM_DT);
  const car = byId(st, fx.entityIds[0]);
  if (car) car.x = fx.m;
  const ents = st.world.entities;
  for (let i = 0; i < st.hostiles.length; i++) {
    const s = st.hostiles[i];
    const o = ents[s];
    if (!o.alive || o.hp <= 0 || o.flying || fx.hit.includes(o.id)) continue;
    const r = st.rts[s].radius;
    if (o.x + r < prev || o.x - r > fx.m) continue;
    fx.hit.push(o.id);
    dealDamage(st, s, dmg, 'physical', ctx.world.ashId, false, 1, NaN, true);
    if (o.hp > 0) knockback(st, o, st.rts[s], kb, 1);
  }
  if (fx.m >= w.fieldRight) {
    if (car) release(st, st.idSlot.get(car.id)!);
    impact(st, fx, 'dash_vehicle.end', fx.m, 0);
    fx.active = false;
  }
}
