/**
 * Art that used to borrow a look-alike in game: the bear trap (spell), Morwen's holy light,
 * the Dawn Lance, and the boss throwables (Gravewright's coffin, Sir Hollow's pumpkin head,
 * Mother Mire's poison flask). Owner: lead.
 */
import * as THREE from 'three';
import { staticBuilt } from '../character';
import { defineSprite } from '../sprite';
import { at, box, cone, cyl, glow, group, mat, PAL, torus } from '../props';
import { centered, hotMesh, prop, DUN, HAL } from '../props_items';

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Bear trap: an iron jaw ring with teeth on a chain stake. idle = open, attack = snaps shut.
// ---------------------------------------------------------------------------
function jaw(side: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x3c3a40, { metal: 0.6, rough: 0.45 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 6, 18, Math.PI), iron);
  g.add(rim);
  for (let i = 1; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    const t = cone(0.04, 0.12, 0xb8b4ae, 4, { metal: 0.5, rough: 0.4 });
    t.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3 - 0.05, 0);
    t.rotation.z = a - Math.PI / 2 + Math.PI;
    g.add(t);
  }
  g.rotation.y = side > 0 ? 0 : Math.PI;
  return g;
}
defineSprite({
  id: 'bear_trap',
  facing: 1,
  yaw: 20,
  outline: 1.1,
  margin: 0.12,
  build: async () => {
    const root = new THREE.Group();
    const base = cyl(0.1, 0.12, 0.05, 0x2a282e, 10, { metal: 0.6, rough: 0.5 });
    base.position.y = 0.025;
    root.add(base);
    const plate = cyl(0.13, 0.13, 0.02, 0x6a5a40, 10, { rough: 0.8 });
    plate.position.y = 0.06;
    root.add(plate);
    // spring bars along the ground
    for (const s of [1, -1]) root.add(at(box(0.6, 0.04, 0.06, 0x2f2d33, { metal: 0.6 }), 0, 0.03, s * 0.08));
    // chain links to a stake
    for (let i = 0; i < 4; i++) {
      const l = torus(0.04, 0.012, 0x4a484e, 8);
      l.position.set(-0.36 - i * 0.07, 0.03, 0.1);
      l.rotation.set(Math.PI / 2, 0, (i % 2) * Math.PI / 2);
      root.add(l);
    }
    root.add(at(cyl(0.025, 0.01, 0.2, 0x2a282e, 6), -0.66, 0.08, 0.1));
    const jl = group(jaw(1));
    const jr = group(jaw(-1));
    root.add(jl, jr);
    return staticBuilt(root, { jl, jr });
  },
  anims: {
    idle: {
      frames: 1,
      loop: true,
      duration: 1,
      apply: (b) => {
        // open: jaws lie almost flat
        b.parts.jl.rotation.x = -80 * RAD;
        b.parts.jr.rotation.x = 80 * RAD;
        b.parts.jl.position.y = b.parts.jr.position.y = 0.05;
      },
    },
    attack: {
      frames: 5,
      loop: false,
      duration: 0.25,
      apply: (b, u) => {
        const a = 80 * (1 - Math.min(1, u * 1.6));
        b.parts.jl.rotation.x = -a * RAD;
        b.parts.jr.rotation.x = a * RAD;
        b.parts.jl.position.y = b.parts.jr.position.y = 0.05;
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Holy light: a white-gold orb with a cross flare, pointing right.
// ---------------------------------------------------------------------------
defineSprite({
  id: 'holy_light',
  facing: 1,
  yaw: 0,
  shadow: false,
  outline: 0,
  margin: 0.5,
  build: async () => {
    const g = new THREE.Group();
    g.add(glow(0xffe8a0, 0.6, 0.9));
    g.add(hotMesh(new THREE.SphereGeometry(0.16, 12, 10), 3.6, 3.4, 2.6));
    g.add(hotMesh(new THREE.SphereGeometry(0.24, 12, 10), 2.4, 2.0, 0.9, { opacity: 0.45 }));
    const flare = new THREE.Group();
    for (const [w, h] of [[0.9, 0.05], [0.05, 0.62]] as const) flare.add(hotMesh(new THREE.BoxGeometry(w, h, 0.02), 3.2, 3.0, 2.0, { opacity: 0.8 }));
    g.add(flare);
    // short trailing streak
    const tail = hotMesh(new THREE.CylinderGeometry(0.12, 0.01, 0.7, 8), 2.6, 2.2, 1.0, { opacity: 0.5 });
    tail.rotation.z = 90 * RAD;
    tail.position.x = -0.38;
    g.add(tail);
    return staticBuilt(g, { flare });
  },
  anims: {
    idle: {
      frames: 4,
      loop: true,
      duration: 0.3,
      apply: (b, u) => {
        b.parts.flare.rotation.z = u * (Math.PI / 2);
        b.parts.flare.scale.setScalar(0.9 + 0.2 * Math.sin(u * TAU));
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Dawn Lance: a long spear of morning light, pointing right.
// ---------------------------------------------------------------------------
defineSprite({
  id: 'lance',
  facing: 1,
  yaw: 0,
  shadow: false,
  outline: 0,
  margin: 0.4,
  build: async () => {
    const g = new THREE.Group();
    const shaft = hotMesh(new THREE.CylinderGeometry(0.045, 0.045, 2.2, 8), 3.0, 2.4, 1.1);
    shaft.rotation.z = -90 * RAD;
    g.add(shaft);
    const halo = hotMesh(new THREE.CylinderGeometry(0.12, 0.05, 2.4, 10), 2.2, 1.4, 0.4, { opacity: 0.4 });
    halo.rotation.z = -90 * RAD;
    halo.position.x = -0.1;
    g.add(halo);
    const tip = hotMesh(new THREE.ConeGeometry(0.13, 0.5, 4), 3.8, 3.6, 2.8);
    tip.rotation.z = -90 * RAD;
    tip.position.x = 1.33;
    g.add(tip);
    const guard = hotMesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), 3.2, 2.6, 1.2);
    guard.position.x = 1.05;
    g.add(guard);
    const head = glow(0xffd070, 0.55, 1);
    head.position.x = 1.3;
    g.add(head);
    return staticBuilt(g, { halo });
  },
  anims: {
    idle: {
      frames: 4,
      loop: true,
      duration: 0.24,
      apply: (b, u) => {
        b.parts.halo.scale.set(1 + 0.15 * Math.sin(u * TAU), 1, 1 + 0.15 * Math.sin(u * TAU));
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Boss throwables (falling hazards): they tumble while they drop.
// ---------------------------------------------------------------------------
function tumble(frames: number, duration: number, axis: 'x' | 'z' = 'z') {
  return {
    idle: {
      frames,
      loop: true,
      duration,
      apply: (b: { parts: Record<string, THREE.Object3D> }, u: number) => {
        b.parts.spin.rotation[axis] = -u * TAU;
      },
    },
  };
}

defineSprite({
  id: 'coffin',
  facing: 1,
  yaw: 20,
  shadow: false,
  outline: 1.2,
  margin: 0.15,
  build: async () => {
    const c = centered(await prop(`${HAL}/coffin.gltf`));
    c.scale.setScalar(0.85);
    const spin = group(c);
    return staticBuilt(group(spin), { spin });
  },
  anims: tumble(8, 0.7),
});

defineSprite({
  id: 'pumpkin_head',
  facing: -1,
  yaw: -25,
  shadow: false,
  outline: 1.2,
  margin: 0.4,
  build: async () => {
    const p = centered(await prop(`${HAL}/pumpkin_orange_jackolantern.gltf`));
    p.scale.setScalar(0.7);
    const spin = group(p);
    // the candle inside burns
    const inner = glow(0xff9a30, 0.55, 0.9);
    spin.add(inner);
    return staticBuilt(group(spin), { spin });
  },
  anims: tumble(8, 0.6),
});

defineSprite({
  id: 'poison_flask',
  facing: 1,
  yaw: 15,
  shadow: false,
  outline: 1.2,
  margin: 0.35,
  build: async () => {
    const b = centered(await prop(`${DUN}/bottle_A_green.gltf.glb`));
    b.scale.setScalar(1.2);
    const spin = group(b);
    // green fumes leaking from the neck
    const fume = glow(0x8aff5a, 0.4, 0.8);
    fume.position.y = 0.32;
    spin.add(fume);
    return staticBuilt(group(spin), { spin });
  },
  anims: tumble(8, 0.6),
});

void PAL;
