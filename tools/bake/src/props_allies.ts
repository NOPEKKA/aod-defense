/**
 * Procedural props for the player-side sprites (owner: allies art agent).
 * Same look as props.ts: low-poly, flat-shaded, matte. Units: 1 = 75 logical px.
 *
 * Hand-held props keep the grip at the origin with the long axis along +Y.
 * Head props are placed in `head` bone space: y = 0 at the neck, the KayKit
 * head is ~1.07 tall, ~1.09 wide and its face points along +Z.
 */
import * as THREE from 'three';
import { at, box, cone, cyl, extrude, glow, group, mat, mesh, PAL, sphere, torus } from './props';

const RAD = Math.PI / 180;
const DS = THREE.DoubleSide;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

/** solid of revolution, optionally partial (phi 0 = +Z, degrees), double sided */
export function lath(points: Array<[number, number]>, material: THREE.Material, seg = 12, phiStart = 0, phiLength = 360): THREE.Mesh {
  const geo = new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    seg,
    phiStart * RAD,
    phiLength * RAD,
  );
  return mesh(geo, material);
}

/** open tube (no caps), double sided */
export function tube(rTop: number, rBottom: number, h: number, material: THREE.Material, seg = 12, phiStart = 0, phiLength = 360): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, true, phiStart * RAD, phiLength * RAD), material);
}

/** partial torus (arc in degrees) in the XY plane */
export function arcTorus(r: number, t: number, arcDeg: number, material: THREE.Material, seg = 12): THREE.Mesh {
  return mesh(new THREE.TorusGeometry(r, t, 6, seg, arcDeg * RAD), material);
}

const _a = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
/** place a unit-length (along Y, centred) mesh between two points of its parent space */
export function span(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  _a.subVectors(b, a);
  const len = Math.max(1e-4, _a.length());
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, _a.normalize());
  m.scale.set(1, len, 1);
}

export const STEEL = (): THREE.MeshStandardMaterial => mat(0xb9c3cb, { rough: 0.38, metal: 0.65 });
export const IRON = (): THREE.MeshStandardMaterial => mat(PAL.iron, { rough: 0.5, metal: 0.55 });
export const GOLD = (): THREE.MeshStandardMaterial => mat(0xf2c443, { rough: 0.32, metal: 0.7, emissive: 0x5a3c00, emissiveIntensity: 0.35 });
export const WOOD = (): THREE.MeshStandardMaterial => mat(PAL.wood);
export const WOOD_DARK = (): THREE.MeshStandardMaterial => mat(PAL.woodDark);

/** a material that glows on its own (flames, lantern glass, magic) */
export function hot(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  return mat(color, { emissive: color, emissiveIntensity: intensity, rough: 1 });
}

// ---------------------------------------------------------------------------
// head wear
// ---------------------------------------------------------------------------

/** woven straw hat with a wide brim. Place on `head` at y ~0.74. */
export function strawHat(band: number = PAL.blue): THREE.Group {
  const straw = mat(0xe6c068, { rough: 0.95, side: DS });
  const strawDark = mat(0xb98d3f, { rough: 0.95, side: DS });
  const g = new THREE.Group();
  g.add(
    lath(
      [
        [0, 0.5],
        [0.22, 0.49],
        [0.36, 0.44],
        [0.43, 0.3],
        [0.46, 0.08],
        [0.52, 0.03],
        [0.74, -0.02],
        [0.96, -0.1],
        [0.98, -0.15],
        [0.93, -0.15],
        [0.72, -0.07],
        [0.5, -0.03],
        [0.0, -0.03],
      ],
      straw,
      14,
    ),
  );
  // woven rings on the brim and crown
  g.add(at(arcTorus(0.73, 0.022, 360, strawDark, 16), 0, -0.02, 0, 90, 0, 0));
  g.add(at(arcTorus(0.88, 0.02, 360, strawDark, 16), 0, -0.08, 0, 90, 0, 0));
  g.add(at(arcTorus(0.4, 0.02, 360, strawDark, 14), 0, 0.4, 0, 90, 0, 0));
  // hat band
  g.add(at(tube(0.455, 0.47, 0.1, mat(band, { side: DS }), 14), 0, 0.12, 0));
  // a frayed straw tuft at the top
  g.add(at(cone(0.06, 0.12, strawDark, 5), 0, 0.53, 0));
  return g;
}

