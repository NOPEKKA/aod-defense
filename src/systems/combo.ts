/**
 * Kill combo (order 600, SPEC v2.6). Kills of enemies and bosses (any cause but despawn) that
 * follow each other within `economy.combo.window` seconds build a streak. Every `step` kills
 * grant `manaPerStep` mana at once; when the streak ends, floor(count / step) * goldPerStep gold
 * is paid through collectGold (so it is part of goldCollected) and combo:ended is emitted.
 * combo:ended fires for every streak, including ones that pay 0 gold; combo:changed {count:0}
 * follows it. The outcome system calls flushCombo() so a streak still running at wave end is paid too.
 */
import { SIM_DT, type SimContext, type SimSystem, type Unsubscribe, type WorldState } from '../contracts';

const contexts = new WeakMap<WorldState, SimContext>();

function endStreak(ctx: SimContext): void {
  const c = ctx.world.combo;
  const cfg = ctx.data.balance.economy.combo;
  if (c.count <= 0) return;
  const count = c.count;
  const gold = cfg ? Math.floor(count / cfg.step) * cfg.goldPerStep : 0;
  c.count = 0;
  c.timeLeft = 0;
  if (gold > 0) ctx.services.economy.collectGold(gold);
  ctx.bus.emit('combo:ended', { count, gold });
  ctx.bus.emit('combo:changed', { count: 0 });
}

/** Pays and clears a running streak (wave ended). */
export function flushCombo(world: WorldState): void {
  const ctx = contexts.get(world);
  if (ctx) endStreak(ctx);
}

export function createComboSystem(): SimSystem {
  let unsub: Unsubscribe | null = null;
  let world: WorldState | null = null;
  return {
    id: 'systems.combo',
    order: 600,
    init(ctx) {
      const cfg = ctx.data.balance.economy.combo;
      const c = ctx.world.combo;
      c.count = 0;
      c.timeLeft = 0;
      c.best = 0;
      c.window = cfg?.window ?? 0;
      world = ctx.world;
      contexts.set(world, ctx);
      if (!cfg) return;
      unsub = ctx.bus.on('entity:died', (ev) => {
        if ((ev.kind !== 'enemy' && ev.kind !== 'boss') || ev.cause === 'despawn') return;
        if (ctx.world.phase !== 'running') return;
        c.count++;
        if (c.count > c.best) c.best = c.count;
        c.timeLeft = cfg.window;
        if (c.count % cfg.step === 0 && cfg.manaPerStep > 0) ctx.services.economy.gain('mana', cfg.manaPerStep);
        ctx.bus.emit('combo:changed', { count: c.count });
      });
    },
    tick(ctx) {
      const c = ctx.world.combo;
      if (c.count <= 0 || ctx.world.phase !== 'running') return;
      c.timeLeft -= SIM_DT;
      if (c.timeLeft <= 1e-9) endStreak(ctx);
    },
    dispose() {
      unsub?.();
      unsub = null;
      if (world) contexts.delete(world);
      world = null;
    },
  };
}
