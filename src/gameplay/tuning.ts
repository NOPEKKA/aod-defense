/**
 * Gameplay tunables that have no dedicated schema field. They live in
 * data/balance.json -> `tuning` (a flat Record<string, number>); this file is the typed
 * accessor with fallbacks, so a missing key never breaks the game. Every value is a
 * design guess: [เดา].
 *
 * Key prefixes owned by gameplay: combat., projectile., castle., boss., spell., ai.
 * The resolved object is built once per GameData (WeakMap) so hot loops read plain fields.
 */
import type { GameData } from '../contracts';

/** Fallback for every key gameplay reads. data/balance.json carries the same keys. */
export const TUNING_DEFAULTS = {
  // body size by size class: collision half-width and the height shots aim at (px, v2 scale)
  'combat.bodyRadius.small': 22,
  'combat.bodyRadius.normal': 30,
  'combat.bodyRadius.large': 42,
  'combat.bodyRadius.huge': 80,
  'combat.hitHeight.small': 60,
  'combat.hitHeight.normal': 80,
  'combat.hitHeight.large': 100,
  'combat.hitHeight.huge': 190,
  /** units stop this many px inside their reach so a drifting target stays in range */
  'combat.reachMargin': 6,
  /** a wound-up attack still lands if the target is at most this many px beyond reach */
  'combat.windupSlack': 24,
  /** the 'attack' anim is held this long after the hit (follow-through), capped by the interval */
  'combat.attackFollowThrough': 0.3,
  /** 'cast' anim hold (spells, heals, hero abilities) */
  'combat.castAnimTime': 0.5,
  /** burn / bleed / zone damage is dealt in chunks this many seconds apart */
  'combat.dotTick': 0.5,
  /** spectacle:hit is 'big' at or above this damage */
  'combat.bigHit': 30,
  /** every enemy within this many px of the book attacks it (SPEC v2.7) */
  'combat.bookSiegeRange': 120,
  /** gold coins: value cap per coin, coin count cap, scatter (px) */
  'combat.coin.maxValue': 5,
  'combat.coin.maxCount': 6,
  'combat.dropScatter': 40,
  /** shred status lasts this long after the last hit (s) */
  'combat.shredDuration': 6,
  /** relic hollow_spur: charge (and hero first-strike) damage bonus */
  'combat.relic.chargeBonus': 0.4,
  /** relic censer_of_matins: holy damage per second to enemies at x <= censerMaxX */
  'combat.relic.censerDps': 5,
  'combat.relic.censerMaxX': 480,
  /** relic doppel_boomstick: delay of the second shotgun shot (s) */
  'combat.relic.doubleShotDelay': 0.12,

  // AI / formation
  /** Ash starts this far right of the stairs */
  'ai.ashSpawnOffset': 180,
  /** enemies queue at this fraction of balance.combat.allySpacing (a horde is denser than a drilled line) */
  'ai.enemySpacingMul': 0.8,
  /** spacing of enemies crowding around the book (px) */
  'ai.bookSpacing': 14,
  /** rally 'hold': allies with no enemy within this distance fall back to the hold line */
  'ai.rallyEngageRange': 300,
  /** escorts spawn this far apart behind the summoned unit */
  'ai.escortStep': 30,
  /** charge re-arms after walking free this long (s) */
  'ai.chargeRearm': 2,
  /** leap_once: time in the air (s) and peak height (px) */
  'ai.leapTime': 0.45,
  'ai.leapHeight': 90,
  /** flyer 'ash_or_book' goes for Ash when Ash is within this x distance */
  'ai.flyerAshAggro': 600,
  /** flyers dive to this altitude when their target is in reach, and change altitude at this speed */
  'ai.flyerDiveAlt': 50,
  'ai.flyerAltSpeed': 260,
  /** knocked-back bodies hop: peak height per px of push */
  'ai.knockbackHop': 0.25,

  // projectiles (speed / arc by projectile sprite key; unknown keys use .default)
  'projectile.speed.default': 700,
  'projectile.speed.shot': 1600,
  'projectile.speed.arrow': 800,
  'projectile.speed.bolt': 1000,
  'projectile.speed.fireball': 450,
  'projectile.speed.rock': 430,
  'projectile.speed.holy_light': 900,
  'projectile.speed.lance': 1400,
  /** arc peak = distance * this (0 = flat line from muzzle to target) */
  'projectile.arc.default': 0.05,
  'projectile.arc.shot': 0,
  'projectile.arc.arrow': 0.12,
  'projectile.arc.bolt': 0.03,
  'projectile.arc.fireball': 0.15,
  'projectile.arc.rock': 0.35,
  'projectile.arc.holy_light': 0,
  'projectile.arc.lance': 0.02,
  'projectile.arcMax': 260,
  /** straight shots fly at most range * this */
  'projectile.rangeSlack': 1.15,
  /** muzzle height = shooter hit height * this */
  'projectile.muzzleMul': 1.1,
  /** aim height of the book (px above ground) */
  'projectile.bookAlt': 70,

  // castle
  'castle.pit.minCooldown': 14,
  'castle.pit.maxLevel': 5,
  'castle.pit.openTime': 1.0,
  'castle.catapult.intervalStep': 0.1,
  'castle.wallShooter.dx': -60,
  'castle.wallShooter.height': 250,

  // bosses
  'boss.hoverAhead': 260,
  'boss.comboGap': 0.25,
  'boss.swoopTime': 0.35,
  'boss.stunMul': 0.25,
  'boss.slowMul': 0.5,
  'boss.minionSpread': 90,
  /** ground bosses on a ranged step stop this far in front of the player front line */
  'boss.standoff': 520,
  /** a phase change pushes every live minion back (to the right) this far */
  'boss.phasePush': 220,
  /** a boss that cannot get its target in range starts the step anyway after this long */
  'boss.readyTimeout': 6,
  /** falling objects (coffins, fireballs, the pumpkin head) start this high */
  'boss.fallHeight': 420,
  /** after a charge the rider trots back at this fraction of its charge speed */
  'boss.returnSpeedMul': 0.5,
  /** float_fireballs: hover height */
  'boss.floatAlt': 120,
  /** drain_book: a broken channel stuns the boss this long */
  'boss.drainBreakStun': 1.5,

  // spells
  'spell.autoTargetRange': 700,
  'spell.autoTargetRadius': 150,
  'spell.strikeFallHeight': 520,
  'spell.strikeStagger': 0.15,
  'spell.vehicleStartDx': -20,
  'spell.portalMaxHpFrac': 0.9,
  /** bear traps stay armed this long */
  'spell.trapLifetime': 25,
  /** dawn lance flies this far */
  'spell.lanceRange': 1400,
} as const;

