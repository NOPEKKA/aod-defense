/**
 * Baked-asset library: the manifest written by tools/bake, texture quality choice,
 * and loader helpers for sprite atlases, icon atlases and backgrounds.
 *
 * Shared by every part of render/ (world, HUD, menus). Loading is always through
 * a Phaser scene loader inside preload(); nothing here blocks.
 */
import type { Settings } from '../../contracts';

export interface AnimMeta {
  frames: number;
  /** playback seconds */
  duration: number;
  loop: boolean;
  /** 0..1 where the hit / shot / cast lands */
  hitAt?: number;
  /** logical px travelled per loop of a walk cycle */
  stride?: number;
}

export interface SpriteMeta {
  id: string;
  /** logical px (untrimmed source frame) */
  frameW: number;
  frameH: number;
  /** logical px of the ground point (feet) inside the frame */
  anchorX: number;
  anchorY: number;
  /** logical px from the anchor up to the top of the resting pose (HP bars go above this) */
  height: number;
  /** baked facing: 1 right, -1 left */
  facing: 1 | -1;
  /** has a 'shadow' frame */
  shadow: boolean;
  pages: Record<string, number>;
  anims: Record<string, AnimMeta>;
  /** display multiplier baked into the meta (bosses 1.1-1.45); anchors scale with it. Missing = 1 */
  scale?: number;
  /** fx_* sprites: how to blend the effect ('add' for fire, sparks, magic) */
  blend?: 'add' | 'normal';
  /** fx_* ground-plane sheets (already squashed for the camera pitch): scale uniformly */
  ground?: boolean;
}

export interface BgLayerMeta {
  id: string;
  parallax: number;
  /** logical px */
  w: number;
  h: number;
  tileW: number;
  tiles: number;
  alpha: boolean;
  /** drawn over the characters */
  over?: boolean;
}

export interface BgMeta {
  id: string;
  chapter: number;
  worldW: number;
  viewH: number;
  layers: BgLayerMeta[];
  anchors: Record<string, unknown>;
  grade?: { spriteTint?: string; fog?: number; weather?: 'none' | 'rain' | 'embers' | 'fog' };
}

export interface UiMeta {
  id: string;
  kind: string;
  pages: Record<string, number>;
  frames: Record<string, { w: number; h: number }>;
}

export interface Manifest {
  version: number;
  scales: Record<string, number>;
  sprites: Record<string, SpriteMeta>;
  backgrounds: Record<string, BgMeta>;
  ui: Record<string, UiMeta>;
}

export type Quality = 'hd' | 'sd';

const MANIFEST_KEY = 'aodd-manifest';
const BASE = 'assets/';

let manifest: Manifest = { version: 0, scales: { hd: 1.5, sd: 1 }, sprites: {}, backgrounds: {}, ui: {} };
let quality: Quality = 'hd';
const iconIndex = new Map<string, { key: string; frame: string; w: number; h: number }>();

/** 'auto': sd on low-memory devices, hd otherwise. */
export function chooseQuality(settings: Pick<Settings, 'texQuality'>): Quality {
  // builds that ship only the hd set (the claude.ai Artifact copy has a file-count cap)
  if (import.meta.env.VITE_HD_ONLY) return 'hd';
  if (settings.texQuality === 'hd' || settings.texQuality === 'sd') return settings.texQuality;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined && mem <= 4) return 'sd';
  return 'hd';
}

/**
 * Call from Preloader.preload(): loads the manifest, then (same load cycle) every icon atlas.
 * `onReady` runs once the manifest is in memory.
 */
