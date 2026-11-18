/**
 * Background baker: a 3D scene (plus a painted sky) -> the four parallax layers of
 * docs/ART_BIBLE.md section 6.2, tiled WebP at hd (1.5x) and sd (1x), a meta JSON in the
 * shape of src/render/assets/library.ts `BgMeta`, and a composited preview.
 *
 * Camera: orthographic, pitched down PITCH degrees like the sprites. For the `main` layer a
 * world point (x, 0, 0) lands on logical pixel (x * PPU, 520). Each 3D layer has its own
 * LayerCam (px per unit, origin, ground line), so far scenery can be built at a smaller scale.
 *
 * Lighting is accumulated over many passes (engine.accumulate): per pass the sun/moon key
 * light is jittered inside a cone (soft shadows), one shadowed "sky" light samples the upper
 * hemisphere (ambient occlusion), and point lights (torches, forge, fires) are jittered inside
 * a small sphere. Flames themselves are NOT baked: the game draws them at exported anchors.
 */
import * as THREE from 'three';
import { DEFAULT_GRADE, downsample, toCanvas, toImageData, type GradeOpts, type ImageF } from './engine';
import { MASTER, PITCH, PPU, SCALES } from './sprite';
import { engine, jsonFile, pngFile, webpFile, type OutFile } from './studio';
import balance from '../../../data/balance.json';
import { terrainAt } from '../../../src/core/terrain';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export type LayerId = 'sky' | 'far' | 'main' | 'front';

/** the battlefield (data/balance.json world): art and gameplay read the same numbers */
export const WORLD_W: number = balance.world.width;
export const VIEW_H = 720;
export const GROUND_Y: number = balance.world.groundY;
const TERRAIN_DATA = { balance } as unknown as Parameters<typeof terrainAt>[0];
/** px the ground at world x lies below GROUND_Y (core/terrain.ts, the gameplay curve) */
export function terrainPx(x: number): number {
  return terrainAt(TERRAIN_DATA, x);
}
const TERRAIN_MAX = Math.max(0, ...((balance.world as { terrain?: Array<[number, number]> }).terrain ?? []).map((p) => p[1]));
/** deepest the battle camera may scroll down (px): the lowest ground plus a margin */
export const SCROLL_Y_MAX = TERRAIN_MAX + 30;
const VIEW_W_MIN = 1280;
const VIEW_W_MAX = 1600;

export interface LayerSpec {
  parallax: number;
  /** vertical scroll factor (the battle camera follows the ground down) */
  parallaxY: number;
  /** layer top in logical px (the image is placed at this y) */
  y: number;
  w: number;
  h: number;
  tileW: number;
  over?: boolean;
}

/**
 * Layer geometry (ART_BIBLE 6.2), sized so no empty edge shows at any view width (1280..1600)
 * and any camera scroll: x up to WORLD_W - viewW, y from 0 down to SCROLL_Y_MAX.
 */
function layerSpecs(): Record<LayerId, LayerSpec> {
  const need = (par: number): number => Math.max(...[VIEW_W_MIN, VIEW_W_MAX].map((vw) => par * (WORLD_W - vw) + vw));
  const r10 = (v: number): number => Math.ceil(v / 10) * 10;
  const tiles = (w: number, maxTile: number): number => r10(w / Math.ceil(w / maxTile));
  const skyY = 0.08;
  const farY = 0.4;
  const farW = r10(need(0.35));
  const frontW = r10(need(1.2));
  return {
    sky: { parallax: 0, parallaxY: skyY, y: -40, w: 1600, h: r10(VIEW_H + 40 + skyY * SCROLL_Y_MAX), tileW: 1600 },
    far: { parallax: 0.35, parallaxY: farY, y: 0, w: farW, h: r10(VIEW_H + farY * SCROLL_Y_MAX), tileW: farW },
    main: { parallax: 1, parallaxY: 1, y: 0, w: WORLD_W, h: r10(VIEW_H + SCROLL_Y_MAX), tileW: tiles(WORLD_W, 2400) },
    // only a low edge along the bottom of the screen: the image starts well below the play band
    front: { parallax: 1.2, parallaxY: 1, y: 560, w: frontW, h: r10(VIEW_H + SCROLL_Y_MAX - 560), tileW: tiles(frontW, 2400), over: true },
  };
}
export const BG_LAYERS: Record<LayerId, LayerSpec> = layerSpecs();

