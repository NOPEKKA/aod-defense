/**
 * Per-wave gameplay state shared by the SpawnApi and the gameplay SimSystems.
 *
 * Core calls gameplay.createSpawnApi(world, ...) and gameplay.createSimSystems()
 * separately for the same wave, so the state is keyed by the WorldState object.
 *
 * Per-entity internal state lives in `rts`, a parallel array to world.entities
 * (same slot index). Entity objects are pooled in place, so a slot's Rt is reset
 * whenever the slot is (re)allocated. Never keep EntityState references across
 * ticks: keep the id and look it up with `byId`.
 *
 * Coordinates (SPEC v2.2): x along the lane; y = GROUND point (groundY + depth row);
 * alt = height above that point. Rows are visual only: every gameplay rule uses x.
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
import { tuningOf, type Tuning } from './tuning';

/** Formation layer. Each layer keeps its own spacing chain. */
export type Role = 'none' | 'front' | 'second' | 'back' | 'artillery' | 'fly' | 'siege' | 'boss';
export const ROLES: readonly Role[] = ['none', 'front', 'second', 'back', 'artillery', 'fly', 'siege', 'boss'];

/** target id meaning "the Necronomicon" */
export const BOOK = -2;
/** target id meaning "a point on the ground" (artillery) */
export const POINT = -3;
export const NONE = -1;

/** windup state */
export const W_IDLE = 0;
export const W_WINDUP = 1;

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
  windup: number;
  speed: number;
  radius: number;
  /** height of the body centre above the ground point (where shots aim) */
  hitH: number;
  attackTimer: number;
  targetId: number;
  engaged: boolean;
  /** did not move this tick (set by ai) */
  settled: boolean;
  /** dying: seconds left before alive=false */
  corpse: number;
  /** knockback velocity (px/s, signed) and the push distance it started with (for the hop) */
  kbV: number;
  kbDist: number;
  kbLeft: number;
  /** seconds a transient anim is held */
  animHold: number;
  /** spawned through SpawnApi by systems (false = boss minion spawned by gameplay). Kill counting is systems' job. */
  scheduled: boolean;
  /** ground y of the entity's depth row */
  laneY: number;
  /** cruising altitude (flyers) */
  baseAlt: number;
  /** burrowed boss: untargetable, does not block */
  hidden: boolean;

  // --- windup (SPEC v2.3) ---
  wState: number;
  wTimer: number;
  /** entity id, BOOK or POINT */
  wTarget: number;
  wPointX: number;
  wDmg: number;
  wKb: number;

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
  bleedAcc: number;

  // --- hero abilities ---
  markBonus: number;
  markDur: number;
  shredPer: number;
  shredMax: number;
  lifesteal: number;
  vigilRadius: number;
  vigilSlow: number;
  vigilFlyMul: number;
  flareInterval: number;
  flareRadius: number;
  flareStun: number;
  flareTimer: number;
  dragInterval: number;
  dragDuration: number;
  dragRange: number;
  dragTimer: number;
  tauntInterval: number;
  tauntRadius: number;
  tauntDuration: number;
  tauntTimer: number;
  /** relic hollow_spur: a hero's first hit after walking free gets the charge bonus */
  firstStrike: boolean;
  /** raised by Malachar: cannot be raised again */
  raised: boolean;

  // --- projectile ---
  pT: number;
  /** flight time to the aim point */
  pTotal: number;
  pDir: number;
  pSpeed: number;
  pX0: number;
  pX1: number;
  pY0: number;
  pY1: number;
  pAlt0: number;
  pAlt1: number;
  pArcH: number;
  /** straight = collides with bodies on the way; else it explodes at pX1 */
  pStraight: boolean;
  pPierce: number;
  pHitsFlying: boolean;
  pFlyLayer: boolean;
  /** collides with ground and flying bodies (lance) */
  pBoth: boolean;
  pSplash: number;
  pArmorPierce: boolean;
  pBonusLarge: number;
  pBurnDps: number;
  pBurnDur: number;
  pKind: DamageKind;
  pOwner: number;
  pToBook: boolean;
  pFromAsh: boolean;
  pKb: number;
  pMark: number;
  pMarkDur: number;
  pHit: number[];

  // --- boss ---
  bPhase: number;
  bStep: number;
  /** see bosses.ts: APPROACH, ATTACK, RECOVER, TRANSITION */
  bState: number;
  bTimer: number;
  /** seconds since the state started */
  bT: number;
  bHits: number;
  bX: number;
  bX0: number;
  bDir: number;
  bAltFrom: number;
  /** charge: home x to ride back to (0 = none) */
  bA: number;
  /** step serial */
  bB: number;
  /** boss hp when the step/channel started (raise_dead / drain_book break checks) */
  bA2: number;
  /** sequential attacks: seconds since the step started (item i is armed at i * gap) */
  bSeqT: number;
  /** telegraph owned by the current step (NONE if none) */
  bTelegraph: number;
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
  acc: number;
  flaming: boolean;
  /** entity ids of visual entities owned by the effect (rocks, vehicle, traps) */
  entityIds: number[];
  /** ids already hit / bound */
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

