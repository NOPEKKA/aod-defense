/** Player-side heroes and NPCs (owner: allies art agent). Helpers come from allies.ts. */
import * as THREE from 'three';
import { byName } from '../assets';
import { character, type Built } from '../character';
import { definePortrait } from '../icon';
import { glow, PAL } from '../props';
import { armChain, crown, glowCell, hunterHat, lanternStaff, nunVeil } from '../props_allies';
import { defineSprite, type AnimDef } from '../sprite';
import { addStars, anims, BLUE, bump, rested, stunSway } from './allies';

const ADV = '/kaykit/adventurers';
const HIT: AnimDef = { clip: 'Hit_A', frames: 4, duration: 0.3 };
const DIE: AnimDef = { clip: 'Death_A', frames: 10, duration: 0.9 };
const CHEER: AnimDef = { clip: 'Cheer', from: 0.2, to: 1.35, frames: 10, loop: true };

function hero(id: string, build: () => Promise<Built>, list: Record<string, AnimDef>): void {
  const b = rested(build);
  defineSprite({ id, facing: 1, build: b, anims: anims(list) });
  definePortrait(`portrait_${id}`, 'allies', b);
}

/** light that swells during a cast (lantern/staff glow) */
function castGlowAt(b: Built, u: number): void {
  const g = b.parts.magic;
  if (!g) return;
  const k = bump(u, 0.2, 1.05);
  g.visible = k > 0.05;
  g.scale.setScalar(0.5 + 1.0 * k);
}
function addMagic(b: Built, bone: string, y = 0.4): void {
  const magic = new THREE.Group();
  magic.add(glow(0xffe7a0, 0.8, 0.8), glow(0xbfe6ff, 0.45, 1));
  magic.position.set(0, y, 0.1);
  magic.visible = false;
  byName(b.root, bone).add(magic);
  b.parts.magic = magic;
}

// --- Arthur --------------------------------------------------------------
hero(
  'hero_arthur',
  async () =>
    character({
      base: `${ADV}/Knight.glb`,
      hide: ['Knight_Helmet'],
      recolor: { '3,0': ['#dfe6ec', '#808c98'], '7,0': ['#f2c443', '#a07a14'], '0,1': BLUE },
      attach: [
        { to: 'handslot.r', object: `${ADV}/props/sword_2handed_color.gltf`, as: 'sword' },
        { to: 'head', object: crown(), pos: [0, 0.86, 0], as: 'crown' },
      ],
      scale: 1.18,
    }),
  {
    idle: { clip: '2H_Melee_Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_A', frames: 12, loop: true },
    attack: { clip: '2H_Melee_Attack_Slice', frames: 10, duration: 0.7, hitAt: 0.5 },
    hurt: HIT,
    die: DIE,
    cheer: CHEER,
  },
);

// --- Wiseman -------------------------------------------------------------
async function buildWiseman(): Promise<Built> {
  const b = await character({
    base: `${ADV}/Mage.glb`,
    hide: ['Mage_Hat', 'Mage_Cape'],
    hands: ['2H_Staff'],
    recolor: { '0,1': ['#eceff2', '#9aa4ae'], '5,0': ['#d9dde2', '#7d8791'], '3,0': ['#c4ccd4', '#6c7782'] },
    parts: [{ from: `${ADV}/Barbarian.glb`, mesh: 'Barbarian_Head', replace: 'Mage_Head', recolor: { '1,0': ['#ffffff', '#d4d8dc'] } }],
    scale: 1.1,
  });
  addMagic(b, 'handslot.r', 1.3);
  return b;
}
hero('hero_wiseman', buildWiseman, {
  idle: { clip: 'Idle', frames: 8, loop: true },
  walk: { clip: 'Walking_A', frames: 12, loop: true },
  attack: { clip: 'Spellcast_Shoot', frames: 8, duration: 0.6, hitAt: 0.5 },
  cast: { clip: 'Spellcast_Long', from: 0.05, to: 1.45, frames: 8, duration: 0.7, hitAt: 0.5, apply: (b, u) => castGlowAt(b, u) },
  hurt: HIT,
  die: DIE,
  cheer: CHEER,
});

// --- Henry the Red -------------------------------------------------------
hero(
  'hero_henry',
  async () =>
    character({
      base: `${ADV}/Barbarian.glb`,
      hide: ['Barbarian_Hat'],
      hands: ['2H_Axe'],
      recolor: { '1,0': ['#c8402a', '#7a1d10'], '7,0': ['#a4231a', '#5c0f0a'], '0,1': BLUE },
      scale: 1.2,
    }),
  {
    idle: { clip: '2H_Melee_Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_A', frames: 12, loop: true },
    attack: { clip: '2H_Melee_Attack_Chop', frames: 10, duration: 0.7, hitAt: 0.5 },
    hurt: HIT,
    die: DIE,
    cheer: CHEER,
  },
);

