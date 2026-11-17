/**
 * Order 300: forced motion, targeting, movement and formation.
 *
 * The lane is 1-D in x. Allies walk right (+1), enemies walk left (-1). Depth rows
 * (e.y) are visual only and never read here. Height (e.alt) is animated here for
 * knockback hops, leaps and flyers.
 *
 * Each side is split into formation layers (Rt.role):
 *   front     melee; stops at the first opposing body
 *   second    second_row melee; stands one spacing behind the front line, hits over it
 *   back      ranged / healer; stops once a target is in range, behind the lines
 *   artillery enemy catapults: own queue so they never hold up the ranged line
 *   fly       flyers (enemy): ignore bodies, chase Ash or the book
 *   siege     battering ram: ignores bodies, slowed while pushing through them
 * Inside a layer units keep `spacing` (centre to centre) behind the nearest settled
 * unit ahead, so they never stack on one x. Rows alternate round-robin per layer, so
 * with allySpacing 30 and 3 rows, units in the same row stand ~90 px apart.
 *
 * Constraints are split into HARD (overlap with an opposing body / the unit ahead:
 * the unit steps back if violated) and SOFT (hold point, in-range stop,
 * stay-behind-the-line: the unit only stops advancing, except while retreating to the
 * rally hold line).
 *
 * Windup (SPEC v2.3): a unit in the middle of a swing does not move.
 * Rally (SPEC v2.5): in 'hold', allies with no hostile within ai.rallyEngageRange
 * walk back to stairsX + holdAheadOfStairs and wait there.
 * Book siege (SPEC v2.7): near the book enemies close ranks (ai.bookSpacing) so every
 * enemy within combat.bookSiegeRange can hit the book at once.
 */
import { SIM_DT, type EntityState } from '../contracts';
import { bossMove } from './bosses';
import { statusMag, statusOf } from './damage';
import { byId, setAnim, W_WINDUP, type GState, type Role, type Rt } from './state';
import { densestPlayers, nearestHostile, nearestPlayer } from './targeting';

const INF = Number.POSITIVE_INFINITY;

export function aiTick(st: GState): void {
  const ents = st.world.entities;
  const w = st.data.balance.world;
  const T = st.T;
  const decay = st.data.balance.combat.knockbackDecay;
  // 1. forced motion (knockback hop, leaps) for every live body
  for (let s = 0; s < ents.length; s++) {
    const e = ents[s];
    if (!e.alive || e.hp <= 0) continue;
    if (e.kind === 'projectile' || e.kind === 'pickup' || e.kind === 'effect') continue;
    const rt = st.rts[s];
    if (rt.kbV !== 0) {
      const x0 = e.x;
      e.x += rt.kbV * SIM_DT;
      const dv = decay * SIM_DT;
      rt.kbV = Math.abs(rt.kbV) <= dv ? 0 : rt.kbV - Math.sign(rt.kbV) * dv;
      e.x = Math.max(w.bookX, Math.min(w.enemySpawnX, e.x));
      rt.kbLeft = Math.max(0, rt.kbLeft - Math.abs(e.x - x0));
      if (!e.flying && rt.leapLeft <= 0) {
        const u = rt.kbDist > 0 ? 1 - rt.kbLeft / rt.kbDist : 1;
        e.alt = rt.kbV === 0 ? 0 : rt.kbDist * T.knockbackHop * 4 * u * (1 - u);
      }
    }
    if (rt.leapLeft > 0) {
      e.x += rt.leapV * SIM_DT;
      rt.leapLeft = Math.max(0, rt.leapLeft - SIM_DT);
      e.x = Math.max(w.bookX, e.x);
      const u = 1 - rt.leapLeft / T.leapTime;
      e.alt = T.leapHeight * 4 * u * (1 - u);
      if (rt.leapLeft <= 0) {
        e.alt = 0;
        setAnim(e, 'walk');
      }
    }
  }

  // 2. player side
  const sp = st.data.balance.combat.allySpacing;
  const front = layerPass(st, 'player', 'front', sp, -INF, -INF);
  const second = layerPass(st, 'player', 'second', sp, front, -INF);
  layerPass(st, 'player', 'back', sp, front, second);

  // 3. enemy side
  const spE = sp * T.enemySpacingMul;
  const eFront = layerPass(st, 'enemy', 'front', spE, INF, INF);
  const eSecond = layerPass(st, 'enemy', 'second', spE, eFront, INF);
  layerPass(st, 'enemy', 'back', spE, eFront, eSecond);
  layerPass(st, 'enemy', 'artillery', spE, eFront, eSecond);
  for (let i = 0; i < st.hostiles.length; i++) {
    const s = st.hostiles[i];
    const rt = st.rts[s];
    if (rt.role === 'fly') flyerMove(st, s);
    else if (rt.role === 'siege') siegeMove(st, s);
    else if (rt.role === 'boss') bossMove(st, s);
  }
}

