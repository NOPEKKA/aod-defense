/**
 * systems/ — economy (gold/iron/mana), progression, upgrades, wave director, save.
 * Owner: systems agent.
 *
 * PHASE 2 STUB: just enough to boot and show the loop. The systems agent
 * replaces each piece in phase 3 (see docs/ARCHITECTURE.md "systems").
 */
import {
  SAVE_SCHEMA_VERSION,
  SIM_DT,
  type EconomyApi,
  type EventBus,
  type GameData,
  type MetaServices,
  type ModifierQuery,
  type ProfileState,
  type SimSystem,
  type SystemsModule,
  type WaveApi,
  type WorldState,
} from '../contracts';

const SAVE_KEY = 'aodd.save';

function defaults(data: GameData): ProfileState {
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
    settings: {
      lang: 'th',
      fpsCap: 0,
      fxQuality: 'high',
      showFps: false,
      sfxVolume: 0.8,
      musicVolume: 0.6,
      haptics: true,
      damageNumbers: true,
    },
  };
}

function modifiersFrom(data: GameData, profile: ProfileState): ModifierQuery {
  const table = new Map<string, { add: number; mul: number }>();
  const push = (stat: string, op: 'add' | 'mul', value: number) => {
    const m = table.get(stat) ?? { add: 0, mul: 0 };
    m[op] += value;
    table.set(stat, m);
  };
  for (const [id, level] of Object.entries(profile.upgrades)) {
    const def = data.upgrades.get(id);
    if (!def) continue;
    for (const m of def.perLevel) push(m.stat, m.op, m.value * level);
  }
  const get = (stat: string) => {
    const exact = table.get(stat) ?? { add: 0, mul: 0 };
    // unit.<id>.hp also picks up unit.*.hp
    const parts = stat.split('.');
    if (parts.length === 3) {
      const wild = table.get(`${parts[0]}.*.${parts[2]}`);
      if (wild) return { add: exact.add + wild.add, mul: exact.mul + wild.mul };
    }
    return exact;
  };
  return { get, apply: (base, stat) => { const m = get(stat); return (base + m.add) * (1 + m.mul); } };
}

function createMeta(data: GameData, bus: EventBus): MetaServices {
  const unlockedByWave = (profile: ProfileState, wave: number) => profile.highestWave + 1 >= wave;
  return {
    save: {
      defaults: () => defaults(data),
      load() {
        try {
          const raw = localStorage.getItem(SAVE_KEY);
          if (raw) return { ...defaults(data), ...(JSON.parse(raw) as ProfileState) };
        } catch (err) {
          bus.emit('save:recovered', { from: 'defaults', error: String(err) });
        }
        return defaults(data);
      },
      save(profile) {
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
          bus.emit('save:written', { ok: true });
        } catch {
          bus.emit('save:written', { ok: false });
        }
      },
      exportJson: (profile) => JSON.stringify(profile, null, 2),
      importJson(json) {
        try {
          return { ok: true, profile: { ...defaults(data), ...(JSON.parse(json) as ProfileState) } };
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      },
    },
    progression: {
      isUnitUnlocked: (p, id) => {
        const u = data.units.get(id);
        return !!u && (p.unlockedUnits.includes(id) || (!u.unlockRule && unlockedByWave(p, u.unlockWave)));
      },
      isSpellUnlocked: (p, id) => {
        const s = data.spells.get(id);
        return !!s && !s.unlockRule && unlockedByWave(p, s.unlockWave);
      },
      maxPlayableWave: (p) => Math.min(data.balance.campaignWaves, p.highestWave + 1),
      applyOutcome(p, o) {
        p.gold += o.goldTotal;
        if (o.result === 'won' && !o.endless) p.highestWave = Math.max(p.highestWave, o.wave);
      },
      buildModifiers: (p) => modifiersFrom(data, p),
    },
    upgrades: {
      level: (p, id) => p.upgrades[id] ?? 0,
      cost(p, id) {
        const def = data.upgrades.get(id);
        const lvl = p.upgrades[id] ?? 0;
        if (!def || lvl >= def.maxLevel) return null;
        return Math.round(def.baseCost * Math.pow(def.costGrowth, lvl));
      },
      canBuy(p, id) {
        const c = this.cost(p, id);
        return c !== null && p.gold >= c;
      },
      buy(p, id) {
        const c = this.cost(p, id);
        if (c === null || p.gold < c) return false;
        p.gold -= c;
        p.upgrades[id] = (p.upgrades[id] ?? 0) + 1;
        return true;
      },
      tierCost: () => null,
      buyTier: () => false,
      respecBranch: () => false,
    },
  };
}

