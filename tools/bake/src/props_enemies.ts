/**
 * Props and helpers for the regular Deadite army (owner: enemies art agent).
 * Units: 1 = 75 logical px. Hand-held props keep their grip at the origin with the
 * long axis along +Y (KayKit hand-slot convention). Palette: docs/ART_BIBLE.md section 3.
 */
import * as THREE from 'three';
import { byName, instantiate, pose, type Instance } from './assets';
import type { Built, Recolor } from './character';
import { at, box, cone, cyl, extrude, group, lathe, mat, mesh, PAL, sphere, torus } from './props';

const RAD = Math.PI / 180;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Deadite palette
// ---------------------------------------------------------------------------
export const DEAD = {
  /** bone: a cool, slightly green-grey cream so skulls read as bone, not flesh */
  bone: ['#f1e6d0', '#b49c7e'] as [string, string],
  rust: ['#8c7a6b', '#3f342d'] as [string, string],
  rustDark: ['#6b5a4e', '#2c241f'] as [string, string],
  black: ['#4b4752', '#16141a'] as [string, string],
  red: ['#a33434', '#3a1215'] as [string, string],
  purple: ['#6a4382', '#26142f'] as [string, string],
  leather: ['#7a5136', '#352217'] as [string, string],
  eye: 0xd8ff3a,
  // flat colours for our own props
  boneC: 0xeedbc4,
  rustC: 0x6b5a4e,
  rustDarkC: 0x4a3c33,
  ironC: 0x3c3a40,
  redC: 0x8e2a2a,
  purpleC: 0x4a2a5a,
  woodC: 0x6e4a33,
  woodDarkC: 0x4a3122,
};

/** the glowing yellow-green eyes of every skeleton rig */
export function deaditeEyes(rig: string, intensity = 2.2): Array<{ node: string; color: number; intensity: number }> {
  return [{ node: `${rig}_Eyes`, color: DEAD.eye, intensity }];
}

/** standard repaint per skeleton rig (palette cells from scripts/uvcells.mjs) */
export const RECOLOR: Record<string, Recolor> = {
  Minion: { '1,1': DEAD.bone, '5,0': DEAD.red, '6,0': DEAD.leather, '7,0': ['#5a4a40', '#241c18'] },
  Warrior: { '1,1': DEAD.bone, '2,2': DEAD.red, '6,0': DEAD.leather },
  Mage: { '1,1': DEAD.bone, '2,2': DEAD.purple },
  Rogue: { '1,1': DEAD.bone, '2,2': DEAD.red },
};

// ---------------------------------------------------------------------------
// Pose layering: hold one clip's pose on some bones while another clip plays
// (a shield raised while walking, a hunched back while running).
// ---------------------------------------------------------------------------
const samplers = new WeakMap<Built, Instance>();

/** call once in build(): a hidden twin of the rig used to sample overlay clips */
export async function addSampler(b: Built, url: string): Promise<void> {
  const s = await instantiate(url);
  s.clips = b.inst!.clips;
  samplers.set(b, s);
}

export const LEFT_ARM = ['upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l'];
export const RIGHT_ARM = ['upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r', 'handslot.r'];

/** copy the local rotations of `bones` from `clip` at time t onto the character (weight 0..1) */
export function overlay(b: Built, clip: string, t: number, bones: string[], weight = 1): void {
  const s = samplers.get(b);
  if (!s || !b.inst) throw new Error('overlay needs addSampler() in build()');
  pose(s, clip, t);
  for (const n of bones) {
    const src = byName(s.root, n);
    const dst = byName(b.inst.root, n);
    dst.quaternion.slerp(src.quaternion, weight);
  }
}

/** rotate a bone by extra degrees (applied after the clip pose) */
export function bend(b: Built, bone: string, rx: number, ry = 0, rz = 0): void {
  const o = byName(b.inst!.root, bone);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * RAD, ry * RAD, rz * RAD));
  o.quaternion.multiply(q);
}

export function clipLength(b: Built, clip: string): number {
  const c = b.inst!.clips.find((x) => x.name === clip);
  if (!c) throw new Error(`no clip ${clip}`);
  return c.duration;
}

export const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** a cylinder between two points */
export function rod(a: [number, number, number], b: [number, number, number], r: number, m: THREE.Material, r2 = r, seg = 6): THREE.Mesh {
  _a.fromArray(a);
  _b.fromArray(b);
  const len = _a.distanceTo(_b);
  const c = cyl(r2, r, len, m, seg);
  c.position.copy(_a).add(_b).multiplyScalar(0.5);
  c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _b.clone().sub(_a).normalize());
  return c;
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