/** iron kettle hat (chapel de fer): round dome, wide sloping brim, comb on top. Place on `head` at y ~0.62. */
export function kettleHelm(): THREE.Group {
  const steel = mat(0xa9b3bb, { rough: 0.4, metal: 0.6, side: DS });
  const dark = mat(0x5d666f, { rough: 0.45, metal: 0.6, side: DS });
  const g = new THREE.Group();
  g.add(
    lath(
      [
        [0, 0.6],
        [0.26, 0.57],
        [0.45, 0.46],
        [0.57, 0.27],
        [0.61, 0.06],
        [0.63, 0.0],
        [0.86, -0.1],
        [0.93, -0.15],
        [0.93, -0.19],
        [0.62, -0.07],
        [0.0, -0.07],
      ],
      steel,
      14,
    ),
  );
  // band of rivets where the dome meets the brim
  g.add(at(tube(0.625, 0.63, 0.07, dark, 14), 0, 0.03, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.add(at(sphere(0.035, 0xd9dee2, 5, { metal: 0.6, rough: 0.35 }), Math.sin(a) * 0.63, 0.04, Math.cos(a) * 0.63));
  }
  // comb from front to back
  g.add(at(arcTorus(0.56, 0.05, 180, steel, 10), 0, 0.04, 0, 0, 90, 0));
  // blue plume holder at the back (team colour on the helmet)
  g.add(at(cone(0.09, 0.42, mat(PAL.blue), 6), 0, 0.62, -0.28, -38, 0, 0));
  return g;
}

/** gold crown with points and gems. Place on `head` at y ~0.86. */
export function crown(): THREE.Group {
  const gold = GOLD();
  const g = new THREE.Group();
  g.add(at(tube(0.43, 0.4, 0.2, mat(0xf2c443, { rough: 0.32, metal: 0.7, emissive: 0x5a3c00, emissiveIntensity: 0.35, side: DS }), 12), 0, 0.1, 0));
  g.add(at(arcTorus(0.405, 0.035, 360, gold, 14), 0, 0.0, 0, 90, 0, 0));
  g.add(at(arcTorus(0.432, 0.03, 360, gold, 14), 0, 0.2, 0, 90, 0, 0));
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.sin(a) * 0.42;
    const z = Math.cos(a) * 0.42;
    g.add(at(cone(0.09, 0.24, gold, 4), x, 0.32, z, 0, (a * 180) / Math.PI + 45, 0));
    g.add(at(sphere(0.045, gold, 6), x, 0.45, z));
    // gem on the band under every point: red at the front, blue around
    const gem = i === 0 ? 0xd7263d : i % 2 ? 0x2e6fd0 : 0x3fa05a;
    const gm = box(0.1, 0.1, 0.05, gem, { rough: 0.25, metal: 0.2, emissive: gem, emissiveIntensity: 0.25 });
    gm.position.set(Math.sin(a) * 0.435, 0.1, Math.cos(a) * 0.435);
    gm.rotation.set(0, a, Math.PI / 4);
    g.add(gm);
  }
  return g;
}

/** witch hunter's capotain: tall flat-topped crown, wide brim, silver buckle. Place on `head` at y ~0.74. */
export function hunterHat(): THREE.Group {
  const felt = mat(0x2e2a2c, { rough: 0.95, side: DS });
  const band = mat(0x151315, { rough: 0.9, side: DS });
  const g = new THREE.Group();
  g.add(
    lath(
      [
        [0, 0.66],
        [0.35, 0.66],
        [0.38, 0.62],
        [0.44, 0.06],
        [0.47, 0.02],
        [0.82, 0.0],
        [0.95, 0.06],
        [0.97, 0.02],
        [0.9, -0.04],
        [0.46, -0.04],
        [0, -0.04],
      ],
      felt,
      12,
    ),
  );
  g.add(at(tube(0.425, 0.44, 0.13, band, 12), 0, 0.13, 0));
  // silver buckle at the front
  const silver = mat(0xdfe5ea, { rough: 0.3, metal: 0.75 });
  const buckle = new THREE.Group();
  buckle.add(at(box(0.2, 0.04, 0.03, silver), 0, 0.075, 0));
  buckle.add(at(box(0.2, 0.04, 0.03, silver), 0, -0.075, 0));
  buckle.add(at(box(0.04, 0.19, 0.03, silver), 0.08, 0, 0));
  buckle.add(at(box(0.04, 0.19, 0.03, silver), -0.08, 0, 0));
  buckle.add(at(box(0.03, 0.12, 0.03, silver), 0, 0, 0));
  g.add(at(buckle, 0, 0.13, 0.45, -5, 0, 0));
  return g;
}

/** nun's veil and wimple for Sister Morwen. Place on `head` at y 0. */
export function nunVeil(cloth = 0xf3efe6, inner = 0xffffff, trim = 0xf2c443): THREE.Group {
  const outer = mat(cloth, { rough: 0.9, side: DS });
  const g = new THREE.Group();
  // veil: a bell of cloth around the top, sides and back of the head, open at the face
  g.add(
    lath(
      [
        [0.0, 1.17],
        [0.3, 1.13],
        [0.52, 1.0],
        [0.63, 0.78],
        [0.66, 0.48],
        [0.67, 0.2],
        [0.72, -0.1],
        [0.84, -0.42],
        [0.9, -0.56],
      ],
      outer,
      14,
      62,
      236,
    ),
  );
  // wimple: white band framing the face at the forehead and under the chin
  const white = mat(inner, { rough: 0.85, side: DS });
  g.add(at(tube(0.6, 0.6, 0.16, white, 14, -64, 128), 0, 0.84, 0));
  g.add(at(tube(0.5, 0.62, 0.26, white, 14, -70, 140), 0, 0.02, 0.02));
  // gold trim along the forehead
  g.add(at(tube(0.615, 0.615, 0.05, mat(trim, { rough: 0.35, metal: 0.6, side: DS }), 14, -66, 132), 0, 0.93, 0));
  return g;
}