export type TuningKey = keyof typeof TUNING_DEFAULTS;
export type SizeClass = 'small' | 'normal' | 'large' | 'huge';

export interface Tuning {
  raw(key: TuningKey): number;
  bodyRadius: Readonly<Record<SizeClass, number>>;
  hitHeight: Readonly<Record<SizeClass, number>>;
  reachMargin: number;
  windupSlack: number;
  attackFollowThrough: number;
  castAnimTime: number;
  dotTick: number;
  bigHit: number;
  bookSiegeRange: number;
  coinMaxValue: number;
  coinMaxCount: number;
  dropScatter: number;
  shredDuration: number;
  chargeBonus: number;
  censerDps: number;
  censerMaxX: number;
  doubleShotDelay: number;
  ashSpawnOffset: number;
  enemySpacingMul: number;
  bookSpacing: number;
  rallyEngageRange: number;
  escortStep: number;
  chargeRearm: number;
  leapTime: number;
  leapHeight: number;
  flyerAshAggro: number;
  flyerDiveAlt: number;
  flyerAltSpeed: number;
  knockbackHop: number;
  projectileSpeed(sprite: string): number;
  projectileArc(sprite: string): number;
  arcMax: number;
  rangeSlack: number;
  muzzleMul: number;
  bookAlt: number;
  pitMinCooldown: number;
  pitMaxLevel: number;
  pitOpenTime: number;
  catapultIntervalStep: number;
  wallShooterDx: number;
  wallShooterHeight: number;
  bossHoverAhead: number;
  bossComboGap: number;
  bossSwoopTime: number;
  bossStunMul: number;
  bossSlowMul: number;
  bossMinionSpread: number;
  bossStandoff: number;
  bossPhasePush: number;
  bossReadyTimeout: number;
  bossFallHeight: number;
  bossReturnSpeedMul: number;
  bossFloatAlt: number;
  bossDrainBreakStun: number;
  autoTargetRange: number;
  autoTargetRadius: number;
  strikeFallHeight: number;
  strikeStagger: number;
  vehicleStartDx: number;
  portalMaxHpFrac: number;
  trapLifetime: number;
  lanceRange: number;
}

const cache = new WeakMap<GameData, Tuning>();

