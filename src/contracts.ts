/**
 * contracts.ts — the shared contract between every owner folder.
 *
 * Owner: lead agent. Folder agents (systems / controls / render / gameplay / qa)
 * must NOT edit this file; request changes through the lead.
 *
 * Contents:
 *   0. Timing and view constants
 *   1. Data schemas (zod) for every file in data/ -> inferred types
 *   2. Profile (save) and settings
 *   3. World state (the simulation snapshot render reads)
 *   4. Input (controls -> sim)
 *   5. HUD layout (shared by controls hit-testing and render drawing)
 *   6. Events (typed EventBus)
 *   7. Module contracts (what each folder's index.ts must export)
 *   8. Scene keys and transition payloads
 *   9. QA hooks on window
 *
 * Units: distances in logical pixels (view is 720 tall), time in seconds,
 * rates per second. Nothing in the simulation may depend on frame count.
 */
import { z } from 'zod';
// `Phaser` is a global namespace provided by phaser's type declarations.

// ---------------------------------------------------------------------------
// 0. Timing and view
// ---------------------------------------------------------------------------

/** Simulation ticks per second. All game logic runs at this fixed rate. */
export const SIM_HZ = 60;
/** Seconds per simulation tick. */
export const SIM_DT = 1 / SIM_HZ;
/** Max sim ticks caught up in one rendered frame (prevents a death spiral). */
export const MAX_TICKS_PER_FRAME = 5;
/** Real frame deltas above this are clamped (tab switch, debugger). */
export const MAX_FRAME_DELTA_MS = 250;
/** Logical view height. View width is 1280..1600 depending on screen aspect. */
export const VIEW_H = 720;
export const VIEW_W_MIN = 1280;
export const VIEW_W_MAX = 1600;

// ---------------------------------------------------------------------------
// 1. Data schemas
// ---------------------------------------------------------------------------

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are snake_case');
/** i18n key, looked up in data/i18n/<lang>.json */
const TextKey = z.string().min(1);
/** Free-form numeric/string/bool parameters consumed by a registered behavior/effect/attack. */
const Params = z.record(z.string(), z.union([z.number(), z.string(), z.boolean()]));

export const DamageKindSchema = z.enum(['physical', 'fire', 'holy', 'pierce']);
export type DamageKind = z.infer<typeof DamageKindSchema>;

export const AttackSchema = z.object({
  /** 'none' = does not attack (healer etc.) */
  kind: z.enum(['melee', 'ranged', 'none']),
  damage: z.number().min(0),
  /** seconds between attacks */
  interval: z.number().positive(),
  /** reach for melee, max distance for ranged */
  range: z.number().min(0),
  damageKind: DamageKindSchema.default('physical'),
  /** ranged: projectile sprite key; omitted = instant hit */
  projectile: z.string().optional(),
  /** extra targets a shot passes through */
  pierce: z.number().int().min(0).default(0),
  /** targets hit per swing (cleave) */
  maxTargets: z.number().int().min(1).default(1),
  splashRadius: z.number().min(0).default(0),
  /** ignores armor */
  armorPierce: z.boolean().default(false),
  hitsFlying: z.boolean().default(false),
  /** damage multiplier vs size 'large' */
  bonusVsLarge: z.number().positive().default(1),
  burn: z.object({ dps: z.number().positive(), duration: z.number().positive() }).optional(),
});
export type AttackDef = z.infer<typeof AttackSchema>;

export const StatsSchema = z.object({
  hp: z.number().positive(),
  armor: z.number().min(0).default(0),
  /** px per second */
  speed: z.number().min(0),
  attack: AttackSchema,
});
export type StatsDef = z.infer<typeof StatsSchema>;

/** Reference to a behavior registered in gameplay/ (validated at boot). */
export const BehaviorRefSchema = z.object({ id: Id, params: Params.default({}) });
export type BehaviorRef = z.infer<typeof BehaviorRefSchema>;

export const SizeSchema = z.enum(['small', 'normal', 'large', 'huge']);

export const UnitDefSchema = z.object({
  id: Id,
  nameKey: TextKey,
  /** 'troop' = regular soldier, 'hero' = one of each type on the field at a time */
  kind: z.enum(['troop', 'hero']),
  sprite: z.string(),
  ironCost: z.number().int().min(0),
  cooldown: z.number().min(0),
  /** first wave this unit can be used in: available once profile.highestWave + 1 >= unlockWave */
  unlockWave: z.number().int().min(0),
  /** extra unlock rule, e.g. "boss:gravewright" (new content); omitted = wave only */
  unlockRule: z.string().optional(),
  size: SizeSchema.default('normal'),
  stats: StatsSchema,
  behaviors: z.array(BehaviorRefSchema).default([]),
  /** units that spawn alongside (Arthur's archers) */
  escorts: z.array(z.object({ unitId: Id, count: z.number().int().positive() })).default([]),
  origin: z.enum(['original', 'new']),
});
export type UnitDef = z.infer<typeof UnitDefSchema>;

