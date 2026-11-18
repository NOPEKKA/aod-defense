/**
 * Entity pool and every spawner (enemies, bosses, units + escorts, projectiles,
 * pickups, effects). Slots in world.entities are reused in place; `free` is a
 * stack of released slot indices so allocation order is deterministic.
 *
 * Depth rows (SPEC v2.2): ground bodies get `y = groundY + laneRows[k]` with k taken
 * round-robin per team and formation layer, starting at the middle row, so neighbours
 * in a line alternate rows. Rows are visual only.
 */
import type { AttackDef, BehaviorRef, BossDef, DamageKind, EnemyDef, EntityKind, EntityState, Team, UnitDef } from '../contracts';
import { terrainAt } from '../core/terrain';
import { BOOK, newRt, NONE, resetRt, ROLES, type GState, type Role, type Rt } from './state';

export function alloc(st: GState, kind: EntityKind, team: Team, defId: string, sprite: string, x: number, y: number): number {
  const ents = st.world.entities;
  let slot = st.free.pop();
  let e: EntityState;
  if (slot === undefined) {
    slot = ents.length;
    e = {} as EntityState;
    ents.push(e);
  } else e = ents[slot];
  const id = st.nextId++;
  e.id = id;
  e.alive = true;
  e.kind = kind;
  e.team = team;
  e.defId = defId;
  e.sprite = sprite;
  e.x = x;
  e.y = y;
  e.prevX = x;
  e.prevY = y;
  e.alt = 0;
  e.prevAlt = 0;
  e.action = '';
  e.facing = team === 'enemy' ? -1 : 1;
  e.hp = 1;
  e.maxHp = 1;
  e.armor = 0;
  e.flying = false;
  e.size = 'normal';
  e.anim = 'spawn';
  e.animTime = 0;
  if (e.statuses) {
    for (const s of e.statuses) st.statusPool.push(s);
    e.statuses.length = 0;
  } else e.statuses = [];
  e.value = 0;
  e.ttl = Infinity;
  let rt = st.rts[slot];
  if (!rt) {
    rt = newRt();
    st.rts[slot] = rt;
  }
  resetRt(rt, id);
  st.idSlot.set(id, slot);
  return slot;
}

/** alive=false and return the slot to the pool. */
export function release(st: GState, slot: number): void {
  const e = st.world.entities[slot];
  if (!e.alive) return;
  e.alive = false;
  for (const s of e.statuses) st.statusPool.push(s);
  e.statuses.length = 0;
  st.idSlot.delete(e.id);
  st.free.push(slot);
}

function emitSpawned(st: GState, e: EntityState): void {
  st.bus.emit('entity:spawned', { id: e.id, kind: e.kind, defId: e.defId, x: e.x, y: e.y });
}

/** ground y of the middle depth row */
export function middleRowY(st: GState): number {
  const w = st.data.balance.world;
  const rows = w.laneRows;
  return w.groundY + (rows.length > 0 ? rows[Math.floor(rows.length / 2)] : 0);
}

/** Next depth row (ground y) for a body of `team` in formation layer `role`. */
export function nextRowY(st: GState, team: Team, role: Role): number {
  const w = st.data.balance.world;
  const rows = w.laneRows;
  const n = rows.length;
  if (n === 0) return w.groundY;
  const k = (team === 'player' ? 0 : ROLES.length) + Math.max(0, ROLES.indexOf(role));
  const idx = st.rowNext[k]++;
  return w.groundY + rows[(Math.floor(n / 2) + idx) % n];
}

function num(params: BehaviorRef['params'], key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' ? v : fallback;
}

