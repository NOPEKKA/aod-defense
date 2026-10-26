/**
 * Gold upgrades (SPEC 3.6) and new-spell trees (SPEC 6.2).
 * Upgrade cost = round(baseCost * costGrowth^level). Trees: tier1 -> tier2 -> tier3 (branch A or B);
 * switching branch later costs respecCostFrac of the new branch's tier-3 price.
 */
import type { GameData, ProfileState, SpellDef, SpellTierPatch, UpgradeService } from '../contracts';
import { ruleMet, waveReached } from './progression';
import { respecCostFrac } from './tunables';

type Tree = NonNullable<SpellDef['tree']>;

/** The patch bought next from the current tier, or null when maxed / branch missing at tier 3. */
function nextPatch(tree: Tree, tier: number, branch: 'A' | 'B' | undefined): SpellTierPatch | null {
  if (tier <= 0) return tree.tier1;
  if (tier === 1) return tree.tier2;
  if (tier === 2) return branch === 'A' ? tree.tier3A : branch === 'B' ? tree.tier3B : null;
  return null;
}

/** `respecCost` is extra (not in the contract yet) so the shop can show the price. */
export function createUpgrades(data: GameData): UpgradeService & { respecCost(p: ProfileState, spellId: string, branch: 'A' | 'B'): number | null } {
  const service: UpgradeService & { respecCost(p: ProfileState, spellId: string, branch: 'A' | 'B'): number | null } = {
    respecCost: (p, spellId, branch) => respecCost(data, p, spellId, branch),

    level: (p, id) => p.upgrades[id] ?? 0,

    cost(p, id) {
      const def = data.upgrades.get(id);
      if (!def) return null;
      const lvl = p.upgrades[id] ?? 0;
      if (lvl >= def.maxLevel) return null;
      return Math.round(def.baseCost * Math.pow(def.costGrowth, lvl));
    },

    canBuy(p, id) {
      const def = data.upgrades.get(id);
      const c = service.cost(p, id);
      return !!def && c !== null && p.gold >= c && waveReached(p, def.unlockWave);
    },

    buy(p, id) {
      if (!service.canBuy(p, id)) return false;
      p.gold -= service.cost(p, id) as number;
      p.upgrades[id] = (p.upgrades[id] ?? 0) + 1;
      return true;
    },

    tierCost(p, spellId, branch) {
      const s = data.spells.get(spellId);
      if (!s?.tree) return null;
      const patch = nextPatch(s.tree, p.spellTiers[spellId]?.tier ?? 0, branch);
      return patch ? patch.goldCost : null;
    },

    buyTier(p, spellId, branch) {
      const s = data.spells.get(spellId);
      if (!s?.tree || !waveReached(p, s.unlockWave) || !ruleMet(p, s.unlockRule)) return false;
      const cost = service.tierCost(p, spellId, branch);
      if (cost === null || p.gold < cost) return false;
      const tier = p.spellTiers[spellId]?.tier ?? 0;
      p.gold -= cost;
      p.spellTiers[spellId] = tier === 2 ? { tier: 3, branch } : { tier: (tier + 1) as 1 | 2 };
      return true;
    },

    respecBranch(p, spellId, branch) {
      const cost = respecCost(data, p, spellId, branch);
      if (cost === null || p.gold < cost) return false;
      p.gold -= cost;
      p.spellTiers[spellId] = { tier: 3, branch };
      return true;
    },
  };
  return service;
}

/** Respec price shown in the shop (same rule as respecBranch). */
export function respecCost(data: GameData, profile: Readonly<ProfileState>, spellId: string, branch: 'A' | 'B'): number | null {
  const s = data.spells.get(spellId);
  const state = profile.spellTiers[spellId];
  if (!s?.tree || !state || state.tier !== 3 || state.branch === branch) return null;
  return Math.round((branch === 'A' ? s.tree.tier3A : s.tree.tier3B).goldCost * respecCostFrac(data));
}