// --- Morwen --------------------------------------------------------------
async function buildMorwen(): Promise<Built> {
  const veil = nunVeil();
  veil.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && m.emissive && m.color.getHex() > 0xc0c0c0) {
      m.emissive.copy(m.color);
      m.emissiveIntensity = 0.55;
    }
  });
  const b = await character({
    base: `${ADV}/Mage.glb`,
    hide: ['Mage_Hat', 'Mage_Cape'],
    recolor: { '0,1': ['#f4f1ea', '#bdb7a8'], '5,0': ['#f2c443', '#a07a14'], '3,0': ['#e6e2d8', '#9c968a'] },
    attach: [
      { to: 'handslot.r', object: lanternStaff(), as: 'staff' },
      { to: 'head', object: veil, pos: [0, 0, 0], as: 'veil' },
    ],
    scale: 1.1,
  });
  addMagic(b, 'handslot.r', 1.45);
  return b;
}
hero('hero_morwen', buildMorwen, {
  idle: { clip: 'Idle', frames: 8, loop: true },
  walk: { clip: 'Walking_A', frames: 12, loop: true },
  attack: { clip: '2H_Melee_Attack_Stab', from: 0.2, to: 1.1, frames: 10, duration: 0.6, hitAt: 0.45 },
  cast: { clip: 'Spellcast_Long', from: 0.05, to: 1.45, frames: 8, duration: 0.7, hitAt: 0.5, apply: (b, u) => castGlowAt(b, u) },
  hurt: HIT,
  die: DIE,
  cheer: CHEER,
});

// --- Garrick -------------------------------------------------------------
hero(
  'hero_garrick',
  async () => {
    const b = await character({
      base: `${ADV}/Rogue_Hooded.glb`,
      hide: ['Rogue_Cape'],
      hands: ['2H_Crossbow'],
      recolor: { '1,1': ['#3a3a40', '#18181c'], '0,1': ['#46464e', '#1e1e24'], '3,2': ['#2a2a30', '#141418'] },
      parts: [{ from: `${ADV}/Rogue.glb`, mesh: 'Rogue_Head', replace: 'Rogue_Head_Hooded' }],
      attach: [
        { to: 'head', object: hunterHat(), pos: [0, 0.74, 0], as: 'hat' },
        { to: 'lowerarm.l', object: armChain(), as: 'chain' },
      ],
      scale: 1.1,
    });
    return b;
  },
  {
    idle: { clip: 'Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_A', frames: 12, loop: true },
    attack: { clip: '2H_Ranged_Shoot', frames: 10, duration: 0.7, hitAt: 0.35 },
    hurt: HIT,
    die: DIE,
    cheer: CHEER,
  },
);

// --- Sheila --------------------------------------------------------------
hero(
  'hero_sheila',
  async () =>
    character({
      base: `${ADV}/Rogue.glb`,
      hide: ['Rogue_Cape'],
      hands: ['Knife', 'Knife_Offhand'],
      recolor: { '0,1': ['#c0243a', '#6e0d1c'], '1,1': BLUE, '3,2': ['#3a1d1d', '#1c0c0c'] },
      parts: [{ from: `${ADV}/Mage.glb`, mesh: 'Mage_Head', replace: 'Rogue_Head' }],
      scale: 1.0,
    }),
  {
    idle: { clip: 'Idle', frames: 8, loop: true },
    walk: { clip: 'Running_A', frames: 12, loop: true },
    attack: { clip: 'Dualwield_Melee_Attack_Slice', from: 0.1, to: 1.15, frames: 10, duration: 0.5, hitAt: 0.5 },
    hurt: HIT,
    die: DIE,
    cheer: CHEER,
  },
);

// --- Evil Ash ------------------------------------------------------------
async function buildEvilAsh(): Promise<Built> {
  const { boomstick, chainsaw, at } = await import('../props');
  const b = await character({
    base: `${ADV}/Rogue.glb`,
    hide: ['Rogue_Cape'],
    recolor: {
      '0,1': ['#2a2a30', '#0e0e12'],
      '1,1': ['#5a1a1a', '#2a0a0a'],
      '3,2': ['#1d1d22', '#0c0c10'],
      '5,2': ['#7fa889', '#46684f'], // hands: pale green
    },
    parts: [
      {
        from: `${ADV}/Knight.glb`,
        mesh: 'Knight_Head',
        replace: 'Rogue_Head',
        recolor: { '1,0': ['#1c1c1c', '#050505'], '0,0': ['#a8c9a4', '#5f8a66'], '2,0': ['#ff2a20', '#a00a0a'] },
      },
    ],
    attach: [
      { to: 'handslot.r', object: boomstick(), rot: [0, 90, 0], pos: [0.02, 0.02, 0], as: 'gun' },
      { to: 'handslot.l', object: at(chainsaw(), 0, 0, 0), rot: [-90, 0, 0], pos: [0, 0.05, 0], scale: 0.85, as: 'saw' },
    ],
    scale: 1.08,
    mirror: true,
  });
  glowCell(byName(b.root, 'head'), '2,0', '#ff2a20', 2);
  addStars(b);
  const magic = new THREE.Group();
  magic.add(glow(0xff5a3a, 0.75, 0.8), glow(0xffd0a0, 0.4, 1));
  magic.position.set(0, 0.25, 0.1);
  magic.visible = false;
  byName(b.root, 'handslot.l').add(magic);
  b.parts.magic = magic;
  return b;
}
hero('hero_evil_ash', buildEvilAsh, {
  idle: { clip: 'Idle', frames: 8, loop: true },
  walk: { clip: 'Running_A', frames: 12, loop: true },
  attack: { clip: 'Dualwield_Melee_Attack_Slice', from: 0.1, to: 1.15, frames: 10, duration: 0.5, hitAt: 0.52 },
  'attack:shoot': { clip: '1H_Ranged_Shoot', from: 0.15, to: 0.9, frames: 8, duration: 0.45, hitAt: 0.2 },
  hurt: HIT,
  stunned: { clip: 'Idle', frames: 6, loop: true, duration: 0.8, apply: stunSway },
  die: DIE,
  cheer: CHEER,
});

void PAL;