/** A boss hazard on the ground (see bosses.ts). Pooled. */
export interface Hazard {
  active: boolean;
  kind: number;
  /** boss entity id */
  owner: number;
  attack: string;
  /** strike/pool: centre and half-width; wave: front x; ring: centre; beam: centre */
  x: number;
  half: number;
  /** seconds until it fires / starts moving */
  warn: number;
  warnTotal: number;
  teleId: number;
  damage: number;
  dps: number;
  life: number;
  acc: number;
  /** moving hazards */
  v: number;
  x0: number;
  x1: number;
  width: number;
  radius: number;
  gapL: number;
  gapR: number;
  passes: number;
  hit: number[];
  kb: number;
  stun: number;
  root: number;
  nonLethal: boolean;
  /** the owner boss rides with the front (charge) */
  carry: boolean;
  /** visual effect entity id (NONE if none) */
  fx: number;
  fxAlt0: number;
  /** strike that turns into a pool when it lands */
  poolLife: number;
  poolDps: number;
  /** strike that bounces on: remaining bounces and hop (px, signed) */
  bounces: number;
  hop: number;
  /** burrow tracker: seconds left to track, speed */
  track: number;
  /** step serial of the owner boss (a step ends when its hazards are done) */
  serial: number;
  /** strike repeats (combo): seconds between repeats */
  repeatGap: number;
  /** warning of every bounce after the first */
  bounceWarn: number;
  /** telegraph shape used when the hazard (re)arms */
  shape: Telegraph['shape'];
  /** the boss emerges here when the strike fires (burrow) */
  emerge: boolean;
  /** the strike also hits the book when it covers bookX */
  hitsBook: boolean;
  dkind: DamageKind;
  /** wave fronts / rings: the beam/ring has started moving */
  moving: boolean;
}

export interface DeathRecord {
  defId: string;
  x: number;
  y: number;
  t: number;
  used: boolean;
}

export interface GState {
  world: WorldState;
  data: GameData;
  bus: EventBus;
  mods: () => ModifierQuery;
  ctx: SimContext | null;
  T: Tuning;
  nextId: number;
  rts: Rt[];
  free: number[];
  idSlot: Map<number, number>;
  /** cosmetic randomness (flyer altitude) on its own stream so it never shifts gameplay rolls */
  jitter: Rng;
  /** round-robin depth-row counters per team (0 player, 1 enemy) x role */
  rowNext: number[];
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
    /** windup: 0 none, 1 melee, 2 gun */
    wKind: number;
    wTimer: number;
    wTarget: number;
    /** relic double_shot: second shot pending */
    shot2Left: number;
    shot2Target: number;
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
    censerAcc: number;
  };
  /** equipped relic flags */
  relic: { doubleShot: boolean; chargeBonus: boolean; censer: boolean };
  /** rally horn: army-wide buff */
  army: { left: number; damage: number; speed: number; lifesteal: number };
  /** boss minions waiting to spawn */
  minions: MinionSpawn[];
  /** live player units with an aura (rebuilt by refreshLists) */
  auraSources: number[];
  hazards: Hazard[];
  /** recent enemy deaths (ring) for raise_dead */
  deaths: DeathRecord[];
  deathHead: number;
  /** x positions of pending hellfire death bursts */
  bursts: number[];
  burstDamage: number;
  burstRadius: number;
  /** QA counters */
  stats: { whiffs: number; raised: number };
}

const states = new WeakMap<WorldState, GState>();

export const DEATH_RING = 64;

export function getState(world: WorldState, data: GameData, bus: EventBus, mods: () => ModifierQuery): GState {
  let st = states.get(world);
  if (st) return st;
  st = createState(world, data, bus, mods);
  // dev builds: expose the live gameplay state for debugging probes
  if (import.meta.env.DEV) (globalThis as unknown as { __aoddGS?: GState }).__aoddGS = st;
  return st;
}

function createState(world: WorldState, data: GameData, bus: EventBus, mods: () => ModifierQuery): GState {
  let st: GState;
  const deaths: DeathRecord[] = [];
  for (let i = 0; i < DEATH_RING; i++) deaths.push({ defId: '', x: 0, y: 0, t: -1e9, used: true });
  st = {
    world,
    data,
    bus,
    mods,
    ctx: null,
    T: tuningOf(data),
    nextId: 1,
    rts: [],
    free: [],
    idSlot: new Map(),
    jitter: createRng(0x9e3779b9),
    rowNext: new Array(ROLES.length * 2).fill(0),
    players: [],
    hostiles: [],
    died: [],
    layer: [],
    scratch: [],
    statusPool: [],
    telegraphPool: [],
    nextTelegraphId: 1,
    ash: {
      meleeTimer: 0, gunTimer: 0, buffLeft: 0, buffMeleeMul: 1, buffSpeedMul: 1, buffLifesteal: 0, dodgeLeft: 0, dodgeV: 0,
      wKind: 0, wTimer: 0, wTarget: NONE, shot2Left: 0, shot2Target: NONE,
    },
    spells: [],
    effects: [],
    castle: { archers: 0, catapult: 0, pit: 0, regen: 0, archerTimers: [], catapultTimer: 0, pitCooldown: 0, pitOpen: 0, censerAcc: 0 },
    relic: { doubleShot: false, chargeBonus: false, censer: false },
    army: { left: 0, damage: 0, speed: 0, lifesteal: 0 },
    minions: [],
    auraSources: [],
    hazards: [],
    deaths,
    deathHead: 0,
    bursts: [],
    burstDamage: 0,
    burstRadius: 0,
    stats: { whiffs: 0, raised: 0 },
  };
  states.set(world, st);
  return st;
}

