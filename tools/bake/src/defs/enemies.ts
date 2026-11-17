/**
 * Deadite sprites: the regular enemies and their portraits.
 * Owner: enemies art agent. Bosses live in bosses.ts. See docs/ART_BIBLE.md.
 *
 * Conventions: enemies are baked facing left (facing: -1); their shield arm is then
 * on the camera side without mirroring. Use CharOpts.scale for size, never heightPx.
 */
import { character, type Built } from '../character';
import { definePortrait } from '../icon';
import { defineSprite, type AnimDef } from '../sprite';
import { glow } from '../props';
import { addSampler, boneSpear, DEAD, deaditeEyes, LEFT_ARM, overlay, RECOLOR, clipLength } from '../props_enemies';

const SKE = '/kaykit/skeletons';
const HELM = (rc: Record<string, string | [string, string]> = {}) => ({ from: SKE + '/Skeleton_Warrior.glb', node: 'Skeleton_Warrior_Helmet', to: 'head', recolor: { '3,0': DEAD.rust, '4,0': DEAD.rustDark, '2,2': DEAD.red, ...rc } });

/** the animation set every walking skeleton shares; override per type */
function set(o: { idle?: string; walk?: string; attack: string; attackFrom?: number; attackTo?: number; hitAt?: number; dur?: number; die?: string }, extra: Record<string, AnimDef> = {}): Record<string, AnimDef> {
  return {
    idle: { clip: o.idle ?? 'Idle', frames: 8, loop: true },
    walk: { clip: o.walk ?? 'Walking_D_Skeletons', frames: 12, loop: true },
    attack: { clip: o.attack, from: o.attackFrom, to: o.attackTo, frames: 10, duration: o.dur ?? 0.6, hitAt: o.hitAt ?? 0.45 },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
    die: { clip: o.die ?? 'Death_C_Skeletons', frames: 12, duration: 1.0 },
    spawn: { clip: 'Spawn_Ground_Skeletons', frames: 14, duration: 1.3, clipGround: true },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Skeleton: the basic Deadite foot soldier.
// ---------------------------------------------------------------------------
async function buildSkeleton() {
  return character({
    base: `${SKE}/Skeleton_Minion.glb`,
    attach: [{ to: 'handslot.r', object: `${SKE}/props/Skeleton_Blade.gltf` }],
    recolor: RECOLOR.Minion,
    emissive: deaditeEyes('Skeleton_Minion'),
    scale: 0.97,
  });
}

defineSprite({
  id: 'enemy_skeleton',
  facing: -1,
  build: buildSkeleton,
  anims: set({ attack: '1H_Melee_Attack_Chop' }),
});
definePortrait('portrait_enemy_skeleton', 'enemies', buildSkeleton, { yaw: -32 });

// ---------------------------------------------------------------------------
// Helmeted skeleton: Warrior rig with its horned helmet and an axe.
// ---------------------------------------------------------------------------
async function buildHelm() {
  return character({
    base: `${SKE}/Skeleton_Warrior.glb`,
    hide: ['Skeleton_Warrior_Cloak', 'Skeleton_Warrior_Helmet'],
    borrow: [HELM()],
    recolor: RECOLOR.Warrior,
    emissive: deaditeEyes('Skeleton_Warrior'),
    attach: [{ to: 'handslot.r', object: `${SKE}/props/Skeleton_Axe.gltf` }],
    scale: 1.0,
  });
}
defineSprite({
  id: 'enemy_skeleton_helm',
  facing: -1,
  build: buildHelm,
  anims: set({ attack: '1H_Melee_Attack_Chop' }),
});
definePortrait('portrait_enemy_skeleton_helm', 'enemies', buildHelm, { yaw: -32 });

// ---------------------------------------------------------------------------
// Shield skeleton: walks with the shield raised.
// ---------------------------------------------------------------------------
async function buildShield() {
  const b = await character({
    base: `${SKE}/Skeleton_Warrior.glb`,
    hide: ['Skeleton_Warrior_Cloak', 'Skeleton_Warrior_Helmet'],
    borrow: [HELM()],
    recolor: RECOLOR.Warrior,
    emissive: deaditeEyes('Skeleton_Warrior'),
    attach: [
      { to: 'handslot.r', object: `${SKE}/props/Skeleton_Blade.gltf` },
      { to: 'handslot.l', object: `${SKE}/props/Skeleton_Shield_Large_A.gltf`, pos: [0, 0.02, 0.16] },
    ],
    scale: 1.0,
  });
  await addSampler(b, `${SKE}/Skeleton_Warrior.glb`);
  return b;
}
defineSprite({
  id: 'enemy_skeleton_shield',
  facing: -1,
  build: buildShield,
  anims: set(
    { attack: '1H_Melee_Attack_Stab' },
    {
      walk: {
        clip: 'Walking_D_Skeletons',
        frames: 12,
        loop: true,
        apply: (b: Built) => overlay(b, 'Blocking', 0.3, LEFT_ARM, 0.85),
      },
      idle: {
        clip: 'Idle',
        frames: 8,
        loop: true,
        apply: (b: Built) => overlay(b, 'Blocking', 0.3, LEFT_ARM, 0.85),
      },
    },
  ),
});
definePortrait('portrait_enemy_skeleton_shield', 'enemies', buildShield, { yaw: -32 });

// ---------------------------------------------------------------------------
// Spear skeleton: long bone spear, stabs from the second row.
// ---------------------------------------------------------------------------
async function buildSpear() {
  return character({
    base: `${SKE}/Skeleton_Minion.glb`,
    recolor: RECOLOR.Minion,
    emissive: deaditeEyes('Skeleton_Minion'),
    attach: [{ to: 'handslot.r', object: boneSpear() }],
    scale: 1.0,
  });
}
defineSprite({
  id: 'enemy_skeleton_spear',
  facing: -1,
  build: buildSpear,
  anims: set({ attack: '1H_Melee_Attack_Stab', dur: 0.7 }),
});
definePortrait('portrait_enemy_skeleton_spear', 'enemies', buildSpear, { yaw: -32 });

// ---------------------------------------------------------------------------
// Wizard: purple robe, pointed hat, staff, a fireball in the free hand when casting.
// ---------------------------------------------------------------------------
async function buildWizard() {
  const fire = glow(0xffb030, 0.5, 1);
  const b = await character({
    base: `${SKE}/Skeleton_Mage.glb`,
    recolor: RECOLOR.Mage,
    emissive: deaditeEyes('Skeleton_Mage'),
    attach: [
      { to: 'handslot.r', object: `${SKE}/props/Skeleton_Staff.gltf` },
      { to: 'handslot.r', object: fire, as: 'fire', pos: [0, 0.9, 0] },
    ],
    scale: 1.0,
  });
  b.parts.fire.visible = false;
  return b;
}
defineSprite({
  id: 'enemy_skeleton_wizard',
  facing: -1,
  build: buildWizard,
  anims: set(
    { attack: 'Spellcast_Shoot', dur: 0.7, hitAt: 0.5 },
    {
      attack: {
        clip: 'Spellcast_Shoot',
        frames: 10,
        duration: 0.7,
        hitAt: 0.5,
        apply: (b: Built, u: number) => {
          const f = b.parts.fire;
          f.visible = u > 0.15 && u < 0.55;
          f.scale.setScalar(0.6 + Math.min(1, (u - 0.15) / 0.35) * 0.8);
        },
      },
    },
  ),
});
definePortrait('portrait_enemy_skeleton_wizard', 'enemies', buildWizard, { yaw: -32 });

// ---------------------------------------------------------------------------
// Deadite archer: hooded rogue skeleton with a crossbow.
// ---------------------------------------------------------------------------
async function buildArcher() {
  return character({
    base: `${SKE}/Skeleton_Rogue.glb`,
    hide: ['Skeleton_Rogue_Cape'],
    recolor: RECOLOR.Rogue,
    emissive: deaditeEyes('Skeleton_Rogue'),
    attach: [{ to: 'handslot.r', object: `${SKE}/props/Skeleton_Crossbow.gltf`, rot: [0, 90, 0], scale: 1.35 }],
    scale: 1.0,
  });
}
defineSprite({
  id: 'enemy_deadite_archer',
  facing: -1,
  build: buildArcher,
  anims: set({ idle: '1H_Ranged_Aiming', attack: '1H_Ranged_Shoot', dur: 0.6, hitAt: 0.4 }),
});
definePortrait('portrait_enemy_deadite_archer', 'enemies', buildArcher, { yaw: -32 });

// ---------------------------------------------------------------------------
// Skeleton knight: big, black plate, cloak, two-handed axe.
// ---------------------------------------------------------------------------
async function buildKnight() {
  return character({
    base: `${SKE}/Skeleton_Warrior.glb`,
    hide: ['Skeleton_Warrior_Helmet'],
    borrow: [HELM({ '3,0': DEAD.black, '4,0': ['#2e2b33', '#0f0e12'] })],
    recolor: { ...RECOLOR.Warrior, '2,2': DEAD.purple },
    emissive: deaditeEyes('Skeleton_Warrior', 2.8),
    attach: [{ to: 'handslot.r', object: `${SKE}/props/Skeleton_Axe.gltf`, scale: 1.25 }],
    scale: 1.22,
  });
}
defineSprite({
  id: 'enemy_skeleton_knight',
  facing: -1,
  build: buildKnight,
  anims: set({ idle: '2H_Melee_Idle', attack: '2H_Melee_Attack_Chop', dur: 0.8, hitAt: 0.5 }),
});
definePortrait('portrait_enemy_skeleton_knight', 'enemies', buildKnight, { yaw: -32 });

void clipLength;
