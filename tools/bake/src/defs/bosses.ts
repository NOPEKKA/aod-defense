/**
 * Boss sprites and portraits. Owner: bosses art agent. See docs/ART_BIBLE.md section 5.3.
 * All bosses are baked facing left (facing: -1).
 */
import * as THREE from 'three';
import { character, type Built } from '../character';
import { definePortrait } from '../icon';
import { loadProp } from '../assets';
import { at, boomstick, cyl, glow } from '../props';
import { ghostHorse, type Leg } from '../props_bosses_horse';
import { batWing, cauldron, claws, horn, shovel, spikedHelm } from '../props_bosses';
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

// ---------------------------------------------------------------------------
// The Gravewright: giant skeleton gravedigger. Warrior skeleton, rogue hood, shovel, lantern, coffin on the back.
// ---------------------------------------------------------------------------
const HAL = '/kaykit/halloween';
async function buildGravewright() {
  const b = await character({
    base: `${SKE}/Skeleton_Warrior.glb`,
    hide: ['Skeleton_Warrior_Cloak', 'Skeleton_Warrior_Helmet'],
    recolor: { '3,0': ['#8a8f8a', '#3a3f3c'], '1,1': ['#d8ccb0', '#7a7260'], '2,2': ['#4a3a2a', '#1c140e'] },
    emissive: [{ node: 'Skeleton_Warrior_Eyes', color: 0xb05cff, intensity: 2.2 }],
    attach: [
      { to: 'handslot.r', object: shovel(), rot: [0, 0, 0], pos: [0, 0.05, 0], scale: 0.6, as: 'shovel' },
      { to: 'handslot.l', object: `${HAL}/lantern_hanging.gltf`, pos: [0, 0.05, 0.1], scale: 0.5, rot: [0, 0, 0], as: 'lantern' },
      { to: 'handslot.l', object: glow('#9dffb0', 0.16, 0.7), pos: [0, -0.3, 0.12] },
      { to: 'chest', object: `${HAL}/coffin_decorated.gltf`, pos: [0, 0.3, -0.42], rot: [0, 0, 78], scale: 0.6, as: 'coffin' },
    ],
    clipsFrom: [`${ADV}/Knight.glb`],
    scale: 2.4,
  });
  return b;
}
const gw = (d: AnimDef, coffin = true, extra?: (b: Built, u: number) => void): AnimDef => ({
  ...d,
  apply: (b, u, f) => {
    b.parts.coffin.visible = coffin;
    extra?.(b, u);
    d.apply?.(b, u, f);
  },
});
const gwAnims: Record<string, AnimDef> = {
  idle: gw({ clip: '2H_Melee_Idle', frames: 6, loop: true }),
  walk: gw({ clip: 'Walking_D_Skeletons', frames: 8, loop: true }),
  hurt: gw({ clip: 'Hit_B', frames: 3, duration: 0.35 }),
  die: gw({ clip: 'Death_C_Skeletons', frames: 8, duration: 1.0, to: 1.0 }),
  'telegraph:shovel_slam': gw({ clip: '2H_Melee_Attack_Chop', frames: 4, duration: 0.8, from: 0, to: 0.6 }),
  'attack:shovel_slam': gw({ clip: '2H_Melee_Attack_Chop', frames: 6, duration: 0.5, from: 0.6, to: 1.3, hitAt: 0.5 }),
  'telegraph:grave_hands': gw({ clip: 'PickUp', frames: 4, duration: 0.8, from: 0, to: 0.7 }),
  'attack:grave_hands': gw({ clip: 'Interact', frames: 6, duration: 0.7, hitAt: 0.5 }),
  'telegraph:burrow': gw({ clip: '2H_Melee_Attack_Stab', frames: 4, duration: 0.8, from: 0, to: 0.55 }),
  'attack:burrow': gw({ clip: '2H_Melee_Idle', frames: 6, duration: 0.8, hitAt: 0.6, clipGround: true }, true, (b, u) => { b.root.position.y = -3.4 * u * u; }),
  'telegraph:coffin_toss': gw({ clip: 'Throw', frames: 4, duration: 0.8, from: 0, to: 0.55 }),
  'attack:coffin_toss': gw({ clip: 'Throw', frames: 6, duration: 0.5, from: 0.55, to: 1.37, hitAt: 0.45 }, true, (b, u) => { b.parts.coffin.visible = u < 0.45; }),
};
defineSprite({ id: 'boss_gravewright', facing: -1, build: buildGravewright, anims: gwAnims });
definePortrait('portrait_boss_gravewright', 'bosses', async () => buildGravewright(), { yaw: -32, span: 1.9, lookAt: [-0.02, 2.7, 0], clip: 'Idle' });

