/**
 * Per-wave gameplay state shared by the SpawnApi and the gameplay SimSystems.
 *
 * Core calls gameplay.createSpawnApi(world, ...) and gameplay.createSimSystems()
 * separately for the same wave, so the state is keyed by the WorldState object.
 *
 * Per-entity internal state lives in `rts`, a parallel array to world.entities
 * (same slot index). Entity objects are pooled in place, so a slot's Rt is reset
 * whenever the slot is (re)allocated. Never keep EntityState references across
 * ticks: keep the id and look it up with `bySlot(idSlot.get(id))`.
 */
import type {
  AttackDef,
  BossDef,
  DamageKind,
  EnemyDef,
  EntityState,
  EventBus,
  GameData,
  ModifierQuery,
  Rng,
  SimContext,
  SpellEffect,
  StatusState,
  Telegraph,
  UnitDef,
  WorldState,
} from '../contracts';
import { createRng } from '../core/rng';

/** Formation layer. Each layer keeps its own spacing chain. */
export type Role = 'none' | 'front' | 'second' | 'back' | 'artillery' | 'fly' | 'siege' | 'boss';

/** target id meaning "the Necronomicon" */
export const BOOK = -2;
export const NONE = -1;

export interface Rt {
  id: number;
  role: Role;
  unit: UnitDef | null;
  enemy: EnemyDef | null;
  boss: BossDef | null;
  attack: AttackDef | null;
  /** effective numbers after modifiers */
  damage: number;
  interval: number;
  range: number;
  speed: number;
  radius: number;
  hitY: number;
  attackTimer: number;
  targetId: number;
  engaged: boolean;
  /** dying: seconds left before alive=false */
  corpse: number;
  /** knockback velocity (px/s, signed) */
  kbV: number;
  /** seconds a transient anim is held */
  animHold: number;
  /** spawned through SpawnApi by systems (false = boss minion spawned by gameplay). Kill counting is systems' job. */
  scheduled: boolean;
  laneY: number;

  // --- behaviors (parsed from def.behaviors at spawn) ---
  secondRow: boolean;
  preferAsh: boolean;
  shieldBlock: number;
  flyer: string;
  leapDistance: number;
  leapUsed: boolean;
  leapLeft: number;
  leapV: number;
  siegeSlow: number;
  artilleryMin: number;
  chargeMul: number;
  chargeKb: number;
  charged: boolean;
  chargeIdle: number;
  auraRadius: number;
  auraValue: number;
  healInterval: number;
  healAmount: number;
  healTargets: number;
  healRadius: number;
  keepBack: number;
  healTimer: number;
  ironBoost: number;
  burnAcc: number;

  // --- projectile ---
  pVx: number;
  pStartX: number;
  pStartY: number;
  pEndX: number;
  pEndY: number;
  pArcH: number;
  pPierce: number;
  pHitsFlying: boolean;
  pFlyLayer: boolean;
  pSplash: number;
  pArmorPierce: boolean;
  pBonusLarge: number;
  pBurnDps: number;
  pBurnDur: number;
  pKind: DamageKind;
  pOwner: number;
  pToBook: boolean;
  pFromAsh: boolean;
  pHit: number[];

  // --- boss ---
  bPhase: number;
  bStep: number;
  /** 0 approach, 1 telegraph, 2 act, 3 recover, 4 phase transition */
  bState: number;
  bTimer: number;
  bHits: number;
  bX: number;
  bTelegraph: number;
  bSwoopFrom: number;
}

export interface ActiveEffect {
  active: boolean;
  spellId: string;
  effect: string;
  params: SpellEffect['params'];
  power: number;
  x: number;
  dir: 1 | -1;
  t: number;
  /** generic counters used by the effect */
  n: number;
  m: number;
  flaming: boolean;
  /** entity id of a visual entity owned by the effect (rock, vehicle) */
  entityIds: number[];
  /** ids already hit (dash_vehicle) */
  hit: number[];
}

export interface ResolvedSpell {
  spellId: string;
  effects: SpellEffect[];
  power: number;
}

export interface MinionSpawn {
  at: number;
  enemy: string;
  x: number;
}

export interface GState {
  world: WorldState;
  data: GameData;
  bus: EventBus;
  mods: () => ModifierQuery;
  ctx: SimContext | null;
  nextId: number;
  rts: Rt[];
  free: number[];
  idSlot: Map<number, number>;
  /** cosmetic lane jitter (separate stream so spawn order never shifts gameplay rolls) */
  jitter: Rng;
  /** slot indices rebuilt each band: live player bodies / live hostiles */
  players: number[];
  hostiles: number[];
  /** slots that died this tick, drained by the drops system (550) */
  died: number[];
  /** formation scratch */
  layer: number[];
  scratch: number[];
  statusPool: StatusState[];
  telegraphPool: Telegraph[];
  nextTelegraphId: number;
  ash: {
    meleeTimer: number;
    gunTimer: number;
    buffLeft: number;
    buffMeleeMul: number;
    buffSpeedMul: number;
    buffLifesteal: number;
    dodgeLeft: number;
    dodgeV: number;
  };
  spells: ResolvedSpell[];
  effects: ActiveEffect[];
  castle: {
    /** levels read from modifiers at wave start */
    archers: number;
    catapult: number;
    pit: number;
    regen: number;
    archerTimers: number[];
    catapultTimer: number;
    pitCooldown: number;
    pitOpen: number;
  };
  /** boss minions waiting to spawn */
  minions: MinionSpawn[];
  /** live player units with an aura (rebuilt by refreshLists) */
  auraSources: number[];
}

