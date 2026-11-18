/**
 * Ash: spawn + book init (wave start), walking / facing / dodge (order 100),
 * auto-attack (order 400, called from combat.ts).
 *
 * Facing (SPEC §2): the move direction while walking, otherwise the nearest live hostile.
 * Attack: the chainsaw when a ground hostile is within balance.ash.melee range in front,
 * otherwise the shotgun at the nearest hostile in front within its range.
 * Both wind up (SPEC v2.3: balance.ash.melee.windup / balance.ash.stats.attack.windup):
 * anim 'attack' with action 'melee' or 'shoot'; the hit lands / the shot leaves after the
 * windup if the target is still live and in reach + combat.windupSlack, else it whiffs.
 *
 * Dodge roll (SPEC 6.0): unlocked from balance.ash.dodge.unlockWave (and in endless),
 * rolls `distance` px the way Ash faces with `invuln` seconds of invulnerability.
 * Relic doppel_boomstick (flag double_shot): a second shotgun shot after
 * combat.relic.doubleShotDelay.
 */
import { SIM_DT, type InputFrame, type SimContext } from '../contracts';
import { applyStatus, dealDamage, heal, statusOf } from './damage';
import { aimAt, aimFrom, alloc, shotFromAttack, spawnProjectile } from './pool';
import { byId, isLive, NONE, restartAnim, setAnim, type GState } from './state';
import { nearestHostile } from './targeting';

const INF = Number.POSITIVE_INFINITY;
const W_MELEE = 1;
const W_GUN = 2;

export function ashInit(st: GState, ctx: SimContext): void {
  const b = ctx.data.balance;
  const mods = ctx.services.mods;
  const w = b.world;
  const rows = w.laneRows;
  const y = w.groundY + (rows.length > 0 ? rows[Math.floor(rows.length / 2)] : 0);
  const slot = alloc(st, 'ash', 'player', 'ash', 'ash', w.stairsX + st.T.ashSpawnOffset, y);
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  e.hp = e.maxHp = Math.max(1, mods.apply(b.ash.stats.hp, 'ash.hp'));
  e.armor = b.ash.stats.armor;
  e.size = 'normal';
  e.anim = 'idle';
  rt.role = 'none';
  rt.attack = b.ash.stats.attack;
  rt.radius = st.T.bodyRadius.normal;
  rt.hitH = st.T.hitHeight.normal;
  rt.laneY = y;
  ctx.world.ashId = e.id;
  st.bus.emit('entity:spawned', { id: e.id, kind: e.kind, defId: e.defId, x: e.x, y: e.y });

  const bookHp = Math.max(1, mods.apply(b.book.hp, 'castle.book.hp'));
  ctx.world.book.hp = bookHp;
  ctx.world.book.maxHp = bookHp;

  const d = ctx.world.dodge;
  d.unlocked = ctx.wave.endless || ctx.wave.wave >= b.ash.dodge.unlockWave;
  d.cooldownLeft = 0;
  d.cooldownTotal = Math.max(0, mods.apply(b.ash.dodge.cooldown, 'ash.dodge.cooldown'));

  const a = st.ash;
  a.meleeTimer = 0;
  a.gunTimer = 0;
  a.buffLeft = 0;
  a.buffMeleeMul = 1;
  a.buffSpeedMul = 1;
  a.buffLifesteal = 0;
  a.dodgeLeft = 0;
  a.dodgeV = 0;
  a.wKind = 0;
  a.wTimer = 0;
  a.wTarget = NONE;
  a.shot2Left = 0;
  a.shot2Target = NONE;
}

/** Out-of-combat regen: after ash.regenDelay s without damage Ash slowly heals (one heal event a second). */
function ashRegen(st: GState, ctx: SimContext): void {
  const slot = st.idSlot.get(ctx.world.ashId);
  if (slot === undefined) return;
  const ash = st.world.entities[slot];
  const rt = st.rts[slot];
  if (!ash.alive || ash.hp <= 0 || ash.hp >= ash.maxHp || ctx.world.time - rt.hurtAt < st.T.ashRegenDelay) {
    rt.regenAcc = 0;
    return;
  }
  const perSec = ash.maxHp * st.T.ashRegenPerSec;
  rt.regenAcc += perSec * SIM_DT;
  if (rt.regenAcc >= Math.max(1, perSec)) {
    heal(st, ash, rt.regenAcc);
    rt.regenAcc = 0;
  }
}

