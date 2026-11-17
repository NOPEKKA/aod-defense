/**
 * Small Deadite sprites: rock (catapult ammo), fireball (wizard ammo), bone gibs.
 * Owner: enemies art agent.
 */
import * as THREE from 'three';
import { staticBuilt } from '../character';
import { defineSprite } from '../sprite';
import { at, glow, group, mat } from '../props';
import { hot, hotMesh, centered, prop, HAL } from '../props_items';
import { boulder } from '../props_siege';
import { TAU } from '../props_enemies';

const RAD = Math.PI / 180;

// rock: grey boulder tumbling, 6-frame loop
defineSprite({
  id: 'rock',
  facing: 1,
  yaw: 0,
  shadow: false,
  outline: 1.2,
  margin: 0.1,
  build: async () => {
    const r = new THREE.Group();
    const rock = boulder(0.34);
    rock.scale.set(1, 0.88, 1.05);
    const spin = group(rock);
    r.add(spin);
    // a few lighter facets read as chips
    const chip = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), mat(0xa4a8b2, { rough: 0.9 }));
    chip.position.set(0.22, 0.14, 0.2);
    rock.add(chip);
    return staticBuilt(r, { spin });
  },
  anims: {
    idle: {
      frames: 6,
      loop: true,
      duration: 0.5,
      apply: (b, u) => {
        b.parts.spin.rotation.set(u * TAU * 0.5, 0, -u * TAU);
      },
    },
  },
});

// fireball: built pointing +X, mirrored to point left
defineSprite({
  id: 'fireball',
  facing: -1,
  yaw: 10,
  shadow: false,
  outline: 0,
  margin: 0.5,
  build: async () => {
    const g = new THREE.Group();
    const flame = new THREE.Group();
    g.add(flame);
    const halo = glow(0xff7a1a, 0.75, 0.9);
    g.add(halo);
    const shell = hotMesh(new THREE.SphereGeometry(0.3, 12, 10), 2.6, 0.9, 0.15, { opacity: 0.85 });
    g.add(shell);
    const core = hotMesh(new THREE.SphereGeometry(0.2, 12, 10), 3.4, 2.8, 1.4);
    g.add(core);
    const tails: THREE.Mesh[] = [];
    for (const [y, z, len, r, c] of [
      [0, 0, 1.0, 0.26, [1.7, 0.4, 0.04]],
      [0.12, 0.1, 0.8, 0.16, [2.3, 0.9, 0.1]],
      [-0.12, -0.08, 0.7, 0.14, [2.3, 0.9, 0.1]],
      [0.02, -0.14, 0.55, 0.1, [3.0, 1.9, 0.5]],
    ] as const) {
      const t = hotMesh(new THREE.ConeGeometry(r, len, 7), c[0], c[1], c[2], { opacity: 0.85 });
      t.rotation.z = 90 * RAD; // apex toward -X (the tail), base at the head
      t.position.set(-len / 2 - 0.05, y, z);
      t.userData.len = len;
      tails.push(t);
      flame.add(t);
    }
    g.position.x = 0.2;
    const root = new THREE.Group();
    root.add(g);
    root.scale.x = -1;
    return staticBuilt(root, { flame, halo, core, shell, ...Object.fromEntries(tails.map((t, i) => ['t' + i, t])) });
  },
  anims: {
    idle: {
      frames: 6,
      loop: true,
      duration: 0.4,
      apply: (b, u) => {
        for (let i = 0; i < 4; i++) {
          const t = b.parts['t' + i] as THREE.Mesh;
          const len = t.userData.len as number;
          const k = 1 + 0.22 * Math.sin(u * TAU + i * 1.7);
          t.scale.set(1, k, 1);
          t.position.x = -(len * k) / 2 - 0.05;
          t.position.y = (i % 2 ? -1 : 1) * 0.1 * Math.sin(u * TAU + i);
        }
        const p = 0.5 + 0.5 * Math.sin(u * TAU);
        b.parts.core.scale.setScalar(0.94 + 0.12 * p);
        b.parts.shell.scale.setScalar(0.95 + 0.14 * (1 - p));
      },
    },
  },
});

// bone gibs: single frames, slightly larger than life
for (const [id, file, scale, rz] of [
  ['gib_bone_a', 'bone_A', 2.0, 20],
  ['gib_bone_b', 'bone_B', 2.0, -25],
  ['gib_bone_c', 'bone_C', 1.3, 40],
  ['gib_skull', 'skull', 0.7, 0],
] as const) {
  defineSprite({
    id,
    facing: -1,
    yaw: 35,
    shadow: false,
    outline: 1,
    margin: 0.08,
    build: async () => {
      const o = await prop(`${HAL}/${file}.gltf`);
      const c = centered(o, true);
      c.rotation.z = rz * RAD;
      const r = new THREE.Group();
      r.add(c);
      r.scale.setScalar(scale);
      return staticBuilt(r);
    },
    anims: { idle: { frames: 1, loop: true, duration: 1 } },
  });
}
void at;
void hot;