const states = new WeakMap<WorldState, GState>();

export function getState(world: WorldState, data: GameData, bus: EventBus, mods: () => ModifierQuery): GState {
  let st = states.get(world);
  if (st) return st;
  st = {
    world,
    data,
    bus,
    mods,
    ctx: null,
    nextId: 1,
    rts: [],
    free: [],
    idSlot: new Map(),
    jitter: createRng(0x9e3779b9),
    players: [],
    hostiles: [],
    died: [],
    layer: [],
    scratch: [],
    statusPool: [],
    telegraphPool: [],
    nextTelegraphId: 1,
    ash: { meleeTimer: 0, gunTimer: 0, buffLeft: 0, buffMeleeMul: 1, buffSpeedMul: 1, buffLifesteal: 0, dodgeLeft: 0, dodgeV: 0 },
    spells: [],
    effects: [],
    castle: { archers: 0, catapult: 0, pit: 0, regen: 0, archerTimers: [], catapultTimer: 0, pitCooldown: 0, pitOpen: 0 },
    minions: [],
    auraSources: [],
  };
  states.set(world, st);
  return st;
}

export function newRt(): Rt {
  return {
    id: 0, role: 'none', unit: null, enemy: null, boss: null, attack: null,
    damage: 0, interval: 1, range: 0, speed: 0, radius: 20, hitY: 40,
    attackTimer: 0, targetId: NONE, engaged: false, corpse: 0, kbV: 0, animHold: 0, scheduled: false, laneY: 0,
    secondRow: false, preferAsh: false, shieldBlock: 0, flyer: '', leapDistance: 0, leapUsed: false, leapLeft: 0, leapV: 0,
    siegeSlow: -1, artilleryMin: -1, chargeMul: 1, chargeKb: 0, charged: false, chargeIdle: 0,
    auraRadius: 0, auraValue: 0, healInterval: 0, healAmount: 0, healTargets: 0, healRadius: 0, keepBack: 0, healTimer: 0,
    ironBoost: 0, burnAcc: 0,
    pVx: 0, pStartX: 0, pStartY: 0, pEndX: 0, pEndY: 0, pArcH: 0, pPierce: 0, pHitsFlying: false, pFlyLayer: false,
    pSplash: 0, pArmorPierce: false, pBonusLarge: 1, pBurnDps: 0, pBurnDur: 0, pKind: 'physical', pOwner: NONE,
    pToBook: false, pFromAsh: false, pHit: [],
    bPhase: 0, bStep: 0, bState: 0, bTimer: 0, bHits: 0, bX: 0, bTelegraph: NONE, bSwoopFrom: 0,
  };
}

/** Reset a pooled Rt in place (keeps the pHit array). */
export function resetRt(rt: Rt, id: number): void {
  const hit = rt.pHit;
  Object.assign(rt, newRt());
  hit.length = 0;
  rt.pHit = hit;
  rt.id = id;
}

export function slotOf(st: GState, id: number): number {
  const s = st.idSlot.get(id);
  return s === undefined ? -1 : s;
}

/** live entity (alive, any hp) by id, or undefined */
export function byId(st: GState, id: number): EntityState | undefined {
  const s = st.idSlot.get(id);
  if (s === undefined) return undefined;
  const e = st.world.entities[s];
  return e && e.alive && e.id === id ? e : undefined;
}

export function rtOf(st: GState, e: EntityState): Rt {
  const s = st.idSlot.get(e.id);
  if (s === undefined) throw new Error(`gameplay: no runtime for entity ${e.id}`);
  return st.rts[s];
}

export function isLive(e: EntityState | undefined): e is EntityState {
  return !!e && e.alive && e.hp > 0;
}

export function isPlayerBody(e: EntityState): boolean {
  return e.kind === 'ash' || e.kind === 'ally' || e.kind === 'hero';
}

export function isHostile(e: EntityState): boolean {
  return e.kind === 'enemy' || e.kind === 'boss';
}

export function setAnim(e: EntityState, anim: EntityState['anim']): void {
  if (e.anim !== anim) {
    e.anim = anim;
    e.animTime = 0;
  }
}

/** Rebuild the live player / hostile slot lists (call at the start of a band). */
export function refreshLists(st: GState): void {
  const ents = st.world.entities;
  st.players.length = 0;
  st.hostiles.length = 0;
  st.auraSources.length = 0;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (!e.alive || e.hp <= 0) continue;
    if (isPlayerBody(e)) {
      st.players.push(i);
      if (st.rts[i].auraRadius > 0) st.auraSources.push(i);
    } else if (isHostile(e)) st.hostiles.push(i);
  }
}

export function modsOf(st: GState): ModifierQuery {
  return st.ctx ? st.ctx.services.mods : st.mods();
}
