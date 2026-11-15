/** Object builders for spell and item icons. Each is roughly 1.2 units across, centred on (0, 0.6, 0). */
import * as THREE from 'three';
import { at, box, cone, cyl, extrude, glow, group, lathe, mat, mesh, PAL, sphere, torus, boomstick, chainsaw } from './props';
import { ADVP, DUN, HAL, buildCart, buildNecroBook, centered, hotMesh, prop } from './props_items';

const RAD = Math.PI / 180;
const Y = 0.6;

function lift<T extends THREE.Object3D>(o: T, y = Y): THREE.Group {
  const g = group(o);
  g.position.y = y;
  return g;
}
/** spiky burst of emissive cones (muzzle flash, impact star) lying in the XY plane facing +Z */
function starburst(n: number, r0: number, r1: number, w: number, c: [number, number, number]): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = i % 2 ? r0 : r1;
    const m = hotMesh(new THREE.ConeGeometry(w, rr, 5), c[0], c[1], c[2]);
    m.position.set(Math.cos(a) * rr * 0.5, Math.sin(a) * rr * 0.5, 0);
    m.rotation.z = a - Math.PI / 2;
    g.add(m);
  }
  return g;
}

export function iconBoomstick(): THREE.Group {
  const gun = boomstick();
  gun.scale.setScalar(1.15);
  gun.rotation.set(0, 90 * RAD, 0);
  const holder = group(gun);
  holder.rotation.z = 22 * RAD;
  holder.position.set(-0.3, -0.1, 0);
  const flash = starburst(9, 0.28, 0.55, 0.12, [3.2, 2.2, 0.6]);
  flash.position.set(0.82, 0.38, 0.1);
  const flash2 = starburst(7, 0.15, 0.3, 0.1, [3.4, 3.2, 2.2]);
  flash2.position.set(0.82, 0.38, 0.14);
  const gl = glow(0xffa030, 0.75, 1);
  gl.position.set(0.82, 0.38, 0.05);
  return lift(group(holder, flash, flash2, gl));
}

export async function iconArrows(): Promise<THREE.Group> {
  const g = new THREE.Group();
  const spec: Array<[number, number, number]> = [[-0.35, 0.1, -24], [-0.12, 0.3, -12], [0.12, 0.08, 0], [0.34, 0.28, 10], [0.55, 0.05, 22]];
  for (const [x, y, rot] of spec) {
    const a = await prop(`${ADVP}/arrow.gltf`);
    a.scale.set(2.3, 2.6, 2.3);
    const c = centered(a);
    c.rotation.z = (180 + rot) * RAD; // head pointing down
    c.position.set(x, y, 0.05 * x);
    g.add(c);
  }
  return lift(g, Y + 0.05);
}

export async function iconOpenBook(glowCol = 0x9fe8ff): Promise<THREE.Group> {
  const b = await prop(`${ADVP}/spellbook_open.gltf`, { '1,2': ['#2a5ab8', '#14306a'], '5,1': ['#e8c040', '#9a7a22'] });
  const c = centered(b);
  c.scale.setScalar(2.1);
  c.rotation.x = -28 * RAD;
  const g = group(c);
  const col = new THREE.Color(glowCol);
  const beam = hotMesh(new THREE.ConeGeometry(0.5, 0.9, 10, 1, true), col.r * 2, col.g * 2, col.b * 2, { opacity: 0.5 });
  beam.position.set(0, 0.55, 0);
  g.add(beam);
  for (let i = 0; i < 7; i++) {
    const m = hotMesh(new THREE.BoxGeometry(0.07 + (i % 3) * 0.02, 0.09, 0.02), 2.4, 2.2, 1.2);
    m.position.set(-0.45 + i * 0.15, 0.55 + 0.35 * Math.sin(i * 1.7) + 0.1 * i * (i % 2), 0.1);
    m.rotation.z = (i - 3) * 0.3;
    g.add(m);
  }
  const gl = glow(glowCol, 0.9, 1);
  gl.position.set(0, 0.3, -0.1);
  g.add(gl);
  return lift(g, 0.45);
}

