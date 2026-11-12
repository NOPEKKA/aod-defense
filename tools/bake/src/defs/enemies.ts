/**
 * Deadite sprites: the regular enemies and their portraits.
 * Owner: enemies art agent. Bosses live in bosses.ts. See docs/ART_BIBLE.md.
 *
 * Conventions: enemies are baked facing left (facing: -1); their shield arm is then
 * on the camera side without mirroring. Use CharOpts.scale for size, never heightPx.
 */
import { character } from '../character';
import { definePortrait } from '../icon';
import { defineSprite } from '../sprite';

const SKE = '/kaykit/skeletons';

// ---------------------------------------------------------------------------
// Skeleton: the basic Deadite foot soldier.
// ---------------------------------------------------------------------------
async function buildSkeleton() {
  return character({
    base: `${SKE}/Skeleton_Minion.glb`,
    attach: [{ to: 'handslot.r', object: `${SKE}/props/Skeleton_Blade.gltf` }],
    scale: 0.97,
  });
}

defineSprite({
  id: 'enemy_skeleton',
  facing: -1,
  build: buildSkeleton,
  anims: {
    idle: { clip: 'Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_D_Skeletons', frames: 12, loop: true },
    attack: { clip: '1H_Melee_Attack_Chop', frames: 10, duration: 0.6, hitAt: 0.45 },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
    die: { clip: 'Death_C_Skeletons', frames: 12, duration: 1.0 },
    spawn: { clip: 'Spawn_Ground_Skeletons', frames: 14, duration: 1.3, clipGround: true },
  },
});
definePortrait('portrait_enemy_skeleton', 'enemies', buildSkeleton, { yaw: -32 });
