/**
 * Registry of behavior / spell effect / boss attack ids and their params.
 * Boot-time validation (core/data.ts) requires every id used in data/ to be
 * listed here; validateData() checks each one's params.
 *
 * Adding a new kind: add its param spec here, then implement it (behaviors are
 * parsed into Rt fields in pool.ts#applyBehaviors and read by ai/combat;
 * spell effects live in spells.ts; boss attacks in bosses.ts).
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
};

export const SPELL_EFFECTS: Readonly<Record<string, Spec>> = {
  line_blast: { length: num(1), damage: num(0), knockback: opt(0), hitsFlying: bool, damageKind: { type: 'string', oneOf: ['physical', 'fire', 'holy', 'pierce'], optional: true } },
  area_rain: {
    width: num(1), hits: int(1), duration: num(0.01), damage: num(0), hitsFlying: bool,
    flamingAtLevel: int(1, true), burnDps: opt(0), burnDuration: opt(0),
  },
  random_boon: { healFrac: num(0, 1), summonCount: int(0), stun: num(0) },
  area_strike: { count: int(1), radius: num(1), damage: num(0), knockback: opt(0), spread: opt(0), delay: opt(0) },
  portal_execute: { radius: num(1), hpFrac: num(0, 1), slow: opt(0, 1), slowDuration: opt(0) },
  self_buff: { duration: num(0.01), meleeMul: opt(0), attackSpeedMul: opt(0.01), lifesteal: opt(0, 1) },
  dash_vehicle: { damage: num(0), knockback: opt(0), speed: num(1) },
};

export const BOSS_ATTACKS: Readonly<Record<string, Spec>> = {
  swoop: { damage: num(0), width: num(1) },
  summon: { enemy: { type: 'string', ref: 'enemy' }, count: int(1) },
  scream: { radius: num(1), stun: num(0) },
  melee_combo: { hits: int(1), damage: num(0), reach: num(1) },
};

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
    }
  };
  for (const u of data.units.values()) {
    checkActor(`unit ${u.id}`, u.stats.attack.kind, u.behaviors);
    if (u.behaviors.some((b) => b.id === 'flyer' || b.id === 'siege' || b.id === 'leap_once' || b.id === 'prefer_ash' || b.id === 'artillery')) {
      out.push(`unit ${u.id}: behaviors flyer/siege/leap_once/prefer_ash/artillery are enemy-only`);
    }
  }
  for (const e of data.enemies.values()) {
    checkActor(`enemy ${e.id}`, e.stats.attack.kind, e.behaviors);
    if (e.behaviors.some((b) => b.id === 'flyer') && !e.flying) out.push(`enemy ${e.id}: behavior "flyer" needs flying: true`);
    if (e.behaviors.some((b) => b.id === 'healer' || b.id === 'iron_boost' || b.id === 'aura')) {
      out.push(`enemy ${e.id}: behaviors healer/iron_boost/aura are ally-only (phase 3)`);
    }
  }
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
  }
  for (const b of data.bosses.values()) {
    let prev = 1;
    b.phases.forEach((p, i) => {
      if (p.untilHpFrac >= prev) out.push(`boss ${b.id} phase ${i + 1}: untilHpFrac must decrease`);
      prev = p.untilHpFrac;
      p.loop.forEach((st, j) => checkParams(`boss ${b.id} phase ${i + 1} step ${j + 1} ${st.attack}`, BOSS_ATTACKS[st.attack], st.params, data, out));
    });
    if (b.phases[b.phases.length - 1].untilHpFrac !== 0) out.push(`boss ${b.id}: last phase must have untilHpFrac 0`);
  }
  return out;
}