/** Parse def.behaviors into runtime fields and pick the formation layer. */
function applyBehaviors(rt: Rt, behaviors: readonly BehaviorRef[], attack: AttackDef): void {
  let role: Rt['role'] = attack.kind === 'melee' ? 'front' : 'back';
  for (const b of behaviors) {
    const p = b.params;
    switch (b.id) {
      case 'second_row':
        rt.secondRow = true;
        role = 'second';
        break;
      case 'charge':
        rt.chargeMul = num(p, 'firstHitMul', 1);
        rt.chargeKb = num(p, 'knockback', 0);
        rt.charged = true;
        break;
      case 'aura':
        rt.auraRadius = num(p, 'radius', 0);
        rt.auraValue = num(p, 'value', 0);
        break;
      case 'healer':
        rt.healInterval = num(p, 'interval', 3);
        rt.healAmount = num(p, 'amount', 0);
        rt.healTargets = num(p, 'targets', 1);
        rt.healRadius = num(p, 'radius', 0);
        rt.keepBack = num(p, 'keepBack', 0);
        rt.healTimer = rt.healInterval;
        role = 'back';
        break;
      case 'iron_boost':
        rt.ironBoost = num(p, 'rateMul', 0);
        break;
      case 'prefer_ash':
        rt.preferAsh = true;
        break;
      case 'shield_front':
        rt.shieldBlock = num(p, 'block', 0);
        break;
      case 'flyer':
        rt.flyer = typeof p.target === 'string' ? p.target : 'ash_or_book';
        role = 'fly';
        break;
      case 'leap_once':
        rt.leapDistance = num(p, 'distance', 0);
        break;
      case 'siege':
        rt.siegeSlow = num(p, 'blockedSlow', 0);
        role = 'siege';
        break;
      case 'artillery':
        rt.artilleryMin = num(p, 'minRange', 0);
        role = 'artillery';
        break;
      // --- hero abilities (SPEC 6.1) ---
      case 'silver_mark':
        rt.markBonus = num(p, 'bonus', 0);
        rt.markDur = num(p, 'duration', 0);
        break;
      case 'shred':
        rt.shredPer = num(p, 'perHit', 1);
        rt.shredMax = num(p, 'maxStacks', 1);
        break;
      case 'lifesteal':
        rt.lifesteal = num(p, 'frac', 0);
        break;
      case 'vigil_light':
        rt.vigilRadius = num(p, 'radius', 0);
        rt.vigilSlow = num(p, 'slow', 0);
        rt.vigilFlyMul = num(p, 'flyingDamageMul', 1);
        break;
      case 'matins_flare':
        rt.flareInterval = num(p, 'interval', 12);
        rt.flareRadius = num(p, 'radius', 0);
        rt.flareStun = num(p, 'stun', 0);
        rt.flareTimer = Math.min(2, rt.flareInterval);
        break;
      case 'chain_drag':
        rt.dragInterval = num(p, 'interval', 10);
        rt.dragDuration = num(p, 'duration', 2);
        rt.dragRange = num(p, 'range', 400);
        rt.dragTimer = Math.min(2, rt.dragInterval);
        break;
      case 'taunt':
        rt.tauntInterval = num(p, 'interval', 15);
        rt.tauntRadius = num(p, 'radius', 0);
        rt.tauntDuration = num(p, 'duration', 0);
        rt.tauntTimer = Math.min(1, rt.tauntInterval);
        break;
      default:
        break; // melee / ranged: role comes from attack.kind
    }
  }
  rt.role = role;
}

export function setBody(st: GState, rt: Rt, e: EntityState): void {
  rt.radius = st.T.bodyRadius[e.size];
  rt.hitH = st.T.hitHeight[e.size];
}

function setAttack(rt: Rt, a: AttackDef, damage: number): void {
  rt.attack = a.kind === 'none' ? null : a;
  rt.damage = damage;
  rt.interval = a.interval;
  rt.range = a.range;
  rt.windup = Math.min(a.windup, a.interval);
}

/** wave number used for difficulty scaling (1-based) */
function waveN(st: GState): number {
  return Math.max(1, st.world.wave.number || 1);
}

export function spawnEnemyAt(st: GState, def: EnemyDef, x: number, scheduled: boolean): number {
  const slot = alloc(st, 'enemy', 'enemy', def.id, def.sprite, x, st.data.balance.world.groundY);
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  const dif = st.data.balance.difficulty;
  const n = waveN(st) - 1;
  e.hp = e.maxHp = Math.max(1, Math.round(def.stats.hp * (dif.enemyHpBase + dif.enemyHpPerWave * n)));
  e.armor = def.stats.armor;
  e.flying = def.flying;
  e.size = def.size;
  rt.enemy = def;
  setAttack(rt, def.stats.attack, def.stats.attack.damage * (dif.enemyDmgBase + dif.enemyDmgPerWave * n));
  // small per-body speed spread so a group never marches in lockstep
  rt.speed = def.stats.speed * dif.enemySpeedMul * st.jitter.range(1 - st.T.speedJitter, 1 + st.T.speedJitter);
  rt.scheduled = scheduled;
  setBody(st, rt, e);
  applyBehaviors(rt, def.behaviors, def.stats.attack);
  e.y = e.prevY = rt.laneY = nextRowY(st, 'enemy', rt.role);
  if (def.flying) {
    const fa = st.data.balance.world.flyingAlt;
    rt.baseAlt = st.jitter.range(Math.min(fa.min, fa.max), Math.max(fa.min, fa.max));
    e.alt = e.prevAlt = rt.baseAlt;
  }
  rt.attackTimer = 0;
  emitSpawned(st, e);
  return slot;
}