/** helmet plume: feathers sweeping back from the origin. Place on `head` on top of a helmet. */
export function plume(color: number = PAL.blue, tip = 0xf0f0ea): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cyl(0.05, 0.06, 0.12, IRON(), 6), 0, 0.04, 0));
  const m = mat(color, { rough: 0.9 });
  const mt = mat(tip, { rough: 0.9 });
  const feathers: Array<[number, number, number]> = [
    [0, 0, 0],
    [-0.07, 8, -14],
    [0.07, -8, 14],
  ];
  for (const [x, ry, rz] of feathers) {
    const f = new THREE.Group();
    f.add(at(box(0.11, 0.5, 0.16, m), 0, 0.25, 0));
    f.add(at(box(0.1, 0.22, 0.14, m), 0, 0.55, -0.05, -25, 0, 0));
    f.add(at(box(0.09, 0.14, 0.12, mt), 0, 0.7, -0.14, -50, 0, 0));
    f.position.set(x, 0.05, 0);
    f.rotation.set(-45 * RAD, ry * RAD, rz * RAD);
    g.add(f);
  }
  return g;
}

/**
 * Tabard: a cloth coat over the torso (chest bone) with a short skirt (hips bone).
 * Sized for the KayKit body (~0.8 wide, front at z 0.37). Returns parts to attach.
 */
export function tabard(color: number = PAL.blue, trim = 0xf0f0ea, emblem = 0xf2c443): { chest: THREE.Group; hips: THREE.Group } {
  const cloth = mat(color, { rough: 0.9, side: DS });
  const trimM = mat(trim, { rough: 0.85, side: DS });
  const chest = new THREE.Group();
  // front and back panels: partial tubes hugging the barrel of the body
  chest.add(at(tube(0.405, 0.44, 0.72, cloth, 10, -48, 96), 0, -0.2, 0.0));
  chest.add(at(tube(0.405, 0.44, 0.72, cloth, 10, 132, 96), 0, -0.2, -0.02));
  // emblem: a cross on the chest
  const em = mat(emblem, { rough: 0.5, metal: 0.3 });
  chest.add(at(box(0.08, 0.32, 0.03, em), 0, -0.12, 0.43, -6, 0, 0));
  chest.add(at(box(0.24, 0.08, 0.03, em), 0, -0.06, 0.428, -6, 0, 0));
  const hips = new THREE.Group();
  hips.add(at(tube(0.445, 0.5, 0.26, cloth, 10, -45, 90), 0, 0.0, 0.0));
  hips.add(at(tube(0.445, 0.5, 0.26, cloth, 10, 135, 90), 0, 0.0, -0.02));
  hips.add(at(tube(0.5, 0.505, 0.05, trimM, 10, -45, 90), 0, -0.13, 0.0));
  hips.add(at(tube(0.5, 0.505, 0.05, trimM, 10, 135, 90), 0, -0.13, -0.02));
  return { chest, hips };
}

// ---------------------------------------------------------------------------
// weapons and tools
// ---------------------------------------------------------------------------

/** pitchfork: shaft along +Y, three iron tines spread along X. Grip at origin. */
export function pitchfork(): THREE.Group {
  const iron = mat(0x6b737b, { rough: 0.5, metal: 0.5 });
  const g = new THREE.Group();
  g.add(at(cyl(0.05, 0.05, 2.25, WOOD(), 8), 0, 0.38, 0));
  g.add(at(cyl(0.065, 0.065, 0.14, iron, 8), 0, 1.52, 0));
  g.add(at(box(0.5, 0.08, 0.08, iron), 0, 1.6, 0));
  for (const x of [-0.22, 0, 0.22]) {
    g.add(at(cyl(0.035, 0.035, 0.44, iron, 6), x, 1.84, 0));
    g.add(at(cone(0.035, 0.12, iron, 6), x, 2.12, 0));
  }
  // bindings
  g.add(at(cyl(0.058, 0.058, 0.06, mat(PAL.leather), 8), 0, -0.2, 0));
  return g;
}

/** short sword: steel blade along +Y. Grip at origin. Length ~1.05. */
export function shortSword(): THREE.Group {
  const steel = STEEL();
  const g = new THREE.Group();
  g.add(at(box(0.13, 0.62, 0.05, steel), 0, 0.5, 0));
  g.add(at(cone(0.092, 0.18, steel, 4), 0, 0.9, 0, 0, 45, 0));
  g.add(at(box(0.36, 0.07, 0.1, mat(PAL.leather)), 0, 0.17, 0));
  g.add(at(cyl(0.045, 0.045, 0.26, WOOD_DARK(), 6), 0, 0.02, 0));
  g.add(at(sphere(0.07, IRON(), 6), 0, -0.13, 0));
  return g;
}

/**
 * Bow: grip at origin, limbs along +-Y, the stave arcs back toward the archer (-X),
 * so the arrow flies along +X. userData.string(nock) sets the string; userData.arrow is the nocked arrow.
 */
