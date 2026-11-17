/**
 * Deadite siege engines: battering ram and catapult. Owner: enemies art agent.
 * Built facing +X and mirrored (scale.x = -1) so the baked sprite faces left.
 */
import { staticBuilt, type Built } from '../character';
import { definePortrait } from '../icon';
import { defineSprite } from '../sprite';
import { smooth, TAU } from '../props_enemies';
import { buildRam, deathCollapse, pushPose, type RamBuilt } from '../props_siege';

const walkLen = 1.1; // seconds of the skeleton walk clip (approx; clamped by pose())

async function ramBuilt(): Promise<Built> {
  const r = await buildRam();
  r.root.scale.x = -1;
  const b = staticBuilt(r.root, { ram: r.body });
  (b as Built & { ram: RamBuilt }).ram = r;
  return b;
}
const R = (b: Built): RamBuilt => (b as Built & { ram: RamBuilt }).ram;

defineSprite({
  id: 'enemy_battering_ram',
  facing: -1,
  yaw: -25,
  build: ramBuilt,
  margin: 0.25,
  anims: {
    idle: {
      frames: 6,
      loop: true,
      duration: 1.07,
      apply: (b, u) => {
        const r = R(b);
        deathCollapse(r, 0);
        r.body.position.set(0, 0, 0);
        r.log.rotation.z = 0;
        pushPose(r, 0.2, 0.6);
        r.log.position.x = 0.03 * Math.sin(u * TAU);
        r.body.position.y = 0.01 * Math.sin(u * TAU * 2);
      },
    },
    walk: {
      frames: 12,
      loop: true,
      duration: 1.2,
      stride: 106,
      apply: (b, u) => {
        const r = R(b);
        deathCollapse(r, 0);
        r.body.position.set(0, 0, 0);
        r.log.rotation.z = 0;
        pushPose(r, ((u * 2) % 1) * walkLen);
        r.wheels.forEach((w) => (w.rotation.z = -u * Math.PI));
        r.body.position.y = 0.03 * Math.abs(Math.sin(u * TAU * 2));
        r.log.position.x = 0.12 * Math.sin(u * TAU * 2);
        r.log.rotation.z = 0.03 * Math.sin(u * TAU * 2);
      },
    },
    attack: {
      frames: 10,
      duration: 0.8,
      hitAt: 0.5,
      apply: (b, u) => {
        const r = R(b);
        deathCollapse(r, 0);
        r.body.position.set(0, 0, 0);
        r.log.rotation.z = 0;
        const back = smooth(u / 0.38);
        const slam = smooth((u - 0.38) / 0.12);
        const ret = smooth((u - 0.58) / 0.42);
        const x = -0.55 * back + (0.55 + 0.95) * slam - 0.95 * ret;
        r.log.position.x = x;
        pushPose(r, 0.2 + u * 0.4, 0.8 + 0.4 * slam);
        r.body.position.x = 0.12 * slam * (1 - ret);
      },
    },
    hurt: {
      frames: 4,
      duration: 0.3,
      apply: (b, u) => {
        const r = R(b);
        deathCollapse(r, 0);
        r.body.position.set(0, 0, 0);
        r.log.rotation.z = 0;
        pushPose(r, 0.2, 0.6);
        r.body.position.x = -0.06 * Math.sin(u * Math.PI);
        r.frame.rotation.z = 0.03 * Math.sin(u * Math.PI);
      },
    },
    die: {
      frames: 10,
      duration: 1.2,
      apply: (b, u) => {
        const r = R(b);
        deathCollapse(r, 0);
        r.body.position.set(0, 0, 0);
        r.log.rotation.z = 0;
        pushPose(r, 0.2, 0.6 * (1 - u));
        deathCollapse(r, u);
      },
    },
  },
});
definePortrait('portrait_enemy_battering_ram', 'enemies', ramBuilt, { yaw: 25, clip: undefined, span: 5.2, lookAt: [0.5, 1.3, 0], pitch: 14, apply: (b) => pushPose(R(b), 0.2, 0.6) });

// ---------------------------------------------------------------------------
// Catapult
// ---------------------------------------------------------------------------
import { pose } from '../assets';
import { bend } from '../props_enemies';
import { buildCatapult, type CatBuilt } from '../props_siege';

