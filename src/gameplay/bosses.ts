/**
 * Bosses: spawn (SpawnApi.spawnBoss), movement (order 300, from ai.ts) and the
 * attack loop (order 500). Each phase loops its steps:
 *   approach -> telegraph (world.telegraphs + boss:telegraph) -> act -> recover -> next step
 * Phase changes at hp fraction <= phase.untilHpFrac: invulnerable for
 * def.phaseTransition, boss:phase, the new phase's minion groups are scheduled.
 *
 * Registered attacks: swoop, summon, scream, melee_combo (see registry.ts).
 */
import { SIM_DT, type BossDef, type BossStep, type SimContext, type Telegraph } from '../contracts';
import { damageBook } from './combat';
import { applyStatus, dealDamage, statusOf } from './damage';
import { spawnBossAt, spawnEnemyAt } from './pool';
import { NONE, setAnim, type GState, type Rt } from './state';
import { nearestPlayer } from './targeting';
import { BOSS_COMBO_GAP, BOSS_HOVER_AHEAD, BOSS_MINION_SPREAD, BOSS_SPEED, BOSS_SWOOP_TIME, REACH_MARGIN } from './tuning';

const APPROACH = 0;
const TELEGRAPH = 1;
const ACT = 2;
const RECOVER = 3;
const TRANSITION = 4;

export function spawnBoss(st: GState, def: BossDef, scheduled: boolean): number {
  const w = st.data.balance.world;
  const slot = spawnBossAt(st, def, w.enemySpawnX, scheduled);
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  rt.bPhase = 0;
  rt.bStep = 0;
  rt.bState = APPROACH;
  rt.bTimer = 0;
  rt.bTelegraph = NONE;
  e.anim = 'walk';
  st.world.boss = { entityId: e.id, bossId: def.id, phase: 1, phaseCount: def.phases.length, hpFrac: 1, nameKey: def.nameKey };
  st.bus.emit('boss:spawned', { id: e.id, bossId: def.id });
  st.bus.emit('spectacle:entrance', { what: def.id, x: e.x, y: e.y });
  scheduleMinions(st, def, 0, e.x);
  return slot;
}

function scheduleMinions(st: GState, def: BossDef, phase: number, x: number): void {
  const now = st.world.time;
  for (const g of def.phases[phase].minions) {
    for (let i = 0; i < g.count; i++) st.minions.push({ at: now + g.startAt + i * g.interval, enemy: g.enemy, x });
  }
}

function step(rt: Rt): BossStep {
  const ph = rt.boss!.phases[rt.bPhase];
  return ph.loop[rt.bStep % ph.loop.length];
}

function num(s: BossStep, k: string, d: number): number {
  const v = s.params[k];
  return typeof v === 'number' ? v : d;
}

/** x of the frontmost live player body (max x), or the book */
function playerFront(st: GState): number {
  let x = st.data.balance.world.bookX;
  const ents = st.world.entities;
  for (let i = 0; i < st.players.length; i++) {
    const p = ents[st.players[i]];
    if (p.hp > 0 && p.x > x) x = p.x;
  }
  return x;
}

function hoverX(st: GState): number {
  const w = st.data.balance.world;
  return Math.max(w.bookX + BOSS_HOVER_AHEAD, Math.min(w.fieldRight, playerFront(st) + BOSS_HOVER_AHEAD));
}

