/**
 * SaveService: localStorage `aodd.save` with a rolling backup in `aodd.save.bak`,
 * versioned migrations and zod validation. Never throws to the caller.
 */
import { z } from 'zod';
import { SAVE_SCHEMA_VERSION, type EventBus, type GameData, type ProfileState, type SaveService, type Settings } from '../contracts';

export const SAVE_KEY = 'aodd.save';
export const BACKUP_KEY = 'aodd.save.bak';

type RawSave = Record<string, unknown>;

/**
 * MIGRATIONS[v] upgrades a raw save from schemaVersion v to v + 1 (and must set
 * schemaVersion to v + 1). v1 is the first version, so the table is empty.
 * Example for a future v2:
 *   1: (raw) => ({ ...raw, schemaVersion: 2, newField: 0 }),
 */
const MIGRATIONS: Readonly<Record<number, (raw: RawSave) => RawSave>> = {};

export function defaultSettings(): Settings {
  return {
    lang: 'th',
    fpsCap: 0,
    fxQuality: 'high',
    showFps: false,
    sfxVolume: 0.8,
    musicVolume: 0.6,
    haptics: true,
    damageNumbers: true,
  };
}

export function defaultProfile(data: GameData): ProfileState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gold: 0,
    highestWave: 0,
    stars: {},
    upgrades: {},
    spellTiers: {},
    unlockedUnits: [],
    bossesDefeated: [],
    relicsOwned: [],
    relicsEquipped: Array.from({ length: data.balance.loadout.relicSlots }, () => null),
    loadout: { units: ['peasant', 'swordsman'], spells: ['super_boomstick', 'arrow_volley'] },
    endlessBest: 0,
    settings: defaultSettings(),
  };
}

// --- schema ------------------------------------------------------------------

const S = defaultSettings();
const unit01 = z.number().min(0).max(1);
const SettingsSchema = z.object({
  lang: z.enum(['th', 'en']).default(S.lang),
  fpsCap: z.union([z.literal(0), z.literal(60)]).default(S.fpsCap),
  fxQuality: z.enum(['low', 'high']).default(S.fxQuality),
  showFps: z.boolean().default(S.showFps),
  sfxVolume: unit01.default(S.sfxVolume),
  musicVolume: unit01.default(S.musicVolume),
  haptics: z.boolean().default(S.haptics),
  damageNumbers: z.boolean().default(S.damageNumbers),
});

const count = z.number().int().min(0);
const ids = z.array(z.string());
const Star = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

/**
 * Core progress fields are required (a save without them is corrupt). Collections
 * and settings fill in defaults when missing so older/partial saves still load;
 * a wrong type anywhere fails validation.
 */
const ProfileSchema = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  gold: z.number().min(0).refine(Number.isFinite, 'gold must be finite'),
  highestWave: count,
  stars: z.record(z.string().regex(/^[1-9]\d*$/, 'stars keys are wave numbers'), Star).default(() => ({})),
  upgrades: z.record(z.string(), count).default(() => ({})),
  spellTiers: z
    .record(
      z.string(),
      z.object({
        tier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
        branch: z.enum(['A', 'B']).optional(),
      }),
    )
    .default(() => ({})),
  unlockedUnits: ids.default(() => []),
  bossesDefeated: ids.default(() => []),
  relicsOwned: ids.default(() => []),
  relicsEquipped: z.array(z.string().nullable()).default(() => []),
  loadout: z.object({ units: ids, spells: ids }),
  endlessBest: count.default(0),
  settings: SettingsSchema.default(defaultSettings),
});

function describe(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

function migrate(raw: unknown): RawSave {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('save is not an object');
  let save = raw as RawSave;
  const version = save.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new Error('schemaVersion missing or invalid');
  let v: number = version;
  if (v > SAVE_SCHEMA_VERSION) throw new Error(`save is from a newer version (v${v} > v${SAVE_SCHEMA_VERSION})`);
  while (v < SAVE_SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`no migration from v${v}`);
    save = step(save);
    const next = save.schemaVersion;
    if (typeof next !== 'number' || next <= v) throw new Error(`migration from v${v} did not advance schemaVersion`);
    v = next;
  }
  return save;
}

