/**
 * Bosses: spawn (SpawnApi.spawnBoss), movement (order 300, from ai.ts) and the attack
 * loop + ground hazards (order 500). Pattern sheets for every boss: docs/BOSSES.md.
 *
 * Each phase loops its steps:
 *   APPROACH (walk / hover until the step is ready)
 *   -> TELEGRAPH (anim 'telegraph', action = attack id; the step's hazards are armed with
 *      warn >= step.telegraph and drawn as world.telegraphs + boss:telegraph)
 *   -> ACT (anim 'attack', action = attack id; sequential hazards are armed here, each with
 *      the full telegraph time; the step ends when its hazards are done)
 *   -> RECOVER (step.recover) -> next step.
 * Phase change at hp fraction <= phase.untilHpFrac: the current step is cancelled, the boss
 * is invulnerable for def.phaseTransition (anim 'cast', action 'phase'), every live minion
 * is pushed back (boss.phasePush), boss:phase, the new phase's minion groups are scheduled.
 *
 * Hazards (pooled, st.hazards), all dodgeable by walking out of the marked area or by the
 * dodge roll's invulnerability:
 *   STRIKE  marked band/circle/line/shadow; fires once after `warn` (optionally repeats
 *           for combos, bounces on (pumpkin head), turns into a POOL, or is where a burrowed
 *           boss emerges)
 *   POOL    damage over time inside a band (poison)
 *   WAVE    a front moving along the lane (mud wave, ground wave, charge with the boss riding
 *           it); a marked gap is safe for the mud wave
 *   RING    fronts expanding both ways from a centre (black bell)
 *   BEAM    a narrow beam sweeping back and forth (steam beam)
 *   BURROW  dust that tracks Ash, then becomes the emerge STRIKE
 */
import { SIM_DT, type BossDef, type BossStep, type SimContext, type Telegraph } from '../contracts';
import { speedOf } from './ai';
import { damageBook } from './combat';
import { applyStatus, dealDamage, knockback, statusOf } from './damage';
import { middleRowY, releaseById, spawnBossAt, spawnEffect, spawnEnemyAt } from './pool';
import { byId, isLive, NONE, restartAnim, setAct, setAnim, type GState, type Hazard, type Rt } from './state';
import { nearestPlayer } from './targeting';

const APPROACH = 0;
const TELEGRAPH = 1;
const ACT = 2;
const RECOVER = 3;
const TRANSITION = 4;

const H_STRIKE = 1;
const H_POOL = 2;
const H_WAVE = 3;
const H_RING = 4;
const H_BEAM = 5;
const H_BURROW = 6;

/** minimum time a step stays in ACT (attack anim), seconds */
const ACT_MIN = 0.45;

/** attacks a boss walks into melee for, with the reach param that measures it */
const MELEE_STEPS: Readonly<Partial<Record<string, (s: BossStep) => number>>> = {
  melee_combo: (s) => num(s, 'reach', 90),
  shovel_slam: (s) => num(s, 'length', 260) * 0.6,
  swoop: () => 0,
};

let serialSeq = 1;

// ---------------------------------------------------------------- spawn

export function spawnBoss(st: GState, def: BossDef, scheduled: boolean): number {
  const w = st.data.balance.world;
  const slot = spawnBossAt(st, def, w.enemySpawnX, scheduled);
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  rt.bPhase = 0;
  rt.bStep = 0;
  rt.bState = APPROACH;
  rt.bTimer = 0;
  rt.bT = 0;
  rt.bTelegraph = NONE;
  rt.bA = 0;
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

// ---------------------------------------------------------------- helpers

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
  return Math.max(w.bookX + st.T.bossHoverAhead, Math.min(w.fieldRight, playerFront(st) + st.T.bossHoverAhead));
}

/** Ash's x if alive, else the frontmost player body */
function ashX(st: GState): number {
  const a = byId(st, st.world.ashId);
  return isLive(a) ? a.x : playerFront(st);
}

function clampField(st: GState, x: number): number {
  const w = st.data.balance.world;
  return Math.max(w.castleRight, Math.min(w.fieldRight, x));
}

function addTelegraph(st: GState, ownerId: number, shape: Telegraph['shape'], x: number, size: number, total: number): number {
  const t = st.telegraphPool.pop() ?? { id: 0, shape, x, y: 0, size, remaining: 0, total: 0, ownerId };
  t.id = st.nextTelegraphId++;
  t.shape = shape;
  t.x = x;
  t.y = middleRowY(st);
  t.size = size;
  t.remaining = total;
  t.total = total;
  t.ownerId = ownerId;
  st.world.telegraphs.push(t);
  st.bus.emit('boss:telegraph', { ...t });
  return t.id;
}

function telegraphOf(st: GState, id: number): Telegraph | undefined {
  const list = st.world.telegraphs;
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return undefined;
}

function removeTelegraph(st: GState, id: number): void {
  if (id === NONE) return;
  const list = st.world.telegraphs;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      st.telegraphPool.push(list[i]);
      list.splice(i, 1);
      return;
    }
  }
}

