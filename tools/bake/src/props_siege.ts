/**
 * Siege engines of the Deadite army: battering ram and catapult (owner: enemies art agent).
 * Both are built facing +X (front = +X); the sprite definitions mirror them to face left.
 * Units: 1 = 75 logical px.
 */
import * as THREE from 'three';
import { pose } from './assets';
import { character, type Built } from './character';
import { at, box, cone, cyl, extrude, group, mat, sphere, torus } from './props';
import { bend, DEAD, deaditeEyes, RECOLOR, rod } from './props_enemies';

const RAD = Math.PI / 180;
const SKE = '/kaykit/skeletons';

/** a skeleton crew member without a weapon */
export async function crewSkeleton(scale = 0.9): Promise<Built> {
  const b = await character({
    base: `${SKE}/Skeleton_Minion.glb`,
    recolor: RECOLOR.Minion,
    emissive: deaditeEyes('Skeleton_Minion'),
    scale,
  });
  return b;
}

/** a spoked wheel in the XY plane, axle along Z */
export function spokedWheel(r: number, spokes = 8, width = 0.14): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(DEAD.woodC);
  const dark = mat(DEAD.woodDarkC);
  const iron = mat(DEAD.ironC, { rough: 0.55, metal: 0.3 });
  g.add(at(cyl(r, r, width, wood, 14), 0, 0, 0, 90, 0, 0));
  g.add(at(torus(r, 0.05, iron, 14), 0, 0, 0));
  g.add(at(cyl(r * 0.3, r * 0.3, width + 0.1, dark, 8), 0, 0, 0, 90, 0, 0));
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const s = at(box(r * 1.9, 0.07, width + 0.06, dark), 0, 0, 0);
    s.rotation.z = a + Math.PI / spokes / 2;
    g.add(s);
  }
  // a notch so the turning reads
  g.add(at(box(0.12, 0.12, width + 0.1, iron), r * 0.75, 0, 0));
  return g;
}

// ---------------------------------------------------------------------------
// Battering ram
// ---------------------------------------------------------------------------
export interface RamBuilt {
  root: THREE.Group;
  body: THREE.Group;
  roof: THREE.Group;
  log: THREE.Group;
  wheels: THREE.Group[];
  crew: Built[];
  crewHolders: THREE.Group[];
  frame: THREE.Group;
}

