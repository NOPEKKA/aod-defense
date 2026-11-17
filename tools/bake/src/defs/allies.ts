/**
 * Player-side sprites: Ash, troops, heroes, friendly NPCs, and their portraits.
 * Owner: allies art agent. See docs/ART_BIBLE.md for the roster and conventions.
 *
 * Conventions: allies are baked facing right (facing: 1). A unit with a shield is
 * mirrored (mirror: true) so the shield is on the camera side. Use CharOpts.scale
 * for size (1 = 165 px tall body), never heightPx, so proportions stay consistent.
 *
 * Every sprite's animations go through `anims()`, which resets the procedural
 * tweaks (bone nudges, prop visibility, flames) before each frame's own `apply`,
 * so nothing leaks from one animation into the next.
 */
import * as THREE from 'three';
import { byName, pose } from '../assets';
import { character, type Built } from '../character';
import { definePortrait } from '../icon';
import { at, boomstick, chainsaw, glow } from '../props';
import { stunStars } from '../props_allies';
import { defineSprite, type AnimDef } from '../sprite';

const ADV = '/kaykit/adventurers';
const RAD = Math.PI / 180;

/** Arthur's blue: [top, bottom] gradients for palette cells */
export const BLUE: [string, string] = ['#4a86e8', '#1f4396'];
export const BLUE_LIGHT: [string, string] = ['#7fb0ff', '#2f62c4'];

// ---------------------------------------------------------------------------
// shared animation helpers
// ---------------------------------------------------------------------------

export type Apply = (b: Built, u: number, frame: number) => void;
export type Anims = Record<string, AnimDef>;

/** remember the rest transform of a part so `restoreParts` can put it back each frame */
export function remember(b: Built): void {
  for (const o of Object.values(b.parts)) {
    o.userData.rest = { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), v: o.visible };
  }
  b.root.userData.rest = { p: b.root.position.clone(), q: b.root.quaternion.clone(), s: b.root.scale.clone() };
}

export function restoreParts(b: Built): void {
  for (const o of Object.values(b.parts)) {
    const r = o.userData.rest as { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; v: boolean } | undefined;
    if (!r) continue;
    o.position.copy(r.p);
    o.quaternion.copy(r.q);
    o.scale.copy(r.s);
    o.visible = r.v;
  }
  const rr = b.root.userData.rest as { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 } | undefined;
  if (rr) {
    b.root.position.copy(rr.p);
    b.root.quaternion.copy(rr.q);
    b.root.scale.copy(rr.s);
  }
}

/**
 * Wrap a sprite's animations: before each frame, parts and the root go back to their rest
 * transform, then `every` (flames, stars...) and the animation's own apply run.
 */
export function anims(list: Anims, every?: (b: Built, u: number, frame: number, anim: string) => void): Anims {
  const out: Anims = {};
  for (const [name, a] of Object.entries(list)) {
    const own = a.apply;
    out[name] = {
      ...a,
      apply: (b, u, frame) => {
        restoreParts(b);
        every?.(b, u, frame, name);
        own?.(b, u, frame);
      },
    };
  }
  return out;
}

/** build wrapper that records rest transforms (needed by `anims`) */
export function rested(build: () => Promise<Built>): () => Promise<Built> {
  return async () => {
    const b = await build();
    remember(b);
    return b;
  };
}

/** nudge a bone after the clip pose, degrees in the bone's local axes */
export function nudge(b: Built, bone: string, x: number, y = 0, z = 0): void {
  const o = byName(b.root, bone);
  if (x) o.rotateX(x * RAD);
  if (y) o.rotateY(y * RAD);
  if (z) o.rotateZ(z * RAD);
}

/** a smooth 0..1..0 bump over [a, b] */
export function bump(u: number, a: number, b: number): number {
  if (u <= a || u >= b) return 0;
  return Math.sin(((u - a) / (b - a)) * Math.PI);
}

/** stunned sway: head and spine circle, stars spin above the head */
export function stunSway(b: Built, u: number): void {
  const w = u * Math.PI * 2;
  nudge(b, 'spine', 6 + 3 * Math.cos(w), 0, 7 * Math.sin(w));
  nudge(b, 'head', 10 + 8 * Math.cos(w + 0.8), 8 * Math.sin(w), 12 * Math.sin(w + 0.8));
  const stars = b.parts.stars;
  if (stars) {
    stars.visible = true;
    (stars.children[0].userData.spin as (u: number) => void)(u);
  }
}

/** circling stars above the head, hidden unless an animation shows them */
export function addStars(b: Built, y = 1.32): void {
  const head = byName(b.root, 'head');
  const holder = new THREE.Group();
  holder.add(stunStars(4, 0.5));
  holder.position.set(0, y, 0);
  holder.visible = false;
  head.add(holder);
  b.parts.stars = holder;
}

