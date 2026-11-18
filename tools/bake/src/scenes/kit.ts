/**
 * Building blocks for background scenes: noise, procedural textures (dirt, thatch, plaster),
 * stone and wood materials in the KayKit colour world, model placement and small custom pieces.
 * Units: 1 world unit = 75 logical px (PPU). Ground is y = 0, the camera looks down -z.
 */
import * as THREE from 'three';
import { loadProp } from '../assets';
import { at, box, cone, cyl, mat, mesh, PAL } from '../props';

export const DUN = '/kaykit/dungeon/';
export const HAL = '/kaykit/halloween/';
export const MED_B = '/kaykit/medieval/buildings/';
export const MED_P = '/kaykit/medieval/decoration/props/';
export const MED_N = '/kaykit/medieval/decoration/nature/';

// ---------------------------------------------------------------------------
// noise
// ---------------------------------------------------------------------------

export function hash2(x: number, y: number, seed = 0): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** fractal value noise in 0..1 */
export function fbm(x: number, y: number, oct = 4, seed = 0, lac = 2.03, gain = 0.5): number {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x, y, seed + i * 17);
    norm += amp;
    x *= lac;
    y *= lac;
    amp *= gain;
  }
  return s / norm;
}

/** deterministic random stream */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d', { willReadFrequently: true })!;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function rgbOf(hex: number | string): [number, number, number] {
  const c = new THREE.Color(hex);
  // THREE.Color stores linear values; return sRGB 0..255
  const s = c.clone().convertLinearToSRGB();
  return [Math.round(s.r * 255), Math.round(s.g * 255), Math.round(s.b * 255)];
}

/** linear RGB (0..1+) of a hex colour, for post effects */
export function linOf(hex: number | string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------

function texFrom(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** height canvas (grey, R channel) -> tangent-space normal map canvas */
export function normalFromHeight(h: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = h.width;
  const hh = h.height;
  const src = ctx2d(h).getImageData(0, 0, w, hh).data;
  const out = canvas(w, hh);
  const od = new ImageData(w, hh);
  const H = (x: number, y: number): number => src[((((y + hh) % hh) * w + ((x + w) % w)) << 2)] / 255;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * w + x) << 2;
      od.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      od.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      od.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      od.data[i + 3] = 255;
    }
  }
  ctx2d(out).putImageData(od, 0, 0);
  return out;
}

export interface GroundTexOpts {
  /** world rectangle covered by the texture */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** px per world unit along x and z */
  ppuX: number;
  ppuZ: number;
  /** z of the back wall face (debris strip in front of it) */
  wallZ: number;
  /** lane band (packed earth) */
  laneZ0: number;
  laneZ1: number;
  seed?: number;
  /** 0..1: how much of the ground at (x, z) is rough hillside (dead grass, stones) instead of dirt */
  wild?: (x: number, z: number) => number;
}

export interface GroundTex {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  /** sRGB colour canvas (for reuse in other textures) */
  colour: HTMLCanvasElement;
}

