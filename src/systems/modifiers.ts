/**
 * Stat modifier table built from upgrades (level x perLevel) and equipped relics.
 * effective = (base + add) * (1 + mul). Keys may use '*' segments as wildcards:
 * `unit.*.hp` applies to every `unit.<id>.hp`, `spell.*.mana` to every spell.
 */
import type { GameData, ModifierDef, ModifierQuery, ProfileState } from '../contracts';

interface Sum {
  add: number;
  mul: number;
}

const ZERO: Readonly<Sum> = Object.freeze({ add: 0, mul: 0 });

/** Same segment count, and every segment equal or '*'. */
function matches(pattern: readonly string[], key: readonly string[]): boolean {
  if (pattern.length !== key.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== '*' && pattern[i] !== key[i]) return false;
  }
  return true;
}

/** Builds a query over raw modifier entries. Results are cached per stat key (no per-tick allocation). */
export function createModifierQuery(entries: Iterable<{ def: ModifierDef; times: number }>): ModifierQuery {
  const exact = new Map<string, Sum>();
  const wild: { parts: string[]; sum: Sum }[] = [];
  const wildIndex = new Map<string, Sum>();

  for (const { def, times } of entries) {
    if (times === 0) continue;
    const isWild = def.stat.includes('*');
    let sum = isWild ? wildIndex.get(def.stat) : exact.get(def.stat);
    if (!sum) {
      sum = { add: 0, mul: 0 };
      if (isWild) {
        wildIndex.set(def.stat, sum);
        wild.push({ parts: def.stat.split('.'), sum });
      } else {
        exact.set(def.stat, sum);
      }
    }
    sum[def.op] += def.value * times;
  }

  const cache = new Map<string, Readonly<Sum>>();
  const get = (stat: string): Readonly<Sum> => {
    const hit = cache.get(stat);
    if (hit) return hit;
    const own = exact.get(stat);
    let add = own?.add ?? 0;
    let mul = own?.mul ?? 0;
    if (wild.length > 0) {
      const parts = stat.split('.');
      for (const w of wild) {
        if (matches(w.parts, parts)) {
          add += w.sum.add;
          mul += w.sum.mul;
        }
      }
    }
    const out = add === 0 && mul === 0 ? ZERO : Object.freeze({ add, mul });
    cache.set(stat, out);
    return out;
  };

  return {
    get,
    apply(base, stat) {
      const m = get(stat);
      return (base + m.add) * (1 + m.mul);
    },
  };
}

/** Upgrades owned + relics equipped (and owned, each counted once) -> modifier query. */
export function modifiersFromProfile(data: GameData, profile: Readonly<ProfileState>): ModifierQuery {
  const entries: { def: ModifierDef; times: number }[] = [];
  for (const [id, level] of Object.entries(profile.upgrades)) {
    const def = data.upgrades.get(id);
    if (!def || !(level > 0)) continue;
    const lvl = Math.min(Math.floor(level), def.maxLevel);
    for (const m of def.perLevel) entries.push({ def: m, times: lvl });
  }
  const seen = new Set<string>();
  for (const relicId of profile.relicsEquipped) {
    if (relicId === null || seen.has(relicId) || !profile.relicsOwned.includes(relicId)) continue;
    seen.add(relicId);
    const def = data.relics.get(relicId);
    if (!def) continue;
    for (const m of def.modifiers) entries.push({ def: m, times: 1 });
  }
  return createModifierQuery(entries);
}