export function bow(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x9a5b2e);
  const dark = mat(0x4a2c1a);
  const H = 0.86; // half length
  const BACK = 0.32; // how far the tips sit behind the grip
  const N = 6;
  const pt = (y: number): THREE.Vector3 => {
    const k = y / H;
    // a gentle D with slightly recurved tips
    return new THREE.Vector3(-BACK * k * k + 0.06 * Math.pow(Math.abs(k), 6), y, 0);
  };
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < N; i++) {
      const a = pt((s * i * H) / N);
      const b = pt((s * (i + 1) * H) / N);
      const w = 0.1 - 0.05 * (i / N);
      const seg = box(w, 1, 0.08, i >= N - 1 ? dark : wood);
      span(seg, a, b);
      seg.scale.y *= 1.08;
      g.add(seg);
    }
  }
  // leather grip with a blue wrap
  g.add(at(box(0.14, 0.26, 0.11, mat(PAL.leather)), 0, 0, 0));
  g.add(at(box(0.15, 0.06, 0.12, mat(PAL.blue)), 0, 0.11, 0));
  g.add(at(box(0.15, 0.06, 0.12, mat(PAL.blue)), 0, -0.11, 0));
  // string: two segments meeting at the nock point
  const tipT = pt(H);
  const tipB = pt(-H);
  const strMat = mat(0xefe6d2, { rough: 0.8 });
  const s1 = cyl(0.016, 0.016, 1, strMat, 4);
  const s2 = cyl(0.016, 0.016, 1, strMat, 4);
  g.add(s1, s2);
  // nocked arrow (shaft along +X from the nock)
  const arrow = arrowProp();
  g.add(arrow);
  const setString = (nock: THREE.Vector3 | null): void => {
    const n = nock ?? new THREE.Vector3(tipT.x, 0, 0);
    span(s1, tipT, n);
    span(s2, n, tipB);
    // arrow: tail at the nock, pointing at the grip
    arrow.position.copy(n);
    const dir = new THREE.Vector3(0.05, 0, 0).sub(n).normalize();
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  };
  setString(null);
  g.userData.setString = setString;
  g.userData.arrow = arrow;
  g.userData.restNock = new THREE.Vector3(tipT.x, 0, 0);
  return g;
}

/** arrow along +X from the nock at the origin: length ~1.0 */
export function arrowProp(fletch: number = PAL.blue): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cyl(0.022, 0.022, 0.98, mat(0xc89a62), 5), 0.49, 0, 0, 0, 0, 90));
  g.add(at(cone(0.05, 0.14, mat(0x8d969e, { metal: 0.5, rough: 0.4 }), 4), 1.02, 0, 0, 0, 0, -90));
  for (const r of [0, 120, 240]) {
    const f = extrude(
      [
        [0, 0],
        [0.2, 0],
        [0.05, 0.07],
      ],
      0.012,
      mat(fletch, { side: DS }),
    );
    g.add(at(f, 0.03, 0, 0, r, 0, 0));
  }
  return g;
}

/** spear: shaft along +Y (grip at origin, ~0.85 behind), leaf head and a small blue pennant. Total ~2.85. */
export function spear(): THREE.Group {
  const g = new THREE.Group();
  const steel = STEEL();
  g.add(at(cyl(0.048, 0.052, 2.75, WOOD(), 8), 0, 0.5, 0));
  g.add(at(cyl(0.065, 0.06, 0.12, IRON(), 8), 0, -0.86, 0));
  g.add(at(cyl(0.05, 0.075, 0.22, IRON(), 8), 0, 1.93, 0));
  const head = lath(
    [
      [0, 0],
      [0.15, 0.17],
      [0.1, 0.38],
      [0, 0.62],
    ],
    steel,
    4,
  );
  g.add(at(head, 0, 2.02, 0, 0, 45, 0));
  // pennant just below the head
  const pen = extrude(
    [
      [0, 0],
      [0.5, -0.1],
      [0.36, -0.15],
      [0.5, -0.24],
      [0, -0.3],
    ],
    0.025,
    mat(PAL.blue, { side: DS }),
  );
  g.add(at(pen, 0.04, 1.86, 0));
  g.add(at(box(0.05, 0.3, 0.035, mat(0xf0f0f0)), 0.05, 1.71, 0));
  // grip wrap
  g.add(at(cyl(0.062, 0.062, 0.3, mat(PAL.leather), 8), 0, 0.0, 0));
  return g;
}

/** layered flame with a soft glow. Base at the origin, ~0.6 tall. userData.flicker(u) animates it. */
export function flame(size = 1, color = 0xff7a1a, core = 0xffd24a, glowColor = 0xff9a3c): THREE.Group {
  const g = new THREE.Group();
  const outerM = hot(color, 1.5);
  const coreM = hot(core, 1.9);
  const tongue = (pts: Array<[number, number]>, m: THREE.Material): THREE.Mesh => lath(pts, m, 7);
  const big = tongue(
    [
      [0, 0],
      [0.17, 0.08],
      [0.19, 0.2],
      [0.13, 0.38],
      [0.05, 0.54],
      [0, 0.64],
    ],
    outerM,
  );
  const left = at(
    tongue(
      [
        [0, 0],
        [0.09, 0.06],
        [0.08, 0.2],
        [0, 0.36],
      ],
      outerM,
    ),
    0.1,
    0.05,
    -0.04,
    0,
    0,
    -18,
  );
  const right = at(
    tongue(
      [
        [0, 0],
        [0.08, 0.06],
        [0.07, 0.18],
        [0, 0.3],
      ],
      outerM,
    ),
    -0.1,
    0.05,
    0.03,
    0,
    0,
    20,
  );
  const inner = at(
    tongue(
      [
        [0, 0],
        [0.12, 0.07],
        [0.12, 0.17],
        [0.06, 0.3],
        [0, 0.38],
      ],
      coreM,
    ),
    0,
    0.0,
    0.09,
  );
  const halo = at(glow(glowColor, 0.62, 0.85), 0, 0.26, 0);
  g.add(big, left, right, inner, halo);
  g.scale.setScalar(size);
  g.userData.flicker = (u: number): void => {
    const w = Math.PI * 2 * u;
    big.scale.set(1 + 0.08 * Math.sin(w * 2), 1 + 0.16 * Math.sin(w * 3 + 1), 1 + 0.08 * Math.cos(w * 2));
    big.rotation.z = 0.12 * Math.sin(w * 2 + 0.5);
    left.scale.y = 1 + 0.3 * Math.sin(w * 4 + 2);
    right.scale.y = 1 + 0.3 * Math.sin(w * 3 + 4);
    inner.scale.y = 1 + 0.18 * Math.sin(w * 5);
    halo.scale.setScalar(1.24 * (1 + 0.08 * Math.sin(w * 4)));
  };
  return g;
}