/** Order 300 (from ai.ts): move toward the fight while approaching / recovering. */
export function bossMove(st: GState, slot: number): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  if (e.hp <= 0 || !rt.boss) return;
  if (statusOf(e, 'stun')) {
    setAnim(e, 'stunned');
    return;
  }
  if (rt.bState !== APPROACH && rt.bState !== RECOVER) return;
  const w = st.data.balance.world;
  const speed = BOSS_SPEED * SIM_DT;
  let target: number;
  if (e.flying) {
    target = hoverX(st);
    // drift back up after a swoop
    e.y += Math.sign(rt.laneY - e.y) * Math.min(Math.abs(rt.laneY - e.y), speed * 3);
  } else {
    const reach = step(rt).attack === 'melee_combo' ? num(step(rt), 'reach', 60) : 60;
    // blocked by the first player body; stops at the book
    let lim = w.bookX + Math.max(0, reach - REACH_MARGIN);
    const ents = st.world.entities;
    for (let i = 0; i < st.players.length; i++) {
      const s = st.players[i];
      const p = ents[s];
      if (p.hp <= 0 || p.x > e.x + 0.5) continue;
      lim = Math.max(lim, p.x + st.rts[s].radius + rt.radius);
    }
    // stop once something is in reach
    if (nearestPlayer(st, e.x, Math.max(0, reach - REACH_MARGIN), -1) >= 0) lim = Math.max(lim, e.x);
    target = lim;
  }
  const dx = target - e.x;
  if (Math.abs(dx) > 0.5) {
    e.x += Math.sign(dx) * Math.min(Math.abs(dx), speed);
    e.facing = dx > 0 ? 1 : -1;
    if (rt.bState === APPROACH) setAnim(e, 'walk');
  } else if (rt.bState === APPROACH) setAnim(e, 'idle');
}

function addTelegraph(st: GState, ownerId: number, shape: Telegraph['shape'], x: number, size: number, total: number): number {
  const t = st.telegraphPool.pop() ?? { id: 0, shape, x, y: 0, size, remaining: 0, total: 0, ownerId };
  t.id = st.nextTelegraphId++;
  t.shape = shape;
  t.x = x;
  t.y = st.data.balance.world.groundY;
  t.size = size;
  t.remaining = total;
  t.total = total;
  t.ownerId = ownerId;
  st.world.telegraphs.push(t);
  st.bus.emit('boss:telegraph', { ...t });
  return t.id;
}

function removeTelegraph(st: GState, id: number): void {
  const list = st.world.telegraphs;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      st.telegraphPool.push(list[i]);
      list.splice(i, 1);
      return;
    }
  }
}

function telegraphOf(st: GState, id: number): Telegraph | undefined {
  const list = st.world.telegraphs;
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return undefined;
}

/** Order 500: minion queue + every boss's attack loop. */
export function bossesTick(st: GState, ctx: SimContext): void {
  // due minions (kept in schedule order)
  if (st.minions.length > 0) {
    let k = 0;
    while (k < st.minions.length) {
      const m = st.minions[k];
      if (m.at <= ctx.world.time + 1e-9) {
        const def = ctx.data.enemies.get(m.enemy);
        if (def) spawnEnemyAt(st, def, m.x + ctx.rng.range(-BOSS_MINION_SPREAD, BOSS_MINION_SPREAD), false);
        st.minions.splice(k, 1);
      } else k++;
    }
  }
  const ents = st.world.entities;
  for (let i = 0; i < st.hostiles.length; i++) {
    const s = st.hostiles[i];
    if (ents[s].kind === 'boss') runBoss(st, ctx, s);
  }
}