export function speedOf(st: GState, e: EntityState, rt: Rt): number {
  let v = rt.speed * Math.max(0, 1 - statusMag(e, 'slow'));
  if (e.team === 'player' && st.army.left > 0) v *= 1 + st.army.speed;
  return v;
}

function immobile(e: EntityState, rt: Rt): boolean {
  return rt.kbV !== 0 || rt.leapLeft > 0 || !!statusOf(e, 'stun') || !!statusOf(e, 'root');
}

/** reach an enemy needs to hit the book: melee enemies near the book may all hit it (SPEC v2.7) */
export function bookReach(st: GState, rt: Rt): number {
  if (!rt.attack) return 0;
  return rt.attack.kind === 'melee' ? Math.max(rt.range, st.T.bookSiegeRange) : rt.range;
}

/** insertion sort of st.layer by x * dir, descending (frontmost first); stable */
function sortLayer(st: GState, dir: number): void {
  const a = st.layer;
  const ents = st.world.entities;
  for (let i = 1; i < a.length; i++) {
    const v = a[i];
    const key = ents[v].x * dir;
    let j = i - 1;
    while (j >= 0 && ents[a[j]].x * dir < key) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = v;
  }
}

/**
 * Moves every unit of one layer. Returns the frontmost x of the layer
 * (max x for players, min x for enemies), or the neutral infinity if empty.
 * @param ref1 frontmost x of the front layer (or neutral)
 * @param ref2 frontmost x of the second layer (or neutral)
 */