/** blacksmith's hammer: handle along +Y, head along X (striking faces at +-X). Grip at origin. */
export function smithHammer(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cyl(0.055, 0.06, 1.05, WOOD(), 8), 0, 0.3, 0));
  g.add(at(cyl(0.07, 0.07, 0.22, mat(PAL.leather), 8), 0, -0.08, 0));
  const iron = mat(0x4a4f56, { rough: 0.45, metal: 0.6 });
  g.add(at(box(0.48, 0.25, 0.25, iron), 0.04, 0.86, 0));
  g.add(at(box(0.09, 0.3, 0.3, mat(0x80898f, { rough: 0.35, metal: 0.7 })), 0.3, 0.86, 0));
  g.add(at(cone(0.13, 0.22, iron, 4), -0.28, 0.86, 0, 0, 45, 90));
  return g;
}

/** jousting lance: grip at origin, points along +Y; vamplate, blue and white bands, pennant. Length ~3.1. */
export function lance(): THREE.Group {
  const g = new THREE.Group();
  const white = mat(0xeeeeea);
  const blue = mat(PAL.blue);
  g.add(at(cyl(0.065, 0.075, 0.6, mat(PAL.leather), 8), 0, -0.12, 0));
  g.add(at(sphere(0.09, IRON(), 6), 0, -0.45, 0));
  g.add(
    at(
      lath(
        [
          [0.06, 0.14],
          [0.27, 0.26],
          [0.27, 0.32],
          [0.07, 0.42],
        ],
        STEEL(),
        10,
      ),
      0,
      0,
      0,
    ),
  );
  // tapering shaft in alternating bands
  const bands = 6;
  const y0 = 0.4;
  const y1 = 2.9;
  for (let i = 0; i < bands; i++) {
    const a = y0 + ((y1 - y0) * i) / bands;
    const b = y0 + ((y1 - y0) * (i + 1)) / bands;
    const ra = 0.095 - 0.065 * (i / bands);
    const rb = 0.095 - 0.065 * ((i + 1) / bands);
    g.add(at(cyl(rb, ra, b - a, i % 2 ? white : blue, 8), 0, (a + b) / 2, 0));
  }
  g.add(at(cone(0.04, 0.24, STEEL(), 6), 0, 3.02, 0));
  // pennant
  const pen = extrude(
    [
      [0, 0],
      [0.62, -0.12],
      [0.42, -0.2],
      [0.62, -0.3],
      [0, -0.38],
    ],
    0.025,
    mat(PAL.blue, { side: DS }),
  );
  g.add(at(pen, 0.04, 2.72, 0));
  g.add(at(box(0.06, 0.38, 0.04, mat(0xf2c443)), 0.05, 2.53, 0));
  return g;
}

/** staff with a crook at the top and a lantern of pale blue light hanging from it. Grip at origin. */
export function lanternStaff(light = 0xbfe6ff): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0xd8c7a4);
  const gold = GOLD();
  g.add(at(cyl(0.055, 0.06, 2.55, wood, 8), 0, 0.3, 0));
  g.add(at(cone(0.06, 0.16, gold, 6), 0, -1.0, 0, 180, 0, 0));
  for (const y of [0.25, 1.15, 1.5]) g.add(at(cyl(0.07, 0.07, 0.06, gold, 8), 0, y, 0));
  // crook: half ring curling over toward +X
  g.add(at(arcTorus(0.2, 0.05, 200, wood, 10), 0.2, 1.58, 0, 0, 0, -10));
  g.add(at(sphere(0.07, gold, 6), 0.43, 1.52, 0));
  // chain links
  const chainM = mat(0x8a8f94, { metal: 0.6, rough: 0.4 });
  for (let i = 0; i < 3; i++) g.add(at(torus(0.035, 0.012, chainM, 8), 0.4, 1.43 - i * 0.06, 0, 0, i % 2 ? 90 : 0, 0));
  g.add(at(lantern(light), 0.4, 1.28, 0));
  return g;
}

/** small hanging lantern, hook at the origin, body below. */
export function lantern(light = 0xbfe6ff): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x2d3036, { rough: 0.5, metal: 0.5 });
  g.add(at(torus(0.05, 0.016, iron, 8), 0, -0.02, 0));
  g.add(at(cone(0.17, 0.12, iron, 4), 0, -0.1, 0, 0, 45, 0));
  g.add(at(box(0.25, 0.04, 0.25, iron), 0, -0.17, 0));
  g.add(at(box(0.2, 0.22, 0.2, hot(light, 2.0)), 0, -0.3, 0));
  for (const [x, z] of [
    [-0.11, -0.11],
    [0.11, -0.11],
    [-0.11, 0.11],
    [0.11, 0.11],
  ]) {
    g.add(at(box(0.035, 0.26, 0.035, iron), x, -0.3, z));
  }
  g.add(at(box(0.27, 0.05, 0.27, iron), 0, -0.44, 0));
  g.add(at(glow(light, 0.7, 0.95), 0, -0.3, 0));
  return g;
}