export function iconBoulder(): THREE.Group {
  const g = new THREE.Group();
  const rock = mesh(new THREE.IcosahedronGeometry(0.5, 0), mat(0x8a8478));
  rock.scale.set(1, 0.9, 0.95);
  rock.rotation.set(0.4, 0.5, 0.1);
  g.add(rock);
  for (const [x, y, z, r, c] of [[-0.18, 0.18, 0.4, 0.12, 0x6a655c], [0.25, -0.15, 0.4, 0.1, 0xa59e90], [0.1, 0.3, 0.38, 0.09, 0x6a655c]] as const) {
    g.add(at(mesh(new THREE.IcosahedronGeometry(r, 0), mat(c)), x, y, z));
  }
  // fiery trail up-left
  for (let i = 0; i < 4; i++) {
    const t = i + 1;
    const f = hotMesh(new THREE.ConeGeometry(0.2 - i * 0.03, 0.55 + i * 0.1, 6), 3 - i * 0.3, 1.5 - i * 0.2, 0.2);
    f.position.set(-0.6 - t * 0.14, 0.45 + t * 0.14, -0.1 - i * 0.02);
    f.rotation.z = 50 * RAD;
    f.scale.set(1, 1, 1);
    g.add(f);
  }
  const gl = glow(0xff7a20, 0.9, 0.9);
  gl.position.set(-0.5, 0.35, -0.2);
  g.add(gl);
  for (const [x, y] of [[0.55, -0.45], [0.35, -0.55], [0.7, -0.2]] as const) g.add(at(mesh(new THREE.IcosahedronGeometry(0.07, 0), mat(0x7a7468)), x, y, 0.1));
  return lift(g);
}

export async function iconWrongBook(): Promise<THREE.Group> {
  const { book } = await buildNecroBook();
  book.scale.setScalar(1.15);
  book.rotation.x = -18 * RAD;
  book.position.y = 0.2;
  const g = group(book);
  // vortex: stacked tilting rings, purple outside, green inside
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const r = 0.75 - t * 0.5;
    const ring = hotMesh(new THREE.TorusGeometry(r, 0.045 + (1 - t) * 0.02, 5, 22), 1.4 - t * 1.1, 0.4 + t * 2.0, 2.2 - t * 1.5, { opacity: 0.95 });
    ring.rotation.x = -Math.PI / 2 + 0.3;
    ring.rotation.z = i * 0.9;
    ring.position.set(0, -0.35 + t * 0.2, 0);
    ring.scale.set(1, 1, 1);
    g.add(ring);
  }
  const gl = glow(0x6cff4a, 0.9, 0.7);
  gl.position.set(0, 0.2, -0.2);
  g.add(gl);
  const gl2 = glow(0x9a40ff, 1.0, 0.6);
  gl2.position.set(0, -0.2, -0.1);
  g.add(gl2);
  return lift(g, 0.7);
}

export function iconChainsaw(): THREE.Group {
  const s = chainsaw();
  s.scale.setScalar(1.05);
  s.rotation.set(0, 90 * RAD, 0);
  const h = group(s);
  h.rotation.z = 28 * RAD;
  h.position.set(-0.5, -0.2, 0);
  const g = group(h);
  for (let i = 0; i < 6; i++) {
    const m = hotMesh(new THREE.ConeGeometry(0.035, 0.2, 4), 3, 2.2, 0.8);
    m.position.set(0.55 + Math.random() * 0 + (i % 3) * 0.1, 0.55 + (i % 2) * 0.12 - 0.05 * i, 0.2);
    m.rotation.z = -40 * RAD - i * 0.35;
    g.add(m);
  }
  return lift(g);
}

export function iconCart(): THREE.Group {
  const c = buildCart();
  c.root.scale.setScalar(0.5);
  c.root.position.x = -0.45;
  c.root.rotation.y = -25 * RAD;
  return lift(group(c.root), 0.05);
}

