/**
 * Art bake page. The Node driver (tools/bake/run.mjs) calls window.__bake.run(job, args)
 * and writes the returned files to disk.
 */
import * as THREE from 'three';
import { byName, instantiate, loadProp, pose, poseBounds, type Instance } from './assets';
import { addOutline, DEFAULT_RIG, downsample, Engine, LightRig, toCanvas, toImageData, type LightRigOpts } from './engine';
import { bakeSprite, getSprite, PITCH, spriteIds } from './sprite';
import * as assetsLib from './assets';
import * as characterLib from './character';
import * as propsLib from './props';
import * as spriteLib from './sprite';

export interface OutFile {
  path: string;
  base64: string;
}
export interface JobResult {
  files: OutFile[];
  log: string[];
}
type Job = (args: Record<string, unknown>, log: (s: string) => void) => Promise<OutFile[]>;

const engine = new Engine();
const jobs = new Map<string, Job>();

export function registerJob(name: string, job: Job): void {
  jobs.set(name, job);
}

export function pngFile(path: string, canvas: HTMLCanvasElement): OutFile {
  return { path, base64: canvas.toDataURL('image/png').split(',')[1] };
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

// ---------------------------------------------------------------------------
// job: contact sheet of models, to look at what the asset packs contain
// ---------------------------------------------------------------------------

interface SheetItem {
  url: string;
  label?: string;
  /** rigged character: clip + time to pose */
  clip?: string;
  t?: number;
  /** node names to hide */
  hide?: string[];
  /** if set, hide every child of handslot.l / handslot.r except these */
  hands?: string[];
  yaw?: number;
}

registerJob('sheet', async (args, log) => {
  const items = args.items as SheetItem[];
  const cols = (args.cols as number) ?? 6;
  const cell = (args.cell as number) ?? 320;
  const fit = (args.fit as number) ?? 0; // world units tall to fit; 0 = auto per item
  const rows = Math.ceil(items.length / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * cell;
  sheet.height = rows * (cell + 18);
  const g = sheet.getContext('2d')!;
  g.fillStyle = (args.bg as string) ?? '#3a3f4b';
  g.fillRect(0, 0, sheet.width, sheet.height);
  g.font = '12px monospace';
  g.textAlign = 'center';
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let obj: THREE.Object3D;
    let inst: Instance | null = null;
    try {
      if (it.clip) {
        inst = await instantiate(it.url);
        obj = inst.root;
        for (const n of it.hide ?? []) {
          const o = obj.getObjectByName(n);
          if (o) o.visible = false;
        }
        if (it.hands) {
          for (const slot of ['handslot.l', 'handslot.r', 'handslotl', 'handslotr']) {
            const s = obj.getObjectByName(slot);
            if (s) for (const c of s.children) c.visible = it.hands.includes(c.name);
          }
        }
        pose(inst, it.clip, it.t ?? 0);
      } else {
        obj = await loadProp(it.url);
      }
    } catch (err) {
      log(`FAILED ${it.url}: ${String(err)}`);
      continue;
    }
    const holder = new THREE.Group();
    holder.add(obj);
    holder.rotation.y = (((it.yaw ?? 35) as number) * Math.PI) / 180;
    holder.updateMatrixWorld(true);
    const box = poseBounds(holder);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const span = fit > 0 ? fit : Math.max(size.x, size.y, size.z) * 1.25 + 0.2;
    const canvas = shoot(holder, {
      w: cell,
      h: cell,
      pxPerUnit: cell / span,
      lookAt: fit > 0 ? new THREE.Vector3(0, fit / 2 - 0.15, 0) : center,
      ground: true,
      passes: (args.passes as number) ?? 24,
      rig: { shadowRadius: Math.max(3, span), shadowCenter: [center.x, center.y, center.z] },
      outline: (args.outline as number) ?? 0,
    });
    const cx = (i % cols) * cell;
    const cy = Math.floor(i / cols) * (cell + 18);
    g.drawImage(canvas, cx, cy);
    g.fillStyle = '#fff';
    g.fillText(`${it.label ?? it.url.split('/').pop()} ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`, cx + cell / 2, cy + cell + 13);
    if (inst) inst.mixer.stopAllAction();
  }
  log(`sheet ${items.length} items, ${sheet.width}x${sheet.height}`);
  return [pngFile((args.out as string) ?? 'output/bake/sheet.png', sheet)];
});

// ---------------------------------------------------------------------------
// job: strips of animation clips for one rig, to choose clips and check hand-slot axes
// ---------------------------------------------------------------------------

registerJob('clips', async (args, log) => {
  const url = args.url as string;
  const clips = args.clips as string[];
  const frames = (args.frames as number) ?? 8;
  const cell = (args.cell as number) ?? 230;
  const sheet = document.createElement('canvas');
  sheet.width = frames * cell + 170;
  sheet.height = clips.length * cell;
  const g = sheet.getContext('2d')!;
  g.fillStyle = '#3a3f4b';
  g.fillRect(0, 0, sheet.width, sheet.height);
  g.font = '12px monospace';
  const inst = await instantiate(url);
  const hands = (args.hands as string[]) ?? [];
  for (const slot of ['handslot.l', 'handslot.r']) {
    for (const c of byName(inst.root, slot).children) c.visible = hands.includes(c.name);
  }
  if (args.axes) {
    // X red, Y green, Z blue sticks on both hand slots
    for (const slot of ['handslot.l', 'handslot.r']) {
      const s = byName(inst.root, slot);
      const mk = (c: number, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.06 + x * 0.6, 0.06 + y * 0.6, 0.06 + z * 0.6), new THREE.MeshBasicMaterial({ color: c }));
        m.position.set(x * 0.3, y * 0.3, z * 0.3);
        s.add(m);
      };
      mk(0xff3030, 1, 0, 0);
      mk(0x30ff30, 0, 1, 0);
      mk(0x3060ff, 0, 0, 1);
    }
  }
  const holder = new THREE.Group();
  holder.add(inst.root);
  holder.rotation.y = ((((args.yaw as number) ?? 62) as number) * Math.PI) / 180;
  for (let r = 0; r < clips.length; r++) {
    const clip = inst.clips.find((c) => c.name === clips[r]);
    if (!clip) {
      log(`no clip ${clips[r]}`);
      continue;
    }
    for (let i = 0; i < frames; i++) {
      pose(inst, clip.name, (clip.duration * i) / (frames - 1));
      holder.updateMatrixWorld(true);
      const canvas = shoot(holder, { w: cell, h: cell, pxPerUnit: cell / 4.2, lookAt: new THREE.Vector3(0.3, 1.2, 0), pitch: PITCH, ground: true, passes: 12, rig: { shadowRadius: 4 } });
      g.drawImage(canvas, 170 + i * cell, r * cell);
    }
    g.fillStyle = '#fff';
    g.fillText(clip.name, 4, r * cell + 20);
    g.fillText(`${clip.duration.toFixed(2)}s`, 4, r * cell + 38);
  }
  return [pngFile((args.out as string) ?? 'output/bake/clips.png', sheet)];
});