// ---------------------------------------------------------------------------
// Ash: our own hero design on the Rogue rig. Blue shirt, short dark hair, a
// chainsaw for a right hand and the boomstick in his left. The rig is
// right-handed, so the model is mirrored: rig-right (gun) becomes his left
// hand and rig-left (saw) his right.
// ---------------------------------------------------------------------------
async function buildAshBase(): Promise<Built> {
  const b = await character({
    base: `${ADV}/Rogue.glb`,
    hide: ['Rogue_Cape'],
    recolor: {
      '0,1': BLUE, // tunic -> blue shirt
      '1,1': BLUE_LIGHT, // trim
      '3,2': ['#8a6a4a', '#4f3a28'], // trousers
    },
    // short-haired head from the Knight, hair repainted dark
    parts: [{ from: `${ADV}/Knight.glb`, mesh: 'Knight_Head', replace: 'Rogue_Head', recolor: { '1,0': ['#4f392b', '#1a120d'] } }],
    attach: [
      { to: 'handslot.r', object: boomstick(), rot: [0, 90, 0], pos: [0.02, 0.02, 0], as: 'gun' },
      { to: 'handslot.l', object: at(chainsaw(), 0, 0, 0), rot: [-90, 0, 0], pos: [0, 0.05, 0], scale: 0.85, as: 'saw' },
    ],
    scale: 1.02,
    mirror: true,
  });
  addStars(b);
  return b;
}


/** curl into a ball: thighs up, shins folded, back rounded */
function tuck(b: Built, k = 1): void {
  for (const s of ['l', 'r']) {
    nudge(b, `upperleg.${s}`, -100 * k);
    nudge(b, `lowerleg.${s}`, 125 * k);
  }
  nudge(b, 'spine', 30 * k);
  nudge(b, 'chest', 22 * k);
  nudge(b, 'head', 12 * k);
}

/** forward roll through the enemy line: frames 1-4 tumble once round the waist, 0 and 5 crouch and land */
const ROLL_DEG = [0, 75, 165, 255, 335, 0];
const roll: Apply = (b, _u, frame) => {
  if (frame === 0 || frame === 5) return;
  pose(b.inst!, 'Idle', 0);
  tuck(b);
  const th = ROLL_DEG[frame] * RAD;
  const h = 1.05;
  const drop = 0.28;
  b.root.rotateX(th);
  b.root.position.set(0, h - h * Math.cos(th) - drop, -h * Math.sin(th));
};

/** spell glow in the chainsaw hand, swelling round the moment the spell goes off */
const castGlow: Apply = (b, u) => {
  const g = b.parts.magic;
  const k = bump(u, 0.2, 1.05);
  g.visible = k > 0.05;
  g.scale.setScalar(0.4 + 0.9 * k);
};

async function buildAshFull(): Promise<Built> {
  const b = await buildAshBase();
  // our-side magic: pale blue core with a gold halo (ART_BIBLE palette)
  const magic = new THREE.Group();
  magic.add(glow(0xffe7a0, 0.75, 0.8), glow(0xbfe6ff, 0.42, 1));
  magic.position.set(0, 0.25, 0.1);
  magic.visible = false;
  byName(b.root, 'handslot.l').add(magic);
  b.parts.magic = magic;
  return b;
}

export const buildAsh = rested(buildAshFull);

const ashAnims = anims({
  idle: { clip: 'Idle', frames: 8, loop: true },
  walk: { clip: 'Running_A', frames: 12, loop: true },
  // default attack = chainsaw slash; 'attack:shoot' = boomstick (EntityState.action 'shoot')
  attack: { clip: 'Dualwield_Melee_Attack_Slice', from: 0.1, to: 1.15, frames: 10, duration: 0.5, hitAt: 0.52 },
  'attack:shoot': { clip: '1H_Ranged_Shoot', from: 0.15, to: 0.9, frames: 8, duration: 0.45, hitAt: 0.2 },
  cast: { clip: 'Spellcast_Long', from: 0.05, to: 1.45, frames: 8, duration: 0.6, hitAt: 0.5, apply: castGlow },
  hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
  stunned: { clip: 'Idle', frames: 6, loop: true, duration: 0.8, apply: stunSway },
  dodge: { clip: 'Dodge_Forward', frames: 6, duration: 0.35, apply: roll },
  die: { clip: 'Death_A', frames: 10, duration: 0.9 },
  cheer: { clip: 'Cheer', from: 0.2, to: 1.35, frames: 10, loop: true },
});

defineSprite({ id: 'ash', build: buildAsh, facing: 1, anims: ashAnims });
defineSprite({ id: 'ash_left', build: buildAsh, facing: -1, anims: ashAnims });
definePortrait('portrait_ash', 'allies', buildAsh);

// ---------------------------------------------------------------------------
// Swordsman: Knight with sword and round blue-and-white shield, Arthur's blue.
// ---------------------------------------------------------------------------
async function buildSwordsman(): Promise<Built> {
  return character({
    base: `${ADV}/Knight.glb`,
    hands: ['1H_Sword'],
    recolor: { '0,1': BLUE },
    attach: [{ to: 'handslot.l', object: `${ADV}/props/shield_round_color.gltf`, pos: [0, 0.02, 0.16], recolor: { '2,2': BLUE }, as: 'shield' }],
    mirror: true,
  });
}

defineSprite({
  id: 'unit_swordsman',
  facing: 1,
  build: buildSwordsman,
  anims: {
    idle: { clip: 'Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_A', frames: 12, loop: true },
    attack: { clip: '1H_Melee_Attack_Chop', frames: 10, duration: 0.6, hitAt: 0.45 },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
    die: { clip: 'Death_A', frames: 10, duration: 0.9 },
  },
});
definePortrait('portrait_unit_swordsman', 'allies', buildSwordsman);
