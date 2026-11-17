/**
 * Registry of behavior / spell effect / boss attack ids and their params.
 * Boot-time validation (core/data.ts) requires every id used in data/ to be
 * listed here; validateData() checks each one's params.
 *
 * Adding a new kind: add its param spec here, then implement it (behaviors are
 * parsed into Rt fields in pool.ts#applyBehaviors and read by ai/combat/heroes;
 * spell effects live in spells.ts and spells_new.ts; boss attacks in bosses.ts).
 */
import type { GameData } from '../contracts';

type Param =
  | { type: 'number'; min?: number; max?: number; int?: boolean; optional?: boolean }
  | { type: 'string'; oneOf?: readonly string[]; optional?: boolean; ref?: 'enemy' | 'unit' }
  | { type: 'boolean'; optional?: boolean };
type Spec = Readonly<Record<string, Param>>;

const num = (min?: number, max?: number, optional = false): Param => ({ type: 'number', min, max, optional });
const int = (min?: number, optional = false): Param => ({ type: 'number', min, int: true, optional });
const opt = (min?: number, max?: number): Param => num(min, max, true);
const bool: Param = { type: 'boolean', optional: true };
const enemyRef: Param = { type: 'string', ref: 'enemy' };

export const BEHAVIORS: Readonly<Record<string, Spec>> = {
  melee: {},
  ranged: {},
  second_row: {},
  charge: { firstHitMul: num(1), knockback: num(0) },
  aura: { radius: num(1), stat: { type: 'string', oneOf: ['damage'] }, value: num(-1, 10) },
  healer: { interval: num(0.05), amount: num(0), targets: int(1), radius: num(1), keepBack: opt(0) },
  iron_boost: { rateMul: num(0) },
  prefer_ash: {},
  shield_front: { block: num(0, 1) },
  flyer: { target: { type: 'string', oneOf: ['ash_or_book', 'ash', 'book'] } },
  leap_once: { distance: num(1) },
  siege: { blockedSlow: num(0, 1) },
  artillery: { minRange: num(0) },
  // hero abilities (SPEC 6.1)
  silver_mark: { bonus: num(0, 5), duration: num(0.05) },
  shred: { perHit: num(0), maxStacks: num(0) },
  lifesteal: { frac: num(0, 1) },
  vigil_light: { radius: num(1), slow: num(0, 1), flyingDamageMul: num(1) },
  matins_flare: { interval: num(0.5), radius: num(1), stun: num(0) },
  chain_drag: { interval: num(0.5), duration: num(0.05), range: num(1) },
  taunt: { interval: num(0.5), radius: num(1), duration: num(0.05) },
};

/** behaviors only player units may have */
const ALLY_ONLY = ['healer', 'iron_boost', 'aura', 'silver_mark', 'shred', 'lifesteal', 'vigil_light', 'matins_flare', 'chain_drag', 'taunt'];
/** behaviors only enemies may have */
const ENEMY_ONLY = ['flyer', 'siege', 'leap_once', 'prefer_ash', 'artillery'];

const DMG_KIND: Param = { type: 'string', oneOf: ['physical', 'fire', 'holy', 'pierce'], optional: true };

export const SPELL_EFFECTS: Readonly<Record<string, Spec>> = {
  line_blast: { length: num(1), damage: num(0), knockback: opt(0), hitsFlying: bool, damageKind: DMG_KIND },
  area_rain: {
    width: num(1), hits: int(1), duration: num(0.01), damage: num(0), hitsFlying: bool,
    flamingAtLevel: int(1, true), burnDps: opt(0), burnDuration: opt(0),
  },
  random_boon: { healFrac: num(0, 1), summonCount: int(0), stun: num(0) },
  area_strike: { count: int(1), radius: num(1), damage: num(0), knockback: opt(0), spread: opt(0), delay: opt(0) },
  portal_execute: { radius: num(1), hpFrac: num(0, 1), slow: opt(0, 1), slowDuration: opt(0) },
  self_buff: { duration: num(0.01), meleeMul: opt(0), attackSpeedMul: opt(0.01), lifesteal: opt(0, 1) },
  dash_vehicle: { damage: num(0), knockback: opt(0), speed: num(1) },
  // new spells (SPEC 6.2, spells_new.ts)
  salt_circle: { radius: num(1), duration: num(0.05), slow: opt(0, 1), dps: opt(0), bindRoot: opt(0), healPerSec: opt(0) },
  global_stun: { stun: num(0), bossStun: opt(0), interrupt: bool, shatter: opt(0, 5) },
  burn_zone: { x0: num(0), x1: num(0), dps: num(0), duration: num(0.05), slow: opt(0, 1), burstDamage: opt(0), burstRadius: opt(0) },
  traps: { count: int(1), spread: opt(0), damage: num(0), root: opt(0), triggerRadius: opt(1), bleedDps: opt(0), bleedDuration: opt(0), pullRadius: opt(0) },
  lance: { damage: num(0), knockback: opt(0), mark: opt(0, 5), markDuration: opt(0), count: int(1, true), gap: opt(0), speed: opt(1) },
  army_buff: { duration: num(0.05), damage: opt(0), speed: opt(0), lifesteal: opt(0, 1) },
  summon_units: { unit: { type: 'string', ref: 'unit' }, count: int(1) },
};