export function iconSaltCircle(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cyl(0.78, 0.82, 0.06, 0x3a3f4b, 20), 0, 0, 0));
  // ring of salt: lots of white grains
  const grainMat = mat(0xf4f6fa, { rough: 0.9 });
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    const r = 0.62 + ((i * 7) % 5) * 0.012;
    g.add(at(mesh(new THREE.IcosahedronGeometry(0.055 + (i % 3) * 0.01, 0), grainMat), Math.cos(a) * r, 0.07, Math.sin(a) * r));
  }
  // pentagram inside
  for (let i = 0; i < 5; i++) {
    const a1 = (i * 144 - 90) * RAD;
    const a2 = ((i + 1) * 144 - 90) * RAD;
    const p1 = new THREE.Vector3(Math.cos(a1) * 0.6, 0.07, Math.sin(a1) * 0.6);
    const p2 = new THREE.Vector3(Math.cos(a2) * 0.6, 0.07, Math.sin(a2) * 0.6);
    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    const len = p1.distanceTo(p2);
    const line = box(len, 0.03, 0.05, grainMat);
    line.position.copy(mid);
    line.rotation.y = -Math.atan2(p2.z - p1.z, p2.x - p1.x);
    g.add(line);
  }
  // 5 candles on the circle
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * RAD;
    const x = Math.cos(a) * 0.62;
    const z = Math.sin(a) * 0.62;
    g.add(at(cyl(0.07, 0.08, 0.3, 0xf4ecd8, 8), x, 0.2, z));
    g.add(at(cone(0.055, 0.17, PAL.fire, 6, { emissive: 0xff8a1e, emissiveIntensity: 2 }), x, 0.45, z));
    const gl = glow(0xffa040, 0.3, 0.8);
    gl.position.set(x, 0.45, z);
    g.add(gl);
  }
  g.rotation.x = 0;
  return lift(g, 0.35);
}

export function iconBell(): THREE.Group {
  const g = new THREE.Group();
  const gold = mat(0xe8b43c, { rough: 0.4, metal: 0.15, emissive: 0x6a4210, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  const bell = lathe([[0.0, 0.62], [0.12, 0.6], [0.26, 0.5], [0.34, 0.3], [0.4, 0.12], [0.55, -0.12], [0.6, -0.2], [0.54, -0.22], [0.0, -0.2]], gold, 14);
  g.add(bell);
  g.add(at(torus(0.57, 0.04, 0xf6cc58, 14), 0, -0.2, 0, 90, 0, 0));
  g.add(at(sphere(0.11, 0x3c4148, 8), 0, -0.3, 0));
  g.add(at(box(0.12, 0.14, 0.1, 0x6b4328), 0, 0.7, 0));
  g.add(at(torus(0.08, 0.025, 0x3c4148, 8), 0, 0.82, 0));
  // wooden yoke
  g.add(at(box(1.15, 0.09, 0.12, PAL.wood), 0, 0.78, 0));
  // sound rings
  for (const [s, o] of [[1, 0.9], [1.35, 0.6]] as const) {
    const r = hotMesh(new THREE.TorusGeometry(0.75 * s, 0.025, 4, 18, Math.PI * 0.55), 1.5 * o, 2.2 * o, 3 * o, { opacity: 0.9 });
    r.rotation.z = -Math.PI * 0.25;
    r.position.set(0.1, 0.1, 0);
    g.add(r);
    const l = r.clone();
    l.rotation.z = Math.PI * 0.7;
    g.add(l);
  }
  return lift(g, 0.5);
}

export function iconPitch(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x2c3036, { rough: 0.6, metal: 0.2 });
  const pot = lathe([[0, 0], [0.4, 0.02], [0.62, 0.3], [0.66, 0.55], [0.58, 0.6], [0.0, 0.5]], iron, 14);
  g.add(pot);
  g.add(at(torus(0.62, 0.05, 0x4a5058, 16), 0, 0.58, 0, 90, 0, 0));
  g.add(at(box(0.1, 0.12, 0.1, iron), -0.7, 0.45, 0));
  g.add(at(box(0.1, 0.12, 0.1, iron), 0.7, 0.45, 0));
  for (const x of [-0.35, 0, 0.35]) g.add(at(cone(0.1, 0.25, iron, 5), x, -0.02, 0.2 * Math.abs(x) * 2));
  g.add(at(cyl(0.55, 0.55, 0.02, hotMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), 0.2, 0.1, 0.1).material as THREE.Material, 14), 0, 0.58, 0));
  // flames
  const fl: Array<[number, number, number, number]> = [[0, 0.8, 0.0, 0.55], [-0.3, 0.7, 0.1, 0.42], [0.3, 0.72, -0.05, 0.45], [-0.12, 0.7, -0.25, 0.4], [0.15, 0.68, 0.28, 0.38]];
  for (const [x, y, z, h] of fl) {
    g.add(at(hotMesh(new THREE.ConeGeometry(0.19, h * 1.5, 6), 3, 1.3, 0.15), x, 0.58 + h * 0.7, z));
    g.add(at(hotMesh(new THREE.ConeGeometry(0.1, h, 6), 3.5, 2.8, 0.8), x, 0.58 + h * 0.5, z + 0.03));
    void y;
  }
  const gl = glow(0xff7a20, 1.0, 0.8);
  gl.position.set(0, 1.0, -0.2);
  g.add(gl);
  return lift(g, 0.1);
}