function layerPass(st: GState, team: 'player' | 'enemy', role: Role, spacing: number, ref1: number, ref2: number): number {
  const player = team === 'player';
  const dir = player ? 1 : -1;
  const ents = st.world.entities;
  const src = player ? st.players : st.hostiles;
  const layer = st.layer;
  layer.length = 0;
  for (let i = 0; i < src.length; i++) {
    const s = src[i];
    const e = ents[s];
    if (e.kind === 'ash' || e.kind === 'boss' || e.hp <= 0) continue;
    if (st.rts[s].role === role) layer.push(s);
  }
  if (layer.length === 0) return player ? -INF : INF;
  sortLayer(st, dir);

  const w = st.data.balance.world;
  const T = st.T;
  const margin = T.reachMargin;
  const holding = player && st.world.rally === 'hold';
  const holdLine = w.stairsX + w.holdAheadOfStairs;
  let chain = dir * INF; // cap from the nearest settled unit ahead
  let frontmost = player ? -INF : INF;
  for (let k = 0; k < layer.length; k++) {
    const s = layer[k];
    const e = ents[s];
    const rt = st.rts[s];
    rt.settled = true;
    if (player ? e.x > frontmost : e.x < frontmost) frontmost = e.x;
    // close ranks around the book so every enemy in siege range can hit it
    const gap = !player && e.x - w.bookX <= T.bookSiegeRange ? Math.min(spacing, T.bookSpacing) : spacing;
    if (immobile(e, rt) || rt.wState === W_WINDUP) {
      if (statusOf(e, 'stun')) setAnim(e, 'stunned');
      chain = e.x - dir * gap;
      continue;
    }
    const hitsFlying = !!rt.attack && rt.attack.hitsFlying;
    const reach = rt.attack ? rt.range : 0;
    // in reach of something right now (either side) -> hold and fight
    let inReach = false;
    if (rt.attack) {
      if (player) inReach = nearestHostile(st, e.x, reach, hitsFlying, 0) >= 0;
      else if (rt.artilleryMin >= 0) {
        const ax = densestPlayers(st, e.x - reach, e.x - rt.artilleryMin, 40);
        inReach = ax === ax || e.x - w.bookX <= reach;
      } else inReach = nearestPlayer(st, e.x, reach, 0) >= 0 || e.x - w.bookX <= reach;
    }

    // ---- desired position ----
    let hard: number;
    let soft: number;
    let moveDir = dir;
    let retreat = false;
    if (player) {
      hard = blockAhead(st, s, 1);
      soft = w.allyHoldX;
      const ahead = nearestHostile(st, e.x, INF, hitsFlying, 1, !hitsFlying);
      if (ahead < 0) {
        // nothing ahead: go back and defend against anything that slipped behind
        const behind = nearestHostile(st, e.x, INF, hitsFlying, -1, !hitsFlying);
        if (behind >= 0 && ents[behind].x < e.x - st.rts[behind].radius) {
          moveDir = -1;
          const t = ents[behind];
          const tr = st.rts[behind].radius;
          const stop = role === 'front' ? t.x + tr + rt.radius : t.x + tr + Math.max(0, reach - margin);
          hard = blockAhead(st, s, -1);
          soft = inReach ? e.x : stop;
        }
      }
      if (moveDir === 1) {
        if (holding && !inReach && nearestHostile(st, e.x, T.rallyEngageRange, hitsFlying, 0, !hitsFlying) < 0) {
          // rally 'hold': fall back to the hold line and wait there
          retreat = true;
          let line = holdLine;
          if (role === 'second') line -= spacing;
          else if (role === 'back') line -= rt.keepBack > 0 ? rt.keepBack : 2 * spacing;
          soft = line;
        } else {
          if (role !== 'front' && ahead >= 0 && rt.attack) {
            const t = ents[ahead];
            soft = Math.min(soft, t.x - st.rts[ahead].radius - Math.max(0, reach - margin));
          }
          if (role === 'second' && ref1 > -INF) soft = Math.min(soft, ref1 - spacing);
          if (role === 'back') {
            // ranged and healers stay well behind the melee line; with no melee line they
            // hang back behind Ash (never past backSoloLine) instead of marching to the front
            const keep = rt.keepBack > 0 ? rt.keepBack : T.backKeepBack;
            const ref = ref2 > -INF ? ref2 : ref1;
            if (ref > -INF) soft = Math.min(soft, ref - keep);
            else {
              const ash = byId(st, st.world.ashId);
              const ashLine = ash && ash.hp > 0 ? ash.x - keep : -INF;
              soft = Math.min(soft, Math.max(T.backSoloLine, ashLine));
            }
          }
          if (inReach) soft = Math.min(soft, e.x);
        }
        hard = Math.min(hard, chain);
      }
    } else {
      const body = blockAhead(st, s, -1);
      hard = body;
      soft = w.bookX + Math.max(0, reach - margin);
      const ahead = nearestPlayer(st, e.x, INF, -1);
      if (role !== 'front' && ahead >= 0 && rt.attack) {
        const t = ents[ahead];
        soft = Math.max(soft, t.x + st.rts[ahead].radius + Math.max(0, reach - margin));
      }
      if (role === 'second' && ref1 < INF) soft = Math.max(soft, ref1 + spacing);
      if (role === 'back' || role === 'artillery') {
        const ref = ref2 < INF ? ref2 : ref1;
        if (ref < INF) soft = Math.max(soft, ref + spacing);
      }
      if (inReach) soft = Math.max(soft, e.x);
      hard = Math.max(hard, chain);
      // leap_once: first time we are stopped by a body, jump over it
      if (rt.leapDistance > 0 && !rt.leapUsed && body > -INF && e.x <= body + 1) {
        rt.leapUsed = true;
        rt.leapLeft = T.leapTime;
        rt.leapV = -rt.leapDistance / T.leapTime;
        e.facing = -1;
        setAnim(e, 'leap');
        rt.settled = false;
        chain = e.x - dir * spacing;
        continue;
      }
    }

    // ---- move ----
    const speed = speedOf(st, e, rt) * SIM_DT;
    let moved = 0;
    let target: number;
    if (moveDir === 1) {
      target = Math.min(hard, soft);
      if (e.x > hard + 0.5) moved = -Math.min(speed, e.x - hard);
      else if (e.x < target - 0.5) moved = Math.min(speed, target - e.x);
      else if (retreat && e.x > target + 0.5) moved = -Math.min(speed, e.x - target);
    } else {
      target = Math.max(hard, soft);
      if (e.x < hard - 0.5) moved = Math.min(speed, hard - e.x);
      else if (e.x > target + 0.5) moved = -Math.min(speed, e.x - target);
    }
    e.x += moved;
    rt.settled = moved === 0;
    const advancing = moved * moveDir > 0;
    if (moved !== 0) e.facing = moved > 0 ? 1 : -1;
    if (advancing && moveDir === dir) {
      // walking freely re-arms a charge (and a hero's hollow_spur first strike)
      if (rt.chargeKb > 0 || rt.chargeMul > 1 || st.relic.chargeBonus) {
        rt.chargeIdle += SIM_DT;
        if (rt.chargeIdle >= T.chargeRearm) {
          if (rt.chargeKb > 0 || rt.chargeMul > 1) rt.charged = true;
          else if (e.kind === 'hero') rt.firstStrike = true;
        }
      }
    } else rt.chargeIdle = 0;
    if (moved !== 0) setAnim(e, 'walk');
    else if (rt.animHold <= 0) setAnim(e, 'idle');
    if (retreat) chain = Math.min(e.x, target) - dir * spacing;
    else if (!advancing && moveDir === dir) chain = e.x - dir * gap;
  }
  return frontmost;
}

