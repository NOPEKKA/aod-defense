/**
 * Icon baker: square renders (portraits, spell and item icons) packed per group into
 * public/assets/ui/<scale>/icons_<group>-N.webp + .json, with a meta file for the manifest.
 */
import * as THREE from 'three';
import { pose } from './assets';
import type { Built } from './character';
import { addOutline, DEFAULT_RIG, downsample, LightRig, toCanvas, toImageData, trim, type Engine, type LightRigOpts } from './engine';
import { multiatlasJson, pack, type PackItem } from './pack';
import { MASTER, SCALES } from './sprite';

export interface IconDef {
  /** frame name: 'portrait_<spriteKey>', 'icon_<spellId>', 'relic_<id>', 'ui_<name>' */
  id: string;
  /** atlas group (one atlas per group, so owners never share a file): 'allies', 'enemies', 'spells', 'items' */
  group: string;
  build: () => Promise<Built>;
  /** rig pose */
  clip?: string;
  t?: number;
  apply?: (b: Built) => void;
  /** logical size in px (square). Default 112. */
  size?: number;
  /** world units covered by the icon height */
  span: number;
  /** point the camera looks at (world units) */
  lookAt: [number, number, number];
  /** model yaw in degrees (default 32: three-quarter view facing right) */
  yaw?: number;
  /** camera pitch in degrees (default 8) */
  pitch?: number;
  /** outline radius in logical px (default 1.5) */
  outline?: number;
  rig?: Partial<LightRigOpts>;
}

const icons = new Map<string, IconDef>();
export function defineIcon(def: IconDef): void {
  if (icons.has(def.id)) throw new Error(`icon "${def.id}" defined twice`);
  icons.set(def.id, def);
}
export function iconGroups(): string[] {
  return [...new Set([...icons.values()].map((i) => i.group))];
}

/** Bust portrait of a rigged character: head and shoulders, three-quarter view. */
export function definePortrait(id: string, group: string, build: () => Promise<Built>, o: Partial<IconDef> = {}): void {
  defineIcon({ id, group, build, clip: 'Idle', t: 0.2, span: 1.5, lookAt: [0.02, 1.58, 0], yaw: 32, pitch: 6, ...o });
}

export interface IconBake {
  files: Array<{ path: string; dataUrl: string }>;
  preview: HTMLCanvasElement;
}

export async function bakeIconGroup(engine: Engine, group: string, opts: { passes?: number; format?: 'webp' | 'png'; quality?: number } = {}): Promise<IconBake> {
  const defs = [...icons.values()].filter((i) => i.group === group);
  if (defs.length === 0) throw new Error(`no icons in group "${group}" (have: ${iconGroups().join(', ')})`);
  const passes = opts.passes ?? 40;
  const format = opts.format ?? 'webp';
  const scales = Object.keys(SCALES);
  const items: Record<string, PackItem[]> = {};
  for (const s of scales) items[s] = [];
  const previews: Array<{ id: string; canvas: HTMLCanvasElement }> = [];
  const frames: Record<string, { w: number; h: number }> = {};

  for (const def of defs) {
    const built = await def.build();
    if (def.clip && built.inst) pose(built.inst, def.clip, def.t ?? 0);
    def.apply?.(built);
    const holder = new THREE.Group();
    holder.add(built.root);
    holder.rotation.y = ((def.yaw ?? 32) * Math.PI) / 180;
    holder.updateMatrixWorld(true);
    const size = def.size ?? 112;
    const px = size * MASTER;
    const half = def.span / 2;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 100);
    const pitch = ((def.pitch ?? 8) * Math.PI) / 180;
    const look = new THREE.Vector3().fromArray(def.lookAt);
    cam.position.copy(look).add(new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(40));
    cam.lookAt(look);
    cam.updateMatrixWorld(true);
    const scene = new THREE.Scene();
    const rig = new LightRig({ ...DEFAULT_RIG, keyDir: [0.45, 0.8, 0.75], rimDir: [-0.8, 0.5, -0.75], ...def.rig, shadowRadius: def.span + 2, shadowCenter: def.lookAt });
    scene.add(rig.group, holder);
    const img = engine.accumulate(scene, cam, px, px, passes, (k, K) => rig.pass(k, K));
    for (const s of scales) {
      const { div, scale } = SCALES[s];
      let canvas = toCanvas(toImageData(downsample(img, div)));
      const o = def.outline ?? 1.5;
      if (o > 0) canvas = addOutline(canvas, o * scale);
      const t = trim(canvas, 1);
      items[s].push({ name: def.id, canvas: t.canvas, trimX: t.x, trimY: t.y, sourceW: t.sourceW, sourceH: t.sourceH });
      if (s === scales[0]) previews.push({ id: def.id, canvas });
    }
    frames[def.id] = { w: size, h: size };
    scene.remove(holder);
    built.inst?.mixer.stopAllAction();
  }

  const files: IconBake['files'] = [];
  const pages: Record<string, number> = {};
  const mime = format === 'webp' ? 'image/webp' : 'image/png';
  const name = `icons_${group}`;
  for (const s of scales) {
    const packed = pack(items[s], 2048, 2);
    pages[s] = packed.length;
    packed.forEach((p, i) => files.push({ path: `public/assets/ui/${s}/${name}-${i}.${format}`, dataUrl: p.canvas.toDataURL(mime, opts.quality ?? 0.93) }));
    const json = multiatlasJson(packed, (i) => `${name}-${i}.${format}`);
    files.push({ path: `public/assets/ui/${s}/${name}.json`, dataUrl: `data:application/json;base64,${btoa(JSON.stringify(json))}` });
  }
  const meta = { id: name, kind: 'icons', pages, frames };
  files.push({ path: `public/assets/ui/meta/${name}.json`, dataUrl: `data:application/json;base64,${btoa(JSON.stringify(meta, null, 1))}` });

  // preview grid on a mid grey and a dark tile, with names
  const cell = Math.max(...previews.map((p) => p.canvas.width)) + 16;
  const cols = Math.min(previews.length, Math.max(1, Math.floor(1900 / cell)));
  const rows = Math.ceil(previews.length / cols);
  const preview = document.createElement('canvas');
  preview.width = cols * cell;
  preview.height = rows * (cell + 16);
  const g = preview.getContext('2d')!;
  g.font = '11px monospace';
  g.textAlign = 'center';
  previews.forEach((p, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * (cell + 16);
    g.fillStyle = i % 2 ? '#3a3f4b' : '#5d6475';
    g.fillRect(x, y, cell, cell + 16);
    g.drawImage(p.canvas, x + 8, y + 8);
    g.fillStyle = '#fff';
    g.fillText(p.id, x + cell / 2, y + cell + 11);
  });
  return { files, preview };
}
