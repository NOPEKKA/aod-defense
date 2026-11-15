/**
 * Blacksmith upgrade command (order 150, SPEC v2.4). `{type:'smith'}` spends iron to raise the
 * level; the level table is balance.economy.smith.levels. Rate, cap and world.smith are kept by
 * economy.ts (applySmithLevel); this system only validates and applies the command.
 */
import type { SimSystem } from '../contracts';
import { applySmithLevel, economyStateOf } from './economy';

export function createSmithSystem(): SimSystem {
  return {
    id: 'systems.smith',
    order: 150,
    init() {},
    tick(ctx, input) {
      const world = ctx.world;
      if (world.phase !== 'running') return;
      const st = economyStateOf(world);
      if (!st) return;
      for (const cmd of input.commands) {
        if (cmd.type !== 'smith') continue;
        const sm = world.smith;
        if (sm.level >= sm.maxLevel) {
          ctx.bus.emit('smith:denied', { reason: 'max' });
          continue;
        }
        if (!ctx.services.economy.spend('iron', sm.upgradeCost)) {
          ctx.bus.emit('smith:denied', { reason: 'iron' });
          continue;
        }
        st.smithLevel = sm.level + 1;
        applySmithLevel(world, st);
        ctx.bus.emit('smith:upgraded', { level: sm.level });
      }
    },
    dispose() {},
  };
}
