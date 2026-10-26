/**
 * Damage, healing, death, statuses and knockback. Every hit in gameplay goes
 * through dealDamage() so armor / shields / invulnerability / events stay
 * consistent.
 */
import { SIM_DT, type DamageKind, type EntityState, type StatusState } from '../contracts';
import { setAnim, type GState, type Rt } from './state';
import { BIG_HIT, BURN_TICK } from './tuning';

export function statusOf(e: EntityState, id: string): StatusState | undefined {
  const list = e.statuses;
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return undefined;
}

export function statusMag(e: EntityState, id: string): number {
  const s = statusOf(e, id);
  return s ? s.magnitude : 0;
}

export function applyStatus(st: GState, e: EntityState, id: string, duration: number, magnitude: number): void {
  if (!e.alive || e.hp <= 0 || duration <= 0) return;
  const cur = statusOf(e, id);
  if (cur) {
    cur.remaining = Math.max(cur.remaining, duration);
    cur.magnitude = Math.max(cur.magnitude, magnitude);
    return;
  }
  const s = st.statusPool.pop() ?? { id, remaining: 0, magnitude: 0 };
  s.id = id;
  s.remaining = duration;
  s.magnitude = magnitude;
  e.statuses.push(s);
  st.bus.emit('entity:status', { id: e.id, status: id, applied: true });
}

function removeStatusAt(st: GState, e: EntityState, i: number): void {
  const s = e.statuses[i];
  e.statuses.splice(i, 1);
  st.statusPool.push(s);
  st.bus.emit('entity:status', { id: e.id, status: s.id, applied: false });
}

/**
 * Apply one hit. Returns the hp actually removed.
 * @param fromX x of the projectile/shooter for shield_front, or NaN for melee/spells
 */
export function dealDamage(
  st: GState,
  slot: number,
  amount: number,
  kind: DamageKind,
  sourceId: number | null,
  armorPierce: boolean,
  bonusVsLarge: number,
  fromX: number,
  spectacle: boolean,
): number {
  const e = st.world.entities[slot];
  if (!e.alive || e.hp <= 0 || amount <= 0) return 0;
  const rt = st.rts[slot];
  if (statusOf(e, 'invuln')) {
    st.bus.emit('entity:damaged', { id: e.id, amount: 0, x: e.x, y: e.y, damageKind: kind, sourceId, blocked: true });
    return 0;
  }
  let dmg = amount;
  if (bonusVsLarge !== 1 && (e.size === 'large' || e.size === 'huge')) dmg *= bonusVsLarge;
  let blocked = false;
  if (rt.shieldBlock > 0 && fromX === fromX && (fromX - e.x) * e.facing > 0) {
    dmg *= 1 - rt.shieldBlock;
    blocked = true;
  }
  const mark = statusMag(e, 'mark');
  if (mark > 0) dmg *= 1 + mark;
  if (!armorPierce && e.armor > 0) dmg = Math.max(1, dmg - e.armor);
  dmg = Math.min(dmg, e.hp);
  e.hp -= dmg;
  st.bus.emit('entity:damaged', { id: e.id, amount: dmg, x: e.x, y: e.y, damageKind: kind, sourceId, blocked });
  if (spectacle) st.bus.emit('spectacle:hit', { x: e.x, y: e.y, big: dmg >= BIG_HIT });
  if (e.hp <= 0.0001) {
    e.hp = 0;
    kill(st, slot, sourceId, 'damage');
  }
  return dmg;
}

export function kill(st: GState, slot: number, killerId: number | null, cause: 'damage' | 'pit' | 'portal' | 'despawn'): void {
  const e = st.world.entities[slot];
  if (!e.alive) return;
  const rt = st.rts[slot];
  const wasDying = rt.corpse > 0;
  if (wasDying) return;
  e.hp = 0;
  setAnim(e, 'die');
  rt.corpse = Math.max(SIM_DT, st.data.balance.combat.corpseTime);
  rt.kbV = 0;
  rt.engaged = false;
  for (const s of e.statuses) st.statusPool.push(s);
  e.statuses.length = 0;
  // exactly one entity:died per death; systems counts kills (world.wave.enemiesKilled) from it
  st.bus.emit('entity:died', { id: e.id, kind: e.kind, defId: e.defId, x: e.x, y: e.y, killerId, cause });
  if (e.kind === 'boss') {
    const b = st.world.boss;
    if (b && b.entityId === e.id) b.hpFrac = 0;
    st.bus.emit('boss:defeated', { id: e.id, bossId: e.defId });
  }
  if (cause !== 'despawn') st.died.push(slot);
}

export function heal(st: GState, e: EntityState, amount: number): number {
  if (!e.alive || e.hp <= 0 || amount <= 0) return 0;
  const got = Math.min(e.maxHp - e.hp, amount);
  if (got <= 0) return 0;
  e.hp += got;
  st.bus.emit('entity:healed', { id: e.id, amount: got, x: e.x, y: e.y });
  return got;
}

/** Push an entity by `distance` px (decelerates with balance.combat.knockbackDecay). Bosses are immune. [เดา] */
export function knockback(st: GState, e: EntityState, rt: Rt, distance: number, dir: number): void {
  if (distance <= 0 || e.kind === 'boss' || e.size === 'huge' || e.hp <= 0) return;
  const v0 = Math.sqrt(2 * st.data.balance.combat.knockbackDecay * distance);
  if (Math.abs(rt.kbV) < v0 || Math.sign(rt.kbV) !== Math.sign(dir)) rt.kbV = dir >= 0 ? v0 : -v0;
}

/** Statuses tick down; burn deals its damage in BURN_TICK chunks, ignoring armor. */
export function tickStatuses(st: GState, slot: number): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  const list = e.statuses;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!e.alive || e.hp <= 0) return;
    const s = list[i];
    s.remaining -= SIM_DT;
    if (s.id === 'burn') {
      rt.burnAcc += SIM_DT;
      const ending = s.remaining <= 0;
      if (rt.burnAcc >= BURN_TICK - 1e-9 || (ending && rt.burnAcc > 0.01)) {
        const amount = s.magnitude * rt.burnAcc;
        rt.burnAcc = 0;
        dealDamage(st, slot, amount, 'fire', null, true, 1, NaN, false);
        if (!e.alive || e.hp <= 0) return;
      }
    }
    if (s.remaining <= 0 && i < list.length && list[i] === s) {
      if (s.id === 'burn') rt.burnAcc = 0;
      removeStatusAt(st, e, i);
    }
  }
}