function createEconomy(world: WorldState): EconomyApi {
  const r = world.resources;
  return {
    canAfford: (kind, amount) => r[kind] >= amount,
    spend(kind, amount) {
      if (r[kind] < amount) return false;
      r[kind] -= amount;
      return true;
    },
    gain(kind, amount) {
      if (kind === 'iron') r.iron = Math.min(r.ironMax, r.iron + amount);
      else r.mana = Math.min(r.manaMax, r.mana + amount);
    },
    collectGold(amount) {
      r.goldCollected += amount;
    },
  };
}

// shared between the stub wave director and its WaveApi for the current wave
let waveState = { allSpawned: false };

function createSimSystems(): SimSystem[] {
  waveState = { allSpawned: false };
  const state = waveState;
  let schedule: { at: number; enemy: string }[] = [];
  let next = 0;

  const waves: SimSystem = {
    id: 'waves-stub',
    order: 200,
    init(ctx) {
      const level = ctx.data.levels[ctx.wave.wave - 1];
      schedule = [];
      for (const g of level?.groups ?? []) {
        for (let i = 0; i < g.count; i++) schedule.push({ at: g.startAt + i * g.interval, enemy: g.enemy });
      }
      schedule.sort((a, b) => a.at - b.at);
      next = 0;
      ctx.world.wave.enemiesTotal = schedule.length;
      ctx.world.phase = 'running';
      ctx.bus.emit('wave:started', { wave: ctx.wave.wave, endless: ctx.wave.endless, kind: ctx.world.wave.kind });
    },
    tick(ctx) {
      while (next < schedule.length && schedule[next].at <= ctx.world.time) {
        ctx.services.spawn.spawnEnemy(schedule[next].enemy);
        ctx.world.wave.enemiesSpawned++;
        next++;
      }
      state.allSpawned = next >= schedule.length;
    },
    dispose() {},
  };

  const economy: SimSystem = {
    id: 'economy-stub',
    order: 600,
    init(ctx) {
      const e = ctx.data.balance.economy;
      const m = ctx.services.mods;
      const r = ctx.world.resources;
      r.ironMax = m.apply(e.ironMax, 'economy.iron.max');
      r.iron = Math.min(r.ironMax, e.ironStart);
      r.manaMax = m.apply(e.manaMax, 'economy.mana.max');
      r.mana = r.manaMax;
    },
    tick(ctx) {
      const e = ctx.data.balance.economy;
      const m = ctx.services.mods;
      const r = ctx.world.resources;
      r.iron = Math.min(r.ironMax, r.iron + m.apply(e.ironRate, 'economy.iron.rate') * SIM_DT);
      r.mana = Math.min(r.manaMax, r.mana + m.apply(e.manaRegen, 'economy.mana.regen') * SIM_DT);
    },
    dispose() {},
  };

  return [waves, economy];
}

function createWaveApi(): WaveApi {
  const state = waveState;
  return { allSpawned: () => state.allSpawned };
}

export const systems: SystemsModule = {
  createSimSystems,
  createEconomy: (world) => createEconomy(world),
  createWaveApi,
  createMeta,
};
