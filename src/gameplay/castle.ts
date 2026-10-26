/**
 * Castle defenses (order 500), all bought with gold (level 0 = not built):
 *   wall archers  castle.archers.count  -> that many archers, each shoots every balance.castle.archers.interval
 *   wall catapult castle.catapult.level -> splash rock at the densest cluster (x <= maxX); higher levels fire faster
 *   pit           castle.pit.level      -> trapdoor at balance.world.pit: opens when >= minEnemies ground
 *                                          non-boss hostiles stand on it; everything on it (or knocked into it
 *                                          while open) dies (cause 'pit'). Cooldown 30 s -> 14 s by level. [เดา] mechanism
 * plus book regeneration from castle.book.regen (base 0).
 */
import { SIM_DT, type SimContext } from '../contracts';
import { kill } from './damage';
import { spawnProjectile, shotScratch, aimY } from './pool';
import { NONE, refreshLists, type GState } from './state';
import { densestHostiles } from './targeting';
import { CATAPULT_INTERVAL_STEP, PIT_MAX_LEVEL, PIT_MIN_COOLDOWN, PIT_OPEN_TIME, WALL_SHOOTER_DX, WALL_SHOOTER_HEIGHT } from './tuning';

export function castleInit(st: GState, ctx: SimContext): void {
  const m = ctx.services.mods;
  const c = st.castle;
  const lv = c;
  c.archers = Math.max(0, Math.floor(m.apply(0, 'castle.archers.count') + 1e-6));
  c.catapult = Math.max(0, Math.floor(m.apply(0, 'castle.catapult.level') + 1e-6));
  c.pit = Math.max(0, Math.floor(m.apply(0, 'castle.pit.level') + 1e-6));
  c.regen = Math.max(0, m.apply(0, 'castle.book.regen'));
  const cfg = ctx.data.balance.castle;
  c.archerTimers.length = 0;
  // stagger the archers so they do not all fire on the same tick
  for (let i = 0; i < lv.archers; i++) c.archerTimers.push((cfg.archers.interval * (i + 1)) / (lv.archers + 1));
  c.catapultTimer = catapultInterval(st, ctx) * 0.5;
  c.pitCooldown = 0;
  c.pitOpen = 0;
}

function catapultInterval(st: GState, ctx: SimContext): number {
  const base = ctx.data.balance.castle.catapult.interval;
  return base * Math.max(0.2, 1 - CATAPULT_INTERVAL_STEP * Math.max(0, st.castle.catapult - 1));
}

function pitCooldown(st: GState, ctx: SimContext): number {
  const base = ctx.data.balance.castle.pit.cooldown;
  const t = PIT_MAX_LEVEL > 1 ? Math.min(1, (st.castle.pit - 1) / (PIT_MAX_LEVEL - 1)) : 1;
  return base - (base - Math.min(base, PIT_MIN_COOLDOWN)) * Math.max(0, t);
}

export function castleTick(st: GState, ctx: SimContext): void {
  const lv = st.castle;
  const book = ctx.world.book;
  if (lv.regen > 0 && book.hp > 0 && book.hp < book.maxHp) book.hp = Math.min(book.maxHp, book.hp + lv.regen * SIM_DT);
  if (lv.archers === 0 && lv.catapult === 0 && lv.pit === 0) return;
  refreshLists(st);
  const cfg = ctx.data.balance.castle;
  const w = ctx.data.balance.world;
  const ents = st.world.entities;
  const c = st.castle;
  const wallX = w.castleRight + WALL_SHOOTER_DX;
  const wallY = w.groundY - WALL_SHOOTER_HEIGHT;

  // wall archers: shoot the hostile closest to the castle within maxX (flyers included)
  for (let i = 0; i < c.archerTimers.length; i++) {
    c.archerTimers[i] = Math.max(0, c.archerTimers[i] - SIM_DT);
    if (c.archerTimers[i] > 0) continue;
    let best = -1;
    for (let k = 0; k < st.hostiles.length; k++) {
      const o = ents[st.hostiles[k]];
      if (o.hp <= 0 || o.x > cfg.archers.maxX) continue;
      if (best < 0 || o.x < ents[best].x) best = st.hostiles[k];
    }
    if (best < 0) continue;
    const t = ents[best];
    const s = shotScratch;
    s.sprite = 'arrow';
    s.team = 'player';
    s.ownerId = NONE;
    s.x = wallX;
    s.y = wallY;
    s.targetX = t.x;
    s.targetY = aimY(t);
    s.damage = cfg.archers.damage;
    s.range = cfg.archers.maxX - wallX;
    s.pierce = 0;
    s.hitsFlying = true;
    s.flyLayer = t.flying;
    s.splash = 0;
    s.armorPierce = false;
    s.bonusVsLarge = 1;
    s.burnDps = 0;
    s.burnDur = 0;
    s.kind = 'pierce';
    s.arc = false;
    s.toBook = false;
    s.fromAsh = false;
    spawnProjectile(st, s);
    c.archerTimers[i] = cfg.archers.interval;
    st.bus.emit('castle:shot', { source: 'archer', x: t.x, y: t.y });
  }

  // wall catapult
  if (lv.catapult > 0) {
    c.catapultTimer = Math.max(0, c.catapultTimer - SIM_DT);
    if (c.catapultTimer <= 0) {
      const x = densestHostiles(st, 0, cfg.catapult.maxX, cfg.catapult.radius, cfg.catapult.maxX, false);
      if (x === x) {
        const s = shotScratch;
        s.sprite = 'rock';
        s.team = 'player';
        s.ownerId = NONE;
        s.x = wallX;
        s.y = wallY;
        s.targetX = x;
        s.targetY = w.groundY - 20;
        s.damage = cfg.catapult.damage;
        s.range = cfg.catapult.maxX;
        s.pierce = 0;
        s.hitsFlying = false;
        s.flyLayer = false;
        s.splash = cfg.catapult.radius;
        s.armorPierce = false;
        s.bonusVsLarge = 1;
        s.burnDps = 0;
        s.burnDur = 0;
        s.kind = 'physical';
        s.arc = true;
        s.toBook = false;
        s.fromAsh = false;
        spawnProjectile(st, s);
        c.catapultTimer = catapultInterval(st, ctx);
        st.bus.emit('castle:shot', { source: 'catapult', x, y: w.groundY });
      }
    }
  }

  // pit trap
  if (lv.pit > 0) {
    c.pitCooldown = Math.max(0, c.pitCooldown - SIM_DT);
    c.pitOpen = Math.max(0, c.pitOpen - SIM_DT);
    if (c.pitOpen <= 0 && c.pitCooldown <= 0) {
      let on = 0;
      for (let k = 0; k < st.hostiles.length; k++) {
        const o = ents[st.hostiles[k]];
        if (o.hp > 0 && o.kind === 'enemy' && !o.flying && o.x >= w.pit.left && o.x <= w.pit.right) on++;
      }
      if (on >= cfg.pit.minEnemies) {
        c.pitOpen = PIT_OPEN_TIME;
        c.pitCooldown = pitCooldown(st, ctx);
      }
    }
    if (c.pitOpen > 0) {
      let killed = 0;
      for (let k = 0; k < st.hostiles.length; k++) {
        const s = st.hostiles[k];
        const o = ents[s];
        if (o.hp > 0 && o.kind === 'enemy' && !o.flying && o.x >= w.pit.left && o.x <= w.pit.right) {
          kill(st, s, null, 'pit');
          killed++;
        }
      }
      if (killed > 0) st.bus.emit('castle:pit', { killed });
    }
  }
}
