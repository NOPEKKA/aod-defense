/**
 * systems/ — economy (gold/iron/mana), progression, upgrades, wave director, outcome, save.
 * Owner: systems agent.
 *
 * Per wave (core/SimRunner): createSimSystems() -> createEconomy() -> createWaveApi(),
 * all for the same wave. createSimSystems() opens a fresh WaveRuntime that the director,
 * the outcome check and the WaveApi share; nothing leaks into the next wave.
 *
 *   order 200  systems.waves    planner schedule -> spawns, enemy cap queue, kill count
 *   order 600  systems.economy  iron / mana regen, resource:changed
 *   order 800  systems.outcome  won / lost -> world.outcome + wave:ended (once)
 */
import type { MetaServices, SimSystem, SystemsModule } from '../contracts';
import { createDirector, createWaveApi, openWaveRuntime } from './director';
import { createEconomy, createRegenSystem } from './economy';
import { createOutcomeSystem } from './outcome';
import { createPlanner } from './planner';
import { createProgression } from './progression';
import { createSaveService } from './save';
import { createUpgrades } from './upgrades';

function createSimSystems(): SimSystem[] {
  const rt = openWaveRuntime();
  return [createDirector(rt), createRegenSystem(), createOutcomeSystem(rt)];
}

export const systems: SystemsModule = {
  createSimSystems,
  createEconomy,
  createWaveApi,
  createMeta(data, bus): MetaServices {
    const waves = createPlanner(data);
    return {
      save: createSaveService(data, bus),
      progression: createProgression(data, waves),
      upgrades: createUpgrades(data),
      waves,
    };
  },
};
