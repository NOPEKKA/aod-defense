/**
 * Props for pickups, projectiles, the Necronomicon, the pit lid, the Deathcoaster cart.
 * Owner: items art agent. Units: 1 = 75 logical px. Everything is built at the origin;
 * ground-standing things have their base at y = 0.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadProp } from './assets';
import { recolorTexture, type Recolor } from './character';
import { at, box, cone, cyl, extrude, glow, group, lathe, mat, mesh, PAL, sphere, torus } from './props';

export const ADVP = '/kaykit/adventurers/props';
export const DUN = '/kaykit/dungeon';
export const HAL = '/kaykit/halloween';

const RAD = Math.PI / 180;

/** emissive HDR colour that tone-maps to a hot, slightly tinted white */
export function hot(r: number, g: number, b: number, o: { opacity?: number } = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace) });
  m.toneMapped = false;
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  return m;
}
export function hotMesh(geo: THREE.BufferGeometry, r: number, g: number, b: number, o: { opacity?: number } = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, hot(r, g, b, o));
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/**
 * Inverted-hull outline: a dark, slightly fattened back-face copy of every opaque mesh.
 * Use it (with SpriteDef.outline = 0) when the sprite also has soft glow sprites, which the
 * 2D outline pass would otherwise ring with a dark circle.
 */
export function hullOutline(root: THREE.Object3D, px = 1.3, color = 0x160f1c): void {
  const t = px / 75; // world units
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o as THREE.Mesh & { userData: { noHull?: boolean } }).userData.noHull) return;
    const mt = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    if (mt.transparent || (mt as THREE.MeshBasicMaterial).isMeshBasicMaterial) return;
    meshes.push(m);
  });
  const mtl = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mtl.toneMapped = false;
  for (const m of meshes) {
    let g = m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g = mergeVertices(g, 1e-4);
    g.computeVertexNormals();
    const ws = new THREE.Vector3();
    m.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), ws);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) + (nor.getX(i) * t) / Math.abs(ws.x || 1), pos.getY(i) + (nor.getY(i) * t) / Math.abs(ws.y || 1), pos.getZ(i) + (nor.getZ(i) * t) / Math.abs(ws.z || 1));
    }
    const h = new THREE.Mesh(g, mtl);
    h.castShadow = false;
    h.receiveShadow = false;
    h.userData.noHull = true;
    m.add(h);
  }
}

/** wrap an object so that the centre of its bounding box is at the origin */
export function centered(obj: THREE.Object3D, base = false): THREE.Group {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  const c = b.getCenter(new THREE.Vector3());
  const g = new THREE.Group();
  g.add(obj);
  obj.position.sub(c);
  if (base) obj.position.y += (b.max.y - b.min.y) / 2; // base on y = 0
  return g;
}

/** shift a model so the middle of its footprint is at the origin and it stands on y = 0 */
export function grounded(obj: THREE.Object3D): THREE.Group {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  const g = new THREE.Group();
  g.add(obj);
  obj.position.x -= (b.min.x + b.max.x) / 2;
  obj.position.z -= (b.min.z + b.max.z) / 2;
  obj.position.y -= b.min.y;
  return g;
}

export async function prop(url: string, recolor?: Recolor): Promise<THREE.Object3D> {
  const o = await loadProp(url);
  if (recolor) recolorTexture(o, recolor);
  return o;
}

// ---------------------------------------------------------------------------
// Projectiles (all point along +X, centred on the origin)
// ---------------------------------------------------------------------------

export async function buildArrow(): Promise<THREE.Group> {
  const a = await prop(`${ADVP}/arrow.gltf`);
  const g = centered(a);
  a.scale.set(1.5, 1.9, 1.5); // a bit fatter and longer than the model so it reads in flight
  a.updateMatrixWorld(true);
  const inner = centered(g);
  const out = group(inner);
  // model head is at -Y; rotate +90 deg about Z: (0,-1) -> (+1,0)
  out.rotation.z = 90 * RAD;
  return group(out);
}

