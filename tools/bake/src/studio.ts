/**
 * Shared studio state for the bake page: the render engine, the job registry
 * and the one-shot "shoot an object" helper. Jobs live in ./jobs/*.ts and
 * sprite definitions in ./defs/*.ts; both are loaded automatically by main.ts.
 */
import * as THREE from 'three';
import { addOutline, DEFAULT_RIG, downsample, Engine, LightRig, toCanvas, toImageData, type LightRigOpts } from './engine';

export interface OutFile {
  /** path relative to the repo root */
  path: string;
  base64: string;
}
export interface JobResult {
  files: OutFile[];
  log: string[];
}
export type Job = (args: Record<string, unknown>, log: (s: string) => void) => Promise<OutFile[]>;

export const engine = new Engine();
const jobs = new Map<string, Job>();

export function registerJob(name: string, job: Job): void {
  if (jobs.has(name)) throw new Error(`job "${name}" registered twice`);
  jobs.set(name, job);
}
export function jobNames(): string[] {
  return [...jobs.keys()];
}
export async function runJob(name: string, args: Record<string, unknown> = {}): Promise<JobResult> {
  const job = jobs.get(name);
  if (!job) throw new Error(`unknown job "${name}" (have: ${jobNames().join(', ')})`);
  const log: string[] = [];
  const files = await job(args, (s) => log.push(s));
  return { files, log };
}

export function pngFile(path: string, canvas: HTMLCanvasElement): OutFile {
  return { path, base64: canvas.toDataURL('image/png').split(',')[1] };
}
export function webpFile(path: string, canvas: HTMLCanvasElement, quality = 0.92): OutFile {
  return { path, base64: canvas.toDataURL('image/webp', quality).split(',')[1] };
}
export function jsonFile(path: string, value: unknown): OutFile {
  const bytes = new TextEncoder().encode(JSON.stringify(value, null, 1));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return { path, base64: btoa(bin) };
}

export interface ShotOpts {
  /** output size in px */
  w: number;
  h: number;
  /** output px per world unit */
  pxPerUnit: number;
  /** supersampling factor (integer) */
  ss?: number;
  passes?: number;
  lookAt: THREE.Vector3;
  /** camera pitch in degrees (0 = level, positive looks down) */
  pitch?: number;
  rig?: Partial<LightRigOpts>;
  /** add a shadow-catching ground plane at y=0 */
  ground?: boolean;
  outline?: number;
}

/** Render one object with the standard rig and return an 8-bit canvas. */
export function shoot(obj: THREE.Object3D, o: ShotOpts): HTMLCanvasElement {
  const ss = o.ss ?? 2;
  const scene = new THREE.Scene();
  const rig = new LightRig({ ...DEFAULT_RIG, ...o.rig });
  scene.add(rig.group, obj);
  let ground: THREE.Mesh | null = null;
  if (o.ground) {
    ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.55 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }
  const hw = o.w / (2 * o.pxPerUnit);
  const hh = o.h / (2 * o.pxPerUnit);
  const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 100);
  const pitch = ((o.pitch ?? 14) * Math.PI) / 180;
  cam.position.copy(o.lookAt).add(new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(30));
  cam.lookAt(o.lookAt);
  cam.updateMatrixWorld(true);
  const img = engine.accumulate(scene, cam, o.w * ss, o.h * ss, o.passes ?? 32, (k, K) => rig.pass(k, K));
  scene.remove(obj);
  if (ground) {
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
  }
  let canvas = toCanvas(toImageData(downsample(img, ss)));
  if (o.outline) canvas = addOutline(canvas, o.outline);
  return canvas;
}