/** Bone spear: knotted dark shaft, a jagged bone head lashed on with red rags. Grip at the origin, head toward +Y. */
export function boneSpear(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(DEAD.woodC);
  const woodD = mat(DEAD.woodDarkC);
  const bone = mat(DEAD.boneC, { rough: 0.7 });
  const rag = mat(DEAD.redC);
  // shaft from y = -0.75 to y = 1.45, slightly tapered, with knots
  g.add(at(cyl(0.045, 0.055, 2.2, wood, 7), 0, 0.35, 0));
  for (const y of [-0.5, 0.15, 0.75]) g.add(at(cyl(0.065, 0.065, 0.07, woodD, 7), 0, y, 0, 0, 0, 8));
  // butt: a knuckle bone
  g.add(at(sphere(0.08, bone, 7), 0, -0.78, 0));
  // head: flat jagged bone blade (leaf with notches), in the YZ plane so it shows from the side
  const head = extrude(
    [
      [0, 0],
      [0.13, 0.08],
      [0.17, 0.24],
      [0.1, 0.3],
      [0.15, 0.42],
      [0.06, 0.62],
      [0, 0.72],
      [-0.06, 0.62],
      [-0.15, 0.42],
      [-0.1, 0.3],
      [-0.17, 0.24],
      [-0.13, 0.08],
    ],
    0.06,
    bone,
  );
  head.rotation.y = 90 * RAD;
  head.position.y = 1.42;
  g.add(head);
  // lashing
  g.add(at(cyl(0.075, 0.075, 0.16, rag, 7), 0, 1.4, 0));
  // a rag streamer hanging under the head
  const strip = extrude([[0, 0], [0.09, 0], [0.06, -0.34], [0.1, -0.42], [0.0, -0.36]], 0.025, rag);
  strip.rotation.y = 90 * RAD;
  strip.position.set(0, 1.36, -0.03);
  g.add(strip);
  return g;
}

// ---------------------------------------------------------------------------
// Headgear (built for the skeleton skull: head bone space, cranium centre ~ (0, 0.55, 0), radius ~0.45)
// ---------------------------------------------------------------------------

/** Kettle hat: an iron dome with a wide, dented brim. */
export function kettleHat(color = DEAD.rustC): THREE.Group {
  const iron = mat(color, { rough: 0.62, metal: 0.35 });
  const dark = mat(DEAD.rustDarkC, { rough: 0.6, metal: 0.3 });
  const g = new THREE.Group();
  const dome = lathe(
    [
      [0.0, 0.5],
      [0.18, 0.49],
      [0.33, 0.43],
      [0.43, 0.32],
      [0.48, 0.16],
      [0.5, 0.0],
    ],
    iron,
    12,
  );
  g.add(dome);
  // ridge along the crown (front to back)
  const ridge = extrude([[-0.5, 0.0], [-0.42, 0.3], [-0.2, 0.5], [0.2, 0.5], [0.42, 0.3], [0.5, 0.0], [0.4, 0.0], [0.32, 0.27], [0.15, 0.42], [-0.15, 0.42], [-0.32, 0.27], [-0.4, 0.0]], 0.07, dark);
  ridge.rotation.y = 90 * RAD;
  g.add(ridge);
  // brim: a flat cone ring sloping down
  const brim = lathe([[0.46, 0.02], [0.62, -0.04], [0.8, -0.13], [0.8, -0.17], [0.62, -0.09], [0.46, -0.04]], iron, 14);
  g.add(brim);
  g.add(at(torus(0.49, 0.035, dark, 14), 0, 0.0, 0, 90, 0, 0));
  // rivets on the band
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.add(at(sphere(0.03, dark, 5), Math.sin(a) * 0.5, 0.05, Math.cos(a) * 0.5));
  }
  return g;
}

/** Conical nasal helmet (spangenhelm) with a nose guard. */
export function nasalHelm(color = DEAD.rustC): THREE.Group {
  const iron = mat(color, { rough: 0.6, metal: 0.35 });
  const dark = mat(DEAD.rustDarkC, { rough: 0.6, metal: 0.3 });
  const g = new THREE.Group();
  g.add(lathe([[0.0, 0.78], [0.08, 0.7], [0.25, 0.45], [0.42, 0.18], [0.49, 0.02], [0.5, 0.0]], iron, 8));
  g.add(at(torus(0.49, 0.045, dark, 12), 0, 0.02, 0, 90, 0, 0));
  // four bands up to the point
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + TAU / 8;
    g.add(rod([Math.sin(a) * 0.47, 0.04, Math.cos(a) * 0.47], [0, 0.78, 0], 0.028, dark));
  }
  // nasal
  g.add(at(box(0.09, 0.32, 0.05, iron), 0, -0.12, 0.5, -6, 0, 0));
  return g;
}