export function buildBolt(): THREE.Group {
  const g = new THREE.Group();
  const shaft = cyl(0.04, 0.04, 0.78, 0x4a3426, 7);
  g.add(at(shaft, 0, 0, 0, 0, 0, -90));
  // steel head: 4-sided pyramid
  g.add(at(cone(0.1, 0.3, PAL.steel, 4, { metal: 0.3, rough: 0.5 }), 0.52, 0, 0, 0, 45, -90));
  g.add(at(box(0.07, 0.2, 0.07, PAL.steelDark), 0.32, 0, 0));
  // red-brown fletching: three thin fins
  for (let i = 0; i < 3; i++) {
    const fin = at(box(0.26, 0.2, 0.025, 0xb8402f), -0.34, 0, 0);
    fin.rotation.x = (i * 60) * RAD;
    g.add(fin);
  }
  g.scale.setScalar(1.25);
  return g;
}

/** a bright shotgun pellet streak: hot core, orange halo, and a few thin pellet trails */
export function buildShot(): THREE.Group {
  const g = new THREE.Group();
  const trail = (len: number, r: number, y: number, z: number, c: [number, number, number], op = 1): void => {
    const geo = new THREE.CylinderGeometry(r, r * 0.15, len, 6, 1, false); // wide end (head) at +Y
    const m = hotMesh(geo, c[0], c[1], c[2], { opacity: op });
    m.position.set(0, y, z);
    m.rotation.z = -90 * RAD;
    g.add(m);
  };
  trail(0.95, 0.075, 0, 0, [3.5, 3.1, 2.0]);
  trail(1.25, 0.12, 0, 0, [2.4, 1.1, 0.25], 0.55);
  for (const [y, z, s] of [[0.14, 0.05, 0.8], [-0.12, 0.1, 0.7], [0.04, -0.14, 0.75], [-0.05, -0.08, 0.6]] as const) {
    const m = hotMesh(new THREE.CylinderGeometry(0.035, 0.005, s, 5), 3, 2.4, 1.2);
    m.position.set(0.12 * (s - 0.7), y, z);
    m.rotation.z = -90 * RAD;
    g.add(m);
  }
  const h = glow(0xffc060, 0.5, 1);
  h.position.set(0.42, 0, 0);
  g.add(h);
  return g;
}

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------

export interface CoinBuilt {
  root: THREE.Group;
  spin: THREE.Group;
}
export async function buildCoin(): Promise<CoinBuilt> {
  const c = await prop(`${DUN}/coin.gltf.glb`);
  c.rotation.x = 90 * RAD; // dish faces the camera
  const inner = centered(c);
  inner.scale.setScalar(1.15);
  const spin = group(inner);
  spin.position.y = 0.34;
  const root = group(spin);
  return { root, spin };
}

export interface OrbBuilt {
  root: THREE.Group;
  core: THREE.Mesh;
  shell: THREE.Mesh;
  halo: THREE.Sprite;
  sparks: THREE.Mesh[];
}
export function buildManaOrb(): OrbBuilt {
  const root = new THREE.Group();
  const core = hotMesh(new THREE.SphereGeometry(0.15, 14, 10), 0.75, 1.5, 2.6);
  const shell = mesh(new THREE.SphereGeometry(0.24, 14, 10), mat(0x3a8cff, { emissive: 0x2a70ff, emissiveIntensity: 0.9, opacity: 0.55, flat: false }));
  shell.castShadow = false;
  const halo = glow(0x4aa8ff, 0.01, 0.001); // kept only so the sprite API stays the same; the soft halo is drawn additively in game
  halo.visible = false;
  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const s = hotMesh(new THREE.SphereGeometry(0.04, 6, 5), 1.6, 2.2, 3);
    sparks.push(s);
    root.add(s);
  }
  const lift = group(halo, shell, core, ...sparks);
  lift.position.y = 0.36;
  root.add(lift);
  return { root, core, shell, halo, sparks };
}

export async function buildFood(): Promise<THREE.Group> {
  const p = await prop(`${DUN}/plate_food_A.gltf.glb`);
  const g = grounded(p);
  g.scale.setScalar(0.85);
  return g;
}

// ---------------------------------------------------------------------------
// Necronomicon on a stone stand
// ---------------------------------------------------------------------------