/** silver chain wound round a forearm (bone Y axis) with a short dangling end */
export function armChain(radius = 0.2, turns = 1.6, length = 0.42, silver = 0xdfe5ea): THREE.Group {
  const m = mat(silver, { rough: 0.28, metal: 0.8 });
  const g = new THREE.Group();
  const n = Math.round(turns * 9);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = t * turns * Math.PI * 2;
    const link = torus(0.055, 0.02, m, 8);
    link.position.set(Math.cos(a) * radius, t * length, Math.sin(a) * radius);
    link.rotation.set(0, -a, i % 2 ? Math.PI / 2 : 0);
    g.add(link);
  }
  // dangling end with a small weight
  for (let i = 0; i < 4; i++) {
    const link = torus(0.05, 0.018, m, 8);
    link.position.set(radius + 0.02, length - 0.1 - i * 0.085, 0.02);
    link.rotation.set(0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2);
    g.add(link);
  }
  g.add(at(sphere(0.06, m, 6), radius + 0.02, length - 0.47, 0.02));
  return g;
}

/** leather apron: bib from the chest, skirt to the knees (in front of the body, +Z) */
export function apron(color = 0x6b4228): { bib: THREE.Group; skirt: THREE.Group } {
  const leather = mat(color, { rough: 0.9 });
  const dark = mat(0x3d2618, { rough: 0.9 });
  const bib = new THREE.Group();
  bib.add(
    at(
      extrude(
        [
          [-0.26, 0],
          [0.26, 0],
          [0.22, 0.42],
          [-0.22, 0.42],
        ],
        0.05,
        leather,
      ),
      0,
      0,
      0,
    ),
  );
  bib.add(at(box(0.05, 0.4, 0.04, dark), 0.2, 0.55, -0.12, -40, 0, 0));
  bib.add(at(box(0.05, 0.4, 0.04, dark), -0.2, 0.55, -0.12, -40, 0, 0));
  const skirt = new THREE.Group();
  skirt.add(
    at(
      extrude(
        [
          [-0.4, 0],
          [0.4, 0],
          [0.36, -0.62],
          [-0.36, -0.62],
        ],
        0.05,
        leather,
      ),
      0,
      0,
      0,
    ),
  );
  skirt.add(at(box(0.84, 0.07, 0.07, dark), 0, -0.02, 0));
  // a pocket with a pair of tongs sticking out
  skirt.add(at(box(0.26, 0.2, 0.04, dark), -0.16, -0.26, 0.04));
  return { bib, skirt };
}

/** anvil on a wooden stump, with a glowing workpiece. Origin on the ground under the anvil's waist. */
export function anvil(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x3b4047, { rough: 0.45, metal: 0.6 });
  const face = mat(0x8a939b, { rough: 0.3, metal: 0.75 });
  g.add(at(cyl(0.32, 0.36, 0.36, mat(0x7a4a2c), 9), 0, 0.18, 0));
  g.add(at(cyl(0.33, 0.33, 0.03, mat(0xa0714c), 9), 0, 0.37, 0));
  g.add(at(box(0.42, 0.1, 0.3, iron), 0, 0.43, 0));
  g.add(at(box(0.24, 0.18, 0.2, iron), 0, 0.57, 0));
  g.add(at(box(0.6, 0.16, 0.28, iron), 0.02, 0.73, 0));
  g.add(at(box(0.58, 0.025, 0.26, face), 0.02, 0.82, 0));
  g.add(at(cone(0.12, 0.34, iron, 4), -0.43, 0.75, 0, 0, 45, 90));
  // glowing bar on the anvil face
  const work = at(box(0.36, 0.06, 0.08, hot(0xff7a1a, 1.8)), 0.06, 0.86, 0.03, 0, 18, 0);
  g.add(work);
  g.userData.work = work;
  return g;
}

/** a burst of sparks (yellow-white chips and a glow), centred at the origin */
export function sparks(): THREE.Group {
  const g = new THREE.Group();
  const m = hot(0xffe28a, 2.4);
  const dirs: Array<[number, number, number]> = [
    [0.3, 0.32, 0.1],
    [-0.26, 0.36, 0.05],
    [0.12, 0.46, -0.1],
    [-0.1, 0.28, 0.2],
    [0.38, 0.14, -0.05],
    [-0.36, 0.16, 0.12],
    [0.2, 0.22, 0.25],
  ];
  for (const [x, y, z] of dirs) {
    const s = box(0.04, 0.04, 0.14, m);
    s.position.set(x, y, z);
    s.lookAt(x * 3, y * 3, z * 3);
    g.add(s);
  }
  g.add(at(glow(0xffb040, 0.5, 1), 0, 0.12, 0));
  return g;
}

/** little circling stars for a stunned head; userData.spin(u) turns them */
export function stunStars(n = 4, r = 0.55): THREE.Group {
  const g = new THREE.Group();
  const m = hot(0xffe14a, 1.2);
  const stars: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const pts: Array<[number, number]> = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      const rr = k % 2 ? 0.055 : 0.13;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    const s = extrude(pts, 0.05, m);
    stars.push(s);
    g.add(s);
  }
  g.userData.spin = (u: number): void => {
    stars.forEach((s, i) => {
      const a = (u + i / n) * Math.PI * 2;
      s.position.set(Math.cos(a) * r, 0.06 * Math.sin(a * 2), Math.sin(a) * r);
      s.rotation.set(0, -a, 0.3 * Math.sin(a * 3));
    });
  };
  g.userData.spin(0);
  return g;
}

