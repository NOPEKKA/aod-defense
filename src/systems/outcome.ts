/**
 * Outcome check (order 800). Ends the wave exactly once:
 *   lost: Ash missing / hp <= 0 ('ash_died') or book hp <= 0 ('book_destroyed')
 *   won:  every scheduled spawn issued and no live hostile left
 * Sets world.phase + world.outcome, then emits `wave:ended`.
 */
import type { GameData, ProfileState, SimContext, SimSystem, WaveOutcome } from '../contracts';
import { findEntity } from '../core/world';
import { flushCombo } from './combo';
import type { WaveRuntime } from './director';

/** Units/spells/upgrades that become usable by clearing `wave` for the first time. */
function newlyUnlocked(data: GameData, profile: Readonly<ProfileState>, wave: number): string[] {
  // usable once highestWave + 1 >= unlockWave: before = highestWave + 1, after = wave + 1
  const before = profile.highestWave + 1;
  const after = wave + 1;
  const out: string[] = [];
  const add = (id: string, unlockWave: number, rule?: string) => {
    if (!rule && unlockWave > before && unlockWave <= after) out.push(id);
  };
  for (const u of data.units.values()) add(u.id, u.unlockWave, u.unlockRule);
  for (const s of data.spells.values()) if (!s.tree) add(s.id, s.unlockWave, s.unlockRule);
  for (const up of data.upgrades.values()) add(up.id, up.unlockWave);
  return out;
}

function goldOnField(ctx: SimContext): number {
  let sum = 0;
  for (const e of ctx.world.entities) if (e.alive && e.kind === 'pickup' && e.defId === 'gold') sum += e.value;
  return sum;
}

export function buildOutcome(ctx: SimContext, rt: WaveRuntime, result: 'won' | 'lost', reason?: WaveOutcome['reason']): WaveOutcome {
  const { world, data, profile } = ctx;
  const econ = data.balance.economy;
  const wave = ctx.wave.wave;
  const endless = ctx.wave.endless;
  const goldCollected = Math.floor(world.resources.goldCollected);

  if (result === 'lost') {
    return {
      result,
      reason,
      wave,
      endless,
      goldCollected,
      goldUncollectedKept: 0,
      goldBonus: 0,
      goldTotal: Math.floor(goldCollected * econ.loseGoldKeep),
      stars: 0,
      firstClear: false,
      unlocks: [],
    };
  }

  const firstClear = !endless && wave > profile.highestWave;
  const bossId = rt.plan?.bossId ?? null;
  const boss = bossId ? data.bosses.get(bossId) : undefined;
  const firstBossKill = !!boss && !profile.bossesDefeated.includes(boss.id);

  const goldUncollectedKept = Math.floor(goldOnField(ctx) * econ.uncollectedGoldKeep);
  // SPEC 3.10 / 6.4: first clear x2; a boss beaten again pays x1.5 instead of its relic
  const mult = firstClear ? econ.firstClearMultiplier : boss ? econ.bossReplayGoldMultiplier : 1;
  // boss drop.gold is paid here (bosses have no threat, so gameplay drops no coins for them)
  const goldBonus = Math.round((econ.waveBonus.base + econ.waveBonus.perWave * wave) * mult + (boss?.drop.gold ?? 0));

  const bookFrac = world.book.maxHp > 0 ? world.book.hp / world.book.maxHp : 0;
  const eps = 1e-9;
  const s = data.balance.stars;
  const stars: WaveOutcome['stars'] = bookFrac >= s.threeStarBookFrac - eps ? 3 : bookFrac >= s.twoStarBookFrac - eps ? 2 : 1;

  const unlocks = firstClear ? newlyUnlocked(data, profile, wave) : [];
  let relicDropped: string | undefined;
  if (firstBossKill && boss) {
    if (boss.drop.relicId && !profile.relicsOwned.includes(boss.drop.relicId)) {
      relicDropped = boss.drop.relicId;
      unlocks.push(relicDropped);
    }
    const unit = boss.drop.unlockUnit;
    if (unit && !profile.unlockedUnits.includes(unit) && !unlocks.includes(unit)) unlocks.push(unit);
  }

  const out: WaveOutcome = {
    result,
    wave,
    endless,
    goldCollected,
    goldUncollectedKept,
    goldBonus,
    goldTotal: goldCollected + goldUncollectedKept + goldBonus,
    stars,
    firstClear,
    unlocks,
  };
  if (relicDropped) out.relicDropped = relicDropped;
  return out;
}

export function createOutcomeSystem(rt: WaveRuntime): SimSystem {
  let done = false;
  return {
    id: 'systems.outcome',
    order: 800,
    init() {
      done = false;
    },
    tick(ctx) {
      const world = ctx.world;
      if (done || world.outcome) return;
      let result: 'won' | 'lost' | null = null;
      let reason: WaveOutcome['reason'];
      const ash = findEntity(world, world.ashId);
      if (!ash || ash.hp <= 0) {
        result = 'lost';
        reason = 'ash_died';
      } else if (world.book.hp <= 0) {
        result = 'lost';
        reason = 'book_destroyed';
      } else if (ctx.services.waves.allSpawned() && ctx.services.spawn.hostileCount() === 0) {
        result = 'won';
      }
      if (!result) return;
      done = true;
      flushCombo(world); // a running streak pays its bonus before gold is counted
      const outcome = buildOutcome(ctx, rt, result, reason);
      world.phase = result;
      world.outcome = outcome;
      ctx.bus.emit('wave:ended', outcome);
    },
    dispose() {},
  };
}