function newHazard(st: GState, owner: number, attack: string, kind: number, serial: number): Hazard {
  let h: Hazard | undefined;
  for (const c of st.hazards) {
    if (!c.active) {
      h = c;
      break;
    }
  }
  if (!h) {
    h = {
      active: false, kind: 0, owner: NONE, attack: '', x: 0, half: 0, warn: 0, warnTotal: 0, teleId: NONE, damage: 0, dps: 0, life: 0, acc: 0,
      v: 0, x0: 0, x1: 0, width: 0, radius: 0, gapL: 0, gapR: 0, passes: 1, hit: [], kb: 0, stun: 0, root: 0, nonLethal: false, carry: false,
      fx: NONE, fxAlt0: 0, poolLife: 0, poolDps: 0, bounces: 0, hop: 0, track: 0, serial: 0, repeatGap: 0, bounceWarn: 0, shape: 'circle',
      emerge: false, hitsBook: false, dkind: 'physical', moving: false,
    };
    st.hazards.push(h);
  }
  const hit = h.hit;
  hit.length = 0;
  Object.assign(h, {
    active: true, kind, owner, attack, x: 0, half: 0, warn: 0, warnTotal: 0, teleId: NONE, damage: 0, dps: 0, life: 0, acc: 0,
    v: 0, x0: 0, x1: 0, width: 0, radius: 0, gapL: 0, gapR: 0, passes: 1, kb: 0, stun: 0, root: 0, nonLethal: false, carry: false,
    fx: NONE, fxAlt0: 0, poolLife: 0, poolDps: 0, bounces: 0, hop: 0, track: 0, serial, repeatGap: 0, bounceWarn: 0, shape: 'circle',
    emerge: false, hitsBook: false, dkind: 'physical', moving: false,
  });
  h.hit = hit;
  return h;
}

/** Arm a STRIKE: marked area centred on x with half-size `half`. */
function strike(st: GState, slot: number, attack: string, shape: Telegraph['shape'], x: number, half: number, warn: number, damage: number): Hazard {
  const e = st.world.entities[slot];
  const h = newHazard(st, e.id, attack, H_STRIKE, st.rts[slot].bB);
  h.x = x;
  h.half = half;
  h.warn = h.warnTotal = Math.max(SIM_DT, warn);
  h.damage = damage;
  h.shape = shape;
  h.teleId = addTelegraph(st, e.id, shape, x, shape === 'band' || shape === 'line' ? half * 2 : half, h.warnTotal);
  return h;
}

/** falling object over a strike: drops from boss.fallHeight to the ground during the warning */
function fallingFx(st: GState, h: Hazard, sprite: string): void {
  const s = spawnEffect(st, h.attack, sprite, h.x, middleRowY(st), st.T.bossFallHeight, h.warnTotal + 0.6);
  h.fx = st.world.entities[s].id;
  h.fxAlt0 = st.T.bossFallHeight;
}

function endHazard(st: GState, h: Hazard): void {
  removeTelegraph(st, h.teleId);
  h.teleId = NONE;
  if (h.fx !== NONE) releaseById(st, h.fx);
  h.fx = NONE;
  h.active = false;
}

/** Hit one player body with a hazard (respects the dodge roll's invulnerability). */
function hazardHit(st: GState, h: Hazard, slot: number, fromX: number): void {
  const o = st.world.entities[slot];
  if (statusOf(o, 'invuln')) {
    if (o.kind === 'ash') st.bus.emit('spectacle:near_miss', { x: o.x, y: o.y });
    dealDamage(st, slot, Math.max(1, h.damage), h.dkind, h.owner, false, 1, NaN, false); // emits a blocked hit
    return;
  }
  let dmg = h.damage;
  if (h.nonLethal && o.kind !== 'ash') dmg = Math.min(dmg, Math.max(0, o.hp - 1));
  if (dmg > 0) dealDamage(st, slot, dmg, h.dkind, h.owner, false, 1, NaN, true);
  if (o.hp <= 0) return;
  if (h.stun > 0) applyStatus(st, o, 'stun', h.stun, 1);
  if (h.root > 0) applyStatus(st, o, 'root', h.root, 1);
  if (h.kb > 0) knockback(st, o, st.rts[slot], h.kb, o.x >= fromX ? 1 : -1);
}