// ---------------------------------------------------------------------------
// the horse (toy-like) with procedural gait
// ---------------------------------------------------------------------------

export interface HorseLegs {
  hip: THREE.Object3D;
  knee: THREE.Object3D;
  front: boolean;
  side: 1 | -1;
}

/**
 * Toy horse with a blue caparison. Ground at y 0, faces +Z, saddle top at y ~1.62.
 * userData: legs (HorseLegs[]), body (the bobbing torso group: neck, head, tail, cloth),
 * neck, head, tail. Use horsePose() to animate.
 */
export function horse(coat = 0xd8d2c6, mane = 0x4a4038, cloth: number = PAL.blue, trim = 0xf0f0ea): THREE.Group {
  const g = new THREE.Group();
  const coatM = mat(coat, { rough: 0.9 });
  const coatD = mat(new THREE.Color(coat).multiplyScalar(0.82).getHex(), { rough: 0.9 });
  const maneM = mat(mane, { rough: 0.95 });
  const hoofM = mat(0x2f2a28, { rough: 0.7 });
  const clothM = mat(cloth, { rough: 0.9, side: DS });
  const trimM = mat(trim, { rough: 0.85, side: DS });
  const goldM = GOLD();

  const body = new THREE.Group();
  body.position.set(0, 1.2, 0);
  g.add(body);
  // torso: a chunky capsule along Z
  const torso = mesh(new THREE.CapsuleGeometry(0.4, 1.0, 3, 8), coatM);
  torso.rotation.x = Math.PI / 2;
  torso.scale.set(0.9, 1, 1);
  body.add(torso);
  // caparison: a cloth box over the back and sides with a white trim hem
  body.add(at(box(0.84, 0.5, 1.72, clothM), 0, 0.05, -0.02));
  body.add(at(box(0.86, 0.08, 1.74, trimM), 0, -0.22, -0.02));
  // front and rear drapes
  body.add(at(box(0.78, 0.46, 0.08, clothM), 0, -0.02, 0.86, 10, 0, 0));
  body.add(at(box(0.8, 0.06, 0.09, trimM), 0, -0.23, 0.9, 10, 0, 0));
  // a gold cross / lion badge on the side cloth (both sides)
  for (const s of [1, -1]) {
    body.add(at(box(0.03, 0.22, 0.07, goldM), s * 0.43, 0.06, 0.1));
    body.add(at(box(0.03, 0.07, 0.22, goldM), s * 0.43, 0.1, 0.1));
  }
  // saddle
  body.add(at(box(0.56, 0.12, 0.62, mat(0x6b3f22)), 0, 0.36, -0.04));
  body.add(at(box(0.36, 0.2, 0.1, mat(0x6b3f22)), 0, 0.45, 0.26, -12, 0, 0));
  body.add(at(box(0.44, 0.16, 0.08, mat(0x6b3f22)), 0, 0.43, -0.34, 12, 0, 0));

  // neck and head
  const neck = new THREE.Group();
  neck.position.set(0, 0.22, 0.72);
  body.add(neck);
  neck.add(at(box(0.36, 0.86, 0.44, coatM), 0, 0.34, 0.14, 28, 0, 0));
  neck.add(at(box(0.12, 0.8, 0.2, maneM), 0, 0.38, -0.08, 28, 0, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.78, 0.36);
  neck.add(head);
  head.add(at(box(0.34, 0.34, 0.44, coatM), 0, 0.02, 0.0));
  head.add(at(box(0.28, 0.3, 0.4, coatD), 0, -0.08, 0.34, 18, 0, 0));
  head.add(at(box(0.2, 0.06, 0.06, hoofM), 0, -0.14, 0.55, 18, 0, 0));
  for (const s of [1, -1]) {
    head.add(at(box(0.04, 0.08, 0.08, mat(0x14100e)), s * 0.17, 0.07, 0.1));
    head.add(at(cone(0.06, 0.18, coatM, 4), s * 0.1, 0.24, -0.1, -10, 0, s * -12));
    // bridle
    head.add(at(box(0.03, 0.05, 0.42, mat(0x5d3a26)), s * 0.16, -0.06, 0.24, 18, 0, 0));
  }
  head.add(at(box(0.14, 0.14, 0.16, maneM), 0, 0.2, 0.02));
  // blue plume on the head
  head.add(at(cone(0.07, 0.26, clothM, 5), 0, 0.33, -0.04, -20, 0, 0));

  // tail
  const tail = new THREE.Group();
  tail.position.set(0, 0.18, -0.9);
  body.add(tail);
  tail.add(at(box(0.15, 0.62, 0.15, maneM), 0, -0.28, -0.08, -18, 0, 0));
  tail.add(at(cone(0.12, 0.3, maneM, 5), 0, -0.66, -0.2, 160, 0, 0));

  // legs: hip pivot at the body bottom, knee pivot half way
  const legs: HorseLegs[] = [];
  for (const front of [true, false]) {
    for (const side of [1, -1] as const) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.22, 1.02, front ? 0.56 : -0.58);
      g.add(hip);
      hip.add(at(box(0.22, 0.5, 0.26, coatM), 0, -0.2, 0));
      const knee = new THREE.Group();
      knee.position.set(0, -0.48, 0);
      hip.add(knee);
      knee.add(at(box(0.15, 0.44, 0.16, coatM), 0, -0.2, 0));
      knee.add(at(box(0.19, 0.11, 0.21, hoofM), 0, -0.48, 0.02));
      knee.add(at(box(0.17, 0.06, 0.18, mat(0xf2efe8)), 0, -0.4, 0.01));
      legs.push({ hip, knee, front, side });
    }
  }
  g.userData = { legs, body, neck, head, tail };
  return g;
}