function runBoss(st: GState, ctx: SimContext, slot: number): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  const def = rt.boss;
  if (!def) return;
  const wb = st.world.boss;
  if (wb && wb.entityId === e.id) wb.hpFrac = e.maxHp > 0 ? Math.max(0, e.hp / e.maxHp) : 0;
  if (e.hp <= 0) return;

  // phase change
  const frac = e.hp / e.maxHp;
  if (rt.bState !== TRANSITION && rt.bPhase < def.phases.length - 1 && frac <= def.phases[rt.bPhase].untilHpFrac) {
    if (rt.bTelegraph !== NONE) removeTelegraph(st, rt.bTelegraph);
    rt.bTelegraph = NONE;
    rt.bPhase++;
    rt.bStep = 0;
    rt.bState = TRANSITION;
    rt.bTimer = def.phaseTransition;
    applyStatus(st, e, 'invuln', def.phaseTransition, 1);
    setAnim(e, 'cast');
    if (wb && wb.entityId === e.id) wb.phase = rt.bPhase + 1;
    st.bus.emit('boss:phase', { id: e.id, bossId: def.id, phase: rt.bPhase + 1 });
    scheduleMinions(st, def, rt.bPhase, e.x);
  }
  if (statusOf(e, 'stun')) return; // the loop pauses while stunned

  const s = step(rt);
  switch (rt.bState) {
    case TRANSITION:
      rt.bTimer -= SIM_DT;
      if (rt.bTimer <= 0) {
        rt.bState = APPROACH;
        rt.bTimer = 0;
      }
      return;
    case APPROACH: {
      // bTimer counts time spent approaching (negative); see ready()
      rt.bTimer -= SIM_DT;
      if (!ready(st, slot, s)) return;
      startStep(st, slot, s);
      return;
    }
    case TELEGRAPH: {
      rt.bTimer -= SIM_DT;
      const t = telegraphOf(st, rt.bTelegraph);
      if (t) t.remaining = Math.max(0, rt.bTimer);
      if (rt.bTimer > 0) return;
      removeTelegraph(st, rt.bTelegraph);
      rt.bTelegraph = NONE;
      rt.bState = ACT;
      rt.bTimer = 0;
      rt.bHits = 0;
      rt.bSwoopFrom = e.x;
      return;
    }
    case ACT:
      act(st, ctx, slot, s);
      return;
    case RECOVER:
      rt.bTimer -= SIM_DT;
      if (rt.bTimer > 0) return;
      rt.bStep = (rt.bStep + 1) % def.phases[rt.bPhase].loop.length;
      rt.bState = APPROACH;
      rt.bTimer = 0;
      setAnim(e, e.flying ? 'idle' : 'walk');
      return;
    default:
      rt.bState = APPROACH;
  }
}

function ready(st: GState, slot: number, s: BossStep): boolean {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  const w = st.data.balance.world;
  if (e.x > w.fieldRight) return false;
  switch (s.attack) {
    case 'melee_combo': {
      const reach = num(s, 'reach', 60);
      return nearestPlayer(st, e.x, reach, 0) >= 0 || e.x - w.bookX <= reach;
    }
    case 'swoop':
    case 'scream':
      // flyers attack once they hover in place (or after 6 s of trying) [เดา]
      if (e.flying) return Math.abs(e.x - hoverX(st)) <= 60 || rt.bTimer < -6;
      return nearestPlayer(st, e.x, s.attack === 'scream' ? num(s, 'radius', 200) : num(s, 'width', 200), 0) >= 0;
    default:
      return true;
  }
}

function startStep(st: GState, slot: number, s: BossStep): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  let shape: Telegraph['shape'] = 'circle';
  let x = e.x;
  let size = 0;
  switch (s.attack) {
    case 'swoop':
      shape = 'band';
      x = playerFront(st);
      size = num(s, 'width', 200);
      break;
    case 'scream':
      shape = 'circle';
      size = num(s, 'radius', 200);
      break;
    case 'melee_combo': {
      const p = nearestPlayer(st, e.x, Number.POSITIVE_INFINITY, 0);
      if (p >= 0) e.facing = st.world.entities[p].x >= e.x ? 1 : -1;
      else e.facing = -1;
      shape = 'band';
      size = num(s, 'reach', 60);
      x = e.x + (e.facing * size) / 2;
      break;
    }
    default:
      break;
  }
  rt.bX = x;
  if (s.telegraph > 0) {
    rt.bTelegraph = addTelegraph(st, e.id, shape, x, size, s.telegraph);
    rt.bState = TELEGRAPH;
    rt.bTimer = s.telegraph;
    setAnim(e, 'telegraph');
  } else {
    rt.bState = ACT;
    rt.bTimer = 0;
    rt.bHits = 0;
    rt.bSwoopFrom = e.x;
  }
}