/** every live player body within `half` (+ its radius) of x, once per hazard */
function hitArea(st: GState, h: Hazard, x: number, half: number): number {
  const ents = st.world.entities;
  let n = 0;
  for (let i = 0; i < st.players.length; i++) {
    const s = st.players[i];
    const o = ents[s];
    if (o.hp <= 0 || h.hit.includes(o.id)) continue;
    if (Math.abs(o.x - x) > half + st.rts[s].radius) continue;
    h.hit.push(o.id);
    hazardHit(st, h, s, x);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- movement (order 300)

/** Order 300 (from ai.ts): walk / hover toward the fight while approaching or recovering. */
export function bossMove(st: GState, slot: number): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  if (e.hp <= 0 || !rt.boss) return;
  const T = st.T;
  // height: flyers hover (unless grounded by Chain Drag), floaters float, walkers stand
  if (rt.bState !== ACT || (step(rt).attack !== 'swoop' && step(rt).attack !== 'float_fireballs')) {
    const want = e.flying ? rt.baseAlt : 0;
    const d = want - e.alt;
    const stepA = T.flyerAltSpeed * SIM_DT;
    e.alt = Math.abs(d) <= stepA ? want : e.alt + Math.sign(d) * stepA;
  }
  if (rt.hidden) return;
  if (statusOf(e, 'stun')) {
    setAnim(e, 'stunned');
    return;
  }
  if (rt.bState !== APPROACH && rt.bState !== RECOVER) return;
  if (statusOf(e, 'root')) return;
  const w = st.data.balance.world;
  const speed = speedOf(st, e, rt) * SIM_DT;
  // riding back home after a charge
  if (rt.bA > 0) {
    const d = rt.bA - e.x;
    const v = speed * T.bossReturnSpeedMul * 2;
    if (Math.abs(d) <= v) {
      e.x = rt.bA;
      rt.bA = 0;
    } else e.x += Math.sign(d) * v;
    e.facing = d > 0 ? 1 : -1;
    setAnim(e, 'walk');
    return;
  }
  const s = step(rt);
  let target: number;
  if (e.flying) target = hoverX(st);
  else {
    const melee = MELEE_STEPS[s.attack];
    const reach = melee ? melee(s) : 0;
    const ents = st.world.entities;
    // blocked by the first player body
    let block = w.bookX + rt.radius * 0.5;
    for (let i = 0; i < st.players.length; i++) {
      const ps = st.players[i];
      const p = ents[ps];
      if (p.hp <= 0 || p.x > e.x + 0.5) continue;
      block = Math.max(block, p.x + st.rts[ps].radius + rt.radius);
    }
    if (melee) {
      target = Math.max(block, w.bookX + Math.max(0, reach - T.reachMargin));
      if (nearestPlayer(st, e.x, Math.max(0, reach - T.reachMargin), 0) >= 0) target = e.x;
    } else {
      // ranged steps: keep a standoff from the front line (or walk to the book when it is empty)
      const front = playerFront(st);
      target = Math.max(block, front > w.bookX ? front + T.bossStandoff : w.bookX + rt.radius);
      target = Math.min(target, e.x); // never back off while approaching
    }
  }
  const dx = target - e.x;
  if (Math.abs(dx) > 0.5) {
    e.x += Math.sign(dx) * Math.min(Math.abs(dx), speed);
    e.facing = dx > 0 ? 1 : -1;
    if (rt.bState === APPROACH) setAnim(e, 'walk');
  } else if (rt.bState === APPROACH) setAnim(e, 'idle');
}

// ---------------------------------------------------------------- loop (order 500)

/** Order 500: minion queue, hazards, and every boss's attack loop. */
export function bossesTick(st: GState, ctx: SimContext): void {
  if (st.minions.length > 0) {
    let k = 0;
    while (k < st.minions.length) {
      const m = st.minions[k];
      if (m.at <= ctx.world.time + 1e-9) {
        const def = ctx.data.enemies.get(m.enemy);
        const spread = st.T.bossMinionSpread;
        if (def) spawnEnemyAt(st, def, Math.min(ctx.data.balance.world.enemySpawnX, m.x + ctx.rng.range(-spread, spread)), false);
        st.minions.splice(k, 1);
      } else k++;
    }
  }
  hazardsTick(st, ctx);
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
  rt.bT += SIM_DT;

  // phase change
  const frac = e.hp / e.maxHp;
  if (rt.bState !== TRANSITION && rt.bPhase < def.phases.length - 1 && frac <= def.phases[rt.bPhase].untilHpFrac) {
    cancelStep(st, slot, true);
    rt.bPhase++;
    rt.bStep = 0;
    enter(rt, TRANSITION, def.phaseTransition);
    applyStatus(st, e, 'invuln', def.phaseTransition, 1);
    clearStatusLike(st, slot);
    setAct(e, 'cast', 'phase');
    if (wb && wb.entityId === e.id) wb.phase = rt.bPhase + 1;
    st.bus.emit('boss:phase', { id: e.id, bossId: def.id, phase: rt.bPhase + 1 });
    // the old minions are thrown back
    const ents = st.world.entities;
    for (let i = 0; i < st.hostiles.length; i++) {
      const hs = st.hostiles[i];
      const o = ents[hs];
      if (o.kind === 'enemy' && o.hp > 0) knockback(st, o, st.rts[hs], st.T.bossPhasePush, 1);
    }
    scheduleMinions(st, def, rt.bPhase, e.x);
  }
  if (statusOf(e, 'stun')) return; // the loop pauses while stunned (hazards already armed keep going)

  const s = step(rt);
  switch (rt.bState) {
    case TRANSITION:
      rt.bTimer -= SIM_DT;
      if (rt.bTimer <= 0) enter(rt, APPROACH, 0);
      return;
    case APPROACH:
      if (!ready(st, slot, s)) return;
      startStep(st, ctx, slot, s);
      return;
    case TELEGRAPH:
      rt.bTimer -= SIM_DT;
      telegraphTick(st, ctx, slot, s);
      if (rt.bTimer > 0) return;
      enter(rt, ACT, 0);
      setAct(e, 'attack', s.attack);
      st.bus.emit('entity:attack', { id: e.id, targetId: null, x: e.x, y: e.y, ranged: s.attack !== 'melee_combo' && s.attack !== 'shovel_slam' });
      actStart(st, ctx, slot, s);
      return;
    case ACT:
      if (actTick(st, ctx, slot, s) && rt.bT >= ACT_MIN && !stepHazardsPending(st, e.id, rt.bB)) toRecover(st, slot, s);
      return;
    case RECOVER:
      rt.bTimer -= SIM_DT;
      if (rt.bTimer > 0) return;
      rt.bStep = (rt.bStep + 1) % def.phases[rt.bPhase].loop.length;
      enter(rt, APPROACH, 0);
      setAnim(e, e.flying ? 'idle' : 'walk');
      return;
    default:
      enter(rt, APPROACH, 0);
  }
}

function enter(rt: Rt, state: number, timer: number): void {
  rt.bState = state;
  rt.bTimer = timer;
  rt.bT = 0;
}

/** a phase change also clears roots/stuns so the show is not frozen */
function clearStatusLike(st: GState, slot: number): void {
  const e = st.world.entities[slot];
  for (let i = e.statuses.length - 1; i >= 0; i--) {
    const id = e.statuses[i].id;
    if (id === 'stun' || id === 'root' || id === 'grounded') e.statuses[i].remaining = Math.min(e.statuses[i].remaining, SIM_DT);
  }
}

function ready(st: GState, slot: number, s: BossStep): boolean {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  const w = st.data.balance.world;
  if (e.x > w.fieldRight) return false;
  if (rt.bA > 0) return false; // still riding home
  const timeout = rt.bT >= st.T.bossReadyTimeout;
  const melee = MELEE_STEPS[s.attack];
  if (s.attack === 'swoop' || (e.flying && s.attack === 'scream')) return Math.abs(e.x - hoverX(st)) <= 60 || timeout;
  if (melee && s.attack !== 'swoop') {
    const reach = melee(s);
    return nearestPlayer(st, e.x, reach, 0) >= 0 || e.x - w.bookX <= reach || timeout;
  }
  if (s.attack === 'scream') return nearestPlayer(st, e.x, num(s, 'radius', 300), 0) >= 0 || timeout;
  // ranged / summon steps: once on the field and the fight is in view
  return Math.abs(ashX(st) - e.x) <= st.T.bossStandoff * 2.5 || timeout;
}

function facePlayers(st: GState, slot: number): void {
  const e = st.world.entities[slot];
  const tx = ashX(st);
  const p = nearestPlayer(st, e.x, Number.POSITIVE_INFINITY, 0);
  const x = p >= 0 ? st.world.entities[p].x : tx;
  e.facing = x >= e.x ? 1 : -1;
}

function toRecover(st: GState, slot: number, s: BossStep): void {
  const rt = st.rts[slot];
  enter(rt, RECOVER, s.recover);
  setAnim(st.world.entities[slot], 'idle');
}

function stepHazardsPending(st: GState, owner: number, serial: number): boolean {
  for (const h of st.hazards) {
    if (h.active && h.owner === owner && h.serial === serial && h.kind !== H_POOL) return true;
  }
  return false;
}

/** Cancel the running step: hazards still warning are removed (fired fronts/pools stay unless `all`). */
function cancelStep(st: GState, slot: number, all: boolean): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  for (const h of st.hazards) {
    if (!h.active || h.owner !== e.id) continue;
    if (all || h.warn > 0 || h.kind === H_BURROW) {
      if (h.carry || h.emerge || h.kind === H_BURROW) {
        e.x = clampField(st, h.x);
        rt.hidden = false;
      }
      endHazard(st, h);
    }
  }
  if (rt.hidden) rt.hidden = false;
  removeTelegraph(st, rt.bTelegraph);
  rt.bTelegraph = NONE;
}

