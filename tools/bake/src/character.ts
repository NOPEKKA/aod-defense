/**
 * Build a game character from the KayKit rigs.
 *
 * All nine rigs (Knight, Barbarian, Mage, Rogue, Rogue_Hooded and the four
 * skeletons) share one 41-bone skeleton, so skinned parts and animation clips
 * can be mixed freely: a Knight head on a Rogue body, skeleton clips on a knight.
 */
import * as THREE from 'three';
import { byName, instantiate, loadGltf, loadProp, type Instance } from './assets';

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
  recolor?: Recolor;
}

/** palette cell 'col,row' (8x4 grid) -> one colour or a [top, bottom] gradient */
export type Recolor = Record<string, string | [string, string]>;

/** a skinned part taken from another rig (head, body, arm, leg, cloak...) */
export interface PartSpec {
  /** donor URL, e.g. '/kaykit/adventurers/Knight.glb' */
  from: string;
  /** donor skinned mesh name, e.g. 'Knight_Head' */
  mesh: string;
  /** base mesh to hide, e.g. 'Rogue_Head' */
  replace?: string;
  recolor?: Recolor;
}

/** a rigid item taken from another rig together with its placement (helmet, hat, built-in weapon) */
export interface BorrowSpec {
  from: string;
  /** donor node name, e.g. 'Knight_Helmet', '1H_Sword' */
  node: string;
  /** bone to hang it on; default: the donor parent's name (e.g. 'head', 'handslot.r') */
  to?: string;
  recolor?: Recolor;
  as?: string;
}

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
  /** repaint palette cells of the base texture */
  recolor?: Recolor;
  parts?: PartSpec[];
  borrow?: BorrowSpec[];
  attach?: AttachSpec[];
  /** extra rigs whose animation clips should be available (same skeleton) */
  clipsFrom?: string[];
  /** uniform scale of the whole character */
  scale?: number;
  /** mirror left/right (the rig is right-handed; mirroring makes a left-handed character) */
  mirror?: boolean;
  /** multiply every material colour (zombie skin, ghost...) */
  tint?: number;
  /** make some meshes glow (eyes, runes) */
  emissive?: Array<{ node: string; color: number; intensity: number }>;
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

/**
 * Repaint palette cells of every texture used under `root`.
 * Each distinct source texture is repainted once and shared.
 */
export function recolorTexture(root: THREE.Object3D, recolor: Recolor, only?: THREE.Texture): void {
  const done = new Map<THREE.Texture, THREE.Texture>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const tex = mat.map;
    if (!tex || (only && tex !== only)) return;
    let out = done.get(tex);
    if (!out) {
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
      out = new THREE.CanvasTexture(canvas);
      out.flipY = tex.flipY;
      out.colorSpace = tex.colorSpace;
      out.wrapS = tex.wrapS;
      out.wrapT = tex.wrapT;
      out.magFilter = tex.magFilter;
      out.minFilter = tex.minFilter;
      out.generateMipmaps = tex.generateMipmaps;
      out.needsUpdate = true;
      done.set(tex, out);
    }
    mat.map = out;
  });
}

function firstSkinned(root: THREE.Object3D): THREE.SkinnedMesh {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh;
  });
  if (!found) throw new Error('rig has no skinned mesh');
  return found;
}

export async function attach(root: THREE.Object3D, spec: AttachSpec, parts: Record<string, THREE.Object3D>): Promise<THREE.Object3D> {
  const parent = byName(root, spec.to);
  const obj = typeof spec.object === 'string' ? await loadProp(spec.object) : spec.object;
  if (spec.recolor) recolorTexture(obj, spec.recolor);
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

  const anchor = firstSkinned(root);
  for (const p of o.parts ?? []) {
    const donor = await instantiate(p.from);
    const mesh = byName(donor.root, p.mesh) as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) throw new Error(`${p.mesh} in ${p.from} is not a skinned mesh (use borrow for rigid items)`);
    if (p.recolor) recolorTexture(mesh, p.recolor);
    anchor.parent!.add(mesh);
    mesh.bind(anchor.skeleton, anchor.bindMatrix);
    if (p.replace) byName(root, p.replace).visible = false;
  }
  for (const b of o.borrow ?? []) {
    const donor = await instantiate(b.from);
    const node = byName(donor.root, b.node);
    const to = b.to ?? node.parent!.name;
    node.visible = true;
    if (b.recolor) recolorTexture(node, b.recolor);
    byName(root, to).add(node);
    if (b.as) parts[b.as] = node;
  }
  for (const url of o.clipsFrom ?? []) {
    const g = await loadGltf(url);
    for (const c of g.animations) if (!inst.clips.some((x) => x.name === c.name)) inst.clips.push(c);
  }

  if (o.tint !== undefined) {
    const t = new THREE.Color(o.tint);
    root.traverse((x) => {
      const m = x as THREE.Mesh;
      if (m.isMesh) (m.material as THREE.MeshStandardMaterial).color.multiply(t);
    });
  }
  for (const e of o.emissive ?? []) {
    byName(root, e.node).traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissive = new THREE.Color(e.color);
      mat.emissiveIntensity = e.intensity;
      mat.emissiveMap = null;
    });
  }
  for (const a of o.attach ?? []) await attach(root, a, parts);
  if (o.scale) root.scale.multiplyScalar(o.scale);
  if (o.mirror) root.scale.x *= -1;
  return { root, inst, parts };
}

/** Wrap a static object (prop, machine, vehicle) as a Built. */
export function staticBuilt(root: THREE.Object3D, parts: Record<string, THREE.Object3D> = {}): Built {
  return { root, parts };
}