export function iconBearTrap(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x6a7078, { rough: 0.5, metal: 0.2 });
  const dark = mat(0x2c3036, { rough: 0.6 });
  g.add(at(box(0.5, 0.08, 1.0, dark), 0, 0, 0));
  g.add(at(box(0.22, 0.1, 0.22, 0xb8402f), 0, 0.08, 0));
  // two open jaws, each a half ring of teeth hinged on the plate's long edges
  for (const s of [-1, 1]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.055, 5, 16, Math.PI), iron);
    arc.castShadow = true;
    arc.rotation.set(Math.PI / 2, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2);
    arc.position.set(0, 0.1, 0);
    // teeth on the inner side
    const jaw = group(arc);
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      const t = cone(0.065, 0.3, 0xdde3e8, 4);
      t.position.set(Math.cos(a) * 0.5, 0.2, 0);
      t.scale.set(1, 1, 1);
      jaw.add(t);
    }
    jaw.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(jaw);
  }
  g.add(at(torus(0.1, 0.03, 0x4a5058, 8), 0, 0.05, 0.6, 90, 0, 0));
  g.add(at(cyl(0.025, 0.025, 0.45, 0x4a5058, 5), 0, 0.05, 0.85, 90, 0, 0));
  return lift(g, 0.35);
}

export function iconLance(): THREE.Group {
  const g = new THREE.Group();
  const holder = new THREE.Group();
  holder.add(at(cyl(0.05, 0.06, 1.6, 0x8a5a38, 8), -0.1, 0, 0, 0, 0, 90));
  holder.add(at(cone(0.12, 0.65, 0xf6f2e0, 4, { emissive: 0xfff0b0, emissiveIntensity: 0.9 }), 0.98, 0, 0, 0, 0, -90));
  holder.add(at(cyl(0.1, 0.1, 0.08, 0xf0c040, 8), 0.62, 0, 0, 0, 0, 90));
  holder.add(at(cyl(0.09, 0.09, 0.14, 0xf0c040, 8), -0.88, 0, 0, 0, 0, 90));
  holder.rotation.z = 30 * RAD;
  holder.position.set(-0.2, -0.2, 0);
  g.add(holder);
  // radiance: rays behind the head
  const tip = new THREE.Vector3(0.78, 0.4, -0.05);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = i % 2 ? 0.45 : 0.75;
    const ray = hotMesh(new THREE.ConeGeometry(0.06, len, 4), 3.2, 2.9, 1.6);
    ray.position.set(tip.x + Math.cos(a) * len * 0.5, tip.y + Math.sin(a) * len * 0.5, -0.1);
    ray.rotation.z = a - Math.PI / 2;
    g.add(ray);
  }
  const gl = glow(0xfff0a0, 0.9, 1);
  gl.position.copy(tip);
  g.add(gl);
  return lift(g);
}