/**
 * Hard limit from opposing ground bodies in walking direction `dir`:
 * a player unit cannot pass hostile bodies ahead; an enemy cannot pass player bodies.
 */
function blockAhead(st: GState, slot: number, dir: number): number {
  const ents = st.world.entities;
  const me = ents[slot];
  const r = st.rts[slot].radius;
  const playerSide = me.team === 'player';
  const list = playerSide ? st.hostiles : st.players;
  let lim = dir > 0 ? INF : -INF;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const o = ents[s];
    if (!o.alive || o.hp <= 0 || o.flying) continue;
    const ort = st.rts[s];
    if (ort.hidden) continue;
    if (ort.role === 'siege' && !playerSide) continue;
    const dx = (o.x - me.x) * dir;
    if (dx < -0.5) continue; // behind us
    const edge = o.x - dir * (ort.radius + r);
    lim = dir > 0 ? Math.min(lim, edge) : Math.max(lim, edge);
  }
  return lim;
}

/** flyers ease their height toward `target` */
function easeAlt(st: GState, e: EntityState, target: number): void {
  const step = st.T.flyerAltSpeed * SIM_DT;
  const d = target - e.alt;
  e.alt = Math.abs(d) <= step ? target : e.alt + Math.sign(d) * step;
}

function flyerMove(st: GState, slot: number): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  if (e.hp <= 0) return;
  const grounded = !e.flying;
  if (immobile(e, rt) || rt.wState === W_WINDUP) {
    if (statusOf(e, 'stun')) setAnim(e, 'stunned');
    easeAlt(st, e, grounded ? 0 : e.alt);
    return;
  }
  const w = st.data.balance.world;
  const T = st.T;
  const ash = byId(st, st.world.ashId);
  let targetX = w.bookX;
  let targetR = 0;
  const wantsAsh = rt.flyer === 'ash' || (rt.flyer === 'ash_or_book' && !!ash && ash.hp > 0 && Math.abs(ash.x - e.x) <= T.flyerAshAggro);
  if (wantsAsh && ash && ash.hp > 0) {
    targetX = ash.x;
    targetR = st.rts[st.idSlot.get(ash.id)!].radius;
  }
  const dx = targetX - e.x;
  const reach = Math.abs(dx) - targetR;
  const stopAt = Math.max(0, rt.range - T.reachMargin);
  if (reach > stopAt) {
    const step = Math.min(speedOf(st, e, rt) * SIM_DT, reach - stopAt);
    e.x += Math.sign(dx) * step;
    e.facing = dx >= 0 ? 1 : -1;
    if (rt.animHold <= 0) setAnim(e, 'walk');
    easeAlt(st, e, grounded ? 0 : rt.baseAlt);
  } else {
    e.facing = dx >= 0 ? 1 : -1;
    if (rt.animHold <= 0) setAnim(e, 'idle');
    // dive to strike height
    easeAlt(st, e, grounded ? 0 : Math.min(rt.baseAlt, T.flyerDiveAlt));
  }
}

function siegeMove(st: GState, slot: number): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  if (e.hp <= 0) return;
  rt.settled = true;
  if (immobile(e, rt) || rt.wState === W_WINDUP) {
    if (statusOf(e, 'stun')) setAnim(e, 'stunned');
    return;
  }
  const w = st.data.balance.world;
  const stop = w.bookX + Math.max(0, rt.range - st.T.reachMargin);
  if (e.x <= stop) {
    if (rt.animHold <= 0) setAnim(e, 'idle');
    return;
  }
  // pushing through bodies slows it down
  let blocked = false;
  const ents = st.world.entities;
  for (let i = 0; i < st.players.length; i++) {
    const p = ents[st.players[i]];
    if (p.hp > 0 && Math.abs(p.x - e.x) < st.rts[st.players[i]].radius + rt.radius) {
      blocked = true;
      break;
    }
  }
  const speed = speedOf(st, e, rt) * (blocked ? 1 - rt.siegeSlow : 1) * SIM_DT;
  e.x = Math.max(stop, e.x - speed);
  e.facing = -1;
  rt.settled = false;
  setAnim(e, 'walk');
}
