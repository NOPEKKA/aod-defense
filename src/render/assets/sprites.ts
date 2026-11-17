/**
 * Runtime view of a baked sprite atlas: frame-name tables per clip (built once, so the
 * per-frame code never concatenates strings), the anchor as an origin fraction, and the
 * animation fallback chain of ART_BIBLE section 4.
 */
import { assetScale, spriteMeta, spriteTextureKey, warnOnce, type SpriteMeta } from './library';

export interface ClipInfo {
  /** clip name in the atlas ('attack:shoot', 'walk', ...) */
  name: string;
  frames: number;
  /** playback seconds */
  duration: number;
  loop: boolean;
  /** 0..1 where the hit lands (attack/cast), 0 if none */
  hitAt: number;
  /** logical px per walk loop (0 = time based) */
  stride: number;
  /** atlas frame names, index = frame */
  names: string[];
}

export interface SpriteInfo {
  key: string;
  /** texture key in the texture manager */
  tex: string;
  meta: SpriteMeta;
  /** origin fractions of the anchor inside the untrimmed frame */
  ox: number;
  oy: number;
  /** display scale (meta.scale / texture px per logical px) */
  scale: number;
  facing: 1 | -1;
  /** logical px from the anchor to the top of the resting pose */
  height: number;
  /** logical frame size */
  frameW: number;
  frameH: number;
  hasShadow: boolean;
  clips: Map<string, ClipInfo>;
  /** the idle loop or the first clip there is */
  rest: ClipInfo;
  blend: 'add' | 'normal';
}

const cache = new Map<string, SpriteInfo | null>();

/** Drop cached infos (quality change reloads every atlas). */
export function clearSpriteInfo(): void {
  cache.clear();
}

/** Info for a loaded baked sprite, or null (not baked, not loaded, or broken) -> use a placeholder. */
export function getSpriteInfo(scene: Phaser.Scene, key: string): SpriteInfo | null {
  const hit = cache.get(key);
  if (hit !== undefined) {
    // a texture can be removed (quality change); re-check cheaply
    if (hit && !scene.textures.exists(hit.tex)) cache.delete(key);
    else return hit;
  }
  const meta = spriteMeta(key);
  const tex = spriteTextureKey(key);
  if (!meta || !scene.textures.exists(tex)) {
    // not cached as null when merely not loaded yet: a lazy load may still bring it
    if (!meta) {
      warnOnce(`nometa:${key}`, `sprite "${key}" is not baked yet: drawing a placeholder`);
      cache.set(key, null);
    }
    return null;
  }
  const texture = scene.textures.get(tex);
  const clips = new Map<string, ClipInfo>();
  for (const [name, a] of Object.entries(meta.anims)) {
    const names: string[] = [];
    for (let i = 0; i < a.frames; i++) names.push(`${name}/${i}`);
    if (!texture.has(names[0])) {
      warnOnce(`noframe:${key}:${name}`, `sprite "${key}" lists anim "${name}" but the atlas has no frame "${names[0]}"`);
      continue;
    }
    // keep only frames that exist (a bake can drop a frame)
    for (let i = names.length - 1; i > 0; i--) if (!texture.has(names[i])) names[i] = names[i - 1];
    clips.set(name, {
      name,
      frames: names.length,
      duration: a.duration > 0 ? a.duration : 0.5,
      loop: a.loop,
      hitAt: a.hitAt ?? 0,
      stride: a.stride ?? 0,
      names,
    });
  }
  const rest = clips.get('idle') ?? clips.values().next().value;
  if (!rest) {
    warnOnce(`noclips:${key}`, `sprite "${key}" has no usable frames: drawing a placeholder`);
    cache.set(key, null);
    return null;
  }
  // bosses carry a display multiplier; their meta.height is not reliable, the anchor is
  const mul = meta.scale && meta.scale > 0 ? meta.scale : 1;
  const unreliable = key.startsWith('boss_') || !(meta.height > meta.anchorY * 0.3);
  const height = (unreliable ? meta.anchorY * 0.92 : meta.height) * mul;
  const info: SpriteInfo = {
    key,
    tex,
    meta,
    ox: meta.frameW > 0 ? meta.anchorX / meta.frameW : 0.5,
    oy: meta.frameH > 0 ? meta.anchorY / meta.frameH : 1,
    scale: mul / assetScale(),
    facing: meta.facing === -1 ? -1 : 1,
    height: height > 0 ? height : meta.frameH * 0.8 * mul,
    frameW: meta.frameW,
    frameH: meta.frameH,
    hasShadow: meta.shadow && texture.has('shadow'),
    clips,
    rest,
    blend: meta.blend === 'add' ? 'add' : 'normal',
  };
  cache.set(key, info);
  return info;
}

/**
 * ART_BIBLE section 4 fallbacks when a sprite lacks an anim:
 * cast -> attack -> idle; stunned -> hurt -> idle; spawn -> walk; telegraph -> idle; leap -> walk; cheer -> idle.
 * Anything else falls back to idle (walk/attack/hurt/die are always baked for characters).
 */
const CHAIN: Record<string, readonly string[]> = {
  cast: ['attack', 'idle'],
  stunned: ['hurt', 'idle'],
  spawn: ['walk', 'idle'],
  telegraph: ['idle'],
  leap: ['walk', 'idle'],
  cheer: ['idle'],
  dodge: ['walk', 'idle'],
  hurt: ['idle'],
  attack: ['idle'],
  walk: ['idle'],
  die: ['hurt', 'idle'],
};

/**
 * Picks `${anim}:${action}` when the sprite has it, else `${anim}`, else the fallback chain.
 * Allocates a string only for the action form, and callers only call it when anim/action change.
 */
export function resolveClip(info: SpriteInfo, anim: string, action: string): ClipInfo {
  if (action) {
    const c = info.clips.get(`${anim}:${action}`);
    if (c) return c;
  }
  const direct = info.clips.get(anim);
  if (direct) return direct;
  if (anim === 'telegraph' && action) {
    // no telegraph clip for move X: the picker winds attack:X up to just before its hit
    const viaAction = info.clips.get(`attack:${action}`);
    if (viaAction) return viaAction;
  }
  const chain = CHAIN[anim];
  if (chain) {
    for (const a of chain) {
      const c = info.clips.get(a);
      if (c) return c;
    }
  }
  return info.rest;
}