export const BOSS_ATTACKS: Readonly<Record<string, Spec>> = {
  // sheila_demon
  swoop: { damage: num(0), width: num(1) },
  summon: { enemy: enemyRef, count: int(1) },
  scream: { radius: num(1), stun: num(0), damage: opt(0) },
  // evil_ash
  melee_combo: { hits: int(1), damage: num(0), reach: num(1) },
  shotgun_line: { damage: num(0), length: num(1), knockback: opt(0) },
  ground_wave: { damage: num(0), width: num(1), speed: num(1), knockback: opt(0) },
  drain_book: { dps: num(0), duration: num(0.1), breakDamage: num(1) },
  fire_storm: { count: int(1), damage: num(0), radius: num(1), gap: num(0), spread: opt(0) },
  // gravewright
  shovel_slam: { damage: num(0), length: num(1), knockback: opt(0) },
  grave_hands: { count: int(1), damage: num(0), radius: num(1), gap: num(0), root: opt(0) },
  burrow: { damage: num(0), radius: num(1), track: num(0), speed: num(1), knockback: opt(0) },
  coffin_toss: { count: int(1), damage: num(0), radius: num(1), gap: num(0), knockback: opt(0) },
  // mother_mire
  toss_poison: { count: int(1), damage: num(0), radius: num(1), spread: opt(0), poolDps: num(0), poolLife: num(0) },
  mud_wave: { damage: num(0), width: num(1), speed: num(1), gapWidth: num(40), knockback: opt(0) },
  steam_beam: { damage: num(0), width: num(1), speed: num(1), passes: int(1), reach: num(1) },
  // sir_hollow
  charge: { damage: num(0), knockback: opt(0), speed: num(1) },
  throw_head: { damage: num(0), radius: num(1), bounces: int(0), hop: num(0), bounceWarn: num(0.6) },
  double_charge: { damage: num(0), knockback: opt(0), speed: num(1), secondWarn: num(0.6) },
  // malachar
  raise_dead: { window: num(0), hpFrac: num(0.01, 1), max: int(0), radius: opt(1), breakDamage: opt(1) },
  black_bell: { rings: int(1), damage: num(0), speed: num(1), width: num(1), gap: num(0), radius: num(1), knockback: opt(0) },
  float_fireballs: { count: int(1), damage: num(0), radius: num(1), gap: num(0) },
};

/** boss steps that deal damage must warn for 0.6..1.2 s (SPEC 6.3) */
const NON_DAMAGING = ['summon', 'raise_dead', 'drain_book'];

export function registeredIds() {
  return {
    behaviors: Object.keys(BEHAVIORS),
    spellEffects: Object.keys(SPELL_EFFECTS),
    bossAttacks: Object.keys(BOSS_ATTACKS),
  };
}

function checkParams(where: string, spec: Spec | undefined, params: Readonly<Record<string, unknown>>, data: GameData, out: string[]): void {
  if (!spec) return; // unregistered ids are reported by core/data.ts
  for (const key of Object.keys(params)) {
    if (!(key in spec)) out.push(`${where}: unknown param "${key}"`);
  }
  for (const [key, p] of Object.entries(spec)) {
    const v = params[key];
    if (v === undefined) {
      if (!p.optional) out.push(`${where}: missing param "${key}"`);
      continue;
    }
    if (typeof v !== p.type) {
      out.push(`${where}: param "${key}" must be a ${p.type}`);
      continue;
    }
    if (p.type === 'number') {
      const n = v as number;
      if (!Number.isFinite(n)) out.push(`${where}: param "${key}" must be finite`);
      if (p.min !== undefined && n < p.min) out.push(`${where}: param "${key}" must be >= ${p.min}`);
      if (p.max !== undefined && n > p.max) out.push(`${where}: param "${key}" must be <= ${p.max}`);
      if (p.int && !Number.isInteger(n)) out.push(`${where}: param "${key}" must be an integer`);
    } else if (p.type === 'string') {
      const s = v as string;
      if (p.oneOf && !p.oneOf.includes(s)) out.push(`${where}: param "${key}" must be one of ${p.oneOf.join('|')}`);
      if (p.ref === 'enemy' && !data.enemies.has(s)) out.push(`${where}: param "${key}" unknown enemy "${s}"`);
      if (p.ref === 'unit' && !data.units.has(s)) out.push(`${where}: param "${key}" unknown unit "${s}"`);
    }
  }
}