export function iconHorn(): THREE.Group {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.6, -0.35, 0), new THREE.Vector3(-0.25, -0.5, 0), new THREE.Vector3(0.2, -0.3, 0), new THREE.Vector3(0.5, 0.1, 0), new THREE.Vector3(0.65, 0.5, 0)]);
  const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.1, 8, false);
  // flare toward the bell end
  const p = tubeGeo.getAttribute('position');
  const ring = 9;
  for (let i = 0; i < p.count; i++) {
    const seg = Math.floor(i / ring) / 24;
    const f = 1 + Math.pow(seg, 2.5) * 2.4 - (1 - seg) * 0.4;
    const c = curve.getPointAt(Math.min(1, seg));
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * f, c.y + (p.getY(i) - c.y) * f, c.z + (p.getZ(i) - c.z) * f);
  }
  tubeGeo.computeVertexNormals();
  g.add(mesh(tubeGeo, mat(0xe8dcc0, { rough: 0.6, flat: false })));
  for (const t of [0.35, 0.65, 0.92]) {
    const c = curve.getPointAt(t);
    const tg = curve.getTangentAt(t);
    const r = 0.1 * (1 + Math.pow(t, 2.5) * 2.4 - (1 - t) * 0.4) + 0.025;
    const band = torus(r, 0.03, 0xe8b43c, 12);
    band.position.copy(c);
    band.lookAt(c.clone().add(tg));
    g.add(band);
  }
  g.add(at(sphere(0.1, 0xe8b43c, 8), -0.62, -0.35, 0));
  for (const [s, o] of [[0.7, 1], [1.05, 0.7], [1.4, 0.45]] as const) {
    const r = hotMesh(new THREE.TorusGeometry(s * 0.5, 0.03, 4, 14, Math.PI * 0.5), 1.4 * o, 2.4 * o, 3.2 * o, { opacity: 0.9 });
    r.position.set(0.62, 0.62, 0);
    r.rotation.z = -Math.PI * 0.15 - Math.PI * 0.25;
    g.add(r);
  }
  g.add(at(box(0.07, 0.4, 0.04, 0x2e6fd0), 0.0, 0.0, 0.1, 0, 0, 0));
  return lift(g, 0.45);
}

// ------------------------------- items --------------------------------------

export function iconIron(): THREE.Group {
  const g = new THREE.Group();
  const col = [0xa9b4bd, 0x8794a0, 0xb8c2ca];
  const ingot = (c: number): THREE.Mesh => {
    const shape: Array<[number, number]> = [[-0.5, 0], [0.5, 0], [0.38, 0.24], [-0.38, 0.24]];
    return extrude(shape, 0.38, mat(c, { rough: 0.4, metal: 0.15 }));
  };
  g.add(at(ingot(col[0]), -0.2, 0, 0.18));
  g.add(at(ingot(col[1]), 0.28, 0, 0.18, 0, 8, 0));
  g.add(at(ingot(col[2]), 0.05, 0.24, 0.18, 0, -6, 0));
  g.add(at(box(0.3, 0.02, 0.12, 0x6a7580), 0.05, 0.49, 0.37));
  const gl = glow(0xffb070, 0.45, 0.5);
  gl.position.set(0.3, 0.45, 0.4);
  g.add(gl);
  return lift(g, 0.35);
}

export async function iconGold(): Promise<THREE.Group> {
  const c = await prop(`${DUN}/coin_stack_large.gltf.glb`);
  const g = centered(c);
  g.scale.setScalar(0.95);
  return lift(g, 0.55);
}

export function iconMana(): THREE.Group {
  const g = new THREE.Group();
  const glass = lathe([[0, 0], [0.38, 0.02], [0.45, 0.2], [0.34, 0.55], [0.14, 0.68], [0.14, 0.92], [0.0, 0.92]], mat(0x8ad0ff, { rough: 0.2, opacity: 0.5, flat: false }), 14);
  g.add(glass);
  const liquid = lathe([[0, 0.03], [0.35, 0.05], [0.41, 0.2], [0.32, 0.45], [0.0, 0.46]], new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.2, 0.8, 2.4, THREE.LinearSRGBColorSpace) }), 14);
  g.add(liquid);
  g.add(at(cyl(0.12, 0.1, 0.18, 0x9a5b3c, 8), 0, 1.02, 0));
  const orb = hotMesh(new THREE.SphereGeometry(0.12, 8, 6), 1.5, 2.6, 3.2);
  orb.position.set(0.08, 0.28, 0.3);
  g.add(orb);
  const gl = glow(0x4aa8ff, 0.8, 0.7);
  gl.position.set(0, 0.3, -0.15);
  g.add(gl);
  return lift(g, 0.1);
}

