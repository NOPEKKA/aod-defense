/**
 * The castle courtyard (ART_BIBLE 6.1) in five lighting / dressing variants (6.3).
 * World units: x = logical px / 75, ground y = 0, back wall front face at z = -3.5.
 */
import * as THREE from 'three';
import { defineScene, project, projectCam, type BuiltScene, type FlameAnchor, type GlowAnchor, type LayerCam, type LightingSpec, type PointLightSpec, type PreviewActor } from '../scene';
import { PPU } from '../sprite';
import {
  anvil, at, box, canvas, cart, clamp01, clothBanner, cone, ctx2d, cyl, doorLeaf, DUN, fbm, groundTexture, hay, HAL, linOf, mat, MED_B, MED_N, merlons, mix, put, rng, slab, smooth, STONE, stoneMat, thatchTexture, weaponRack, WOOD,
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

interface Variant {
  id: string;
  chapter: number;
  sky: Sky;
  light: { sun: { dir: [number, number, number]; color: number; intensity: number } | null; sky: { color: number; intensity: number }; bounce: { color: number; intensity: number }; ambient: { color: number; intensity: number } };
  torch: { color: number; intensity: number; glow: string; glowA: number };
  /** far layer haze colour (sRGB css) and strength */
  haze: { color: string; a: number };
  fog: { color: [number, number, number]; amount: number };
  grade: { spriteTint: string; fog: number; weather: 'none' | 'rain' | 'embers' | 'fog' };
  extras: { burning?: boolean; graves?: boolean; mist?: boolean; wet?: boolean };
  exposure?: number;
}

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
    glow: { x: 1000, y: 230, r: 620, color: '#ffb868', a: 0.55 },
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
  fog: { color: [0.25, 0.14, 0.2], amount: 0.0 },
  grade: { spriteTint: '#ffe2c4', fog: 0.05, weather: 'none' },
  extras: {},
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
    glow: { x: 800, y: 120, r: 520, color: '#9ab0d8', a: 0.3 },
    stars: 0,
    clouds: { n: 22, color: '#10141f', a: 0.9, y0: 10, y1: 200 },
  },
  light: {
    sun: { dir: [0.2, 0.7, 0.6], color: 0x9ab4e8, intensity: 0.7 },
    sky: { color: 0x7488b8, intensity: 0.95 },
    bounce: { color: 0x2c3a4c, intensity: 0.3 },
    ambient: { color: 0x44506e, intensity: 0.55 },
  },
  torch: { color: 0xffa550, intensity: 6.5, glow: '#ffa550', glowA: 0.3 },
  haze: { color: '#34405a', a: 0.7 },
  fog: { color: [0.08, 0.1, 0.16], amount: 0.2 },
  grade: { spriteTint: '#c4d0e8', fog: 0.2, weather: 'rain' },
  extras: { wet: true },
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
    glow: { x: 1050, y: 110, r: 480, color: '#7fa6ff', a: 0.28 },
    moon: { x: 1040, y: 52, r: 42, color: '#e8f0ff', halo: 'rgba(120,160,255,0.35)' },
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
  fog: { color: [0.05, 0.08, 0.2], amount: 0.1 },
  grade: { spriteTint: '#c8d8ff', fog: 0.1, weather: 'none' },
  extras: {},
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
    glow: { x: 700, y: 230, r: 800, color: '#ff7a24', a: 0.6 },
    stars: 0,
    clouds: { n: 16, color: '#150a0c', a: 0.85, y0: 20, y1: 200 },
  },
  light: {
    sun: { dir: [-0.2, 0.35, 0.8], color: 0xff7a38, intensity: 0.5 },
    sky: { color: 0xa05a58, intensity: 0.6 },
    bounce: { color: 0x7a3418, intensity: 0.4 },
    ambient: { color: 0x40282e, intensity: 0.3 },
  },
  torch: { color: 0xff8a2a, intensity: 3.5, glow: '#ff7a1e', glowA: 0.4 },
  haze: { color: '#a8381c', a: 0.65 },
  fog: { color: [0.14, 0.05, 0.04], amount: 0.2 },
  grade: { spriteTint: '#ffc8a0', fog: 0.15, weather: 'embers' },
  extras: { burning: true },
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
    glow: { x: 900, y: 120, r: 560, color: '#ff3040', a: 0.4 },
    moon: { x: 880, y: 56, r: 50, color: '#d83a36', halo: 'rgba(220,40,50,0.4)' },
    stars: 90,
    clouds: { n: 8, color: '#2a0c1c', a: 0.7, y0: 40, y1: 190 },
  },
  light: {
    sun: { dir: [0.35, 0.55, 0.7], color: 0xff5a54, intensity: 1.1 },
    sky: { color: 0xa0508c, intensity: 0.9 },
    bounce: { color: 0x4a2040, intensity: 0.35 },
    ambient: { color: 0x5a3070, intensity: 0.6 },
  },
  torch: { color: 0xffa04a, intensity: 5, glow: '#ff9040', glowA: 0.3 },
  haze: { color: '#6a2a70', a: 0.65 },
  fog: { color: [0.16, 0.07, 0.2], amount: 0.16 },
  grade: { spriteTint: '#e8b8e8', fog: 0.3, weather: 'fog' },
  extras: { graves: true, mist: true },
};