/**
 * Pose the horse: gait 'gallop' | 'idle' | 'rear' | 'fall' with phase u (0..1).
 * Rotation about +X moves a hoof backward, so a forward swing is negative.
 */
export function horsePose(h: THREE.Object3D, gait: 'gallop' | 'idle' | 'rear' | 'fall', u: number): void {
  const d = h.userData as { legs: HorseLegs[]; body: THREE.Object3D; neck: THREE.Object3D; head: THREE.Object3D; tail: THREE.Object3D };
  const w = Math.PI * 2 * u;
  d.body.position.set(0, 1.2, 0);
  d.body.rotation.set(0, 0, 0);
  d.neck.rotation.set(0, 0, 0);
  d.head.rotation.set(0, 0, 0);
  d.tail.rotation.set(0, 0, 0);
  h.rotation.set(0, 0, 0);
  h.position.set(0, 0, 0);
  for (const l of d.legs) {
    l.hip.rotation.set(0, 0, 0);
    l.knee.rotation.set(0, 0, 0);
  }
  if (gait === 'gallop') {
    // rotary gallop: hinds then fores, each pair slightly apart
    const phase: Record<string, number> = { 'f1': 0.5, 'f-1': 0.6, 'h1': 0.0, 'h-1': 0.1 };
    for (const l of d.legs) {
      const p = w + phase[`${l.front ? 'f' : 'h'}${l.side}`] * Math.PI * 2;
      const swing = Math.sin(p);
      l.hip.rotation.x = (l.front ? -0.62 : -0.5) * swing + (l.front ? 0 : 0.1);
      // bend the lower leg while it travels forward (recovering)
      const lift = Math.max(0, Math.cos(p));
      l.knee.rotation.x = l.front ? 1.25 * lift : -0.2 - 0.6 * lift;
      if (!l.front) l.hip.rotation.x += 0.35 * lift;
    }
    d.body.position.y = 1.2 + 0.07 * Math.sin(w * 2 + 0.6);
    d.body.rotation.x = 0.06 * Math.sin(w + 0.4);
    d.neck.rotation.x = 0.12 * Math.sin(w + 1.6);
    d.tail.rotation.x = -0.5 + 0.15 * Math.sin(w * 2);
  } else if (gait === 'idle') {
    d.body.position.y = 1.2 + 0.012 * Math.sin(w);
    d.neck.rotation.x = 0.05 + 0.06 * Math.sin(w);
    d.head.rotation.x = 0.06 * Math.sin(w + 1);
    d.tail.rotation.set(0.1, 0, 0.25 * Math.sin(w));
    // one hind hoof resting
    const rest = d.legs.find((l) => !l.front && l.side === -1);
    if (rest) rest.knee.rotation.x = -0.25;
  } else if (gait === 'rear') {
    // u: 0 -> 1 -> 0 envelope given by the caller (0 = standing, 1 = reared)
    const k = u;
    h.rotation.x = -0.42 * k;
    const hind = new THREE.Vector3(0, 0, -0.58);
    // pivot about the hind hooves
    h.position.set(0, -hind.z * Math.sin(-0.42 * k) * -1, hind.z * (1 - Math.cos(0.42 * k)));
    for (const l of d.legs) {
      if (l.front) {
        l.hip.rotation.x = -0.9 * k;
        l.knee.rotation.x = 1.3 * k;
      } else {
        l.hip.rotation.x = 0.3 * k;
        l.knee.rotation.x = -0.2 * k;
      }
    }
    d.neck.rotation.x = -0.35 * k;
    d.tail.rotation.x = 0.4 * k;
  } else if (gait === 'fall') {
    // collapse onto the far side: u 0 -> 1
    const k = Math.min(1, u);
    h.rotation.z = (-Math.PI / 2) * 0.92 * k;
    h.position.set(-0.55 * k, 0.32 * Math.sin(Math.PI * k) * 0.3, 0);
    for (const l of d.legs) {
      l.hip.rotation.x = (l.front ? -0.5 : 0.4) * k;
      l.knee.rotation.x = (l.front ? 0.9 : -0.6) * k;
    }
    d.neck.rotation.x = 0.5 * k;
    d.head.rotation.x = 0.3 * k;
  }
}

// ---------------------------------------------------------------------------
// glowing eyes: an emissive map that lights one palette cell of a mesh
// ---------------------------------------------------------------------------

/** make the palette cell `cell` ('col,row', 8x4 grid) of every mesh under `root` glow `color` */
export function glowCell(root: THREE.Object3D, cell: string, color: string, intensity = 2): void {
  const [c, r] = cell.split(',').map(Number);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = color;
  g.fillRect(c * 32, r * 32, 32, 32);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mt = m.material as THREE.MeshStandardMaterial;
    const tex = new THREE.CanvasTexture(canvas);
    if (mt.map) {
      tex.flipY = mt.map.flipY;
      tex.wrapS = mt.map.wrapS;
      tex.wrapT = mt.map.wrapT;
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    mt.emissive = new THREE.Color(0xffffff);
    mt.emissiveMap = tex;
    mt.emissiveIntensity = intensity;
    mt.needsUpdate = true;
  });
}

/** group helper re-export so defs import from one place */
export { at, group };
