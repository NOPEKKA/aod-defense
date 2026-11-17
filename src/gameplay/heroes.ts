/**
 * Hero abilities that are not part of a hit (SPEC 6.1), run at order 400 before the
 * unit attacks. On-hit abilities (silver_mark, shred, lifesteal) live in combat.ts.
 *
 *   vigil_light  (Morwen)  aura: hostiles inside are slowed; flyers inside take more damage ('vigil')
 *   matins_flare (Morwen)  every `interval` s: stun hostiles within `radius` (bosses x boss.stunMul)
 *   chain_drag   (Garrick) every `interval` s: pull the nearest flyer or boss within `range` down
 *                          ('grounded': flying=false so melee can hit it; a walking boss is rooted)
 *   taunt        (Evil Ash hero) every `interval` s: enemies within `radius` attack the hero ('taunt'
 *                          status, magnitude = hero entity id)
 * Abilities that fire play anim 'cast' with action = the behavior id.
 */
import { SIM_DT } from '../contracts';
import { applyStatus, setStatus, statusOf } from './damage';
import { restartAnim, type GState } from './state';

/** vigil statuses are refreshed every tick and last this long after leaving the light */
const VIGIL_LINGER = 0.25;

export function heroesTick(st: GState): void {
  const ents = st.world.entities;
  for (let i = 0; i < st.players.length; i++) {
    const s = st.players[i];
    const e = ents[s];
    if (e.kind !== 'hero' || e.hp <= 0) continue;
    const rt = st.rts[s];
    if (rt.vigilRadius > 0) {
      for (let k = 0; k < st.hostiles.length; k++) {
        const hs = st.hostiles[k];
        const o = ents[hs];
        if (o.hp <= 0 || Math.abs(o.x - e.x) > rt.vigilRadius) continue;
        if (rt.vigilSlow > 0) applyStatus(st, o, 'slow', VIGIL_LINGER, rt.vigilSlow);
        if (o.flying && rt.vigilFlyMul > 1) applyStatus(st, o, 'vigil', VIGIL_LINGER, rt.vigilFlyMul - 1);
      }
    }
    if (statusOf(e, 'stun')) continue;
    if (rt.flareInterval > 0) {
      rt.flareTimer -= SIM_DT;
      if (rt.flareTimer <= 0) {
        let hit = 0;
        for (let k = 0; k < st.hostiles.length; k++) {
          const o = ents[st.hostiles[k]];
          if (o.hp <= 0 || Math.abs(o.x - e.x) > rt.flareRadius) continue;
          applyStatus(st, o, 'stun', o.kind === 'boss' ? rt.flareStun * st.T.bossStunMul : rt.flareStun, 1);
          hit++;
        }
        if (hit > 0) {
          rt.flareTimer = rt.flareInterval;
          cast(st, s, 'matins_flare');
        } else rt.flareTimer = 0; // ready, waits for a target
      }
    }
    if (rt.dragInterval > 0) {
      rt.dragTimer -= SIM_DT;
      if (rt.dragTimer <= 0) {
        let best = -1;
        let bestD = Number.POSITIVE_INFINITY;
        for (let k = 0; k < st.hostiles.length; k++) {
          const hs = st.hostiles[k];
          const o = ents[hs];
          if (o.hp <= 0 || st.rts[hs].hidden) continue;
          if (!o.flying && o.kind !== 'boss') continue;
          if (statusOf(o, 'grounded')) continue;
          const d = Math.abs(o.x - e.x);
          if (d <= rt.dragRange && d < bestD) {
            bestD = d;
            best = hs;
          }
        }
        if (best >= 0) {
          const o = ents[best];
          if (o.flying) {
            setStatus(st, o, 'grounded', rt.dragDuration, 1);
            o.flying = false;
          } else applyStatus(st, o, 'root', rt.dragDuration, 1);
          rt.dragTimer = rt.dragInterval;
          cast(st, s, 'chain_drag');
          st.bus.emit('entity:attack', { id: e.id, targetId: o.id, x: e.x, y: e.y, ranged: true });
        } else rt.dragTimer = 0;
      }
    }
    if (rt.tauntInterval > 0) {
      rt.tauntTimer -= SIM_DT;
      if (rt.tauntTimer <= 0) {
        let hit = 0;
        for (let k = 0; k < st.hostiles.length; k++) {
          const o = ents[st.hostiles[k]];
          if (o.hp <= 0 || o.kind !== 'enemy' || Math.abs(o.x - e.x) > rt.tauntRadius) continue;
          setStatus(st, o, 'taunt', rt.tauntDuration, e.id);
          hit++;
        }
        if (hit > 0) {
          rt.tauntTimer = rt.tauntInterval;
          cast(st, s, 'taunt');
        } else rt.tauntTimer = 0;
      }
    }
  }
}

function cast(st: GState, slot: number, action: string): void {
  const e = st.world.entities[slot];
  const rt = st.rts[slot];
  if (rt.wState !== 0) return; // keep the swing anim; the ability still fired
  restartAnim(e, 'cast', action);
  rt.animHold = st.T.castAnimTime;
}
