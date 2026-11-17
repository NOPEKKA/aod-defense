/**
 * Ghost horse for Sir Hollow. Owner: bosses art agent.
 * Faces +Z. Origin on the ground between the hooves. The back (saddle) is at y ~ 2.0.
 */
import * as THREE from 'three';
import { at, box, cone, glow, mat, sphere } from './props';

export type Leg = THREE.Group & { knee: THREE.Group };

export function ghostHorse(): { root: THREE.Group; legs: Leg[]; body: THREE.Group; neck: THREE.Group; tail: THREE.Group } {
  const root = new THREE.Group();
  const skin = mat(0xa9c4d8, { rough: 0.55, emissive: 0x3a78b8, emissiveIntensity: 0.55 });
  const dark = mat(0x6e8aa6, { rough: 0.6, emissive: 0x2a5a98, emissiveIntensity: 0.5 });
  const flame = '#6ad0ff';
  const body = new THREE.Group();
  body.add(at(box(1.05, 1.0, 2.2, skin), 0, 1.7, 0));
  body.add(at(sphere(0.62, skin, 9), 0, 1.75, 0.95));
  body.add(at(sphere(0.6, skin, 9), 0, 1.72, -0.95));
  body.add(at(box(1.15, 0.12, 1.0, mat(0x2a2f55, { rough: 0.9 })), 0, 2.24, -0.1));
  const neck = new THREE.Group();
  neck.position.set(0, 2.0, 1.05);
  neck.add(at(box(0.6, 1.2, 0.6, skin), 0, 0.5, 0.2, 38, 0, 0));
  neck.add(at(box(0.55, 0.55, 1.0, skin), 0, 1.2, 0.85, 12, 0, 0));
  neck.add(at(box(0.45, 0.4, 0.4, dark), 0, 1.1, 1.4, 12, 0, 0));
  for (const x of [-0.18, 0.18]) {
    neck.add(at(cone(0.1, 0.32, skin, 5), x, 1.62, 0.6));
    neck.add(at(sphere(0.07, mat(0xbff0ff, { emissive: 0x6ad0ff, emissiveIntensity: 3 }), 6), x * 1.4, 1.35, 1.1));
  }
  neck.add(at(glow(flame, 0.35, 0.9), 0, 1.4, 1.1));
  for (let i = 0; i < 5; i++) neck.add(at(glow(flame, 0.34, 0.8), 0, 0.5 + i * 0.28, -0.4 + i * 0.1));
  body.add(neck);
  const tail = new THREE.Group();
  tail.position.set(0, 2.0, -1.1);
  for (let i = 0; i < 4; i++) tail.add(at(glow(flame, 0.34 - i * 0.04, 0.8), 0, -0.2 - i * 0.3, -0.25 - i * 0.18));
  tail.add(at(cone(0.16, 1.0, dark, 5), 0, -0.5, -0.3, 160, 0, 0));
  body.add(tail);
  root.add(body);
  const legs: Leg[] = [];
  for (const [x, z] of [[0.36, 0.85], [-0.36, 0.85], [0.36, -0.85], [-0.36, -0.85]]) {
    const hip = new THREE.Group() as Leg;
    hip.position.set(x, 1.4, z);
    hip.add(at(box(0.3, 0.7, 0.3, skin), 0, -0.3, 0));
    const knee = new THREE.Group();
    knee.position.set(0, -0.65, 0);
    knee.add(at(box(0.22, 0.6, 0.22, dark), 0, -0.3, 0));
    knee.add(at(box(0.3, 0.14, 0.34, mat(0x3a4a6a)), 0, -0.64, 0.03));
    hip.add(knee);
    hip.knee = knee;
    root.add(hip);
    legs.push(hip);
  }
  root.add(at(glow(flame, 1.6, 0.35), 0, 0.15, 0));
  return { root, legs, body, neck, tail };
}