export interface PointLightSpec {
  pos: [number, number, number];
  color: number | string;
  /** candela (three.js physical units) */
  intensity: number;
  /** cutoff distance in world units (0 = none) */
  distance?: number;
  decay?: number;
  /** jitter radius for soft shadows (world units) */
  jitter?: number;
  shadow?: boolean;
}

export interface LightingSpec {
  /** key light (sun / moon): direction TO the light */
  sun?: { dir: [number, number, number]; color: number | string; intensity: number; spread?: number };
  /** shadowed hemisphere light (gives ambient occlusion) */
  sky: { color: number | string; intensity: number };
  /** unshadowed hemisphere bounce from below */
  bounce?: { color: number | string; intensity: number };
  /** flat unshadowed fill */
  ambient?: { color: number | string; intensity: number };
  points?: PointLightSpec[];
  /** at most this many shadowed point lights per render chunk (default 8) */
  maxShadowedPoints?: number;
}

export interface LayerCam {
  /** logical px per world unit */
  ppu: number;
  /** world x at layer px 0 */
  originX: number;
  /** layer px y of the world point (x, 0, 0) */
  groundY: number;
  /** degrees (default PITCH) */
  pitch?: number;
}

/** reused per-pixel record handed to Layer3D.post (straight, linear colour) */
export interface PostPixel {
  r: number;
  g: number;
  b: number;
  a: number;
  /** world position of the surface */
  x: number;
  y: number;
  z: number;
  /** layer logical px */
  lx: number;
  ly: number;
}

export interface Layer3D {
  root: THREE.Object3D;
  light: LightingSpec;
  cam: LayerCam;
  /** accumulation passes (default 64) */
  passes?: number;
  grade?: Partial<GradeOpts>;
  /** per-pixel post in linear space with the world position (fog, soot, haze) */
  post?: (p: PostPixel) => void;
  /** 2D overlay after tone mapping; g is scaled so 1 unit = 1 logical px */
  paint?: (g: CanvasRenderingContext2D, w: number, h: number) => void;
  /** world-space y/z extent used to fit shadow cameras (x is taken from the chunk) */
  yRange?: [number, number];
  zRange?: [number, number];
}

export interface FlameAnchor {
  x: number;
  y: number;
  scale: number;
}
export interface GlowAnchor {
  x: number;
  y: number;
  r: number;
  color: string;
  a: number;
}

export interface BgGrade {
  spriteTint: string;
  fog: number;
  weather: 'none' | 'rain' | 'embers' | 'fog';
}

export interface PreviewActor {
  sprite: string;
  /** world logical px */
  x: number;
  /** lane row offset px (-36, 0, 36) */
  row: number;
  frame?: string;
  /** draw mirrored */
  flip?: boolean;
}

export interface BuiltScene {
  /** paint the sky into g (scaled: 1 unit = 1 logical px; y 0 = the view top at scroll 0; the layer starts at BG_LAYERS.sky.y) */
  sky: (g: CanvasRenderingContext2D, w: number, h: number) => void;
  far?: Layer3D;
  main: Layer3D;
  front?: Layer3D;
  anchors: {
    book: { x: number; y: number };
    smith: { x: number; y: number };
    forge: { x: number; y: number };
    archers: Array<{ x: number; y: number }>;
    catapult: { x: number; y: number };
    pit: { x: number; y: number; w: number; h: number };
    torches: FlameAnchor[];
    glows: GlowAnchor[];
    [k: string]: unknown;
  };
  grade: BgGrade;
  actors?: PreviewActor[];
}

export interface SceneDef {
  id: string;
  chapter: number;
  build: () => Promise<BuiltScene>;
}

const scenes = new Map<string, SceneDef>();
export function defineScene(def: SceneDef): void {
  if (scenes.has(def.id)) throw new Error(`scene "${def.id}" defined twice`);
  scenes.set(def.id, def);
}
export function sceneIds(): string[] {
  return [...scenes.keys()];
}
export function getScene(id: string): SceneDef {
  const s = scenes.get(id);
  if (!s) throw new Error(`unknown scene "${id}" (have: ${sceneIds().join(', ')})`);
  return s;
}