export async function iconSkull(): Promise<THREE.Group> {
  const c = await prop(`${HAL}/skull.gltf`);
  const g = centered(c);
  g.scale.setScalar(1.15);
  const grp = group(g);
  for (const x of [-0.17, 0.17]) {
    const e = hotMesh(new THREE.SphereGeometry(0.06, 8, 6), 0.6, 2.8, 0.5);
    e.position.set(x, 0.0, 0.3);
    e.scale.set(1, 1, 0.5);
    grp.add(e);
  }
  return lift(grp, 0.55);
}

export async function iconBook(): Promise<THREE.Group> {
  const { book } = await buildNecroBook();
  book.scale.setScalar(1.5);
  book.rotation.x = -10 * RAD;
  const gl = glow(0x6dff4a, 0.8, 0.6);
  gl.position.set(0, 0, -0.2);
  return lift(group(book, gl), 0.6);
}

function banner(): THREE.Group {
  const g = new THREE.Group();
  const flag = (w: number, h: number): THREE.Mesh => extrude([[0, 0], [w, 0], [w, -h], [w / 2, -h * 0.78], [0, -h]], 0.04, mat(0x3a78e0, { rough: 0.8 }));
  g.userData.flag = flag;
  return g;
}

export function iconBannerAdvance(): THREE.Group {
  const g = new THREE.Group();
  const pole = group(at(cyl(0.04, 0.045, 1.5, 0x6b4328, 6), 0, 0.15, 0), at(cone(0.09, 0.22, 0xf0c040, 5), 0, 0.98, 0), at(sphere(0.07, 0xf0c040, 6), 0, 0.88, 0));
  // streaming flag: wavy strip of three segments pointing right
  const col = mat(0x3a78e0, { rough: 0.8 });
  const trim = mat(0xf0c040);
  for (let i = 0; i < 4; i++) {
    const seg = box(0.28, 0.5 - i * 0.04, 0.04, i % 2 ? col : mat(0x2f64c4));
    seg.position.set(0.18 + i * 0.27, 0.6 + 0.05 * Math.sin(i * 1.6) - i * 0.05, 0);
    seg.rotation.z = 0.12 * Math.sin(i * 1.6 + 1);
    pole.add(seg);
  }
  pole.add(at(box(1.1, 0.045, 0.05, trim), 0.55, 0.88, 0.0));
  pole.add(at(cone(0.2, 0.34, 0x2f64c4, 3), 1.4, 0.55, 0, 0, 0, -90));
  pole.rotation.z = -16 * RAD;
  pole.position.set(-0.45, -0.5, 0);
  g.add(pole);
  // motion streaks
  for (const y of [0.1, 0.35]) g.add(at(hotMesh(new THREE.BoxGeometry(0.4, 0.035, 0.03), 2, 2.4, 3, { opacity: 0.9 }), -0.55, y - 0.2, 0.1));
  return lift(g, 0.65);
}

export function iconBannerHold(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0x6d7684);
  g.add(at(cyl(0.55, 0.65, 0.18, stone, 8), 0, 0, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(at(mesh(new THREE.IcosahedronGeometry(0.15, 0), mat(0x8a93a0)), Math.cos(a) * 0.45, 0.12, Math.sin(a) * 0.45));
  }
  g.add(at(cyl(0.045, 0.05, 1.65, 0x6b4328, 6), 0, 0.95, 0));
  g.add(at(cone(0.09, 0.24, 0xf0c040, 5), 0, 1.9, 0));
  g.add(at(box(0.9, 0.07, 0.07, 0xf0c040), 0, 1.7, 0));
  const flag = extrude([[-0.4, 0], [0.4, 0], [0.4, -0.95], [0, -0.72], [-0.4, -0.95]], 0.05, mat(0x3a78e0, { rough: 0.8 }));
  flag.position.set(0, 1.68, 0.0);
  g.add(flag);
  g.add(at(box(0.5, 0.35, 0.06, 0xf0c040), 0, 1.15, 0.03));
  g.add(at(box(0.3, 0.2, 0.07, 0x3a78e0), 0, 1.15, 0.04));
  g.scale.setScalar(0.62);
  return lift(g, 0.05);
}

