/**
 * Gameplay tuning numbers that data/*.json has no schema field for yet.
 *
 * BalanceSchema / AttackSchema / BossDefSchema are zod objects that STRIP unknown
 * keys, so these cannot live in data/balance.json until the lead adds the fields
 * (see CONTRACT REQUESTS in the phase-3 gameplay report). Every value here is a
 * design guess: [เดา].
 */

/** Collision half-width of a body by size (px). [เดา] ~40% of the placeholder box width */
export const BODY_RADIUS = { small: 15, normal: 20, large: 30, huge: 60 } as const;

/** Height of the body centre above its feet, where shots aim (px). [เดา] */
export const HIT_HEIGHT = { small: 28, normal: 40, large: 52, huge: 110 } as const;

/** Ash starts this far right of the stairs (px). [เดา] */
export const ASH_SPAWN_OFFSET = 120;

/** Units stop this many px inside their reach so a drifting target stays in range. [เดา] */
export const REACH_MARGIN = 6;

/** Enemies queue behind each other at this fraction of balance.combat.allySpacing. [เดา] a horde is denser than a drilled line */
export const ENEMY_SPACING_MUL = 0.6;

/** Projectile speed by projectile sprite key (px/s); AttackSchema has no speed field. [เดา] */
export const PROJECTILE_SPEED: Readonly<Record<string, number>> = {
  shot: 1600,
  arrow: 800,
  bolt: 1000,
  fireball: 450,
  rock: 430,
};
export const PROJECTILE_SPEED_DEFAULT = 700;
/** projectiles fly at most range * this before expiring. [เดา] */
export const PROJECTILE_RANGE_SLACK = 1.15;
/** launch height above the shooter's feet (px). [เดา] */
export const MUZZLE_HEIGHT = 40;
/** arcing shots (artillery / wall catapult) peak at distance * this, capped. [เดา] */
export const ARC_HEIGHT_MUL = 0.35;
export const ARC_HEIGHT_MAX = 260;

/** How long a transient anim ('attack', 'cast') is held before idle/walk resumes (s). [เดา] */
export const ATTACK_ANIM_TIME = 0.25;
export const CAST_ANIM_TIME = 0.4;

/** Burn deals its damage in chunks this many seconds apart (one entity:damaged per chunk). [เดา] */
export const BURN_TICK = 0.5;

/** Gold coins: one coin carries at most this much; big enemies split into several coins. [เดา] */
export const COIN_MAX_VALUE = 5;
export const COIN_MAX_COUNT = 6;
export const BOSS_COIN_COUNT = 10;
/** coins scatter this far either side of the corpse (px). [เดา] */
export const DROP_SCATTER = 26;

/** 'point' spells with target 'auto' look for the densest cluster within this distance of Ash (px). [เดา] SPEC: "densest point on screen" */
export const AUTO_TARGET_RANGE = 700;
/** cluster radius used when a spell has aimRadius 0. [เดา] */
export const AUTO_TARGET_RADIUS = 150;

/** charge: re-arms after walking free (no target in reach) this long (s). [เดา] */
export const CHARGE_REARM = 2;
/** leap_once: time in the air (s). [เดา] */
export const LEAP_TIME = 0.4;
/** flyer 'ash_or_book': goes for Ash when Ash is within this x distance, else the book (px). [เดา] */
export const FLYER_ASH_AGGRO = 600;

/** Castle pit: cooldown at max level (SPEC 3.7: 30 s -> 14 s), open time, max level. [เดา] */
export const PIT_MIN_COOLDOWN = 14;
export const PIT_MAX_LEVEL = 5;
export const PIT_OPEN_TIME = 1.0;
/** wall catapult: interval shrinks by this fraction per level above 1. [เดา] */
export const CATAPULT_INTERVAL_STEP = 0.1;
/** wall archers / catapult shoot from here (relative to castleRight / groundY). [เดา] */
export const WALL_SHOOTER_DX = -40;
export const WALL_SHOOTER_HEIGHT = 250;

/** Bosses: walk speed (BossDef has no speed), hover offset for flyers, combo hit gap, spell stun factor. [เดา] */
export const BOSS_SPEED = 45;
export const BOSS_HOVER_AHEAD = 170;
export const BOSS_COMBO_GAP = 0.25;
export const BOSS_SWOOP_TIME = 0.35;
export const BOSS_STUN_MUL = 0.25;
export const BOSS_MINION_SPREAD = 60;

/** Spells: falling-rock start height and stagger between rocks (s). [เดา] */
export const STRIKE_FALL_HEIGHT = 520;
export const STRIKE_STAGGER = 0.15;
/** Deathcoaster: starts at the castle wall. [เดา] */
export const VEHICLE_START_DX = -20;
/** portal_execute threshold cap after spell power scaling. [เดา] */
export const PORTAL_MAX_HPFRAC = 0.9;

/** spectacle:hit is 'big' at or above this damage. [เดา] */
export const BIG_HIT = 30;