export function spawnBossAt(st: GState, def: BossDef, x: number, scheduled: boolean): number {
  const slot = alloc(st, 'boss', 'enemy', def.id, def.sprite, x, middleRowY(st));
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  e.hp = e.maxHp = Math.round(def.hp * st.data.balance.difficulty.bossHpMul);
  e.armor = def.armor;
  e.flying = def.flying;
  e.size = def.size;
  rt.boss = def;
  rt.role = 'boss';
  rt.scheduled = scheduled;
  rt.speed = def.speed;
  rt.laneY = e.y;
  if (def.flying) {
    rt.baseAlt = st.data.balance.world.flyingAlt.max;
    e.alt = e.prevAlt = rt.baseAlt;
  }
  setBody(st, rt, e);
  emitSpawned(st, e);
  return slot;
}

/** Spawn one ally/hero with its modifiers applied. Escorts are separate calls. */
export function spawnUnitAt(st: GState, def: UnitDef, x: number): number {
  const mods = st.ctx!.services.mods;
  const slot = alloc(st, def.kind === 'hero' ? 'hero' : 'ally', 'player', def.id, def.sprite, x, st.data.balance.world.groundY);
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  e.hp = e.maxHp = Math.max(1, mods.apply(def.stats.hp, `unit.${def.id}.hp`));
  e.armor = def.stats.armor;
  e.size = def.size;
  rt.unit = def;
  setAttack(rt, def.stats.attack, mods.apply(def.stats.attack.damage, `unit.${def.id}.damage`));
  rt.speed = def.stats.speed * st.jitter.range(1 - st.T.speedJitter, 1 + st.T.speedJitter);
  setBody(st, rt, e);
  applyBehaviors(rt, def.behaviors, def.stats.attack);
  if (def.stats.attack.kind === 'none' && rt.role !== 'back') rt.role = 'back';
  // healers scale with the unit's damage upgrades [เดา]
  if (rt.healAmount > 0) rt.healAmount = mods.apply(rt.healAmount, `unit.${def.id}.damage`);
  // relic hollow_spur: charges hit harder; heroes get a charge-like first strike
  if (st.relic.chargeBonus) {
    if (rt.chargeMul > 1 || rt.chargeKb > 0) rt.chargeMul *= 1 + st.T.chargeBonus;
    else if (def.kind === 'hero' && rt.attack) rt.firstStrike = true;
  }
  e.y = e.prevY = rt.laneY = nextRowY(st, 'player', rt.role);
  emitSpawned(st, e);
  return slot;
}

export interface ShotSpec {
  sprite: string;
  team: Team;
  ownerId: number;
  /** launch point: ground y of the shooter's row, height above it */
  x: number;
  y: number;
  alt: number;
  /** aim point: world x, ground y of the target's row, height above it */
  targetX: number;
  targetY: number;
  targetAlt: number;
  damage: number;
  range: number;
  pierce: number;
  hitsFlying: boolean;
  /** collides with flying bodies (true) or ground bodies (false) */
  flyLayer: boolean;
  /** collides with both layers (lance) */
  both: boolean;
  splash: number;
  armorPierce: boolean;
  bonusVsLarge: number;
  burnDps: number;
  burnDur: number;
  kind: DamageKind;
  /** lobbed shot: ignores bodies and explodes at targetX */
  lob: boolean;
  /** aimed at the Necronomicon: damages world.book on arrival */
  toBook: boolean;
  fromAsh: boolean;
  /** px/s, 0 = by sprite (balance.tuning projectile.speed.<sprite>) */
  speed: number;
  /** arc peak per px of distance, negative = by sprite */
  arcMul: number;
  knockback: number;
  mark: number;
  markDur: number;
}