export function iconAnvil(): THREE.Group {
  const g = new THREE.Group();
  const steel = mat(0x59616b, { rough: 0.5, metal: 0.15 });
  const light = mat(0x78828e, { rough: 0.45, metal: 0.15 });
  g.add(at(box(0.9, 0.18, 0.62, mat(0x6b4328)), 0, 0.09, 0));
  g.add(at(box(0.5, 0.2, 0.4, steel), 0, 0.28, 0));
  g.add(at(box(0.3, 0.2, 0.3, steel), 0, 0.46, 0));
  g.add(at(box(1.0, 0.2, 0.46, light), 0, 0.65, 0));
  g.add(at(cone(0.23, 0.55, light, 4), 0.72, 0.65, 0, 0, 45, -90));
  g.add(at(box(0.24, 0.07, 0.4, 0x3c4148), -0.3, 0.77, 0));
  g.add(hotAt(new THREE.BoxGeometry(0.4, 0.05, 0.3), 3, 1.3, 0.3, 0.0, 0.78, 0.0));
  const gl = glow(0xff8a1e, 0.6, 0.7);
  gl.position.set(0, 0.85, 0.1);
  g.add(gl);
  for (const [x, y] of [[0.15, 1.05], [-0.2, 1.15], [0.35, 1.2]] as const) g.add(at(hotMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), 3, 2.4, 0.8), x, y, 0.1));
  return lift(g, 0.0);
}
function hotAt(geo: THREE.BufferGeometry, r: number, g: number, b: number, x: number, y: number, z: number): THREE.Mesh {
  const m = hotMesh(geo, r, g, b);
  m.position.set(x, y, z);
  return m;
}

// ------------------------------- relics -------------------------------------

export async function relicLantern(): Promise<THREE.Group> {
  const l = await prop(`${HAL}/lantern_standing.gltf`);
  const c = centered(l);
  c.scale.setScalar(1.25);
  const g = group(c);
  g.add(at(hotMesh(new THREE.OctahedronGeometry(0.17, 0), 0.8, 3, 0.7), 0, -0.05, 0));
  const gl = glow(0x6dff4a, 0.85, 0.85);
  gl.position.set(0, -0.05, -0.1);
  g.add(gl);
  // bone hook handle
  g.add(at(torus(0.22, 0.04, PAL.bone, 10), 0, 0.62, 0));
  return lift(g, 0.55);
}

export function relicCauldronShard(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x2c3036, { rough: 0.6, metal: 0.2 });
  const geo = new THREE.LatheGeometry([[0.2, 0], [0.55, 0.12], [0.8, 0.5], [0.85, 0.9], [0.78, 0.95]].map(([x, y]) => new THREE.Vector2(x, y)), 14, 0.3, 1.3);
  const shard = mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.6, flatShading: true, side: THREE.DoubleSide }));
  shard.position.set(-0.1, -0.5, 0.1);
  shard.rotation.set(0.2, -0.4, 0);
  g.add(shard);
  g.add(at(torus(0.8, 0.045, 0x4a5058, 14), -0.1, 0.4, 0.1, 80, -22, 0));
  void iron;
  // toxic slime dripping
  const slime = mat(0x7dff5a, { rough: 0.3, emissive: 0x3acf2a, emissiveIntensity: 0.9 });
  g.add(at(sphere(0.24, slime, 8), 0.12, -0.28, 0.35));
  for (const [x, y, h] of [[-0.28, -0.35, 0.3], [0.38, -0.3, 0.42]] as const) {
    g.add(at(cyl(0.06, 0.07, h, slime, 6), x, y, 0.3));
    g.add(at(sphere(0.1, slime, 6), x, y - h / 2 - 0.05, 0.3));
  }
  g.add(at(hotMesh(new THREE.SphereGeometry(0.05, 6, 5), 1.2, 3, 0.8), 0.5, -0.1, 0.4));
  const gl = glow(0x6dff4a, 0.8, 0.6);
  gl.position.set(0.1, -0.2, -0.1);
  g.add(gl);
  return lift(g, 0.7);
}