/** Matins Bell tier 2: a boss caught while telegraphing loses the step. */
export function interruptBoss(st: GState, slot: number): void {
  const rt = st.rts[slot];
  if (!rt.boss || (rt.bState !== TELEGRAPH && rt.bState !== ACT)) return;
  if (rt.bState === ACT && !stepHazardsPending(st, st.world.entities[slot].id, rt.bB)) return;
  cancelStep(st, slot, false);
  toRecover(st, slot, step(rt));
}

// ---------------------------------------------------------------- steps

/** TELEGRAPH starts: arm the step's first hazards (warn = telegraph) and pose. */
function startStep(st: GState, ctx: SimContext, slot: number, s: BossStep): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  const w = ctx.data.balance.world;
  rt.bB = serialSeq++;
  rt.bHits = 0;
  rt.bSeqT = 0;
  rt.bX0 = e.x;
  rt.bAltFrom = e.alt;
  facePlayers(st, slot);
  const tel = Math.max(0, s.telegraph);
  let stateTime = tel;
  switch (s.attack) {
    case 'swoop': {
      // the boss dives during ACT; the band fires when the dive lands
      const x = clampField(st, playerFront(st));
      rt.bX = x;
      strike(st, slot, s.attack, 'band', x, num(s, 'width', 260) / 2, tel + st.T.bossSwoopTime, num(s, 'damage', 0));
      break;
    }
    case 'scream': {
      const h = strike(st, slot, s.attack, 'circle', e.x, num(s, 'radius', 300), tel, num(s, 'damage', 0));
      h.stun = num(s, 'stun', 1);
      break;
    }
    case 'melee_combo': {
      const reach = num(s, 'reach', 90);
      const h = strike(st, slot, s.attack, 'band', e.x + (e.facing * reach) / 2, reach / 2 + rt.radius * 0.25, tel, num(s, 'damage', 0));
      h.passes = Math.max(1, Math.round(num(s, 'hits', 1)));
      h.repeatGap = st.T.bossComboGap;
      h.hitsBook = true;
      break;
    }
    case 'shovel_slam': {
      const len = num(s, 'length', 260);
      const h = strike(st, slot, s.attack, 'band', e.x + (e.facing * len) / 2, len / 2, tel, num(s, 'damage', 0));
      h.kb = num(s, 'knockback', 60);
      h.hitsBook = true;
      break;
    }
    case 'shotgun_line': {
      const len = num(s, 'length', 520);
      const h = strike(st, slot, s.attack, 'line', e.x + (e.facing * len) / 2, len / 2, tel, num(s, 'damage', 0));
      h.kb = num(s, 'knockback', 40);
      h.hitsBook = true;
      break;
    }
    case 'ground_wave':
    case 'mud_wave': {
      const h = newHazard(st, e.id, s.attack, H_WAVE, rt.bB);
      h.x0 = e.x;
      h.x1 = w.castleRight;
      h.x = h.x0;
      h.v = -Math.abs(num(s, 'speed', 400));
      h.width = num(s, 'width', 60);
      h.damage = num(s, 'damage', 0);
      h.kb = num(s, 'knockback', 30);
      h.warn = h.warnTotal = Math.max(SIM_DT, tel);
      if (s.attack === 'mud_wave') {
        // one safe spot near Ash, marked by the GAP between the two warning bands
        const gw = num(s, 'gapWidth', 140);
        const lo = w.castleRight + gw;
        const hi = Math.max(lo, h.x0 - gw);
        const c = Math.max(lo, Math.min(hi, ashX(st) + ctx.rng.range(-200, 200)));
        h.gapL = c - gw / 2;
        h.gapR = c + gw / 2;
        h.teleId = addTelegraph(st, e.id, 'band', (h.x1 + h.gapL) / 2, Math.max(0, h.gapL - h.x1), h.warnTotal);
        rt.bTelegraph = addTelegraph(st, e.id, 'band', (h.gapR + h.x0) / 2, Math.max(0, h.x0 - h.gapR), h.warnTotal);
      } else {
        h.gapL = h.gapR = Number.NaN;
        h.teleId = addTelegraph(st, e.id, 'band', (h.x0 + h.x1) / 2, Math.abs(h.x0 - h.x1), h.warnTotal);
      }
      break;
    }
    case 'charge':
    case 'double_charge': {
      rt.bA = 0;
      const h = newHazard(st, e.id, s.attack, H_WAVE, rt.bB);
      h.x0 = e.x;
      h.x1 = w.ashMinX;
      h.x = h.x0;
      h.v = -Math.abs(num(s, 'speed', 900));
      h.width = rt.radius * 2;
      h.damage = num(s, 'damage', 0);
      h.kb = num(s, 'knockback', 120);
      h.nonLethal = true;
      h.carry = true;
      h.passes = s.attack === 'double_charge' ? 2 : 1;
      h.bounceWarn = Math.max(0.6, num(s, 'secondWarn', 0.8));
      h.gapL = h.gapR = Number.NaN;
      h.warn = h.warnTotal = Math.max(SIM_DT, tel);
      h.teleId = addTelegraph(st, e.id, 'band', (h.x0 + h.x1) / 2, Math.abs(h.x0 - h.x1), h.warnTotal);
      break;
    }
    case 'throw_head': {
      const h = strike(st, slot, s.attack, 'circle', clampField(st, ashX(st)), num(s, 'radius', 60), tel, num(s, 'damage', 0));
      h.bounces = Math.max(0, Math.round(num(s, 'bounces', 2)));
      h.hop = -Math.abs(num(s, 'hop', 220));
      h.bounceWarn = Math.max(0.6, num(s, 'bounceWarn', 0.7));
      h.dkind = 'fire';
      fallingFx(st, h, 'pumpkin_head');
      break;
    }
    case 'toss_poison': {
      const count = Math.max(1, Math.round(num(s, 'count', 4)));
      const spread = num(s, 'spread', 260);
      const cx = ashX(st);
      for (let i = 0; i < count; i++) {
        const off = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1) + ctx.rng.range(-20, 20);
        const h = strike(st, slot, s.attack, 'shadow', clampField(st, cx + off), num(s, 'radius', 55), tel, num(s, 'damage', 0));
        h.poolLife = num(s, 'poolLife', 6);
        h.poolDps = num(s, 'poolDps', 8);
        fallingFx(st, h, 'poison_flask');
      }
      break;
    }
    case 'steam_beam': {
      const h = newHazard(st, e.id, s.attack, H_BEAM, rt.bB);
      const reach = num(s, 'reach', 900);
      h.x1 = e.x - e.facing * rt.radius;
      h.x0 = clampField(st, h.x1 - reach);
      h.x = h.x1;
      h.v = -Math.abs(num(s, 'speed', 520));
      h.width = num(s, 'width', 50);
      h.damage = num(s, 'damage', 0);
      h.passes = Math.max(1, Math.round(num(s, 'passes', 3)));
      h.warn = h.warnTotal = Math.max(SIM_DT, tel);
      h.teleId = addTelegraph(st, e.id, 'line', (h.x0 + h.x1) / 2, Math.abs(h.x1 - h.x0), h.warnTotal);
      const fx = spawnEffect(st, s.attack, 'fx_holy_beam', h.x, middleRowY(st), 0, 30);
      h.fx = st.world.entities[fx].id;
      break;
    }
    case 'burrow': {
      // dig in: untargetable dust tracks Ash, then the emerge circle is marked for `telegraph`
      const h = newHazard(st, e.id, s.attack, H_BURROW, rt.bB);
      h.x = e.x;
      h.track = num(s, 'track', 2);
      h.v = num(s, 'speed', 260);
      h.half = num(s, 'radius', 70);
      h.damage = num(s, 'damage', 0);
      h.kb = num(s, 'knockback', 80);
      h.warnTotal = Math.max(SIM_DT, tel);
      h.warn = h.warnTotal;
      h.shape = 'circle';
      h.emerge = true;
      const fx = spawnEffect(st, s.attack, 'fx_dust_puff', h.x, middleRowY(st), 0, h.track + h.warnTotal + 1);
      h.fx = st.world.entities[fx].id;
      rt.hidden = true;
      stateTime = h.track + tel;
      break;
    }
    case 'drain_book':
      rt.bTelegraph = addTelegraph(st, e.id, 'circle', w.bookX, st.T.bookSiegeRange, tel);
      break;
    case 'raise_dead':
      rt.bA2 = e.hp;
      rt.bTelegraph = addTelegraph(st, e.id, 'circle', e.x, num(s, 'radius', 160), tel);
      break;
    case 'black_bell':
    case 'coffin_toss':
    case 'grave_hands':
    case 'fire_storm':
    case 'float_fireballs':
      // the first of the sequence is armed now; the rest by sequenceTick
      armSequential(st, ctx, slot, s, tel);
      rt.bHits = 1;
      break;
    default:
      if (tel > 0) rt.bTelegraph = addTelegraph(st, e.id, 'circle', e.x, rt.radius, tel);
      break;
  }
  enter(rt, TELEGRAPH, stateTime);
  setAct(e, 'telegraph', s.attack);
}

