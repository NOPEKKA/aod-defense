/**
 * The battlefield (ART_BIBLE 6.1) in five lighting / dressing variants (6.3): the castle
 * courtyard on high ground at the left, a long road down the hillside (with a bridge on the
 * landing), the valley floor, and the demon lair at the right end (a cave mouth in chapters
 * 1-2, a dark keep's gate in 3-5).
 *
 * World units: x = logical px / 75, ground y = gy(x) (data/balance.json world.terrain through
 * core/terrain.ts, so every depth row of the road lands exactly where gameplay puts the units),
 * castle back wall front face at z = -3.5.
 */
import * as THREE from 'three';
import { BG_LAYERS, defineScene, GROUND_Y, project, terrainPx, WORLD_W, type BuiltScene, type FlameAnchor, type GlowAnchor, type LayerCam, type LightingSpec, type PointLightSpec, type PreviewActor } from '../scene';
import { PITCH, PPU } from '../sprite';
import balance from '../../../../data/balance.json';
import {
  anvil, at, box, canvas, cart, clamp01, clothBanner, cyl, doorLeaf, DUN, fbm, groundTexture, hay, HAL, heightField, mat, MED_B, MED_N, merlons, mix, put, rng, smooth, stake, STONE, stoneMat, thatchTexture, weaponRack, WOOD, type PutOpts,
} from './kit';

// ---------------------------------------------------------------------------
// variants
// ---------------------------------------------------------------------------

type Sky = {
  /** gradient stops top -> horizon (sRGB css) */
  stops: Array<[number, string]>;
  /** horizon glow */
  glow: { x: number; y: number; r: number; color: string; a: number };
  moon?: { x: number; y: number; r: number; color: string; halo: string };
  stars: number;
  clouds: { n: number; color: string; a: number; y0: number; y1: number };
};

interface Lair {
  kind: 'cave' | 'keep';
  /** glow in the opening (css) and the light it throws */
  glow: string;
  light: number;
}

interface Variant {
  id: string;
  chapter: number;
  sky: Sky;
  light: { sun: { dir: [number, number, number]; color: number; intensity: number } | null; sky: { color: number; intensity: number }; bounce: { color: number; intensity: number }; ambient: { color: number; intensity: number } };
  torch: { color: number; intensity: number; glow: string; glowA: number };
  /** far layer haze colour (sRGB css) and strength */
  haze: { color: string; a: number };
  /** valley mist (sRGB css) */
  mist: string;
  fog: { color: [number, number, number]; amount: number };
  grade: { spriteTint: string; fog: number; weather: 'none' | 'rain' | 'embers' | 'fog' };
  extras: { burning?: boolean; graves?: boolean; mist?: boolean; wet?: boolean };
  lair: Lair;
  exposure?: number;
}

const GREEN: Lair = { kind: 'cave', glow: '#7dff5a', light: 0x5aff3a };

const DUSK: Variant = {
  id: 'courtyard_dusk',
  chapter: 1,
  sky: {
    stops: [
      [0, '#3b3466'],
      [0.35, '#8a4f7a'],
      [0.62, '#e0804f'],
      [1, '#f6b46a'],
    ],
    glow: { x: 1000, y: 260, r: 620, color: '#ffb868', a: 0.55 },
    stars: 0,
    clouds: { n: 9, color: '#5b3560', a: 0.75, y0: 40, y1: 190 },
  },
  light: {
    sun: { dir: [-0.55, 0.42, 0.72], color: 0xffc090, intensity: 1.35 },
    sky: { color: 0x8f90cc, intensity: 1.0 },
    bounce: { color: 0x7a5236, intensity: 0.35 },
    ambient: { color: 0x5a5a82, intensity: 0.7 },
  },
  torch: { color: 0xff9a3c, intensity: 6, glow: '#ff9a3c', glowA: 0.32 },
  haze: { color: '#c0709a', a: 0.6 },
  mist: '#d89aa8',
  fog: { color: [0.25, 0.14, 0.2], amount: 0.0 },
  grade: { spriteTint: '#ffe2c4', fog: 0.05, weather: 'none' },
  extras: {},
  lair: GREEN,
};

const STORM: Variant = {
  id: 'courtyard_storm',
  chapter: 2,
  sky: {
    stops: [
      [0, '#161b2a'],
      [0.5, '#2c3548'],
      [1, '#56627a'],
    ],
    glow: { x: 800, y: 140, r: 520, color: '#9ab0d8', a: 0.3 },
    stars: 0,
    clouds: { n: 22, color: '#10141f', a: 0.9, y0: 10, y1: 220 },
  },
  light: {
    sun: { dir: [0.2, 0.7, 0.6], color: 0x9ab4e8, intensity: 0.7 },
    sky: { color: 0x7488b8, intensity: 0.95 },
    bounce: { color: 0x2c3a4c, intensity: 0.3 },
    ambient: { color: 0x44506e, intensity: 0.55 },
  },
  torch: { color: 0xffa550, intensity: 6.5, glow: '#ffa550', glowA: 0.3 },
  haze: { color: '#34405a', a: 0.7 },
  mist: '#5a6880',
  fog: { color: [0.08, 0.1, 0.16], amount: 0.2 },
  grade: { spriteTint: '#c4d0e8', fog: 0.2, weather: 'rain' },
  extras: { wet: true },
  lair: { kind: 'cave', glow: '#8aff6a', light: 0x6aff4a },
};

const NIGHT: Variant = {
  id: 'courtyard_night',
  chapter: 3,
  sky: {
    stops: [
      [0, '#070b1c'],
      [0.6, '#12204a'],
      [1, '#2a3f78'],
    ],
    glow: { x: 1050, y: 130, r: 480, color: '#7fa6ff', a: 0.28 },
    moon: { x: 1040, y: 70, r: 42, color: '#e8f0ff', halo: 'rgba(120,160,255,0.35)' },
    stars: 260,
    clouds: { n: 5, color: '#1b2a55', a: 0.5, y0: 40, y1: 170 },
  },
  light: {
    sun: { dir: [0.5, 0.6, 0.62], color: 0x9ab8ff, intensity: 1.15 },
    sky: { color: 0x6a86d0, intensity: 0.95 },
    bounce: { color: 0x2a3858, intensity: 0.3 },
    ambient: { color: 0x3c4a84, intensity: 0.55 },
  },
  torch: { color: 0xff9a3c, intensity: 9, glow: '#ff9a3c', glowA: 0.38 },
  haze: { color: '#233a78', a: 0.6 },
  mist: '#4a6aa8',
  fog: { color: [0.05, 0.08, 0.2], amount: 0.1 },
  grade: { spriteTint: '#c8d8ff', fog: 0.1, weather: 'none' },
  extras: {},
  lair: { kind: 'keep', glow: '#6aff6a', light: 0x4aff4a },
};

const FIRE: Variant = {
  id: 'courtyard_fire',
  chapter: 4,
  sky: {
    stops: [
      [0, '#1c0c10'],
      [0.45, '#5a1c14'],
      [1, '#d4501c'],
    ],
    glow: { x: 700, y: 260, r: 700, color: '#ff7a24', a: 0.32 },
    stars: 0,
    clouds: { n: 16, color: '#150a0c', a: 0.85, y0: 20, y1: 220 },
  },
  light: {
    sun: { dir: [-0.2, 0.35, 0.8], color: 0xff9a60, intensity: 0.5 },
    sky: { color: 0x7a6070, intensity: 0.6 },
    bounce: { color: 0x6a3420, intensity: 0.25 },
    ambient: { color: 0x3a3038, intensity: 0.35 },
  },
  torch: { color: 0xff8a2a, intensity: 3.5, glow: '#ff7a1e', glowA: 0.3 },
  haze: { color: '#8a3a20', a: 0.3 },
  mist: '#8a4a34',
  fog: { color: [0.1, 0.05, 0.04], amount: 0.1 },
  grade: { spriteTint: '#ffe2cc', fog: 0.08, weather: 'embers' },
  extras: { burning: true },
  lair: { kind: 'keep', glow: '#ff3a1a', light: 0xff3010 },
};

