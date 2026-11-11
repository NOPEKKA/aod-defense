/**
 * Sprite baker: a 3D character/prop + a list of animations -> trimmed frames,
 * packed atlas pages (hd = 1.5x, sd = 1x logical px), Phaser multiatlas JSON,
 * a meta JSON for the game, and a preview sheet for eyeballing.
 */
import * as THREE from 'three';
import { pose } from './assets';
import type { Built } from './character';
import { addOutline, DEFAULT_RIG, downsample, LightRig, toCanvas, toImageData, trim, type Engine, type LightRigOpts } from './engine';
import { multiatlasJson, pack, type PackItem } from './pack';

/** logical px per world unit (a KayKit adventurer is ~2.2 units tall -> ~165 px) */
export const PPU = 75;
/** master render px per logical px; hd = master/2, sd = master/3 */
export const MASTER = 3;
export const SCALES: Record<string, { div: number; scale: number }> = {
  hd: { div: 2, scale: 1.5 },
  sd: { div: 3, scale: 1 },
};
/** camera pitch shared by sprites and backgrounds (degrees, looking down) */
export const PITCH = 20;

export interface AnimDef {
  /** rig clip name; omit for props animated only by `apply` */
  clip?: string;
  /** seconds inside the clip (default: whole clip) */
  from?: number;
  to?: number;
  frames: number;
  loop?: boolean;
  /** playback seconds in game (default: to - from) */
  duration?: number;
  /** 0..1: where in the animation the hit / shot / cast lands */
  hitAt?: number;
  /** extra procedural motion after the clip pose; u in [0,1] is the normalized time */
  apply?: (b: Built, u: number, frame: number) => void;
  /** logical px travelled per loop (walk cycles); measured from the feet when omitted */
  stride?: number;
}

export interface SpriteDef {
  /** game sprite key, e.g. 'unit_swordsman' */
  id: string;
  build: () => Promise<Built>;
  /** scale the model so its first-frame height is this many logical px */
  heightPx?: number;
  /** degrees: 90 = pure profile, 0 = facing the camera. Default 62. */
  yaw?: number;
  /** 1 = baked facing right (allies), -1 = facing left (enemies) */
  facing?: 1 | -1;
  anims: Record<string, AnimDef>;
  /** bake a ground shadow frame (default true) */
  shadow?: boolean;
  /** outline radius in logical px (default 1.2, 0 = none) */
  outline?: number;
  rig?: Partial<LightRigOpts>;
  /** extra margin around the measured bounds, world units (default 0.18) */
  margin?: number;
  /** animation used for the shadow and the height measurement (default: 'idle' or the first) */
  restAnim?: string;
  /** lift the whole model (flyers), world units */
  lift?: number;
}

export interface SpriteMeta {
  id: string;
  frameW: number;
  frameH: number;
  anchorX: number;
  anchorY: number;
  /** logical px from the anchor up to the top of the resting pose */
  height: number;
  facing: 1 | -1;
  shadow: boolean;
  pages: Record<string, number>;
  anims: Record<string, { frames: number; duration: number; loop: boolean; hitAt?: number; stride?: number }>;
}

export interface SpriteBake {
  meta: SpriteMeta;
  files: Array<{ path: string; dataUrl: string }>;
  preview: HTMLCanvasElement;
}

const sprites = new Map<string, SpriteDef>();
export function defineSprite(def: SpriteDef): void {
  if (sprites.has(def.id)) throw new Error(`sprite "${def.id}" defined twice`);
  sprites.set(def.id, def);
}
export function spriteIds(): string[] {
  return [...sprites.keys()];
}
export function getSprite(id: string): SpriteDef {
  const d = sprites.get(id);
  if (!d) throw new Error(`unknown sprite "${id}" (have: ${spriteIds().join(', ')})`);
  return d;
}

interface Plan {
  anim: string;
  def: AnimDef;
  i: number;
  /** normalized time 0..1 */
  u: number;
  /** clip seconds */
  t: number;
}

