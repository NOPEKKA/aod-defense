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