const BLOOD: Variant = {
  id: 'courtyard_bloodmoon',
  chapter: 5,
  sky: {
    stops: [
      [0, '#12040c'],
      [0.55, '#3a0c1c'],
      [1, '#6a1830'],
    ],
    glow: { x: 900, y: 140, r: 520, color: '#ff3040', a: 0.3 },
    moon: { x: 880, y: 76, r: 50, color: '#d83a36', halo: 'rgba(220,40,50,0.4)' },
    stars: 90,
    clouds: { n: 8, color: '#2a0c1c', a: 0.7, y0: 40, y1: 190 },
  },
  light: {
    sun: { dir: [0.35, 0.55, 0.7], color: 0xd86a64, intensity: 0.8 },
    sky: { color: 0x6a5a78, intensity: 0.7 },
    bounce: { color: 0x3a2434, intensity: 0.3 },
    ambient: { color: 0x3c3448, intensity: 0.5 },
  },
  torch: { color: 0xffa04a, intensity: 6, glow: '#ff9040', glowA: 0.3 },
  haze: { color: '#4a2a40', a: 0.35 },
  mist: '#6a3050',
  fog: { color: [0.1, 0.06, 0.1], amount: 0.1 },
  grade: { spriteTint: '#ecdce4', fog: 0.15, weather: 'fog' },
  extras: { graves: true, mist: true },
  lair: { kind: 'keep', glow: '#ff2a3a', light: 0xff1a2a },
};

export const VARIANTS: Record<string, Variant> = { courtyard_dusk: DUSK, courtyard_storm: STORM, courtyard_night: NIGHT, courtyard_fire: FIRE, courtyard_bloodmoon: BLOOD };

// ---------------------------------------------------------------------------
// layout (world units)
// ---------------------------------------------------------------------------

const WALL_Z = -4; // wall centre; front face at -3.5
const FACE_Z = -3.5;
const WALL_H = 4;
const WORLD_UNITS = WORLD_W / PPU;
const px = (v: number): number => v / PPU;
const COS = Math.cos((PITCH * Math.PI) / 180);
/** ground height (world y) at world x: the terrain's screen drop, undone through the camera pitch */
const gy = (x: number): number => -terrainPx(x * PPU) / (PPU * COS);
const slopeDeg = (x: number): number => (Math.atan((gy(x + 0.1) - gy(x - 0.1)) / 0.2) * 180) / Math.PI;

/** the castle wall ends at the outer gate */
const GATE_X = 11.35;
const CASTLE_END = 13.35;
/** the bridge over the ravine on the landing */
const BX0 = px(1765);
const BX1 = px(1985);
/** demon lair: the opening's centre */
const LX = ((balance.world as { lairX?: number }).lairX ?? WORLD_W - 100) / PPU;
const YV = gy(LX);

/** z of the hillside's back edge (the land falls away behind it); -99 = no drop */
function edgeZ(x: number): number {
  if (x < CASTLE_END) return -99;
  const e = -3.15 + 0.22 * Math.sin(x * 1.7) + 0.12 * Math.sin(x * 4.1 + 1);
  return mix(e, -12, smooth(40.5, 45, x));
}
/** 0..1 inside the ravine under the bridge */
const ravine = (x: number): number => smooth(BX0 - 0.1, BX0 + 0.3, x) * (1 - smooth(BX1 - 0.3, BX1 + 0.1, x));

function groundH(x: number, z: number): number {
  let y = gy(x);
  const ze = edgeZ(x);
  if (z < ze) y -= Math.min(8, (ze - z) * 3);
  y -= 6 * ravine(x);
  return y;
}

function sceneRoot(): THREE.Group {
  return new THREE.Group();
}

/** put a model standing on the ground at x */
async function putG(parent: THREE.Object3D, url: string, x: number, z: number, o: PutOpts & { tilt?: boolean } = {}): Promise<THREE.Object3D> {
  return put(parent, url, x, z, { ...o, y: gy(x) + (o.y ?? 0), rz: o.tilt ? slopeDeg(x) : o.rz });
}

function hexA(css: string, a: number): string {
  const c = new THREE.Color(css).convertLinearToSRGB();
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

// ---------------------------------------------------------------------------
// sky (screen coordinates: 0 = the view top at scroll 0)
// ---------------------------------------------------------------------------

function paintSky(v: Variant) {
  return (g: CanvasRenderingContext2D, w: number, h: number): void => {
    const s = v.sky;
    const gr = g.createLinearGradient(0, 0, 0, 420);
    for (const [t, c] of s.stops) gr.addColorStop(t, c);
    g.fillStyle = gr;
    g.fillRect(0, -60, w, h + 80);
    const R = rng(11);
    for (let i = 0; i < s.stars; i++) {
      const x = R() * w;
      const y = R() * 300 - 30;
      const a = (0.25 + R() * 0.75) * (1 - Math.max(0, y) / 330);
      g.fillStyle = `rgba(255,250,235,${a.toFixed(2)})`;
      const r = R() < 0.1 ? 1.8 : 1;
      g.fillRect(x, y, r, r);
    }
    const gl = s.glow;
    const gg = g.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, gl.r);
    gg.addColorStop(0, hexA(gl.color, gl.a));
    gg.addColorStop(1, hexA(gl.color, 0));
    g.fillStyle = gg;
    g.fillRect(0, -60, w, h + 80);
    if (s.moon) {
      const m = s.moon;
      const hg = g.createRadialGradient(m.x, m.y, m.r * 0.8, m.x, m.y, m.r * 5);
      hg.addColorStop(0, m.halo);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hg;
      g.fillRect(m.x - m.r * 5, m.y - m.r * 5, m.r * 10, m.r * 10);
      g.fillStyle = m.color;
      g.beginPath();
      g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.12)';
      const M = rng(5);
      for (let i = 0; i < 9; i++) {
        const a = M() * Math.PI * 2;
        const d = Math.sqrt(M()) * m.r * 0.7;
        g.beginPath();
        g.arc(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d, m.r * (0.08 + M() * 0.18), 0, Math.PI * 2);
        g.fill();
      }
    }
    const C = rng(23);
    for (let i = 0; i < s.clouds.n; i++) {
      const cx = C() * w;
      const cy = mix(s.clouds.y0, s.clouds.y1, C());
      const cw = 160 + C() * 280;
      for (let k = 0; k < 7; k++) {
        const ox = (C() - 0.5) * cw;
        const oy = (C() - 0.5) * 18;
        const rr = 40 + C() * 60;
        const cg = g.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rr);
        cg.addColorStop(0, hexA(s.clouds.color, s.clouds.a * 0.5));
        cg.addColorStop(1, hexA(s.clouds.color, 0));
        g.fillStyle = cg;
        g.save();
        g.translate(cx + ox, cy + oy);
        g.scale(1, 0.32);
        g.translate(-(cx + ox), -(cy + oy));
        g.fillRect(cx + ox - rr, cy + oy - rr, rr * 2, rr * 2);
        g.restore();
      }
    }
  };
}

// ---------------------------------------------------------------------------
// far layer: the land falling away to a misty valley, mountains beyond
// ---------------------------------------------------------------------------

const FAR_CAM: LayerCam = { ppu: 32, originX: 0, groundY: 700 };