async function catBuilt(): Promise<Built> {
  const c = await buildCatapult();
  c.root.scale.x = -1;
  const b = staticBuilt(c.root, { body: c.body });
  (b as Built & { cat: CatBuilt }).cat = c;
  return b;
}
const C = (b: Built): CatBuilt => (b as Built & { cat: CatBuilt }).cat;
const RAD = Math.PI / 180;

/** arm angle in degrees (long end direction) */
function setArm(c: CatBuilt, deg: number, rock = true): void {
  c.arm.rotation.z = deg * RAD;
  c.rock.visible = rock;
  c.rock.rotation.z = -deg * RAD; // keep the rock upright in the bucket
}
function crewWalk(c: CatBuilt, t: number): void {
  pose(c.crew.inst!, 'Walking_D_Skeletons', t);
  for (const s of ['l', 'r']) bend(c.crew, `upperarm.${s}`, -55, 0, 0);
}

defineSprite({
  id: 'enemy_skeleton_catapult',
  facing: -1,
  yaw: -25,
  build: catBuilt,
  margin: 0.25,
  anims: {
    idle: {
      frames: 6,
      loop: true,
      duration: 1.07,
      apply: (b, u) => {
        const c = C(b);
        resetCat(c);
        setArm(c, 200 + 1.5 * Math.sin(u * TAU));
        pose(c.crew.inst!, 'Idle', u * 1.0);
      },
    },
    walk: {
      frames: 10,
      loop: true,
      duration: 1.2,
      stride: 118,
      apply: (b, u) => {
        const c = C(b);
        resetCat(c);
        c.wheels.forEach((w) => (w.rotation.z = -u * Math.PI));
        crewWalk(c, ((u * 2) % 1) * 1.1);
        c.body.position.y = 0.03 * Math.abs(Math.sin(u * TAU * 2));
        setArm(c, 200 + 2.5 * Math.sin(u * TAU * 2));
      },
    },
    attack: {
      frames: 10,
      duration: 1.0,
      hitAt: 0.45,
      apply: (b, u) => {
        const c = C(b);
        resetCat(c);
        const wind = smooth(u / 0.2); // pull back a little
        const swing = smooth((u - 0.22) / 0.26); // fast throw
        const ret = smooth((u - 0.62) / 0.38);
        let a = 200 + 12 * wind;
        a = a - (212 - 40) * swing; // down to 40 deg, forward and up
        a = a + (160) * ret; // wind back to rest
        const bounce = u > 0.48 && u < 0.62 ? 5 * Math.sin((u - 0.48) * 70) * (1 - (u - 0.48) / 0.14) : 0;
        setArm(c, a + bounce, u < 0.45);
        pose(c.crew.inst!, 'Interact', u * 0.9);
      },
    },
    hurt: {
      frames: 4,
      duration: 0.3,
      apply: (b, u) => {
        const c = C(b);
        resetCat(c);
        setArm(c, 200);
        pose(c.crew.inst!, 'Hit_A', u * 0.25);
        c.body.position.x = -0.05 * Math.sin(u * Math.PI);
      },
    },
    die: {
      frames: 10,
      duration: 1.2,
      apply: (b, u) => {
        const c = C(b);
        resetCat(c);
        const e = u * u;
        setArm(c, 200 - 150 * smooth(u * 1.4), u < 0.3);
        pose(c.crew.inst!, 'Death_C_Skeletons', u * 0.95);
        c.body.rotation.z = 10 * RAD * e;
        c.wheels.forEach((w, i) => {
          w.parent!.rotation.z = (i % 2 ? 1 : -1) * 20 * RAD * e;
          w.parent!.position.y = 0.5 - 0.1 * e;
        });
      },
    },
  },
});
definePortrait('portrait_enemy_skeleton_catapult', 'enemies', catBuilt, { yaw: 25, clip: undefined, span: 4.8, lookAt: [0.5, 1.5, 0], pitch: 14, apply: (b) => { setArm(C(b), 200); pose(C(b).crew.inst!, 'Idle', 0.2); } });

function resetCat(c: CatBuilt): void {
  c.body.position.set(0, 0, 0);
  c.body.rotation.z = 0;
  c.wheels.forEach((w) => {
    w.parent!.rotation.z = 0;
    w.parent!.position.y = 0.5;
  });
}