// ---------------------------------------------------------------------------
// Mother Mire: bog witch waist-deep in a bubbling cauldron. Legs hidden, the pot never moves except
// for hops (walk) and tilts (mud wave).
// ---------------------------------------------------------------------------
async function buildMire() {
  const witch = await character({
    base: `${ADV}/Mage.glb`,
    hide: ['Mage_Cape', 'Mage_LegLeft', 'Mage_LegRight'],
    hands: [],
    recolor: {
      '0,0': ['#9bc48a', '#56804f'],
      '1,0': ['#ecece4', '#9a9a98'],
      '0,1': ['#55663f', '#1c2a1a'],
      '1,1': ['#3a2a4a', '#150e22'],
      '3,0': ['#6a5a3a', '#2a2214'],
    },
    attach: [
      { to: 'handslot.r', object: glow('#7dff5a', 0.35, 0.9), pos: [0, 0.2, 0], as: 'orb' },
      { to: 'handslot.l', object: glow('#b05cff', 0.35, 0.9), pos: [0, 0.2, 0], as: 'spirit' },
      { to: 'head', object: glow('#7dff5a', 0.18, 0.9), pos: [0, 0.1, 0.2] },
    ],
    clipsFrom: [`${SKE}/Skeleton_Warrior.glb`],
    scale: 2.0,
  });
  witch.root.position.y = -0.2;
  const c = cauldron();
  c.root.scale.setScalar(1.0);
  const w = new THREE.Group();
  const pot = new THREE.Group();
  pot.add(c.root);
  // steam plume pointing forward (+Z) from the rim, shown only for steam_beam
  const steam = new THREE.Group();
  for (let i = 0; i < 6; i++) steam.add(at(glow('#d8ffe8', 0.45 + i * 0.12, 0.7), 0, 0.2 + i * 0.1, 0.8 + i * 0.7));
  steam.position.set(0, 1.5, 0);
  pot.add(steam);
  w.add(pot, witch.root);
  return { root: w, inst: witch.inst, parts: { ...witch.parts, pot, steam, liquid: c.liquid, ...Object.fromEntries(c.bubbles.map((b, i) => ['bub' + i, b])) } } as Built;
}
const mire = (d: AnimDef, o: { orb?: boolean; spirit?: boolean; steam?: boolean; pot?: (b: Built, u: number) => void } = {}): AnimDef => ({
  ...d,
  apply: (b, u, f) => {
    b.parts.pot.position.set(0, 0, 0);
    b.parts.pot.rotation.set(0, 0, 0);
    b.parts.orb.visible = !!o.orb;
    b.parts.spirit.visible = !!o.spirit;
    b.parts.steam.visible = !!o.steam;
    for (let i = 0; i < 5; i++) {
      const t = (u * (d.loop ? 1 : 0.6) + i / 5) % 1;
      const r = 0.25 + 0.6 * ((i * 37) % 10) / 10;
      const a = i * 2.4;
      const bub = b.parts['bub' + i];
      bub.position.set(Math.cos(a) * r, 1.34 + 0.35 * Math.sin(t * Math.PI), Math.sin(a) * r);
      bub.scale.setScalar(0.5 + Math.sin(t * Math.PI));
    }
    o.pot?.(b, u);
    d.apply?.(b, u, f);
  },
});
const mireAnims: Record<string, AnimDef> = {
  idle: mire({ clip: 'Idle', frames: 6, loop: true }),
  walk: mire({ clip: 'Idle', frames: 8, loop: true, stride: 70 }, { pot: (b, u) => { b.parts.pot.position.y = 0.18 * Math.abs(Math.sin(u * Math.PI * 2)); b.parts.pot.rotation.z = 0.06 * Math.sin(u * Math.PI * 2); } }),
  hurt: mire({ clip: 'Hit_A', frames: 3, duration: 0.3 }, { pot: (b, u) => { b.parts.pot.rotation.z = 0.12 * Math.sin(u * Math.PI); } }),
  die: mire({ clip: 'Death_B', frames: 8, duration: 1.0, from: 0, to: 1.6 }, { pot: (b, u) => { b.parts.pot.rotation.z = -1.3 * Math.min(1, u * 1.4); b.parts.pot.position.y = 0.5 * Math.min(1, u * 1.4); } }),
  'telegraph:toss_poison': mire({ clip: 'Throw', frames: 4, duration: 0.7, from: 0, to: 0.5 }, { orb: true }),
  'attack:toss_poison': mire({ clip: 'Throw', frames: 6, duration: 0.5, from: 0.5, to: 1.37, hitAt: 0.4 }, { orb: true }),
  'telegraph:mud_wave': mire({ clip: 'Spellcast_Raise', frames: 4, duration: 0.8, from: 0, to: 1.4 }, { pot: (b, u) => { b.parts.pot.rotation.x = -0.25 * u; b.parts.pot.position.y = 0.3 * u; } }),
  'attack:mud_wave': mire({ clip: 'Spellcast_Shoot', frames: 6, duration: 0.5, hitAt: 0.5 }, { pot: (b, u) => { b.parts.pot.rotation.x = -0.25 + 0.5 * Math.min(1, u * 2); b.parts.pot.position.y = 0.3 * (1 - Math.min(1, u * 2)); } }),
  'telegraph:steam_beam': mire({ clip: 'Spellcast_Long', frames: 4, duration: 0.8, from: 0, to: 0.9 }, { pot: (b, u) => { b.parts.pot.rotation.z = 0.04 * Math.sin(u * 40); } }),
  'attack:steam_beam': mire({ clip: 'Spellcasting', frames: 6, duration: 0.8, hitAt: 0.3 }, { steam: true, pot: (b, u) => { b.parts.pot.rotation.z = 0.05 * Math.sin(u * 50); } }),
  'telegraph:summon': mire({ clip: 'Spellcast_Raise', frames: 4, duration: 0.8, from: 0, to: 1.4 }, { spirit: true }),
  'attack:summon': mire({ clip: 'Spellcast_Summon', frames: 6, duration: 0.9, from: 1.0, to: 2.8, hitAt: 0.45 }, { spirit: true }),
};
defineSprite({ id: 'boss_mother_mire', facing: -1, build: buildMire, anims: mireAnims });
definePortrait('portrait_boss_mother_mire', 'bosses', async () => buildMire(), { yaw: -32, span: 2.0, lookAt: [-0.02, 3.5, 0], clip: 'Idle' });