// ---------------------------------------------------------------------------
// projection
// ---------------------------------------------------------------------------

const SIN = Math.sin((PITCH * Math.PI) / 180);
const COS = Math.cos((PITCH * Math.PI) / 180);

/** main-layer logical px of a world point */
export function project(x: number, y: number, z: number): { x: number; y: number } {
  return { x: x * PPU, y: GROUND_Y - (y * COS - z * SIN) * PPU };
}
/** world z of a ground point (y = 0) shown at main-layer logical y */
export function groundZ(screenY: number): number {
  return (screenY - GROUND_Y) / (SIN * PPU);
}
/** project for any layer camera */
export function projectCam(c: LayerCam, x: number, y: number, z: number): { x: number; y: number } {
  const p = ((c.pitch ?? PITCH) * Math.PI) / 180;
  return { x: (x - c.originX) * c.ppu, y: c.groundY - (y * Math.cos(p) - z * Math.sin(p)) * c.ppu };
}

function halton(i: number, base: number): number {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

// ---------------------------------------------------------------------------
// light rig
// ---------------------------------------------------------------------------

const _v = new THREE.Vector3();
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());

function fitDirectional(light: THREE.DirectionalLight, dir: THREE.Vector3, region: THREE.Box3): void {
  const c = region.getCenter(new THREE.Vector3());
  const r = region.getSize(_v).length() / 2;
  light.position.copy(c).addScaledVector(dir, r + 10);
  light.target.position.copy(c);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  const cam = light.shadow.camera as THREE.OrthographicCamera;
  cam.position.copy(light.position);
  cam.lookAt(c);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse;
  const { min, max } = region;
  let i = 0;
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) _corners[i++].set(x, y, z).applyMatrix4(inv);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of _corners) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  cam.left = x0;
  cam.right = x1;
  cam.bottom = y0;
  cam.top = y1;
  cam.near = Math.max(0.05, -z1 - 1);
  cam.far = -z0 + 1;
  cam.updateProjectionMatrix();
}

class SceneRig {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight | null = null;
  readonly sky = new THREE.DirectionalLight();
  readonly hemi = new THREE.HemisphereLight();
  readonly amb = new THREE.AmbientLight();
  private sunBase = new THREE.Vector3();
  private region = new THREE.Box3();
  private points: Array<{ spec: PointLightSpec; light: THREE.PointLight; base: THREE.Vector3 }> = [];

  constructor(private spec: LightingSpec) {
    const mk = (l: THREE.DirectionalLight, size: number): void => {
      l.castShadow = true;
      l.shadow.mapSize.set(size, size);
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.03;
      this.group.add(l, l.target);
    };
    if (spec.sun) {
      this.sun = new THREE.DirectionalLight(spec.sun.color, spec.sun.intensity);
      this.sunBase.fromArray(spec.sun.dir).normalize();
      mk(this.sun, 4096);
    }
    this.sky.color.set(spec.sky.color);
    this.sky.intensity = spec.sky.intensity * 2;
    mk(this.sky, 4096);
    this.hemi.color.set(0x000000);
    this.hemi.groundColor.set(spec.bounce?.color ?? 0x000000);
    this.hemi.intensity = spec.bounce?.intensity ?? 0;
    this.amb.color.set(spec.ambient?.color ?? 0xffffff);
    this.amb.intensity = spec.ambient?.intensity ?? 0;
    this.group.add(this.hemi, this.amb);
  }