// ---------------------------------------------------------------------------
// job: bake one sprite (atlases + meta + preview)
// ---------------------------------------------------------------------------

registerJob('sprite', async (args, log) => {
  const def = getSprite(args.id as string);
  const t0 = performance.now();
  const bake = await bakeSprite(engine, def, { passes: args.passes as number | undefined, scales: args.scales as string[] | undefined });
  const m = bake.meta;
  log(`${def.id}: frame ${m.frameW}x${m.frameH} anchor ${m.anchorX},${m.anchorY} height ${m.height} pages ${JSON.stringify(m.pages)} ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  const files: OutFile[] = bake.files.map((f) => ({ path: f.path, base64: f.dataUrl.split(',')[1] }));
  files.push(pngFile(`output/bake/preview/${def.id}.png`, bake.preview));
  return files;
});

registerJob('list', async (_args, log) => {
  for (const id of spriteIds()) log(id);
  return [];
});

// sprite definitions register themselves on import
import.meta.glob('./defs/*.ts', { eager: true });

// ---------------------------------------------------------------------------

const api = {
  /** modules for ad-hoc page.evaluate scripts (bare imports do not resolve there) */
  lib: { THREE, assets: assetsLib, character: characterLib, props: propsLib, sprite: spriteLib, engine, shoot },
  info: () => engine.info(),
  jobs: () => [...jobs.keys()],
  async run(name: string, args: Record<string, unknown> = {}): Promise<JobResult> {
    const job = jobs.get(name);
    if (!job) throw new Error(`unknown job "${name}"`);
    const log: string[] = [];
    const files = await job(args, (s) => log.push(s));
    return { files, log };
  },
};
(window as unknown as { __bake: typeof api }).__bake = api;
document.getElementById('log')!.textContent = `bake ready: ${engine.info()}`;
