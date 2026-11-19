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
import { addSampler, bend, boneSpear, wingPair, flap, alignWings, claws, TAU, DEAD, deaditeEyes, LEFT_ARM, overlay, RECOLOR, clipLength } from '../props_enemies';

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
definePortrait('portrait_enemy_skeleton_shield', 'enemies', buildShield, { yaw: -32, span: 1.9, lookAt: [0.1, 1.32, 0], apply: (b) => overlay(b, 'Blocking', 0.3, LEFT_ARM, 0.85) });

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

// ---------------------------------------------------------------------------
// Winged Deadite: baked at ground level, the game lifts it. Wings flap in every animation.
// ---------------------------------------------------------------------------
async function buildWinged() {
  const w = wingPair(1.4);
  const b = await character({
    base: `${SKE}/Skeleton_Rogue.glb`,
    hide: ['Skeleton_Rogue_Cape', 'Skeleton_Rogue_Hood'],
    recolor: RECOLOR.Rogue,
    emissive: deaditeEyes('Skeleton_Rogue', 2.8),
    attach: [
      { to: 'chest', object: w.left, as: 'wingL' },
      { to: 'chest', object: w.right, as: 'wingR' },
      { to: 'handslot.r', object: claws() },
      { to: 'handslot.l', object: claws() },
    ],
    scale: 0.95,
  });
  alignWings(b);
  return b;
}
// wings beat between just below level and straight up; the body bobs against the beat
// in flight: body leans forward, legs tucked (jump pose), wings beat from below level to
// about 60 deg up (never over the head); the body rises on the down-stroke
const wingAnim = (cycles: number, amp = 32, fold = 0, lean = 22) => (b: Built, u: number) => {
  const ph = u * TAU * cycles;
  flap(b, amp * Math.sin(ph) + 22, fold);
  b.root.position.y = 0.3 + 0.07 * Math.sin(ph - Math.PI / 2);
  b.root.rotation.x = lean * RAD_E;
};
const RAD_E = Math.PI / 180;
defineSprite({
  id: 'enemy_winged_deadite',
  facing: -1,
  build: buildWinged,
  anims: {
    idle: { clip: 'Jump_Idle', frames: 8, loop: true, apply: wingAnim(2, 36, 0, 12) },
    // stride 0: a flyer's wing beat runs on time; the auto stride (from the jump pose's feet) made it flicker
    walk: { clip: 'Jump_Idle', frames: 12, loop: true, duration: 0.8, stride: 0, apply: wingAnim(2, 40, 0, 26) },
    attack: { clip: '1H_Melee_Attack_Slice_Diagonal', frames: 10, duration: 0.6, hitAt: 0.45, apply: wingAnim(1.5, 38, 0, 18) },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3, apply: wingAnim(1, 26, 0, 8) },
    die: { clip: 'Death_C_Skeletons', frames: 12, duration: 1.0, apply: (b, u) => flap(b, 52 + 30 * (1 - u) * Math.sin(u * TAU * 2) - 40 * u, u) },
  },
});
definePortrait('portrait_enemy_winged_deadite', 'enemies', buildWinged, { yaw: -32, span: 1.9, lookAt: [0, 1.45, 0], apply: (b) => flap(b, 62, 0.3) });

// ---------------------------------------------------------------------------
// Pit hag: small, hunched, green-skinned, wild white hair, claws. Fast, leaps over the line.
// ---------------------------------------------------------------------------
const ADV = '/kaykit/adventurers';
async function buildHag() {
  return character({
    base: `${ADV}/Mage.glb`,
    hide: ['Mage_Hat', 'Mage_Cape'],
    recolor: {
      '1,0': ['#e8e4d6', '#8f8b82'],
      '0,0': ['#8bb04a', '#4c6a2a'],
      '2,0': ['#c9d6a0', '#6e7d48'],
      '0,1': ['#5a3a4a', '#241420'],
      '3,0': ['#3e2f3a', '#1a1218'],
      '5,0': ['#6b4a3a', '#2a1c16'],
      '4,0': ['#8bb04a', '#4c6a2a'],
    },
    emissive: [],
    attach: [
      { to: 'handslot.r', object: claws(0x2a2420, 0.34) },
      { to: 'handslot.l', object: claws(0x2a2420, 0.34) },
    ],
    scale: 0.82,
  });
}
const hunch = (b: Built, k = 1): void => {
  bend(b, 'spine', 22 * k);
  bend(b, 'chest', 18 * k);
  bend(b, 'head', -24 * k);
};
defineSprite({
  id: 'enemy_pit_hag',
  facing: -1,
  build: buildHag,
  anims: {
    idle: { clip: 'Unarmed_Idle', frames: 8, loop: true, apply: (b) => hunch(b) },
    walk: { clip: 'Running_A', frames: 12, loop: true, apply: (b) => hunch(b, 1.2) },
    attack: { clip: 'Unarmed_Melee_Attack_Punch_A', frames: 10, duration: 0.5, hitAt: 0.45, apply: (b) => hunch(b) },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3, apply: (b) => hunch(b) },
    die: { clip: 'Death_A', frames: 12, duration: 1.0 },
    leap: { clip: 'Jump_Full_Short', frames: 6, duration: 0.4, apply: (b) => hunch(b, 0.7) },
  },
});
definePortrait('portrait_enemy_pit_hag', 'enemies', buildHag, { yaw: -32, span: 1.3, lookAt: [0.0, 1.05, 0.1], apply: (b) => hunch(b) });
