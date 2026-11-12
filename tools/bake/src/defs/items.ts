/**
 * Small art: projectiles, pickups, the Necronomicon, the pit lid, the Deathcoaster cart,
 * plus the spell and item icon sets. Owner: items art agent.
 * Effect sheets (fx_*) are procedural and live in ../fxsheet.ts.
 */
import * as THREE from 'three';
import { staticBuilt } from '../character';
import { defineSprite } from '../sprite';
import { buildArrow, buildBolt, buildCart, buildCoin, buildFood, buildManaOrb, buildNecro, buildPit, buildShot } from '../props_items';

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const BOOK_Y = 0.5 * 1.4 + 0.33;

// ---------------------------------------------------------------------------
// projectiles: one frame each, pointing right, no shadow
// ---------------------------------------------------------------------------
defineSprite({
  id: 'arrow',
  facing: 1,
  yaw: 14,
  shadow: false,
  outline: 1,
  margin: 0.08,
  build: async () => staticBuilt(await buildArrow()),
  anims: { idle: { frames: 1, loop: true, duration: 1 } },
});
defineSprite({
  id: 'bolt',
  facing: 1,
  yaw: 14,
  shadow: false,
  outline: 1,
  margin: 0.08,
  build: async () => staticBuilt(buildBolt()),
  anims: { idle: { frames: 1, loop: true, duration: 1 } },
});
defineSprite({
  id: 'shot',
  facing: 1,
  yaw: 10,
  shadow: false,
  outline: 0,
  margin: 0.6,
  build: async () => staticBuilt(buildShot()),
  anims: { idle: { frames: 1, loop: true, duration: 1 } },
});

// ---------------------------------------------------------------------------
// pickups
// ---------------------------------------------------------------------------
defineSprite({
  id: 'coin',
  facing: 1,
  yaw: 0,
  outline: 1.2,
  margin: 0.1,
  build: async () => {
    const c = await buildCoin();
    return staticBuilt(c.root, { spin: c.spin });
  },
  anims: {
    idle: {
      frames: 8,
      loop: true,
      duration: 0.8,
      apply: (b, u) => {
        b.parts.spin.rotation.y = u * TAU;
      },
    },
  },
});

defineSprite({
  id: 'mana_orb',
  facing: 1,
  yaw: 0,
  outline: 0.8,
  margin: 0.1,
  build: async () => {
    const o = buildManaOrb();
    return staticBuilt(o.root, { halo: o.halo, core: o.core, shell: o.shell, s0: o.sparks[0], s1: o.sparks[1], s2: o.sparks[2] });
  },
  anims: {
    idle: {
      frames: 6,
      loop: true,
      duration: 0.9,
      apply: (b, u) => {
        const p = 0.5 + 0.5 * Math.sin(u * TAU);
        b.parts.core.scale.setScalar(0.92 + 0.2 * p);
        b.parts.shell.scale.setScalar(0.94 + 0.12 * p);
        ['s0', 's1', 's2'].forEach((k, i) => {
          const a = u * TAU + (i * TAU) / 3;
          b.parts[k].position.set(Math.cos(a) * 0.3, Math.sin(a * 2) * 0.05 + (i - 1) * 0.07, Math.sin(a) * 0.3);
        });
      },
    },
  },
});

defineSprite({
  id: 'food',
  facing: 1,
  yaw: 20,
  outline: 1.2,
  build: async () => staticBuilt(await buildFood()),
  anims: { idle: { frames: 1, loop: true, duration: 1 } },
});