export const shotScratch: ShotSpec = {
  sprite: 'shot', team: 'player', ownerId: NONE, x: 0, y: 0, alt: 0, targetX: 0, targetY: 0, targetAlt: 0, damage: 0, range: 0, pierce: 0,
  hitsFlying: false, flyLayer: false, both: false, splash: 0, armorPierce: false, bonusVsLarge: 1, burnDps: 0, burnDur: 0,
  kind: 'physical', lob: false, toBook: false, fromAsh: false, speed: 0, arcMul: -1, knockback: 0, mark: 0, markDur: 0,
};

/** Reset shotScratch to a plain shot (caller fills positions/damage). */
export function blankShot(sprite: string, team: Team, ownerId: number, damage: number): ShotSpec {
  const s = shotScratch;
  s.sprite = sprite;
  s.team = team;
  s.ownerId = ownerId;
  s.damage = damage;
  s.range = 0;
  s.pierce = 0;
  s.hitsFlying = false;
  s.flyLayer = false;
  s.both = false;
  s.splash = 0;
  s.armorPierce = false;
  s.bonusVsLarge = 1;
  s.burnDps = 0;
  s.burnDur = 0;
  s.kind = 'physical';
  s.lob = false;
  s.toBook = false;
  s.fromAsh = false;
  s.speed = 0;
  s.arcMul = -1;
  s.knockback = 0;
  s.mark = 0;
  s.markDur = 0;
  return s;
}

/** Fill shotScratch from an attack def (caller overrides positions/damage). */
export function shotFromAttack(a: AttackDef, team: Team, ownerId: number, damage: number): ShotSpec {
  const s = blankShot(a.projectile ?? 'shot', team, ownerId, damage);
  s.range = a.range;
  s.pierce = a.pierce;
  s.hitsFlying = a.hitsFlying;
  s.splash = a.splashRadius;
  s.armorPierce = a.armorPierce;
  s.bonusVsLarge = a.bonusVsLarge;
  s.burnDps = a.burn ? a.burn.dps : 0;
  s.burnDur = a.burn ? a.burn.duration : 0;
  s.kind = a.damageKind;
  s.speed = a.projectileSpeed ?? 0;
  return s;
}

/** Launch point of a shooter: its x (slightly forward), its row, muzzle height. */
export function aimFrom(st: GState, s: ShotSpec, e: EntityState, rt: Rt): void {
  s.x = e.x + e.facing * rt.radius * 0.5;
  s.y = e.y;
  s.alt = e.alt + rt.hitH * st.T.muzzleMul;
}

/**
 * Aim point on a body: its row, its hit height, and x = the body centre (lobs) or the
 * near edge of the body (straight shots, so the flight ends where the shot connects).
 */
export function aimAt(s: ShotSpec, te: EntityState, trt: Rt, edge: boolean): void {
  let x = te.x;
  if (edge) {
    const d = te.x - s.x;
    x = te.x - Math.sign(d) * Math.min(trt.radius, Math.abs(d));
  }
  s.targetX = x;
  s.targetY = te.y;
  s.targetAlt = te.alt + trt.hitH;
}

export function spawnProjectile(st: GState, s: ShotSpec): number {
  const slot = alloc(st, 'projectile', s.team, s.sprite, s.sprite, s.x, s.y);
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  const T = st.T;
  const speed = s.speed > 0 ? s.speed : T.projectileSpeed(s.sprite);
  const dir = s.targetX >= s.x ? 1 : -1;
  const dist = Math.abs(s.targetX - s.x);
  e.facing = dir;
  e.value = s.damage;
  e.hp = e.maxHp = 1;
  e.anim = 'idle';
  e.alt = e.prevAlt = Math.max(0, s.alt);
  rt.pT = 0;
  rt.pTotal = Math.max(dist, 1) / speed;
  rt.pDir = dir;
  rt.pSpeed = speed;
  rt.pX0 = s.x;
  rt.pX1 = s.targetX;
  rt.pY0 = s.y;
  rt.pY1 = s.targetY;
  rt.pAlt0 = e.alt;
  rt.pAlt1 = Math.max(0, s.targetAlt);
  rt.pArcH = Math.min(T.arcMax, dist * (s.arcMul >= 0 ? s.arcMul : T.projectileArc(s.sprite)));
  rt.pOwner = s.ownerId;
  rt.pPierce = s.pierce;
  rt.pHitsFlying = s.hitsFlying;
  rt.pFlyLayer = s.flyLayer;
  rt.pBoth = s.both;
  rt.pSplash = s.splash;
  rt.pArmorPierce = s.armorPierce;
  rt.pBonusLarge = s.bonusVsLarge;
  rt.pBurnDps = s.burnDps;
  rt.pBurnDur = s.burnDur;
  rt.pKind = s.kind;
  rt.pToBook = s.toBook;
  rt.pFromAsh = s.fromAsh;
  rt.pKb = s.knockback;
  rt.pMark = s.mark;
  rt.pMarkDur = s.markDur;
  rt.targetId = s.toBook ? BOOK : NONE;
  if (s.lob || s.toBook) {
    rt.pStraight = false;
    e.ttl = rt.pTotal + 0.5;
  } else {
    // straight shots keep flying past the aim point until they hit or run out of range
    rt.pStraight = true;
    e.ttl = Math.max(dist, s.range * T.rangeSlack) / speed;
  }
  emitSpawned(st, e);
  return slot;
}