  /** choose the point lights that matter for this chunk and fit the shadow region */
  setRegion(region: THREE.Box3): void {
    this.region.copy(region);
    for (const p of this.points) {
      this.group.remove(p.light);
      p.light.dispose();
    }
    this.points = [];
    const all = this.spec.points ?? [];
    const near = all.filter((s) => {
      const d = s.distance && s.distance > 0 ? s.distance : 30;
      return s.pos[0] > region.min.x - d && s.pos[0] < region.max.x + d;
    });
    const maxS = this.spec.maxShadowedPoints ?? 8;
    const cx = (region.min.x + region.max.x) / 2;
    const shadowed = near
      .filter((s) => s.shadow)
      .sort((a, b) => Math.abs(a.pos[0] - cx) - Math.abs(b.pos[0] - cx) || b.intensity - a.intensity)
      .slice(0, maxS);
    for (const s of near) {
      const l = new THREE.PointLight(s.color, s.intensity, s.distance ?? 0, s.decay ?? 2);
      const base = new THREE.Vector3().fromArray(s.pos);
      l.position.copy(base);
      if (shadowed.includes(s)) {
        l.castShadow = true;
        l.shadow.mapSize.set(1024, 1024);
        l.shadow.bias = -0.0015;
        l.shadow.normalBias = 0.02;
        l.shadow.camera.near = 0.05;
        l.shadow.camera.far = s.distance && s.distance > 0 ? s.distance : 25;
      }
      this.group.add(l);
      this.points.push({ spec: s, light: l, base });
    }
  }

  pointCount(): { all: number; shadowed: number } {
    return { all: this.points.length, shadowed: this.points.filter((p) => p.light.castShadow).length };
  }

  pass(k: number, K: number): void {
    if (this.sun && this.spec.sun) {
      const spread = this.spec.sun.spread ?? 2.5;
      const a = halton(k + 1, 5) * Math.PI * 2;
      const r = Math.sqrt(halton(k + 1, 7)) * Math.tan((spread * Math.PI) / 180);
      const up = Math.abs(this.sunBase.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const t1 = new THREE.Vector3().crossVectors(this.sunBase, up).normalize();
      const t2 = new THREE.Vector3().crossVectors(this.sunBase, t1);
      const d = this.sunBase.clone().addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).normalize();
      fitDirectional(this.sun, d, this.region);
    }
    // sky: uniform over the upper hemisphere (stratified in cos(theta), golden-angle azimuth)
    const y = (k + 0.5) / K;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = k * 2.399963229728653 + 0.7;
    fitDirectional(this.sky, new THREE.Vector3(Math.cos(phi) * rad, Math.max(y, 0.03), Math.sin(phi) * rad).normalize(), this.region);
    for (const p of this.points) {
      const j = p.spec.jitter ?? 0.08;
      // point in a sphere from three Halton sequences
      const u = halton(k + 3, 2) * 2 - 1;
      const th = halton(k + 3, 3) * Math.PI * 2;
      const rr = Math.cbrt(halton(k + 3, 5)) * j;
      const s = Math.sqrt(1 - u * u);
      p.light.position.set(p.base.x + rr * s * Math.cos(th), p.base.y + rr * u, p.base.z + rr * s * Math.sin(th));
    }
  }

  dispose(): void {
    for (const p of this.points) p.light.dispose();
    this.points = [];
    this.sky.shadow.dispose();
    this.sun?.shadow.dispose();
  }
}

// ---------------------------------------------------------------------------
// layer rendering
// ---------------------------------------------------------------------------

const posMat = new THREE.ShaderMaterial({
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: 'varying vec3 vW; void main(){ gl_FragColor = vec4(vW, 1.0); }',
  side: THREE.DoubleSide,
});

function layerCamera(c: LayerCam, x0: number, x1: number, h: number): THREE.OrthographicCamera {
  const p = ((c.pitch ?? PITCH) * Math.PI) / 180;
  const cam = new THREE.OrthographicCamera(c.originX + x0 / c.ppu, c.originX + x1 / c.ppu, c.groundY / c.ppu, (c.groundY - h) / c.ppu, 0.5, 400);
  cam.position.set(0, Math.sin(p), Math.cos(p)).multiplyScalar(150);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

export interface LayerImages {
  hd: HTMLCanvasElement;
  sd: HTMLCanvasElement;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function applyPost(img: ImageF, pos: ImageF, post: (p: PostPixel) => void, x0: number): void {
  const { width: w, height: h, data } = img;
  const P = pos.data;
  const px: PostPixel = { r: 0, g: 0, b: 0, a: 0, x: 0, y: 0, z: 0, lx: 0, ly: 0 };
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const i = (row * w + col) * 4;
      const a = data[i + 3];
      if (a <= 0.001) continue;
      const pa = P[i + 3];
      if (pa > 0.001) {
        px.x = P[i] / pa;
        px.y = P[i + 1] / pa;
        px.z = P[i + 2] / pa;
      }
      px.a = a;
      px.r = data[i] / a;
      px.g = data[i + 1] / a;
      px.b = data[i + 2] / a;
      px.lx = x0 + (col + 0.5) / MASTER;
      px.ly = (row + 0.5) / MASTER;
      post(px);
      data[i] = px.r * a;
      data[i + 1] = px.g * a;
      data[i + 2] = px.b * a;
    }
  }
}