export function queueBoot(scene: Phaser.Scene, settings: Pick<Settings, 'texQuality'>, onReady?: () => void): void {
  quality = chooseQuality(settings);
  scene.load.json(MANIFEST_KEY, `${BASE}manifest.json`);
  scene.load.once(`filecomplete-json-${MANIFEST_KEY}`, () => {
    const m = scene.cache.json.get(MANIFEST_KEY) as Manifest | undefined;
    if (m && m.sprites) manifest = m;
    iconIndex.clear();
    for (const ui of Object.values(manifest.ui)) {
      const key = uiTextureKey(ui.id);
      for (const [frame, size] of Object.entries(ui.frames)) iconIndex.set(frame, { key, frame, w: size.w, h: size.h });
      if (!scene.textures.exists(key)) scene.load.multiatlas(key, `${BASE}ui/${quality}/${ui.id}.json`, `${BASE}ui/${quality}/`);
    }
    onReady?.();
  });
}

export function getManifest(): Manifest {
  return manifest;
}
export function getQuality(): Quality {
  return quality;
}

/**
 * Re-applies the texture quality setting before a load. When it changed since the last load,
 * every baked sprite / background texture is dropped so it reloads at the new resolution
 * (icon atlases stay: the HUD sizes them from their real pixel size).
 */
export function syncQuality(scene: Phaser.Scene, settings: Pick<Settings, 'texQuality'>): boolean {
  const want = chooseQuality(settings);
  if (want === quality) return false;
  quality = want;
  for (const key of scene.textures.getTextureKeys()) {
    if (key.startsWith('spr:') || key.startsWith('bg:')) scene.textures.remove(key);
  }
  return true;
}

const warned = new Set<string>();
/** console.warn once per key (missing art, unknown anims) */
export function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[render] ${msg}`);
}
/** texture px per logical px at the current quality: display objects use scale 1 / assetScale() */
export function assetScale(): number {
  return manifest.scales[quality] ?? 1;
}

// ---- sprites ----------------------------------------------------------------

export function spriteMeta(key: string): SpriteMeta | undefined {
  return manifest.sprites[key];
}
export function spriteTextureKey(key: string): string {
  return `spr:${key}`;
}
export function isSpriteLoaded(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(spriteTextureKey(key));
}
/** Queue a sprite atlas on the scene loader. Returns true if a load was queued. */
export function queueSprite(scene: Phaser.Scene, key: string): boolean {
  if (!manifest.sprites[key] || isSpriteLoaded(scene, key)) return false;
  scene.load.multiatlas(spriteTextureKey(key), `${BASE}sprites/${quality}/${key}.json`, `${BASE}sprites/${quality}/`);
  return true;
}
/** frame name inside a sprite atlas */
export function frameName(anim: string, index: number): string {
  return `${anim}/${index}`;
}

// ---- icons ------------------------------------------------------------------

export function uiTextureKey(id: string): string {
  return `ui:${id}`;
}
/** Icon / portrait lookup by frame id ('portrait_ash', 'icon_super_boomstick'). `w`/`h` are logical px. */
export function icon(id: string): { key: string; frame: string; w: number; h: number } | null {
  return iconIndex.get(id) ?? null;
}

// ---- backgrounds --------------------------------------------------------------

export function bgMeta(id: string): BgMeta | undefined {
  return manifest.backgrounds[id];
}
/** background for a chapter (1-based), or undefined when none is baked yet */
export function bgForChapter(chapter: number): BgMeta | undefined {
  const all = Object.values(manifest.backgrounds);
  return all.find((b) => b.chapter === chapter) ?? all[0];
}
export function bgTextureKey(id: string, layer: string, tile: number): string {
  return `bg:${id}:${layer}:${tile}`;
}
export function queueBackground(scene: Phaser.Scene, id: string): boolean {
  const meta = manifest.backgrounds[id];
  if (!meta) return false;
  let queued = false;
  for (const layer of meta.layers) {
    for (let i = 0; i < layer.tiles; i++) {
      const key = bgTextureKey(id, layer.id, i);
      if (scene.textures.exists(key)) continue;
      scene.load.image(key, `${BASE}bg/${quality}/${id}-${layer.id}-${i}.webp`);
      queued = true;
    }
  }
  return queued;
}