export function ashInput(st: GState, ctx: SimContext, input: InputFrame): void {
  ashRegen(st, ctx);
  const d = ctx.world.dodge;
  d.cooldownLeft = Math.max(0, d.cooldownLeft - SIM_DT);
  const a = st.ash;
  if (a.buffLeft > 0) {
    a.buffLeft -= SIM_DT;
    if (a.buffLeft <= 0) {
      a.buffLeft = 0;
      a.buffMeleeMul = 1;
      a.buffSpeedMul = 1;
      a.buffLifesteal = 0;
    }
  }
  const ash = byId(st, ctx.world.ashId);
  if (!ash || ash.hp <= 0) return;
  const rt = st.rts[st.idSlot.get(ash.id)!];
  const w = ctx.data.balance.world;
  if (a.dodgeLeft > 0) {
    ash.x = Math.max(w.ashMinX, Math.min(w.ashMaxX, ash.x + a.dodgeV * SIM_DT));
    a.dodgeLeft -= SIM_DT;
    setAnim(ash, 'dodge');
    if (a.dodgeLeft > 1e-9) return;
    a.dodgeLeft = 0;
  }
  if (statusOf(ash, 'stun')) {
    a.wKind = 0;
    setAnim(ash, 'stunned');
    return;
  }
  const speed = ctx.services.mods.apply(ctx.data.balance.ash.stats.speed, 'ash.speed');
  // Held against the lane edge counts as standing still (SPEC §2: face the walk direction only while walking).
  const blocked = (input.move < 0 && ash.x <= w.ashMinX) || (input.move > 0 && ash.x >= w.ashMaxX);
  const walking = input.move !== 0 && !blocked;
  if (walking) {
    ash.x = Math.max(w.ashMinX, Math.min(w.ashMaxX, ash.x + input.move * speed * SIM_DT));
    ash.facing = input.move as 1 | -1;
  } else if (a.wKind === 0) {
    const t = nearestHostile(st, ash.x, INF, true, 0);
    if (t >= 0) {
      const tx = st.world.entities[t].x;
      if (tx !== ash.x) ash.facing = tx > ash.x ? 1 : -1;
    }
  }
  if (rt.animHold > 0 && (ash.anim === 'attack' || ash.anim === 'cast')) return;
  setAnim(ash, walking ? 'walk' : 'idle');
}

export function dodgeCommand(st: GState, ctx: SimContext): void {
  const d = ctx.world.dodge;
  if (!d.unlocked || d.cooldownLeft > 0) return;
  const ash = byId(st, ctx.world.ashId);
  if (!ash || ash.hp <= 0 || statusOf(ash, 'stun') || st.ash.dodgeLeft > 0) return;
  const b = ctx.data.balance;
  // a whole number of ticks, so the roll covers exactly `distance`
  const dur = Math.max(1, Math.round(b.ash.dodge.invuln / SIM_DT)) * SIM_DT;
  st.ash.dodgeLeft = dur;
  st.ash.dodgeV = (ash.facing * b.ash.dodge.distance) / dur;
  st.ash.wKind = 0; // rolling cancels a swing
  applyStatus(st, ash, 'invuln', dur, 1);
  const toX = Math.max(b.world.ashMinX, Math.min(b.world.ashMaxX, ash.x + ash.facing * b.ash.dodge.distance));
  setAnim(ash, 'dodge');
  d.cooldownLeft = d.cooldownTotal;
  st.bus.emit('ash:dodged', { fromX: ash.x, toX });
  st.bus.emit('spectacle:action', { action: 'dodge', x: ash.x, y: ash.y });
}

/** Ash's auto-attack (order 400). */
export function ashCombat(st: GState): void {
  const ctx = st.ctx!;
  const ash = byId(st, st.world.ashId);
  const a = st.ash;
  const buffed = a.buffLeft > 0;
  const meleeRate = buffed ? a.buffSpeedMul : 1;
  a.meleeTimer = Math.max(0, a.meleeTimer - SIM_DT * meleeRate);
  a.gunTimer = Math.max(0, a.gunTimer - SIM_DT);
  if (!ash || ash.hp <= 0) return;
  const slot = st.idSlot.get(ash.id)!;
  // relic double_shot: the second shot follows the first even while Ash rolls
  if (a.shot2Left > 0) {
    a.shot2Left -= SIM_DT;
    if (a.shot2Left <= 0) {
      a.shot2Left = 0;
      const t = byId(st, a.shot2Target);
      if (isLive(t)) fireShotgun(st, slot, st.idSlot.get(t.id)!);
    }
  }
  if (a.dodgeLeft > 0 || statusOf(ash, 'stun')) {
    a.wKind = 0;
    return;
  }
  const b = ctx.data.balance.ash;
  const melee = b.melee;
  const gun = b.stats.attack;

  if (a.wKind !== 0) {
    a.wTimer -= SIM_DT * (a.wKind === W_MELEE ? meleeRate : 1);
    if (a.wTimer <= 1e-9) resolveSwing(st, slot);
    return;
  }

  const mt = nearestHostile(st, ash.x, melee.range, melee.hitsFlying, ash.facing);
  if (mt >= 0) {
    if (a.meleeTimer > 0) return;
    a.meleeTimer = melee.interval;
    startSwing(st, slot, W_MELEE, mt, melee.windup, melee.interval / meleeRate);
    return;
  }
  const gt = nearestHostile(st, ash.x, gun.range, gun.hitsFlying, ash.facing);
  if (gt < 0 || a.gunTimer > 0) return;
  const interval = Math.max(0.05, ctx.services.mods.apply(gun.interval, 'ash.gun.interval'));
  a.gunTimer = interval;
  startSwing(st, slot, W_GUN, gt, gun.windup, interval);
}