export interface NecroOpts {
  pedestal?: boolean;
  glowRadius?: number;
}
export interface NecroBuilt {
  root: THREE.Group;
  book: THREE.Group;
  halo: THREE.Sprite;
  eye: THREE.Mesh;
  pages: THREE.Object3D[];
  runes: THREE.Mesh;
}

const COVER: Recolor = { '1,2': ['#7a3424', '#34140e'], '5,1': ['#d6a640', '#8a6420'], '3,1': ['#cbb88a', '#8f7c52'], '0,2': ['#e0cfa0', '#b8a36f'] };

/** the evil book: dark red-brown leather, gold clasps, a screaming face in relief and one green eye */
export async function buildNecroBook(): Promise<{ book: THREE.Group; eye: THREE.Mesh; pages: THREE.Object3D[] }> {
  const m = await prop(`${ADVP}/spellbook_closed.gltf`, COVER);
  m.rotation.y = -90 * RAD; // cover toward +Z (the camera)
  const bookModel = centered(m);
  bookModel.scale.setScalar(1.5);
  bookModel.updateMatrixWorld(true);
  const zf = new THREE.Box3().setFromObject(bookModel).max.z;
  const book = group(bookModel);
  // face relief on the cover. The cover faces +X in the model, so decorate on +X after the wrapper rotates it to +Z.
  const face = new THREE.Group();
  const flesh = mat(0x9a6a4c, { rough: 0.8 });
  const dark = mat(0x140808);
  const plate = sphere(0.15, flesh, 10);
  plate.scale.set(1, 1.2, 0.3);
  face.add(plate);
  // angry brows
  face.add(at(box(0.13, 0.04, 0.03, dark), -0.075, 0.12, 0.05, 0, 0, -22));
  face.add(at(box(0.13, 0.04, 0.03, dark), 0.075, 0.12, 0.05, 0, 0, 22));
  // one big green eye in a dark socket
  const socket = sphere(0.085, dark, 8);
  socket.scale.set(1.15, 0.8, 0.4);
  socket.position.set(0, 0.05, 0.03);
  face.add(socket);
  const eye = hotMesh(new THREE.SphereGeometry(0.055, 10, 8), 0.5, 3.0, 0.6);
  eye.scale.set(1, 1, 0.55);
  eye.position.set(0, 0.05, 0.06);
  face.add(eye);
  // slit nose and a toothy maw
  face.add(at(box(0.025, 0.07, 0.03, dark), 0, -0.04, 0.04));
  face.add(at(box(0.17, 0.075, 0.03, dark), 0, -0.13, 0.04));
  for (let i = -3; i <= 3; i++) face.add(at(box(0.016, 0.03, 0.03, mat(PAL.bone)), i * 0.022, i % 2 ? -0.108 : -0.16, 0.058));
  face.position.set(-0.05, 0.03, zf + 0.0);
  face.scale.setScalar(1.35);
  book.add(face);

  const pages: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const pg = box(0.2, 0.012, 0.28, 0xe6d6a8, { rough: 0.9 });
    pg.visible = false;
    pages.push(pg);
    book.add(pg);
  }
  return { book, eye, pages };
}

export async function buildNecro(o: NecroOpts = {}): Promise<NecroBuilt> {
  const root = new THREE.Group();
  const col = await prop(`${DUN}/column.gltf.glb`);
  const ped = grounded(col);
  ped.scale.set(0.5, 0.5, 0.5);
  root.add(ped);
  const topY = 0.5 * 1.4;
  const { book, eye, pages } = await buildNecroBook();
  const mount = group(book);
  mount.position.set(0, topY + 0.33, 0.02);
  mount.rotation.x = -22 * RAD; // lean back so the cover faces the viewer
  root.add(mount);
  // ground runes ring
  const runes = hotMesh(new THREE.TorusGeometry(0.62, 0.025, 4, 28), 0.5, 2.2, 0.5, { opacity: 0.8 });
  runes.rotation.x = -Math.PI / 2;
  runes.position.y = 0.02;
  root.add(runes);
  const halo = glow(0x6dff4a, o.glowRadius ?? 0.95, 0.95);
  halo.position.set(0, topY + 0.33, -0.12);
  root.add(halo);
  hullOutline(root);
  return { root, book: mount, halo, eye, pages, runes };
}