export async function buildRam(): Promise<RamBuilt> {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wood = mat(DEAD.woodC);
  const woodD = mat(DEAD.woodDarkC);
  const iron = mat(DEAD.ironC, { rough: 0.55, metal: 0.35 });
  const rust = mat(DEAD.rustC, { rough: 0.7, metal: 0.2 });
  const bone = mat(DEAD.boneC, { rough: 0.7 });
  const rag = mat(DEAD.redC);
  const frame = new THREE.Group();
  body.add(frame);

  // chassis
  for (const z of [-0.58, 0.58]) frame.add(at(box(3.9, 0.2, 0.18, woodD), 0.1, 0.72, z));
  for (const x of [-1.5, -0.5, 0.5, 1.5]) frame.add(at(box(0.18, 0.16, 1.34, wood), x, 0.72, 0));
  // axles
  for (const x of [-1.2, 1.2]) frame.add(at(cyl(0.06, 0.06, 1.7, iron, 6), x, 0.45, 0, 90, 0, 0));
  // posts and roof beams (three arches)
  for (const x of [-1.45, 0, 1.45]) {
    for (const z of [-0.6, 0.6]) frame.add(at(box(0.16, 1.45, 0.16, wood), x, 1.5, z));
    frame.add(at(box(0.16, 0.16, 1.4, woodD), x, 2.2, 0));
  }
  for (const z of [-0.6, 0.6]) frame.add(at(box(3.4, 0.14, 0.14, woodD), 0, 1.55, z));
  // pitched roof of planks (a separate group so it can fall apart)
  const roof = new THREE.Group();
  for (const s of [-1, 1]) {
    const slope = at(box(3.5, 0.1, 0.95, mat(0x5a3d2b)), 0, 2.38, s * 0.42, s * -24, 0, 0);
    roof.add(slope);
    for (let i = 0; i < 5; i++) roof.add(at(box(0.07, 0.04, 0.95, woodD), -1.5 + i * 0.75, 2.45, s * 0.42, s * -24, 0, 0));
  }
  roof.add(at(box(3.6, 0.1, 0.12, woodD), 0, 2.64, 0));
  // red rag hanging off the front of the roof and a skull on the ridge
  roof.add(at(extrude([[0, 0], [0.3, 0], [0.24, -0.5], [0.15, -0.38], [0.06, -0.55], [0, -0.3]], 0.03, rag), 1.75, 2.5, 0.2, 0, 90, 0));
  roof.add(at(sphere(0.2, bone, 8), 1.8, 2.78, 0));
  roof.add(at(box(0.18, 0.1, 0.16, bone), 1.88, 2.6, 0));
  frame.add(roof);

  // the log: hangs from chains, iron-capped, studded
  const log = new THREE.Group();
  const trunk = at(cyl(0.3, 0.3, 3.2, wood, 10), 0, 0, 0, 0, 0, 90);
  log.add(trunk);
  for (const x of [-1.2, -0.4, 0.4, 1.2]) log.add(at(torus(0.3, 0.045, iron, 10), x, 0, 0, 0, 90, 0));
  // ram head: iron cap with spikes and horns
  log.add(at(cyl(0.4, 0.32, 0.5, iron, 10), 1.65, 0, 0, 0, 0, 90));
  log.add(at(cone(0.28, 0.5, rust, 8), 2.15, 0, 0, 0, 0, -90));
  for (const z of [-1, 1]) {
    log.add(at(cone(0.09, 0.55, bone, 6), 1.6, 0.26, z * 0.3, 0, 0, -70));
    log.add(at(cone(0.09, 0.55, bone, 6), 1.6, -0.26, z * 0.3, 0, 0, -110));
  }
  log.add(at(cone(0.09, 0.5, bone, 6), 1.6, 0.38, 0, 0, 0, -60));
  log.position.set(0, 1.18, 0);
  frame.add(log);
  // chains
  for (const x of [-0.7, 0.8]) for (const z of [-0.18, 0.18]) frame.add(rod([x, 2.2, z * 1.6], [x, 1.42, z], 0.03, mat(0x2c2a30)));

  // wheels
  const wheels: THREE.Group[] = [];
  for (const x of [-1.2, 1.2]) {
    for (const z of [-0.78, 0.78]) {
      const w = spokedWheel(0.46, 8, 0.16);
      const pivot = group(w);
      pivot.position.set(x, 0.47, z);
      body.add(pivot);
      wheels.push(w);
    }
  }

  // two skeletons pushing from behind
  const crew: Built[] = [];
  const crewHolders: THREE.Group[] = [];
  for (const [z, cx] of [[-0.45, -2.25], [0.42, -2.55]] as const) {
    const c = await crewSkeleton(0.92);
    const h = group(c.root);
    h.rotation.y = 90 * RAD;
    h.position.set(cx, 0, z);
    body.add(h);
    crew.push(c);
    crewHolders.push(h);
  }
  return { root, body, roof, log, wheels, crew, crewHolders, frame };
}

/** put the crew into a pushing pose at clip time t (seconds) */
export function pushPose(r: RamBuilt, t: number, lean = 1): void {
  r.crew.forEach((c, i) => {
    pose(c.inst!, 'Walking_D_Skeletons', t + i * 0.37);
    // arms forward onto the rear beam, back leaning into it
    for (const s of ['l', 'r']) {
      bend(c, `upperarm.${s}`, -75 * lean, 0, 0);
      bend(c, `lowerarm.${s}`, -10 * lean, 0, 0);
    }
    bend(c, 'spine', 12 * lean, 0, 0);
  });
}

export function deathCollapse(r: RamBuilt, u: number): void {
  const e = u * u;
  r.roof.position.set(-0.2 * e, -1.1 * e, 0.5 * e);
  r.roof.rotation.set(-30 * RAD * e, 0, 22 * RAD * e);
  r.log.position.set(0.4 * e, 1.18 - 0.62 * e, 0.0);
  r.log.rotation.z = -10 * RAD * e;
  r.frame.rotation.z = 6 * RAD * e;
  r.frame.position.y = -0.1 * e;
  r.wheels.forEach((w, i) => {
    w.parent!.rotation.z = (i % 2 ? 1 : -1) * 14 * RAD * e;
  });
}

// ---------------------------------------------------------------------------
// Catapult: wheeled frame, throwing arm (long end +X), one skeleton crew member
// ---------------------------------------------------------------------------
export interface CatBuilt {
  root: THREE.Group;
  body: THREE.Group;
  arm: THREE.Group;
  rock: THREE.Object3D;
  wheels: THREE.Group[];
  crew: Built;
  crewHolder: THREE.Group;
}

