/**
 * Summon slots (order 100): built from ctx.wave.units, cooldowns tick down,
 * {type:'summon'} validates and spawns the unit (+escorts) at the stairs.
 */
import { SIM_DT, type SimContext, type UnitDef } from '../contracts';
import { spawnUnitAt } from './pool';
import type { GState } from './state';

/** escorts line up this far apart behind the summoned unit (px). [เดา] formation spacing sorts them out */
const ESCORT_STEP = 18;

export function summonInit(ctx: SimContext): void {
  const mods = ctx.services.mods;
  ctx.world.summonSlots.length = 0;
  for (const unitId of ctx.wave.units) {
    const def = ctx.data.units.get(unitId);
    if (!def) continue;
    ctx.world.summonSlots.push({
      unitId,
      // unit.<id>.cost / unit.<id>.cooldown are not in the documented key list; unknown keys are allowed and default to base
      ironCost: Math.max(0, Math.round(mods.apply(def.ironCost, `unit.${unitId}.cost`))),
      cooldownLeft: 0,
      cooldownTotal: Math.max(0, mods.apply(def.cooldown, `unit.${unitId}.cooldown`)),
      available: true,
    });
  }
}

function heroAlive(st: GState, unitId: string): boolean {
  const ents = st.world.entities;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.alive && e.hp > 0 && e.kind === 'hero' && e.defId === unitId) return true;
  }
  return false;
}

export function allyCount(st: GState): number {
  const ents = st.world.entities;
  let n = 0;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.alive && e.hp > 0 && e.kind === 'ally') n++;
  }
  return n;
}

export function summonTick(st: GState, ctx: SimContext): void {
  const cap = ctx.data.balance.limits.maxAllies;
  const allies = allyCount(st);
  for (const slot of ctx.world.summonSlots) {
    slot.cooldownLeft = Math.max(0, slot.cooldownLeft - SIM_DT);
    const def = ctx.data.units.get(slot.unitId);
    slot.available = !!def && (def.kind === 'hero' ? !heroAlive(st, def.id) : allies < cap);
  }
}

export function summonCommand(st: GState, ctx: SimContext, index: number): void {
  const slot = ctx.world.summonSlots[index];
  const def = slot ? ctx.data.units.get(slot.unitId) : undefined;
  const deny = (reason: 'iron' | 'cooldown' | 'hero_alive' | 'cap' | 'empty') => st.bus.emit('summon:denied', { slot: index, reason });
  if (!slot || !def) return deny('empty');
  if (slot.cooldownLeft > 0) return deny('cooldown');
  if (def.kind === 'hero' && heroAlive(st, def.id)) return deny('hero_alive');
  const cap = ctx.data.balance.limits.maxAllies;
  const allies = allyCount(st);
  // heroes do not count toward the cap (SPEC 3.3); troops need room for themselves
  if (def.kind !== 'hero' && allies >= cap) return deny('cap');
  if (!ctx.services.economy.spend('iron', slot.ironCost)) return deny('iron');

  const x = ctx.data.balance.world.stairsX;
  const ids: number[] = [];
  const first = spawnUnitAt(st, def, x);
  ids.push(st.world.entities[first].id);
  let room = cap - allies - (def.kind === 'hero' ? 0 : 1);
  let back = 1;
  for (const esc of def.escorts) {
    const edef: UnitDef | undefined = ctx.data.units.get(esc.unitId);
    if (!edef) continue;
    for (let i = 0; i < esc.count; i++) {
      if (edef.kind !== 'hero' && room <= 0) break;
      const s = spawnUnitAt(st, edef, x - ESCORT_STEP * back++);
      ids.push(st.world.entities[s].id);
      if (edef.kind !== 'hero') room--;
    }
  }
  slot.cooldownLeft = slot.cooldownTotal;
  st.bus.emit('unit:summoned', { slot: index, unitId: def.id, entityIds: ids });
  st.bus.emit('spectacle:action', { action: 'summon', x, y: ctx.data.balance.world.groundY });
}