export const EnemyDefSchema = z.object({
  id: Id,
  nameKey: TextKey,
  sprite: z.string(),
  /** wave-budget cost; gold dropped = ceil(threat * balance.economy.goldPerThreat) */
  threat: z.number().positive(),
  firstWave: z.number().int().min(1),
  flying: z.boolean().default(false),
  size: SizeSchema.default('normal'),
  stats: StatsSchema,
  behaviors: z.array(BehaviorRefSchema).default([]),
  origin: z.enum(['original', 'new']),
});
export type EnemyDef = z.infer<typeof EnemyDefSchema>;

/** One step of a boss attack loop. `attack` is an id registered in gameplay/bosses. */
export const BossStepSchema = z.object({
  attack: Id,
  params: Params.default({}),
  /** warning shown before damage lands (seconds); 0 only for non-damaging steps */
  telegraph: z.number().min(0),
  /** idle time after the step */
  recover: z.number().min(0),
});
export type BossStep = z.infer<typeof BossStepSchema>;

export const SpawnGroupSchema = z.object({
  enemy: Id,
  count: z.number().int().positive(),
  /** seconds between spawns inside the group */
  interval: z.number().min(0),
  /** seconds after wave start (or after the phase starts, for boss minions) */
  startAt: z.number().min(0),
});
export type SpawnGroup = z.infer<typeof SpawnGroupSchema>;

export const BossDefSchema = z.object({
  id: Id,
  nameKey: TextKey,
  sprite: z.string(),
  hp: z.number().positive(),
  armor: z.number().min(0).default(0),
  size: SizeSchema.default('huge'),
  flying: z.boolean().default(false),
  /** seconds of invulnerability while changing phase */
  phaseTransition: z.number().min(0).default(1.5),
  phases: z.array(z.object({
    /** phase is active while hp fraction > this (first phase usually 0.66, last 0) */
    untilHpFrac: z.number().min(0).max(1),
    loop: z.array(BossStepSchema).min(1),
    minions: z.array(SpawnGroupSchema).default([]),
  })).min(1),
  drop: z.object({
    relicId: Id.optional(),
    unlockUnit: Id.optional(),
    gold: z.number().int().min(0).default(0),
  }).default({ gold: 0 }),
  origin: z.enum(['original', 'new']),
});
export type BossDef = z.infer<typeof BossDefSchema>;

/** A spell effect: `effect` is an id registered in gameplay/spells, params are its knobs. */
export const SpellEffectSchema = z.object({ effect: Id, params: Params.default({}) });
export type SpellEffect = z.infer<typeof SpellEffectSchema>;

/** Param overrides + extra effects applied on top of the base spell for a tree tier. */
export const SpellTierPatchSchema = z.object({
  descKey: TextKey,
  goldCost: z.number().int().min(0),
  /** shallow override: effects[i].params merged by index */
  paramOverrides: z.array(Params).default([]),
  addEffects: z.array(SpellEffectSchema).default([]),
  manaCost: z.number().min(0).optional(),
  cooldown: z.number().min(0).optional(),
});
export type SpellTierPatch = z.infer<typeof SpellTierPatchSchema>;

export const SpellDefSchema = z.object({
  id: Id,
  nameKey: TextKey,
  descKey: TextKey,
  icon: z.string(),
  mana: z.number().min(0),
  cooldown: z.number().min(0),
  /** 'line' = fires where Ash faces, 'point' = needs a target x, 'none' = instant */
  targeting: z.enum(['line', 'point', 'none']),
  /** preview radius/width for 'point' targeting (px) */
  aimRadius: z.number().min(0).default(0),
  unlockWave: z.number().int().min(0),
  unlockRule: z.string().optional(),
  effects: z.array(SpellEffectSchema).min(1),
  /** original spells: 5 upgrade levels via upgrades.json. New spells: 3-tier tree. */
  tree: z.object({
    tier1: SpellTierPatchSchema,
    tier2: SpellTierPatchSchema,
    tier3A: SpellTierPatchSchema,
    tier3B: SpellTierPatchSchema,
  }).optional(),
  origin: z.enum(['original', 'new']),
});
export type SpellDef = z.infer<typeof SpellDefSchema>;