export function relicSpur(): THREE.Group {
  const g = new THREE.Group();
  const bone = mat(0xe8dcc0, { rough: 0.55 });
  const brass = mat(0xc89a3a, { rough: 0.45, metal: 0.15 });
  // heel band (U shape)
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.075, 6, 18, Math.PI * 1.1), bone), 0, 0.05, 0, 0, 0, 180 + 100 - 100));
  g.children[0].castShadow = true;
  g.children[0].rotation.set(0, 0, -Math.PI * 0.05 + Math.PI);
  g.add(at(box(0.18, 0.2, 0.2, brass), 0.52, -0.05, 0));
  g.add(at(box(0.2, 0.2, 0.08, brass), -0.52, -0.05, 0));
  // shank + rowel star
  g.add(at(cyl(0.06, 0.07, 0.65, brass, 6), 0.82, -0.05, 0, 0, 0, 90));
  const rowel = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sp = cone(0.07, 0.34, 0xdde3e8, 4);
    sp.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0);
    sp.rotation.z = a - Math.PI / 2;
    rowel.add(sp);
  }
  rowel.add(at(cyl(0.16, 0.16, 0.1, brass, 10), 0, 0, 0, 90, 0, 0));
  rowel.position.set(1.18, -0.05, 0);
  g.add(rowel);
  // hollow: a dark eye socket cut-out suggestion on the band
  g.add(at(sphere(0.08, 0x120c10, 6), -0.15, 0.5, 0.08));
  g.scale.setScalar(0.8);
  g.position.x = -0.35;
  return lift(g, 0.6);
}

export function relicCenser(): THREE.Group {
  const g = new THREE.Group();
  const gold = mat(0xe8b43c, { rough: 0.4, metal: 0.15, emissive: 0x6a4210, emissiveIntensity: 0.3 });
  const bowl = lathe([[0, -0.3], [0.2, -0.28], [0.38, -0.05], [0.4, 0.12], [0, 0.12]], gold, 12);
  g.add(at(bowl, 0, 0, 0));
  const dome = lathe([[0.4, 0.12], [0.36, 0.3], [0.24, 0.48], [0.08, 0.58], [0.0, 0.6]], gold, 12);
  g.add(dome);
  g.add(at(torus(0.4, 0.035, 0xf6cc58, 14), 0, 0.12, 0, 90, 0, 0));
  g.add(at(sphere(0.07, 0xf6cc58, 6), 0, 0.64, 0));
  // chains
  for (const a of [0, 120, 240]) {
    const r = a * RAD;
    const ch = cyl(0.014, 0.014, 1.0, 0x8a93a0, 4);
    ch.position.set(Math.cos(r) * 0.16, 1.05, Math.sin(r) * 0.16);
    ch.rotation.set(Math.sin(r) * 0.2, 0, -Math.cos(r) * 0.2);
    g.add(ch);
  }
  g.add(at(torus(0.1, 0.03, 0xf6cc58, 8), 0, 1.58, 0));
  // pale blue holy smoke rising
  for (const [x, y, s] of [[0.05, 0.9, 0.2], [-0.1, 1.1, 0.26], [0.12, 1.3, 0.3]] as const) g.add(at(hotMesh(new THREE.IcosahedronGeometry(s, 0), 1.6, 2.2, 2.8, { opacity: 0.75 }), x, y - 0.25, 0.2));
  const gl = glow(0xbfe6ff, 0.8, 0.7);
  gl.position.set(0, 0.2, -0.2);
  g.add(gl);
  g.scale.setScalar(0.78);
  return lift(g, 0.15);
}

export function relicDoppelBoomstick(): THREE.Group {
  const g = new THREE.Group();
  const a = boomstick();
  a.scale.setScalar(1.05);
  a.rotation.set(0, 90 * RAD, 0);
  const ha = group(a);
  ha.rotation.z = 18 * RAD;
  ha.position.set(-0.55, -0.35, 0);
  g.add(ha);
  // ghostly twin: translucent teal copy offset behind
  const b = boomstick();
  b.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.material = mat(0x7affe0, { emissive: 0x30e0c0, emissiveIntensity: 1.1, opacity: 0.6, flat: false });
      m.castShadow = false;
    }
  });
  b.scale.setScalar(1.05);
  b.rotation.set(0, 90 * RAD, 0);
  const hb = group(b);
  hb.rotation.z = 18 * RAD;
  hb.position.set(-0.35, -0.05, -0.2);
  g.add(hb);
  const gl = glow(0x40e8c8, 0.8, 0.5);
  gl.position.set(0.1, 0.1, -0.3);
  g.add(gl);
  return lift(g, 0.6);
}
void banner;