function planFrames(def: SpriteDef, clipDuration: (name: string) => number): Plan[] {
  const out: Plan[] = [];
  for (const [anim, a] of Object.entries(def.anims)) {
    const from = a.from ?? 0;
    const to = a.to ?? (a.clip ? clipDuration(a.clip) : 1);
    for (let i = 0; i < a.frames; i++) {
      const u = a.frames === 1 ? 0 : a.loop ? i / a.frames : i / (a.frames - 1);
      out.push({ anim, def: a, i, u, t: from + (to - from) * u });
    }
  }
  return out;
}

function applyPlan(b: Built, p: Plan): void {
  if (p.def.clip && b.inst) pose(b.inst, p.def.clip, p.t);
  p.def.apply?.(b, p.u, p.i);
  b.root.updateMatrixWorld(true);
}

const _v = new THREE.Vector3();

/** bounds of visible meshes in the camera plane (world units relative to the origin) */
function projectedBounds(root: THREE.Object3D, right: THREE.Vector3, up: THREE.Vector3): { l: number; r: number; u: number; d: number } {
  const b = { l: 0, r: 0, u: 0, d: 0 };
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return;
    const pos = m.geometry.getAttribute('position');
    const sk = (m as unknown as THREE.SkinnedMesh).isSkinnedMesh ? (m as unknown as THREE.SkinnedMesh) : null;
    if (sk) sk.skeleton.update();
    const step = Math.max(1, Math.floor(pos.count / 900));
    for (let i = 0; i < pos.count; i += step) {
      _v.fromBufferAttribute(pos, i);
      if (sk) sk.applyBoneTransform(i, _v);
      _v.applyMatrix4(m.matrixWorld);
      const x = _v.dot(right);
      const y = _v.dot(up);
      if (x < b.l) b.l = x;
      if (x > b.r) b.r = x;
      if (y > b.u) b.u = y;
      if (y < b.d) b.d = y;
    }
  });
  return b;
}

function footTravel(b: Built, holder: THREE.Object3D, plans: Plan[]): number {
  const feet: THREE.Object3D[] = [];
  b.root.traverse((o) => {
    if (/^foot[._]?[lr]$/i.test(o.name)) feet.push(o);
  });
  if (feet.length === 0) return 0;
  let best = 0;
  for (const f of feet) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of plans) {
      applyPlan(b, p);
      f.getWorldPosition(_v);
      holder.worldToLocal(_v);
      min = Math.min(min, _v.z);
      max = Math.max(max, _v.z);
    }
    best = Math.max(best, max - min);
  }
  return best;
}