/**
 * Stat keys are namespaced strings. Modifiers from upgrades and relics target them.
 *   ash.hp, ash.speed, ash.melee.damage, ash.gun.damage, ash.gun.interval, ash.magnet, ash.dodge.cooldown
 *   unit.<unitId>.hp, unit.<unitId>.damage, unit.*.hp (all units)
 *   spell.<spellId>.power, spell.<spellId>.cooldown, spell.*.mana
 *   castle.book.hp, castle.book.regen, castle.archers.count, castle.catapult.level, castle.pit.level
 *   economy.iron.rate, economy.iron.max, economy.mana.max, economy.mana.regen, economy.gold.lifetime
 * Unknown keys are allowed (new content), but gameplay only reads keys it knows.
 */
export const StatKeySchema = z.string().regex(/^[a-z]+(\.[a-z0-9_*]+)+$/);

export const ModifierSchema = z.object({
  stat: StatKeySchema,
  op: z.enum(['add', 'mul']),
  /** 'mul' values are multipliers added together: 0.15 means +15% */
  value: z.number(),
});
export type ModifierDef = z.infer<typeof ModifierSchema>;

export const UpgradeDefSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_.]*$/),
  category: z.enum(['ash', 'army', 'spell', 'castle', 'mana']),
  nameKey: TextKey,
  /** unit/spell this belongs to (for grouping in the shop), optional */
  target: z.string().optional(),
  maxLevel: z.number().int().positive(),
  baseCost: z.number().int().positive(),
  costGrowth: z.number().positive(),
  /** applied once per level owned */
  perLevel: z.array(ModifierSchema).min(1),
  unlockWave: z.number().int().min(0).default(0),
});
export type UpgradeDef = z.infer<typeof UpgradeDefSchema>;

export const LevelDefSchema = z.object({
  wave: z.number().int().min(1),
  chapter: z.number().int().min(1),
  kind: z.enum(['normal', 'boss']),
  bossId: Id.optional(),
  /** hand-made schedule; if omitted, waves/ builds one from wave_formula.json */
  groups: z.array(SpawnGroupSchema).optional(),
  /** seed for the formula generator so a formula wave is the same every time */
  seed: z.number().int().optional(),
  /** i18n key for the pre-wave tip */
  tipKey: TextKey.optional(),
});
export type LevelDef = z.infer<typeof LevelDefSchema>;

export const WaveFormulaSchema = z.object({
  /** B(n) = a + b*n + c*n^2 */
  budget: z.object({ a: z.number(), b: z.number(), c: z.number() }),
  subwaves: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }),
  subwaveGap: z.object({ min: z.number().positive(), max: z.number().positive() }),
  spawnInterval: z.object({ min: z.number().positive(), max: z.number().positive() }),
  /** weight multiplier for an enemy on its firstWave..firstWave+2 */
  newEnemyWeight: z.number().positive(),
  endless: z.object({
    growthPerWave: z.number().positive(),
    bossEvery: z.number().int().positive(),
  }),
});
export type WaveFormula = z.infer<typeof WaveFormulaSchema>;

export const RelicDefSchema = z.object({
  id: Id,
  nameKey: TextKey,
  descKey: TextKey,
  icon: z.string(),
  modifiers: z.array(ModifierSchema).default([]),
  /** special hooks implemented in gameplay (e.g. "double_shot") */
  flags: z.array(Id).default([]),
});
export type RelicDef = z.infer<typeof RelicDefSchema>;

