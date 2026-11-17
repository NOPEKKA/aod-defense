/**
 * Animated baked sprites for menu scenes (title screen, result screen): plays one clip by
 * render time, mirrors to a facing, falls back to the generated atlas art when the atlas is
 * not baked / not loaded.
 */
import { addArt } from '../art/atlas';
import { getSpriteInfo, resolveClip } from '../assets/sprites';

export interface MenuSpriteOpts {
  /** clip ('idle', 'walk', 'cheer', ...); falls back like the battle picker */
  anim?: string;
  /** 1 = face right, -1 = face left */
  facing?: 1 | -1;
  /** display multiplier on the baked size */
  scale?: number;
  /** seconds offset so a crowd does not move in lockstep */
  phase?: number;
  speed?: number;
}

export function addMenuSprite(scene: Phaser.Scene, key: string, x: number, y: number, o: MenuSpriteOpts = {}): Phaser.GameObjects.Image {
  const info = getSpriteInfo(scene, key);
  const facing = o.facing ?? 1;
  const mul = o.scale ?? 1;
  if (!info) {
    const img = addArt(scene, x, y, key, mul);
    img.setFlipX(facing < 0);
    return img;
  }
  const clip = resolveClip(info, o.anim ?? 'idle', '');
  const img = scene.add.image(x, y, info.tex, clip.names[0]).setOrigin(info.ox, info.oy);
  const flip = facing !== info.facing;
  img.setScale((flip ? -1 : 1) * info.scale * mul, info.scale * mul);
  let t = o.phase ?? 0;
  const speed = o.speed ?? 1;
  const step = (_time: number, delta: number) => {
    if (!img.active) return;
    t += (Math.min(delta, 100) / 1000) * speed;
    const f = Math.floor(((t % clip.duration) / clip.duration) * clip.frames) % clip.frames;
    img.setFrame(clip.names[f], false, false);
  };
  scene.events.on('update', step);
  scene.events.once('shutdown', () => scene.events.off('update', step));
  return img;
}

/** ground shadow under a menu sprite (baked shadow frame when present) */
export function addMenuShadow(scene: Phaser.Scene, key: string, x: number, y: number, scale = 1, facing: 1 | -1 = 1): Phaser.GameObjects.Image | null {
  const info = getSpriteInfo(scene, key);
  if (!info || !info.hasShadow) return null;
  const flip = facing !== info.facing;
  return scene.add.image(x, y, info.tex, 'shadow').setOrigin(info.ox, info.oy).setScale((flip ? -1 : 1) * info.scale * scale, info.scale * scale).setAlpha(0.5);
}