/** One item of a sequential attack (each fully telegraphed). */
function armSequential(st: GState, ctx: SimContext, slot: number, s: BossStep, tel: number): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  const r = num(s, 'radius', 60);
  const dmg = num(s, 'damage', 0);
  const warn = Math.max(SIM_DT, tel);
  switch (s.attack) {
    case 'black_bell': {
      const h = newHazard(st, e.id, s.attack, H_RING, rt.bB);
      h.x = e.x;
      h.radius = num(s, 'radius', 600);
      h.v = num(s, 'speed', 420);
      h.width = num(s, 'width', 50);
      h.damage = dmg;
      h.kb = num(s, 'knockback', 40);
      h.warn = h.warnTotal = warn;
      h.teleId = addTelegraph(st, e.id, 'circle', h.x, h.radius, warn);
      break;
    }
    case 'coffin_toss': {
      const h = strike(st, slot, s.attack, 'shadow', clampField(st, ashX(st)), r, warn, dmg);
      h.kb = num(s, 'knockback', 40);
      fallingFx(st, h, 'coffin');
      break;
    }
    case 'grave_hands': {
      const h = strike(st, slot, s.attack, 'circle', clampField(st, ashX(st)), r, warn, dmg);
      h.root = num(s, 'root', 1);
      const fx = spawnEffect(st, s.attack, 'fx_bone_burst', h.x, middleRowY(st), 0, warn + 0.6);
      h.fx = st.world.entities[fx].id;
      break;
    }
    case 'fire_storm':
    case 'float_fireballs': {
      const spread = num(s, 'spread', s.attack === 'fire_storm' ? 300 : 0);
      const h = strike(st, slot, s.attack, 'shadow', clampField(st, ashX(st) + (spread > 0 ? ctx.rng.range(-spread, spread) : 0)), r, warn, dmg);
      h.dkind = 'fire';
      fallingFx(st, h, 'fireball');
      break;
    }
    default:
      break;
  }
}

