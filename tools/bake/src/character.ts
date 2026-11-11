/**
 * Build a game character from a KayKit rig: choose which built-in parts show,
 * recolour palette cells, attach extra props to bones.
 */
import * as THREE from 'three';
import { byName, instantiate, loadProp, type Instance } from './assets';

export interface Built {
  root: THREE.Object3D;
  inst?: Instance;
  /** free-form handles for procedural animation (wings, flames, wheels...) */
  parts: Record<string, THREE.Object3D>;
}

export interface AttachSpec {
  /** bone or node name on the rig, e.g. 'handslot.r', 'head', 'chest' */
  to: string;
  /** a ready object, or a prop URL under art-src (e.g. '/kaykit/skeletons/props/Skeleton_Axe.gltf') */
  object: THREE.Object3D | string;
  pos?: [number, number, number];
  /** degrees */
  rot?: [number, number, number];
  scale?: number | [number, number, number];
  /** key under Built.parts */
  as?: string;
}

/** palette cell 'col,row' (8x4 grid) -> one colour or a [top, bottom] gradient */
export type Recolor = Record<string, string | [string, string]>;

export interface CharOpts {
  /** URL under art-src, e.g. '/kaykit/adventurers/Knight.glb' */
  base: string;
  /** node names to hide (helmet, cape, ...) */
  hide?: string[];
  /**
   * Built-in hand items to keep: names of children of handslot.l / handslot.r.
   * Everything else in the hand slots is hidden. Omit to hide all built-in items.
   */
  hands?: string[];
  recolor?: Recolor;
  /** uniform scale of the whole character */
  scale?: number;
  attach?: AttachSpec[];
  /** multiply every material colour (zombie skin, ghost...) */
  tint?: number;
  emissive?: { nodes: string[]; color: number; intensity: number };
}

const COLS = 8;
const ROWS = 4;

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l * f)));
  return `#${c.getHexString()}`;
}

/** Repaint palette cells of the model's texture. Returns the new texture. */
export function recolorTexture(root: THREE.Object3D, recolor: Recolor): THREE.Texture | null {
  let src: THREE.Texture | null = null;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !src) src = (m.material as THREE.MeshStandardMaterial).map ?? null;
  });
  if (!src) return null;
  const tex = src as THREE.Texture;
  const img = tex.image as HTMLImageElement | ImageBitmap;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const g = canvas.getContext('2d')!;
  g.drawImage(img as CanvasImageSource, 0, 0);
  const cw = canvas.width / COLS;
  const ch = canvas.height / ROWS;
  for (const [cell, value] of Object.entries(recolor)) {
    const [c, r] = cell.split(',').map(Number);
    const [top, bottom] = Array.isArray(value) ? value : [shade(value, 1.18), shade(value, 0.72)];
    const grad = g.createLinearGradient(0, r * ch, 0, (r + 1) * ch);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(c * cw, r * ch, cw, ch);
    // the lighter accent strip KayKit keeps at the right edge of a cell
    const strip = g.createLinearGradient(0, r * ch, 0, (r + 1) * ch);
    strip.addColorStop(0, shade(top, 1.1));
    strip.addColorStop(1, shade(bottom, 1.1));
    g.fillStyle = strip;
    g.fillRect(c * cw + cw * 0.84, r * ch + ch * 0.08, cw * 0.16, ch * 0.84);
  }
  const out = new THREE.CanvasTexture(canvas);
  out.flipY = tex.flipY;
  out.colorSpace = tex.colorSpace;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.magFilter = tex.magFilter;
  out.minFilter = tex.minFilter;
  out.generateMipmaps = tex.generateMipmaps;
  out.needsUpdate = true;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.map === tex) mat.map = out;
    }
  });
  return out;
}

export async function attach(root: THREE.Object3D, spec: AttachSpec, parts: Record<string, THREE.Object3D>): Promise<THREE.Object3D> {
  const parent = byName(root, spec.to);
  const obj = typeof spec.object === 'string' ? await loadProp(spec.object) : spec.object;
  const holder = new THREE.Group();
  holder.add(obj);
  if (spec.pos) holder.position.fromArray(spec.pos);
  if (spec.rot) holder.rotation.set(...(spec.rot.map((d) => (d * Math.PI) / 180) as [number, number, number]));
  if (spec.scale !== undefined) {
    if (typeof spec.scale === 'number') holder.scale.setScalar(spec.scale);
    else holder.scale.fromArray(spec.scale);
  }
  parent.add(holder);
  if (spec.as) parts[spec.as] = holder;
  return holder;
}

const SLOTS = ['handslot.l', 'handslot.r'];

export async function character(o: CharOpts): Promise<Built> {
  const inst = await instantiate(o.base);
  const root = inst.root;
  const parts: Record<string, THREE.Object3D> = {};
  for (const slot of SLOTS) {
    for (const c of byName(root, slot).children) c.visible = (o.hands ?? []).includes(c.name);
  }
  for (const n of o.hide ?? []) byName(root, n).visible = false;
  if (o.recolor) recolorTexture(root, o.recolor);
  if (o.tint !== undefined) {
    const t = new THREE.Color(o.tint);
    root.traverse((x) => {
      const m = x as THREE.Mesh;
      if (m.isMesh) (m.material as THREE.MeshStandardMaterial).color.multiply(t);
    });
  }
  if (o.emissive) {
    for (const n of o.emissive.nodes) {
      const m = byName(root, n) as THREE.Mesh;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissive = new THREE.Color(o.emissive.color);
      mat.emissiveIntensity = o.emissive.intensity;
      mat.emissiveMap = null;
    }
  }
  for (const a of o.attach ?? []) await attach(root, a, parts);
  if (o.scale) root.scale.setScalar(o.scale);
  return { root, inst, parts };
}

/** Wrap a static object (prop, machine, vehicle) as a Built. */
export function staticBuilt(root: THREE.Object3D, parts: Record<string, THREE.Object3D> = {}): Built {
  return { root, parts };
}
