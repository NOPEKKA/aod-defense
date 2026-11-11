/**
 * Procedural props in the KayKit look: low-poly, flat-shaded, matte colours.
 * Units: 1 = ~75 logical px. A hand-held prop's grip sits at the origin.
 * Hand slot axes on KayKit rigs: see docs/ART_BIBLE.md ("hand slots").
 */
import * as THREE from 'three';

export interface MatOpts {
  rough?: number;
  metal?: number;
  emissive?: number;
  emissiveIntensity?: number;
  flat?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

export function mat(color: number | string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: o.rough ?? 0.85,
    metalness: o.metal ?? 0,
    flatShading: o.flat ?? true,
    side: o.side ?? THREE.FrontSide,
  });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  return m;
}

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

type C = number | string | THREE.Material;
const asMat = (c: C, o?: MatOpts): THREE.Material => (c instanceof THREE.Material ? c : mat(c, o));

export function box(w: number, h: number, d: number, color: C, o?: MatOpts): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), asMat(color, o));
}
/** cylinder along +Y, centred */
export function cyl(rTop: number, rBottom: number, h: number, color: C, seg = 10, o?: MatOpts): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), asMat(color, o));
}
export function cone(r: number, h: number, color: C, seg = 10, o?: MatOpts): THREE.Mesh {
  return mesh(new THREE.ConeGeometry(r, h, seg), asMat(color, o));
}
export function sphere(r: number, color: C, seg = 10, o?: MatOpts): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), asMat(color, o));
}
export function torus(r: number, tube: number, color: C, seg = 12, o?: MatOpts): THREE.Mesh {
  return mesh(new THREE.TorusGeometry(r, tube, 6, seg), asMat(color, o));
}
/** solid of revolution from [radius, y] points */
export function lathe(points: Array<[number, number]>, color: C, seg = 12, o?: MatOpts): THREE.Mesh {
  return mesh(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg), asMat(color, o));
}
/** flat shape in the XY plane extruded along Z, centred on Z */
export function extrude(points: Array<[number, number]>, depth: number, color: C, o?: MatOpts): THREE.Mesh {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return mesh(geo, asMat(color, o));
}

const RAD = Math.PI / 180;
/** place: position + rotation in degrees (XYZ order) */
export function at<T extends THREE.Object3D>(obj: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): T {
  obj.position.set(x, y, z);
  obj.rotation.set(rx * RAD, ry * RAD, rz * RAD);
  return obj;
}
export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...children);
  return g;
}

/** camera-facing soft glow (normal blending; survives the accumulation pipeline) */
export function glow(color: number | string, radius: number, strength = 1): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const col = new THREE.Color(color);
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${rgb},${0.95 * strength})`);
  grad.addColorStop(0.35, `rgba(${rgb},${0.45 * strength})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(radius * 2);
  return s;
}

// palette shared by our own props (keeps them in the KayKit colour world)
export const PAL = {
  steel: 0x9aa6ae,
  steelDark: 0x555d66,
  iron: 0x3c4148,
  wood: 0x8a5433,
  woodDark: 0x5d3a26,
  leather: 0x9a5b3c,
  gold: 0xf0c040,
  bone: 0xeedbc4,
  red: 0xd7263d,
  blue: 0x2e6fd0,
  blueDark: 0x1b3f8c,
  straw: 0xe0b85a,
  fire: 0xff8a1e,
  ember: 0xffd24a,
  cloth: 0xd9d2c3,
  green: 0x3f9a4b,
  purple: 0x7b3fa8,
};

/** Double-barrelled shotgun. Grip at origin, barrels point along +Z. Length ~1.25. */
export function boomstick(): THREE.Group {
  const g = new THREE.Group();
  const barrelMat = mat(PAL.iron, { rough: 0.45, metal: 0.6 });
  for (const x of [-0.045, 0.045]) {
    g.add(at(cyl(0.045, 0.045, 0.78, barrelMat, 8), x, 0.06, 0.55, 90, 0, 0));
  }
  g.add(at(box(0.16, 0.13, 0.2, PAL.steelDark, { rough: 0.5, metal: 0.5 }), 0, 0.05, 0.1));
  g.add(at(box(0.13, 0.07, 0.3, PAL.wood), 0, -0.02, 0.42));
  g.add(at(box(0.1, 0.14, 0.42, PAL.woodDark), 0, -0.03, -0.2, -14, 0, 0));
  g.add(at(box(0.11, 0.17, 0.1, PAL.wood), 0, -0.07, -0.42, -14, 0, 0));
  return g;
}

/** Chainsaw that replaces a hand. Wrist at origin, bar points along +Z. Length ~1.15. */
export function chainsaw(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(box(0.3, 0.3, 0.4, PAL.red, { rough: 0.6 }), 0, 0, 0.12));
  g.add(at(box(0.2, 0.1, 0.2, PAL.iron), 0, 0.2, 0.1));
  g.add(at(cyl(0.05, 0.05, 0.32, PAL.steelDark, 8), 0, 0.2, 0.28, 0, 0, 90));
  const bar = at(box(0.045, 0.2, 0.74, PAL.steel, { rough: 0.35, metal: 0.7 }), 0, 0, 0.66);
  g.add(bar);
  g.add(at(cyl(0.1, 0.1, 0.045, PAL.steel, 10, { rough: 0.35, metal: 0.7 }), 0, 0, 1.03, 0, 0, 90));
  // teeth
  const tooth = mat(PAL.iron, { rough: 0.4, metal: 0.6 });
  for (let i = 0; i < 9; i++) {
    g.add(at(box(0.05, 0.035, 0.045, tooth), 0, 0.115, 0.34 + i * 0.08));
    g.add(at(box(0.05, 0.035, 0.045, tooth), 0, -0.115, 0.34 + i * 0.08));
  }
  return g;
}
