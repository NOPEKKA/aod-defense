/**
 * Order 550: drops for everything that died this tick, pickup expiry, Ash
 * collecting pickups. Coins must exist before systems' outcome check (800)
 * runs on the same tick, so drops never wait for cleanup.
 *
 *   gold  value = ceil(threat * economy.goldPerThreat), split into coins of at most T.coinMaxValue
 *         (bosses drop no coins: systems pays boss drop.gold in the outcome bonus)
 *   mana  balance.drops.manaOrb.chance -> economy.gain('mana', amount)
 *   food  balance.drops.food.chance    -> heals Ash by healFrac * Ash max hp
 * Pickup lifetime: economy.goldLifetime via 'economy.gold.lifetime'.
 * Pickup radius:   ash.pickupRadius via 'ash.magnet'.
 */
import { SIM_DT, type SimContext } from '../contracts';
import { heal } from './damage';
import { release, spawnPickup, type PickupType } from './pool';
import { byId, setAnim, type GState } from './state';

export function dropsTick(st: GState, ctx: SimContext): void {
  const ents = st.world.entities;
  const b = ctx.data.balance;
  const lifetime = ctx.services.mods.apply(b.economy.goldLifetime, 'economy.gold.lifetime');
  const T = st.T;

  // 1. drops from this tick's deaths (slot order of death = deterministic)
  for (let i = 0; i < st.died.length; i++) {
    const slot = st.died[i];
    const e = ents[slot];
    const rt = st.rts[slot];
    if (e.kind !== 'enemy' || !rt.enemy) continue;
    const gold = Math.ceil(rt.enemy.threat * b.economy.goldPerThreat);
    if (gold > 0) {
      const coins = Math.max(1, Math.min(T.coinMaxCount, Math.ceil(gold / T.coinMaxValue)));
      const base = Math.floor(gold / coins);
      let extra = gold - base * coins;
      for (let c = 0; c < coins; c++) {
        const v = base + (extra > 0 ? 1 : 0);
        if (extra > 0) extra--;
        const dx = coins === 1 ? 0 : ctx.rng.range(-T.dropScatter, T.dropScatter);
        spawnPickup(st, 'gold', e.x + dx, e.y, v, lifetime);
      }
    }
    // silver (summon currency): a few coins that fly to the smith panel on their own
    const silver = Math.ceil(rt.enemy.threat * (b.economy.silverPerThreat ?? 0));
    if (silver > 0) {
      const coins = Math.max(1, Math.min(T.silverMaxCount, Math.ceil(silver / T.coinMaxValue)));
      const base = Math.floor(silver / coins);
      let extra = silver - base * coins;
      for (let c = 0; c < coins; c++) {
        const v = base + (extra > 0 ? 1 : 0);
        if (extra > 0) extra--;
        spawnPickup(st, 'silver', e.x + ctx.rng.range(-T.dropScatter, T.dropScatter), e.y, v, lifetime);
      }
    }
    if (ctx.rng.chance(b.drops.manaOrb.chance)) {
      spawnPickup(st, 'mana', e.x + ctx.rng.range(-T.dropScatter, T.dropScatter), e.y, b.drops.manaOrb.amount, lifetime);
    }
    if (ctx.rng.chance(b.drops.food.chance)) {
      const ash = byId(st, ctx.world.ashId);
      const amount = Math.round(b.drops.food.healFrac * (ash ? ash.maxHp : b.ash.stats.hp));
      spawnPickup(st, 'food', e.x + ctx.rng.range(-T.dropScatter, T.dropScatter), e.y, amount, lifetime);
    }
  }
  st.died.length = 0;

  // 2. expiry + collection
  const ash = byId(st, ctx.world.ashId);
  const canCollect = !!ash && ash.hp > 0;
  const radius = canCollect ? ctx.services.mods.apply(b.ash.pickupRadius, 'ash.magnet') : 0;
  for (let s = 0; s < ents.length; s++) {
    const p = ents[s];
    if (!p.alive || p.kind !== 'pickup') continue;
    const type = p.defId as PickupType;
    // silver needs no walking: it is banked a moment after it lands
    const autoSilver = type === 'silver' && lifetime - p.ttl >= T.silverCollectDelay;
    if (autoSilver || (canCollect && type !== 'silver' && Math.abs(p.x - ash!.x) <= radius)) {
      if (type === 'gold') ctx.services.economy.collectGold(p.value);
      else if (type === 'silver') ctx.services.economy.gain('iron', p.value);
      else if (type === 'mana') ctx.services.economy.gain('mana', p.value);
      else if (type === 'food') heal(st, ash!, p.value);
      st.bus.emit('pickup:collected', { id: p.id, pickup: type, x: p.x, y: p.y, value: p.value });
      release(st, s);
      continue;
    }
    p.ttl -= SIM_DT;
    if (p.anim === 'spawn' && p.animTime > 0.3) setAnim(p, 'idle');
    if (p.ttl <= 0) release(st, s);
  }
}

/** Order 900: corpses -> alive=false after corpseTime; effects expire. */
export function cleanupTick(st: GState): void {
  const ents = st.world.entities;
  for (let s = 0; s < ents.length; s++) {
    const e = ents[s];
    if (!e.alive) continue;
    const rt = st.rts[s];
    if (rt.corpse > 0) {
      rt.corpse -= SIM_DT;
      if (rt.corpse <= 1e-9) release(st, s);
      continue;
    }
    if (e.kind === 'effect') {
      e.ttl -= SIM_DT;
      if (e.ttl <= 0) release(st, s);
    }
  }
}
