/**
 * gameplay/ — Ash, troops, heroes, enemies, bosses, spells, castle defenses, AI.
 * Owner: gameplay agent.
 *
 * Sim systems (docs/ARCHITECTURE.md §5):
 *   100 gp-input    Ash walk/facing/dodge, summon slots + commands, spell slots + cast commands
 *   300 gp-ai       knockback/leaps, targeting, movement, formation, boss movement
 *   400 gp-combat   statuses (burn), projectiles, Ash/unit/enemy attacks, healers, book damage
 *   500 gp-effects  spell effects, boss attack loops + minions, castle defenses, iron_boost
 *   550 gp-drops    drops for this tick's deaths, pickup expiry, Ash collects pickups
 *   900 gp-cleanup  corpses (corpseTime) and effects -> alive=false
 *
 * Files: state.ts (per-wave state, Rt), pool.ts (entity pool + spawners),
 * registry.ts (registered ids + validateData), tuning.ts ([เดา] numbers with
 * no schema field yet), damage.ts, targeting.ts, ash.ts, summon.ts, ai.ts,
 * combat.ts, spells.ts, bosses.ts, castle.ts, drops.ts.
 */
import { SIM_DT, type GameplayModule, type SimContext, type SimSystem, type SpawnApi } from '../contracts';
import { aiTick } from './ai';
import { ashInit, ashInput, dodgeCommand } from './ash';
import { spawnBoss, bossesTick } from './bosses';
import { castleInit, castleTick } from './castle';
import { combatTick } from './combat';
import { cleanupTick, dropsTick } from './drops';
import { spawnEnemyAt } from './pool';
import { registeredIds, validateData } from './registry';
import { castCommand, effectsTick, spellsCooldownTick, spellsInit } from './spells';
import { getState, refreshLists, type GState } from './state';
import { summonCommand, summonInit, summonTick } from './summon';

const createSpawnApi: GameplayModule['createSpawnApi'] = (world, data, mods, bus): SpawnApi => {
  const st = getState(world, data, bus, mods);
  return {
    spawnEnemy(enemyId, opts) {
      const def = data.enemies.get(enemyId);
      if (!def) throw new Error(`gameplay: unknown enemy "${enemyId}"`);
      const x = opts?.x ?? data.balance.world.enemySpawnX;
      const slot = spawnEnemyAt(st, def, x, true);
      return world.entities[slot].id;
    },
    spawnBoss(bossId) {
      const def = data.bosses.get(bossId);
      if (!def) throw new Error(`gameplay: unknown boss "${bossId}"`);
      const slot = spawnBoss(st, def, true);
      return world.entities[slot].id;
    },
    hostileCount() {
      let n = 0;
      const ents = world.entities;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e.alive && e.hp > 0 && (e.kind === 'enemy' || e.kind === 'boss')) n++;
      }
      return n;
    },
  };
};

function stateFor(ctx: SimContext): GState {
  const st = getState(ctx.world, ctx.data, ctx.bus, () => ctx.services.mods);
  st.ctx = ctx;
  return st;
}

function createSimSystems(): SimSystem[] {
  let st: GState | null = null;

  const input: SimSystem = {
    id: 'gp-input',
    order: 100,
    init(ctx) {
      st = stateFor(ctx);
      st.died.length = 0;
      st.minions.length = 0;
      ctx.world.telegraphs.length = 0;
      ashInit(st, ctx);
      summonInit(ctx);
      spellsInit(st, ctx);
      castleInit(st, ctx);
    },
    tick(ctx, frame) {
      const s = st!;
      const ents = ctx.world.entities;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (!e.alive) continue;
        e.animTime += SIM_DT;
        const rt = s.rts[i];
        if (rt.animHold > 0) rt.animHold = Math.max(0, rt.animHold - SIM_DT);
      }
      refreshLists(s);
      summonTick(s, ctx);
      spellsCooldownTick(ctx);
      for (const cmd of frame.commands) {
        if (cmd.type === 'summon') summonCommand(s, ctx, cmd.slot);
        else if (cmd.type === 'cast') castCommand(s, ctx, cmd);
        else if (cmd.type === 'dodge') dodgeCommand(s, ctx);
      }
      ashInput(s, ctx, frame);
    },
    dispose() {
      st = null;
    },
  };

  const ai: SimSystem = {
    id: 'gp-ai',
    order: 300,
    init() {},
    tick() {
      refreshLists(st!);
      aiTick(st!);
    },
    dispose() {},
  };

  const combat: SimSystem = {
    id: 'gp-combat',
    order: 400,
    init() {},
    tick() {
      combatTick(st!);
    },
    dispose() {},
  };

  const effects: SimSystem = {
    id: 'gp-effects',
    order: 500,
    init() {},
    tick(ctx) {
      const s = st!;
      refreshLists(s);
      effectsTick(s, ctx);
      bossesTick(s, ctx);
      castleTick(s, ctx);
      // iron_boost (Henry): extra smithy output while alive
      const ents = ctx.world.entities;
      let boost = 0;
      for (let i = 0; i < s.players.length; i++) {
        const slot = s.players[i];
        if (ents[slot].hp > 0) boost += s.rts[slot].ironBoost;
      }
      if (boost > 0) {
        const rate = ctx.services.mods.apply(ctx.data.balance.economy.ironRate, 'economy.iron.rate');
        ctx.services.economy.gain('iron', rate * boost * SIM_DT);
      }
    },
    dispose() {},
  };

  const drops: SimSystem = {
    id: 'gp-drops',
    order: 550,
    init() {},
    tick(ctx) {
      dropsTick(st!, ctx);
    },
    dispose() {},
  };

  const cleanup: SimSystem = {
    id: 'gp-cleanup',
    order: 900,
    init() {},
    tick() {
      cleanupTick(st!);
    },
    dispose() {},
  };

  return [input, ai, combat, effects, drops, cleanup];
}

export const gameplay: GameplayModule = {
  createSimSystems,
  createSpawnApi,
  registeredIds,
  validateData,
};