/** Render one 3D layer in horizontal chunks; returns full-width hd and sd canvases. */
export function renderLayer(L: Layer3D, w: number, h: number, chunkW: number, log: (s: string) => void): LayerImages {
  const out: LayerImages = { hd: makeCanvas(w * SCALES.hd.scale, h * SCALES.hd.scale), sd: makeCanvas(w * SCALES.sd.scale, h * SCALES.sd.scale) };
  const scene = new THREE.Scene();
  const rig = new SceneRig(L.light);
  scene.add(rig.group, L.root);
  L.root.updateMatrixWorld(true);
  const passes = L.passes ?? 64;
  const grade: GradeOpts = { ...DEFAULT_GRADE, ...L.grade };
  const yR = L.yRange ?? [-2, 12];
  const zR = L.zRange ?? [-12, 10];
  for (let x0 = 0; x0 < w; x0 += chunkW) {
    const x1 = Math.min(w, x0 + chunkW);
    const cw = x1 - x0;
    const cam = layerCamera(L.cam, x0, x1, h);
    const wx0 = L.cam.originX + x0 / L.cam.ppu;
    const wx1 = L.cam.originX + x1 / L.cam.ppu;
    const margin = 7;
    rig.setRegion(new THREE.Box3(new THREE.Vector3(wx0 - margin, yR[0], zR[0]), new THREE.Vector3(wx1 + margin, yR[1], zR[1])));
    const t0 = performance.now();
    const img = engine.accumulate(scene, cam, cw * MASTER, h * MASTER, passes, (k, K) => rig.pass(k, K));
    if (L.post) {
      scene.overrideMaterial = posMat;
      const pos = engine.accumulate(scene, cam, cw * MASTER, h * MASTER, 4);
      scene.overrideMaterial = null;
      applyPost(img, pos, L.post, x0);
    }
    const pc = rig.pointCount();
    log(`  chunk ${x0}-${x1}: ${passes} passes, ${pc.all} point lights (${pc.shadowed} shadowed), ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    for (const s of ['hd', 'sd'] as const) {
      const { div, scale } = SCALES[s];
      const c = toCanvas(toImageData(downsample(img, div), grade));
      out[s].getContext('2d')!.drawImage(c, Math.round(x0 * scale), 0);
    }
  }
  rig.dispose();
  scene.remove(L.root, rig.group);
  if (L.paint) {
    for (const s of ['hd', 'sd'] as const) {
      const g = out[s].getContext('2d')!;
      g.save();
      g.scale(SCALES[s].scale, SCALES[s].scale);
      L.paint(g, w, h);
      g.restore();
    }
  }
  return out;
}

function paintSky(fn: BuiltScene['sky']): LayerImages {
  const { w, h, y } = BG_LAYERS.sky;
  const hd = makeCanvas(w * SCALES.hd.scale, h * SCALES.hd.scale);
  const g = hd.getContext('2d')!;
  g.save();
  g.scale(SCALES.hd.scale, SCALES.hd.scale);
  // the painter works in screen coordinates: 0 = the top of the view at scroll 0
  g.translate(0, -y);
  fn(g, w, h + y);
  g.restore();
  const sd = makeCanvas(w * SCALES.sd.scale, h * SCALES.sd.scale);
  const gs = sd.getContext('2d')!;
  gs.imageSmoothingQuality = 'high';
  gs.drawImage(hd, 0, 0, sd.width, sd.height);
  return { hd, sd };
}

// ---------------------------------------------------------------------------
// bake
// ---------------------------------------------------------------------------

export interface SpriteAtlas {
  meta: { anchorX: number; anchorY: number; frameW: number; frameH: number };
  json: { textures: Array<{ image: string; frames: Array<{ filename: string; frame: { x: number; y: number; w: number; h: number }; spriteSourceSize: { x: number; y: number; w: number; h: number } }> }> };
  /** data URLs of the hd pages, by image name */
  pages: Record<string, string>;
}

export interface BakeOpts {
  /** override passes for every 3D layer (quick looks) */
  passes?: number;
  /** only these layers (others are skipped, the meta is still complete) */
  layers?: LayerId[];
  /** sprites for the preview (hd atlases) */
  sprites?: Record<string, SpriteAtlas>;
  /** draw anchor markers in the preview */
  debug?: boolean;
  /** quality for opaque / alpha layers */
  qOpaque?: number;
  qAlpha?: number;
}

export interface BakeResult {
  files: OutFile[];
  meta: Record<string, unknown>;
  sizes: Record<string, number>;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const im = new Image();
  im.src = src;
  await im.decode();
  return im;
}

function b64len(b64: string): number {
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

export async function bakeScene(def: SceneDef, opts: BakeOpts, log: (s: string) => void): Promise<BakeResult> {
  const t0 = performance.now();
  const built = await def.build();
  log(`${def.id}: built in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  const want = (id: LayerId): boolean => !opts.layers || opts.layers.includes(id);
  const images: Partial<Record<LayerId, LayerImages>> = {};
  if (want('sky')) images.sky = paintSky(built.sky);
  const r3 = (id: 'far' | 'main' | 'front', L: Layer3D | undefined): void => {
    if (!L || !want(id)) return;
    const spec = BG_LAYERS[id];
    const t = performance.now();
    const LL = opts.passes ? { ...L, passes: opts.passes } : L;
    // render in chunks of at most ~1250 px: a 3x master of a whole 2000 px tile is a very large target
    const chunk = Math.ceil(spec.w / Math.ceil(spec.w / 1250));
    images[id] = renderLayer(LL, spec.w, spec.h, chunk, log);
    log(`${def.id}/${id}: ${((performance.now() - t) / 1000).toFixed(1)}s`);
  };
  r3('far', built.far);
  r3('main', built.main);
  r3('front', built.front);

  const files: OutFile[] = [];
  const sizes: Record<string, number> = {};
  const layersMeta: Array<Record<string, unknown>> = [];
  const tileUrls: Record<string, string[]> = {};
  const layerIds: LayerId[] = ['sky', 'far', 'main', 'front'];
  for (const id of layerIds) {
    const spec = BG_LAYERS[id];
    const present = id === 'sky' || id === 'main' || (id === 'far' && built.far) || (id === 'front' && built.front);
    if (!present) continue;
    const alpha = id !== 'sky';
    const tiles = Math.ceil(spec.w / spec.tileW);
    const lm: Record<string, unknown> = { id, parallax: spec.parallax, parallaxY: spec.parallaxY, y: spec.y, w: spec.w, h: spec.h, tileW: spec.tileW, tiles, alpha };
    if (spec.over) lm.over = true;
    layersMeta.push(lm);
    const img = images[id];
    if (!img) continue;
    for (const s of ['hd', 'sd'] as const) {
      const scale = SCALES[s].scale;
      for (let i = 0; i < tiles; i++) {
        const tw = Math.min(spec.tileW, spec.w - i * spec.tileW);
        const c = makeCanvas(Math.round(tw * scale), Math.round(spec.h * scale));
        c.getContext('2d')!.drawImage(img[s], -Math.round(i * spec.tileW * scale), 0);
        const f = webpFile(`public/assets/bg/${s}/${def.id}-${id}-${i}.webp`, c, alpha ? (opts.qAlpha ?? 0.86) : (opts.qOpaque ?? 0.88));
        files.push(f);
        sizes[`${s}/${id}-${i}`] = b64len(f.base64);
        if (s === 'hd') (tileUrls[id] ??= []).push(`data:image/webp;base64,${f.base64}`);
      }
    }
  }
  const meta = {
    id: def.id,
    chapter: def.chapter,
    worldW: WORLD_W,
    viewH: VIEW_H,
    /** how far the battle camera scrolls down at most; the layers are sized for it */
    scrollYMax: SCROLL_Y_MAX,
    layers: layersMeta,
    anchors: built.anchors,
    grade: built.grade,
  };
  files.push(jsonFile(`public/assets/bg/meta/${def.id}.json`, meta));

  // preview (only when every layer was baked)
  if (layerIds.every((id) => !layersMeta.find((l) => l.id === id) || tileUrls[id])) {
    const prev = await composePreview(meta, tileUrls, built, opts);
    files.push(pngFile(`output/bake/preview/bg_${def.id}.png`, prev));
    // each view on its own at full size (easier to inspect)
    for (let i = 0; i < prev.height / VIEW_H; i++) {
      const c = makeCanvas(prev.width, VIEW_H);
      c.getContext('2d')!.drawImage(prev, 0, -i * VIEW_H);
      files.push(pngFile(`output/bake/preview/bg_${def.id}_v${i}.png`, c));
    }
  }
  log(`${def.id}: done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  return { files, meta, sizes };
}

// ---------------------------------------------------------------------------
// preview
// ---------------------------------------------------------------------------

/** the battle camera's vertical scroll for a horizontal scroll (an estimate of the game's follow) */
export function previewScrollY(camX: number, viewW = 1280): number {
  return Math.max(0, Math.min(SCROLL_Y_MAX, terrainPx(camX + viewW / 2)));
}

async function composePreview(meta: { layers: Array<Record<string, unknown>>; anchors: BuiltScene['anchors'] }, tileUrls: Record<string, string[]>, built: BuiltScene, opts: BakeOpts): Promise<HTMLCanvasElement> {
  const VW = 1280;
  const xs = [0, 640, 1300, 2000, 2700, WORLD_W - VW];
  const views = xs.map((x) => ({ x, y: previewScrollY(x, VW) }));
  const out = makeCanvas(VW, VIEW_H * views.length);
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  const tiles: Record<string, HTMLImageElement[]> = {};
  for (const [id, urls] of Object.entries(tileUrls)) tiles[id] = await Promise.all(urls.map(loadImage));
  const sprites: Record<string, { atlas: SpriteAtlas; pages: Record<string, HTMLImageElement> }> = {};
  for (const [id, atlas] of Object.entries(opts.sprites ?? {})) {
    const pages: Record<string, HTMLImageElement> = {};
    for (const [name, url] of Object.entries(atlas.pages)) pages[name] = await loadImage(url);
    sprites[id] = { atlas, pages };
  }
  const drawLayer = (id: string, camX: number, camY: number, oy: number): void => {
    const lm = meta.layers.find((l) => l.id === id);
    if (!lm || !tiles[id]) return;
    const par = lm.parallax as number;
    const parY = (lm.parallaxY as number | undefined) ?? 0;
    const ly = (lm.y as number | undefined) ?? 0;
    const tileW = lm.tileW as number;
    tiles[id].forEach((im, i) => {
      const x = i * tileW - camX * par;
      g.drawImage(im, x, oy + ly - camY * parY, im.width / SCALES.hd.scale, im.height / SCALES.hd.scale);
    });
  };
  const drawSprite = (a: PreviewActor, camX: number, camY: number, oy: number, shadow: boolean): void => {
    const s = sprites[a.sprite];
    if (!s) return;
    const name = shadow ? 'shadow' : (a.frame ?? 'idle/0');
    for (const tex of s.atlas.json.textures) {
      const f = tex.frames.find((fr) => fr.filename === name);
      if (!f) continue;
      const im = s.pages[tex.image];
      const k = 1 / SCALES.hd.scale;
      const sx = a.x - camX;
      const gy = GROUND_Y + a.row + terrainPx(a.x) + oy - camY;
      g.save();
      if (shadow) g.globalAlpha = 0.45;
      g.translate(sx, gy);
      if (a.flip) g.scale(-1, 1);
      g.drawImage(im, f.frame.x, f.frame.y, f.frame.w, f.frame.h, -s.atlas.meta.anchorX + f.spriteSourceSize.x * k, -s.atlas.meta.anchorY + f.spriteSourceSize.y * k, f.frame.w * k, f.frame.h * k);
      g.restore();
      return;
    }
  };
  const A = meta.anchors;
  views.forEach(({ x: camX, y: camY }, vi) => {
    const oy = vi * VIEW_H;
    // world -> preview canvas
    const wx = (x: number): number => x - camX;
    const wy = (y: number): number => y - camY + oy;
    g.save();
    g.beginPath();
    g.rect(0, oy, VW, VIEW_H);
    g.clip();
    // magenta shows any gap between the layers
    g.fillStyle = '#ff00ff';
    g.fillRect(0, oy, VW, VIEW_H);
    drawLayer('sky', camX, camY, oy);
    drawLayer('far', camX, camY, oy);
    drawLayer('main', camX, camY, oy);
    // stand-in flames and glows (the game animates these)
    g.globalCompositeOperation = 'lighter';
    const lair = A['lair'] as { x: number; y: number; r?: number; color?: string } | undefined;
    const glows = [...A.glows, ...(lair ? [{ x: lair.x, y: lair.y, r: lair.r ?? 200, color: lair.color ?? '#7dff5a', a: 0.35 }] : [])];
    for (const gl of glows) {
      const x = wx(gl.x);
      const y = wy(gl.y);
      const gr = g.createRadialGradient(x, y, 0, x, y, gl.r);
      const c = new THREE.Color(gl.color).convertLinearToSRGB();
      const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
      gr.addColorStop(0, `rgba(${rgb},${gl.a})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(x - gl.r, y - gl.r, gl.r * 2, gl.r * 2);
    }
    const flame = (fx: number, fy: number, s: number): void => {
      const x = wx(fx);
      const y = wy(fy);
      const gr = g.createRadialGradient(x, y - 6 * s, 0, x, y - 6 * s, 16 * s);
      gr.addColorStop(0, 'rgba(255,240,170,0.95)');
      gr.addColorStop(0.4, 'rgba(255,150,40,0.7)');
      gr.addColorStop(1, 'rgba(255,90,10,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y - 8 * s, 8 * s, 17 * s, 0, 0, Math.PI * 2);
      g.fill();
    };
    for (const t of A.torches) flame(t.x, t.y, t.scale);
    flame(A.forge.x, A.forge.y, 1.3);
    g.globalCompositeOperation = 'source-over';
    // actors: lane rows back to front, shadows first
    const actors = [...(built.actors ?? [])].sort((a, b) => a.row - b.row);
    for (const a of actors) drawSprite(a, camX, camY, oy, true);
    for (const a of actors) drawSprite(a, camX, camY, oy, false);
    drawLayer('front', camX, camY, oy);
    g.font = '12px monospace';
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillText(`x ${camX} y ${Math.round(camY)}`, 8, oy + 16);
    if (opts.debug) {
      g.lineWidth = 2;
      const mark = (x: number, y: number, label: string, col: string): void => {
        g.strokeStyle = col;
        g.fillStyle = col;
        g.beginPath();
        g.arc(wx(x), wy(y), 6, 0, Math.PI * 2);
        g.stroke();
        g.fillText(label, wx(x) + 8, wy(y) - 6);
      };
      mark(A.book.x, A.book.y, 'book', '#7dff5a');
      mark(A.smith.x, A.smith.y, 'smith', '#ffd24a');
      mark(A.forge.x, A.forge.y, 'forge', '#ff8a1e');
      mark(A.catapult.x, A.catapult.y, 'catapult', '#7fb0ff');
      A.archers.forEach((p, i) => mark(p.x, p.y, `archer${i}`, '#7fb0ff'));
      A.torches.forEach((p) => mark(p.x, p.y, '', '#ff5050'));
      if (lair) mark(lair.x, lair.y, 'lair', '#ff40ff');
      g.strokeStyle = '#ff40ff';
      g.strokeRect(wx(A.pit.x), wy(A.pit.y), A.pit.w, A.pit.h);
      // the walk band: depth rows -36 / 0 / +36 on the terrain
      for (const r of [-36, 0, 36]) {
        g.strokeStyle = r === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)';
        g.beginPath();
        for (let x = 0; x <= VW; x += 8) {
          const y = wy(GROUND_Y + r + terrainPx(camX + x));
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    g.restore();
  });
  return out;
}