function toRecover(st: GState, slot: number, s: BossStep): void {
  const rt = st.rts[slot];
  rt.bState = RECOVER;
  rt.bTimer = s.recover;
  setAnim(st.world.entities[slot], 'idle');
}

function act(st: GState, ctx: SimContext, slot: number, s: BossStep): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  const ents = st.world.entities;
  const w = ctx.data.balance.world;
  switch (s.attack) {
    case 'swoop': {
      rt.bTimer += SIM_DT;
      const prog = Math.min(1, rt.bTimer / BOSS_SWOOP_TIME);
      e.x = rt.bSwoopFrom + (rt.bX - rt.bSwoopFrom) * prog;
      if (e.flying) e.y = rt.laneY + (w.groundY - 70 - rt.laneY) * Math.sin(prog * Math.PI * 0.5);
      setAnim(e, 'attack');
      if (prog < 1) return;
      const half = num(s, 'width', 200) / 2;
      const dmg = num(s, 'damage', 0);
      st.bus.emit('entity:attack', { id: e.id, targetId: null, x: rt.bX, y: w.groundY, ranged: false });
      for (let i = 0; i < st.players.length; i++) {
        const p = st.players[i];
        const o = ents[p];
        if (o.hp > 0 && Math.abs(o.x - rt.bX) <= half + st.rts[p].radius) dealDamage(st, p, dmg, 'physical', e.id, false, 1, NaN, true);
      }
      toRecover(st, slot, s);
      return;
    }
    case 'summon': {
      const def = ctx.data.enemies.get(String(s.params.enemy));
      const count = Math.round(num(s, 'count', 1));
      if (def) for (let i = 0; i < count; i++) spawnEnemyAt(st, def, Math.min(w.enemySpawnX, e.x + ctx.rng.range(-BOSS_MINION_SPREAD, BOSS_MINION_SPREAD)), false);
      st.bus.emit('entity:attack', { id: e.id, targetId: null, x: e.x, y: e.y, ranged: true });
      toRecover(st, slot, s);
      setAnim(e, 'cast');
      return;
    }
    case 'scream': {
      const radius = num(s, 'radius', 200);
      const stun = num(s, 'stun', 1);
      st.bus.emit('entity:attack', { id: e.id, targetId: null, x: e.x, y: e.y, ranged: true });
      for (let i = 0; i < st.players.length; i++) {
        const o = ents[st.players[i]];
        if (o.hp > 0 && Math.abs(o.x - e.x) <= radius) applyStatus(st, o, 'stun', stun, 1);
      }
      toRecover(st, slot, s);
      setAnim(e, 'cast');
      return;
    }
    case 'melee_combo': {
      rt.bTimer -= SIM_DT;
      if (rt.bTimer > 0) return;
      const reach = num(s, 'reach', 60);
      const dmg = num(s, 'damage', 0);
      setAnim(e, 'attack');
      e.animTime = 0;
      st.bus.emit('entity:attack', { id: e.id, targetId: null, x: e.x, y: e.y, ranged: false });
      for (let i = 0; i < st.players.length; i++) {
        const p = st.players[i];
        const o = ents[p];
        if (o.hp <= 0) continue;
        const r = st.rts[p].radius;
        const dx = (o.x - e.x) * e.facing;
        if (dx >= -r && dx <= reach + r) dealDamage(st, p, dmg, 'physical', e.id, false, 1, NaN, true);
      }
      if (e.x - w.bookX <= reach) damageBook(st, dmg);
      rt.bHits++;
      rt.bTimer = BOSS_COMBO_GAP;
      if (rt.bHits >= Math.round(num(s, 'hits', 1))) toRecover(st, slot, s);
      return;
    }
    default:
      toRecover(st, slot, s);
  }
}
