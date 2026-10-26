import { z } from 'zod';
import {
  BalanceSchema,
  BossDefSchema,
  EnemyDefSchema,
  I18nSchema,
  LevelDefSchema,
  RelicDefSchema,
  SpellDefSchema,
  UnitDefSchema,
  UpgradeDefSchema,
  WaveFormulaSchema,
  type GameData,
  type GameplayModule,
  type Lang,
} from '../contracts';

/**
 * Loads every JSON file in data/ (bundled by Vite; editing a file hot-reloads),
 * validates it against the contract schemas and cross-checks references.
 * Throws DataError listing every problem at once.
 */

const files = import.meta.glob('../../data/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const langFiles = import.meta.glob('../../data/i18n/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export class DataError extends Error {
  constructor(readonly problems: string[]) {
    super(`data/ has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    this.name = 'DataError';
  }
}

function file(name: string): unknown {
  const key = `../../data/${name}.json`;
  if (!(key in files)) throw new DataError([`missing file data/${name}.json`]);
  return files[key];
}

function parse<T>(problems: string[], where: string, schema: z.ZodType<T>, value: unknown): T | null {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  for (const issue of r.error.issues) problems.push(`${where} ${issue.path.join('.')}: ${issue.message}`);
  return null;
}

function indexById<T extends { id: string }>(problems: string[], name: string, schema: z.ZodType<T>): Map<string, T> {
  const raw = file(name);
  const out = new Map<string, T>();
  if (!Array.isArray(raw)) {
    problems.push(`data/${name}.json must be an array`);
    return out;
  }
  raw.forEach((item, i) => {
    const def = parse(problems, `data/${name}.json[${i}]`, schema, item);
    if (!def) return;
    if (out.has(def.id)) problems.push(`data/${name}.json duplicate id "${def.id}"`);
    out.set(def.id, def);
  });
  return out;
}

export function loadGameData(gameplay: Pick<GameplayModule, 'registeredIds' | 'validateData'>): GameData {
  const problems: string[] = [];

  const units = indexById(problems, 'units', UnitDefSchema);
  const enemies = indexById(problems, 'enemies', EnemyDefSchema);
  const bosses = indexById(problems, 'bosses', BossDefSchema);
  const spells = indexById(problems, 'spells', SpellDefSchema);
  const upgrades = indexById(problems, 'upgrades', UpgradeDefSchema);
  const relics = indexById(problems, 'relics', RelicDefSchema);
  const levelsRaw = parse(problems, 'data/levels.json', z.array(LevelDefSchema), file('levels')) ?? [];
  const waveFormula = parse(problems, 'data/wave_formula.json', WaveFormulaSchema, file('wave_formula'));
  const balance = parse(problems, 'data/balance.json', BalanceSchema, file('balance'));

  const i18n = {} as Record<Lang, Record<string, string>>;
  for (const lang of ['th', 'en'] as const) {
    const raw = langFiles[`../../data/i18n/${lang}.json`];
    if (raw === undefined) problems.push(`missing file data/i18n/${lang}.json`);
    i18n[lang] = parse(problems, `data/i18n/${lang}.json`, I18nSchema, raw ?? {}) ?? {};
  }

  // levels: 1..N in order, no gaps
  const levels = [...levelsRaw].sort((a, b) => a.wave - b.wave);
  levels.forEach((l, i) => {
    if (l.wave !== i + 1) problems.push(`data/levels.json: expected wave ${i + 1}, found ${l.wave}`);
  });
  if (balance && levels.length < balance.campaignWaves) {
    problems.push(`data/levels.json has ${levels.length} waves, balance.campaignWaves is ${balance.campaignWaves}`);
  }

  // cross references
  const need = (where: string, map: Map<string, unknown>, id: string | undefined, what: string) => {
    if (id !== undefined && !map.has(id)) problems.push(`${where}: unknown ${what} "${id}"`);
  };
  for (const u of units.values()) for (const e of u.escorts) need(`unit ${u.id} escorts`, units, e.unitId, 'unit');
  for (const b of bosses.values()) {
    need(`boss ${b.id} drop`, relics, b.drop.relicId, 'relic');
    need(`boss ${b.id} drop`, units, b.drop.unlockUnit, 'unit');
    b.phases.forEach((p, i) => p.minions.forEach((g) => need(`boss ${b.id} phase ${i + 1} minions`, enemies, g.enemy, 'enemy')));
  }
  for (const l of levels) {
    if (l.kind === 'boss') {
      if (!l.bossId) problems.push(`level ${l.wave}: kind "boss" needs bossId`);
      need(`level ${l.wave}`, bosses, l.bossId, 'boss');
    }
    l.groups?.forEach((g) => need(`level ${l.wave} groups`, enemies, g.enemy, 'enemy'));
  }
  for (const up of upgrades.values()) {
    if (up.category === 'army' && up.target) need(`upgrade ${up.id}`, units, up.target, 'unit');
    if (up.category === 'spell' && up.target) need(`upgrade ${up.id}`, spells, up.target, 'spell');
  }

  // ids that must be registered in gameplay/
  const reg = gameplay.registeredIds();
  const known = {
    behaviors: new Set(reg.behaviors),
    spellEffects: new Set(reg.spellEffects),
    bossAttacks: new Set(reg.bossAttacks),
  };
  const needReg = (where: string, set: Set<string>, id: string, what: string) => {
    if (!set.has(id)) problems.push(`${where}: ${what} "${id}" is not registered in src/gameplay`);
  };
  for (const u of units.values()) u.behaviors.forEach((b) => needReg(`unit ${u.id}`, known.behaviors, b.id, 'behavior'));
  for (const e of enemies.values()) e.behaviors.forEach((b) => needReg(`enemy ${e.id}`, known.behaviors, b.id, 'behavior'));
  for (const s of spells.values()) {
    s.effects.forEach((ef) => needReg(`spell ${s.id}`, known.spellEffects, ef.effect, 'spell effect'));
    if (s.tree) {
      for (const tier of [s.tree.tier1, s.tree.tier2, s.tree.tier3A, s.tree.tier3B]) {
        tier.addEffects.forEach((ef) => needReg(`spell ${s.id} tree`, known.spellEffects, ef.effect, 'spell effect'));
      }
    }
  }
  for (const b of bosses.values()) b.phases.forEach((p) => p.loop.forEach((st) => needReg(`boss ${b.id}`, known.bossAttacks, st.attack, 'boss attack')));

  if (problems.length > 0 || !waveFormula || !balance) throw new DataError(problems);

  const data: GameData = { units, enemies, bosses, spells, upgrades, relics, levels, waveFormula, balance, i18n };
  const extra = gameplay.validateData(data);
  if (extra.length > 0) throw new DataError(extra);
  return data;
}
