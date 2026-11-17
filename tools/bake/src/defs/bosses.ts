/**
 * Boss sprites and portraits. Owner: bosses art agent. See docs/ART_BIBLE.md section 5.3.
 * All bosses are baked facing left (facing: -1).
 */
import * as THREE from 'three';
import { character, type Built } from '../character';
import { definePortrait } from '../icon';
import { at, boomstick, glow } from '../props';
import { batWing, claws, horn, spikedHelm } from '../props_bosses';
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
      { to: 'head', object: horn(0.2), pos: [0.2, 0.6, 0], rot: [0, 0, -35], as: 'hornl' },
      { to: 'head', object: horn(0.2), pos: [-0.2, 0.6, 0], rot: [0, 0, 35], scale: [-1, 1, 1], as: 'hornr' },
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
}, { yaw: -32, span: 2.1, lookAt: [-0.02, 2.65, 0] });


// ---------------------------------------------------------------------------
// Evil Ash: undead warlord. Knight body in black plate, green face, spiked helm, red tattered cape,
// two-handed sword. Carries a boomstick, a book and fire glows that are shown per animation.
// ---------------------------------------------------------------------------
const BLACK: [string, string] = ['#4a4a58', '#15151c'];
async function buildEvilAsh() {
  const b = await character({
    base: `${ADV}/Knight.glb`,
    hide: ['Knight_Helmet'],
    recolor: {
      '0,0': ['#a4c896', '#587f5a'], // green skin
      '1,0': ['#3a2a2a', '#120c0c'],
      '3,0': BLACK,
      '7,0': ['#5a5a6a', '#22222c'],
      '6,0': ['#3a2a30', '#14101a'],
      '4,0': ['#2a2a34', '#0e0e14'],
      '7,1': ['#6a2a2a', '#2a0e12'],
      '0,1': ['#c02a2a', '#3a0a12'], // cape and trim: blood red
      '2,1': ['#3a3340', '#18141c'],
      '1,1': ['#7a6a4a', '#3a2c1a'],
    },
    borrow: [
      { from: `${ADV}/Knight.glb`, node: '2H_Sword', as: 'sword', recolor: { '3,1': ['#8a90a0', '#2a2e3a'], '5,1': ['#c02a2a', '#5a0a12'] } },
      { from: `${ADV}/Mage.glb`, node: 'Spellbook_open', as: 'book' },
    ],
    attach: [
      { to: 'head', object: spikedHelm(), pos: [0, 0.58, -0.02], scale: 1.7, as: 'helm' },
      { to: 'head', object: glow('#ff4030', 0.2, 0.9), pos: [0, 0.2, 0.2] },
      { to: 'handslot.r', object: boomstick(), rot: [0, 90, 0], pos: [0.02, 0.02, 0], as: 'gun' },
      { to: 'chest', object: glow('#ffa030', 0.9, 0.8), pos: [0, 0.8, 0.1], as: 'fire' },
      { to: 'handslot.l', object: glow('#7dff5a', 0.5, 0.9), pos: [0, 0.2, 0], as: 'drain' },
      { to: 'handslot.r', object: glow('#b05cff', 0.5, 0.9), pos: [0, 0.2, 0], as: 'summonfx' },
    ],
    clipsFrom: [`${SKE}/Skeleton_Warrior.glb`],
    scale: 1.75,
  });
  return b;
}
type Load = 'sword' | 'gun' | 'book';
const loadout = (b: Built, w: Load, fx: Array<'fire' | 'drain' | 'summonfx'> = []): void => {
  b.parts.sword.visible = w === 'sword';
  b.parts.gun.visible = w === 'gun';
  b.parts.book.visible = w === 'book';
  for (const k of ['fire', 'drain', 'summonfx']) b.parts[k].visible = (fx as string[]).includes(k);
};
const wrap = (d: AnimDef, w: Load, fx: Array<'fire' | 'drain' | 'summonfx'> = [], extra?: (b: Built, u: number) => void): AnimDef => ({
  ...d,
  apply: (b, u, f) => {
    loadout(b, w, fx);
    extra?.(b, u);
    d.apply?.(b, u, f);
  },
});

const ashAnimsBoss: Record<string, AnimDef> = {
  idle: wrap({ clip: '2H_Melee_Idle', frames: 6, loop: true }, 'sword'),
  walk: wrap({ clip: 'Walking_C', frames: 8, loop: true }, 'sword'),
  hurt: wrap({ clip: 'Hit_A', frames: 3, duration: 0.3 }, 'sword'),
  die: wrap({ clip: 'Death_B', frames: 9, duration: 1.1, to: 2.1 }, 'sword'),
  'telegraph:melee_combo': wrap({ clip: '2H_Melee_Attack_Slice', frames: 4, duration: 0.6, from: 0, to: 0.4 }, 'sword'),
  'attack:melee_combo': wrap({ clip: '2H_Melee_Attack_Slice', frames: 7, duration: 0.6, from: 0.3, to: 1.1, hitAt: 0.4 }, 'sword'),
  'telegraph:summon': wrap({ clip: 'Spellcast_Raise', frames: 4, duration: 0.8, from: 0, to: 1.4 }, 'sword', ['summonfx']),
  'attack:summon': wrap({ clip: 'Spellcast_Summon', frames: 6, duration: 0.9, from: 1.0, to: 2.8, hitAt: 0.45 }, 'sword', ['summonfx']),
  'telegraph:shotgun_line': wrap({ clip: '2H_Ranged_Aiming', frames: 4, duration: 0.6, from: 0, to: 0.8 }, 'gun'),
  'attack:shotgun_line': wrap({ clip: '2H_Ranged_Shoot', frames: 6, duration: 0.5, hitAt: 0.3 }, 'gun'),
  'telegraph:ground_wave': wrap({ clip: '2H_Melee_Attack_Chop', frames: 4, duration: 0.7, from: 0, to: 0.6 }, 'sword', [], (b, u) => { b.root.position.y = 0.25 * Math.sin(u * Math.PI * 0.5); }),
  'attack:ground_wave': wrap({ clip: '2H_Melee_Attack_Chop', frames: 6, duration: 0.5, from: 0.6, to: 1.3, hitAt: 0.5 }, 'sword'),
  'telegraph:drain_book': wrap({ clip: 'Spellcast_Raise', frames: 4, duration: 0.8, from: 0, to: 1.4 }, 'book', ['drain']),
  'attack:drain_book': wrap({ clip: 'Spellcasting', frames: 6, duration: 0.9, loop: false, hitAt: 0.5 }, 'book', ['drain']),
  'telegraph:fire_storm': wrap({ clip: 'Cheer', frames: 4, duration: 0.9, from: 0, to: 0.8 }, 'sword', ['fire']),
  'attack:fire_storm': wrap({ clip: 'Spellcast_Long', frames: 6, duration: 1.0, from: 0.3, to: 2.4, hitAt: 0.5 }, 'sword', ['fire']),
};

defineSprite({ id: 'boss_evil_ash', facing: -1, build: buildEvilAsh, anims: ashAnimsBoss });
definePortrait('portrait_boss_evil_ash', 'bosses', async () => buildEvilAsh(), { yaw: -32, span: 2.2, lookAt: [-0.02, 2.8, 0] });