export async function bakeSprite(engine: Engine, def: SpriteDef, opts: { passes?: number; scales?: string[]; format?: 'webp' | 'png'; quality?: number } = {}): Promise<SpriteBake> {
  const passes = opts.passes ?? 32;
  const scales = opts.scales ?? Object.keys(SCALES);
  const format = opts.format ?? 'webp';
  const quality = opts.quality ?? 0.93;
  const facing = def.facing ?? 1;

  const built = await def.build();
  const holder = new THREE.Group();
  holder.add(built.root);
  holder.rotation.y = (facing * (def.yaw ?? 62) * Math.PI) / 180;
  if (def.lift) built.root.position.y += def.lift;

  const pitch = (PITCH * Math.PI) / 180;
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch));
  const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));

  const clipDuration = (name: string): number => {
    const c = built.inst?.clips.find((x) => x.name === name);
    if (!c) throw new Error(`${def.id}: no clip "${name}"`);
    return c.duration;
  };
  const plans = planFrames(def, clipDuration);
  const restName = def.restAnim ?? (def.anims.idle ? 'idle' : Object.keys(def.anims)[0]);
  const rest = plans.find((p) => p.anim === restName)!;

  // scale to the requested height
  applyPlan(built, rest);
  if (def.heightPx) {
    const b0 = projectedBounds(holder, right, up);
    const lift = def.lift ?? 0;
    const h = b0.u - lift * Math.cos(pitch);
    built.root.scale.multiplyScalar(def.heightPx / (h * PPU));
    holder.updateMatrixWorld(true);
  }

  // union bounds over every frame
  const B = { l: 0, r: 0, u: 0, d: 0 };
  for (const p of plans) {
    applyPlan(built, p);
    const b = projectedBounds(holder, right, up);
    B.l = Math.min(B.l, b.l);
    B.r = Math.max(B.r, b.r);
    B.u = Math.max(B.u, b.u);
    B.d = Math.min(B.d, b.d);
  }
  const margin = def.margin ?? 0.18;
  const L = Math.ceil((-B.l + margin) * PPU);
  const R = Math.ceil((B.r + margin) * PPU);
  const U = Math.ceil((B.u + margin) * PPU);
  const D = Math.ceil((-B.d + margin) * PPU);
  const frameW = L + R;
  const frameH = U + D;

  applyPlan(built, rest);
  const restBounds = projectedBounds(holder, right, up);

  const cam = new THREE.OrthographicCamera(-L / PPU, R / PPU, U / PPU, -D / PPU, 0.1, 100);
  cam.position.copy(dir).multiplyScalar(40);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);

  const scene = new THREE.Scene();
  const radius = Math.max(L, R, U, D) / PPU + 1;
  const rig = new LightRig({ ...DEFAULT_RIG, ...def.rig, shadowRadius: radius, shadowCenter: [0, U / PPU / 2, 0] });
  scene.add(rig.group, holder);

  const outline = def.outline ?? 1.2;
  const items: Record<string, PackItem[]> = {};
  for (const s of scales) items[s] = [];
  const previewFrames: Array<{ anim: string; canvas: HTMLCanvasElement }> = [];

  const emit = (name: string, img: ReturnType<Engine['accumulate']>, withOutline: boolean, anim: string | null): void => {
    for (const s of scales) {
      const { div, scale } = SCALES[s];
      let canvas = toCanvas(toImageData(downsample(img, div)));
      if (withOutline && outline > 0) canvas = addOutline(canvas, outline * scale);
      const t = trim(canvas, 1);
      items[s].push({ name, canvas: t.canvas, trimX: t.x, trimY: t.y, sourceW: t.sourceW, sourceH: t.sourceH });
      if (s === scales[0] && anim) previewFrames.push({ anim, canvas });
    }
  };

  for (const p of plans) {
    applyPlan(built, p);
    const img = engine.accumulate(scene, cam, frameW * MASTER, frameH * MASTER, passes, (k, K) => rig.pass(k, K));
    emit(`${p.anim}/${p.i}`, img, true, p.anim);
  }

  // ground shadow from the resting pose
  const wantShadow = def.shadow ?? true;
  let shadowPreview: HTMLCanvasElement | null = null;
  if (wantShadow) {
    applyPlan(built, rest);
    const restore: Array<() => void> = [];
    holder.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const cw = mat.colorWrite;
        const dw = mat.depthWrite;
        mat.colorWrite = false;
        mat.depthWrite = false;
        restore.push(() => {
          mat.colorWrite = cw;
          mat.depthWrite = dw;
        });
      }
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const img = engine.accumulate(scene, cam, frameW * MASTER, frameH * MASTER, Math.max(passes, 48), (k, K) => rig.pass(k, K));
    emit('shadow', img, false, null);
    shadowPreview = toCanvas(toImageData(downsample(img, SCALES[scales[0]].div)));
    scene.remove(ground);
    ground.geometry.dispose();
    for (const r of restore) r();
  }

  // meta
  const anims: SpriteMeta['anims'] = {};
  for (const [name, a] of Object.entries(def.anims)) {
    const from = a.from ?? 0;
    const to = a.to ?? (a.clip ? clipDuration(a.clip) : 1);
    const entry: SpriteMeta['anims'][string] = { frames: a.frames, duration: +(a.duration ?? to - from).toFixed(3), loop: !!a.loop };
    if (a.hitAt !== undefined) entry.hitAt = a.hitAt;
    if (a.stride !== undefined) entry.stride = a.stride;
    else if (a.loop && /walk|run/.test(name)) {
      const travel = footTravel(built, holder, plans.filter((p) => p.anim === name));
      if (travel > 0) entry.stride = Math.round(travel * 1.7 * PPU);
    }
    anims[name] = entry;
  }

  const files: SpriteBake['files'] = [];
  const pages: Record<string, number> = {};
  const mime = format === 'webp' ? 'image/webp' : 'image/png';
  for (const s of scales) {
    const packed = pack(items[s], 2048, 2);
    pages[s] = packed.length;
    packed.forEach((p, i) => files.push({ path: `public/assets/sprites/${s}/${def.id}-${i}.${format}`, dataUrl: p.canvas.toDataURL(mime, quality) }));
    const json = multiatlasJson(packed, (i) => `${def.id}-${i}.${format}`);
    files.push({ path: `public/assets/sprites/${s}/${def.id}.json`, dataUrl: `data:application/json;base64,${btoa(JSON.stringify(json))}` });
  }
  const lift = def.lift ?? 0;
  const meta: SpriteMeta = {
    id: def.id,
    frameW,
    frameH,
    anchorX: L,
    anchorY: U,
    height: Math.round((restBounds.u - 0) * PPU),
    facing,
    shadow: wantShadow,
    pages,
    anims,
  };
  void lift;
  files.push({ path: `public/assets/sprites/meta/${def.id}.json`, dataUrl: `data:application/json;base64,${btoa(JSON.stringify(meta, null, 1))}` });

  // preview sheet: one row per animation
  const s0 = SCALES[scales[0]].scale;
  const fw = Math.round(frameW * s0);
  const fh = Math.round(frameH * s0);
  const names = Object.keys(def.anims);
  const maxFrames = Math.max(...names.map((n) => def.anims[n].frames));
  const zoom = Math.min(1, 1900 / (maxFrames * fw + 150), 1900 / (names.length * fh));
  const preview = document.createElement('canvas');
  preview.width = Math.round((maxFrames * fw + 150) * zoom);
  preview.height = Math.round(names.length * fh * zoom);
  const g = preview.getContext('2d')!;
  g.fillStyle = '#4a4f5c';
  g.fillRect(0, 0, preview.width, preview.height);
  g.scale(zoom, zoom);
  g.font = `${Math.round(13 / zoom)}px monospace`;
  names.forEach((n, row) => {
    const y = row * fh;
    g.fillStyle = row % 2 ? '#454a57' : '#50566a';
    g.fillRect(0, y, maxFrames * fw + 150, fh);
    // ground line at the anchor
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(150, y + U * s0, maxFrames * fw, 1 / zoom);
    const a = anims[n];
    g.fillStyle = '#fff';
    g.fillText(n, 6, y + 20 / zoom);
    g.fillText(`${a.frames}f ${a.duration}s${a.loop ? ' loop' : ''}`, 6, y + 40 / zoom);
    if (a.hitAt !== undefined) g.fillText(`hit ${a.hitAt}`, 6, y + 60 / zoom);
    if (a.stride) g.fillText(`stride ${a.stride}`, 6, y + 60 / zoom);
    previewFrames
      .filter((f) => f.anim === n)
      .forEach((f, i) => {
        if (shadowPreview) {
          g.globalAlpha = 0.5;
          g.drawImage(shadowPreview, 150 + i * fw, y);
          g.globalAlpha = 1;
        }
        g.drawImage(f.canvas, 150 + i * fw, y);
      });
  });

  scene.remove(holder);
  built.inst?.mixer.stopAllAction();
  return { meta, files, preview };
}
