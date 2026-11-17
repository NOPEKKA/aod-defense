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
import { dealDamage, kill } from './damage';
import { aimAt, blankShot, middleRowY, spawnProjectile } from './pool';
import { NONE, refreshLists, type GState } from './state';
import { densestHostiles } from './targeting';

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
  c.censerAcc = 0;
  syncWorld(st, ctx);
}

/** world.castle for render (pit lid, cooldown ring, archers on the wall, catapult). */
function syncWorld(st: GState, ctx: SimContext): void {
  const c = st.castle;
  const wc = ctx.world.castle;
  wc.pitOpen = c.pitOpen > 0;
  wc.pitCooldownLeft = c.pit > 0 ? c.pitCooldown : 0;
  wc.pitCooldownTotal = c.pit > 0 ? pitCooldown(st, ctx) : 0;
  wc.archers = c.archers;
  wc.catapultLevel = c.catapult;
}

function catapultInterval(st: GState, ctx: SimContext): number {
  const base = ctx.data.balance.castle.catapult.interval;
  return base * Math.max(0.2, 1 - st.T.catapultIntervalStep * Math.max(0, st.castle.catapult - 1));
}

function pitCooldown(st: GState, ctx: SimContext): number {
  const base = ctx.data.balance.castle.pit.cooldown;
  const t = st.T.pitMaxLevel > 1 ? Math.min(1, (st.castle.pit - 1) / (st.T.pitMaxLevel - 1)) : 1;
  return base - (base - Math.min(base, st.T.pitMinCooldown)) * Math.max(0, t);
}

export function castleTick(st: GState, ctx: SimContext): void {
  const c = st.castle;
  const book = ctx.world.book;
  if (c.regen > 0 && book.hp > 0 && book.hp < book.maxHp) book.hp = Math.min(book.maxHp, book.hp + c.regen * SIM_DT);
  refreshLists(st);
  const ents = st.world.entities;
  // relic censer_of_matins: holy damage to every hostile inside the castle zone
  if (st.relic.censer && st.T.censerDps > 0) {
    c.censerAcc += SIM_DT;
    if (c.censerAcc >= st.T.dotTick - 1e-9) {
      const amount = st.T.censerDps * c.censerAcc;
      c.censerAcc = 0;
      for (let k = 0; k < st.hostiles.length; k++) {
        const s = st.hostiles[k];
        const o = ents[s];
        if (o.hp > 0 && o.x <= st.T.censerMaxX) dealDamage(st, s, amount, 'holy', null, true, 1, NaN, false);
      }
    }
  }
  if (c.archers === 0 && c.catapult === 0 && c.pit === 0) {
    syncWorld(st, ctx);
    return;
  }
  const cfg = ctx.data.balance.castle;
  const w = ctx.data.balance.world;
  const wallX = w.castleRight + st.T.wallShooterDx;
  const wallY = middleRowY(st);
  const wallAlt = st.T.wallShooterHeight;

  // wall archers: shoot the hostile closest to the castle within maxX (flyers included)
  for (let i = 0; i < c.archerTimers.length; i++) {
    c.archerTimers[i] = Math.max(0, c.archerTimers[i] - SIM_DT);
    if (c.archerTimers[i] > 0) continue;
    let best = -1;
    for (let k = 0; k < st.hostiles.length; k++) {
      const hs = st.hostiles[k];
      const o = ents[hs];
      if (o.hp <= 0 || o.x > cfg.archers.maxX || st.rts[hs].hidden) continue;
      if (best < 0 || o.x < ents[best].x) best = hs;
    }
    if (best < 0) continue;
    const t = ents[best];
    const s = blankShot('arrow', 'player', NONE, cfg.archers.damage);
    s.x = wallX;
    s.y = wallY;
    s.alt = wallAlt;
    aimAt(s, t, st.rts[best], true);
    s.range = cfg.archers.maxX - wallX;
    s.hitsFlying = true;
    s.flyLayer = t.flying;
    s.kind = 'pierce';
    spawnProjectile(st, s);
    c.archerTimers[i] = cfg.archers.interval;
    st.bus.emit('castle:shot', { source: 'archer', x: t.x, y: t.y });
  }

  // wall catapult
  if (c.catapult > 0) {
    c.catapultTimer = Math.max(0, c.catapultTimer - SIM_DT);
    if (c.catapultTimer <= 0) {
      const x = densestHostiles(st, 0, cfg.catapult.maxX, cfg.catapult.radius, cfg.catapult.maxX, false);
      if (x === x) {
        const s = blankShot('rock', 'player', NONE, cfg.catapult.damage);
        s.x = wallX;
        s.y = wallY;
        s.alt = wallAlt;
        s.targetX = x;
        s.targetY = wallY;
        s.targetAlt = 0;
        s.range = cfg.catapult.maxX;
        s.splash = cfg.catapult.radius;
        s.lob = true;
        spawnProjectile(st, s);
        c.catapultTimer = catapultInterval(st, ctx);
        st.bus.emit('castle:shot', { source: 'catapult', x, y: wallY });
      }
    }
  }

  // pit trap
  if (c.pit > 0) {
    c.pitCooldown = Math.max(0, c.pitCooldown - SIM_DT);
    c.pitOpen = Math.max(0, c.pitOpen - SIM_DT);
    if (c.pitOpen <= 0 && c.pitCooldown <= 0) {
      let on = 0;
      for (let k = 0; k < st.hostiles.length; k++) {
        const o = ents[st.hostiles[k]];
        if (o.hp > 0 && o.kind === 'enemy' && !o.flying && o.alt <= 1 && o.x >= w.pit.left && o.x <= w.pit.right) on++;
      }
      if (on >= cfg.pit.minEnemies) {
        c.pitOpen = st.T.pitOpenTime;
        c.pitCooldown = pitCooldown(st, ctx);
      }
    }
    if (c.pitOpen > 0) {
      let killed = 0;
      for (let k = 0; k < st.hostiles.length; k++) {
        const s = st.hostiles[k];
        const o = ents[s];
        // a leaping hag in the air sails over the open pit
        if (o.hp > 0 && o.kind === 'enemy' && !o.flying && o.alt <= 1 && o.x >= w.pit.left && o.x <= w.pit.right) {
          kill(st, s, null, 'pit');
          killed++;
        }
      }
      if (killed > 0) st.bus.emit('castle:pit', { killed });
    }
  }
  syncWorld(st, ctx);
}