export const BalanceSchema = z.object({
  world: z.object({
    width: z.number().positive(),
    groundY: z.number().positive(),
    bookX: z.number(),
    castleRight: z.number(),
    stairsX: z.number(),
    pit: z.object({ left: z.number(), right: z.number() }),
    fieldRight: z.number(),
    enemySpawnX: z.number(),
    ashMinX: z.number(),
    ashMaxX: z.number(),
    allyHoldX: z.number(),
    laneJitterY: z.number().min(0),
    flyingY: z.object({ min: z.number(), max: z.number() }),
  }),
  ash: z.object({
    stats: StatsSchema,
    melee: AttackSchema,
    pickupRadius: z.number().positive(),
    dodge: z.object({ distance: z.number(), invuln: z.number(), cooldown: z.number(), unlockWave: z.number().int() }),
  }),
  book: z.object({ hp: z.number().positive() }),
  economy: z.object({
    ironStart: z.number().min(0),
    ironRate: z.number().min(0),
    ironMax: z.number().positive(),
    manaMax: z.number().positive(),
    manaRegen: z.number().min(0),
    goldPerThreat: z.number().positive(),
    goldLifetime: z.number().positive(),
    waveBonus: z.object({ base: z.number(), perWave: z.number() }),
    firstClearMultiplier: z.number().positive(),
    uncollectedGoldKeep: z.number().min(0).max(1),
    loseGoldKeep: z.number().min(0).max(1),
    bossReplayGoldMultiplier: z.number().positive(),
  }),
  drops: z.object({
    manaOrb: z.object({ chance: z.number().min(0).max(1), amount: z.number() }),
    food: z.object({ chance: z.number().min(0).max(1), healFrac: z.number() }),
  }),
  castle: z.object({
    archers: z.object({ interval: z.number(), damage: z.number(), maxX: z.number() }),
    catapult: z.object({ interval: z.number(), damage: z.number(), radius: z.number(), maxX: z.number() }),
    pit: z.object({ minEnemies: z.number().int(), cooldown: z.number() }),
  }),
  loadout: z.object({ unitSlots: z.number().int().positive(), spellSlots: z.number().int().positive(), relicSlots: z.number().int().min(0) }),
  limits: z.object({
    maxEnemies: z.number().int().positive(),
    maxAllies: z.number().int().positive(),
    maxParticlesHigh: z.number().int().positive(),
    maxParticlesLow: z.number().int().positive(),
    maxDamageNumbers: z.number().int().positive(),
  }),
  stars: z.object({ twoStarBookFrac: z.number(), threeStarBookFrac: z.number() }),
  campaignWaves: z.number().int().positive(),
});
export type Balance = z.infer<typeof BalanceSchema>;

export const I18nSchema = z.record(z.string(), z.string());

/** Everything in data/, validated and indexed by id. Built once by core/data.ts. */
export interface GameData {
  units: ReadonlyMap<string, UnitDef>;
  enemies: ReadonlyMap<string, EnemyDef>;
  bosses: ReadonlyMap<string, BossDef>;
  spells: ReadonlyMap<string, SpellDef>;
  upgrades: ReadonlyMap<string, UpgradeDef>;
  relics: ReadonlyMap<string, RelicDef>;
  /** index = wave - 1 */
  levels: readonly LevelDef[];
  waveFormula: WaveFormula;
  balance: Balance;
  i18n: Readonly<Record<Lang, Readonly<Record<string, string>>>>;
}

// ---------------------------------------------------------------------------
// 2. Profile (save) and settings
// ---------------------------------------------------------------------------

export type Lang = 'th' | 'en';

export interface Settings {
  lang: Lang;
  /** 0 = follow the display refresh rate, 60 = cap rendering at ~60 fps */
  fpsCap: 0 | 60;
  fxQuality: 'low' | 'high';
  showFps: boolean;
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
  haptics: boolean;
  damageNumbers: boolean;
}

export interface SpellTierState {
  /** 0 = locked/not bought, 1..3 */
  tier: 0 | 1 | 2 | 3;
  branch?: 'A' | 'B';
}

export const SAVE_SCHEMA_VERSION = 1;

export interface ProfileState {
  schemaVersion: number;
  gold: number;
  /** highest campaign wave won (0 = none) */
  highestWave: number;
  /** wave -> best stars 0..3 */
  stars: Record<number, 0 | 1 | 2 | 3>;
  /** upgrade id -> level owned */
  upgrades: Record<string, number>;
  /** new-spell trees */
  spellTiers: Record<string, SpellTierState>;
  /** units unlocked by rules other than wave number (boss kills etc.) */
  unlockedUnits: string[];
  bossesDefeated: string[];
  relicsOwned: string[];
  relicsEquipped: (string | null)[];
  loadout: { units: string[]; spells: string[] };
  endlessBest: number;
  settings: Settings;
}

// ---------------------------------------------------------------------------
// 3. World state (simulation snapshot). Sim writes, render/controls read.
// ---------------------------------------------------------------------------

export type EntityKind = 'ash' | 'ally' | 'hero' | 'enemy' | 'boss' | 'projectile' | 'pickup' | 'effect';
export type Team = 'player' | 'enemy' | 'neutral';
export type AnimState = 'idle' | 'walk' | 'attack' | 'cast' | 'hurt' | 'die' | 'dodge' | 'spawn' | 'stunned' | 'telegraph';

export interface StatusState {
  id: 'burn' | 'slow' | 'stun' | 'root' | 'mark' | 'buff' | 'invuln' | 'shred' | 'taunt' | string;
  remaining: number; // seconds
  magnitude: number;
}

/**
 * One simulated thing. Pooled: `alive=false` entries may be reused, so never keep
 * a reference across ticks; keep the numeric id and look it up.
 * prevX/prevY are copied by core at the start of every tick; render draws
 * lerp(prev, current, alpha).
 */