async function buildFar(v: Variant) {
  const root = sceneRoot();
  const R = rng(41);
  const W = BG_LAYERS.far.w / FAR_CAM.ppu;
  // the castle's hill on the left: high, falling to the valley floor by ~x 22
  const hill = (x: number, z: number): number => 6 * (1 - smooth(6, 34, x)) * smooth(-46, -18, z) * (0.85 + 0.15 * fbm(x * 0.3, z * 0.3, 2, 3)) + 0.5 * (fbm(x * 0.15, z * 0.2, 3, 5) - 0.5);
  const floorM = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4f5a3a), roughness: 1, metalness: 0 });
  const floor = heightField({ x0: -4, x1: W + 4, z0: -48, z1: 4, dx: 0.8, dz: 0.8, h: hill }, floorM);
  root.add(floor);
  // forests on the valley floor and the hill
  for (let i = 0; i < 150; i++) {
    const x = -2 + R() * (W + 4);
    const z = -46 + R() * 44;
    const t = ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'][Math.floor(R() * 4)];
    await put(root, `${MED_N}${t}.gltf`, x, z, { y: hill(x, z) - 0.1, s: 1.0 + R() * 0.7, ry: R() * 360 });
  }
  for (let i = 0; i < 30; i++) {
    const x = -2 + R() * (W + 4);
    const z = -44 + R() * 36;
    const t = ['hills_A_trees', 'hills_B_trees', 'hills_C_trees'][Math.floor(R() * 3)];
    await put(root, `${MED_N}${t}.gltf`, x, z, { y: hill(x, z) - 0.2, s: 1.6 + R() * 1.0, ry: R() * 360 });
  }
  // a mountain range along the back
  for (let x = -3; x < W + 4; x += 4 + R() * 3) {
    const m = ['mountain_A', 'mountain_B', 'mountain_C', 'mountain_B_grass', 'mountain_C_grass'][Math.floor(R() * 5)];
    await put(root, `${MED_N}${m}.gltf`, x, -50 - R() * 5, { y: -0.5, s: 3.2 + R() * 2, ry: R() * 360 });
  }
  // the lair side: dark crags, and in the keep chapters a distant black spire
  for (const [x, s] of [[W - 14, 5], [W - 7, 4.4], [W - 20, 3.8]] as Array<[number, number]>) await put(root, `${MED_N}mountain_C.gltf`, x, -36, { y: -0.4, s, ry: R() * 360, tint: 0x6a6070 });
  if (v.lair.kind === 'keep') {
    await put(root, `${MED_B}red/building_tower_A_red.gltf`, W - 13.5, -37, { y: 6.6, s: 3.2, tint: 0x2a2028 });
    await put(root, `${MED_B}red/building_tower_B_red.gltf`, W - 10.5, -36.5, { y: 5.6, s: 2.6, tint: 0x2a2028 });
  }
  const light: LightingSpec = {
    sun: v.light.sun ? { dir: [0.15, 0.5, 0.85], color: v.light.sun.color, intensity: v.light.sun.intensity * 0.8, spread: 4 } : undefined,
    sky: { color: v.light.sky.color, intensity: v.light.sky.intensity * 0.9 },
    ambient: v.light.ambient,
  };
  return {
    root,
    light,
    cam: FAR_CAM,
    passes: 24,
    yRange: [-2, 12] as [number, number],
    zRange: [-58, 6] as [number, number],
    grade: { saturation: 0.9 },
    paint: (g: CanvasRenderingContext2D, w: number, h: number): void => {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      // atmospheric haze: strongest low, fades upward
      const gr = g.createLinearGradient(0, 40, 0, 400);
      gr.addColorStop(0, hexA(v.haze.color, v.haze.a * 0.8));
      gr.addColorStop(1, hexA(v.haze.color, Math.min(1, v.haze.a * 1.1)));
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      // the valley floor drowns in mist: a solid bank low down, then drifting banks above it
      const mg0 = g.createLinearGradient(0, 330, 0, 560);
      mg0.addColorStop(0, hexA(v.mist, 0));
      mg0.addColorStop(1, hexA(v.mist, 0.85));
      g.fillStyle = mg0;
      g.fillRect(0, 330, w, h - 330);
      // valley mist: banks of fog lying in the low ground (deeper toward the lair)
      const M = rng(91);
      for (let i = 0; i < 70; i++) {
        const x = M() * w;
        const deep = x / w;
        const y = mix(330, 290, deep) + M() * 260;
        const r = 120 + M() * 220;
        const mg = g.createRadialGradient(x, y, 0, x, y, r);
        mg.addColorStop(0, hexA(v.mist, 0.28 + 0.2 * deep));
        mg.addColorStop(1, hexA(v.mist, 0));
        g.fillStyle = mg;
        g.save();
        g.translate(x, y);
        g.scale(1, 0.28);
        g.fillRect(-r, -r, r * 2, r * 2);
        g.restore();
      }
      if (v.lair.kind === 'keep') {
        const kg = g.createRadialGradient(w - 400, 240, 0, w - 400, 240, 260);
        kg.addColorStop(0, hexA(v.lair.glow, 0.25));
        kg.addColorStop(1, hexA(v.lair.glow, 0));
        g.fillStyle = kg;
        g.fillRect(w - 700, 0, 640, 560);
      }
      g.restore();
    },
  };
}

// ---------------------------------------------------------------------------
// main layer
// ---------------------------------------------------------------------------

interface Built {
  root: THREE.Group;
  torches: FlameAnchor[];
  glows: GlowAnchor[];
  points: PointLightSpec[];
}

async function addTorch(v: Variant, b: Built, x: number, y = 2.1, z = FACE_Z, shadow = false): Promise<void> {
  const t = new THREE.Group();
  t.position.set(x, y, z);
  b.root.add(t);
  await put(t, `${DUN}torch_mounted.gltf.glb`, 0, 0, { shadow: false });
  const fp = project(x, y + 0.55, z + 0.45);
  b.torches.push({ x: Math.round(fp.x), y: Math.round(fp.y), scale: 1 });
  b.glows.push({ x: Math.round(fp.x), y: Math.round(fp.y - 14), r: 230, color: v.torch.glow, a: v.torch.glowA });
  b.points.push({ pos: [x, y + 0.7, z + 0.55], color: v.torch.color, intensity: v.torch.intensity, distance: 16, decay: 2, jitter: 0.12, shadow });
}

/** a torch on a wooden pole standing on the ground (road side) */
function poleTorch(v: Variant, b: Built, x: number, z: number, h = 1.9): void {
  const y0 = gy(x);
  b.root.add(at(cyl(0.07, 0.09, h, WOOD.dark, 6), x, y0 + h / 2, z));
  b.root.add(at(cyl(0.13, 0.08, 0.22, 0x2a2d31, 8, { metal: 0.5, rough: 0.5 }), x, y0 + h + 0.05, z));
  const fp = project(x, y0 + h + 0.2, z);
  b.torches.push({ x: Math.round(fp.x), y: Math.round(fp.y), scale: 0.9 });
  b.glows.push({ x: Math.round(fp.x), y: Math.round(fp.y - 14), r: 210, color: v.torch.glow, a: v.torch.glowA });
  b.points.push({ pos: [x, y0 + h + 0.45, z + 0.2], color: v.torch.color, intensity: v.torch.intensity * 0.9, distance: 14, decay: 2, jitter: 0.12 });
}

