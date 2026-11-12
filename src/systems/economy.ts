/**
 * In-battle resources (SPEC 3.2): iron from the smithy, mana regen, gold picked up this wave.
 * createEconomy() also fills world.resources for the wave (it runs before any system init),
 * the regen system (order 600) refills iron/mana every tick.
 */
import { SIM_DT, type EconomyApi, type GameData, type ModifierQuery, type SimSystem, type WorldState } from '../contracts';

export interface EconomyState {
  ironRate: number;
  /** blacksmith level (1-based); level data comes from balance.economy.smith when present */
  smithLevel: number;
  mods: ModifierQuery;
  data: GameData;
  manaRegen: number;
  /** set by spend/gain/collectGold; the regen system turns it into one resource:changed per tick */
  dirty: boolean;
}

const states = new WeakMap<WorldState, EconomyState>();

export function economyStateOf(world: WorldState): EconomyState | undefined {
  return states.get(world);
}

/**
 * Applies the blacksmith level to rate, storage cap and world.smith (SPEC v2.4).
 * Level data is balance.economy.smith.levels[level-1]; without it the flat ironRate / ironMax apply.
 * Modifiers (castle.smithy, castle.iron_cap, relics) go on top of the level values.
 */
export function applySmithLevel(world: WorldState, st: EconomyState): void {
  const e = st.data.balance.economy;
  const levels = e.smith?.levels;
  const r = world.resources;
  const sm = world.smith;
  if (levels && levels.length > 0) {
    const maxLevel = levels.length;
    st.smithLevel = Math.max(1, Math.min(maxLevel, st.smithLevel));
    const L = levels[st.smithLevel - 1];
    st.ironRate = Math.max(0, st.mods.apply(L.rate, 'economy.iron.rate'));
    r.ironMax = Math.max(0, st.mods.apply(L.cap, 'economy.iron.max'));
    sm.level = st.smithLevel;
    sm.maxLevel = maxLevel;
    sm.upgradeCost = st.smithLevel >= maxLevel ? 0 : L.upgradeCost;
  } else {
    st.ironRate = Math.max(0, st.mods.apply(e.ironRate, 'economy.iron.rate'));
    r.ironMax = Math.max(0, st.mods.apply(e.ironMax, 'economy.iron.max'));
    sm.level = 1;
    sm.maxLevel = 1;
    sm.upgradeCost = 0;
  }
  if (r.iron > r.ironMax) r.iron = r.ironMax;
  updateSmithProgress(world);
}

/** progress towards the next whole iron; a full store shows a full bar */
export function updateSmithProgress(world: WorldState): void {
  const r = world.resources;
  world.smith.progress = r.iron >= r.ironMax ? 1 : r.iron - Math.floor(r.iron);
}

export function createEconomy(world: WorldState, data: GameData, mods: ModifierQuery): EconomyApi {
  const e = data.balance.economy;
  const r = world.resources;
  r.manaMax = Math.max(0, mods.apply(e.manaMax, 'economy.mana.max'));
  r.mana = r.manaMax; // mana starts full
  r.goldCollected = 0;

  const state: EconomyState = {
    ironRate: 0,
    smithLevel: 1,
    mods,
    data,
    manaRegen: Math.max(0, mods.apply(e.manaRegen, 'economy.mana.regen')),
    dirty: false,
  };
  states.set(world, state);
  // `economy.iron.start` is not used by relics yet, but the hook is there
  r.iron = Math.max(0, mods.apply(e.ironStart, 'economy.iron.start'));
  applySmithLevel(world, state); // level 1: rate, cap, world.smith (also clamps the start iron)

  return {
    canAfford: (kind, amount) => r[kind] >= amount,
    spend(kind, amount) {
      if (!(amount >= 0) || r[kind] < amount) return false;
      r[kind] -= amount;
      state.dirty = true;
      return true;
    },
    gain(kind, amount) {
      if (!(amount > 0)) return;
      if (kind === 'iron') r.iron = Math.min(r.ironMax, r.iron + amount);
      else r.mana = Math.min(r.manaMax, r.mana + amount);
      state.dirty = true;
    },
    collectGold(amount) {
      if (!(amount > 0)) return;
      r.goldCollected += amount;
      state.dirty = true;
    },
  };
}

export function createRegenSystem(): SimSystem {
  let state: EconomyState | undefined;
  return {
    id: 'systems.economy',
    order: 600,
    init(ctx) {
      state = states.get(ctx.world);
    },
    tick(ctx) {
      if (!state || ctx.world.phase !== 'running') return;
      const r = ctx.world.resources;
      if (r.iron < r.ironMax) r.iron = Math.min(r.ironMax, r.iron + state.ironRate * SIM_DT);
      updateSmithProgress(ctx.world);
      if (r.mana < r.manaMax) r.mana = Math.min(r.manaMax, r.mana + state.manaRegen * SIM_DT);
      if (state.dirty) {
        state.dirty = false;
        ctx.bus.emit('resource:changed', { iron: r.iron, mana: r.mana, goldCollected: r.goldCollected });
      }
    },
    dispose() {
      state = undefined;
    },
  };
}
