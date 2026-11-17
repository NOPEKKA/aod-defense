/**
 * Boss sprites and portraits. Owner: bosses art agent. See docs/ART_BIBLE.md section 5.3.
 * All bosses are baked facing left (facing: -1).
 */
import * as THREE from 'three';
import { character, type Built } from '../character';
import { definePortrait } from '../icon';
import { at, glow } from '../props';
import { batWing, claws, horn } from '../props_bosses';
import { defineSprite, type AnimDef } from '../sprite';

const ADV = '/kaykit/adventurers';
const SKE = '/kaykit/skeletons';
const RAD = Math.PI / 180;

const set = (o: THREE.Object3D | undefined, x: number, y: number, z: number): void => {
  if (o) o.rotation.set(x * RAD, y * RAD, z * RAD);
};

// ---------------------------------------------------------------------------
// Sheila, winged demon. Mage body and head, green skin, torn white dress, bat wings, horns.
// Hovers: the game lifts the sprite by `alt`; the bake keeps feet near the baseline and bobs.
// ---------------------------------------------------------------------------
async function buildSheila() {
  const b = await character({
    base: `${ADV}/Mage.glb`,
    hide: ['Mage_Hat', 'Mage_Cape'],
    recolor: {
      '0,0': ['#9fc79a', '#5f8f62'], // sickly green skin
      '0,1': ['#ece6dc', '#8d8798'], // torn white dress
      '5,0': ['#5a2a6a', '#2a1236'],
    },
    attach: [
      { to: 'chest', object: batWing(1.2, 0x7a4a9a, 0x2a1830), pos: [0.1, 0.12, -0.16], rot: [0, 28, 0], as: 'wl' },
      { to: 'chest', object: batWing(1.2, 0x7a4a9a, 0x2a1830), pos: [-0.1, 0.12, -0.16], rot: [0, -28, 0], scale: [-1, 1, 1], as: 'wr' },
      { to: 'head', object: horn(0.2), pos: [0.12, 0.22, 0], rot: [0, 0, -38], as: 'hornl' },
      { to: 'head', object: horn(0.2), pos: [-0.12, 0.22, 0], rot: [0, 0, 38], scale: [-1, 1, 1], as: 'hornr' },
      { to: 'handslot.l', object: claws(), rot: [0, 0, 0] },
      { to: 'handslot.r', object: claws(), rot: [0, 0, 0] },
      { to: 'head', object: glow('#ff4030', 0.22, 0.9), pos: [0.0, 0.1, 0.2] },
    ],
    clipsFrom: [`${SKE}/Skeleton_Warrior.glb`],
    scale: 1.8,
  });
  return b;
}

const flap = (b: Built, a: number, spread = 0): void => {
  const l = b.parts.wl;
  const r = b.parts.wr;
  if (l) l.rotation.set(0, 28 * RAD + spread, a);
  if (r) r.rotation.set(0, -28 * RAD - spread, -a);
};
const cyc = (u: number, k = 1): number => Math.sin(u * Math.PI * 2 * k);
/** hover bob + wing flap on top of a clip */
const hover = (amp = 0.06, flapAmp = 0.55, base = 0.25, k = 1) => (b: Built, u: number): void => {
  b.root.position.y = 0.25 + amp * cyc(u, k);
  flap(b, base + flapAmp * cyc(u, k));
};

const sheilaAnims: Record<string, AnimDef> = {
  idle: { clip: 'Idle', frames: 6, loop: true, apply: hover(0.05, 0.32, 0.15) },
  walk: { clip: 'Walking_B', frames: 8, loop: true, stride: 40, apply: hover(0.06, 0.4, 0.15) },
  hurt: { clip: 'Hit_B', frames: 3, duration: 0.35, apply: (b, u) => { b.root.position.y = 0.25; flap(b, 0.7 - 0.3 * u); } },
  die: {
    clip: 'Death_B', frames: 9, duration: 1.0, to: 2.1,
    apply: (b, u) => { b.root.position.y = 0.25 * (1 - Math.min(1, u * 1.6)); flap(b, 0.7 - 1.0 * u, -0.2 * u); },
  },
  'telegraph:swoop': {
    clip: 'Dodge_Backward', frames: 4, duration: 0.8, from: 0, to: 0.4,
    apply: (b, u) => { b.root.position.y = 0.4 + 0.15 * u; b.root.position.z -= 0.0; flap(b, 0.4 + 0.5 * u, 0.1 * u); },
  },
  'attack:swoop': {
    clip: 'Running_A', frames: 6, duration: 0.5, from: 0.1, to: 0.5, hitAt: 0.5,
    apply: (b, u) => {
      b.root.position.y = 0.6 - 0.45 * Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.9);
      b.root.rotation.x = 0.7 * Math.sin(u * Math.PI);
      flap(b, -0.5 - 0.2 * cyc(u * 2), -0.3);
    },
  },
  'telegraph:summon': {
    clip: 'Spellcast_Raise', frames: 4, duration: 0.8, from: 0, to: 1.4,
    apply: (b, u) => { b.root.position.y = 0.25 + 0.15 * u; flap(b, 0.3 + 0.5 * u); },
  },
  'attack:summon': {
    clip: 'Spellcast_Summon', frames: 6, duration: 0.9, from: 0.9, to: 2.6, hitAt: 0.45,
    apply: (b, u) => { b.root.position.y = 0.4 + 0.04 * cyc(u); flap(b, 0.5 + 0.3 * cyc(u * 2)); },
  },
  'telegraph:scream': {
    clip: 'Unarmed_Idle', frames: 4, duration: 0.8,
    apply: (b, u) => { b.root.position.y = 0.25 + 0.2 * u; b.root.rotation.x = -0.35 * u; flap(b, 0.2 + 0.7 * u, 0.25 * u); },
  },
  'attack:scream': {
    clip: 'Taunt', frames: 6, duration: 0.8, from: 0.1, to: 0.9, hitAt: 0.35,
    apply: (b, u) => { b.root.position.y = 0.4; b.root.rotation.x = -0.35; flap(b, 0.9 + 0.1 * cyc(u * 4), 0.3); },
  },
};

defineSprite({ id: 'boss_sheila_demon', facing: -1, build: buildSheila, anims: sheilaAnims, margin: 0.2 });
definePortrait('portrait_boss_sheila_demon', 'bosses', async () => {
  const b = await buildSheila();
  return b;
}, { yaw: -32, span: 1.9, lookAt: [-0.02, 2.6, 0] });

void at;