/** lantern post: the lantern hangs off an arm toward +x */
async function lanternPost(v: Variant, b: Built, x: number, z: number): Promise<void> {
  await putG(b.root, `${HAL}post_lantern.gltf`, x, z, { s: 0.72, ry: 90 });
  const ly = gy(x) + 2.05;
  const lx = x + 0.78;
  const fp = project(lx, ly, z);
  b.glows.push({ x: Math.round(fp.x), y: Math.round(fp.y), r: 150, color: v.torch.glow, a: v.torch.glowA * 0.9 });
  b.points.push({ pos: [lx, ly - 0.1, z + 0.3], color: v.torch.color, intensity: v.torch.intensity * 0.6, distance: 10, decay: 2, jitter: 0.1 });
}

/** a weathered wooden fence along the back of the road, following the slope */
function fence(b: Built, x0: number, x1: number, z: number, seed: number, broken = 0.25): void {
  const R = rng(seed);
  const post = mat(WOOD.dark);
  const rail = mat(0x6e4a30);
  const xs: number[] = [];
  for (let x = x0; x <= x1 + 1e-6; x += 1.1 + R() * 0.3) xs.push(x);
  for (const [i, x] of xs.entries()) {
    const lean = (R() - 0.5) * 14;
    b.root.add(at(box(0.13, 1.05, 0.13, post), x, gy(x) + 0.45, z, 0, 0, lean));
    const n = xs[i + 1];
    if (n === undefined) continue;
    for (const hy of [0.35, 0.78]) {
      if (R() < broken) continue;
      const ya = gy(x) + hy;
      const yb = gy(n) + hy + (R() < 0.15 ? -0.35 : 0);
      const len = Math.hypot(n - x, yb - ya);
      b.root.add(at(box(len + 0.1, 0.09, 0.06, rail), (x + n) / 2, (ya + yb) / 2, z + 0.08, 0, 0, (Math.atan2(yb - ya, n - x) * 180) / Math.PI));
    }
  }
}