export interface EntityState {
  id: number;
  alive: boolean;
  kind: EntityKind;
  team: Team;
  /** id into units/enemies/bosses/... or a pickup/projectile/effect type */
  defId: string;
  /** sprite key render should use (from def, may change e.g. boss phases) */
  sprite: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  armor: number;
  flying: boolean;
  size: 'small' | 'normal' | 'large' | 'huge';
  anim: AnimState;
  /** seconds since anim state changed */
  animTime: number;
  statuses: StatusState[];
  /** for pickups: gold/mana amount; for projectiles: damage; else 0 */
  value: number;
  /** remaining lifetime for pickups/projectiles/effects (seconds), Infinity otherwise */
  ttl: number;
}

export interface Telegraph {
  id: number;
  /** 'band' = horizontal ground strip, 'circle' = ground circle, 'line' = aim line, 'shadow' = falling object */
  shape: 'band' | 'circle' | 'line' | 'shadow';
  x: number;
  y: number;
  /** band/line length, or circle radius */
  size: number;
  /** seconds until it fires */
  remaining: number;
  total: number;
  /** who created it (entity id) */
  ownerId: number;
}

export interface SummonSlotState {
  unitId: string;
  ironCost: number;
  cooldownLeft: number;
  cooldownTotal: number;
  /** false when a hero of this type is alive, or ally cap reached */
  available: boolean;
}

export interface SpellSlotState {
  spellId: string;
  manaCost: number;
  cooldownLeft: number;
  cooldownTotal: number;
  targeting: SpellDef['targeting'];
  aimRadius: number;
}

export type WavePhase = 'intro' | 'running' | 'won' | 'lost';

export interface WaveOutcome {
  result: 'won' | 'lost';
  reason?: 'ash_died' | 'book_destroyed';
  wave: number;
  endless: boolean;
  goldCollected: number;
  goldUncollectedKept: number;
  goldBonus: number;
  goldTotal: number;
  stars: 0 | 1 | 2 | 3;
  firstClear: boolean;
  /** ids of units/spells/relics/features unlocked by this result */
  unlocks: string[];
  relicDropped?: string;
}

export interface WorldState {
  tick: number;
  /** sim seconds since wave start */
  time: number;
  phase: WavePhase;
  wave: {
    number: number;
    endless: boolean;
    kind: 'normal' | 'boss';
    enemiesTotal: number;
    enemiesSpawned: number;
    enemiesKilled: number;
  };
  /** entity id of Ash (always present while a wave runs) */
  ashId: number;
  book: { hp: number; maxHp: number };
  resources: {
    iron: number;
    ironMax: number;
    mana: number;
    manaMax: number;
    goldCollected: number;
  };
  entities: EntityState[];
  telegraphs: Telegraph[];
  summonSlots: SummonSlotState[];
  spellSlots: SpellSlotState[];
  dodge: { unlocked: boolean; cooldownLeft: number; cooldownTotal: number };
  boss: null | { entityId: number; bossId: string; phase: number; phaseCount: number; hpFrac: number; nameKey: string };
  outcome: WaveOutcome | null;
}

// ---------------------------------------------------------------------------
// 4. Input (controls -> sim)
// ---------------------------------------------------------------------------

export type SimCommand =
  | { type: 'summon'; slot: number }
  | { type: 'cast'; slot: number; target: { x: number } | 'auto' }
  | { type: 'dodge' };

/** Consumed once per sim tick. `commands` are edge-triggered and drained on read. */
export interface InputFrame {
  /** -1 left, 0 none, 1 right (held) */
  move: -1 | 0 | 1;
  commands: SimCommand[];
}

/** Spell-aim UI state, owned by controls, drawn by render. */
export interface AimState {
  /** spell slot being aimed, or null */
  slot: number | null;
  /** current world x under pointer, or null */
  worldX: number | null;
}

/** Runner-level actions (not simulation): controls emit these on the bus as 'ui:*' events. */

// ---------------------------------------------------------------------------
// 5. HUD layout — computed by core/layout.ts from view size + safe insets.
// ---------------------------------------------------------------------------

export interface Rect { x: number; y: number; w: number; h: number }

export interface HudLayout {
  viewW: number;
  viewH: number;
  topBar: Rect;
  ashBar: Rect;
  bookBar: Rect;
  waveBar: Rect;
  minimap: Rect;
  goldLabel: Rect;
  speedButton: Rect;
  pauseButton: Rect;
  ironPanel: Rect;
  unitSlots: Rect[];
  spellButtons: Rect[];
  dodgeButton: Rect;
  cancelAimButton: Rect;
  /** touch: hold inside these to walk (they exclude every button rect) */
  moveZoneLeft: Rect;
  moveZoneRight: Rect;
}