/** Packed courtyard dirt: mid value, low saturation, mottled, pebbles and straw near the walls. */
export function groundTexture(o: GroundTexOpts): GroundTex {
  const W = Math.round((o.x1 - o.x0) * o.ppuX);
  const H = Math.round((o.z1 - o.z0) * o.ppuZ);
  const seed = o.seed ?? 7;
  const col = canvas(W, H);
  const hgt = canvas(W, H);
  const cd = new ImageData(W, H);
  const hd = new ImageData(W, H);
  // dirt palette (sRGB)
  const dirtA = [118, 98, 80]; // packed, greyish brown
  const dirtB = [96, 78, 62]; // darker loam
  const dirtC = [134, 116, 94]; // dry light patches
  const grassA = [112, 104, 66]; // dead grass, straw-olive
  const grassB = [70, 66, 46]; // dark earth between the clumps
  for (let py = 0; py < H; py++) {
    const z = o.z0 + (py + 0.5) / o.ppuZ;
    const lane = smooth(o.laneZ0 - 0.6, o.laneZ0 + 0.4, z) * (1 - smooth(o.laneZ1 - 0.4, o.laneZ1 + 0.6, z));
    const nearWall = 1 - smooth(o.wallZ, o.wallZ + 1.6, z);
    for (let px = 0; px < W; px++) {
      const x = o.x0 + (px + 0.5) / o.ppuX;
      const n1 = fbm(x * 0.22, z * 0.5, 4, seed);
      const n2 = fbm(x * 1.3, z * 2.2, 3, seed + 5);
      const n3 = vnoise(x * 7.5, z * 11, seed + 9);
      const g = hash2(px, py, seed + 3) - 0.5;
      // large blotches between loam and packed earth
      let t = smooth(0.32, 0.68, n1);
      let r = mix(dirtB[0], dirtA[0], t);
      let gg = mix(dirtB[1], dirtA[1], t);
      let b = mix(dirtB[2], dirtA[2], t);
      // dry light patches
      const dry = smooth(0.58, 0.8, n2) * (0.55 + 0.45 * lane);
      r = mix(r, dirtC[0], dry * 0.55);
      gg = mix(gg, dirtC[1], dry * 0.55);
      b = mix(b, dirtC[2], dry * 0.55);
      // lane: smoother, slightly lighter, faint wheel ruts
      const rut = Math.max(
        Math.exp(-(((z - (o.laneZ0 + 0.55 + 0.12 * Math.sin(x * 0.31))) / 0.09) ** 2)),
        Math.exp(-(((z - (o.laneZ1 - 0.75 + 0.1 * Math.sin(x * 0.27 + 2))) / 0.09) ** 2)),
      );
      const rutAmt = rut * 0.1 * lane * smooth(0.25, 0.6, fbm(x * 0.4, 3.3, 2, seed + 11));
      const wl = o.wild ? o.wild(x, z) : 0;
      if (wl > 0) {
        // dead grass in clumps over dark earth, a little moss on the stones
        const clump = smooth(0.35, 0.7, fbm(x * 0.9, z * 1.6, 3, seed + 21));
        const blade = vnoise(x * 18, z * 5, seed + 23);
        const gr = mix(grassB[0], grassA[0], clump * (0.6 + 0.4 * blade));
        const gg2 = mix(grassB[1], grassA[1], clump * (0.6 + 0.4 * blade));
        const gb = mix(grassB[2], grassA[2], clump * (0.6 + 0.4 * blade));
        r = mix(r, gr, wl);
        gg = mix(gg, gg2, wl);
        b = mix(b, gb, wl);
      }
      const k = 1 + lane * 0.05 - rutAmt - nearWall * 0.16 * (1 - wl) + (n2 - 0.5) * 0.12 + (n3 - 0.5) * 0.07 * (1 - lane * 0.5) + g * 0.05;
      r *= k;
      gg *= k;
      b *= k;
      const i = (py * W + px) << 2;
      cd.data[i] = r;
      cd.data[i + 1] = gg;
      cd.data[i + 2] = b;
      cd.data[i + 3] = 255;
      const h = 0.5 + (n2 - 0.5) * 0.35 + (n3 - 0.5) * 0.25 * (1 - lane * 0.6) * (1 + wl) - rutAmt * 2 + g * 0.06 * (1 + wl * 2);
      hd.data[i] = hd.data[i + 1] = hd.data[i + 2] = Math.max(0, Math.min(255, h * 255));
      hd.data[i + 3] = 255;
    }
  }
  const cg = ctx2d(col);
  const hg = ctx2d(hgt);
  cg.putImageData(cd, 0, 0);
  hg.putImageData(hd, 0, 0);
  const R = rng(seed * 31 + 1);
  const toPx = (x: number, z: number): [number, number] => [(x - o.x0) * o.ppuX, (z - o.z0) * o.ppuZ];
  // pebbles: denser near the walls and lane edges, sparse in the lane
  const area = (o.x1 - o.x0) * (o.z1 - o.z0);
  const count = Math.round(area * 26);
  for (let i = 0; i < count; i++) {
    const x = o.x0 + R() * (o.x1 - o.x0);
    const z = o.z0 + R() * (o.z1 - o.z0);
    const lane = z > o.laneZ0 + 0.2 && z < o.laneZ1 - 0.2;
    if (lane && R() < 0.72) continue;
    const s = (0.02 + R() * R() * 0.09) * (z < o.wallZ + 1.5 ? 1.3 : 1);
    const [px, py] = toPx(x, z);
    const rx = s * o.ppuX;
    const ry = s * o.ppuZ * 0.8;
    const v = 0.75 + R() * 0.55;
    const base = [Math.round(122 * v), Math.round(112 * v), Math.round(100 * v)];
    cg.fillStyle = `rgba(30,22,16,0.35)`;
    cg.beginPath();
    cg.ellipse(px + rx * 0.25, py + ry * 0.45, rx * 1.05, ry * 1.05, 0, 0, Math.PI * 2);
    cg.fill();
    cg.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    cg.beginPath();
    cg.ellipse(px, py, rx, ry, R() * 3, 0, Math.PI * 2);
    cg.fill();
    cg.fillStyle = `rgba(255,245,225,0.18)`;
    cg.beginPath();
    cg.ellipse(px - rx * 0.25, py - ry * 0.3, rx * 0.5, ry * 0.45, 0, 0, Math.PI * 2);
    cg.fill();
    const hgr = hg.createRadialGradient(px, py, 0, px, py, Math.max(rx, ry));
    hgr.addColorStop(0, 'rgba(255,255,255,0.9)');
    hgr.addColorStop(1, 'rgba(255,255,255,0)');
    hg.fillStyle = hgr;
    hg.beginPath();
    hg.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    hg.fill();
  }
  // grass tufts on the wild ground
  cg.lineCap = 'round';
  if (o.wild) {
    const tufts = Math.round(area * 30);
    for (let i = 0; i < tufts; i++) {
      const x = o.x0 + R() * (o.x1 - o.x0);
      const z = o.z0 + R() * (o.z1 - o.z0);
      const wl = o.wild(x, z);
      if (R() > wl) continue;
      const [px, py] = toPx(x, z);
      const v = 0.75 + R() * 0.5;
      cg.strokeStyle = `rgba(${Math.round(132 * v)},${Math.round(120 * v)},${Math.round(74 * v)},0.8)`;
      cg.lineWidth = 1 + R();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (R() - 0.5) * 1.6;
        const len = (0.05 + R() * 0.09) * o.ppuX;
        cg.beginPath();
        cg.moveTo(px + (R() - 0.5) * 4, py);
        cg.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len * 0.6);
        cg.stroke();
      }
    }
  }
  // straw and splinters near the walls and in corners
  const straws = Math.round((o.x1 - o.x0) * 22);
  for (let i = 0; i < straws; i++) {
    const x = o.x0 + R() * (o.x1 - o.x0);
    const z = o.wallZ + 0.1 + Math.pow(R(), 1.8) * 2.4;
    if (o.wild && o.wild(x, z) > 0.4) continue;
    const [px, py] = toPx(x, z);
    const len = (0.08 + R() * 0.16) * o.ppuX;
    const a = R() * Math.PI;
    const v = 0.7 + R() * 0.4;
    cg.strokeStyle = `rgba(${Math.round(196 * v)},${Math.round(160 * v)},${Math.round(92 * v)},0.75)`;
    cg.lineWidth = 1.2 + R() * 1.2;
    cg.beginPath();
    cg.moveTo(px, py);
    cg.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len * (o.ppuZ / o.ppuX));
    cg.stroke();
  }
  // dark damp stains (footprints of barrels, spilled water)
  for (let i = 0; i < (o.x1 - o.x0) * 0.6; i++) {
    const x = o.x0 + R() * (o.x1 - o.x0);
    const z = o.wallZ + 0.2 + R() * 5;
    const [px, py] = toPx(x, z);
    const rx = (0.4 + R() * 0.9) * o.ppuX;
    const ry = (0.25 + R() * 0.5) * o.ppuZ;
    const gr = cg.createRadialGradient(px, py, 0, px, py, rx);
    gr.addColorStop(0, 'rgba(40,30,24,0.16)');
    gr.addColorStop(1, 'rgba(40,30,24,0)');
    cg.fillStyle = gr;
    cg.beginPath();
    cg.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    cg.fill();
  }
  const normal = normalFromHeight(hgt, 3.2);
  return { map: texFrom(col), normal: texFrom(normal, false), colour: col };
}

