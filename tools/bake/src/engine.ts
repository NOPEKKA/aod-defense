/**
 * Offline render engine for the art bake.
 *
 * Every image is an accumulation of many passes. Each pass jitters
 *   - the camera by a sub-pixel offset (anti-aliasing),
 *   - the key light inside a small cone (soft shadows),
 *   - one "sky" light over the upper hemisphere (ambient occlusion),
 * and the passes are averaged in a float render target. The result is a
 * premultiplied linear HDR image, tone-mapped and encoded on the CPU.
 */
import * as THREE from 'three';

export interface ImageF {
  width: number;
  height: number;
  /** premultiplied linear RGBA, top row first */
  data: Float32Array;
}

export interface LightRigOpts {
  keyDir: [number, number, number];
  keyColor: number;
  keyIntensity: number;
  /** cone half-angle in degrees for soft shadows */
  keySpread: number;
  skyColor: number;
  skyIntensity: number;
  groundColor: number;
  groundIntensity: number;
  rimDir: [number, number, number];
  rimColor: number;
  rimIntensity: number;
  /** half size of the shadow frustum in world units */
  shadowRadius: number;
  shadowCenter: [number, number, number];
}

export const DEFAULT_RIG: LightRigOpts = {
  keyDir: [-0.45, 0.8, 0.75],
  keyColor: 0xfff1dc,
  keyIntensity: 2.6,
  keySpread: 5,
  skyColor: 0xa9c4ff,
  skyIntensity: 1.25,
  groundColor: 0x8a5a3c,
  groundIntensity: 0.35,
  rimDir: [0.75, 0.55, -0.8],
  rimColor: 0xffb070,
  rimIntensity: 1.6,
  shadowRadius: 3.2,
  shadowCenter: [0, 1, 0],
};

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