/** Projectile position at its own time rt.pT: x, ground y (row to row), alt (line + arc). */
export function projectilePlace(e: EntityState, rt: Rt): void {
  const u = rt.pT / rt.pTotal;
  e.x = rt.pX0 + rt.pDir * rt.pSpeed * rt.pT;
  if (u <= 1) {
    e.y = rt.pY0 + (rt.pY1 - rt.pY0) * u;
    e.alt = Math.max(0, rt.pAlt0 + (rt.pAlt1 - rt.pAlt0) * u + rt.pArcH * 4 * u * (1 - u));
  } else {
    // past the aim point: keep the slope it arrived with (line slope - 4H)
    e.y = rt.pY1;
    e.alt = Math.max(0, rt.pAlt1 + (rt.pAlt1 - rt.pAlt0 - 4 * rt.pArcH) * (u - 1));
  }
}

export type PickupType = 'gold' | 'silver' | 'mana' | 'food';
const PICKUP_SPRITE: Readonly<Record<PickupType, string>> = { gold: 'coin', silver: 'coin_silver', mana: 'mana_orb', food: 'food' };

export function spawnPickup(st: GState, type: PickupType, x: number, y: number, value: number, ttl: number): number {
  const w = st.data.balance.world;
  const cx = Math.max(w.ashMinX, Math.min(w.ashMaxX, x));
  const slot = alloc(st, 'pickup', 'neutral', type, PICKUP_SPRITE[type], cx, y);
  const e = st.world.entities[slot];
  // dropped from a body that already stands on the terrain: y includes the slope at its x
  st.rts[slot].tdy = terrainAt(st.data, x);
  e.value = value;
  e.ttl = ttl;
  e.hp = e.maxHp = 1;
  e.anim = 'spawn';
  e.size = 'small';
  emitSpawned(st, e);
  st.bus.emit('pickup:dropped', { id: e.id, pickup: type, x: e.x, y: e.y, value });
  return slot;
}

/** Visual-only entity (falling rock, deathcoaster, boss hazard visuals). */
export function spawnEffect(st: GState, defId: string, sprite: string, x: number, y: number, alt: number, ttl: number): number {
  const slot = alloc(st, 'effect', 'neutral', defId, sprite, x, y);
  const e = st.world.entities[slot];
  e.ttl = ttl;
  e.hp = e.maxHp = 1;
  e.anim = 'idle';
  e.alt = e.prevAlt = Math.max(0, alt);
  emitSpawned(st, e);
  return slot;
}

/** Release an effect entity by id (no-op if already gone). */
export function releaseById(st: GState, id: number): void {
  const s = st.idSlot.get(id);
  if (s !== undefined) release(st, s);
}

/**
 * Keeps every ground thing on the battlefield's slope (core/terrain.ts): e.y = depth row +
 * terrainAt(x). Movement only changes x, so this runs once per tick after everything moved.
 * Projectiles fly their own y (aimed at bodies that are already on the slope).
 */
export function terrainTick(st: GState): void {
  const ents = st.world.entities;
  const data = st.data;
  for (let s = 0; s < ents.length; s++) {
    const e = ents[s];
    if (!e.alive || e.kind === 'projectile') continue;
    const rt = st.rts[s];
    const dy = terrainAt(data, e.x);
    if (rt.tdy !== rt.tdy) {
      e.y += dy;
      e.prevY = e.y; // fresh spawn: no interpolation from the flat row
    } else if (dy !== rt.tdy) e.y += dy - rt.tdy;
    rt.tdy = dy;
  }
}