// ---------------------------------------------------------------------------
// Necronomicon on a stone stand (the book the player defends / charges)
// ---------------------------------------------------------------------------
defineSprite({
  id: 'book',
  facing: 1,
  yaw: 8,
  outline: 0,
  margin: 0.6,
  build: async () => {
    const n = await buildNecro();
    return staticBuilt(n.root, { book: n.book, halo: n.halo, eye: n.eye, runes: n.runes, p0: n.pages[0], p1: n.pages[1], p2: n.pages[2], p3: n.pages[3] });
  },
  anims: {
    idle: {
      frames: 8,
      loop: true,
      duration: 1.6,
      apply: (b, u) => {
        const p = 0.5 + 0.5 * Math.sin(u * TAU);
        for (const k of ['p0', 'p1', 'p2', 'p3']) b.parts[k].visible = false;
        b.parts.book.rotation.z = 0;
        b.parts.book.position.set(0, BOOK_Y, 0.02);
        b.parts.book.position.y = BOOK_Y + 0.02 * Math.sin(u * TAU);
        b.parts.halo.scale.setScalar(1.6 + 0.35 * p);
        (b.parts.halo.material as THREE.SpriteMaterial).opacity = 0.8 + 0.2 * p;
        b.parts.eye.scale.set(1, 0.55 + 0.4 * p, 0.6);
        b.parts.runes.scale.setScalar(0.96 + 0.06 * p);
      },
    },
    hurt: {
      frames: 4,
      duration: 0.3,
      apply: (b, u) => {
        const k = 1 - u;
        const sh = Math.sin(u * 9 * Math.PI) * 0.045 * (0.4 + k);
        b.parts.book.position.set(sh, BOOK_Y + 0.03 * k, 0.02);
        b.parts.book.rotation.z = Math.sin(u * 7 * Math.PI) * 0.12 * k;
        b.parts.halo.scale.setScalar(2.3 - 0.5 * u);
        b.parts.eye.scale.set(1.25, 1.1, 0.6);
        ['p0', 'p1', 'p2', 'p3'].forEach((key, i) => {
          const pg = b.parts[key];
          pg.visible = true;
          const t = u + i * 0.05;
          pg.position.set((i - 1.5) * 0.17, 0.3 + t * 0.6 + i * 0.05, 0.1 + 0.05 * i);
          pg.rotation.set(t * 5 + i, t * 3, t * 4 - i);
        });
      },
    },
  },
});

// ---------------------------------------------------------------------------
// pit lid (a trapdoor over the pit defence): 70 x 34 px footprint
// ---------------------------------------------------------------------------
defineSprite({
  id: 'pit_lid',
  facing: 1,
  yaw: 0,
  outline: 1,
  margin: 0.1,
  restAnim: 'idle',
  build: async () => {
    const p = buildPit();
    return staticBuilt(p.root, { hinge: p.hinge });
  },
  anims: {
    idle: { frames: 1, loop: true, duration: 1, clipGround: true, apply: (b) => (b.parts.hinge.rotation.x = 0) },
    open: {
      frames: 6,
      clipGround: true,
      duration: 0.45,
      apply: (b, u) => {
        // falls open: slow start, quick finish, a small rebound at the end
        const e = u * u * (3 - 2 * u);
        const a = 88 * e - (u > 0.8 ? Math.sin((u - 0.8) * 5 * Math.PI) * 4 : 0);
        b.parts.hinge.rotation.x = a * RAD;
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Deathcoaster: war cart with spinning blades (our own design)
// ---------------------------------------------------------------------------
defineSprite({
  id: 'fx_deathcoaster',
  facing: 1,
  yaw: -25,
  outline: 0,
  margin: 0.2,
  build: async () => {
    const c = buildCart();
    c.root.scale.setScalar(0.76);
    return staticBuilt(c.root, { body: c.body, ...Object.fromEntries(c.wheels.map((w, i) => ['w' + i, w])) });
  },
  anims: {
    walk: {
      frames: 8,
      loop: true,
      duration: 0.4,
      stride: 150,
      apply: (b, u) => {
        for (let i = 0; i < 4; i++) b.parts['w' + i].rotation.z = -u * (TAU / 8) * 3;
        b.parts.body.position.y = 0.025 * Math.sin(u * TAU * 2);
        b.parts.body.rotation.z = 0.012 * Math.sin(u * TAU * 2 + 1);
      },
    },
  },
});