const SEQUENTIAL = ['black_bell', 'coffin_toss', 'grave_hands', 'fire_storm', 'float_fireballs'];

/**
 * Sequential attacks: item i is armed `i * gap` after the step started and fires a full
 * telegraph later, so the items land `gap` apart. Returns true once all are armed.
 */
function sequenceTick(st: GState, ctx: SimContext, slot: number, s: BossStep): boolean {
  const rt = st.rts[slot];
  rt.bSeqT += SIM_DT;
  const count = Math.max(1, Math.round(num(s, s.attack === 'black_bell' ? 'rings' : 'count', 3)));
  const gap = num(s, 'gap', 0.5);
  if (rt.bHits < count && rt.bSeqT >= rt.bHits * gap - 1e-9) {
    rt.bHits++;
    if (rt.bState === ACT) restartAnim(st.world.entities[slot], 'attack', s.attack);
    armSequential(st, ctx, slot, s, s.telegraph);
  }
  return rt.bHits >= count;
}

/** TELEGRAPH, every tick: sequential arming, ritual break check, the boss's own telegraph countdown. */
function telegraphTick(st: GState, ctx: SimContext, slot: number, s: BossStep): void {
  const rt = st.rts[slot];
  if (SEQUENTIAL.includes(s.attack)) sequenceTick(st, ctx, slot, s);
  const t = telegraphOf(st, rt.bTelegraph);
  if (t) t.remaining = Math.max(0, rt.bTimer);
  if (s.attack === 'raise_dead' && rt.bA2 - st.world.entities[slot].hp >= num(s, 'breakDamage', 1e9)) {
    // ritual broken by damage
    cancelStep(st, slot, false);
    applyStatus(st, st.world.entities[slot], 'stun', st.T.bossDrainBreakStun, 1);
    toRecover(st, slot, s);
  }
}

/** ACT starts. */
function actStart(st: GState, ctx: SimContext, slot: number, s: BossStep): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  removeTelegraph(st, rt.bTelegraph);
  rt.bTelegraph = NONE;
  rt.bA2 = e.hp;
  switch (s.attack) {
    case 'summon': {
      const def = ctx.data.enemies.get(String(s.params.enemy));
      // never flood the field: summons top the boss's company up to `cap` live hostiles
      let live = 0;
      for (let i = 0; i < st.hostiles.length; i++) {
        const h = st.world.entities[st.hostiles[i]];
        if (h.hp > 0 && h.kind === 'enemy') live++;
      }
      const count = Math.min(Math.round(num(s, 'count', 1)), Math.max(0, Math.round(num(s, 'cap', st.T.bossSummonCap)) - live));
      const spread = st.T.bossMinionSpread;
      const w = ctx.data.balance.world;
      if (def) for (let i = 0; i < count; i++) spawnEnemyAt(st, def, Math.min(w.enemySpawnX, e.x + ctx.rng.range(-spread, spread)), false);
      break;
    }
    case 'raise_dead':
      raiseDead(st, ctx, slot, s);
      break;
    default:
      break;
  }
}

/** ACT, every tick. Returns true when the boss itself is done (hazards may still run). */
function actTick(st: GState, ctx: SimContext, slot: number, s: BossStep): boolean {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  switch (s.attack) {
    case 'swoop': {
      const prog = Math.min(1, rt.bT / st.T.bossSwoopTime);
      e.x = rt.bX0 + (rt.bX - rt.bX0) * prog;
      if (e.flying) e.alt = rt.bAltFrom + (st.T.flyerDiveAlt - rt.bAltFrom) * Math.sin(prog * Math.PI * 0.5);
      return prog >= 1;
    }
    case 'drain_book': {
      const dur = num(s, 'duration', 20);
      damageBook(st, num(s, 'dps', 10) * SIM_DT);
      if (rt.bA2 - e.hp >= num(s, 'breakDamage', 400)) {
        applyStatus(st, e, 'stun', st.T.bossDrainBreakStun, 1);
        st.bus.emit('spectacle:hit', { x: e.x, y: e.y, big: true });
        return true;
      }
      return rt.bT >= dur;
    }
    case 'black_bell':
    case 'coffin_toss':
    case 'grave_hands':
    case 'fire_storm':
    case 'float_fireballs': {
      if (s.attack === 'float_fireballs') {
        const want = st.T.bossFloatAlt;
        e.alt = Math.min(want, e.alt + st.T.flyerAltSpeed * SIM_DT);
      }
      return sequenceTick(st, ctx, slot, s);
    }
    default:
      return true;
  }
}