/** Thatch: layered straw rows with streaks. u runs along the eave, v down the slope. */
export function thatchTexture(seed = 3, burnt = 0): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const c = canvas(W, H);
  const g = ctx2d(c);
  const R = rng(seed);
  const base = burnt > 0 ? [92, 70, 44] : [168, 128, 66];
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, W, H);
  const rows = 6;
  const rowH = H / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH;
    // streaks
    for (let i = 0; i < 2600; i++) {
      const x = R() * W;
      const y = y0 + R() * rowH;
      const len = 14 + R() * 40;
      const v = 0.62 + R() * 0.62;
      g.strokeStyle = `rgba(${Math.round(base[0] * v)},${Math.round(base[1] * v)},${Math.round(base[2] * v * 0.92)},0.55)`;
      g.lineWidth = 1 + R() * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (R() - 0.5) * 6, y + len);
      g.stroke();
    }
    // shadow under the next row's ragged edge
    const gr = g.createLinearGradient(0, y0 + rowH * 0.62, 0, y0 + rowH);
    gr.addColorStop(0, 'rgba(30,18,8,0)');
    gr.addColorStop(1, 'rgba(30,18,8,0.55)');
    g.fillStyle = gr;
    g.fillRect(0, y0, W, rowH);
    // ragged lit edge at the top of each row
    for (let x = 0; x < W; x += 3) {
      const dy = R() * 10;
      g.fillStyle = `rgba(${Math.min(255, base[0] * 1.35)},${Math.min(255, base[1] * 1.3)},${base[2] * 1.1},0.5)`;
      g.fillRect(x, y0 + dy, 2, 3 + R() * 5);
    }
  }
  if (burnt > 0) {
    for (let i = 0; i < 40; i++) {
      const x = R() * W;
      const y = R() * H;
      const r = 30 + R() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(12,8,6,${0.7 * burnt})`);
      gr.addColorStop(1, 'rgba(12,8,6,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const t = texFrom(c);
  return t;
}

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------

/** stone colours sampled by eye from the dungeon palette (cell 1,0 and 0,0) */
export const STONE = {
  light: 0xa7b1b9,
  face: 0x7f8990,
  mid: 0x6c757c,
  dark: 0x4b5258,
  coping: 0x30353a,
  mortar: 0x3a3f45,
};

export function stoneMat(color: number = STONE.face): THREE.MeshStandardMaterial {
  return mat(color, { rough: 0.92 });
}

export const WOOD = { light: 0x9a6038, mid: PAL.wood, dark: PAL.woodDark, charred: 0x2a1c14 };

// ---------------------------------------------------------------------------
// placement
// ---------------------------------------------------------------------------

export interface PutOpts {
  y?: number;
  /** yaw degrees */
  ry?: number;
  rx?: number;
  rz?: number;
  s?: number | [number, number, number];
  /** tint every material (multiply) */
  tint?: number;
  /** override every material colour (keeps the palette texture out) */
  color?: number;
  name?: string;
  shadow?: boolean;
}

function applyMats(o: THREE.Object3D, fn: (m: THREE.MeshStandardMaterial) => void): void {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const x of mats) fn(x as THREE.MeshStandardMaterial);
  });
}

export function tintObj(o: THREE.Object3D, tint: number): void {
  const c = new THREE.Color(tint);
  applyMats(o, (m) => m.color?.multiply(c));
}

/** load a model and place it; x/z are world coords of its local origin */
export async function put(parent: THREE.Object3D, url: string, x: number, z: number, o: PutOpts = {}): Promise<THREE.Object3D> {
  const obj = await loadProp(url);
  obj.position.set(x, o.y ?? 0, z);
  const R = Math.PI / 180;
  obj.rotation.set((o.rx ?? 0) * R, (o.ry ?? 0) * R, (o.rz ?? 0) * R);
  if (o.s !== undefined) {
    if (typeof o.s === 'number') obj.scale.setScalar(o.s);
    else obj.scale.set(o.s[0], o.s[1], o.s[2]);
  }
  if (o.tint !== undefined) tintObj(obj, o.tint);
  if (o.color !== undefined) {
    const c = new THREE.Color(o.color);
    applyMats(obj, (m) => {
      m.map = null;
      m.color.copy(c);
      m.needsUpdate = true;
    });
  }
  if (o.shadow === false) obj.traverse((n) => ((n as THREE.Mesh).castShadow = false));
  if (o.name) obj.name = o.name;
  parent.add(obj);
  return obj;
}

/** box with its bottom-back-left corner semantics replaced by explicit min/max */
export function slab(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material | number): THREE.Mesh {
  const b = box(x1 - x0, y1 - y0, z1 - z0, m instanceof THREE.Material ? m : stoneMat(m));
  b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return b;
}

/**
 * KayKit-style stone face details: a few protruding bricks in a lighter tone on a face that
 * looks toward +z at depth `z`, inside the rectangle [x0,x1] x [y0,y1]. Avoids `holes`.
 */
export function bricks(parent: THREE.Object3D, x0: number, x1: number, y0: number, y1: number, z: number, seed: number, density = 0.22, holes: Array<[number, number, number, number]> = []): void {
  const R = rng(seed);
  const m1 = stoneMat(STONE.light);
  const m2 = stoneMat(0x959fa7);
  const rows = Math.floor((y1 - y0) / 0.26);
  for (let r = 0; r < rows; r++) {
    const y = y0 + 0.16 + r * 0.26;
    let x = x0 + 0.1 + R() * 0.4;
    while (x < x1 - 0.5) {
      const w = 0.36 + R() * 0.22;
      const inHole = holes.some(([hx0, hy0, hx1, hy1]) => x + w > hx0 - 0.05 && x < hx1 + 0.05 && y + 0.2 > hy0 - 0.05 && y - 0.02 < hy1 + 0.05);
      if (!inHole && R() < density) {
        const b = box(w, 0.17, 0.06, R() < 0.5 ? m1 : m2);
        b.position.set(x + w / 2, y, z + 0.02);
        parent.add(b);
      }
      x += w + 0.06;
    }
  }
}

/** crenellated parapet along x at depth z (merlon front face at z), base height y */
export function merlons(parent: THREE.Object3D, x0: number, x1: number, y: number, z: number, o: { w?: number; gap?: number; h?: number; d?: number; color?: number } = {}): void {
  const w = o.w ?? 0.62;
  const gap = o.gap ?? 0.42;
  const h = o.h ?? 0.62;
  const d = o.d ?? 0.5;
  const m = stoneMat(o.color ?? STONE.face);
  const cap = stoneMat(STONE.dark);
  const n = Math.max(1, Math.floor((x1 - x0 + gap) / (w + gap)));
  const span = n * w + (n - 1) * gap;
  let x = x0 + (x1 - x0 - span) / 2;
  for (let i = 0; i < n; i++) {
    parent.add(slab(x, y, z - d, x + w, y + h, z, m));
    parent.add(slab(x - 0.03, y + h, z - d - 0.03, x + w + 0.03, y + h + 0.08, z + 0.03, cap));
    x += w + gap;
  }
}

// ---------------------------------------------------------------------------
// small custom props
// ---------------------------------------------------------------------------

/** stout iron anvil on a log stump, origin at the stump's base centre; horn points +x */
export function anvil(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x2c3036, { rough: 0.45, metal: 0.65 });
  const ironHi = mat(0x5b636c, { rough: 0.35, metal: 0.7 });
  g.add(at(cyl(0.3, 0.34, 0.55, WOOD.dark, 12), 0, 0.275, 0));
  g.add(at(cyl(0.29, 0.29, 0.03, 0xb08050, 12), 0, 0.555, 0));
  g.add(at(box(0.34, 0.12, 0.26, iron), 0, 0.63, 0));
  g.add(at(box(0.2, 0.18, 0.18, iron), 0, 0.78, 0));
  g.add(at(box(0.62, 0.13, 0.26, ironHi), 0, 0.93, 0));
  const horn = cone(0.11, 0.38, iron, 8);
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(0.5, 0.94, 0);
  g.add(horn);
  return g;
}

/** hay bale */
export function hay(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const R = rng(seed);
  const m = mat(0xc49a4c, { rough: 1 });
  g.add(at(box(1.1, 0.5, 0.62, m), 0, 0.25, 0, 0, (R() - 0.5) * 10, 0));
  const band = mat(0x7a5a2c);
  for (const x of [-0.28, 0.28]) g.add(at(box(0.05, 0.52, 0.64, band), x, 0.25, 0));
  return g;
}

/** wooden cart with two big wheels; origin at the axle centre on the ground; long axis x */
export function cart(o: { charred?: boolean; tilt?: number; load?: 'hay' | 'barrels' | 'none' } = {}): THREE.Group {
  const g = new THREE.Group();
  const w = o.charred ? WOOD.charred : WOOD.mid;
  const wd = o.charred ? 0x1a120c : WOOD.dark;
  const body = new THREE.Group();
  body.add(at(box(2.2, 0.12, 1.15, w), 0, 0.72, 0));
  body.add(at(box(2.2, 0.36, 0.08, wd), 0, 0.96, 0.56));
  body.add(at(box(2.2, 0.36, 0.08, wd), 0, 0.96, -0.56));
  body.add(at(box(0.08, 0.36, 1.15, wd), 1.08, 0.96, 0));
  body.add(at(box(0.08, 0.36, 1.15, wd), -1.08, 0.96, 0));
  // shafts
  body.add(at(box(1.5, 0.08, 0.08, wd), -1.75, 0.62, 0.42, 0, 0, -8));
  body.add(at(box(1.5, 0.08, 0.08, wd), -1.75, 0.62, -0.42, 0, 0, -8));
  if (o.load === 'hay') {
    const hayM = mat(o.charred ? 0x2a2018 : 0xc49a4c, { rough: 1 });
    body.add(at(box(1.9, 0.45, 0.95, hayM), 0, 1.25, 0, 0, 0, 2));
    body.add(at(box(1.3, 0.3, 0.8, hayM), 0.1, 1.6, 0, 0, 4, -3));
  }
  g.add(body);
  const wheelM = mat(wd);
  for (const z of [0.66, -0.66]) {
    const wheel = new THREE.Group();
    wheel.add(at(cyl(0.55, 0.55, 0.1, wheelM, 14), 0, 0, 0, 90, 0, 0));
    wheel.add(at(cyl(0.12, 0.12, 0.16, mat(0x3a3f45, { metal: 0.5, rough: 0.5 }), 8), 0, 0, 0, 90, 0, 0));
    wheel.position.set(0.15, 0.55, z);
    g.add(wheel);
  }
  if (o.tilt) g.rotation.z = (o.tilt * Math.PI) / 180;
  return g;
}

/** weapon rack: two posts, a rail, spears and swords leaning; faces +z; origin at base centre */
export function weaponRack(seed = 2): THREE.Group {
  const g = new THREE.Group();
  const R = rng(seed);
  const wm = mat(WOOD.mid);
  const dm = mat(WOOD.dark);
  const steel = mat(PAL.steel, { rough: 0.35, metal: 0.7 });
  g.add(at(box(0.12, 1.5, 0.12, dm), -0.8, 0.75, -0.1));
  g.add(at(box(0.12, 1.5, 0.12, dm), 0.8, 0.75, -0.1));
  g.add(at(box(1.8, 0.1, 0.12, wm), 0, 1.25, -0.1));
  g.add(at(box(1.8, 0.1, 0.25, wm), 0, 0.25, 0));
  for (let i = 0; i < 6; i++) {
    const x = -0.65 + i * 0.26;
    const tilt = (R() - 0.5) * 6;
    if (i % 2 === 0) {
      // spear
      g.add(at(cyl(0.025, 0.025, 2.0, dm, 6), x, 1.0, 0.0, 6, 0, tilt));
      g.add(at(cone(0.06, 0.25, steel, 6), x + Math.sin((-tilt * Math.PI) / 180) * 1.0, 2.1, 0.1));
    } else {
      // sword point-down
      g.add(at(box(0.07, 0.95, 0.02, steel), x, 0.75, 0.05, 6, 0, tilt));
      g.add(at(box(0.26, 0.05, 0.06, dm), x, 1.25, 0.1, 6, 0, tilt));
      g.add(at(box(0.05, 0.18, 0.05, dm), x, 1.36, 0.11, 6, 0, tilt));
    }
  }
  return g;
}

/** a sharpened stake */
export function stake(len: number, m: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cyl(0.05, 0.06, len * 0.8, m, 6), 0, len * 0.4, 0));
  g.add(at(cone(0.05, len * 0.2, m, 6), 0, len * 0.9, 0));
  return g;
}

/** torn cloth banner hanging from a pole along x; origin at the top centre; faces +z */
export function clothBanner(w: number, h: number, color: number, o: { torn?: number; seed?: number; trim?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const R = rng(o.seed ?? 5);
  const pts: Array<[number, number]> = [
    [-w / 2, 0],
    [w / 2, 0],
  ];
  // right edge down, ragged bottom, left edge up
  const torn = o.torn ?? 0;
  pts.push([w / 2, -h * (1 - torn * 0.3 * R())]);
  const n = 7;
  for (let i = 1; i < n; i++) {
    const x = w / 2 - (w * i) / n;
    const base = i % 2 === 0 ? h : h * 0.86;
    pts.push([x + (R() - 0.5) * torn * 0.1, -base * (1 - torn * 0.45 * R())]);
  }
  pts.push([-w / 2, -h * (1 - torn * 0.3 * R())]);
  const cloth = mat(color, { rough: 0.95, side: THREE.DoubleSide });
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
  const m = mesh(geo, cloth);
  g.add(m);
  if (o.trim !== undefined) {
    const t = mat(o.trim, { rough: 0.9 });
    g.add(at(box(w, 0.08, 0.04, t), 0, -0.12, 0.02));
    g.add(at(box(w * 0.18, h * 0.42, 0.04, t), 0, -h * 0.42, 0.02));
    g.add(at(box(w * 0.55, w * 0.18, 0.04, t), 0, -h * 0.33, 0.02));
  }
  g.add(at(cyl(0.035, 0.035, w + 0.2, mat(WOOD.dark), 6), 0, 0.02, 0.02, 0, 0, 90));
  return g;
}

/** an iron-studded wooden door leaf (for the broken gate); origin at its bottom centre */
export function doorLeaf(w: number, h: number, charred = false): THREE.Group {
  const g = new THREE.Group();
  const wm = mat(charred ? 0x2e2118 : WOOD.dark);
  const im = mat(0x2a2d31, { metal: 0.5, rough: 0.55 });
  const planks = Math.max(3, Math.round(w / 0.32));
  for (let i = 0; i < planks; i++) {
    const pw = w / planks;
    g.add(at(box(pw - 0.02, h * (0.92 + ((i * 37) % 9) / 100), 0.14, wm), -w / 2 + pw * (i + 0.5), h / 2, 0));
  }
  for (const y of [0.25, 0.5, 0.78]) g.add(at(box(w * 1.02, 0.1, 0.18, im), 0, h * y, 0));
  return g;
}

export interface HeightFieldOpts {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** grid step along x and z (world units) */
  dx: number;
  dz: number;
  /** surface height at (x, z) */
  h: (x: number, z: number) => number;
  /** world rectangle the texture covers (default: the field itself) */
  uv?: { x0: number; x1: number; z0: number; z1: number };
}

/** A smooth ground surface over a grid: y = h(x, z). Texture u runs along x, v along z (flipY off). */
export function heightField(o: HeightFieldOpts, material: THREE.Material): THREE.Mesh {
  const nx = Math.max(1, Math.round((o.x1 - o.x0) / o.dx));
  const nz = Math.max(1, Math.round((o.z1 - o.z0) / o.dz));
  const uv = o.uv ?? { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1 };
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const uvs = new Float32Array((nx + 1) * (nz + 1) * 2);
  let k = 0;
  let q = 0;
  for (let j = 0; j <= nz; j++) {
    const z = o.z0 + ((o.z1 - o.z0) * j) / nz;
    for (let i = 0; i <= nx; i++) {
      const x = o.x0 + ((o.x1 - o.x0) * i) / nx;
      pos[k++] = x;
      pos[k++] = o.h(x, z);
      pos[k++] = z;
      uvs[q++] = (x - uv.x0) / (uv.x1 - uv.x0);
      uvs[q++] = (z - uv.z0) / (uv.z1 - uv.z0);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      // counter-clockwise seen from above (+y)
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

export { at, box, cone, cyl, mat, mesh, PAL };