// ---------------------------------------------------------------------------
// Sir Hollow: headless knight on a ghost horse, carrying his glowing jack-o-lantern head.
// The rider is a Knight torso (legs hidden) sitting on the horse; the horse is animated procedurally.
// ---------------------------------------------------------------------------
async function headProp(): Promise<THREE.Object3D> {
  return loadProp(`${HAL}/pumpkin_orange_jackolantern.gltf`);
}
async function buildHollow() {
  const rider = await character({
    base: `${ADV}/Knight.glb`,
    hide: ['Knight_Head', 'Knight_Helmet', 'Knight_Cape', 'Knight_LegLeft', 'Knight_LegRight'],
    hands: ['1H_Sword_Offhand'],
    recolor: {
      '3,0': ['#4a4a58', '#15151c'],
      '7,0': ['#5a5a6a', '#22222c'],
      '6,0': ['#3a2a30', '#14101a'],
      '4,0': ['#2a2a34', '#0e0e14'],
      '7,1': ['#6a2a2a', '#2a0e12'],
      '0,1': ['#3a2a6a', '#120a2a'],
      '3,1': ['#8a90a0', '#2a2e3a'],
    },
    attach: [
      { to: 'head', object: at(cyl(0.2, 0.26, 0.14, 0x14101a, 8), 0, -0.1, 0) },
      { to: 'handslot.r', object: await headProp(), pos: [0, 0.15, 0], scale: 0.14, as: 'head' },
      { to: 'handslot.r', object: glow('#ff9a2a', 0.35, 0.85), pos: [0, 0.2, 0], as: 'headglow' },
    ],
    clipsFrom: [`${SKE}/Skeleton_Warrior.glb`],
    scale: 1.5,
    mirror: true,
  });
  rider.root.position.set(0, 2.25, -0.1);
  const h = ghostHorse();
  const w = new THREE.Group();
  w.add(h.root, rider.root);
  const parts: Record<string, THREE.Object3D> = { ...rider.parts, horse: h.root, hbody: h.body, neck: h.neck, tail: h.tail, rider: rider.root };
  h.legs.forEach((l, i) => (parts['leg' + i] = l));
  return { root: w, inst: rider.inst, parts } as Built;
}
/** gallop: leg phases, body bob, tail and neck sway */
function gallop(b: Built, ph: number, amp = 0.8, bob = 0.08): void {
  const off = [0, 0.18, 0.5, 0.68];
  for (let i = 0; i < 4; i++) {
    const hip = b.parts['leg' + i] as Leg;
    const a = Math.sin(ph + off[i] * Math.PI * 2);
    hip.rotation.x = amp * a;
    hip.knee.rotation.x = amp * 0.9 * Math.max(0, -a);
  }
  const y = bob * Math.abs(Math.sin(ph));
  b.parts.hbody.position.y = y;
  b.parts.rider.position.y = 2.25 + y;
  b.parts.neck.rotation.x = 0.08 * Math.sin(ph * 2);
  b.parts.tail.rotation.x = 0.3 * Math.sin(ph);
}
const TAU2 = Math.PI * 2;
const hol = (d: AnimDef, o: { head?: boolean; fx?: (b: Built, u: number) => void } = {}): AnimDef => ({
  ...d,
  apply: (b, u, f) => {
    b.root.rotation.set(0, 0, 0);
    b.root.position.set(0, 0, 0);
    b.parts.horse.rotation.set(0, 0, 0);
    b.parts.horse.position.set(0, 0, 0);
    b.parts.rider.rotation.set(0, 0, 0);
    b.parts.head.visible = o.head !== false;
    b.parts.headglow.visible = o.head !== false;
    b.parts.headglow.scale.setScalar(1);
    gallop(b, 0, 0, 0);
    o.fx?.(b, u);
    d.apply?.(b, u, f);
  },
});
const hollowAnims: Record<string, AnimDef> = {
  idle: hol({ clip: 'Idle', frames: 6, loop: true }, { fx: (b, u) => { b.parts.hbody.position.y = 0.03 * Math.sin(u * TAU2); b.parts.tail.rotation.x = 0.2 * Math.sin(u * TAU2); b.parts.neck.rotation.x = 0.08 * Math.sin(u * TAU2); } }),
  walk: hol({ clip: 'Idle', frames: 8, loop: true, stride: 150 }, { fx: (b, u) => gallop(b, u * TAU2, 0.6, 0.05) }),
  hurt: hol({ clip: 'Hit_A', frames: 3, duration: 0.3 }, { fx: (b, u) => { b.parts.horse.rotation.x = -0.25 * Math.sin(u * Math.PI); } }),
  die: hol({ clip: 'Death_A', frames: 9, duration: 1.1 }, { fx: (b, u) => { const k = Math.min(1, u * 1.3); b.root.rotation.z = 1.5 * k * k; } }),
  'telegraph:charge': hol({ clip: '1H_Melee_Attack_Chop', frames: 4, duration: 0.8, from: 0, to: 0.4 }, { fx: (b, u) => { b.parts.horse.rotation.x = -0.45 * u; b.parts.leg0.rotation.x = -1.0 * u; b.parts.leg1.rotation.x = -1.1 * u; } }),
  'attack:charge': hol({ clip: 'Running_A', frames: 6, duration: 0.6, hitAt: 0.5 }, { fx: (b, u) => { gallop(b, u * TAU2 * 1.5, 1.0, 0.12); b.parts.horse.rotation.x = 0.1; } }),
  'telegraph:throw_head': hol({ clip: 'Throw', frames: 4, duration: 0.8, from: 0, to: 0.5 }, { fx: (b, u) => { b.parts.headglow.scale.setScalar(1 + u); } }),
  'attack:throw_head': hol({ clip: 'Throw', frames: 6, duration: 0.5, from: 0.5, to: 1.37, hitAt: 0.4 }, { fx: (b, u) => { b.parts.head.visible = u < 0.4; b.parts.headglow.visible = u < 0.4; } }),
  'telegraph:double_charge': hol({ clip: '2H_Melee_Idle', frames: 4, duration: 0.8 }, { fx: (b, u) => { b.parts.neck.rotation.x = 0.5 * u; b.parts.leg0.rotation.x = -0.7 * Math.abs(Math.sin(u * Math.PI * 2)); b.parts.horse.rotation.x = 0.12 * u; b.parts.rider.rotation.x = 0.15 * u; } }),
  'attack:double_charge': hol({ clip: 'Running_B', frames: 8, duration: 0.8, hitAt: 0.35 }, { fx: (b, u) => { gallop(b, u * TAU2 * 2.5, 1.0, 0.14); b.parts.horse.rotation.x = 0.1; } }),
};
defineSprite({ id: 'boss_sir_hollow', facing: -1, build: buildHollow, anims: hollowAnims });
definePortrait('portrait_boss_sir_hollow', 'bosses', async () => buildHollow(), { yaw: -32, span: 2.8, lookAt: [-0.05, 3.4, 0], clip: 'Idle' });