export function boulder(r = 0.3): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(0x7b7f8a, { rough: 0.9 }));
  return m;
}

export async function buildCatapult(): Promise<CatBuilt> {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wood = mat(DEAD.woodC);
  const woodD = mat(DEAD.woodDarkC);
  const iron = mat(DEAD.ironC, { rough: 0.55, metal: 0.35 });
  const bone = mat(DEAD.boneC, { rough: 0.7 });
  const rag = mat(DEAD.redC);
  const rope = mat(0xb59a6a);
  const PY = 1.75; // pivot height

  // base frame
  for (const z of [-0.5, 0.5]) body.add(at(box(3.2, 0.2, 0.2, woodD), 0, 0.62, z));
  for (const x of [-1.3, -0.4, 0.5, 1.3]) body.add(at(box(0.2, 0.18, 1.2, wood), x, 0.62, 0));
  body.add(at(box(0.5, 0.18, 0.6, wood), 1.75, 0.62, 0));
  // A-frame uprights
  for (const z of [-0.5, 0.5]) {
    body.add(rod([-0.8, 0.7, z], [0.0, PY, z], 0.09, wood));
    body.add(rod([0.8, 0.7, z], [0.0, PY, z], 0.09, wood));
    body.add(at(box(1.1, 0.1, 0.1, woodD), 0, 1.05, z));
    body.add(at(cyl(0.16, 0.16, 0.12, iron, 8), 0, PY, z * 1.12, 90, 0, 0));
  }
  body.add(at(cyl(0.07, 0.07, 1.3, iron, 6), 0, PY, 0, 90, 0, 0));

  // throwing arm
  const arm = new THREE.Group();
  arm.add(at(box(3.0, 0.2, 0.26, wood), 0.6, 0, 0));
  arm.add(at(box(3.0, 0.06, 0.3, woodD), 0.6, 0.12, 0));
  // counterweight at the short end
  const cw = new THREE.Group();
  cw.add(at(box(0.7, 0.7, 0.62, iron), 0, 0, 0));
  cw.add(at(box(0.74, 0.12, 0.66, woodD), 0, 0.3, 0));
  cw.add(at(sphere(0.2, bone, 8), 0.0, 0.1, 0.34));
  cw.position.set(-0.95, -0.38, 0);
  arm.add(cw);
  // bucket at the long end
  const bucket = new THREE.Group();
  bucket.add(at(cyl(0.34, 0.24, 0.3, woodD, 10), 0, 0, 0));
  bucket.add(at(torus(0.34, 0.04, iron, 10), 0, 0.14, 0, 90, 0, 0));
  bucket.position.set(2.05, 0.1, 0);
  arm.add(bucket);
  const rock = boulder(0.3);
  rock.position.set(0, 0.3, 0);
  bucket.add(rock);
  arm.position.set(0, PY, 0);
  arm.rotation.z = 200 * RAD;
  body.add(arm);
  // winch at the rear, a rope, a red rag on the frame and a skull on the nose
  body.add(at(cyl(0.16, 0.16, 0.8, woodD, 8), -1.2, 0.95, 0, 90, 0, 0));
  body.add(rod([-1.2, 0.95, 0], [-1.6, 0.9, 0.0], 0.025, rope));
  body.add(at(sphere(0.2, bone, 8), 1.85, 0.95, 0));
  body.add(at(extrude([[0, 0], [0.4, 0], [0.32, -0.55], [0.2, -0.4], [0.1, -0.6], [0, -0.3]], 0.03, rag), 0.0, 2.1, 0.55, 0, 90, 0));

  // wheels
  const wheels: THREE.Group[] = [];
  for (const x of [-0.95, 0.95]) {
    for (const z of [-0.75, 0.75]) {
      const w = spokedWheel(0.5, 8, 0.16);
      const pivot = group(w);
      pivot.position.set(x, 0.5, z);
      body.add(pivot);
      wheels.push(w);
    }
    body.add(at(cyl(0.06, 0.06, 1.6, iron, 6), x, 0.5, 0, 90, 0, 0));
  }

  const crew = await crewSkeleton(0.95);
  const crewHolder = group(crew.root);
  crewHolder.rotation.y = 90 * RAD;
  crewHolder.position.set(-1.9, 0, 0.35);
  body.add(crewHolder);
  return { root, body, arm, rock, wheels, crew, crewHolder };
}