// ---------------------------------------------------------------------------
// Bat wing. Built in the wing's own frame: span along +X, chord along Z (leading edge +Z),
// root at the origin. A right wing is the same object with scale.x = -1.
// ---------------------------------------------------------------------------
export function batWing(): THREE.Group {
  const g = new THREE.Group();
  const skin = mat(0x4a2434, { rough: 0.9, side: THREE.DoubleSide });
  const bone = mat(DEAD.boneC, { rough: 0.7 });
  // membrane outline (x, z): leading edge at the front, scalloped trailing edge behind
  const pts: Array<[number, number]> = [
    [0.0, 0.1],
    [0.5, 0.2],
    [1.38, 0.02],
    [1.08, -0.18],
    [1.12, -0.56],
    [0.84, -0.4],
    [0.66, -0.78],
    [0.45, -0.46],
    [0.2, -0.62],
    [0.08, -0.36],
    [0.0, -0.3],
  ];
  // extrude() builds in XY; rotate +90 about X maps (x, y) to (x, 0, y)
  const mem = extrude(pts, 0.03, skin);
  mem.rotation.x = 90 * RAD;
  g.add(mem);
  // arm and finger bones, a little above the membrane
  const y = 0.03;
  const W: [number, number, number] = [0.5, y, 0.2];
  g.add(rod([0, y, 0.1], W, 0.05, bone, 0.04));
  g.add(rod(W, [1.38, y, 0.02], 0.035, bone, 0.02));
  g.add(rod(W, [1.12, y, -0.56], 0.03, bone, 0.018));
  g.add(rod(W, [0.66, y, -0.78], 0.03, bone, 0.018));
  g.add(rod(W, [0.2, y, -0.62], 0.028, bone, 0.016));
  g.add(at(sphere(0.06, bone, 6), ...W));
  // thumb claw at the wrist
  g.add(at(cone(0.035, 0.14, bone, 5), 0.5, y + 0.02, 0.29, 90, 0, 0));
  return g;
}

/** a pair of bat wings for a chest bone; returns pivots to flap (rotation.z) */
export function wingPair(span = 1): { left: THREE.Group; right: THREE.Group } {
  const mk = (side: 1 | -1): THREE.Group => {
    const pivot = new THREE.Group();
    const sweep = new THREE.Group();
    const w = batWing();
    w.scale.set(side * span, span, span);
    sweep.add(w);
    // swept back and slightly up so the near wing shows broad in the 3/4 side view
    sweep.rotation.set(0, side * -28 * RAD, 0);
    pivot.add(sweep);
    // hinge on the upper back, between the shoulder blades (model space after alignWings)
    pivot.position.set(side * 0.12, 0.12, -0.2);
    return pivot;
  };
  return { left: mk(1), right: mk(-1) };
}

/**
 * Wings are attached to a bone whose local axes are not the model's (KayKit chest bones are
 * tilted). Re-orient each wing holder so its frame matches the character root (x = side,
 * y = up, z = forward); then the hinge offset and the flap axis mean what they say.
 * Call once right after character() builds, in the rest pose.
 */
export function alignWings(b: Built): void {
  b.root.updateMatrixWorld(true);
  const rootQ = b.root.getWorldQuaternion(new THREE.Quaternion());
  const rootS = b.root.getWorldScale(new THREE.Vector3());
  for (const k of ['wingL', 'wingR']) {
    const h = b.parts[k];
    if (!h || !h.parent) continue;
    const boneQ = h.parent.getWorldQuaternion(new THREE.Quaternion());
    const boneS = h.parent.getWorldScale(new THREE.Vector3());
    h.quaternion.copy(boneQ.invert().multiply(rootQ));
    h.scale.setScalar(Math.abs(rootS.x) / Math.max(1e-6, Math.abs(boneS.x)));
  }
}

/** set the flap angle in degrees (positive = wings up); rotates each wing about its own hinge */
export function flap(b: Built, deg: number, fold = 0): void {
  const l = b.parts.wingL?.children[0];
  const r = b.parts.wingR?.children[0];
  if (!l || !r) return;
  l.rotation.z = deg * RAD;
  r.rotation.z = -deg * RAD;
  // fold: sweep further back and close
  (l.children[0] as THREE.Object3D).rotation.y = (-28 - fold * 50) * RAD;
  (r.children[0] as THREE.Object3D).rotation.y = (28 + fold * 50) * RAD;
}

// ---------------------------------------------------------------------------
// Claws and horns
// ---------------------------------------------------------------------------

/** three hooked claws for a hand slot; they point along +Y */
export function claws(color = 0x2a2420, len = 0.26): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.5 });
  for (const [x, rz] of [[-0.07, 10], [0, 0], [0.07, -10]] as const) {
    const c = cone(0.035, len, m, 5);
    c.position.set(x, 0.08 + len / 2, 0.05);
    c.rotation.set(-18 * RAD, 0, rz * RAD);
    g.add(c);
  }
  return g;
}

/** small curved horns for a skull (head bone space) */
export function skullHorns(color = 0x2e2228): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.55 });
  for (const s of [1, -1]) {
    const h = new THREE.Group();
    // three tapering segments curving back
    h.add(at(cyl(0.05, 0.08, 0.18, m, 6), 0, 0.09, 0));
    h.add(at(cyl(0.03, 0.05, 0.16, m, 6), 0, 0.22, -0.04, -30, 0, 0));
    h.add(at(cone(0.03, 0.14, m, 6), 0, 0.32, -0.12, -60, 0, 0));
    h.position.set(s * 0.3, 0.78, 0.12);
    h.rotation.z = -s * 28 * RAD;
    g.add(h);
  }
  return g;
}

export { box, cone, cyl, group, lathe, mat, mesh, PAL, sphere, torus, at, extrude };