/** QA / tests: the gameplay state of a world, if any. */
export function peekState(world: WorldState): GState | undefined {
  return states.get(world);
}

export function newRt(): Rt {
  return {
    id: 0, role: 'none', unit: null, enemy: null, boss: null, attack: null,
    damage: 0, interval: 1, range: 0, windup: 0, speed: 0, radius: 30, hitH: 80,
    attackTimer: 0, targetId: NONE, engaged: false, settled: false, corpse: 0, kbV: 0, kbDist: 0, kbLeft: 0, animHold: 0, scheduled: false,
    laneY: 0, baseAlt: 0, hidden: false,
    wState: W_IDLE, wTimer: 0, wTarget: NONE, wPointX: NaN, wDmg: 0, wKb: 0,
    secondRow: false, preferAsh: false, shieldBlock: 0, flyer: '', leapDistance: 0, leapUsed: false, leapLeft: 0, leapV: 0,
    siegeSlow: -1, artilleryMin: -1, chargeMul: 1, chargeKb: 0, charged: false, chargeIdle: 0,
    auraRadius: 0, auraValue: 0, healInterval: 0, healAmount: 0, healTargets: 0, healRadius: 0, keepBack: 0, healTimer: 0,
    ironBoost: 0, burnAcc: 0, bleedAcc: 0,
    markBonus: 0, markDur: 0, shredPer: 0, shredMax: 0, lifesteal: 0,
    vigilRadius: 0, vigilSlow: 0, vigilFlyMul: 1,
    flareInterval: 0, flareRadius: 0, flareStun: 0, flareTimer: 0,
    dragInterval: 0, dragDuration: 0, dragRange: 0, dragTimer: 0,
    tauntInterval: 0, tauntRadius: 0, tauntDuration: 0, tauntTimer: 0,
    firstStrike: false, raised: false,
    pT: 0, pTotal: 1, pDir: 1, pSpeed: 0, pX0: 0, pX1: 0, pY0: 0, pY1: 0, pAlt0: 0, pAlt1: 0, pArcH: 0, pStraight: true,
    pPierce: 0, pHitsFlying: false, pFlyLayer: false, pBoth: false,
    pSplash: 0, pArmorPierce: false, pBonusLarge: 1, pBurnDps: 0, pBurnDur: 0, pKind: 'physical', pOwner: NONE,
    pToBook: false, pFromAsh: false, pKb: 0, pMark: 0, pMarkDur: 0, pHit: [],
    bPhase: 0, bStep: 0, bState: 0, bTimer: 0, bT: 0, bHits: 0, bX: 0, bX0: 0, bDir: -1, bAltFrom: 0, bA: 0, bB: 0, bA2: 0, bSeqT: 0, bTelegraph: NONE,
  };
}

const RT_TEMPLATE = newRt();

/** Reset a pooled Rt in place (keeps the pHit array). */
export function resetRt(rt: Rt, id: number): void {
  const hit = rt.pHit;
  Object.assign(rt, RT_TEMPLATE);
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

/** Change anim (resets animTime and clears the sub-action when the anim changes). */
export function setAnim(e: EntityState, anim: EntityState['anim']): void {
  if (e.anim !== anim) {
    e.anim = anim;
    e.animTime = 0;
    e.action = '';
  }
}

/** Set anim + sub-action (restarts the anim when either changes). */
export function setAct(e: EntityState, anim: EntityState['anim'], action: string): void {
  if (e.anim !== anim || e.action !== action) {
    e.anim = anim;
    e.animTime = 0;
    e.action = action;
  }
}

/** Restart an anim from frame 0 (a new swing of the same attack). */
export function restartAnim(e: EntityState, anim: EntityState['anim'], action: string): void {
  e.anim = anim;
  e.animTime = 0;
  e.action = action;
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
      const rt = st.rts[i];
      if (rt.auraRadius > 0 || rt.vigilRadius > 0) st.auraSources.push(i);
    } else if (isHostile(e)) st.hostiles.push(i);
  }
}

export function modsOf(st: GState): ModifierQuery {
  return st.ctx ? st.ctx.services.mods : st.mods();
}
