/** Player-side troops (owner: allies art agent). Helpers come from allies.ts. */
import * as THREE from 'three';
import { character, type Built } from '../character';
import { definePortrait } from '../icon';
import { at, cyl, PAL } from '../props';
import { arrowProp, bow, flame, kettleHelm, pitchfork, plume, shortSword, spear, strawHat, tabard } from '../props_allies';
import { defineSprite } from '../sprite';
import { anims, BLUE, BLUE_LIGHT, rested } from './allies';

const ADV = '/kaykit/adventurers';
const DUN = '/kaykit/dungeon';

// --- peasant -------------------------------------------------------------
const buildPeasant = rested(async () =>
  character({
    base: `${ADV}/Rogue.glb`,
    hide: ['Rogue_Cape'],
    recolor: { '0,1': ['#e6d9b8', '#b09a6c'], '1,1': BLUE, '3,2': ['#7a5a3a', '#4a3524'] },
    attach: [
      { to: 'handslot.r', object: pitchfork(), rot: [0, 0, 0], as: 'fork' },
      { to: 'head', object: strawHat(), pos: [0, 0.74, 0], as: 'hat' },
    ],
    scale: 0.9,
  }),
);
defineSprite({
  id: 'unit_peasant',
  facing: 1,
  build: buildPeasant,
  anims: anims({
    idle: { clip: '2H_Melee_Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_A', frames: 12, loop: true },
    attack: { clip: '2H_Melee_Attack_Stab', from: 0.2, to: 1.1, frames: 10, duration: 0.6, hitAt: 0.45 },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
    die: { clip: 'Death_A', frames: 10, duration: 0.9 },
  }),
});
definePortrait('portrait_unit_peasant', 'allies', buildPeasant);

// --- archer --------------------------------------------------------------
const buildArcher = rested(async () =>
  character({
    base: `${ADV}/Rogue_Hooded.glb`,
    hide: ['Rogue_Cape'],
    recolor: { '1,1': BLUE, '0,1': ['#4f7fd6', '#25489a'] },
    attach: [
      { to: 'handslot.r', object: bow(), rot: [0, 0, 0], as: 'bow' },
      { to: 'chest', object: `${ADV}/props/quiver.gltf`, pos: [0, 0.1, -0.42], rot: [0, 0, 20], as: 'quiver' },
    ],
  }),
);
defineSprite({
  id: 'unit_archer',
  facing: 1,
  build: buildArcher,
  anims: anims({
    idle: { clip: 'Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_A', frames: 12, loop: true },
    attack: { clip: '1H_Ranged_Shoot', from: 0.1, to: 0.9, frames: 10, duration: 0.6, hitAt: 0.4 },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
    die: { clip: 'Death_A', frames: 10, duration: 0.9 },
  }),
});
definePortrait('portrait_unit_archer', 'allies', buildArcher);

// --- spearman ------------------------------------------------------------
const buildSpearman = rested(async () => {
  const t = tabard();
  return character({
    base: `${ADV}/Knight.glb`,
    hide: ['Knight_Helmet', 'Knight_Cape'],
    recolor: { '0,1': BLUE },
    attach: [
      { to: 'handslot.r', object: spear(), as: 'spear' },
      { to: 'head', object: kettleHelm(), pos: [0, 0.62, 0], scale: 0.82, as: 'helm' },
      { to: 'chest', object: t.chest, as: 'tabard' },
      { to: 'hips', object: t.hips, as: 'skirt' },
    ],
  });
});
defineSprite({
  id: 'unit_spearman',
  facing: 1,
  build: buildSpearman,
  anims: anims({
    idle: { clip: '2H_Melee_Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_A', frames: 12, loop: true },
    attack: { clip: '2H_Melee_Attack_Stab', from: 0.2, to: 1.1, frames: 10, duration: 0.6, hitAt: 0.45 },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
    die: { clip: 'Death_A', frames: 10, duration: 0.9 },
  }),
});
definePortrait('portrait_unit_spearman', 'allies', buildSpearman);

