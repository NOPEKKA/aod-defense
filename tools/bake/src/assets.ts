/** GLTF loading and instancing for the bake tool. URLs are relative to art-src/ (served as the site root). */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function loadGltf(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    cache.set(url, p);
  }
  return p;
}

export interface Instance {
  root: THREE.Object3D;
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
}

function prepare(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    }
  });
}

/** A fresh, independently animatable copy of a rigged character. */
export async function instantiate(url: string): Promise<Instance> {
  const g = await loadGltf(url);
  const root = SkeletonUtils.clone(g.scene) as THREE.Object3D;
  prepare(root);
  return { root, clips: [...g.animations], mixer: new THREE.AnimationMixer(root) };
}

/** A copy of a static model (props, walls, buildings). */
export async function loadProp(url: string): Promise<THREE.Object3D> {
  const g = await loadGltf(url);
  const root = g.scene.clone(true);
  prepare(root);
  return root;
}

export function findClip(inst: Instance, name: string): THREE.AnimationClip {
  const clip = inst.clips.find((c) => c.name === name);
  if (!clip) throw new Error(`no clip "${name}" (have: ${inst.clips.map((c) => c.name).join(', ')})`);
  return clip;
}

/** Put the instance in the pose of `clipName` at time t (seconds). */
export function pose(inst: Instance, clipName: string, t: number): void {
  const clip = findClip(inst, clipName);
  inst.mixer.stopAllAction();
  const action = inst.mixer.clipAction(clip);
  action.reset();
  action.play();
  inst.mixer.setTime(Math.max(0, Math.min(t, clip.duration - 1e-4)));
  inst.root.updateMatrixWorld(true);
}

/** Find a node by name. GLTFLoader strips dots from names ("handslot.r" -> "handslotr"); both spellings work. */
export function byName(root: THREE.Object3D, name: string): THREE.Object3D {
  const o = root.getObjectByName(name) ?? root.getObjectByName(name.replace(/\./g, ''));
  if (!o) {
    const names: string[] = [];
    root.traverse((x) => names.push(x.name));
    throw new Error(`no node "${name}" (have: ${names.join(', ')})`);
  }
  return o;
}

/** World-space bounding box of visible meshes, honouring the current skinned pose. */
export function poseBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !isVisible(m)) return;
    const pos = m.geometry.getAttribute('position');
    const sk = (m as unknown as THREE.SkinnedMesh).isSkinnedMesh ? (m as unknown as THREE.SkinnedMesh) : null;
    if (sk) sk.skeleton.update();
    const step = Math.max(1, Math.floor(pos.count / 400));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      if (sk) sk.applyBoneTransform(i, v);
      v.applyMatrix4(m.matrixWorld);
      box.expandByPoint(v);
    }
  });
  return box;
}

function isVisible(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