// ---------------------------------------------------------------------------
// Pit lid
// ---------------------------------------------------------------------------

export interface PitBuilt {
  root: THREE.Group;
  hinge: THREE.Group;
}
export function buildPit(): PitBuilt {
  const root = new THREE.Group();
  const W = 0.93;
  const D = 1.33;
  const wood = mat(PAL.wood);
  const woodD = mat(PAL.woodDark);
  const iron = mat(0x2d3138, { rough: 0.5, metal: 0.4 });
  const stone = mat(0x6d7684);
  // pit mouth: near-black plane (the lid swings down through it; clipGround hides what is below)
  const mouth = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color: 0x07040a }));
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.y = 0.004;
  mouth.userData.noHull = true;
  root.add(mouth);
  const lip = mesh(new THREE.PlaneGeometry(W - 0.16, D - 0.16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  lip.rotation.x = -Math.PI / 2;
  lip.position.y = 0.006;
  lip.userData.noHull = true;
  root.add(lip);
  // wooden curb all around
  const curb = 0.09;
  root.add(at(box(W + curb * 2, 0.1, curb, woodD), 0, 0.05, D / 2 + curb / 2));
  root.add(at(box(W + curb * 2, 0.1, curb, woodD), 0, 0.05, -D / 2 - curb / 2));
  root.add(at(box(curb, 0.1, D, woodD), W / 2 + curb / 2, 0.05, 0));
  root.add(at(box(curb, 0.1, D, woodD), -W / 2 - curb / 2, 0.05, 0));
  // stones at the corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) root.add(at(box(0.16, 0.08, 0.16, stone), sx * (W / 2 + curb + 0.04), 0.04, sz * (D / 2 + curb + 0.04)));
  // lid on a hinge at the back edge
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.11, -D / 2);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const w = W / n;
    hinge.add(at(box(w - 0.012, 0.06, D - 0.02, i % 2 ? wood : mat(0x97603a)), -W / 2 + w * (i + 0.5), 0, D / 2));
  }
  for (const z of [0.3, D - 0.3]) hinge.add(at(box(W + 0.02, 0.025, 0.1, iron), 0, 0.04, z));
  for (const x of [-0.3, 0.3]) hinge.add(at(box(0.09, 0.03, 0.34, iron), x, 0.04, 0.17));
  const ring = torus(0.07, 0.016, iron, 10);
  hinge.add(at(ring, 0, 0.1, D - 0.16, 70, 0, 0));
  hinge.add(at(box(0.1, 0.03, 0.08, iron), 0, 0.05, D - 0.16));
  root.add(hinge);
  return { root, hinge };
}

// ---------------------------------------------------------------------------
// Deathcoaster: a wooden war cart with spinning blade wheels, facing +X
// ---------------------------------------------------------------------------

export interface CartBuilt {
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Group[];
}

/** a wheel in the XY plane facing +Z: wooden disc, iron rim, hooked steel blades round the edge */
function bladeWheel(r: number, blades: number): THREE.Group {
  const g = new THREE.Group();
  const steel = mat(0xcfd8de, { rough: 0.35, metal: 0.15 });
  const iron = mat(0x4a5058, { rough: 0.6 });
  const wood = mat(0x9a6238);
  g.add(at(cyl(r, r, 0.14, wood, 14), 0, 0, 0, 90, 0, 0));
  g.add(at(cyl(r * 1.03, r * 1.03, 0.1, iron, 14), 0, 0, 0.02, 90, 0, 0));
  g.add(at(cyl(r * 0.26, r * 0.26, 0.24, iron, 8), 0, 0, 0.04, 90, 0, 0));
  g.add(at(cyl(r * 0.12, r * 0.12, 0.3, steel, 6), 0, 0, 0.05, 90, 0, 0));
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const spoke = at(box(r * 1.8, 0.07, 0.08, 0x6b4328), 0, 0, 0.08);
    spoke.rotation.z = a;
    g.add(spoke);
    // blade: a hooked wedge standing out of the rim, thick enough to read at game size
    const blade = extrude([[0, -0.07], [0.46, 0.0], [0.58, 0.16], [0.08, 0.1]], 0.1, steel);
    blade.position.set(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97, 0.06);
    blade.rotation.z = a;
    g.add(blade);
  }
  return g;
}