// ---------------------------------------------------------------------------
// 6. Events
// ---------------------------------------------------------------------------

export interface GameEvents {
  // flow
  'wave:started': { wave: number; endless: boolean; kind: 'normal' | 'boss' };
  'wave:ended': WaveOutcome;
  // entities
  'entity:spawned': { id: number; kind: EntityKind; defId: string; x: number; y: number };
  'entity:damaged': { id: number; amount: number; x: number; y: number; damageKind: DamageKind; sourceId: number | null; blocked: boolean };
  'entity:healed': { id: number; amount: number; x: number; y: number };
  'entity:died': { id: number; kind: EntityKind; defId: string; x: number; y: number; killerId: number | null; cause: 'damage' | 'pit' | 'portal' | 'despawn' };
  'entity:status': { id: number; status: StatusState['id']; applied: boolean };
  'entity:attack': { id: number; targetId: number | null; x: number; y: number; ranged: boolean };
  // player actions
  'unit:summoned': { slot: number; unitId: string; entityIds: number[] };
  'summon:denied': { slot: number; reason: 'iron' | 'cooldown' | 'hero_alive' | 'cap' | 'empty' };
  'spell:cast': { slot: number; spellId: string; x: number };
  'spell:denied': { slot: number; reason: 'mana' | 'cooldown' | 'empty' | 'no_target' };
  'spell:impact': { spellId: string; effect: string; x: number; y: number; radius: number };
  'ash:dodged': { fromX: number; toX: number };
  // economy
  'pickup:dropped': { id: number; pickup: 'gold' | 'mana' | 'food'; x: number; y: number; value: number };
  'pickup:collected': { id: number; pickup: 'gold' | 'mana' | 'food'; x: number; y: number; value: number };
  'resource:changed': { iron: number; mana: number; goldCollected: number };
  // castle
  'castle:pit': { killed: number };
  'castle:shot': { source: 'archer' | 'catapult'; x: number; y: number };
  'book:damaged': { amount: number; hp: number };
  // bosses
  'boss:spawned': { id: number; bossId: string };
  'boss:phase': { id: number; bossId: string; phase: number };
  'boss:telegraph': Telegraph;
  'boss:defeated': { id: number; bossId: string };
  // meta / ui
  'save:written': { ok: boolean };
  'save:recovered': { from: 'backup' | 'defaults'; error: string };
  'settings:changed': Settings;
  'ui:pause': { paused: boolean };
  'ui:speed': { speed: 1 | 2 };
  'ui:aim': AimState;
  'ui:layout': HudLayout;
  // spectacle hooks (game-creator convention) — render attaches juice here
  'spectacle:entrance': { what: string; x: number; y: number };
  'spectacle:action': { action: 'move' | 'summon' | 'cast' | 'dodge'; x: number; y: number };
  'spectacle:hit': { x: number; y: number; big: boolean };
  'spectacle:combo': { combo: number };
  'spectacle:streak': { streak: number };
  'spectacle:near_miss': { x: number; y: number };
}
export type GameEventName = keyof GameEvents;
export type Unsubscribe = () => void;

export interface EventBus {
  on<K extends GameEventName>(event: K, fn: (payload: GameEvents[K]) => void): Unsubscribe;
  once<K extends GameEventName>(event: K, fn: (payload: GameEvents[K]) => void): Unsubscribe;
  emit<K extends GameEventName>(event: K, payload: GameEvents[K]): void;
  /** remove every listener (used on full app reset only) */
  clear(): void;
}

// ---------------------------------------------------------------------------
// 7. Module contracts
// ---------------------------------------------------------------------------

