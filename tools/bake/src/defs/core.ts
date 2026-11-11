/**
 * First sprite definitions: the pipeline proof (Ash, a troop, an enemy).
 * More defs live in sibling files; every file in defs/ is loaded automatically.
 */
import { character } from '../character';
import { at, boomstick, chainsaw } from '../props';
import { defineSprite } from '../sprite';

const ADV = '/kaykit/adventurers';
const SKE = '/kaykit/skeletons';

// ---------------------------------------------------------------------------
// Ash: our own hero design on the Rogue rig. Blue shirt, dark hair, a chainsaw
// for a right hand and the boomstick in his left. The rig is right-handed, so
// the model is mirrored: rig-right (gun) becomes his left, rig-left (saw) his right.
// ---------------------------------------------------------------------------
async function buildAsh() {
  return character({
    base: `${ADV}/Rogue.glb`,
    hide: ['Rogue_Cape'],
    recolor: {
      '0,1': ['#4a86e8', '#1f4396'], // tunic -> blue shirt
      '1,1': ['#7fb0ff', '#2f62c4'], // trim
      '3,2': ['#8a6a4a', '#4f3a28'], // trousers
    },
    // short-haired head from the Knight, hair repainted dark
    parts: [{ from: `${ADV}/Knight.glb`, mesh: 'Knight_Head', replace: 'Rogue_Head', recolor: { '1,0': ['#4f392b', '#1a120d'] } }],
    attach: [
      { to: 'handslot.r', object: boomstick(), rot: [0, 90, 0], pos: [0.02, 0.02, 0], as: 'gun' },
      { to: 'handslot.l', object: at(chainsaw(), 0, 0, 0), rot: [-90, 0, 0], pos: [0, 0.05, 0], scale: 0.85, as: 'saw' },
    ],
    mirror: true,
  });
}

const ashAnims = {
  idle: { clip: 'Idle', frames: 8, loop: true },
  walk: { clip: 'Running_A', frames: 12, loop: true },
  'attack:shoot': { clip: '1H_Ranged_Shoot', from: 0.15, to: 0.9, frames: 8, duration: 0.45, hitAt: 0.2 },
  attack: { clip: 'Dualwield_Melee_Attack_Stab', from: 0.2, to: 1.05, frames: 10, duration: 0.5, hitAt: 0.4 },
  cast: { clip: 'Spellcast_Shoot', frames: 8, duration: 0.6, hitAt: 0.5 },
  hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
  dodge: { clip: 'Dodge_Forward', frames: 6, duration: 0.35 },
  die: { clip: 'Death_A', frames: 10, duration: 0.9 },
  cheer: { clip: 'Cheer', frames: 10, loop: true },
};

defineSprite({ id: 'ash', build: buildAsh, heightPx: 168, facing: 1, anims: ashAnims });
defineSprite({ id: 'ash_left', build: buildAsh, heightPx: 168, facing: -1, anims: ashAnims });

// ---------------------------------------------------------------------------
// Swordsman: Knight with sword and round shield, Arthur's blue.
// ---------------------------------------------------------------------------
defineSprite({
  id: 'unit_swordsman',
  heightPx: 172,
  facing: 1,
  build: () =>
    character({
      base: `${ADV}/Knight.glb`,
      hands: ['1H_Sword', 'Round_Shield'],
      hide: ['Knight_Cape'],
      recolor: { '0,1': ['#4a86e8', '#1f4396'] },
    }),
  anims: {
    idle: { clip: 'Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_A', frames: 12, loop: true },
    attack: { clip: '1H_Melee_Attack_Chop', frames: 10, duration: 0.6, hitAt: 0.45 },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
    die: { clip: 'Death_A', frames: 10, duration: 0.9 },
  },
});

// ---------------------------------------------------------------------------
// Skeleton: the basic Deadite foot soldier.
// ---------------------------------------------------------------------------
defineSprite({
  id: 'enemy_skeleton',
  heightPx: 160,
  facing: -1,
  build: () =>
    character({
      base: `${SKE}/Skeleton_Minion.glb`,
      attach: [{ to: 'handslot.r', object: `${SKE}/props/Skeleton_Blade.gltf` }],
    }),
  anims: {
    idle: { clip: 'Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_D_Skeletons', frames: 12, loop: true },
    attack: { clip: '1H_Melee_Attack_Chop', frames: 10, duration: 0.6, hitAt: 0.45 },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
    die: { clip: 'Death_C_Skeletons', frames: 12, duration: 1.0 },
    spawn: { clip: 'Spawn_Ground_Skeletons', frames: 14, duration: 1.3, clipGround: true },
  },
});
