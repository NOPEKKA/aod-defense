/**
 * Player-side sprites: Ash, troops, heroes, friendly NPCs, and their portraits.
 * Owner: allies art agent. See docs/ART_BIBLE.md for the roster and conventions.
 *
 * Conventions: allies are baked facing right (facing: 1). A unit with a shield is
 * mirrored (mirror: true) so the shield is on the camera side. Use CharOpts.scale
 * for size (1 = 165 px tall body), never heightPx, so proportions stay consistent.
 */
import { character } from '../character';
import { definePortrait } from '../icon';
import { at, boomstick, chainsaw } from '../props';
import { defineSprite } from '../sprite';

const ADV = '/kaykit/adventurers';

/** Arthur's blue: [top, bottom] gradients for palette cells */
export const BLUE: [string, string] = ['#4a86e8', '#1f4396'];
export const BLUE_LIGHT: [string, string] = ['#7fb0ff', '#2f62c4'];

// ---------------------------------------------------------------------------
// Ash: our own hero design on the Rogue rig. Blue shirt, short dark hair, a
// chainsaw for a right hand and the boomstick in his left. The rig is
// right-handed, so the model is mirrored: rig-right (gun) becomes his left
// hand and rig-left (saw) his right.
// ---------------------------------------------------------------------------
export async function buildAsh() {
  return character({
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
}

const ashAnims = {
  idle: { clip: 'Idle', frames: 8, loop: true },
  walk: { clip: 'Running_A', frames: 12, loop: true },
  // default attack = chainsaw thrust; 'attack:shoot' = boomstick (EntityState.action 'shoot')
  attack: { clip: 'Dualwield_Melee_Attack_Stab', from: 0.2, to: 1.05, frames: 10, duration: 0.5, hitAt: 0.4 },
  'attack:shoot': { clip: '1H_Ranged_Shoot', from: 0.15, to: 0.9, frames: 8, duration: 0.45, hitAt: 0.2 },
  cast: { clip: 'Spellcast_Shoot', frames: 8, duration: 0.6, hitAt: 0.5 },
  hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
  dodge: { clip: 'Dodge_Forward', frames: 6, duration: 0.35 },
  die: { clip: 'Death_A', frames: 10, duration: 0.9 },
  cheer: { clip: 'Cheer', frames: 10, loop: true },
};

defineSprite({ id: 'ash', build: buildAsh, facing: 1, anims: ashAnims });
defineSprite({ id: 'ash_left', build: buildAsh, facing: -1, anims: ashAnims });
definePortrait('portrait_ash', 'allies', buildAsh);

// ---------------------------------------------------------------------------
// Swordsman: Knight with sword and round shield, Arthur's blue.
// ---------------------------------------------------------------------------
async function buildSwordsman() {
  return character({
    base: `${ADV}/Knight.glb`,
    hands: ['1H_Sword', 'Round_Shield'],
    recolor: { '0,1': BLUE },
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
