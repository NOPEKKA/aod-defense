/**
 * gameplay/ — Ash, troops, heroes, enemies, bosses, spells, castle defenses, AI.
 * Owner: gameplay agent.
 *
 * PHASE 2 STUB: Ash walks, enemies walk to the castle. Every behavior / spell
 * effect / boss attack id used in data/ is listed in REGISTERED so boot-time
 * validation passes; the gameplay agent implements them in phase 3-4.
 */
import {
  SIM_DT,
  type EntityKind,
  type EntityState,
  type EventBus,
  type GameData,
  type GameplayModule,
  type ModifierQuery,
  type SimSystem,
  type SpawnApi,
  type Team,
  type WorldState,
} from '../contracts';

const REGISTERED = {
  behaviors: [
    'melee', 'ranged', 'second_row', 'charge', 'aura', 'healer', 'iron_boost',
    'prefer_ash', 'shield_front', 'flyer', 'leap_once', 'siege', 'artillery',
  ],
  spellEffects: ['line_blast', 'area_rain', 'random_boon', 'area_strike', 'portal_execute', 'self_buff', 'dash_vehicle'],
  bossAttacks: ['swoop', 'summon', 'scream', 'melee_combo'],
};

let nextId = 1;

function alloc(world: WorldState, kind: EntityKind, team: Team, defId: string, sprite: string, x: number, y: number): EntityState {
  let e = world.entities.find((x) => !x.alive);
  if (!e) {
    e = {} as EntityState;
    world.entities.push(e);
  }
  Object.assign(e, {
    id: nextId++, alive: true, kind, team, defId, sprite, x, y, prevX: x, prevY: y,
    facing: team === 'enemy' ? -1 : 1, hp: 1, maxHp: 1, armor: 0, flying: false, size: 'normal',
    anim: 'spawn', animTime: 0, statuses: [], value: 0, ttl: Infinity,
  } satisfies EntityState);
  return e;
}

function createSpawnApi(world: WorldState, data: GameData, _mods: () => ModifierQuery, bus: EventBus): SpawnApi {
  const w = data.balance.world;
  return {
    spawnEnemy(enemyId, opts) {
      const def = data.enemies.get(enemyId);
      if (!def) throw new Error(`unknown enemy ${enemyId}`);
      const y = def.flying ? w.groundY - w.flyingY.min : w.groundY;
      const e = alloc(world, 'enemy', 'enemy', def.id, def.sprite, opts?.x ?? w.enemySpawnX, y);
      e.hp = e.maxHp = def.stats.hp;
      e.armor = def.stats.armor;
      e.flying = def.flying;
      e.size = def.size;
      bus.emit('entity:spawned', { id: e.id, kind: e.kind, defId: e.defId, x: e.x, y: e.y });
      return e.id;
    },
    spawnBoss(bossId) {
      const def = data.bosses.get(bossId);
      if (!def) throw new Error(`unknown boss ${bossId}`);
      const e = alloc(world, 'boss', 'enemy', def.id, def.sprite, w.enemySpawnX, w.groundY);
      e.hp = e.maxHp = def.hp;
      e.size = def.size;
      return e.id;
    },
    hostileCount: () => world.entities.filter((e) => e.alive && (e.kind === 'enemy' || e.kind === 'boss')).length,
  };
}

function createSimSystems(): SimSystem[] {
  const ash: SimSystem = {
    id: 'ash-stub',
    order: 100,
    init(ctx) {
      const b = ctx.data.balance;
      const e = alloc(ctx.world, 'ash', 'player', 'ash', 'ash', b.world.stairsX + 120, b.world.groundY);
      e.hp = e.maxHp = ctx.services.mods.apply(b.ash.stats.hp, 'ash.hp');
      e.anim = 'idle';
      ctx.world.ashId = e.id;
      const bookHp = ctx.services.mods.apply(b.book.hp, 'castle.book.hp');
      ctx.world.book = { hp: bookHp, maxHp: bookHp };
    },
    tick(ctx, input) {
      const e = ctx.world.entities.find((x) => x.id === ctx.world.ashId);
      if (!e) return;
      const b = ctx.data.balance;
      const speed = ctx.services.mods.apply(b.ash.stats.speed, 'ash.speed');
      e.x = Math.max(b.world.ashMinX, Math.min(b.world.ashMaxX, e.x + input.move * speed * SIM_DT));
      if (input.move !== 0) e.facing = input.move;
      const anim = input.move !== 0 ? 'walk' : 'idle';
      e.animTime = anim === e.anim ? e.animTime + SIM_DT : 0;
      e.anim = anim;
    },
    dispose() {},
  };

  const walkers: SimSystem = {
    id: 'enemy-walk-stub',
    order: 300,
    init() {},
    tick(ctx) {
      const stopX = ctx.data.balance.world.castleRight;
      for (const e of ctx.world.entities) {
        if (!e.alive || e.kind !== 'enemy') continue;
        const def = ctx.data.enemies.get(e.defId);
        if (!def) continue;
        const moving = e.x > stopX;
        if (moving) e.x = Math.max(stopX, e.x - def.stats.speed * SIM_DT);
        const anim = moving ? 'walk' : 'attack';
        e.animTime = anim === e.anim ? e.animTime + SIM_DT : 0;
        e.anim = anim;
      }
    },
    dispose() {},
  };

  return [ash, walkers];
}

export const gameplay: GameplayModule = {
  createSimSystems,
  createSpawnApi,
  registeredIds: () => REGISTERED,
  validateData: () => [],
};
