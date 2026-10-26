/**
 * Unlocks, playable waves, applying a finished wave to the profile, modifiers.
 * A unit/spell is available once highestWave + 1 >= unlockWave; an `unlockRule`
 * adds a condition on top ("boss:<bossId>" or "wave:<n>"); unknown rules stay locked.
 */
import type { GameData, ProfileState, ProgressionService, WavePlanner } from '../contracts';
import { modifiersFromProfile } from './modifiers';

export function waveReached(profile: Readonly<ProfileState>, unlockWave: number): boolean {
  return profile.highestWave + 1 >= unlockWave;
}

export function ruleMet(profile: Readonly<ProfileState>, rule: string | undefined): boolean {
  if (!rule) return true;
  const sep = rule.indexOf(':');
  const kind = sep < 0 ? rule : rule.slice(0, sep);
  const arg = sep < 0 ? '' : rule.slice(sep + 1);
  switch (kind) {
    case 'boss':
      return profile.bossesDefeated.includes(arg);
    case 'wave': {
      const n = Number(arg);
      return Number.isFinite(n) && profile.highestWave >= n;
    }
    default:
      return false;
  }
}

function pushUnique(list: string[], id: string): void {
  if (!list.includes(id)) list.push(id);
}

export function createProgression(data: GameData, planner: WavePlanner): ProgressionService {
  return {
    isUnitUnlocked(p, unitId) {
      const u = data.units.get(unitId);
      if (!u) return false;
      if (p.unlockedUnits.includes(unitId)) return true;
      return waveReached(p, u.unlockWave) && ruleMet(p, u.unlockRule);
    },

    isSpellUnlocked(p, spellId) {
      const s = data.spells.get(spellId);
      if (!s) return false;
      if (!waveReached(p, s.unlockWave) || !ruleMet(p, s.unlockRule)) return false;
      // new spells with a tree must be bought (tier 1) in the shop first
      return !s.tree || (p.spellTiers[spellId]?.tier ?? 0) >= 1;
    },

    maxPlayableWave: (p) => Math.min(data.balance.campaignWaves, p.highestWave + 1),

    applyOutcome(p, o) {
      p.gold = Math.max(0, Math.floor(p.gold + o.goldTotal));
      if (o.result !== 'won') return;
      if (o.endless) {
        p.endlessBest = Math.max(p.endlessBest, o.wave);
      } else {
        p.highestWave = Math.max(p.highestWave, o.wave);
        const prev = p.stars[o.wave] ?? 0;
        if (o.stars > prev) p.stars[o.wave] = o.stars;
      }
      // the outcome does not name the boss; the plan is deterministic, so ask the planner
      const bossId = planner.plan(o.wave, o.endless).bossId;
      if (bossId) {
        pushUnique(p.bossesDefeated, bossId);
        const unlockUnit = data.bosses.get(bossId)?.drop.unlockUnit;
        if (unlockUnit) pushUnique(p.unlockedUnits, unlockUnit);
      }
      if (o.relicDropped) pushUnique(p.relicsOwned, o.relicDropped);
    },

    buildModifiers: (p) => modifiersFromProfile(data, p),
  };
}