function torchProp(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cyl(0.07, 0.06, 0.95, PAL.wood, 8), 0, 0.22, 0));
  g.add(at(cyl(0.12, 0.08, 0.22, 0x3a2a22, 8), 0, 0.74, 0));
  const f = flame(0.85);
  f.position.set(0, 0.82, 0);
  g.add(f);
  g.userData.fl = f;
  return g;
}

// --- torch boy -----------------------------------------------------------
const buildTorchBoy = rested(async () => {
  const torch = torchProp();
  const b: Built = await character({
    base: `${ADV}/Rogue.glb`,
    hide: ['Rogue_Cape'],
    recolor: { '0,1': ['#8fbaff', '#4a7fd0'], '1,1': BLUE, '3,2': ['#6b5238', '#3e2e20'] },
    attach: [
      { to: 'handslot.l', object: torch, as: 'torch' },
      { to: 'handslot.r', object: shortSword(), as: 'sword' },
    ],
    scale: 0.85,
    mirror: true,
  });
  b.parts.flame = torch.userData.fl;
  return b;
});
defineSprite({
  id: 'unit_torch_boy',
  facing: 1,
  build: buildTorchBoy,
  anims: anims(
    {
      idle: { clip: 'Idle', frames: 8, loop: true },
      walk: { clip: 'Running_A', frames: 12, loop: true },
      attack: { clip: '1H_Melee_Attack_Chop', frames: 10, duration: 0.5, hitAt: 0.45 },
      hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
      die: { clip: 'Death_A', frames: 10, duration: 0.9 },
    },
    (b, u) => (b.parts.flame.userData.flicker as (u: number) => void)?.(u),
  ),
});
definePortrait('portrait_unit_torch_boy', 'allies', buildTorchBoy);

void PAL; void plume; void arrowProp; void BLUE_LIGHT;

// --- armored guard -------------------------------------------------------
const buildGuard = rested(async () =>
  character({
    base: `${ADV}/Knight.glb`,
    hide: ['Knight_Cape'],
    hands: ['1H_Sword', 'Rectangle_Shield'],
    recolor: { '3,0': ['#a9b4c0', '#56616d'], '7,0': ['#e2b83a', '#8a6a14'], '0,1': BLUE },
    attach: [{ to: 'head', object: plume(), pos: [0, 0.98, -0.05], as: 'plume' }],
    scale: 1.18,
    mirror: true,
  }),
);
defineSprite({
  id: 'unit_armored_guard',
  facing: 1,
  build: buildGuard,
  anims: anims({
    idle: { clip: 'Blocking', frames: 8, loop: true },
    walk: { clip: 'Walking_B', frames: 12, loop: true },
    attack: { clip: '1H_Melee_Attack_Slice_Diagonal', frames: 10, duration: 0.7, hitAt: 0.5 },
    hurt: { clip: 'Block_Hit', frames: 4, duration: 0.3 },
    die: { clip: 'Death_A', frames: 10, duration: 0.9 },
  }),
});
definePortrait('portrait_unit_armored_guard', 'allies', buildGuard);

// --- crossbowman ---------------------------------------------------------
const buildCrossbowman = rested(async () =>
  character({
    base: `${ADV}/Rogue_Hooded.glb`,
    hide: ['Rogue_Cape'],
    hands: ['2H_Crossbow'],
    recolor: { '1,1': ['#2f4f9a', '#142a66'], '0,1': ['#2a3f78', '#101e4a'], '3,2': ['#3a3a44', '#1c1c24'] },
    attach: [{ to: 'chest', object: `${ADV}/props/arrow_bundle.gltf`, pos: [0, 0.05, -0.42], rot: [0, 0, 20], as: 'bolts' }],
  }),
);
defineSprite({
  id: 'unit_crossbowman',
  facing: 1,
  build: buildCrossbowman,
  anims: anims({
    idle: { clip: 'Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_A', frames: 12, loop: true },
    attack: { clip: '2H_Ranged_Shoot', frames: 10, duration: 0.7, hitAt: 0.35 },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
    die: { clip: 'Death_A', frames: 10, duration: 0.9 },
  }),
});
definePortrait('portrait_unit_crossbowman', 'allies', buildCrossbowman);