export class LightRig {
  readonly group = new THREE.Group();
  readonly key = new THREE.DirectionalLight();
  readonly sky = new THREE.DirectionalLight();
  readonly rim = new THREE.DirectionalLight();
  readonly hemi = new THREE.HemisphereLight();
  private keyBase = new THREE.Vector3();
  private center = new THREE.Vector3();
  constructor(public opts: LightRigOpts = DEFAULT_RIG) {
    for (const l of [this.key, this.sky]) {
      l.castShadow = true;
      l.shadow.mapSize.set(2048, 2048);
      l.shadow.bias = -0.0006;
      l.shadow.normalBias = 0.025;
      this.group.add(l, l.target);
    }
    this.group.add(this.rim, this.rim.target, this.hemi);
    this.configure(opts);
  }
  configure(o: LightRigOpts): void {
    this.opts = o;
    this.center.fromArray(o.shadowCenter);
    this.keyBase.fromArray(o.keyDir).normalize();
    this.key.color.set(o.keyColor);
    this.key.intensity = o.keyIntensity;
    this.sky.color.set(o.skyColor);
    // uniform hemisphere sampling: E = 2*pi*L*mean(V*cos); the physical BRDF already divides by pi
    this.sky.intensity = o.skyIntensity * 2;
    this.rim.color.set(o.rimColor);
    this.rim.intensity = o.rimIntensity;
    this.rim.position.copy(this.center).addScaledVector(new THREE.Vector3().fromArray(o.rimDir).normalize(), 12);
    this.rim.target.position.copy(this.center);
    this.hemi.color.set(0x000000);
    this.hemi.groundColor.set(o.groundColor);
    this.hemi.intensity = o.groundIntensity;
    for (const l of [this.key, this.sky]) {
      const c = l.shadow.camera as THREE.OrthographicCamera;
      c.left = -o.shadowRadius;
      c.right = o.shadowRadius;
      c.top = o.shadowRadius;
      c.bottom = -o.shadowRadius;
      c.near = 0.5;
      c.far = 40;
      c.updateProjectionMatrix();
      l.target.position.copy(this.center);
    }
  }
  /** jitter lights for pass k of K */
  pass(k: number, K: number): void {
    const o = this.opts;
    // key: direction inside a cone
    const a = halton(k + 1, 5) * Math.PI * 2;
    const r = Math.sqrt(halton(k + 1, 7)) * Math.tan((o.keySpread * Math.PI) / 180);
    const up = Math.abs(this.keyBase.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(this.keyBase, up).normalize();
    const t2 = new THREE.Vector3().crossVectors(this.keyBase, t1);
    const kd = this.keyBase
      .clone()
      .addScaledVector(t1, Math.cos(a) * r)
      .addScaledVector(t2, Math.sin(a) * r)
      .normalize();
    this.key.position.copy(this.center).addScaledVector(kd, 18);
    // sky: uniform over the upper hemisphere (golden-angle spiral)
    const y = (k + 0.5) / K; // uniform in solid angle <=> uniform in cos(theta)
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = k * 2.399963229728653;
    this.sky.position.copy(this.center).add(new THREE.Vector3(Math.cos(phi) * rad, Math.max(y, 0.03), Math.sin(phi) * rad).multiplyScalar(18));
  }
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  private rts = new Map<string, THREE.WebGLRenderTarget>();
  private blitScene = new THREE.Scene();
  private blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private blitMat: THREE.ShaderMaterial;

  constructor() {
    const canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 0);
    this.blitMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, weight: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tex; uniform float weight; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tex, vUv) * weight; }',
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      toneMapped: false,
    });
    this.blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMat));
  }

  info(): string {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  }

  private rt(name: string, w: number, h: number, type: THREE.TextureDataType, depth: boolean): THREE.WebGLRenderTarget {
    const key = `${name}:${w}x${h}`;
    let t = this.rts.get(key);
    if (!t) {
      // keep at most one size per name
      for (const [k, old] of this.rts) {
        if (k.startsWith(name + ':')) {
          old.dispose();
          this.rts.delete(k);
        }
      }
      t = new THREE.WebGLRenderTarget(w, h, {
        type,
        format: THREE.RGBAFormat,
        depthBuffer: depth,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        colorSpace: THREE.LinearSRGBColorSpace,
      });
      this.rts.set(key, t);
    }
    return t;
  }

  /**
   * Accumulate `passes` renders of the scene. `perPass(k, K)` may move lights.
   * The camera gets a sub-pixel jitter per pass.
   */
  accumulate(
    scene: THREE.Scene,
    camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
    w: number,
    h: number,
    passes: number,
    perPass?: (k: number, K: number) => void,
  ): ImageF {
    const r = this.renderer;
    const pass = this.rt('pass', w, h, THREE.HalfFloatType, true);
    const acc = this.rt('acc', w, h, THREE.FloatType, false);
    r.setRenderTarget(acc);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    for (let k = 0; k < passes; k++) {
      perPass?.(k, passes);
      const jx = halton(k + 1, 2) - 0.5;
      const jy = halton(k + 1, 3) - 0.5;
      camera.setViewOffset(w, h, jx, jy, w, h);
      r.setRenderTarget(pass);
      r.clear(true, true, true);
      r.render(scene, camera);
      this.blitMat.uniforms.tex.value = pass.texture;
      this.blitMat.uniforms.weight.value = 1 / passes;
      r.setRenderTarget(acc);
      r.render(this.blitScene, this.blitCam);
    }
    camera.clearViewOffset();
    const raw = new Float32Array(w * h * 4);
    r.readRenderTargetPixels(acc, 0, 0, w, h, raw);
    r.setRenderTarget(null);
    // flip rows (GL is bottom-up)
    const data = new Float32Array(w * h * 4);
    const row = w * 4;
    for (let y = 0; y < h; y++) data.set(raw.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    return { width: w, height: h, data };
  }
}

/** integer box-filter downsample of a premultiplied linear image */
export function downsample(img: ImageF, f: number): ImageF {
  if (f === 1) return img;
  const w = Math.floor(img.width / f);
  const h = Math.floor(img.height / f);
  const out = new Float32Array(w * h * 4);
  const inv = 1 / (f * f);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < f; dy++) {
        let i = ((y * f + dy) * img.width + x * f) * 4;
        for (let dx = 0; dx < f; dx++) {
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          a += img.data[i + 3];
          i += 4;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r * inv;
      out[o + 1] = g * inv;
      out[o + 2] = b * inv;
      out[o + 3] = a * inv;
    }
  }
  return { width: w, height: h, data: out };
}

