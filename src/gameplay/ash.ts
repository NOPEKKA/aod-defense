/**
 * Ash: spawn + book init (wave start), walking / facing / dodge (order 100),
 * auto-attack (order 400, called from combat.ts).
 *
 * Facing (SPEC §2): the move direction while walking, otherwise the nearest live hostile.
 * Attack: melee when a ground hostile is within balance.ash.melee range in front,
 * otherwise the shotgun at the nearest hostile in front within its range.
 */
import { SIM_DT, type InputFrame, type SimContext } from '../contracts';
import { applyStatus, dealDamage, heal, statusOf } from './damage';
import { aimY, alloc, muzzleY, shotFromAttack, spawnProjectile } from './pool';
import { byId, setAnim, type GState } from './state';
import { nearestHostile } from './targeting';
import { ASH_SPAWN_OFFSET, ATTACK_ANIM_TIME, BODY_RADIUS, HIT_HEIGHT } from './tuning';

const INF = Number.POSITIVE_INFINITY;

export function ashInit(st: GState, ctx: SimContext): void {
  const b = ctx.data.balance;
  const mods = ctx.services.mods;
  const slot = alloc(st, 'ash', 'player', 'ash', 'ash', b.world.stairsX + ASH_SPAWN_OFFSET, b.world.groundY);
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  e.hp = e.maxHp = Math.max(1, mods.apply(b.ash.stats.hp, 'ash.hp'));
  e.armor = b.ash.stats.armor;
  e.size = 'normal';
  e.anim = 'idle';
  rt.role = 'none';
  rt.attack = b.ash.stats.attack;
  rt.radius = BODY_RADIUS.normal;
  rt.hitY = HIT_HEIGHT.normal;
  ctx.world.ashId = e.id;
  st.bus.emit('entity:spawned', { id: e.id, kind: e.kind, defId: e.defId, x: e.x, y: e.y });

  const bookHp = Math.max(1, mods.apply(b.book.hp, 'castle.book.hp'));
  ctx.world.book.hp = bookHp;
  ctx.world.book.maxHp = bookHp;

  const d = ctx.world.dodge;
  d.unlocked = false; // dodge is phase 5; the 'dodge' command still works once something sets unlocked
  d.cooldownLeft = 0;
  d.cooldownTotal = mods.apply(b.ash.dodge.cooldown, 'ash.dodge.cooldown');

  const a = st.ash;
  a.meleeTimer = 0;
  a.gunTimer = 0;
  a.buffLeft = 0;
  a.buffMeleeMul = 1;
  a.buffSpeedMul = 1;
  a.buffLifesteal = 0;
  a.dodgeLeft = 0;
  a.dodgeV = 0;
}

export function ashInput(st: GState, ctx: SimContext, input: InputFrame): void {
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
    if (a.dodgeLeft > 0) return;
    a.dodgeLeft = 0;
  }
  if (statusOf(ash, 'stun')) {
    setAnim(ash, 'stunned');
    return;
  }
  const speed = ctx.services.mods.apply(ctx.data.balance.ash.stats.speed, 'ash.speed');
  if (input.move !== 0) {
    ash.x = Math.max(w.ashMinX, Math.min(w.ashMaxX, ash.x + input.move * speed * SIM_DT));
    ash.facing = input.move;
  } else {
    const t = nearestHostile(st, ash.x, INF, true, 0);
    if (t >= 0) {
      const tx = st.world.entities[t].x;
      if (tx !== ash.x) ash.facing = tx > ash.x ? 1 : -1;
    }
  }
  if (rt.animHold > 0 && (ash.anim === 'attack' || ash.anim === 'cast')) return;
  setAnim(ash, input.move !== 0 ? 'walk' : 'idle');
}

export function dodgeCommand(st: GState, ctx: SimContext): void {
  const d = ctx.world.dodge;
  if (!d.unlocked || d.cooldownLeft > 0) return;
  const ash = byId(st, ctx.world.ashId);
  if (!ash || ash.hp <= 0 || statusOf(ash, 'stun') || st.ash.dodgeLeft > 0) return;
  const b = ctx.data.balance;
  const dur = Math.max(SIM_DT, b.ash.dodge.invuln);
  st.ash.dodgeLeft = dur;
  st.ash.dodgeV = (ash.facing * b.ash.dodge.distance) / dur;
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
  a.meleeTimer = Math.max(0, a.meleeTimer - SIM_DT * (buffed ? a.buffSpeedMul : 1));
  a.gunTimer = Math.max(0, a.gunTimer - SIM_DT);
  if (!ash || ash.hp <= 0 || a.dodgeLeft > 0 || statusOf(ash, 'stun')) return;
  const slot = st.idSlot.get(ash.id)!;
  const rt = st.rts[slot];
  const b = ctx.data.balance.ash;
  const mods = ctx.services.mods;

  const melee = b.melee;
  const mt = nearestHostile(st, ash.x, melee.range, melee.hitsFlying, ash.facing);
  if (mt >= 0) {
    if (a.meleeTimer > 0) return;
    const ents = st.world.entities;
    const dmg = mods.apply(melee.damage, 'ash.melee.damage') * (buffed ? a.buffMeleeMul : 1);
    st.bus.emit('entity:attack', { id: ash.id, targetId: ents[mt].id, x: ash.x, y: ash.y, ranged: false });
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
          if (chosen.includes(s) || !o.alive || o.hp <= 0 || (o.flying && !melee.hitsFlying)) continue;
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
    a.meleeTimer = melee.interval;
    setAnim(ash, 'attack');
    ash.animTime = 0;
    rt.animHold = ATTACK_ANIM_TIME;
    return;
  }

  const gun = b.stats.attack;
  const gt = nearestHostile(st, ash.x, gun.range, gun.hitsFlying, ash.facing);
  if (gt < 0 || a.gunTimer > 0) return;
  const te = st.world.entities[gt];
  const dmg = mods.apply(gun.damage, 'ash.gun.damage');
  const shot = shotFromAttack(gun, 'player', ash.id, dmg);
  shot.x = ash.x + ash.facing * 12;
  shot.y = muzzleY(ash);
  shot.targetX = te.x;
  shot.targetY = aimY(te);
  shot.flyLayer = te.flying;
  shot.fromAsh = true;
  spawnProjectile(st, shot);
  a.gunTimer = Math.max(0.05, mods.apply(gun.interval, 'ash.gun.interval'));
  st.bus.emit('entity:attack', { id: ash.id, targetId: te.id, x: ash.x, y: ash.y, ranged: true });
  setAnim(ash, 'attack');
  ash.animTime = 0;
  rt.animHold = ATTACK_ANIM_TIME;
}