export function buildCart(): CartBuilt {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wood = mat(0xa8683c);
  const woodL = mat(0xc08050);
  const woodD = mat(0x6b4328);
  const iron = mat(0x4a5058, { rough: 0.5 });
  const steel = mat(0xcfd8de, { rough: 0.35, metal: 0.15 });
  const bone = mat(PAL.bone);
  const red = mat(0x9c2a2a);
  // bed and walls
  body.add(at(box(2.4, 0.16, 1.2, woodD), 0, 0.78, 0));
  for (const z of [-0.6, 0.6]) {
    body.add(at(box(2.4, 0.2, 0.09, woodL), 0, 1.0, z));
    body.add(at(box(2.4, 0.2, 0.09, wood), 0, 1.2, z));
    body.add(at(box(2.4, 0.1, 0.12, iron), 0, 1.34, z));
  }
  body.add(at(box(0.09, 0.56, 1.2, wood), -1.2, 1.1, 0));
  for (const x of [-0.8, 0.0, 0.8]) body.add(at(box(0.09, 0.62, 1.26, iron), x, 1.1, 0));
  // sloped prow with an iron ram and spikes
  const prow = extrude([[0, 0], [0.85, 0.12], [0.85, 0.5], [0, 0.78]], 1.2, wood);
  prow.position.set(1.2, 0.74, 0);
  body.add(prow);
  body.add(at(cone(0.2, 0.7, iron, 6), 2.35, 0.95, 0, 0, 0, -90));
  body.add(at(cone(0.1, 0.5, steel, 6), 2.8, 0.95, 0, 0, 0, -90));
  for (const z of [-0.42, 0.42]) {
    body.add(at(cone(0.1, 0.55, steel, 5), 2.1, 1.3, z, 0, 0, -50));
    body.add(at(cone(0.1, 0.55, steel, 5), 2.1, 0.68, z, 0, 0, -130));
  }
  // a skull on the front rail, red war pennant on a pole at the back
  body.add(at(sphere(0.2, bone, 8), 1.1, 1.6, 0));
  body.add(at(box(0.2, 0.12, 0.2, bone), 1.17, 1.46, 0));
  body.add(at(sphere(0.05, 0x120c10, 6), 1.28, 1.64, 0.11));
  body.add(at(sphere(0.05, 0x120c10, 6), 1.28, 1.64, -0.11));
  body.add(at(cyl(0.045, 0.05, 1.5, woodD, 6), -1.05, 1.9, 0));
  body.add(at(extrude([[0, 0], [0.7, -0.14], [0.55, -0.32], [0.7, -0.5], [0, -0.5]], 0.04, red), -1.0, 2.55, 0));
  body.add(at(cone(0.07, 0.2, steel, 5), -1.05, 2.7, 0));
  // burning braziers either side
  for (const z of [-0.45, 0.45]) {
    body.add(at(cyl(0.18, 0.1, 0.14, iron, 8), -0.45, 1.5, z));
    body.add(at(cone(0.13, 0.42, PAL.fire, 6, { emissive: 0xff6a10, emissiveIntensity: 1.8 }), -0.45, 1.78, z));
    body.add(at(cone(0.07, 0.3, 0xffd24a, 6, { emissive: 0xffd24a, emissiveIntensity: 2.2 }), -0.45, 1.74, z));
  }
  // wheels: two axles, a pair each
  const wheels: THREE.Group[] = [];
  for (const x of [-0.8, 0.95]) {
    const r = 0.6;
    for (const z of [-0.76, 0.76]) {
      const w = bladeWheel(r, 8);
      const pivot = group(w);
      pivot.position.set(x, r + 0.02, z);
      body.add(pivot);
      wheels.push(w);
    }
    body.add(at(cyl(0.06, 0.06, 1.6, 0x3c4148, 6), x, r + 0.02, 0, 90, 0, 0));
  }
  hullOutline(root);
  return { root, body, wheels };
}
void lathe;
void torus;