export function validateData(data: GameData): string[] {
  const out: string[] = [];
  const checkActor = (where: string, kind: 'melee' | 'ranged' | 'none', behaviors: { id: string; params: Record<string, unknown> }[]) => {
    for (const b of behaviors) {
      checkParams(`${where} behavior ${b.id}`, BEHAVIORS[b.id], b.params, data, out);
      if ((b.id === 'ranged' || b.id === 'artillery') && kind !== 'ranged') out.push(`${where}: behavior "${b.id}" needs attack.kind "ranged"`);
      if ((b.id === 'melee' || b.id === 'second_row' || b.id === 'charge') && kind !== 'melee') out.push(`${where}: behavior "${b.id}" needs attack.kind "melee"`);
      if ((b.id === 'shred' || b.id === 'lifesteal') && kind !== 'melee') out.push(`${where}: behavior "${b.id}" needs attack.kind "melee"`);
    }
  };
  const checkAttack = (where: string, a: { kind: string; windup: number; interval: number; projectile?: string }) => {
    if (a.windup > a.interval) out.push(`${where}: attack.windup must not exceed attack.interval`);
    if (a.kind === 'ranged' && !a.projectile) out.push(`${where}: ranged attack needs a projectile`);
  };
  for (const u of data.units.values()) {
    checkActor(`unit ${u.id}`, u.stats.attack.kind, u.behaviors);
    checkAttack(`unit ${u.id}`, u.stats.attack);
    for (const b of u.behaviors) if (ENEMY_ONLY.includes(b.id)) out.push(`unit ${u.id}: behavior "${b.id}" is enemy-only`);
    for (const b of u.behaviors) {
      if (u.kind !== 'hero' && ['silver_mark', 'shred', 'lifesteal', 'vigil_light', 'matins_flare', 'chain_drag', 'taunt'].includes(b.id)) {
        out.push(`unit ${u.id}: behavior "${b.id}" is hero-only`);
      }
    }
    if (u.unlockRule !== undefined) {
      const m = /^boss:([a-z][a-z0-9_]*)$/.exec(u.unlockRule);
      if (!m) out.push(`unit ${u.id}: unlockRule "${u.unlockRule}" must look like boss:<bossId>`);
      else if (!data.bosses.has(m[1])) out.push(`unit ${u.id}: unlockRule names unknown boss "${m[1]}"`);
    }
  }
  for (const e of data.enemies.values()) {
    checkActor(`enemy ${e.id}`, e.stats.attack.kind, e.behaviors);
    if (e.stats.attack.kind !== 'none') checkAttack(`enemy ${e.id}`, e.stats.attack);
    if (e.behaviors.some((b) => b.id === 'flyer') && !e.flying) out.push(`enemy ${e.id}: behavior "flyer" needs flying: true`);
    for (const b of e.behaviors) if (ALLY_ONLY.includes(b.id)) out.push(`enemy ${e.id}: behavior "${b.id}" is ally-only`);
  }
  checkAttack('balance.ash.stats', data.balance.ash.stats.attack);
  checkAttack('balance.ash.melee', data.balance.ash.melee);
  for (const s of data.spells.values()) {
    const tiers = s.tree ? [s.tree.tier1, s.tree.tier2, s.tree.tier3A, s.tree.tier3B] : [];
    s.effects.forEach((ef, i) => {
      // tree overrides may add params, so validate the merged params of every tier path
      const merged: Record<string, unknown> = { ...ef.params };
      for (const t of tiers) Object.assign(merged, t.paramOverrides[i] ?? {});
      checkParams(`spell ${s.id} effect ${ef.effect}`, SPELL_EFFECTS[ef.effect], merged, data, out);
    });
    for (const t of tiers) {
      if (t.paramOverrides.length > s.effects.length) out.push(`spell ${s.id} tree: more paramOverrides than effects`);
      t.addEffects.forEach((ef) => checkParams(`spell ${s.id} tree effect ${ef.effect}`, SPELL_EFFECTS[ef.effect], ef.params, data, out));
    }
    if (s.origin === 'new' && !s.tree) out.push(`spell ${s.id}: new spells need a 3-tier tree`);
  }
  for (const b of data.bosses.values()) {
    let prev = 1;
    b.phases.forEach((p, i) => {
      if (p.untilHpFrac >= prev) out.push(`boss ${b.id} phase ${i + 1}: untilHpFrac must decrease`);
      prev = p.untilHpFrac;
      p.loop.forEach((st, j) => {
        const where = `boss ${b.id} phase ${i + 1} step ${j + 1} ${st.attack}`;
        checkParams(where, BOSS_ATTACKS[st.attack], st.params, data, out);
        if (!NON_DAMAGING.includes(st.attack) && (st.telegraph < 0.6 || st.telegraph > 1.2)) out.push(`${where}: telegraph must be 0.6..1.2 s`);
      });
    });
    if (b.phases[b.phases.length - 1].untilHpFrac !== 0) out.push(`boss ${b.id}: last phase must have untilHpFrac 0`);
    if (b.drop.relicId && !data.relics.has(b.drop.relicId)) out.push(`boss ${b.id}: drop.relicId unknown relic "${b.drop.relicId}"`);
    if (b.drop.unlockUnit && !data.units.has(b.drop.unlockUnit)) out.push(`boss ${b.id}: drop.unlockUnit unknown unit "${b.drop.unlockUnit}"`);
  }
  for (const r of data.relics.values()) {
    for (const f of r.flags) if (!['double_shot', 'charge_bonus', 'censer'].includes(f)) out.push(`relic ${r.id}: unknown flag "${f}"`);
  }
  return out;
}
