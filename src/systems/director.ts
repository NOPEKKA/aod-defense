/**
 * Wave director (order 200): turns the planner's schedule into spawns, keeps at most
 * balance.limits.maxEnemies hostiles on the field (the rest wait in order), and
 * tracks spawned / killed counts for the HUD.
 *
 * createSimSystems() opens a fresh WaveRuntime; createWaveApi() (called right after,
 * for the same wave) and the outcome system read it. Nothing survives into the next wave.
 */
import type { SimSystem, Unsubscribe, WaveApi } from '../contracts';
import { createPlanner, type WavePlan } from './planner';

export interface WaveRuntime {
  plan: WavePlan | null;
  allSpawned: boolean;
}

let current: WaveRuntime = { plan: null, allSpawned: false };

export function openWaveRuntime(): WaveRuntime {
  current = { plan: null, allSpawned: false };
  return current;
}

export function createWaveApi(): WaveApi {
  const rt = current;
  return { allSpawned: () => rt.allSpawned };
}

const BOSS = '';

export function createDirector(rt: WaveRuntime): SimSystem {
  // flattened schedule, sorted by time; enemy '' = the boss
  let times: number[] = [];
  let enemies: string[] = [];
  let next = 0;
  let bossId: string | null = null;
  const mine = new Set<number>();
  let unsub: Unsubscribe | null = null;

  return {
    id: 'systems.waves',
    order: 200,
    init(ctx) {
      const plan = createPlanner(ctx.data).plan(ctx.wave.wave, ctx.wave.endless);
      rt.plan = plan;
      bossId = plan.bossId;

      const entries: { t: number; enemy: string; seq: number }[] = [];
      for (const g of plan.groups) {
        for (let i = 0; i < g.count; i++) entries.push({ t: g.startAt + i * g.interval, enemy: g.enemy, seq: entries.length });
      }
      if (bossId) entries.push({ t: plan.bossAt, enemy: BOSS, seq: entries.length });
      entries.sort((a, b) => a.t - b.t || a.seq - b.seq);
      times = entries.map((e) => e.t);
      enemies = entries.map((e) => e.enemy);
      next = 0;
      mine.clear();
      rt.allSpawned = entries.length === 0;

      const w = ctx.world.wave;
      w.kind = bossId ? 'boss' : 'normal';
      w.enemiesTotal = entries.length;
      w.enemiesSpawned = 0;
      w.enemiesKilled = 0;

      unsub = ctx.bus.on('entity:died', (ev) => {
        if ((ev.kind === 'enemy' || ev.kind === 'boss') && mine.delete(ev.id)) ctx.world.wave.enemiesKilled++;
      });

      ctx.world.phase = 'running';
      ctx.bus.emit('wave:started', { wave: ctx.wave.wave, endless: ctx.wave.endless, kind: w.kind });
    },
    tick(ctx) {
      if (rt.allSpawned || ctx.world.phase !== 'running') return;
      const now = ctx.world.time;
      if (times[next] > now) return;
      const spawn = ctx.services.spawn;
      const cap = ctx.data.balance.limits.maxEnemies;
      let live = spawn.hostileCount();
      while (next < times.length && times[next] <= now) {
        const enemy = enemies[next];
        let id: number;
        if (enemy === BOSS) {
          id = spawn.spawnBoss(bossId as string); // the boss never waits for the cap
        } else {
          if (live >= cap) break; // queue: retried every tick, order kept
          id = spawn.spawnEnemy(enemy);
        }
        live++;
        mine.add(id);
        ctx.world.wave.enemiesSpawned++;
        next++;
      }
      rt.allSpawned = next >= times.length;
    },
    dispose() {
      unsub?.();
      unsub = null;
      mine.clear();
    },
  };
}