function startSwing(st: GState, slot: number, kind: number, target: number, windup: number, interval: number): void {
  const ash = st.world.entities[slot];
  const te = st.world.entities[target];
  const a = st.ash;
  a.wKind = kind;
  a.wTimer = windup;
  a.wTarget = te.id;
  if (te.x !== ash.x) ash.facing = te.x > ash.x ? 1 : -1;
  restartAnim(ash, 'attack', kind === W_MELEE ? 'melee' : 'shoot');
  st.rts[slot].animHold = Math.min(interval, windup + st.T.attackFollowThrough);
  st.bus.emit('entity:attack', { id: ash.id, targetId: te.id, x: ash.x, y: ash.y, ranged: kind === W_GUN });
  if (windup <= 1e-9) resolveSwing(st, slot);
}

/** The windup is over: land the chainsaw / fire the shotgun, or whiff. */
function resolveSwing(st: GState, slot: number): void {
  const ash = st.world.entities[slot];
  const a = st.ash;
  const b = st.ctx!.data.balance.ash;
  const kind = a.wKind;
  a.wKind = 0;
  const t = byId(st, a.wTarget);
  const ts = t ? st.idSlot.get(t.id)! : -1;
  const reach = kind === W_MELEE ? b.melee.range : b.stats.attack.range;
  if (!isLive(t) || st.rts[ts].hidden || Math.abs(t.x - ash.x) - st.rts[ts].radius > reach + st.T.windupSlack) {
    st.stats.whiffs++;
    return;
  }
  if (kind === W_MELEE) meleeHit(st, slot, ts);
  else {
    fireShotgun(st, slot, ts);
    if (st.relic.doubleShot) {
      a.shot2Left = Math.max(SIM_DT, st.T.doubleShotDelay);
      a.shot2Target = t.id;
    }
  }
}

function meleeHit(st: GState, slot: number, mt: number): void {
  const ctx = st.ctx!;
  const ash = st.world.entities[slot];
  const a = st.ash;
  const buffed = a.buffLeft > 0;
  const melee = ctx.data.balance.ash.melee;
  const ents = st.world.entities;
  const dmg = ctx.services.mods.apply(melee.damage, 'ash.melee.damage') * (buffed ? a.buffMeleeMul : 1) * armyMul(st, ash);
  let dealt = dealDamage(st, mt, dmg, melee.damageKind, ash.id, melee.armorPierce, melee.bonusVsLarge, NaN, true);
  if (melee.maxTargets > 1) {
    const chosen = st.scratch;
    chosen.length = 0;
    chosen.push(mt);
    for (let n = 1; n < melee.maxTargets; n++) {
      let best = -1;
      let bestD = INF;
      for (let i = 0; i < st.hostiles.length; i++) {
        const s = st.hostiles[i];
        const o = ents[s];
        if (chosen.includes(s) || !o.alive || o.hp <= 0 || (o.flying && !melee.hitsFlying) || st.rts[s].hidden) continue;
        const r = st.rts[s].radius;
        if ((o.x - ash.x) * ash.facing < -r) continue;
        const dd = Math.abs(o.x - ash.x) - r;
        if (dd <= melee.range && dd < bestD) {
          bestD = dd;
          best = s;
        }
      }
      if (best < 0) break;
      chosen.push(best);
      dealt += dealDamage(st, best, dmg, melee.damageKind, ash.id, melee.armorPierce, melee.bonusVsLarge, NaN, true);
    }
  }
  if (buffed && a.buffLifesteal > 0 && dealt > 0) heal(st, ash, dealt * a.buffLifesteal);
}

/** Ash does not get Arthur's aura, only the rally horn */
function armyMul(st: GState, ash: { team: string }): number {
  return ash.team === 'player' && st.army.left > 0 ? 1 + st.army.damage : 1;
}

function fireShotgun(st: GState, slot: number, gt: number): void {
  const ctx = st.ctx!;
  const ash = st.world.entities[slot];
  const te = st.world.entities[gt];
  const gun = ctx.data.balance.ash.stats.attack;
  const dmg = ctx.services.mods.apply(gun.damage, 'ash.gun.damage') * armyMul(st, ash);
  const shot = shotFromAttack(gun, 'player', ash.id, dmg);
  aimFrom(st, shot, ash, st.rts[slot]);
  aimAt(shot, te, st.rts[gt], true);
  shot.flyLayer = te.flying;
  shot.fromAsh = true;
  spawnProjectile(st, shot);
}

