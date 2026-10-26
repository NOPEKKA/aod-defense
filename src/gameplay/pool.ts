/**
 * Entity pool and every spawner (enemies, bosses, units + escorts, projectiles,
 * pickups, effects). Slots in world.entities are reused in place; `free` is a
 * stack of released slot indices so allocation order is deterministic.
 */
import type { AttackDef, BehaviorRef, BossDef, DamageKind, EnemyDef, EntityKind, EntityState, Team, UnitDef } from '../contracts';
import { BOOK, newRt, NONE, resetRt, type GState, type Rt } from './state';
import {
  ARC_HEIGHT_MAX,
  ARC_HEIGHT_MUL,
  BODY_RADIUS,
  HIT_HEIGHT,
  MUZZLE_HEIGHT,
  PROJECTILE_RANGE_SLACK,
  PROJECTILE_SPEED,
  PROJECTILE_SPEED_DEFAULT,
} from './tuning';

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

function laneY(st: GState, flying: boolean): number {
  const w = st.data.balance.world;
  if (flying) return w.groundY - st.jitter.range(w.flyingY.min, w.flyingY.max);
  return w.groundY + st.jitter.range(-w.laneJitterY, w.laneJitterY);
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
      default:
        break; // melee / ranged: role comes from attack.kind
    }
  }
  rt.role = role;
}

function setBody(rt: Rt, e: EntityState): void {
  rt.radius = BODY_RADIUS[e.size];
  rt.hitY = HIT_HEIGHT[e.size];
}

export function spawnEnemyAt(st: GState, def: EnemyDef, x: number, scheduled: boolean): number {
  const y = laneY(st, def.flying);
  const slot = alloc(st, 'enemy', 'enemy', def.id, def.sprite, x, y);
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  e.hp = e.maxHp = def.stats.hp;
  e.armor = def.stats.armor;
  e.flying = def.flying;
  e.size = def.size;
  rt.enemy = def;
  rt.attack = def.stats.attack;
  rt.damage = def.stats.attack.damage;
  rt.interval = def.stats.attack.interval;
  rt.range = def.stats.attack.range;
  rt.speed = def.stats.speed;
  rt.scheduled = scheduled;
  rt.laneY = y;
  setBody(rt, e);
  applyBehaviors(rt, def.behaviors, def.stats.attack);
  rt.attackTimer = 0;
  emitSpawned(st, e);
  return slot;
}

export function spawnBossAt(st: GState, def: BossDef, x: number, scheduled: boolean): number {
  const w = st.data.balance.world;
  const y = def.flying ? w.groundY - w.flyingY.max : w.groundY;
  const slot = alloc(st, 'boss', 'enemy', def.id, def.sprite, x, y);
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  e.hp = e.maxHp = def.hp;
  e.armor = def.armor;
  e.flying = def.flying;
  e.size = def.size;
  rt.boss = def;
  rt.role = 'boss';
  rt.scheduled = scheduled;
  rt.laneY = y;
  setBody(rt, e);
  emitSpawned(st, e);
  return slot;
}

/** Spawn one ally/hero with its modifiers applied. Escorts are separate calls. */
export function spawnUnitAt(st: GState, def: UnitDef, x: number): number {
  const mods = st.ctx!.services.mods;
  const y = laneY(st, false);
  const slot = alloc(st, def.kind === 'hero' ? 'hero' : 'ally', 'player', def.id, def.sprite, x, y);
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  e.hp = e.maxHp = Math.max(1, mods.apply(def.stats.hp, `unit.${def.id}.hp`));
  e.armor = def.stats.armor;
  e.size = def.size;
  rt.unit = def;
  rt.attack = def.stats.attack.kind === 'none' ? null : def.stats.attack;
  rt.damage = mods.apply(def.stats.attack.damage, `unit.${def.id}.damage`);
  rt.interval = def.stats.attack.interval;
  rt.range = def.stats.attack.range;
  rt.speed = def.stats.speed;
  rt.laneY = y;
  setBody(rt, e);
  applyBehaviors(rt, def.behaviors, def.stats.attack);
  if (def.stats.attack.kind === 'none' && rt.role !== 'back') rt.role = 'back';
  // healers scale with the unit's damage upgrades [เดา]
  if (rt.healAmount > 0) rt.healAmount = mods.apply(rt.healAmount, `unit.${def.id}.damage`);
  emitSpawned(st, e);
  return slot;
}

export interface ShotSpec {
  sprite: string;
  team: Team;
  ownerId: number;
  x: number;
  y: number;
  /** world x the shot is aimed at, and its aim height */
  targetX: number;
  targetY: number;
  damage: number;
  range: number;
  pierce: number;
  hitsFlying: boolean;
  /** collides with flying bodies (true) or ground bodies (false) */
  flyLayer: boolean;
  splash: number;
  armorPierce: boolean;
  bonusVsLarge: number;
  burnDps: number;
  burnDur: number;
  kind: DamageKind;
  /** arcing shot: ignores bodies and explodes at targetX */
  arc: boolean;
  /** aimed at the Necronomicon: damages world.book on arrival */
  toBook: boolean;
  fromAsh: boolean;
}