export interface GradeOpts {
  exposure: number;
  /** 1 = unchanged */
  saturation: number;
  /** 1 = unchanged, >1 more contrast around mid grey */
  contrast: number;
}
export const DEFAULT_GRADE: GradeOpts = { exposure: 1, saturation: 1.08, contrast: 1.06 };

const SRGB_LUT = (() => {
  const n = 4096;
  const t = new Uint8Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const v = i / n;
    t[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  }
  return t;
})();

/** Khronos PBR Neutral tone mapper, in place */
function neutral(c: number[]): void {
  const start = 0.8 - 0.04;
  const desat = 0.15;
  const x = Math.min(c[0], c[1], c[2]);
  const off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c[0] -= off;
  c[1] -= off;
  c[2] -= off;
  const peak = Math.max(c[0], c[1], c[2]);
  if (peak < start) return;
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + d - start);
  const s = newPeak / peak;
  c[0] *= s;
  c[1] *= s;
  c[2] *= s;
  const g = 1 - 1 / (desat * (peak - newPeak) + 1);
  c[0] += (newPeak - c[0]) * g;
  c[1] += (newPeak - c[1]) * g;
  c[2] += (newPeak - c[2]) * g;
}

/** premultiplied linear float -> straight-alpha sRGB 8-bit ImageData */
export function toImageData(img: ImageF, grade: GradeOpts = DEFAULT_GRADE): ImageData {
  const { width: w, height: h, data } = img;
  const out = new ImageData(w, h);
  const o = out.data;
  const c = [0, 0, 0];
  for (let i = 0; i < w * h * 4; i += 4) {
    const a = Math.min(1, data[i + 3]);
    if (a <= 0.002) continue;
    const ia = grade.exposure / a;
    c[0] = data[i] * ia;
    c[1] = data[i + 1] * ia;
    c[2] = data[i + 2] * ia;
    neutral(c);
    // saturation + contrast in display-linear
    const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    for (let j = 0; j < 3; j++) {
      let v = l + (c[j] - l) * grade.saturation;
      v = 0.18 * Math.pow(Math.max(v, 0) / 0.18, grade.contrast);
      o[i + j] = SRGB_LUT[Math.min(4096, Math.max(0, Math.round(v * 4096)))];
    }
    o[i + 3] = Math.round(a * 255);
  }
  return out;
}

export function toCanvas(d: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = d.width;
  c.height = d.height;
  c.getContext('2d', { willReadFrequently: true })!.putImageData(d, 0, 0);
  return c;
}

/** dark silhouette outline of radius r px around the sprite */
export function addOutline(src: HTMLCanvasElement, r: number, color = '#160f1c', alpha = 0.9): HTMLCanvasElement {
  const sil = document.createElement('canvas');
  sil.width = src.width;
  sil.height = src.height;
  const s = sil.getContext('2d')!;
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    s.drawImage(src, Math.cos(a) * r, Math.sin(a) * r);
  }
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = color;
  s.fillRect(0, 0, sil.width, sil.height);
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const o = out.getContext('2d', { willReadFrequently: true })!;
  o.globalAlpha = alpha;
  o.drawImage(sil, 0, 0);
  o.globalAlpha = 1;
  o.drawImage(src, 0, 0);
  return out;
}

export interface Trimmed {
  canvas: HTMLCanvasElement;
  /** offset of the trimmed rect inside the source frame */
  x: number;
  y: number;
  sourceW: number;
  sourceH: number;
}

export function trim(src: HTMLCanvasElement, pad = 1, threshold = 3): Trimmed {
  const w = src.width;
  const h = src.height;
  const d = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) {
    x0 = y0 = 0;
    x1 = y1 = 0;
  }
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const c = document.createElement('canvas');
  c.width = x1 - x0 + 1;
  c.height = y1 - y0 + 1;
  c.getContext('2d')!.drawImage(src, -x0, -y0);
  return { canvas: c, x: x0, y: y0, sourceW: w, sourceH: h };
}
