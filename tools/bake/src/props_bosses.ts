/**
 * Procedural boss props: wings, horns, claws. Owner: bosses art agent.
 * Units: 1 = 75 logical px. Model space: +Z forward, +Y up, +X the character's left.
 */
import * as THREE from 'three';
import { at, box, cone, cyl, extrude, glow, group, lathe, mat, PAL, sphere, torus } from './props';

/** A bat wing pointing along +X from the shoulder (origin). Flap by rotating the returned group about Z. */
export function batWing(span = 1, membrane: number | string = 0x4a2a5a, bone: number | string = 0x2a1830): THREE.Group {
  const g = new THREE.Group();
  const s = span;
  const pts: Array<[number, number]> = [
    [0, 0.05],
    [0.45 * s, 0.5 * s],
    [1.5 * s, 1.0 * s],
    [1.22 * s, 0.4 * s],
    [1.5 * s, -0.05 * s],
    [1.05 * s, 0.0],
    [1.05 * s, -0.5 * s],
    [0.62 * s, -0.12 * s],
    [0.38 * s, -0.55 * s],
    [0.08 * s, -0.2 * s],
  ];
  g.add(extrude(pts, 0.03, mat(membrane, { side: THREE.DoubleSide })));
  // arm bone and fingers
  g.add(at(cyl(0.035, 0.045, 0.62 * s, bone, 6), 0.22 * s, 0.25 * s, 0.02, 0, 0, -62));
  g.add(at(cyl(0.025, 0.035, 1.15 * s, bone, 6), 0.95 * s, 0.75 * s, 0.02, 0, 0, -63));
  g.add(at(cyl(0.02, 0.025, 0.8 * s, bone, 6), 1.2 * s, 0.1 * s, 0.02, 0, 0, -80));
  g.add(at(cyl(0.02, 0.025, 0.7 * s, bone, 6), 0.78 * s, -0.1 * s, 0.02, 0, 0, -105));
  return g;
}

/** a curved-ish horn pointing +Y from the origin */
export function horn(len = 0.3, color: number | string = 0xd9c9a8): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cone(0.05, len * 0.6, color, 6), 0, len * 0.3, 0));
  g.add(at(cone(0.035, len * 0.5, color, 6), 0.05, len * 0.7, 0, 0, 0, -28));
  return g;
}

/** a clawed fingertip set at the origin, pointing +Y */
export function claws(color: number | string = 0x241a2a): THREE.Group {
  const g = new THREE.Group();
  for (let i = -1; i <= 1; i++) g.add(at(cone(0.022, 0.2, color, 5), i * 0.04, 0.12, 0.03, 0, 0, -i * 14));
  return g;
}

/** spiked helmet: a dark dome with four spikes and a brow ridge */
export function spikedHelm(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x2a2630, { rough: 0.5, metal: 0.6 });
  g.add(at(sphere(0.24, iron, 10), 0, 0.12, 0));
  g.add(at(cyl(0.255, 0.255, 0.07, iron, 10), 0, 0.02, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(at(cone(0.045, 0.16, 0x8a8f99, 6), Math.cos(a) * 0.2, 0.26, Math.sin(a) * 0.2, Math.sin(a) * 30, 0, -Math.cos(a) * 30));
  }
  g.add(at(cone(0.06, 0.22, 0x8a8f99, 6), 0, 0.36, 0));
  return g;
}

/** Gravedigger shovel. Grip at the origin, shaft along +Y (about 2.3 long), blade at the top end (+Y), face toward +Z. */
export function shovel(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cyl(0.05, 0.05, 2.1, PAL.wood, 7), 0, 0.6, 0));
  g.add(at(box(0.3, 0.07, 0.07, PAL.woodDark), 0, -0.42, 0)); // T grip
  const steel = mat(0x7d8790, { rough: 0.45, metal: 0.55 });
  g.add(at(extrude([[-0.24, 0], [0.24, 0], [0.26, 0.5], [0.12, 0.78], [0, 0.88], [-0.12, 0.78], [-0.26, 0.5]], 0.06, steel), 0, 1.6, 0));
  g.add(at(box(0.18, 0.12, 0.1, PAL.iron), 0, 1.62, 0));
  return g;
}