/** Seeded RNG. The simulation must never call Math.random(). */
export interface Rng {
  /** [0, 1) */
  next(): number;
  range(min: number, max: number): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

/** Combined modifiers for one stat key. effective = (base + add) * (1 + mul) */
export interface ModifierQuery {
  get(stat: string): { add: number; mul: number };
  apply(base: number, stat: string): number;
}

/** In-battle resources. Implemented by systems/. */
export interface EconomyApi {
  canAfford(kind: 'iron' | 'mana', amount: number): boolean;
  spend(kind: 'iron' | 'mana', amount: number): boolean;
  gain(kind: 'iron' | 'mana', amount: number): void;
  /** record gold picked up by Ash this wave */
  collectGold(amount: number): void;
}

/** Entity creation. Implemented by gameplay/. */
export interface SpawnApi {
  spawnEnemy(enemyId: string, opts?: { x?: number }): number;
  spawnBoss(bossId: string): number;
  /** remaining live enemies + bosses */
  hostileCount(): number;
}

/** Wave progress queries. Implemented by systems/. */
export interface WaveApi {
  /** true once every scheduled spawn (incl. boss) has been issued */
  allSpawned(): boolean;
}

export interface SimServices {
  economy: EconomyApi;
  spawn: SpawnApi;
  waves: WaveApi;
  mods: ModifierQuery;
}

/** Everything a sim system can touch during a tick. */
export interface SimContext {
  readonly world: WorldState;
  readonly data: GameData;
  readonly profile: Readonly<ProfileState>;
  readonly bus: EventBus;
  readonly rng: Rng;
  readonly services: SimServices;
  /** parameters of the current wave */
  readonly wave: Readonly<WaveStartParams>;
}

export interface WaveStartParams {
  wave: number;
  endless: boolean;
  /** loadout for this wave (unit ids, spell ids, relic ids) */
  units: string[];
  spells: string[];
  relics: string[];
  /** RNG seed; same seed + same inputs = same wave */
  seed: number;
}

/**
 * A piece of simulation logic. Core sorts systems by `order` and calls tick()
 * once per fixed step. Order bands:
 *   100 input & Ash control        (gameplay)
 *   200 wave director / spawning   (systems)
 *   300 AI, targeting, movement    (gameplay)
 *   400 combat, projectiles        (gameplay)
 *   500 spells, bosses, castle     (gameplay)
 *   600 economy regen, pickups     (systems)
 *   800 outcome check              (systems)
 *   900 cleanup (dead entity recycling) (gameplay)
 */
export interface SimSystem {
  readonly id: string;
  readonly order: number;
  /** called at the start of every wave, after world reset */
  init(ctx: SimContext): void;
  tick(ctx: SimContext, input: InputFrame): void;
  /** called when the wave is torn down */
  dispose(): void;
}

/** Meta (out-of-battle) services. Implemented by systems/. */
export interface SaveService {
  /** load from storage; falls back to backup, then defaults (emits save:recovered) */
  load(): ProfileState;
  save(profile: ProfileState): void;
  exportJson(profile: ProfileState): string;
  /** returns the parsed profile or an error message */
  importJson(json: string): { ok: true; profile: ProfileState } | { ok: false; error: string };
  defaults(): ProfileState;
}

export interface ProgressionService {
  isUnitUnlocked(profile: ProfileState, unitId: string): boolean;
  isSpellUnlocked(profile: ProfileState, spellId: string): boolean;
  /** highest wave the player may start */
  maxPlayableWave(profile: ProfileState): number;
  /** mutates the profile with gold, stars, unlocks, relics from a finished wave */
  applyOutcome(profile: ProfileState, outcome: WaveOutcome): void;
  /** builds the stat modifier table for a wave from upgrades + equipped relics */
  buildModifiers(profile: ProfileState): ModifierQuery;
}

export interface UpgradeService {
  level(profile: ProfileState, upgradeId: string): number;
  cost(profile: ProfileState, upgradeId: string): number | null; // null = maxed
  canBuy(profile: ProfileState, upgradeId: string): boolean;
  buy(profile: ProfileState, upgradeId: string): boolean;
  /** new-spell tree */
  tierCost(profile: ProfileState, spellId: string, branch?: 'A' | 'B'): number | null;
  buyTier(profile: ProfileState, spellId: string, branch?: 'A' | 'B'): boolean;
  respecBranch(profile: ProfileState, spellId: string, branch: 'A' | 'B'): boolean;
}

export interface MetaServices {
  save: SaveService;
  progression: ProgressionService;
  upgrades: UpgradeService;
}

/** What src/systems/index.ts must export. */
export interface SystemsModule {
  /** fresh instances for one wave; createWaveApi() is called after createSimSystems() for the same wave */
  createSimSystems(): SimSystem[];
  createEconomy(world: WorldState, data: GameData, mods: ModifierQuery): EconomyApi;
  createWaveApi(): WaveApi;
  /** out-of-battle services, created once at boot */
  createMeta(data: GameData, bus: EventBus): MetaServices;
}

/** What src/gameplay/index.ts must export. */
export interface GameplayModule {
  createSimSystems(): SimSystem[];
  createSpawnApi(world: WorldState, data: GameData, mods: () => ModifierQuery, bus: EventBus): SpawnApi;
  /** registered behavior / spell effect / boss attack ids, for boot-time data validation */
  registeredIds(): { behaviors: string[]; spellEffects: string[]; bossAttacks: string[] };
  /** extra data checks (params per behavior etc.); return human-readable errors */
  validateData(data: GameData): string[];
}

/** Coordinate helpers core hands to controls. "View" = logical screen px (0..viewW, 0..720). */
export interface CoordHelpers {
  /** pointer -> logical view coordinates (undoes the render scale) */
  toView(pointer: Phaser.Input.Pointer): { x: number; y: number };
  /** logical view x -> world x (adds the current camera scroll) */
  toWorldX(viewX: number): number;
}

/** What src/controls/index.ts must export. */
export interface InputSource {
  attach(scene: Phaser.Scene, layout: HudLayout, world: Readonly<WorldState>, bus: EventBus, coords: CoordHelpers): void;
  /** called by core when the layout changes (resize/orientation) */
  relayout(layout: HudLayout): void;
  /** called once per sim tick; drains queued commands */
  poll(): InputFrame;
  readonly aim: Readonly<AimState>;
  detach(): void;
}
export interface ControlsModule {
  createInputSource(): InputSource;
}

/** Read-only view handed to render every frame. */
export interface RenderView {
  readonly world: Readonly<WorldState>;
  readonly aim: Readonly<AimState>;
  readonly layout: HudLayout;
  readonly data: GameData;
  readonly settings: Readonly<Settings>;
  readonly paused: boolean;
  readonly speed: 1 | 2;
  /** camera scroll x in world px (core keeps it following Ash) */
  readonly cameraX: number;
  t(key: string, vars?: Record<string, string | number>): string;
}

/** Battle visuals: world sprites, FX, HUD. Several can be stacked. */
export interface BattleRenderer {
  readonly id: string;
  create(scene: Phaser.Scene, view: RenderView, bus: EventBus): void;
  /** alpha in [0,1): interpolation between previous and current tick */
  frame(view: RenderView, alpha: number, frameDtMs: number): void;
  relayout(layout: HudLayout): void;
  destroy(): void;
}

/** What src/render/index.ts must export. */
export interface RenderModule {
  /** generate placeholder/vector textures into the texture manager (Preloader) */
  buildTextures(scene: Phaser.Scene, renderScale: number): void;
  createBattleRenderers(): BattleRenderer[];
  /** menu scenes (Title, Map, Shop, PreWave, Result, Settings) */
  menuScenes: Array<new () => Phaser.Scene>;
}

/** App-wide context, created in Boot, read via core/app.ts getApp(). */
export interface AppContext {
  readonly data: GameData;
  readonly bus: EventBus;
  profile: ProfileState;
  readonly save: SaveService;
  readonly progression: ProgressionService;
  readonly upgrades: UpgradeService;
  /** logical->canvas scale (min(devicePixelRatio, 2)) */
  readonly renderScale: number;
  /** measured display refresh rate in Hz */
  readonly refreshHz: number;
  t(key: string, vars?: Record<string, string | number>): string;
  /** persist the profile and emit settings:changed if settings changed */
  commitProfile(): void;
  applySettings(next: Settings): void;
}

// ---------------------------------------------------------------------------
// 8. Scenes
// ---------------------------------------------------------------------------

export const SceneKey = {
  Boot: 'Boot',
  Preloader: 'Preloader',
  Title: 'Title',
  Map: 'Map',
  Shop: 'Shop',
  PreWave: 'PreWave',
  Battle: 'Battle',
  Result: 'Result',
  Settings: 'Settings',
} as const;
export type SceneKeyName = (typeof SceneKey)[keyof typeof SceneKey];

export interface PreWaveSceneData { wave: number; endless: boolean }
export interface BattleSceneData { params: WaveStartParams }
export interface ResultSceneData { outcome: WaveOutcome; params: WaveStartParams }
export interface SettingsSceneData { returnTo: SceneKeyName }

// ---------------------------------------------------------------------------
// 9. QA hooks (installed on window by core/qa.ts)
// ---------------------------------------------------------------------------

export interface QaHooks {
  /** compact JSON snapshot of whatever is on screen */
  render_game_to_text(): string;
  /** advance the simulation deterministically by ms (rounded to ticks), even while paused */
  advanceTime(ms: number): void;
  __aodd: {
    app(): AppContext | null;
    /** jump straight into a wave with the current loadout */
    startWave(wave: number, opts?: { endless?: boolean; seed?: number }): void;
    /** replace the profile (and save it) */
    setProfile(profile: ProfileState): void;
    /** queue input for the next tick(s), bypassing devices */
    input(frame: Partial<InputFrame>, ticks?: number): void;
    currentScene(): string;
    /** frame-time samples (ms) since the last call */
    frameTimes(): number[];
  };
}