export const VARIANTS: Record<string, Variant> = { courtyard_dusk: DUSK, courtyard_storm: STORM, courtyard_night: NIGHT, courtyard_fire: FIRE, courtyard_bloodmoon: BLOOD };


// ---------------------------------------------------------------------------
// layout (world units)
// ---------------------------------------------------------------------------

const WALL_Z = -4; // wall centre; front face at -3.5
const FACE_Z = -3.5;
const WALL_H = 4;
const WORLD_UNITS = 2560 / PPU;
const px = (v: number): number => v / PPU;

function sceneRoot(): THREE.Group {
  return new THREE.Group();
}

// ---------------------------------------------------------------------------
// sky
// ---------------------------------------------------------------------------

function paintSky(v: Variant) {
  return (g: CanvasRenderingContext2D, w: number, h: number): void => {
    const s = v.sky;
    const gr = g.createLinearGradient(0, 0, 0, h * 0.55);
    for (const [t, c] of s.stops) gr.addColorStop(t, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // below the horizon keep filling with the last stop (hidden by the wall anyway)
    const R = rng(11);
    for (let i = 0; i < s.stars; i++) {
      const x = R() * w;
      const y = R() * h * 0.4;
      const a = (0.25 + R() * 0.75) * (1 - y / (h * 0.45));
      g.fillStyle = `rgba(255,250,235,${a.toFixed(2)})`;
      const r = R() < 0.1 ? 1.8 : 1;
      g.fillRect(x, y, r, r);
    }
    const gl = s.glow;
    const gg = g.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, gl.r);
    gg.addColorStop(0, hexA(gl.color, gl.a));
    gg.addColorStop(1, hexA(gl.color, 0));
    g.fillStyle = gg;
    g.fillRect(0, 0, w, h);
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
      // maria
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
    // clouds: soft stacked ellipses, flattened
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

function hexA(css: string, a: number): string {
  const c = new THREE.Color(css).convertLinearToSRGB();
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

// ---------------------------------------------------------------------------
// far layer: silhouettes behind the wall
// ---------------------------------------------------------------------------

const FAR_CAM: LayerCam = { ppu: 50, originX: 0, groundY: 285 };

async function buildFar(v: Variant) {
  const root = sceneRoot();
  const R = rng(41);
  const W = 1940 / FAR_CAM.ppu;
  // rolling hills along the back
  for (let x = -2; x < W + 4; x += 5.5 + R() * 2) {
    const h = ['hills_A', 'hills_B', 'hills_C'][Math.floor(R() * 3)];
    await put(root, `${MED_N}${h}_trees.gltf`, x, -30 - R() * 6, { s: 6 + R() * 2, ry: R() * 360, y: -0.4 });
  }
  // distant towers and keeps
  const towers: Array<[string, number, number, number]> = [
    [`${MED_B}blue/building_tower_A_blue.gltf`, 4, 2.6, -14],
    [`${MED_B}blue/building_castle_blue.gltf`, 9.5, 1.9, -22],
    [`${MED_B}blue/building_tower_B_blue.gltf`, 15, 2.5, -13],
    [`${MED_B}blue/building_church_blue.gltf`, 21, 2.2, -18],
    [`${MED_B}blue/building_tower_A_blue.gltf`, 27, 2.9, -12],
    [`${MED_B}blue/building_tower_catapult_blue.gltf`, 32.5, 2.4, -15],
    [`${MED_B}blue/building_tower_A_blue.gltf`, 37, 2.2, -16],
  ];
  for (const [url, x, s, z] of towers) await put(root, url, x, z, { s: s * 1.5, ry: (R() - 0.5) * 30, color: undefined });
  for (let x = 0; x < W; x += 1.6 + R() * 1.6) {
    const t = ['tree_dead_large', 'tree_pine_orange_large', 'tree_pine_yellow_medium', 'tree_dead_medium'][Math.floor(R() * 4)];
    await put(root, `${HAL}${t}.gltf`, x, -9 - R() * 8, { s: 1.6 + R() * 1.1, ry: R() * 360 });
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
    yRange: [-1, 25] as [number, number],
    zRange: [-45, 6] as [number, number],
    grade: { saturation: 0.95 },
    paint: (g: CanvasRenderingContext2D, w: number, h: number): void => {
      // atmospheric haze: strongest low, fades upward
      g.save();
      g.globalCompositeOperation = 'source-atop';
      const gr = g.createLinearGradient(0, 40, 0, 240);
      gr.addColorStop(0, hexA(v.haze.color, v.haze.a * 0.45));
      gr.addColorStop(1, hexA(v.haze.color, Math.min(1, v.haze.a * 1.15)));
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
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
  // torch_mounted model: bracket protrudes +z
  await put(t, `${DUN}torch_mounted.gltf.glb`, 0, 0, { shadow: false });
  const fp = project(x, y + 0.55, z + 0.45);
  b.torches.push({ x: Math.round(fp.x), y: Math.round(fp.y), scale: 1 });
  b.glows.push({ x: Math.round(fp.x), y: Math.round(fp.y - 14), r: 230, color: v.torch.glow, a: v.torch.glowA });
  b.points.push({ pos: [x, y + 0.7, z + 0.55], color: v.torch.color, intensity: v.torch.intensity, distance: 16, decay: 2, jitter: 0.12, shadow });
}

async function buildMain(v: Variant) {
  const root = sceneRoot();
  const b: Built = { root, torches: [], glows: [], points: [] };
  const R = rng(77);
  const stone = stoneMat(STONE.face);

  // ---- ground -----------------------------------------------------------
  const gt = groundTexture({ x0: -3, x1: WORLD_UNITS + 3, z0: -3.6, z1: 11, ppuX: 40, ppuZ: 40, wallZ: -3.5, laneZ0: -1.5, laneZ1: 1.7, seed: 7 });
  const gm = new THREE.MeshStandardMaterial({ map: gt.map, normalMap: gt.normal, roughness: 1, metalness: 0 });
  gm.normalScale.set(0.9, 0.9);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_UNITS + 6, 14.6), gm);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD_UNITS / 2, 0, (-3.6 + 11) / 2);
  ground.receiveShadow = true;
  // texture v runs along z: flipY=false and plane uv v up = -z after rotation; flip via repeat
  gt.map.repeat.set(1, 1);
  root.add(ground);
  // dark backdrop behind the wall (arches look into shade) and an outer field at the breach
  const void_ = box(WORLD_UNITS + 4, WALL_H + 0.2, 0.2, 0x15121c);
  void_.position.set(WORLD_UNITS / 2, WALL_H / 2, -6.6);
  void_.castShadow = false;
  root.add(void_);
  const innerFloor = box(WORLD_UNITS + 4, 0.1, 3.2, 0x1b1620);
  innerFloor.position.set(WORLD_UNITS / 2, -0.06, -5.2);
  root.add(innerFloor);

  // ---- back wall --------------------------------------------------------
  type Seg = { x: number; kind: string; sx?: number };
  const segs: Seg[] = [
    { x: 1.2, kind: 'wall_arched', sx: 0.6 },
    { x: 3.55, kind: 'wall_doorway.glb', sx: 0.5 },
    { x: 5.55, kind: 'wall', sx: 0.5 },
    { x: 8.5, kind: 'wall_cracked' },
    { x: 12.5, kind: 'wall_archedwindow_gated' },
    { x: 16.5, kind: 'wall' },
    { x: 20.5, kind: 'wall_archedwindow_open' },
    { x: 24.5, kind: 'wall_gated' },
    { x: 28.5, kind: 'wall_archedwindow_gated' },
    { x: 31.9, kind: 'wall_cracked', sx: 0.7 },
  ];
  for (const s of segs) {
    const url = s.kind.endsWith('.glb') ? `${DUN}${s.kind}` : `${DUN}${s.kind}.gltf.glb`;
    await put(root, url, s.x, WALL_Z, { s: [s.sx ?? 1, 1, 1] });
  }
  // end pieces and pillars at the seams
  for (const x of [-0.1, 2.45, 4.6, 6.5, 10.5, 14.5, 18.5, 22.5, 26.5, 30.5]) await put(root, `${DUN}wall_pillar.gltf.glb`, x, WALL_Z + 0.25, { s: [0.5, 1, 1] });
  // breach: low ruined stub and rubble
  await put(root, `${DUN}wall_broken.gltf.glb`, 33.4, WALL_Z, { s: [0.6, 1, 1] });
  await put(root, `${DUN}rubble_large.gltf.glb`, 33.0, -2.6, { s: 0.3, ry: 10 });
  await put(root, `${DUN}rubble_half.gltf.glb`, 31.6, -2.3, { s: 0.4, ry: -20 });
  await put(root, `${DUN}rubble_half.gltf.glb`, 34.2, -1.7, { s: 0.35, ry: 50 });

  // parapet along the wall top
  merlons(root, -0.6, 32.2, WALL_H, FACE_Z + 0.2, { d: 0.5 });

  // gate house tower above the gate
  await put(root, `${MED_B}blue/building_tower_A_blue.gltf`, 3.3, WALL_Z - 0.4, { y: WALL_H - 0.1, s: 3.4 });
  await put(root, `${MED_B}blue/building_tower_B_blue.gltf`, 11.3, WALL_Z - 0.5, { y: WALL_H - 0.1, s: 3.0 });
  await put(root, `${MED_B}blue/building_tower_catapult_blue.gltf`, 1.2, WALL_Z - 0.2, { y: WALL_H - 0.05, s: 2.4 });
  await put(root, `${MED_B}blue/building_tower_A_blue.gltf`, 21.2, WALL_Z - 0.5, { y: WALL_H - 0.1, s: 3.2 });
  await put(root, `${MED_B}blue/building_tower_A_blue.gltf`, 30.2, WALL_Z - 0.5, { y: WALL_H - 0.1, s: 3.0, tint: 0xb89aa0 });

  // ---- stairs (unit spawn at x = 350 px) ---------------------------------
  await put(root, `${DUN}stairs.gltf.glb`, px(350) + 0.1, FACE_Z + 0.02, { s: [0.38, 0.78, 0.5], ry: 0 });

  // ---- torches every few metres ------------------------------------------
  const torchXs = [0.6, 2.0, 5.2, 6.9, 10.2, 13.2, 16.0, 19.0, 22.0, 25.2, 28.0, 30.8, 33.0];
  for (const [i, x] of torchXs.entries()) await addTorch(v, b, x, 2.2, FACE_Z, i % 3 === 1);
  // banners: blue on our side, torn red at the breach
  for (const x of [4.45, 9.9, 14.5, 18.0, 23.2, 26.6]) await put(root, `${DUN}banner_${R() < 0.5 ? 'thin' : 'patternA'}_blue.gltf.glb`, x, FACE_Z - 0.4, { y: 0.3, s: 1.05 });
  for (const x of [2.45, 4.7]) await put(root, `${DUN}banner_blue.gltf.glb`, x, FACE_Z - 0.4, { y: 0.1, s: 1.0 });
  for (const x of [31.0, 33.9]) {
    const cb = clothBanner(1.1, 2.6, 0x7a1f26, { torn: 0.7, seed: x | 0 });
    cb.position.set(x, 3.4, FACE_Z + 0.2);
    root.add(cb);
  }

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
  const pitZ0 = (505 - 520) / (Math.sin((20 * Math.PI) / 180) * PPU);
  const pitZ1 = (505 + 34 - 520) / (Math.sin((20 * Math.PI) / 180) * PPU);
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

  // ---- smithy (520 - 760 px) ------------------------------------------------
  const sx0 = px(520);
  const sx1 = px(760);
  const scx = (sx0 + sx1) / 2;
  const sw = sx1 - sx0 + 0.4;
  const thatch = thatchTexture(3, v.extras.burning ? 1 : 0);
  const roofM = new THREE.MeshStandardMaterial({ map: thatch, roughness: 1 });
  const dark = mat(WOOD.dark);
  const wood = mat(WOOD.mid);
  const frontZ = -1.55;
  for (const x of [sx0 + 0.05, sx1 - 0.05]) {
    const p = box(0.22, 2.7, 0.22, dark);
    p.position.set(x, 1.35, frontZ);
    root.add(p);
  }
  // roof: slopes from the wall (high) to the front (low)
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
  const beam = box(sw + 0.1, 0.16, 0.2, wood);
  beam.position.set(scx, 2.62, frontZ);
  root.add(beam);
  // forge: stone block with a hood and a chimney through the roof
  const forgeX = px(600);
  const forge = box(1.5, 1.0, 0.95, stoneMat(STONE.mid));
  forge.position.set(forgeX, 0.5, -3.0);
  root.add(forge);
  const hood = box(1.2, 0.2, 0.8, stoneMat(STONE.dark));
  hood.position.set(forgeX, 2.25, -3.05);
  root.add(hood);
  const chim = box(0.7, 2.8, 0.6, stoneMat(STONE.face));
  chim.position.set(forgeX, 2.7, -3.15);
  root.add(chim);
  const coals = box(1.1, 0.06, 0.62, mat(0xff6a1a, { emissive: 0xff5a10, emissiveIntensity: 2.2 }));
  coals.position.set(forgeX, 1.03, -2.98);
  coals.castShadow = false;
  root.add(coals);
  b.points.push({ pos: [forgeX, 1.3, -2.55], color: 0xff7a22, intensity: 9, distance: 11, decay: 2, jitter: 0.15, shadow: true });
  // anvil, tub, tools
  const an = anvil();
  an.position.set(px(700), 0, -2.0);
  root.add(an);
  await put(root, `${DUN}barrel_large.gltf.glb`, sx1 + 0.15, -3.0, { s: 0.55 });
  await put(root, `${DUN}barrel_small.gltf.glb`, sx0 - 0.1, -2.8, { s: 0.8 });
  const rack = weaponRack(4);
  rack.position.set(px(560), 0, -3.2);
  rack.scale.setScalar(0.85);
  root.add(rack);
  // hanging horseshoes/lantern glow
  b.points.push({ pos: [px(640), 3.0, -1.3], color: 0xffb060, intensity: 4, distance: 8, decay: 2, jitter: 0.1 });

  // ---- yard dressing --------------------------------------------------------
  const barrel = async (x: number, z: number, s = 0.5, ry = 0): Promise<void> => void (await put(root, `${DUN}barrel_large.gltf.glb`, x, z, { s, ry }));
  await barrel(px(870), -2.9);
  await barrel(px(910), -2.7, 0.45);
  await put(root, `${DUN}crates_stacked.gltf.glb`, px(1000), -2.8, { s: 0.6, ry: 12 });
  await put(root, `${DUN}barrel_small_stack.gltf.glb`, px(1090), -2.9, { s: 0.7 });
  const rack2 = weaponRack(9);
  rack2.position.set(px(1230), 0, -3.2);
  root.add(rack2);
  const hb = hay(3);
  hb.position.set(px(1330), 0, -2.8);
  root.add(hb);
  const hb2 = hay(8);
  hb2.position.set(px(1345), 0.5, -2.85);
  root.add(hb2);
  await put(root, `${MED_B}blue/building_well_blue.gltf`, px(1560), -2.5, { s: 2.6 });
  const ct = cart({ load: 'hay' });
  ct.position.set(px(1850), 0, -2.6);
  ct.rotation.y = 0.2;
  root.add(ct);
  await barrel(px(2000), -2.9, 0.5);
  await put(root, `${DUN}crates_stacked.gltf.glb`, px(2090), -2.8, { s: 0.6, ry: -8 });
  await put(root, `${DUN}barrel_small.gltf.glb`, px(2200), -2.7, { s: 0.8 });

  // ---- breach details ---------------------------------------------------------
  for (const [x, z, ry] of [[32.4, -1.4, 30], [33.7, -2.0, -40]] as Array<[number, number, number]>) {
    const d = doorLeaf(1.5, 2.8, false);
    d.position.set(x, 0.12, z);
    d.rotation.set(-1.25, (ry * Math.PI) / 180, 0);
    d.rotation.order = 'YXZ';
    root.add(d);
  }
  b.points.push({ pos: [33.2, 1.0, -1.0], color: 0xa04a30, intensity: 3, distance: 8, decay: 2, jitter: 0.1 });


  // ---- variant dressing ---------------------------------------------------------
  if (v.extras.graves) {
    const stones: Array<[string, number, number, number, number]> = [
      ['gravestone', 14.2, -2.7, 0.9, 5], ['grave_A', 15.1, -2.4, 0.9, -8], ['gravemarker_B', 16.0, -2.9, 1.0, 12],
      ['gravestone', 20.0, -2.5, 0.9, -4], ['gravemarker_A', 21.0, -2.9, 1.0, 20], ['grave_B', 22.2, -2.5, 0.9, 0],
      ['gravestone', 26.1, -2.8, 0.9, 8], ['grave_A_destroyed', 27.4, -2.4, 0.9, -15], ['gravemarker_B', 28.3, -2.9, 1.0, -6],
      ['gravestone', 11.8, -2.3, 0.9, 10], ['coffin', 18.2, -2.2, 0.9, 80],
    ];
    for (const [n, x, z, sc, ry] of stones) await put(root, `${HAL}${n}.gltf`, x, z, { s: sc * 1.1, ry });
    await put(root, `${HAL}tree_dead_large.gltf`, 12.6, -2.9, { s: 0.9, ry: 20 });
    await put(root, `${HAL}tree_dead_large_decorated.gltf`, 24.0, -3.0, { s: 0.9, ry: 200 });
    await put(root, `${HAL}tree_dead_medium.gltf`, 30.0, -2.8, { s: 0.8, ry: 90 });
    await put(root, `${HAL}skull.gltf`, 19.5, -1.9, { s: 0.6 });
    await put(root, `${HAL}ribcage.gltf`, 29.1, -1.8, { s: 0.6, ry: 40 });
    await put(root, `${HAL}bone_A.gltf`, 13.4, -1.9, { s: 1.0, ry: 70 });
    await put(root, `${HAL}pumpkin_orange_jackolantern.gltf`, 25.3, -2.1, { s: 1.0 });
  }
  if (v.extras.burning) {
    for (const x of [px(1560), px(1850), px(2150)]) {
      const c = cart({ charred: true, load: 'hay' });
      c.position.set(x + 1.6, 0, -2.5);
      c.rotation.y = 0.3;
      root.add(c);
    }
    const fireSpots: Array<[number, number, number, number]> = [
      [px(1560) + 1.6, 1.6, -2.2, 1.7], [px(1850) + 1.6, 1.6, -2.4, 1.7], [px(2150) + 1.6, 1.6, -2.6, 1.7],
      [px(640), 3.4, -2.6, 1.5], [px(560), 3.3, -2.5, 1.2], [px(700), 3.2, -2.5, 1.3],
      [12.0, 4.2, -3.6, 1.4], [29.6, 4.3, -3.6, 1.6],
    ];
    for (const [x, y, z, sc] of fireSpots) {
      const fp = project(x, y, z);
      b.torches.push({ x: Math.round(fp.x), y: Math.round(fp.y), scale: sc });
      b.glows.push({ x: Math.round(fp.x), y: Math.round(fp.y - 20), r: 300, color: '#ff6a18', a: 0.4 });
      b.points.push({ pos: [x, y + 0.6, z + 0.6], color: 0xff6a22, intensity: 3.5, distance: 12, decay: 2, jitter: 0.25, shadow: false });
    }
    for (const x of [8.5, 12.5, 29.0]) {
      const m = box(3.2, 3.0, 0.05, mat(0x0c0807, { opacity: 0.55 }));
      m.position.set(x, 2.0, FACE_Z + 0.03);
      m.castShadow = false;
      root.add(m);
    }
  }

  return { b, gt };
}

// ---------------------------------------------------------------------------
// front layer
// ---------------------------------------------------------------------------

async function buildFront(v: Variant) {
  const root = sceneRoot();
  const R = rng(5);
  // dark posts with banner staves near the camera (z = +7.5 => screen y ~ 712)
  for (const x of [0.2, 17.0, 34.5]) {
    const post = cyl(0.12, 0.14, 7, 0x1a1418, 6);
    post.position.set(x, 3.5, 8.2);
    root.add(post);
  }
  // low parapet and barrels along the bottom edge
  const wall = box(WORLD_UNITS * 1.15, 0.9, 0.5, 0x211a22);
  wall.position.set(WORLD_UNITS / 2, 0.45, 10.6);
  root.add(wall);
  for (let x = 2; x < 42; x += 5 + R() * 5) await put(root, `${DUN}barrel_large.gltf.glb`, x, 9.2, { s: 0.7, color: 0x3a2c30 });
  return {
    root,
    light: { sun: undefined, sky: { color: 0x655070, intensity: 0.8 }, ambient: { color: 0x302838, intensity: 0.5 } } as LightingSpec,
    cam: { ppu: 75, originX: 0, groundY: 520 } as LayerCam,
    passes: 12,
    yRange: [-1, 9] as [number, number],
    zRange: [-4, 14] as [number, number],
  };
}

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
  const { b } = await buildMain(v);
  const far = await buildFar(v);
  const front = await buildFront(v);
  const sin = Math.sin((20 * Math.PI) / 180);
  const grade = { exposure: v.exposure ?? 1 };
  const actors: PreviewActor[] = [
    { sprite: 'unit_swordsman', x: 700, row: 36 },
    { sprite: 'unit_swordsman', x: 330, row: 0 },
    { sprite: 'enemy_skeleton', x: 1000, row: -36, flip: true },
    { sprite: 'enemy_skeleton', x: 1300, row: 0, flip: true },
    { sprite: 'unit_swordsman', x: 1400, row: 36 },
    { sprite: 'enemy_skeleton', x: 2300, row: 0, flip: true },
  ];
  void sin;
  void smooth;
  void clamp01;
  void fbm;
  void cone;
  void slab;
  void at;
  void linOf;
  void canvas;
  void ctx2d;
  void projectCam;
  return {
    sky: paintSky(v),
    far,
    main: {
      root: b.root,
      light: lighting(v, b),
      cam: { ppu: PPU, originX: 0, groundY: 520 },
      passes: 64,
      grade,
      yRange: [-1, 14],
      zRange: [-12, 11],
      post: v.fog.amount > 0
        ? (p): void => {
            const low = Math.exp(-Math.max(p.y, 0) * 0.55) * (0.45 + 0.55 * clamp01((p.z + 3.5) / 5));
            const t = clamp01(v.fog.amount * (0.35 + low * 1.4) + (p.lx > 2380 ? 0.12 : 0));
            p.r += (v.fog.color[0] - p.r) * t;
            p.g += (v.fog.color[1] - p.g) * t;
            p.b += (v.fog.color[2] - p.b) * t;
          }
        : undefined,
      paint: (g, w, h) => {
        if (v.extras.burning) {
          g.save();
          g.globalCompositeOperation = 'source-atop';
          for (const t of b.torches.filter((q) => q.scale > 1.1)) {
            const sg = g.createLinearGradient(t.x, t.y, t.x + 10, t.y - 190);
            sg.addColorStop(0, 'rgba(8,4,4,0.5)');
            sg.addColorStop(1, 'rgba(8,4,4,0)');
            g.fillStyle = sg;
            g.fillRect(t.x - 55, t.y - 200, 110, 200);
          }
          g.restore();
        }
        g.save();
        g.globalCompositeOperation = 'source-atop';
        const gr = g.createLinearGradient(0, 540, 0, 720);
        gr.addColorStop(0, 'rgba(10,6,12,0)');
        gr.addColorStop(1, 'rgba(10,6,12,0.55)');
        g.fillStyle = gr;
        g.fillRect(0, 540, w, h - 540);
        g.restore();
      },
    },
    front,
    anchors: {
      book: { x: 110, y: 470 },
      smith: { x: 640, y: 470 },
      forge: { x: Math.round(project(px(600), 1.1, -2.9).x), y: Math.round(project(px(600), 1.1, -2.9).y) },
      archers: [
        { x: 220, y: 156 },
        { x: 262, y: 156 },
      ],
      catapult: { x: 90, y: 150 },
      pit: { x: 410, y: 505, w: 70, h: 34 },
      torches: b.torches,
      glows: b.glows,
    },
    grade: v.grade,
    actors,
  };
}

for (const v of Object.values(VARIANTS)) defineScene({ id: v.id, chapter: v.chapter, build: () => build(v) });