/** Malachar: enemies that died within `window` seconds rise again with hpFrac of their hp. */
function raiseDead(st: GState, ctx: SimContext, slot: number, s: BossStep): void {
  const e = st.world.entities[slot];
  const window = num(s, 'window', 5);
  const frac = num(s, 'hpFrac', 0.5);
  let left = Math.max(0, Math.round(num(s, 'max', 6)));
  const now = st.world.time;
  for (let i = 0; i < st.deaths.length && left > 0; i++) {
    const d = st.deaths[(st.deathHead - 1 - i + st.deaths.length * 2) % st.deaths.length];
    if (d.used || now - d.t > window) continue;
    const def = ctx.data.enemies.get(d.defId);
    if (!def) continue;
    d.used = true;
    const ns = spawnEnemyAt(st, def, d.x, false);
    const o = st.world.entities[ns];
    o.hp = Math.max(1, o.maxHp * frac);
    st.rts[ns].raised = true;
    left--;
    st.stats.raised++;
  }
  st.bus.emit('spell:impact', { spellId: e.defId, effect: 'raise_dead', x: e.x, y: e.y, radius: num(s, 'radius', 160) });
}

// ---------------------------------------------------------------- hazards

function hazardsTick(st: GState, ctx: SimContext): void {
  const ents = st.world.entities;
  const w = ctx.data.balance.world;
  for (const h of st.hazards) {
    if (!h.active) continue;
    const boss = byId(st, h.owner);
    if (!isLive(boss)) {
      endHazard(st, h);
      continue;
    }
    const bs = st.idSlot.get(boss.id)!;
    const brt = st.rts[bs];
    switch (h.kind) {
      case H_BURROW: {
        h.track -= SIM_DT;
        const tx = ashX(st);
        const d = tx - h.x;
        const v = h.v * SIM_DT;
        h.x = clampField(st, Math.abs(d) <= v ? tx : h.x + Math.sign(d) * v);
        boss.x = h.x; // the boss travels underground (hidden: untargetable, does not block)
        const fx = byId(st, h.fx);
        if (fx) fx.x = h.x;
        if (h.track <= 0) {
          h.kind = H_STRIKE;
          h.warn = h.warnTotal;
          h.teleId = addTelegraph(st, h.owner, 'circle', h.x, h.half, h.warnTotal);
        }
        break;
      }
      case H_STRIKE: {
        h.warn -= SIM_DT;
        const t = telegraphOf(st, h.teleId);
        if (t) t.remaining = Math.max(0, h.warn);
        if (h.fx !== NONE && h.fxAlt0 > 0) {
          const fx = byId(st, h.fx);
          if (fx) {
            const u = Math.max(0, h.warn / h.warnTotal);
            fx.alt = h.fxAlt0 * u * u;
            fx.x = h.x;
          }
        }
        if (h.warn > 1e-9) break;
        fireStrike(st, h, boss, bs);
        if (h.passes > 1) {
          h.passes--;
          h.hit.length = 0;
          h.warn = h.warnTotal = Math.max(SIM_DT, h.repeatGap);
          if (t) t.total = t.remaining = h.warn;
          restartAnim(boss, 'attack', h.attack);
        } else if (h.bounces > 0) {
          h.bounces--;
          h.hit.length = 0;
          removeTelegraph(st, h.teleId);
          h.x = clampField(st, h.x + h.hop);
          h.warn = h.warnTotal = h.bounceWarn;
          h.teleId = addTelegraph(st, h.owner, h.shape, h.x, h.half, h.warnTotal);
          h.fxAlt0 = st.T.bossFallHeight * 0.4;
        } else if (h.poolLife > 0) {
          removeTelegraph(st, h.teleId);
          h.teleId = NONE;
          if (h.fx !== NONE) releaseById(st, h.fx);
          h.kind = H_POOL;
          h.life = h.poolLife;
          h.dps = h.poolDps;
          h.acc = 0;
          h.dkind = 'fire';
          const fx = spawnEffect(st, h.attack, 'fx_poison_pool', h.x, middleRowY(st), 0, h.life);
          ents[fx].value = h.half;
          h.fx = ents[fx].id;
        } else endHazard(st, h);
        break;
      }
      case H_POOL: {
        h.life -= SIM_DT;
        h.acc += SIM_DT;
        if (h.acc >= st.T.dotTick - 1e-9) {
          const amount = h.dps * h.acc;
          h.acc = 0;
          for (let i = 0; i < st.players.length; i++) {
            const s = st.players[i];
            const o = ents[s];
            if (o.hp > 0 && Math.abs(o.x - h.x) <= h.half + st.rts[s].radius * 0.5) dealDamage(st, s, amount, 'fire', h.owner, true, 1, NaN, false);
          }
        }
        if (h.life <= 0) endHazard(st, h);
        break;
      }
      case H_WAVE: {
        if (h.warn > 0) {
          h.warn -= SIM_DT;
          const t = telegraphOf(st, h.teleId);
          if (t) t.remaining = Math.max(0, h.warn);
          const t2 = h.attack === 'mud_wave' ? telegraphOf(st, brt.bTelegraph) : undefined;
          if (t2) t2.remaining = Math.max(0, h.warn);
          if (h.warn > 1e-9) break;
          removeTelegraph(st, h.teleId);
          h.teleId = NONE;
          if (t2) {
            removeTelegraph(st, brt.bTelegraph);
            brt.bTelegraph = NONE;
          }
          if (h.fx === NONE && !h.carry) {
            const fx = spawnEffect(st, h.attack, h.attack === 'mud_wave' ? 'fx_smoke_puff' : 'fx_shockwave', h.x, middleRowY(st), 0, 30);
            h.fx = ents[fx].id;
          }
          h.moving = true;
          if (h.carry) setAct(boss, 'attack', h.attack);
        }
        const x0 = h.x;
        h.x += h.v * SIM_DT;
        const done = (h.x - h.x1) * Math.sign(h.v) >= 0;
        if (done) h.x = h.x1;
        const lo = Math.min(x0, h.x) - h.width / 2;
        const hi = Math.max(x0, h.x) + h.width / 2;
        for (let i = 0; i < st.players.length; i++) {
          const s = st.players[i];
          const o = ents[s];
          if (o.hp <= 0 || h.hit.includes(o.id)) continue;
          const r = st.rts[s].radius;
          if (o.x + r < lo || o.x - r > hi) continue;
          if (h.gapL === h.gapL && o.x >= h.gapL && o.x <= h.gapR) continue; // standing in the safe gap
          h.hit.push(o.id);
          hazardHit(st, h, s, h.x - h.v);
        }
        if (h.carry) {
          boss.x = h.x;
          boss.facing = h.v > 0 ? 1 : -1;
        }
        const fx = byId(st, h.fx);
        if (fx) fx.x = h.x;
        if (done) {
          if (h.carry && h.passes > 1) {
            // double charge: turn around and ride back after a fresh warning
            h.passes--;
            h.hit.length = 0;
            const back = h.x0;
            h.x0 = h.x1;
            h.x1 = back;
            h.v = -h.v;
            h.warn = h.warnTotal = h.bounceWarn;
            h.teleId = addTelegraph(st, h.owner, 'band', (h.x0 + h.x1) / 2, Math.abs(h.x1 - h.x0), h.warnTotal);
            setAct(boss, 'telegraph', h.attack);
            h.moving = false;
          } else {
            if (h.carry && boss.x < brt.bX0 - 1) brt.bA = brt.bX0; // ride home during recover
            endHazard(st, h);
          }
        }
        break;
      }
      case H_RING: {
        if (h.warn > 0) {
          h.warn -= SIM_DT;
          const t = telegraphOf(st, h.teleId);
          if (t) t.remaining = Math.max(0, h.warn);
          if (h.warn > 1e-9) break;
          removeTelegraph(st, h.teleId);
          h.teleId = NONE;
          h.acc = 0; // current radius
          const fx = spawnEffect(st, h.attack, 'fx_shockwave', h.x, middleRowY(st), 0, h.radius / Math.max(1, h.v) + 0.2);
          h.fx = ents[fx].id;
        }
        const r0 = h.acc;
        h.acc = Math.min(h.radius, h.acc + h.v * SIM_DT);
        const fx = byId(st, h.fx);
        if (fx) fx.value = h.acc;
        for (let i = 0; i < st.players.length; i++) {
          const s = st.players[i];
          const o = ents[s];
          if (o.hp <= 0 || h.hit.includes(o.id)) continue;
          const d = Math.abs(o.x - h.x);
          const r = st.rts[s].radius;
          if (d + r < r0 - h.width / 2 || d - r > h.acc + h.width / 2) continue;
          h.hit.push(o.id);
          hazardHit(st, h, s, h.x);
        }
        if (h.acc >= h.radius) endHazard(st, h);
        break;
      }
      case H_BEAM: {
        if (h.warn > 0) {
          h.warn -= SIM_DT;
          const t = telegraphOf(st, h.teleId);
          if (t) t.remaining = Math.max(0, h.warn);
          if (h.warn > 1e-9) break;
          removeTelegraph(st, h.teleId);
          h.teleId = NONE;
        }
        const x0 = h.x;
        h.x += h.v * SIM_DT;
        let turned = false;
        if (h.x <= h.x0) {
          h.x = h.x0;
          turned = true;
        } else if (h.x >= h.x1) {
          h.x = h.x1;
          turned = true;
        }
        const lo = Math.min(x0, h.x) - h.width / 2;
        const hi = Math.max(x0, h.x) + h.width / 2;
        for (let i = 0; i < st.players.length; i++) {
          const s = st.players[i];
          const o = ents[s];
          if (o.hp <= 0 || h.hit.includes(o.id)) continue;
          const r = st.rts[s].radius * 0.5;
          if (o.x + r < lo || o.x - r > hi) continue;
          h.hit.push(o.id);
          hazardHit(st, h, s, h.x);
        }
        const fx = byId(st, h.fx);
        if (fx) fx.x = h.x;
        if (turned) {
          h.passes--;
          h.hit.length = 0;
          h.v = -h.v;
          if (h.passes <= 0) endHazard(st, h);
        }
        break;
      }
      default:
        endHazard(st, h);
    }
  }
  void w;
}

function fireStrike(st: GState, h: Hazard, boss: { id: number; x: number; y: number; facing: 1 | -1 }, bossSlot: number): void {
  const w = st.data.balance.world;
  if (h.emerge) {
    boss.x = h.x;
    st.rts[bossSlot].hidden = false;
    restartAnim(st.world.entities[bossSlot], 'attack', h.attack);
  }
  hitArea(st, h, h.x, h.half);
  if (h.hitsBook && Math.abs(w.bookX - h.x) <= h.half) damageBook(st, h.damage);
  st.bus.emit('spectacle:hit', { x: h.x, y: middleRowY(st), big: h.damage >= st.T.bigHit });
}

