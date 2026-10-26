/**
 * In-battle resources (SPEC 3.2): iron from the smithy, mana regen, gold picked up this wave.
 * createEconomy() also fills world.resources for the wave (it runs before any system init),
 * the regen system (order 600) refills iron/mana every tick.
 */
import { SIM_DT, type EconomyApi, type GameData, type ModifierQuery, type SimSystem, type WorldState } from '../contracts';

interface EconomyState {
  ironRate: number;
  manaRegen: number;
  /** set by spend/gain/collectGold; the regen system turns it into one resource:changed per tick */
  dirty: boolean;
}

const states = new WeakMap<WorldState, EconomyState>();

export function createEconomy(world: WorldState, data: GameData, mods: ModifierQuery): EconomyApi {
  const e = data.balance.economy;
  const r = world.resources;
  r.ironMax = Math.max(0, mods.apply(e.ironMax, 'economy.iron.max'));
  // `economy.iron.start` is not used by data yet; relics may target it
  r.iron = Math.min(r.ironMax, Math.max(0, mods.apply(e.ironStart, 'economy.iron.start')));
  r.manaMax = Math.max(0, mods.apply(e.manaMax, 'economy.mana.max'));
  r.mana = r.manaMax; // mana starts full
  r.goldCollected = 0;

  const state: EconomyState = {
    ironRate: Math.max(0, mods.apply(e.ironRate, 'economy.iron.rate')),
    manaRegen: Math.max(0, mods.apply(e.manaRegen, 'economy.mana.regen')),
    dirty: false,
  };
  states.set(world, state);

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