/** Bubbling cauldron on three legs. Origin at the ground; rim at y ~ 1.4; liquid disc at y 1.22. parts: liquid, bubbles[] */
export function cauldron(): { root: THREE.Group; bubbles: THREE.Object3D[]; liquid: THREE.Object3D } {
  const g = new THREE.Group();
  const iron = mat(0x2c2f36, { rough: 0.6, metal: 0.4 });
  g.add(lathe([[0.01, 0.12], [0.6, 0.1], [1.0, 0.45], [1.18, 0.95], [1.22, 1.35], [1.34, 1.42], [1.3, 1.5], [1.14, 1.44]], iron, 14));
  g.add(at(torus(1.24, 0.07, mat(0x4a4f5a, { rough: 0.5, metal: 0.5 }), 14), 0, 1.45, 0, 90, 0, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    g.add(at(cone(0.14, 0.5, iron, 6), Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7, 0, 0, 0));
  }
  const liquid = at(cyl(1.12, 1.12, 0.06, mat(0x7dff5a, { emissive: 0x4fe03a, emissiveIntensity: 1.1, rough: 0.3 }), 14), 0, 1.3, 0);
  g.add(liquid);
  const bubbles: THREE.Object3D[] = [];
  for (let i = 0; i < 5; i++) {
    const bub = sphere(0.13, mat(0xb8ff9a, { emissive: 0x7dff5a, emissiveIntensity: 0.9 }), 8);
    g.add(bub);
    bubbles.push(bub);
  }
  // ember glow under the pot
  g.add(at(glow('#ff8a1e', 0.9, 0.8), 0, 0.2, 0.1));
  return { root: g, bubbles, liquid };
}

export { PAL, group };

/** Wide-brimmed gravedigger hat. Origin at the head top of the skull, brim tilted back so the face stays visible. */
export function gravehat(): THREE.Group {
  const g = new THREE.Group();
  const felt = mat(0x1d1a22, { rough: 0.9 });
  const band = mat(0x6a2a2a, { rough: 0.7 });
  const brim = at(cyl(0.72, 0.78, 0.07, felt, 12), 0, 0, 0, -12, 0, 0);
  g.add(brim);
  g.add(at(cyl(0.34, 0.5, 0.5, felt, 10), 0, 0.28, -0.04));
  g.add(at(cyl(0.5, 0.52, 0.1, band, 10), 0, 0.1, -0.04));
  g.add(at(cone(0.34, 0.2, felt, 10), 0, 0.62, -0.04));
  return g;
}

/** Coffin with iron bands and a visible lid line. Long axis +Y, 1.6 long, faces +Z (front). Origin at its centre. */
export function bandedCoffin(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x4a2e1e, { rough: 0.85 });
  const lid = mat(0x5e3b27, { rough: 0.8 });
  const iron = mat(0x2a2d34, { rough: 0.5, metal: 0.5 });
  const pts: Array<[number, number]> = [[-0.2, -0.8], [0.2, -0.8], [0.32, -0.1], [0.22, 0.8], [-0.22, 0.8], [-0.32, -0.1]];
  g.add(extrude(pts, 0.42, wood));
  // lid: a slightly smaller, lighter slab on the front with a dark gap line around it
  g.add(at(extrude(pts.map(([x, y]) => [x * 0.86, y * 0.95] as [number, number]), 0.06, lid), 0, 0, 0.23));
  g.add(at(box(0.04, 1.5, 0.02, 0x120c0a), 0, 0, 0.27));
  for (const y of [-0.5, 0.05, 0.55]) g.add(at(box(0.72, 0.09, 0.5, iron), 0, y, 0));
  for (const y of [-0.5, 0.05, 0.55]) for (const x of [-0.24, 0.24]) g.add(at(sphere(0.035, 0x8a8f99, 5), x, y, 0.27));
  g.add(at(box(0.1, 0.34, 0.03, 0xb8a060), 0, 0.3, 0.27));
  g.add(at(box(0.26, 0.09, 0.03, 0xb8a060), 0, 0.38, 0.27));
  return g;
}

/** Bone crown: band, spikes and two curved horns. Origin at the base of the crown. */
export function boneCrown(): THREE.Group {
  const g = new THREE.Group();
  const bone = mat(0xe6d8bc, { rough: 0.7 });
  g.add(at(cyl(0.36, 0.38, 0.1, mat(0x3a2a48, { rough: 0.6 }), 10), 0, 0, 0));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const tall = i === 0 ? 0.62 : 0.38;
    g.add(at(cone(0.06, tall, bone, 5), Math.cos(a) * 0.32, tall / 2, Math.sin(a) * 0.32, Math.sin(a) * 12, 0, -Math.cos(a) * 12));
  }
  g.add(at(horn(0.55, 0xe6d8bc), 0.34, 0.05, 0, 0, 0, -32));
  g.add(at(horn(0.55, 0xe6d8bc), -0.34, 0.05, 0, 0, 0, 32));
  g.add(at(glow('#7dff5a', 0.2, 0.5), 0, 0.3, 0));
  return g;
}

/** Floating censer on a long chain hanging from a glowing anchor. Anchor at the origin, censer 1.3 below. */
export function floatingCenser(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x6a5a3a, { rough: 0.4, metal: 0.6 });
  g.add(at(glow('#b05cff', 0.2, 0.9), 0, 0, 0));
  for (let i = 0; i < 6; i++) g.add(at(torus(0.07, 0.025, iron, 6), 0, -0.2 - i * 0.18, 0, 0, i % 2 ? 90 : 0, 0));
  const pot = new THREE.Group();
  pot.position.set(0, -1.45, 0);
  pot.add(at(sphere(0.3, iron, 9), 0, 0, 0));
  pot.add(at(cone(0.12, 0.22, iron, 6), 0, 0.34, 0));
  pot.add(at(glow('#7dff5a', 0.3, 0.9), 0, 0, 0.1));
  pot.add(at(glow('#b05cff', 0.18, 0.6), 0, 0.5, 0));
  g.add(pot);
  return g;
}