async function buildMain(v: Variant) {
  const root = sceneRoot();
  const b: Built = { root, torches: [], glows: [], points: [] };
  const R = rng(77);
  const stone = stoneMat(STONE.face);

  // ---- ground: the terrain profile as a heightfield ----------------------
  const tex = { x0: -3, x1: WORLD_UNITS + 3, z0: -12, z1: 18 };
  const lane = (z: number): number => smooth(-2.4, -1.7, z) * (1 - smooth(1.9, 2.6, z));
  const wild = (x: number, z: number): number => {
    if (x < CASTLE_END - 0.6) return 0;
    const out = smooth(CASTLE_END - 0.6, CASTLE_END + 1.5, x);
    const road = lane(z) * (1 - 0.35 * smooth(41, 46, x));
    return clamp01(out * (1 - road) * (0.75 + 0.25 * fbm(x * 0.5, z * 0.5, 2, 9)));
  };
  const gt = groundTexture({ ...tex, ppuX: 40, ppuZ: 40, wallZ: -3.5, laneZ0: -1.5, laneZ1: 1.7, seed: 7, wild });
  // flagstones at the outer gate
  {
    const g = gt.colour.getContext('2d')!;
    const S = rng(4);
    for (let x = GATE_X - 1.4; x < GATE_X + 1.3; x += 0.45) {
      for (let z = -2.2; z < 2.4; z += 0.4) {
        const v2 = 0.8 + S() * 0.3;
        g.fillStyle = `rgb(${Math.round(112 * v2)},${Math.round(110 * v2)},${Math.round(106 * v2)})`;
        g.fillRect((x - tex.x0) * 40 + 1.5, (z - tex.z0) * 40 + 1.5, 0.45 * 40 - 3, 0.4 * 40 - 3);
      }
    }
    gt.map.needsUpdate = true;
  }
  const gm = new THREE.MeshStandardMaterial({ map: gt.map, normalMap: gt.normal, roughness: 1, metalness: 0 });
  gm.normalScale.set(0.9, 0.9);
  root.add(heightField({ x0: tex.x0, x1: tex.x1, z0: -11, z1: 17, dx: 0.2, dz: 0.25, h: groundH, uv: tex }, gm));

  // dark backdrop behind the castle wall (arches look into shade)
  const void_ = box(CASTLE_END + 3, WALL_H + 0.2, 0.2, 0x15121c);
  void_.position.set((CASTLE_END - 3) / 2, WALL_H / 2, -6.6);
  void_.castShadow = false;
  root.add(void_);
  const innerFloor = box(CASTLE_END + 3, 0.1, 3.2, 0x1b1620);
  innerFloor.position.set((CASTLE_END - 3) / 2, -0.06, -5.2);
  root.add(innerFloor);

  // ---- castle back wall (unchanged left part: the archer / catapult anchors sit on it) ----
  type Seg = { x: number; kind: string; sx?: number; sy?: number };
  const segs: Seg[] = [
    { x: 1.2, kind: 'wall_arched', sx: 0.6 },
    { x: 3.55, kind: 'wall_doorway.glb', sx: 0.5 },
    { x: 5.55, kind: 'wall', sx: 0.5 },
    { x: 7.9, kind: 'wall_cracked', sx: 0.7 },
    { x: GATE_X, kind: 'wall_arched', sx: 1, sy: 1.12 },
  ];
  for (const s of segs) {
    const url = s.kind.endsWith('.glb') ? `${DUN}${s.kind}` : `${DUN}${s.kind}.gltf.glb`;
    await put(root, url, s.x, WALL_Z, { s: [s.sx ?? 1, s.sy ?? 1, 1] });
  }
  for (const x of [-0.1, 2.45, 4.6, 6.5, 9.35, CASTLE_END]) await put(root, `${DUN}wall_pillar.gltf.glb`, x, WALL_Z + 0.25, { s: [0.5, x > 9 ? 1.12 : 1, 1] });
  merlons(root, -0.6, 9.3, WALL_H, FACE_Z + 0.2, { d: 0.5 });
  merlons(root, 9.3, CASTLE_END + 0.9, WALL_H * 1.12, FACE_Z + 0.2, { d: 0.5 });

  // towers: the old gate house, the catapult tower, and the outer gate's tower
  await put(root, `${MED_B}blue/building_tower_A_blue.gltf`, 3.3, WALL_Z - 0.4, { y: WALL_H - 0.1, s: 3.4 });
  await put(root, `${MED_B}blue/building_tower_catapult_blue.gltf`, 1.2, WALL_Z - 0.2, { y: WALL_H - 0.05, s: 2.4 });
  await put(root, `${MED_B}blue/building_tower_B_blue.gltf`, GATE_X, WALL_Z - 0.6, { y: WALL_H * 1.12 - 0.1, s: 3.0 });
  await put(root, `${MED_B}blue/building_tower_A_blue.gltf`, 7.6, WALL_Z - 0.5, { y: WALL_H - 0.1, s: 2.8 });
  // the outer gate stands open: leaves swung back against the arch
  for (const [dx, ry] of [[-1.35, 62], [1.35, -62]] as Array<[number, number]>) {
    const d = doorLeaf(1.05, 2.9, false);
    d.position.set(GATE_X + dx, 0, -3.1);
    d.rotation.y = (ry * Math.PI) / 180;
    root.add(d);
  }
  // raised portcullis teeth showing at the top of the arch
  const iron = mat(0x2a2d31, { metal: 0.5, rough: 0.55 });
  for (let i = 0; i < 6; i++) root.add(at(box(0.07, 0.55, 0.07, iron), GATE_X - 0.75 + i * 0.3, 3.15, FACE_Z - 0.1));
  root.add(at(box(1.8, 0.08, 0.08, iron), GATE_X, 3.4, FACE_Z - 0.1));

  // ---- stairs (unit spawn at x = 350 px) ---------------------------------
  await put(root, `${DUN}stairs.gltf.glb`, px(350) + 0.1, FACE_Z + 0.02, { s: [0.38, 0.78, 0.5], ry: 0 });

  // ---- torches -----------------------------------------------------------------
  const torchXs = [0.6, 2.0, 5.2, 6.9, GATE_X - 1.4, GATE_X + 1.4];
  for (const [i, x] of torchXs.entries()) await addTorch(v, b, x, 2.2, FACE_Z, i % 3 === 1);
  for (const x of [4.45]) await put(root, `${DUN}banner_patternA_blue.gltf.glb`, x, FACE_Z - 0.4, { y: 0.3, s: 1.05 });
  for (const x of [2.45, 4.7]) await put(root, `${DUN}banner_blue.gltf.glb`, x, FACE_Z - 0.4, { y: 0.1, s: 1.0 });
  for (const x of [GATE_X - 2.05, GATE_X + 2.05]) await put(root, `${DUN}banner_thin_blue.gltf.glb`, x, FACE_Z - 0.4, { y: 0.6, s: 1.05 });

  // ---- book alcove --------------------------------------------------------
  const plinth = box(0.9, 0.5, 0.9, stone);
  plinth.position.set(px(110), 0.25, -3.0);
  root.add(plinth);
  const slabTop = box(1.0, 0.1, 1.0, stoneMat(STONE.light));
  slabTop.position.set(px(110), 0.55, -3.0);
  root.add(slabTop);
  b.points.push({ pos: [px(110), 1.1, -2.7], color: 0x7dff5a, intensity: 2.2, distance: 6, decay: 2, jitter: 0.1 });

  // ---- pit (cover drawn by the game) --------------------------------------
  const pitX0 = px(410);
  const pitX1 = px(480);
  const sin = Math.sin((PITCH * Math.PI) / 180);
  const pitZ0 = (505 - 520) / (sin * PPU);
  const pitZ1 = (505 + 34 - 520) / (sin * PPU);
  const hole = box(pitX1 - pitX0, 0.05, pitZ1 - pitZ0, 0x0a0709);
  hole.position.set((pitX0 + pitX1) / 2, 0.02, (pitZ0 + pitZ1) / 2);
  hole.receiveShadow = false;
  root.add(hole);
  for (const [cx, cz, w, d] of [
    [(pitX0 + pitX1) / 2, pitZ0 - 0.07, pitX1 - pitX0 + 0.3, 0.14],
    [(pitX0 + pitX1) / 2, pitZ1 + 0.07, pitX1 - pitX0 + 0.3, 0.14],
    [pitX0 - 0.07, (pitZ0 + pitZ1) / 2, 0.14, pitZ1 - pitZ0],
    [pitX1 + 0.07, (pitZ0 + pitZ1) / 2, 0.14, pitZ1 - pitZ0],
  ] as Array<[number, number, number, number]>) {
    const r = box(w, 0.12, d, stoneMat(STONE.mid));
    r.position.set(cx, 0.05, cz);
    root.add(r);
  }

  // ---- smithy (520 - 715 px) ------------------------------------------------
  const sx0 = px(520);
  const sx1 = px(715);
  const scx = (sx0 + sx1) / 2;
  const sw = sx1 - sx0 + 0.4;
  const thatch = thatchTexture(3, v.extras.burning ? 1 : 0);
  const roofM = new THREE.MeshStandardMaterial({ map: thatch, roughness: 1 });
  const dark = mat(WOOD.dark);
  const wood = mat(WOOD.mid);
  const frontZ = -1.55;
  for (const x of [sx0 + 0.05, sx1 - 0.05]) root.add(at(box(0.22, 2.7, 0.22, dark), x, 1.35, frontZ));
  const wallTopY = 3.55;
  const frontTopY = 2.75;
  const slopeLen = Math.hypot(frontZ - FACE_Z + 0.5, wallTopY - frontTopY);
  const roof = box(sw + 0.5, 0.3, slopeLen, roofM);
  roof.position.set(scx, (wallTopY + frontTopY) / 2 + 0.05, (frontZ + FACE_Z - 0.3) / 2);
  roof.rotation.x = Math.atan2(wallTopY - frontTopY, frontZ - FACE_Z + 0.5);
  root.add(roof);
  const ridge = cyl(0.14, 0.14, sw + 0.6, mat(0xb08a4c, { rough: 1 }), 6);
  ridge.rotation.z = Math.PI / 2;
  ridge.position.set(scx, wallTopY + 0.22, FACE_Z - 0.2);
  root.add(ridge);
  root.add(at(box(sw + 0.1, 0.16, 0.2, wood), scx, 2.62, frontZ));
  const forgeX = px(600);
  root.add(at(box(1.5, 1.0, 0.95, stoneMat(STONE.mid)), forgeX, 0.5, -3.0));
  root.add(at(box(1.2, 0.2, 0.8, stoneMat(STONE.dark)), forgeX, 2.25, -3.05));
  root.add(at(box(0.7, 2.8, 0.6, stoneMat(STONE.face)), forgeX, 2.7, -3.15));
  const coals = box(1.1, 0.06, 0.62, mat(0xff6a1a, { emissive: 0xff5a10, emissiveIntensity: 2.2 }));
  coals.position.set(forgeX, 1.03, -2.98);
  coals.castShadow = false;
  root.add(coals);
  b.points.push({ pos: [forgeX, 1.3, -2.55], color: 0xff7a22, intensity: 9, distance: 11, decay: 2, jitter: 0.15, shadow: true });
  const an = anvil();
  an.position.set(px(690), 0, -2.0);
  root.add(an);
  await put(root, `${DUN}barrel_small.gltf.glb`, sx0 - 0.1, -2.8, { s: 0.8 });
  const rack = weaponRack(4);
  rack.position.set(px(560), 0, -3.2);
  rack.scale.setScalar(0.85);
  root.add(rack);
  b.points.push({ pos: [px(640), 3.0, -1.3], color: 0xffb060, intensity: 4, distance: 8, decay: 2, jitter: 0.1 });

  // ---- the hillside road -------------------------------------------------------
  // rocks along the back edge, where the land falls away
  const rocks = ['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E'];
  for (let x = CASTLE_END + 0.4; x < 44; x += 0.7 + R() * 1.3) {
    if (ravine(x) > 0.01 || ravine(x - 0.5) > 0.01 || ravine(x + 0.5) > 0.01) continue;
    const z = Math.max(edgeZ(x), -6) + 0.15;
    await putG(root, `${MED_N}${rocks[Math.floor(R() * 5)]}.gltf`, x, z, { y: -0.05, s: 2.4 + R() * 3, ry: R() * 360 });
  }
  // the castle hill's rock shoulder just past the gate
  await putG(root, `${MED_N}mountain_A.gltf`, CASTLE_END + 1.6, -4.4, { y: -0.6, s: 1.3, ry: 30 });
  await putG(root, `${DUN}rubble_large.gltf.glb`, CASTLE_END + 0.6, -3.1, { s: 0.3, ry: 10 });
  // retaining stones on the downhill side of the road (below the play band)
  for (let x = CASTLE_END + 2; x < 41; x += 0.55 + R() * 0.25) {
    if (ravine(x) > 0.01 || ravine(x - 0.6) > 0.01 || ravine(x + 0.6) > 0.01 || R() < 0.25) continue;
    b.root.add(at(box(0.5, 0.32, 0.4, stoneMat(R() < 0.5 ? STONE.mid : STONE.dark)), x, gy(x) + 0.08, 2.75 + R() * 0.15, 0, (R() - 0.5) * 20, slopeDeg(x)));
  }
  // dead trees and stakes
  for (const [n, x, z, s, ry] of [
    ['tree_dead_medium', 15.6, -3.0, 0.8, 20], ['tree_dead_large', 21.8, -3.4, 0.8, 200], ['tree_dead_medium', 33.2, -3.1, 0.85, 70],
    ['tree_dead_large', 38.6, -3.5, 0.85, 120], ['tree_dead_large', 43.6, -6.4, 0.9, 30], ['tree_dead_medium', 45.6, -4.6, 0.8, 300],
  ] as Array<[string, number, number, number, number]>) await putG(root, `${HAL}${n}.gltf`, x, z, { s, ry, y: -0.15 });
  const stakeM = mat(0x5d4430);
  for (const [x, z] of [[29.4, -2.6], [29.8, -2.9], [30.1, -2.5], [39.6, -2.7], [40.0, -2.5]] as Array<[number, number]>) {
    const st = stake(1.1 + R() * 0.5, stakeM);
    st.position.set(x, gy(x) - 0.05, z);
    st.rotation.set((R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.4);
    root.add(st);
  }
  // fences along the back
  fence(b, CASTLE_END + 2.4, 20.6, -2.55, 3);
  fence(b, 27.4, 31.0, -2.55, 8, 0.4);
  // lanterns and torches mark the way down
  await lanternPost(v, b, 18.0, -2.25);
  await lanternPost(v, b, 34.6, -2.3);
  // an abandoned cart beside the road
  const ct = cart({ load: 'hay', charred: v.extras.burning });
  ct.position.set(31.6, gy(31.6), -2.9);
  ct.rotation.set(0, 0.25, (slopeDeg(31.6) * Math.PI) / 180 + 0.06);
  root.add(ct);
  await putG(root, `${DUN}barrel_large.gltf.glb`, 30.4, -2.7, { s: 0.45, ry: 40 });

  // ---- the bridge over the ravine -----------------------------------------------
  {
    const deckM = mat(0x7a5236);
    const deckD = mat(0x5a3a26);
    for (let x = BX0 - 0.25; x < BX1 + 0.25; x += 0.33) {
      const y = gy(x);
      const p = box(0.3, 0.14, 4.3, R() < 0.3 ? deckD : deckM);
      p.position.set(x + 0.15, y - 0.07 + (R() - 0.5) * 0.03, (R() - 0.5) * 0.08);
      p.rotation.y = (R() - 0.5) * 0.03;
      root.add(p);
    }
    const mid = (BX0 + BX1) / 2;
    const span = BX1 - BX0 + 0.6;
    for (const z of [-2.0, 2.0]) {
      root.add(at(box(span, 0.3, 0.22, mat(WOOD.dark)), mid, gy(mid) - 0.3, z));
      for (const x of [BX0, mid, BX1]) root.add(at(box(0.24, 6, 0.24, mat(WOOD.dark)), x, gy(x) - 3.1, z));
    }
    // a hand rail on the far side, low posts on the near side
    for (const x of [BX0, BX0 + (BX1 - BX0) / 3, BX0 + (2 * (BX1 - BX0)) / 3, BX1]) {
      root.add(at(box(0.14, 0.95, 0.14, mat(WOOD.dark)), x, gy(x) + 0.45, -2.05));
      root.add(at(box(0.14, 0.32, 0.14, mat(WOOD.dark)), x, gy(x) + 0.12, 2.05));
    }
    root.add(at(box(span, 0.1, 0.08, mat(0x6e4a30)), mid, gy(mid) + 0.85, -2.05, 0, 0, slopeDeg(mid)));
    // the ravine's far wall in deep shade
    root.add(at(box(BX1 - BX0 + 0.8, 9, 0.4, stoneMat(STONE.dark)), mid, gy(mid) - 4.8, -2.9));
    poleTorch(v, b, BX0 - 0.45, -2.35);
    poleTorch(v, b, BX1 + 0.45, -2.35);
  }

  // ---- the valley floor --------------------------------------------------------------
  for (const [n, x, z, s, ry] of [
    ['post_skull', 44.4, -3.0, 0.7, 90], ['post_skull', 47.6, -3.1, 0.7, 90], ['gravemarker_A', 42.4, -4.2, 0.9, 10], ['gravemarker_B', 45.2, -3.6, 0.9, -12],
    ['skull', 46.4, -2.6, 0.45, 30], ['ribcage', 43.2, -2.9, 0.6, 40], ['bone_A', 41.6, -2.5, 0.9, 70], ['bone_B', 47.1, -2.4, 0.9, 10],
  ] as Array<[string, number, number, number, number]>) await putG(root, `${HAL}${n}.gltf`, x, z, { s, ry, y: -0.05 });

  // ---- variant dressing ---------------------------------------------------------
  if (v.extras.graves) {
    const stones: Array<[string, number, number, number, number]> = [
      ['gravestone', 16.6, -2.7, 0.8, 5], ['grave_A', 19.3, -2.9, 0.8, -8], ['gravemarker_B', 22.6, -2.8, 0.9, 12],
      ['gravestone', 28.4, -2.9, 0.8, -4], ['gravemarker_A', 35.6, -2.7, 0.9, 20], ['grave_B', 37.4, -3.0, 0.8, 0],
      ['gravestone', 41.0, -3.8, 0.9, 8], ['grave_A_destroyed', 42.8, -5.4, 0.9, -15], ['gravestone', 44.9, -5.8, 0.9, -6],
      ['coffin', 46.0, -3.5, 0.8, 80], ['gravemarker_A', 40.2, -3.3, 1.0, 6],
    ];
    for (const [n, x, z, sc, ry] of stones) await putG(root, `${HAL}${n}.gltf`, x, z, { s: sc, ry, y: -0.05 });
    await putG(root, `${HAL}tree_dead_large_decorated.gltf`, 26.9, -3.3, { s: 0.8, ry: 200 });
  }
  if (v.extras.burning) {
    const fireSpots: Array<[number, number, number, number]> = [
      [px(640), 3.4, -2.6, 1.5], [px(560), 3.3, -2.5, 1.2], [31.6, gy(31.6) + 1.6, -2.7, 1.6],
      [GATE_X + 0.4, WALL_H * 1.12 + 2.6, -4.2, 1.3], [17.0, gy(17) + 0.9, -2.5, 0.9], [38.6, gy(38.6) + 2.4, -3.4, 1.2],
    ];
    for (const [x, y, z, sc] of fireSpots) {
      const fp = project(x, y, z);
      b.torches.push({ x: Math.round(fp.x), y: Math.round(fp.y), scale: sc });
      b.glows.push({ x: Math.round(fp.x), y: Math.round(fp.y - 20), r: 300, color: '#ff6a18', a: 0.4 });
      b.points.push({ pos: [x, y + 0.6, z + 0.6], color: 0xff6a22, intensity: 3.5, distance: 12, decay: 2, jitter: 0.25, shadow: false });
    }
    const m = box(3.2, 3.0, 0.05, mat(0x0c0807, { opacity: 0.55 }));
    m.position.set(7.9, 2.0, FACE_Z + 0.03);
    m.castShadow = false;
    root.add(m);
  }

  const lair = await buildLair(v, b);
  return { b, lair };
}

// ---------------------------------------------------------------------------
// the demon lair
// ---------------------------------------------------------------------------

/** a soft radial glow painted into a texture, as an unlit plane facing +z */
function glowPlane(color: string, w: number, h: number, strength = 1): THREE.Mesh {
  const c = canvas(256, 256);
  const g = c.getContext('2d')!;
  const col = new THREE.Color(color).convertLinearToSRGB();
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  const gr = g.createRadialGradient(128, 170, 0, 128, 170, 150);
  gr.addColorStop(0, `rgba(${rgb},${0.95 * strength})`);
  gr.addColorStop(0.45, `rgba(${rgb},${0.45 * strength})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/** an arch-topped opening shape (centre bottom at the origin) */
function archShape(w: number, h: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[-w / 2, 0], [w / 2, 0]];
  const r = w / 2;
  const spring = h - r;
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    pts.push([Math.cos(a) * r, spring + Math.sin(a) * r]);
  }
  return pts;
}

function extrudeShape(pts: Array<[number, number]>, depth: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

async function buildLair(v: Variant, b: Built): Promise<{ x: number; y: number; w: number; h: number }> {
  const root = b.root;
  const L = v.lair;
  const R = rng(311);
  let ow: number;
  let oh: number;
  const glowCss = L.glow;
  const innerDark = mat(0x050405, { rough: 1, emissive: new THREE.Color(glowCss).multiplyScalar(0.12).getHex(), emissiveIntensity: 1 });
  if (L.kind === 'cave') {
    ow = 3.1;
    oh = 3.4;
    const tint = 0xc4bcb4;
    // a backstop of rock far behind (shows only between the crags)
    const face = box(16, 14, 0.6, stoneMat(0x5a5862));
    face.position.set(LX + 1.5, YV + 6.5, -10.5);
    root.add(face);
    // the tunnel: dark inside, the glow deep in it
    const tunnel = extrudeShape(archShape(ow, oh), 3.4, innerDark);
    tunnel.position.set(LX, YV - 0.05, -6.2);
    root.add(tunnel);
    const gp = glowPlane(glowCss, ow * 1.1, oh * 1.1, 0.9);
    gp.position.set(LX, YV + oh * 0.5, -2.75);
    root.add(gp);
    // the cliff: crags stacked in terraces that step back as they rise, the mouth left open
    const crags = ['mountain_A', 'mountain_B', 'mountain_C'];
    for (let r = 0; r < 5; r++) {
      const y = YV - 0.3 + r * 2.1;
      const z = -4.6 - r * 1.0;
      for (let x = LX - 6 + (r % 2) * 1.2 - r * 0.4; x < LX + 6; x += 2.4 + R() * 0.8) {
        if (r === 0 && Math.abs(x - LX) < 2.9) continue;
        const sc = 2.0 + R() * 0.9 - r * 0.1;
        await put(root, `${MED_N}${crags[Math.floor(R() * 3)]}.gltf`, x, z + (R() - 0.5) * 0.6, { y, s: sc, ry: R() * 360, tint });
      }
    }
    // the lintel over the mouth
    await put(root, `${MED_N}mountain_A.gltf`, LX, -5.0, { y: YV + oh - 0.25, s: 2.4, ry: 40, tint });
    // a rough rim of rocks around the mouth (sides and lintel)
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI;
      const rx = LX + Math.cos(a) * (ow / 2 + 0.35);
      const ry = YV + Math.max(0, oh - ow / 2 + Math.sin(a) * (ow / 2 + 0.3));
      await put(root, `${MED_N}${['rock_single_C', 'rock_single_D', 'rock_single_E'][i % 3]}.gltf`, rx, -2.8, { y: ry - 0.3, s: 3.2 + R() * 1.6, ry: R() * 360, rx: (R() - 0.5) * 30, tint });
    }
    for (const [x, z, s] of [[LX - 2.7, -2.5, 4.5], [LX + 2.5, -2.4, 3.8], [LX - 3.6, -2.0, 3]] as Array<[number, number, number]>) {
      await put(root, `${MED_N}rock_single_E.gltf`, x, z, { y: YV - 0.05, s, ry: R() * 360, tint });
    }
    await put(root, `${HAL}skull.gltf`, LX - 1.9, -2.0, { y: YV, s: 0.42, ry: 20 });
    await put(root, `${HAL}bone_C.gltf`, LX + 1.6, -1.9, { y: YV, s: 0.8, ry: 60 });
  } else {
    ow = 2.7;
    oh = 3.7;
    const keep = 0x584a56;
    const blk = 0x4a3c48;
    // the keep looms behind
    await put(root, `${MED_B}red/building_castle_red.gltf`, LX + 0.6, -11.5, { y: YV - 0.3, s: 2.6, tint: blk });
    // curtain wall with the gate
    await put(root, `${DUN}wall_doorway.glb`, LX, -3.95, { y: YV, s: [1.35, 1.22, 1], tint: keep });
    for (const x of [LX - 5.0, LX + 5.0]) await put(root, `${DUN}wall.gltf.glb`, x, -3.95, { y: YV, s: [0.95, 1.22, 1], tint: keep });
    merlons(root, LX - 7.2, LX + 7.6, YV + 4.88, -3.25, { d: 0.5, color: keep });
    // towers either side of the gate
    for (const x of [LX - 3.05, LX + 3.05]) await put(root, `${MED_B}red/building_tower_B_red.gltf`, x, -4.9, { y: YV, s: 3.0, tint: blk });
    // the gateway: dark passage, the glow inside, the portcullis drawn up, broken doors
    const tunnel = extrudeShape(archShape(ow, oh), 1.2, innerDark);
    tunnel.position.set(LX, YV - 0.05, -4.6);
    root.add(tunnel);
    const gp = glowPlane(glowCss, ow * 1.15, oh * 1.1, 1);
    gp.position.set(LX, YV + oh * 0.5, -3.3);
    root.add(gp);
    const iron = mat(0x1e1a1e, { metal: 0.5, rough: 0.55 });
    for (let i = 0; i < 8; i++) {
      const bar = box(0.08, 0.7, 0.08, iron);
      bar.position.set(LX - 1.05 + i * 0.3, YV + oh - 0.35, -3.35);
      root.add(bar);
      root.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), iron), LX - 1.05 + i * 0.3, YV + oh - 0.8, -3.35, 180, 0, 0));
    }
    for (const [dx, ry] of [[-1.6, 55], [1.7, -48]] as Array<[number, number]>) {
      const d = doorLeaf(1.3, 3.2, true);
      d.position.set(LX + dx, YV, -2.95);
      d.rotation.y = (ry * Math.PI) / 180;
      root.add(d);
    }
    // spikes, skulls on posts, torn banners
    const sm = mat(0x3a2a22);
    for (const x of [LX - 6.4, LX - 5.9, LX - 5.4, LX - 4.6, LX + 4.4, LX + 5.0, LX + 5.6, LX + 6.2]) {
      const st = stake(1.2 + R() * 0.5, sm);
      st.position.set(x, YV - 0.05, -2.75 + R() * 0.3);
      st.rotation.set(0.35, 0, (R() - 0.5) * 0.3);
      root.add(st);
    }
    for (const x of [LX - 2.1, LX + 2.2]) await put(root, `${HAL}post_skull.gltf`, x, -2.75, { y: YV, s: 0.62, ry: x < LX ? 90 : -90 });
    for (const x of [LX - 3.05, LX + 3.05]) {
      const cb = clothBanner(1.0, 2.6, 0x5a0f18, { torn: 0.7, seed: Math.round(x * 3) });
      cb.position.set(x, YV + 5.6, -3.0);
      root.add(cb);
    }
    // gate torches
    for (const x of [LX - 1.85, LX + 1.85]) await addTorch(v, b, x, YV + 2.5, -3.45);
    if (v.extras.burning) {
      for (const [x, y, sc] of [[LX - 3.05, YV + 7.6, 1.4], [LX + 3.05, YV + 7.4, 1.2]] as Array<[number, number, number]>) {
        const fp = project(x, y, -4.4);
        b.torches.push({ x: Math.round(fp.x), y: Math.round(fp.y), scale: sc });
        b.glows.push({ x: Math.round(fp.x), y: Math.round(fp.y - 20), r: 280, color: '#ff6a18', a: 0.35 });
      }
    }
  }
  // the opening's light falls out over the ground in front
  b.points.push({ pos: [LX, YV + 1.3, -2.6], color: L.light, intensity: 9, distance: 12, decay: 2, jitter: 0.3, shadow: true });
  b.points.push({ pos: [LX, YV + 0.8, -0.5], color: L.light, intensity: 4, distance: 8, decay: 2, jitter: 0.3 });
  const c = project(LX, YV + oh * 0.45, -3.2);
  return { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(ow * PPU), h: Math.round(oh * PPU * COS) };
}

// ---------------------------------------------------------------------------
// front layer: a dark low lip along the bottom of the screen
// ---------------------------------------------------------------------------

function buildFront(v: Variant) {
  const spec = BG_LAYERS.front;
  const R = rng(5);
  // layer x shows mid-screen when the camera scroll is (x - 640) / 1.2; the lip then sits ~16 px above the view bottom
  const top = (lx: number): number => VIEW_BOTTOM - 16 - spec.y + terrainPx(Math.max(0, (lx - 640) / spec.parallax) + 640);
  return {
    root: sceneRoot(),
    light: { sky: { color: 0x000000, intensity: 0 } } as LightingSpec,
    cam: { ppu: 75, originX: 0, groundY: GROUND_Y - spec.y } as LayerCam,
    passes: 1,
    paint: (g: CanvasRenderingContext2D, w: number, h: number): void => {
      const col = v.extras.burning ? '#0c0606' : '#08070c';
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) {
        const n = fbm(x * 0.01, 0.5, 3, 4);
        const hump = Math.max(0, smooth(0.55, 0.8, n)) * 14;
        g.lineTo(x, top(x) - hump - (R() < 0.08 ? 4 : 0));
      }
      g.lineTo(w, h);
      g.closePath();
      g.fill();
      // grass blades
      g.strokeStyle = col;
      g.lineWidth = 1.6;
      for (let i = 0; i < w / 5; i++) {
        const x = R() * w;
        const y = top(x) + 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (R() - 0.5) * 8, y - 6 - R() * 12);
        g.stroke();
      }
    },
  };
}
const VIEW_BOTTOM = 720;

// ---------------------------------------------------------------------------
// scene assembly
// ---------------------------------------------------------------------------

function lighting(v: Variant, b: Built): LightingSpec {
  return {
    sun: v.light.sun ? { ...v.light.sun, spread: 2.2 } : undefined,
    sky: v.light.sky,
    bounce: v.light.bounce,
    ambient: v.light.ambient,
    points: b.points,
    maxShadowedPoints: 6,
  };
}

async function build(v: Variant): Promise<BuiltScene> {
  const { b, lair } = await buildMain(v);
  const far = await buildFar(v);
  const front = buildFront(v);
  const mistLin = new THREE.Color(v.mist);
  const actors: PreviewActor[] = [
    { sprite: 'unit_swordsman', x: 360, row: 0 },
    { sprite: 'unit_swordsman', x: 700, row: 36 },
    { sprite: 'enemy_skeleton', x: 1150, row: -36, flip: true },
    { sprite: 'unit_swordsman', x: 1500, row: 0 },
    { sprite: 'enemy_skeleton', x: 1870, row: 0, flip: true },
    { sprite: 'unit_swordsman', x: 2450, row: 36 },
    { sprite: 'enemy_skeleton', x: 3050, row: 0, flip: true },
    { sprite: 'enemy_skeleton', x: 3550, row: -36, flip: true },
    { sprite: 'enemy_skeleton', x: 3820, row: 0, flip: true },
    { sprite: 'enemy_skeleton', x: 3950, row: 36, flip: true },
  ];
  const forge = project(px(600), 1.1, -2.9);
  return {
    sky: paintSky(v),
    far,
    main: {
      root: b.root,
      light: lighting(v, b),
      cam: { ppu: PPU, originX: 0, groundY: GROUND_Y },
      passes: 64,
      grade: { exposure: v.exposure ?? 1 },
      yRange: [-10, 14],
      zRange: [-14, 17],
      post: (p): void => {
        // anything below the road surface (the ravine, under the bridge) sinks into shade
        const under = gy(p.x) - p.y;
        if (under > 0.4) {
          const k = clamp01((under - 0.4) / 2.5) * 0.88;
          p.r *= 1 - k;
          p.g *= 1 - k;
          p.b *= 1 - k;
        }
        // chapter fog, a little heavier toward the lair; mist lying in the valley
        const low = Math.exp(-Math.max(p.y - gy(p.x), 0) * 0.55) * (0.45 + 0.55 * clamp01((p.z + 3.5) / 5));
        const t = clamp01(v.fog.amount * (0.35 + low * 1.4) + (p.lx > 3500 ? 0.06 : 0));
        p.r += (v.fog.color[0] - p.r) * t;
        p.g += (v.fog.color[1] - p.g) * t;
        p.b += (v.fog.color[2] - p.b) * t;
        const m = smooth(1.2, 3.6, -p.y) * clamp01((-p.z - 1) / 9) * (v.extras.mist ? 0.45 : 0.3);
        p.r += (mistLin.r * 0.6 - p.r) * m;
        p.g += (mistLin.g * 0.6 - p.g) * m;
        p.b += (mistLin.b * 0.6 - p.b) * m;
      },
      paint: (g, w, h) => {
        g.save();
        g.globalCompositeOperation = 'source-atop';
        if (v.extras.burning) {
          for (const t of b.torches.filter((q) => q.scale > 1.1)) {
            const sg = g.createLinearGradient(t.x, t.y, t.x + 10, t.y - 190);
            sg.addColorStop(0, 'rgba(8,4,4,0.5)');
            sg.addColorStop(1, 'rgba(8,4,4,0)');
            g.fillStyle = sg;
            g.fillRect(t.x - 55, t.y - 200, 110, 200);
          }
        }
        // the lair's light spills over the rock around the opening
        const lg = g.createRadialGradient(lair.x, lair.y, 0, lair.x, lair.y, 300);
        lg.addColorStop(0, hexA(v.lair.glow, 0.28));
        lg.addColorStop(1, hexA(v.lair.glow, 0));
        g.fillStyle = lg;
        g.fillRect(lair.x - 300, lair.y - 300, 600, 600);
        // the ground below the play band darkens toward the HUD (follows the terrain)
        for (let x = 0; x < w; x += 20) {
          const y0 = GROUND_Y + 30 + terrainPx(x + 10);
          const gr = g.createLinearGradient(0, y0, 0, y0 + 170);
          gr.addColorStop(0, 'rgba(10,6,12,0)');
          gr.addColorStop(1, 'rgba(10,6,12,0.55)');
          g.fillStyle = gr;
          g.fillRect(x, y0, 20, h - y0);
        }
        g.restore();
      },
    },
    front,
    anchors: {
      book: { x: 110, y: 470 },
      smith: { x: 640, y: 470 },
      forge: { x: Math.round(forge.x), y: Math.round(forge.y) },
      archers: [
        { x: 220, y: 156 },
        { x: 262, y: 156 },
      ],
      catapult: { x: 90, y: 150 },
      pit: { x: 410, y: 505, w: 70, h: 34 },
      torches: b.torches,
      glows: b.glows,
      lair: { x: lair.x, y: lair.y, w: lair.w, h: lair.h, kind: v.lair.kind, color: v.lair.glow, r: 220 },
    },
    grade: v.grade,
    actors,
  };
}

void hay;

for (const v of Object.values(VARIANTS)) defineScene({ id: v.id, chapter: v.chapter, build: () => build(v) });
