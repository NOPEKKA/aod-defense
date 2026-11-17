/**
 * Procedural boss props: wings, horns, claws. Owner: bosses art agent.
 * Units: 1 = 75 logical px. Model space: +Z forward, +Y up, +X the character's left.
 */
import * as THREE from 'three';
import { at, box, cone, cyl, extrude, group, mat, PAL, sphere } from './props';

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
    g.add(at(cone(0.045, 0.22, 0x8a8f99, 6), Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2, Math.sin(a) * 30, 0, -Math.cos(a) * 30));
  }
  g.add(at(cone(0.06, 0.3, 0x8a8f99, 6), 0, 0.4, 0));
  g.add(at(box(0.04, 0.2, 0.05, iron), 0, 0.02, 0.24));
  return g;
}

export { PAL, group };