export const shotScratch: ShotSpec = {
  sprite: 'shot', team: 'player', ownerId: NONE, x: 0, y: 0, targetX: 0, targetY: 0, damage: 0, range: 0, pierce: 0,
  hitsFlying: false, flyLayer: false, splash: 0, armorPierce: false, bonusVsLarge: 1, burnDps: 0, burnDur: 0,
  kind: 'physical', arc: false, toBook: false, fromAsh: false,
};

/** Fill shotScratch from an attack def (caller overrides positions/damage). */
export function shotFromAttack(a: AttackDef, team: Team, ownerId: number, damage: number): ShotSpec {
  const s = shotScratch;
  s.sprite = a.projectile ?? 'shot';
  s.team = team;
  s.ownerId = ownerId;
  s.damage = damage;
  s.range = a.range;
  s.pierce = a.pierce;
  s.hitsFlying = a.hitsFlying;
  s.splash = a.splashRadius;
  s.armorPierce = a.armorPierce;
  s.bonusVsLarge = a.bonusVsLarge;
  s.burnDps = a.burn ? a.burn.dps : 0;
  s.burnDur = a.burn ? a.burn.duration : 0;
  s.kind = a.damageKind;
  s.arc = false;
  s.toBook = false;
  s.fromAsh = false;
  s.flyLayer = false;
  return s;
}

export function spawnProjectile(st: GState, s: ShotSpec): number {
  const slot = alloc(st, 'projectile', s.team, s.sprite, s.sprite, s.x, s.y);
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  const speed = PROJECTILE_SPEED[s.sprite] ?? PROJECTILE_SPEED_DEFAULT;
  const dir = s.targetX >= s.x ? 1 : -1;
  e.facing = dir;
  e.value = s.damage;
  e.hp = e.maxHp = 1;
  e.anim = 'idle';
  const dist = Math.abs(s.targetX - s.x);
  rt.pVx = dir * speed;
  rt.pStartX = s.x;
  rt.pStartY = s.y;
  rt.pEndY = s.targetY;
  rt.pOwner = s.ownerId;
  rt.pPierce = s.pierce;
  rt.pHitsFlying = s.hitsFlying;
  rt.pFlyLayer = s.flyLayer;
  rt.pSplash = s.splash;
  rt.pArmorPierce = s.armorPierce;
  rt.pBonusLarge = s.bonusVsLarge;
  rt.pBurnDps = s.burnDps;
  rt.pBurnDur = s.burnDur;
  rt.pKind = s.kind;
  rt.pToBook = s.toBook;
  rt.pFromAsh = s.fromAsh;
  rt.targetId = s.toBook ? BOOK : NONE;
  if (s.arc || s.toBook) {
    rt.pEndX = s.targetX;
    rt.pArcH = s.arc ? Math.min(ARC_HEIGHT_MAX, dist * ARC_HEIGHT_MUL) : 0;
    e.ttl = Math.max(dist, 1) / speed + 0.5;
  } else {
    // straight shots keep flying past the aim point until they hit or run out of range
    const maxDist = Math.max(dist, s.range * PROJECTILE_RANGE_SLACK);
    rt.pEndX = s.x + dir * Math.max(dist, 1);
    rt.pArcH = -1; // marker: straight
    e.ttl = maxDist / speed;
  }
  emitSpawned(st, e);
  return slot;
}

export type PickupType = 'gold' | 'mana' | 'food';
const PICKUP_SPRITE: Readonly<Record<PickupType, string>> = { gold: 'coin', mana: 'mana_orb', food: 'food' };

export function spawnPickup(st: GState, type: PickupType, x: number, value: number, ttl: number): number {
  const w = st.data.balance.world;
  const cx = Math.max(w.ashMinX, Math.min(w.ashMaxX, x));
  const slot = alloc(st, 'pickup', 'neutral', type, PICKUP_SPRITE[type], cx, w.groundY);
  const e = st.world.entities[slot];
  e.value = value;
  e.ttl = ttl;
  e.hp = e.maxHp = 1;
  e.anim = 'spawn';
  e.size = 'small';
  emitSpawned(st, e);
  st.bus.emit('pickup:dropped', { id: e.id, pickup: type, x: e.x, y: e.y, value });
  return slot;
}

/** Visual-only entity (falling rock, deathcoaster). */
export function spawnEffect(st: GState, defId: string, sprite: string, x: number, y: number, ttl: number): number {
  const slot = alloc(st, 'effect', 'neutral', defId, sprite, x, y);
  const e = st.world.entities[slot];
  e.ttl = ttl;
  e.hp = e.maxHp = 1;
  e.anim = 'idle';
  emitSpawned(st, e);
  return slot;
}

/** Aim height of an entity (centre of its body). */
export function aimY(e: EntityState): number {
  return e.y - HIT_HEIGHT[e.size];
}

/** Launch height for a shooter. */
export function muzzleY(e: EntityState): number {
  return e.y - Math.min(MUZZLE_HEIGHT, HIT_HEIGHT[e.size]);
}