/** raw JSON value -> migrated, validated, normalized profile (throws with a readable message) */
function toProfile(data: GameData, raw: unknown): ProfileState {
  const r = ProfileSchema.safeParse(migrate(raw));
  if (!r.success) throw new Error(describe(r.error));
  const p = r.data;
  const slots = data.balance.loadout.relicSlots;
  const relicsEquipped = p.relicsEquipped.slice(0, slots);
  while (relicsEquipped.length < slots) relicsEquipped.push(null);
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gold: p.gold,
    highestWave: p.highestWave,
    stars: p.stars as unknown as ProfileState['stars'],
    upgrades: p.upgrades,
    spellTiers: p.spellTiers,
    unlockedUnits: p.unlockedUnits,
    bossesDefeated: p.bossesDefeated,
    relicsOwned: p.relicsOwned,
    relicsEquipped,
    loadout: { units: p.loadout.units, spells: p.loadout.spells },
    endlessBest: p.endlessBest,
    settings: p.settings,
  };
}

function parseText(data: GameData, text: string): ProfileState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  return toProfile(data, raw);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // access can throw (blocked storage)
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export interface SaveRecovery {
  from: 'backup' | 'defaults';
  error: string;
}

/**
 * The returned object also carries `lastRecovery` (not in the contract yet):
 * load() runs inside createApp before any scene subscribes to `save:recovered`,
 * so a menu can read this to tell the player.
 */
export function createSaveService(data: GameData, bus: EventBus): SaveService & { lastRecovery: SaveRecovery | null } {
  const service: SaveService & { lastRecovery: SaveRecovery | null } = {
    lastRecovery: null,

    defaults: () => defaultProfile(data),

    load() {
      const main = read(SAVE_KEY);
      if (main === null) return defaultProfile(data); // first run: nothing to recover
      let mainError: string;
      try {
        return parseText(data, main);
      } catch (err) {
        mainError = err instanceof Error ? err.message : String(err);
      }
      const bak = read(BACKUP_KEY);
      if (bak !== null) {
        try {
          const profile = parseText(data, bak);
          service.lastRecovery = { from: 'backup', error: `${SAVE_KEY}: ${mainError}` };
          bus.emit('save:recovered', service.lastRecovery);
          return profile;
        } catch (err) {
          mainError += `; ${BACKUP_KEY}: ${err instanceof Error ? err.message : String(err)}`;
        }
      } else {
        mainError += `; ${BACKUP_KEY}: missing`;
      }
      service.lastRecovery = { from: 'defaults', error: `${SAVE_KEY}: ${mainError}` };
      bus.emit('save:recovered', service.lastRecovery);
      return defaultProfile(data);
    },

    save(profile) {
      let ok = false;
      try {
        const json = JSON.stringify(profile);
        toProfile(data, JSON.parse(json)); // never write something load() would reject
        const ls = storage();
        if (ls) {
          // Back up the previous save, unless it is itself corrupt (then the old backup is the better copy).
          const prev = ls.getItem(SAVE_KEY);
          if (prev !== null) {
            let prevOk = true;
            try {
              parseText(data, prev);
            } catch {
              prevOk = false;
            }
            if (prevOk) ls.setItem(BACKUP_KEY, prev);
          }
          ls.setItem(SAVE_KEY, json);
          ok = true;
        }
      } catch {
        ok = false; // quota, blocked storage, or an invalid profile
      }
      bus.emit('save:written', { ok });
    },

    exportJson: (profile) => JSON.stringify(profile, null, 2),

    importJson(json) {
      try {
        return { ok: true, profile: parseText(data, json) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
  return service;
}