export function tuningOf(data: GameData): Tuning {
  const hit = cache.get(data);
  if (hit) return hit;
  const src = data.balance.tuning ?? {};
  const get = (k: TuningKey): number => {
    const v = src[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : TUNING_DEFAULTS[k];
  };
  // per-sprite projectile tables: every "projectile.speed.<key>" / "projectile.arc.<key>" in data or defaults
  const speeds = new Map<string, number>();
  const arcs = new Map<string, number>();
  const collect = (obj: Readonly<Record<string, number>>) => {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (k.startsWith('projectile.speed.')) speeds.set(k.slice(17), v);
      else if (k.startsWith('projectile.arc.')) arcs.set(k.slice(15), v);
    }
  };
  collect(TUNING_DEFAULTS);
  collect(src);
  const speedDefault = speeds.get('default') ?? 700;
  const arcDefault = arcs.get('default') ?? 0;
  const t: Tuning = {
    raw: get,
    bodyRadius: {
      small: get('combat.bodyRadius.small'),
      normal: get('combat.bodyRadius.normal'),
      large: get('combat.bodyRadius.large'),
      huge: get('combat.bodyRadius.huge'),
    },
    hitHeight: {
      small: get('combat.hitHeight.small'),
      normal: get('combat.hitHeight.normal'),
      large: get('combat.hitHeight.large'),
      huge: get('combat.hitHeight.huge'),
    },
    reachMargin: get('combat.reachMargin'),
    windupSlack: get('combat.windupSlack'),
    attackFollowThrough: get('combat.attackFollowThrough'),
    castAnimTime: get('combat.castAnimTime'),
    dotTick: Math.max(1 / 60, get('combat.dotTick')),
    bigHit: get('combat.bigHit'),
    bookSiegeRange: get('combat.bookSiegeRange'),
    coinMaxValue: Math.max(1, get('combat.coin.maxValue')),
    coinMaxCount: Math.max(1, get('combat.coin.maxCount')),
    dropScatter: get('combat.dropScatter'),
    shredDuration: get('combat.shredDuration'),
    chargeBonus: get('combat.relic.chargeBonus'),
    censerDps: get('combat.relic.censerDps'),
    censerMaxX: get('combat.relic.censerMaxX'),
    doubleShotDelay: get('combat.relic.doubleShotDelay'),
    ashSpawnOffset: get('ai.ashSpawnOffset'),
    enemySpacingMul: get('ai.enemySpacingMul'),
    bookSpacing: get('ai.bookSpacing'),
    rallyEngageRange: get('ai.rallyEngageRange'),
    escortStep: get('ai.escortStep'),
    chargeRearm: get('ai.chargeRearm'),
    leapTime: Math.max(1 / 60, get('ai.leapTime')),
    leapHeight: get('ai.leapHeight'),
    flyerAshAggro: get('ai.flyerAshAggro'),
    flyerDiveAlt: get('ai.flyerDiveAlt'),
    flyerAltSpeed: get('ai.flyerAltSpeed'),
    knockbackHop: get('ai.knockbackHop'),
    projectileSpeed: (sprite) => speeds.get(sprite) ?? speedDefault,
    projectileArc: (sprite) => arcs.get(sprite) ?? arcDefault,
    arcMax: get('projectile.arcMax'),
    rangeSlack: get('projectile.rangeSlack'),
    muzzleMul: get('projectile.muzzleMul'),
    bookAlt: get('projectile.bookAlt'),
    pitMinCooldown: get('castle.pit.minCooldown'),
    pitMaxLevel: get('castle.pit.maxLevel'),
    pitOpenTime: get('castle.pit.openTime'),
    catapultIntervalStep: get('castle.catapult.intervalStep'),
    wallShooterDx: get('castle.wallShooter.dx'),
    wallShooterHeight: get('castle.wallShooter.height'),
    bossHoverAhead: get('boss.hoverAhead'),
    bossComboGap: get('boss.comboGap'),
    bossSwoopTime: Math.max(1 / 60, get('boss.swoopTime')),
    bossStunMul: get('boss.stunMul'),
    bossSlowMul: get('boss.slowMul'),
    bossMinionSpread: get('boss.minionSpread'),
    bossStandoff: get('boss.standoff'),
    bossPhasePush: get('boss.phasePush'),
    bossReadyTimeout: get('boss.readyTimeout'),
    bossFallHeight: get('boss.fallHeight'),
    bossReturnSpeedMul: get('boss.returnSpeedMul'),
    bossFloatAlt: get('boss.floatAlt'),
    bossDrainBreakStun: get('boss.drainBreakStun'),
    autoTargetRange: get('spell.autoTargetRange'),
    autoTargetRadius: get('spell.autoTargetRadius'),
    strikeFallHeight: get('spell.strikeFallHeight'),
    strikeStagger: get('spell.strikeStagger'),
    vehicleStartDx: get('spell.vehicleStartDx'),
    portalMaxHpFrac: get('spell.portalMaxHpFrac'),
    trapLifetime: get('spell.trapLifetime'),
    lanceRange: get('spell.lanceRange'),
  };
  cache.set(data, t);
  return t;
}
