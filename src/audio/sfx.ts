/**
 * audio/sfx.ts - every sound effect as a small synthesised patch.
 *
 * A patch gets a scheduling context (`C`) and layers tones / noise / metal / thumps on
 * it. `p` is a pitch multiplier (random variation is applied by the caller), `i` an
 * intensity 0..1 and `n` a free integer (combo step, variant index ...).
 */
import { type Engine, mtof, rnd, vary } from './engine';

export interface C {
  e: Engine;
  /** start time (context clock) */
  t: number;
  /** destination node for this voice (gain -> pan -> sfx bus) */
  out: AudioNode;
  p: number;
  i: number;
  n: number;
}

export interface SfxDef {
  fn: (c: C) => void;
  /** minimum seconds between two plays of this sound */
  gap: number;
  /** max simultaneous instances (approximate, by life time) */
  max: number;
  /** priority 0..2: low ones are dropped first under load */
  prio: number;
  /** base gain */
  vol: number;
  /** reverb send */
  wet: number;
  /** seconds the sound can ring (used for voice accounting and cleanup) */
  life: number;
}

const def = (fn: (c: C) => void, life: number, o: Partial<SfxDef> = {}): SfxDef => ({
  fn,
  life,
  gap: o.gap ?? 0.03,
  max: o.max ?? 4,
  prio: o.prio ?? 1,
  vol: o.vol ?? 0.7,
  wet: o.wet ?? 0.12,
});

// small scale tables used by the economy sounds
const PENT = [0, 2, 4, 7, 9]; // major pentatonic
const penta = (step: number, root = 72): number => {
  const oct = Math.floor(step / 5);
  return root + oct * 12 + PENT[((step % 5) + 5) % 5];
};

/** several very short filtered clicks: the sound of bone */
function bones(c: C, count: number, spread: number, vol: number, f0: number): void {
  const { e, t, out } = c;
  for (let k = 0; k < count; k++) {
    if (!e.hasRoom()) break;
    const at = t + Math.pow(Math.random(), 1.3) * spread;
    const f = f0 * rnd(0.7, 1.5) * c.p;
    e.noise(at, rnd(0.012, 0.03), vol * rnd(0.5, 1), { filter: 'bandpass', f, q: 4, dest: out });
    if (k % 2 === 0) e.tone(at, f * 0.5, 0.03, vol * 0.5, { type: 'triangle', f1: f * 0.3, dest: out });
  }
}

/** a bang: noise crack + thump + low rumble */
function bang(c: C, size: number): void {
  const { e, t, out } = c;
  e.noise(t, 0.04, 0.9, { filter: 'highpass', f: 2500, dest: out });
  e.noise(t, 0.12 + 0.3 * size, 0.9, { filter: 'lowpass', f: 7000 * c.p, f1: 220, q: 0.6, dest: out });
  e.thump(t, 170 * c.p, 38, 0.2 + 0.25 * size, 1.0, out);
  if (size > 0.5) e.noise(t + 0.02, 0.7 * size, 0.5, { color: 'brown', filter: 'lowpass', f: 400, f1: 60, dest: out });
}

function twang(c: C, at: number, f: number, vol: number): void {
  const { e, out } = c;
  e.tone(at, f * c.p, 0.14, vol, { type: 'triangle', f1: f * c.p * 0.45, a: 0.001, dest: out });
  e.noise(at, 0.07, vol * 0.7, { filter: 'highpass', f: 3000, dest: out });
}

function horn(c: C, at: number, midi: number, dur: number, vol: number, bright = 1): void {
  const { e, out } = c;
  const f = mtof(midi) * c.p;
  e.tone(at, f, dur, vol, { type: 'sawtooth', a: 0.06, r: dur * 0.5, lp: 500 * bright, lpEnd: 2200 * bright, q: 1.2, vib: [5.5, 10], vibDelay: 0.12, dest: out });
  e.tone(at, f * 1.004, dur, vol * 0.6, { type: 'square', a: 0.07, r: dur * 0.5, lp: 700 * bright, lpEnd: 1600 * bright, dest: out });
}

function clank(c: C, at: number, f: number, vol: number): void {
  c.e.metal(at, f * c.p, 0.22, vol, c.out, [1, 2.4, 4.1, 6.3]);
  c.e.noise(at, 0.02, vol, { filter: 'highpass', f: 4000, dest: c.out });
}

function screech(c: C, f: number, dur: number, vol: number): void {
  const { e, t, out } = c;
  const fp = f * c.p;
  e.tone(t, fp * 0.8, dur, vol, { type: 'sawtooth', f1: fp * 1.5, a: 0.02, r: dur * 0.6, lp: 3200, q: 3, vib: [31, 160], dest: out });
  e.tone(t + dur * 0.15, fp * 1.5, dur * 0.7, vol * 0.5, { type: 'square', f1: fp * 0.9, a: 0.03, lp: 2800, vib: [24, 220], dest: out });
  e.noise(t, dur, vol * 0.3, { filter: 'bandpass', f: 2600, q: 2, dest: out });
}

function roar(c: C, f: number, dur: number, vol: number): void {
  const { e, t, out } = c;
  const fp = f * c.p;
  e.tone(t, fp, dur, vol, { type: 'sawtooth', f1: fp * 0.6, a: 0.05, r: dur * 0.5, lp: 900, lpEnd: 250, q: 4, vib: [18, 70], dest: out });
  e.tone(t, fp * 2.01, dur, vol * 0.5, { type: 'square', f1: fp * 1.2, a: 0.05, r: dur * 0.5, lp: 700, lpEnd: 300, vib: [23, 90], dest: out });
  e.noise(t, dur, vol * 0.55, { color: 'brown', filter: 'bandpass', f: 400, f1: 200, q: 1.5, a: 0.05, dest: out });
  e.thump(t, fp * 0.8, fp * 0.25, dur, vol, out);
}

function bell(c: C, at: number, midi: number, dur: number, vol: number): void {
  c.e.metal(at, mtof(midi) * c.p, dur, vol, c.out, [1, 2, 2.4, 3, 4.2, 5.4]);
}

function ratchet(c: C, at: number, count: number, gapT: number, vol: number): void {
  for (let k = 0; k < count; k++) {
    const a = at + k * gapT * (1 - k * 0.04);
    c.e.noise(a, 0.015, vol, { filter: 'bandpass', f: 2200 + k * 90, q: 5, dest: c.out });
    c.e.tone(a, 900 + k * 40, 0.02, vol * 0.4, { type: 'square', lp: 2500, dest: c.out });
  }
}

export const SFX: Record<string, SfxDef> = {
  // ------------------------------------------------------------------ Ash
  ash_shotgun: def(
    (c) => {
      const { e, t, out } = c;
      bang(c, 0.5);
      // pump action
      e.noise(t + 0.34, 0.025, 0.4, { filter: 'bandpass', f: 1800, q: 6, dest: out });
      e.metal(t + 0.34, 520 * c.p, 0.06, 0.16, out, [1, 2.7]);
      e.noise(t + 0.43, 0.03, 0.45, { filter: 'bandpass', f: 1400, q: 6, dest: out });
      e.metal(t + 0.43, 380 * c.p, 0.07, 0.16, out, [1, 3.1]);
    },
    0.7,
    { gap: 0.12, max: 3, prio: 2, vol: 0.85, wet: 0.2 },
  ),
  chainsaw_rev: def(
    (c) => {
      const { e, t, out } = c;
      const f = 62 * c.p;
      e.tone(t, f, 0.45, 0.45, { type: 'sawtooth', f1: f * 2.1, a: 0.04, r: 0.2, lp: 700, lpEnd: 2400, q: 2, vib: [27, 400], dest: out });
      e.tone(t, f * 2, 0.45, 0.25, { type: 'square', f1: f * 4.2, a: 0.05, lp: 1500, vib: [31, 500], dest: out });
      e.noise(t, 0.45, 0.35, { filter: 'bandpass', f: 1600, f1: 3200, q: 1.2, a: 0.05, dest: out });
    },
    0.55,
    { gap: 0.8, max: 1, prio: 1, vol: 0.55, wet: 0.08 },
  ),
  chainsaw_bite: def(
    (c) => {
      const { e, t, out } = c;
      const f = 90 * c.p;
      e.tone(t, f, 0.2, 0.5, { type: 'sawtooth', f1: f * 1.4, a: 0.006, lp: 1800, lpEnd: 600, q: 3, vib: [38, 600], dest: out });
      e.noise(t, 0.18, 0.5, { filter: 'bandpass', f: 2800, f1: 900, q: 1.5, dest: out });
      e.thump(t, 150 * c.p, 55, 0.12, 0.6, out);
      bones(c, 3, 0.1, 0.25, 2600);
    },
    0.3,
    { gap: 0.07, max: 3, prio: 2, vol: 0.7, wet: 0.08 },
  ),
  ash_hurt: def(
    (c) => {
      const { e, t, out } = c;
      e.thump(t, 140 * c.p, 48, 0.2, 0.8, out);
      e.noise(t, 0.12, 0.4, { filter: 'lowpass', f: 1800, f1: 300, dest: out });
      // a gruff "ugh": two formants on a falling saw
      const f = 150 * c.p;
      e.tone(t + 0.02, f, 0.22, 0.35, { type: 'sawtooth', f1: f * 0.7, a: 0.01, lp: 900, q: 5, dest: out });
      e.tone(t + 0.02, f * 1.01, 0.2, 0.2, { type: 'sawtooth', f1: f * 0.65, a: 0.01, lp: 1700, q: 5, dest: out });
    },
    0.3,
    { gap: 0.12, max: 2, prio: 2, vol: 0.8, wet: 0.1 },
  ),
  ash_dodge: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.3, 0.55, { filter: 'bandpass', f: 500, f1: 2600, q: 1.3, a: 0.06, r: 0.18, dest: out });
      e.noise(t + 0.08, 0.2, 0.25, { filter: 'highpass', f: 3500, dest: out });
      e.tone(t, 300 * c.p, 0.2, 0.12, { type: 'sine', f1: 700 * c.p, a: 0.05, dest: out });
    },
    0.4,
    { gap: 0.15, max: 2, prio: 1, vol: 0.6, wet: 0.1 },
  ),
  ash_death: def(
    (c) => {
      const { e, t, out } = c;
      roar(c, 200, 1.1, 0.45);
      e.thump(t + 0.5, 90, 25, 0.6, 0.9, out);
      e.noise(t + 0.5, 0.8, 0.3, { color: 'brown', filter: 'lowpass', f: 600, f1: 80, dest: out });
    },
    1.5,
    { gap: 1, max: 1, prio: 2, vol: 0.8, wet: 0.35 },
  ),

  // ----------------------------------------------------------------- Army
  sword_hit: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.03, 0.7, { filter: 'highpass', f: 3500, dest: out });
      e.metal(t, 1500 * c.p, 0.2, 0.2, out, [1, 2.76, 5.4]);
      e.thump(t, 220 * c.p, 90, 0.08, 0.55, out);
    },
    0.3,
    { gap: 0.04, max: 4, prio: 1, vol: 0.5, wet: 0.1 },
  ),
  axe_hit: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.09, 0.8, { filter: 'bandpass', f: 1100, f1: 400, q: 0.9, dest: out });
      e.thump(t, 170 * c.p, 55, 0.16, 0.9, out);
      e.metal(t, 700 * c.p, 0.14, 0.1, out, [1, 2.2, 4.7]);
    },
    0.25,
    { gap: 0.05, max: 3, prio: 1, vol: 0.55, wet: 0.1 },
  ),
  blunt_hit: def(
    (c) => {
      const { e, t, out } = c;
      e.thump(t, 190 * c.p, 70, 0.1, 0.7, out);
      e.noise(t, 0.05, 0.5, { filter: 'lowpass', f: 2500, f1: 500, dest: out });
    },
    0.2,
    { gap: 0.05, max: 3, prio: 0, vol: 0.5, wet: 0.06 },
  ),
  stab_hit: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.05, 0.6, { filter: 'bandpass', f: 1800, q: 2, dest: out });
      e.thump(t, 260 * c.p, 110, 0.07, 0.5, out);
      e.tone(t, 1100 * c.p, 0.05, 0.12, { type: 'triangle', f1: 600, dest: out });
    },
    0.15,
    { gap: 0.05, max: 3, prio: 0, vol: 0.5, wet: 0.06 },
  ),
  arrow_shot: def(
    (c) => {
      twang(c, c.t, 760, 0.4);
    },
    0.2,
    { gap: 0.05, max: 4, prio: 0, vol: 0.45, wet: 0.1 },
  ),
  bolt_shot: def(
    (c) => {
      const { e, t, out } = c;
      e.thump(t, 150 * c.p, 70, 0.14, 0.7, out);
      twang(c, t, 520, 0.4);
      e.noise(t + 0.05, 0.05, 0.3, { filter: 'bandpass', f: 1500, q: 4, dest: out });
    },
    0.25,
    { gap: 0.07, max: 3, prio: 0, vol: 0.5, wet: 0.1 },
  ),
  arrow_hit: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.04, 0.5, { filter: 'bandpass', f: 1000 * c.p, q: 1.5, dest: out });
      e.thump(t, 330 * c.p, 150, 0.05, 0.5, out);
      e.tone(t + 0.01, 1900 * c.p, 0.08, 0.1, { type: 'sine', f1: 1700, vib: [40, 80], dest: out });
    },
    0.15,
    { gap: 0.045, max: 4, prio: 0, vol: 0.45, wet: 0.05 },
  ),
  spear_thrust: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.14, 0.4, { filter: 'bandpass', f: 1400, f1: 700, q: 1.8, a: 0.03, dest: out });
      e.noise(t + 0.12, 0.03, 0.3, { filter: 'bandpass', f: 2200, q: 3, dest: out });
    },
    0.2,
    { gap: 0.08, max: 3, prio: 0, vol: 0.4, wet: 0.05 },
  ),
  horse_charge: def(
    (c) => {
      const { e, t, out } = c;
      // galloping hooves: 1-2-pause pattern
      const pat = [0, 0.09, 0.2, 0.3, 0.39, 0.5, 0.6, 0.69];
      for (let k = 0; k < pat.length; k++) {
        const v = 0.6 * (k % 2 === 0 ? 1 : 0.7) * (1 - k * 0.04);
        e.thump(t + pat[k], 100 * c.p, 55, 0.1, v, out);
        e.noise(t + pat[k], 0.05, v * 0.4, { filter: 'lowpass', f: 1500, dest: out });
      }
      // neigh
      const f = 820 * c.p;
      e.tone(t + 0.05, f, 0.5, 0.2, { type: 'sawtooth', f1: f * 0.55, a: 0.04, lp: 2000, q: 4, vib: [11, 150], dest: out });
    },
    0.9,
    { gap: 1.2, max: 1, prio: 1, vol: 0.55, wet: 0.15 },
  ),
  shield_block: def(
    (c) => {
      const { e, t, out } = c;
      e.metal(t, 900 * c.p, 0.35, 0.28, out, [1, 2.3, 3.9, 6.2]);
      e.noise(t, 0.03, 0.6, { filter: 'highpass', f: 3000, dest: out });
      e.thump(t, 200, 80, 0.08, 0.5, out);
    },
    0.45,
    { gap: 0.05, max: 3, prio: 1, vol: 0.5, wet: 0.12 },
  ),
  summon: def(
    (c) => {
      const { e, t, out } = c;
      // n: 0 infantry, 1 ranged, 2 cavalry, 3 hero, 4 support
      e.thump(t, 110, 55, 0.18, 0.9, out);
      e.thump(t + 0.16, 130, 60, 0.18, 0.7, out);
      e.noise(t, 0.06, 0.3, { filter: 'bandpass', f: 1500, q: 2, dest: out });
      if (c.n === 0) horn(c, t + 0.1, 55, 0.4, 0.3, 0.8);
      else if (c.n === 1) {
        horn(c, t + 0.1, 62, 0.25, 0.22, 1);
        horn(c, t + 0.28, 67, 0.3, 0.22, 1);
      } else if (c.n === 2) {
        horn(c, t + 0.05, 55, 0.18, 0.28);
        horn(c, t + 0.2, 55, 0.18, 0.28);
        horn(c, t + 0.35, 62, 0.45, 0.32);
      } else if (c.n === 3) {
        horn(c, t + 0.05, 50, 0.3, 0.3);
        horn(c, t + 0.3, 57, 0.3, 0.3);
        horn(c, t + 0.55, 62, 0.7, 0.34, 1.3);
        e.metal(t + 0.55, 587 * c.p, 0.9, 0.12, out);
      } else {
        bell(c, t + 0.05, 79, 0.9, 0.12);
        bell(c, t + 0.2, 84, 1, 0.1);
      }
    },
    1.3,
    { gap: 0.1, max: 3, prio: 2, vol: 0.7, wet: 0.2 },
  ),
  denied: def(
    (c) => {
      const { e, t, out } = c;
      e.tone(t, 190 * c.p, 0.06, 0.35, { type: 'square', lp: 700, a: 0.002, dest: out });
      e.tone(t + 0.075, 150 * c.p, 0.09, 0.35, { type: 'square', lp: 600, a: 0.002, dest: out });
    },
    0.2,
    { gap: 0.12, max: 1, prio: 2, vol: 0.45, wet: 0.02 },
  ),

  // -------------------------------------------------------------- Deadites
  bone_hit: def(
    (c) => {
      bones(c, 4, 0.06, 0.45, 3200);
      c.e.thump(c.t, 240 * c.p, 120, 0.05, 0.35, c.out);
    },
    0.15,
    { gap: 0.035, max: 5, prio: 0, vol: 0.5, wet: 0.08 },
  ),
  bone_collapse: def(
    (c) => {
      const { e, t, out } = c;
      bones(c, 8 + Math.floor(rnd(0, 4)), 0.5, 0.5, 2400);
      e.thump(t, 120 * c.p, 45, 0.18, 0.7, out);
      e.noise(t, 0.35, 0.3, { filter: 'bandpass', f: 900, f1: 300, q: 1, dest: out });
    },
    0.7,
    { gap: 0.045, max: 5, prio: 0, vol: 0.55, wet: 0.14 },
  ),
  fireball_cast: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.45, 0.5, { filter: 'bandpass', f: 300, f1: 1800, q: 1.4, a: 0.1, dest: out });
      e.tone(t, 110 * c.p, 0.45, 0.2, { type: 'sawtooth', f1: 420 * c.p, a: 0.1, lp: 700, dest: out });
      e.tone(t, 880 * c.p, 0.3, 0.06, { type: 'sine', f1: 1500, vib: [14, 60], dest: out });
    },
    0.55,
    { gap: 0.12, max: 2, prio: 1, vol: 0.5, wet: 0.2 },
  ),
  fire_burst: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.35, 0.7, { filter: 'lowpass', f: 3500, f1: 250, q: 0.8, dest: out });
      e.thump(t, 120 * c.p, 40, 0.3, 0.8, out);
      e.noise(t + 0.03, 0.12, 0.3, { filter: 'highpass', f: 4500, dest: out });
    },
    0.45,
    { gap: 0.1, max: 3, prio: 1, vol: 0.55, wet: 0.25 },
  ),
  flyer_screech: def(
    (c) => screech(c, 1350, 0.38, 0.22),
    0.5,
    { gap: 0.35, max: 2, prio: 0, vol: 0.5, wet: 0.2 },
  ),
  hag_chirp: def(
    (c) => {
      const { e, t, out } = c;
      const n = 2 + Math.floor(rnd(0, 3));
      for (let k = 0; k < n; k++) {
        const f = rnd(1300, 1900) * c.p;
        e.tone(t + k * 0.075, f, 0.06, 0.18, { type: 'triangle', f1: f * rnd(1.2, 1.6), a: 0.004, dest: out });
      }
      e.tone(t, 330 * c.p, 0.2, 0.1, { type: 'sawtooth', f1: 520, lp: 900, vib: [15, 90], dest: out });
    },
    0.4,
    { gap: 0.25, max: 2, prio: 0, vol: 0.5, wet: 0.12 },
  ),
  ram_thud: def(
    (c) => {
      const { e, t, out } = c;
      e.thump(t, 85 * c.p, 26, 0.55, 1.1, out);
      e.noise(t, 0.3, 0.6, { color: 'brown', filter: 'lowpass', f: 900, f1: 120, dest: out });
      e.noise(t, 0.05, 0.4, { filter: 'bandpass', f: 600, q: 2, dest: out });
      // wood groan
      e.tone(t + 0.04, 130 * c.p, 0.4, 0.12, { type: 'sawtooth', f1: 70, lp: 400, q: 6, vib: [9, 100], dest: out });
    },
    0.7,
    { gap: 0.3, max: 2, prio: 2, vol: 0.8, wet: 0.2 },
  ),
  catapult_creak: def(
    (c) => {
      const { e, t, out } = c;
      e.tone(t, 70 * c.p, 0.6, 0.2, { type: 'sawtooth', f1: 150 * c.p, a: 0.1, lp: 500, q: 8, vib: [7, 120], dest: out });
      ratchet(c, t, 7, 0.07, 0.25);
      // release
      e.thump(t + 0.62, 120, 40, 0.2, 0.8, out);
      e.noise(t + 0.62, 0.12, 0.5, { filter: 'bandpass', f: 900, q: 1, dest: out });
    },
    0.9,
    { gap: 0.5, max: 2, prio: 1, vol: 0.55, wet: 0.2 },
  ),
  boulder_crash: def(
    (c) => {
      const { e, t, out } = c;
      e.thump(t, 95 * c.p, 28, 0.6, 1.1, out);
      e.noise(t, 0.6, 0.7, { color: 'brown', filter: 'lowpass', f: 1500, f1: 100, dest: out });
      bones(c, 6, 0.4, 0.45, 1200);
      e.noise(t + 0.05, 0.35, 0.3, { filter: 'highpass', f: 2500, f1: 800, dest: out });
    },
    0.9,
    { gap: 0.2, max: 2, prio: 2, vol: 0.85, wet: 0.3 },
  ),

  // -------------------------------------------------------------- Economy
  coin: def(
    (c) => {
      const { e, t, out } = c;
      const m = penta(c.n, 83);
      const f = mtof(m) * c.p;
      e.tone(t, f, 0.22, 0.28, { type: 'square', lp: 5000, a: 0.001, dest: out });
      e.tone(t + 0.055, f * 1.5, 0.3, 0.22, { type: 'square', lp: 6000, a: 0.001, dest: out });
      e.metal(t + 0.055, f * 1.5, 0.35, 0.06, out, [1, 2.7, 4.1]);
    },
    0.45,
    { gap: 0.035, max: 6, prio: 1, vol: 0.38, wet: 0.14 },
  ),
  mana_chime: def(
    (c) => {
      const { e, t, out } = c;
      const f = mtof(88) * c.p;
      e.tone(t, f, 0.6, 0.25, { type: 'sine', a: 0.003, dest: out });
      e.tone(t + 0.07, f * 1.5, 0.7, 0.2, { type: 'sine', a: 0.003, dest: out });
      e.tone(t + 0.14, f * 2, 0.9, 0.14, { type: 'sine', a: 0.003, vib: [6, 8], dest: out });
      e.noise(t, 0.3, 0.05, { filter: 'highpass', f: 7000, dest: out });
    },
    1,
    { gap: 0.06, max: 3, prio: 1, vol: 0.4, wet: 0.35 },
  ),
  food: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.04, 0.4, { filter: 'bandpass', f: 1400, q: 2, dest: out });
      e.noise(t + 0.07, 0.04, 0.4, { filter: 'bandpass', f: 1100, q: 2, dest: out });
      e.tone(t + 0.15, 200 * c.p, 0.15, 0.3, { type: 'sine', f1: 120, dest: out });
      e.tone(t + 0.25, mtof(76) * c.p, 0.3, 0.14, { type: 'triangle', dest: out });
      e.tone(t + 0.32, mtof(81) * c.p, 0.4, 0.14, { type: 'triangle', dest: out });
    },
    0.8,
    { gap: 0.15, max: 2, prio: 1, vol: 0.5, wet: 0.1 },
  ),
  smith_hammer: def(
    (c) => {
      const { e, t, out } = c;
      for (let k = 0; k < 3; k++) {
        const a = t + k * 0.17;
        e.thump(a, 180, 90, 0.07, 0.6, out);
        e.metal(a, (1100 + k * 160) * c.p, 0.18, 0.2, out, [1, 2.9, 5.1]);
        e.noise(a, 0.015, 0.5, { filter: 'highpass', f: 4000, dest: out });
      }
    },
    0.7,
    { gap: 0.3, max: 1, prio: 1, vol: 0.55, wet: 0.15 },
  ),
  anvil_ring: def(
    (c) => {
      const { e, t, out } = c;
      e.thump(t, 200, 80, 0.08, 0.7, out);
      e.metal(t, 1320 * c.p, 1.4, 0.28, out, [1, 2.76, 4.2, 5.4, 8.9]);
      e.tone(t + 0.08, mtof(91), 1.0, 0.1, { type: 'sine', dest: out });
      e.tone(t + 0.14, mtof(95), 1.1, 0.08, { type: 'sine', dest: out });
    },
    1.6,
    { gap: 0.4, max: 1, prio: 2, vol: 0.6, wet: 0.3 },
  ),
  combo_ping: def(
    (c) => {
      const { e, t, out } = c;
      const m = penta(Math.min(c.n, 14), 69);
      const f = mtof(m) * c.p;
      e.tone(t, f, 0.3, 0.22, { type: 'triangle', a: 0.002, dest: out });
      e.tone(t, f * 2, 0.22, 0.1, { type: 'sine', a: 0.002, dest: out });
    },
    0.4,
    { gap: 0.04, max: 3, prio: 1, vol: 0.4, wet: 0.2 },
  ),
  combo_flourish: def(
    (c) => {
      const { e, t, out } = c;
      const base = 64 + Math.min(c.n, 6);
      const steps = [0, 4, 7, 12, 16];
      for (let k = 0; k < steps.length; k++) {
        const f = mtof(base + steps[k]) * c.p;
        e.tone(t + k * 0.055, f, 0.5 + k * 0.1, 0.2, { type: 'triangle', a: 0.003, dest: out });
        e.tone(t + k * 0.055, f * 2, 0.4, 0.08, { type: 'sine', dest: out });
      }
      e.metal(t + 0.25, mtof(base + 24) * c.p, 0.9, 0.08, out);
    },
    1.2,
    { gap: 0.3, max: 1, prio: 2, vol: 0.55, wet: 0.3 },
  ),

  // --------------------------------------------------------------- Castle
  book_hit: def(
    (c) => {
      const { e, t, out } = c;
      // i = urgency 0..1 (falls with the book's hp)
      e.thump(t, 95, 32, 0.35, 1.0, out);
      e.noise(t, 0.2, 0.4, { filter: 'lowpass', f: 900, f1: 150, dest: out });
      bell(c, t, 43, 1.1, 0.2);
      if (c.i > 0.4) {
        const f = (880 + 220 * c.i) * c.p;
        for (let k = 0; k < 2; k++) e.tone(t + 0.12 + k * 0.14, f, 0.09, 0.22 * c.i, { type: 'square', lp: 3000, a: 0.002, dest: out });
      }
      if (c.i > 0.75) {
        for (let k = 0; k < 2; k++) e.tone(t + 0.4 + k * 0.14, 1000 * c.p, 0.09, 0.2, { type: 'square', lp: 3000, a: 0.002, dest: out });
      }
    },
    1.2,
    { gap: 0.2, max: 2, prio: 2, vol: 0.8, wet: 0.35 },
  ),
  pit_trap: def(
    (c) => {
      const { e, t, out } = c;
      clank(c, t, 400, 0.4);
      e.noise(t + 0.03, 0.4, 0.45, { color: 'brown', filter: 'lowpass', f: 700, f1: 120, dest: out });
      e.tone(t + 0.08, 1100, 0.7, 0.14, { type: 'sine', f1: 180, dest: out }); // falling whistle
      for (let k = 0; k < 4; k++) e.thump(t + 0.6 + k * 0.09, 90 - k * 8, 40, 0.15, 0.4 - k * 0.07, out);
      bones(c, 6, 0.5, 0.3, 1800);
    },
    1.1,
    { gap: 0.4, max: 1, prio: 2, vol: 0.7, wet: 0.3 },
  ),
  castle_archer: def(
    (c) => twang(c, c.t, 880, 0.3),
    0.2,
    { gap: 0.08, max: 3, prio: 0, vol: 0.4, wet: 0.2 },
  ),
  castle_catapult: def(
    (c) => {
      const { e, t, out } = c;
      e.thump(t, 110, 38, 0.35, 0.9, out);
      e.noise(t, 0.15, 0.5, { filter: 'bandpass', f: 800, q: 1, dest: out });
      e.tone(t, 200 * c.p, 0.35, 0.15, { type: 'sawtooth', f1: 80, lp: 600, q: 5, dest: out });
    },
    0.5,
    { gap: 0.25, max: 2, prio: 1, vol: 0.6, wet: 0.25 },
  ),

  // --------------------------------------------------------------- Bosses
  boss_enter: def(
    (c) => {
      const { e, t, out } = c;
      e.thump(t, 70, 24, 1.4, 1.1, out);
      e.noise(t, 2.2, 0.35, { color: 'brown', filter: 'lowpass', f: 300, f1: 60, a: 0.2, dest: out });
      const base = 38;
      for (const [k, iv] of [0, 1, 6, 7].entries()) {
        const f = mtof(base + iv) * c.p;
        e.tone(t + 0.1 * k, f, 2.2, 0.28, { type: 'sawtooth', f1: f * 0.97, a: 0.35, r: 1.5, lp: 380, lpEnd: 1300, q: 3, vib: [4.5, 14], dest: out });
      }
      roar(c, 120, 1.3, 0.35);
      // dissonant choir shimmer
      for (const m of [74, 75, 80]) e.tone(t + 0.6, mtof(m), 1.8, 0.07, { type: 'sine', a: 0.5, r: 1.0, vib: [5, 20], dest: out });
    },
    3,
    { gap: 2, max: 1, prio: 2, vol: 0.9, wet: 0.45 },
  ),
  telegraph: def(
    (c) => {
      const { e, t, out } = c;
      // n: 0 band, 1 circle, 2 line, 3 shadow
      if (c.n === 0) {
        e.tone(t, 110 * c.p, 0.6, 0.3, { type: 'sawtooth', f1: 220 * c.p, a: 0.15, lp: 500, lpEnd: 1400, q: 2, dest: out });
        e.tone(t + 0.3, 110 * c.p * 1.5, 0.4, 0.2, { type: 'sawtooth', f1: 300, a: 0.1, lp: 800, dest: out });
      } else if (c.n === 1) {
        for (let k = 0; k < 3; k++) e.tone(t + k * 0.15, 660 * c.p * (1 + k * 0.12), 0.25, 0.22, { type: 'sine', a: 0.004, dest: out });
        e.metal(t, 660 * c.p, 0.5, 0.08, out, [1, 2.4]);
      } else if (c.n === 2) {
        for (let k = 0; k < 4; k++) e.tone(t + k * 0.09, 1250 * c.p, 0.06, 0.2, { type: 'square', lp: 3500, a: 0.002, dest: out });
      } else {
        e.tone(t, 1400 * c.p, 0.7, 0.2, { type: 'sine', f1: 350, a: 0.02, dest: out });
        e.noise(t, 0.7, 0.12, { filter: 'bandpass', f: 1800, f1: 400, q: 2, dest: out });
      }
    },
    0.9,
    { gap: 0.1, max: 3, prio: 2, vol: 0.55, wet: 0.2 },
  ),
  boss_phase: def(
    (c) => {
      const { e, t, out } = c;
      roar(c, 150, 1.4, 0.5);
      e.noise(t, 1.2, 0.5, { filter: 'bandpass', f: 200, f1: 3000, q: 1.2, a: 0.6, dest: out });
      e.thump(t + 1.0, 80, 22, 0.8, 1.1, out);
      bell(c, t + 1.0, 40, 2, 0.14);
    },
    2.2,
    { gap: 1, max: 1, prio: 2, vol: 0.85, wet: 0.4 },
  ),
  boss_defeat: def(
    (c) => {
      const { e, t, out } = c;
      roar(c, 180, 1.8, 0.4);
      e.thump(t + 1.2, 70, 20, 1.0, 1.1, out);
      e.noise(t + 1.2, 1.5, 0.4, { color: 'brown', filter: 'lowpass', f: 900, f1: 80, dest: out });
      // relief: rising bright arpeggio
      [62, 66, 69, 74, 78].forEach((m, k) => {
        e.tone(t + 2.0 + k * 0.1, mtof(m), 1.2, 0.14, { type: 'triangle', dest: out });
        e.metal(t + 2.0 + k * 0.1, mtof(m + 12), 1, 0.04, out, [1, 2.76]);
      });
    },
    3.4,
    { gap: 3, max: 1, prio: 2, vol: 0.85, wet: 0.4 },
  ),

  // ----------------------------------------------------------- Flow and UI
  wave_horn: def(
    (c) => {
      const { e, t, out } = c;
      horn(c, t, 50, 0.7, 0.4, 0.9);
      horn(c, t, 57, 0.7, 0.3, 0.9);
      horn(c, t + 0.75, 50, 1.2, 0.42, 1.1);
      horn(c, t + 0.75, 62, 1.2, 0.3, 1.1);
      e.thump(t, 80, 40, 0.3, 0.8, out);
      e.thump(t + 0.75, 80, 40, 0.3, 0.8, out);
    },
    2.2,
    { gap: 3, max: 1, prio: 2, vol: 0.75, wet: 0.4 },
  ),
  button: def(
    (c) => {
      const { e, t, out } = c;
      e.tone(t, 520 * c.p, 0.06, 0.25, { type: 'triangle', f1: 380 * c.p, a: 0.002, dest: out });
      e.noise(t, 0.02, 0.2, { filter: 'bandpass', f: 2200, q: 2, dest: out });
    },
    0.1,
    { gap: 0.05, max: 2, prio: 2, vol: 0.4, wet: 0.04 },
  ),
  rally: def(
    (c) => {
      const { e, t, out } = c;
      // n 1 = advance (rising fifth), 0 = hold (falling)
      const up = c.n === 1;
      horn(c, t, up ? 55 : 62, 0.28, 0.3);
      horn(c, t + 0.22, up ? 62 : 55, 0.55, 0.32);
      e.thump(t, 100, 50, 0.14, 0.6, out);
      e.noise(t + 0.22, 0.2, 0.15, { filter: 'bandpass', f: 1800, q: 2, dest: out }); // banner flap
    },
    1,
    { gap: 0.3, max: 1, prio: 2, vol: 0.6, wet: 0.25 },
  ),
  pause: def(
    (c) => {
      c.e.tone(c.t, c.n ? 330 : 440, 0.12, 0.25, { type: 'triangle', f1: c.n ? 220 : 660, dest: c.out });
    },
    0.2,
    { gap: 0.1, max: 1, prio: 2, vol: 0.4, wet: 0.05 },
  ),
  speed: def(
    (c) => {
      const f = c.n === 2 ? 600 : 450;
      c.e.tone(c.t, f, 0.07, 0.22, { type: 'square', lp: 2000, a: 0.002, dest: c.out });
      c.e.tone(c.t + 0.07, f * 1.5, 0.08, 0.22, { type: 'square', lp: 2000, a: 0.002, dest: c.out });
    },
    0.2,
    { gap: 0.1, max: 1, prio: 2, vol: 0.35, wet: 0.04 },
  ),

  // --------------------------------------------------------------- Spells
  // each spell has "cast_<id>" and "impact_<id>"
  cast_super_boomstick: def(
    (c) => {
      bang(c, 1);
      c.e.noise(c.t + 0.05, 0.9, 0.35, { color: 'brown', filter: 'lowpass', f: 500, f1: 50, dest: c.out });
    },
    1.2,
    { gap: 0.3, max: 1, prio: 2, vol: 0.95, wet: 0.35 },
  ),
  impact_super_boomstick: def(
    (c) => {
      c.e.thump(c.t, 90 * c.p, 28, 0.7, 1, c.out);
      c.e.noise(c.t, 0.5, 0.5, { filter: 'lowpass', f: 2500, f1: 120, dest: c.out });
      bones(c, 7, 0.3, 0.4, 2000);
    },
    0.9,
    { gap: 0.15, max: 2, prio: 2, vol: 0.8, wet: 0.3 },
  ),
  cast_arrow_volley: def(
    (c) => {
      for (let k = 0; k < 6; k++) twang(c, c.t + k * 0.035 + rnd(0, 0.03), rnd(650, 950), 0.28);
      c.e.noise(c.t + 0.1, 0.5, 0.15, { filter: 'bandpass', f: 1500, f1: 600, q: 1, a: 0.1, dest: c.out });
    },
    0.8,
    { gap: 0.3, max: 1, prio: 2, vol: 0.55, wet: 0.2 },
  ),
  impact_arrow_volley: def(
    (c) => {
      for (let k = 0; k < 9; k++) {
        const a = c.t + Math.pow(Math.random(), 1.4) * 0.5;
        c.e.noise(a, 0.04, 0.4, { filter: 'bandpass', f: rnd(700, 1500), q: 1.5, dest: c.out });
        c.e.thump(a, rnd(250, 400), 130, 0.05, 0.35, c.out);
      }
    },
    0.7,
    { gap: 0.25, max: 1, prio: 1, vol: 0.5, wet: 0.1 },
  ),
  cast_magic_words: def(
    (c) => {
      const { e, t, out } = c;
      // chanted syllables: "klaatu verata nikto"
      const notes = [57, 60, 57, 62, 60];
      notes.forEach((m, k) => {
        const f = mtof(m) * c.p;
        e.tone(t + k * 0.16, f, 0.22, 0.25, { type: 'sawtooth', a: 0.02, lp: 700 + k * 150, q: 6, vib: [6, 25], dest: out });
        e.tone(t + k * 0.16, f * 1.5, 0.2, 0.1, { type: 'sawtooth', lp: 1600, q: 8, dest: out });
      });
      e.tone(t + 0.4, 1760, 0.9, 0.06, { type: 'sine', f1: 2637, vib: [9, 30], dest: out });
    },
    1.3,
    { gap: 0.4, max: 1, prio: 2, vol: 0.7, wet: 0.4 },
  ),
  impact_magic_words: def(
    (c) => {
      const { e, t, out } = c;
      e.thump(t, 70, 25, 0.8, 1, out);
      e.noise(t, 0.7, 0.35, { filter: 'bandpass', f: 3000, f1: 300, q: 1.2, dest: out });
      [88, 83, 79, 76].forEach((m, k) => e.tone(t + 0.05 + k * 0.1, mtof(m), 0.9, 0.1, { type: 'sine', vib: [6, 14], dest: out }));
    },
    1.2,
    { gap: 0.3, max: 1, prio: 2, vol: 0.75, wet: 0.45 },
  ),
  cast_catapult_volley: def(
    (c) => {
      for (let k = 0; k < 3; k++) {
        const a = c.t + k * 0.28;
        c.e.thump(a, 120, 42, 0.25, 0.8, c.out);
        c.e.noise(a, 0.12, 0.4, { filter: 'bandpass', f: 800, q: 1, dest: c.out });
        c.e.tone(a, 220, 0.25, 0.12, { type: 'sawtooth', f1: 90, lp: 600, q: 5, dest: c.out });
      }
    },
    1.1,
    { gap: 0.4, max: 1, prio: 2, vol: 0.7, wet: 0.25 },
  ),
  impact_catapult_volley: def(
    (c) => {
      c.e.thump(c.t, 85 * c.p, 26, 0.55, 1, c.out);
      c.e.noise(c.t, 0.5, 0.55, { color: 'brown', filter: 'lowpass', f: 1300, f1: 100, dest: c.out });
      bones(c, 5, 0.3, 0.4, 1300);
    },
    0.8,
    { gap: 0.12, max: 3, prio: 2, vol: 0.85, wet: 0.3 },
  ),
  cast_wrong_book: def(
    (c) => {
      const { e, t, out } = c;
      // comic slide-whistle down, then a bassoon-ish raspberry
      e.tone(t, 1500, 0.5, 0.2, { type: 'sine', f1: 260, a: 0.01, vib: [8, 40], dest: out });
      e.tone(t + 0.45, 90, 0.35, 0.3, { type: 'sawtooth', f1: 60, lp: 400, q: 3, vib: [22, 300], dest: out });
      e.noise(t + 0.45, 0.3, 0.2, { filter: 'bandpass', f: 300, q: 3, dest: out });
    },
    0.9,
    { gap: 0.4, max: 1, prio: 2, vol: 0.65, wet: 0.2 },
  ),
  impact_wrong_book: def(
    (c) => {
      const { e, t, out } = c;
      e.tone(t, 180, 0.3, 0.4, { type: 'sine', f1: 520, a: 0.005, vib: [14, 200], dest: out }); // boing
      e.noise(t + 0.02, 0.25, 0.4, { filter: 'lowpass', f: 3000, f1: 300, dest: out }); // poof
      e.tone(t + 0.3, 900, 0.15, 0.1, { type: 'triangle', f1: 400, dest: out });
    },
    0.6,
    { gap: 0.2, max: 2, prio: 1, vol: 0.6, wet: 0.2 },
  ),
  cast_chainsaw: def(
    (c) => {
      const { e, t, out } = c;
      const f = 58 * c.p;
      e.tone(t, f, 0.9, 0.5, { type: 'sawtooth', f1: f * 2.6, a: 0.05, r: 0.3, lp: 600, lpEnd: 3000, q: 2, vib: [29, 500], dest: out });
      e.tone(t, f * 2, 0.9, 0.3, { type: 'square', f1: f * 5, a: 0.05, lp: 1800, vib: [33, 600], dest: out });
      e.noise(t, 0.9, 0.35, { filter: 'bandpass', f: 1500, f1: 3500, q: 1, a: 0.1, dest: out });
    },
    1,
    { gap: 0.5, max: 1, prio: 2, vol: 0.7, wet: 0.15 },
  ),
  impact_chainsaw: def(
    (c) => {
      for (let k = 0; k < 4; k++) {
        const a = c.t + k * 0.07;
        c.e.noise(a, 0.08, 0.45, { filter: 'bandpass', f: 2600 - k * 250, q: 1.5, dest: c.out });
        c.e.tone(a, 90 + k * 8, 0.09, 0.4, { type: 'sawtooth', lp: 1200, vib: [40, 500], dest: c.out });
      }
      bones(c, 6, 0.3, 0.35, 2600);
    },
    0.5,
    { gap: 0.1, max: 2, prio: 1, vol: 0.65, wet: 0.1 },
  ),
  cast_deathcoaster: def(
    (c) => {
      const { e, t, out } = c;
      ratchet(c, t, 14, 0.09, 0.3);
      e.tone(t + 0.6, 300, 0.8, 0.18, { type: 'sawtooth', f1: 1200, a: 0.1, lp: 1500, q: 2, vib: [6, 40], dest: out });
      e.noise(t + 0.5, 0.9, 0.2, { filter: 'bandpass', f: 600, f1: 2500, q: 1, a: 0.3, dest: out });
    },
    1.5,
    { gap: 0.5, max: 1, prio: 2, vol: 0.65, wet: 0.25 },
  ),
  impact_deathcoaster: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.6, 0.5, { filter: 'bandpass', f: 2800, f1: 200, q: 1, dest: out });
      e.thump(t, 100, 35, 0.4, 0.9, out);
      bones(c, 9, 0.5, 0.4, 2200);
      clank(c, t + 0.1, 600, 0.25);
    },
    0.9,
    { gap: 0.2, max: 2, prio: 2, vol: 0.75, wet: 0.25 },
  ),
  cast_salt_circle: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.6, 0.35, { filter: 'highpass', f: 5000, a: 0.02, dest: out });
      for (let k = 0; k < 6; k++) e.tone(t + k * 0.06, mtof(84 + PENT[k % 5]) * c.p, 0.4, 0.08, { type: 'sine', dest: out });
      e.thump(t, 150, 70, 0.1, 0.4, out);
    },
    0.8,
    { gap: 0.4, max: 1, prio: 2, vol: 0.6, wet: 0.35 },
  ),
  impact_salt_circle: def(
    (c) => {
      const { e, t, out } = c;
      for (let k = 0; k < 16; k++) {
        const a = t + Math.random() * 0.6;
        e.noise(a, 0.012, 0.28, { filter: 'bandpass', f: rnd(3500, 8000), q: 6, dest: out });
      }
      e.tone(t, 110, 0.7, 0.18, { type: 'sine', f1: 130, a: 0.1, vib: [3, 20], dest: out });
      e.tone(t, 165, 0.7, 0.1, { type: 'sine', a: 0.1, dest: out });
    },
    0.9,
    { gap: 0.3, max: 1, prio: 1, vol: 0.6, wet: 0.3 },
  ),
  cast_matins_bell: def(
    (c) => {
      bell(c, c.t, 55, 2.4, 0.28);
      c.e.thump(c.t, 110, 60, 0.12, 0.4, c.out);
    },
    2.6,
    { gap: 0.5, max: 1, prio: 2, vol: 0.75, wet: 0.5 },
  ),
  impact_matins_bell: def(
    (c) => {
      const { e, t, out } = c;
      bell(c, t, 67, 2.2, 0.22);
      // holy triad swell
      [74, 78, 81].forEach((m) => e.tone(t, mtof(m), 1.8, 0.07, { type: 'sine', a: 0.4, r: 1, vib: [5, 12], dest: out }));
    },
    2.4,
    { gap: 0.5, max: 1, prio: 2, vol: 0.7, wet: 0.5 },
  ),
  cast_hellfire_pitch: def(
    (c) => {
      const { e, t, out } = c;
      for (let k = 0; k < 7; k++) {
        const a = t + k * 0.05 + rnd(0, 0.03);
        e.tone(a, rnd(120, 260), 0.07, 0.25, { type: 'sine', f1: rnd(300, 500), dest: out }); // bubbles
      }
      e.noise(t + 0.2, 0.5, 0.45, { filter: 'bandpass', f: 400, f1: 1800, q: 1.4, a: 0.15, dest: out });
    },
    0.8,
    { gap: 0.4, max: 1, prio: 2, vol: 0.65, wet: 0.25 },
  ),
  impact_hellfire_pitch: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 1.2, 0.55, { color: 'brown', filter: 'lowpass', f: 1800, f1: 200, a: 0.03, dest: out });
      e.thump(t, 100, 35, 0.4, 0.8, out);
      for (let k = 0; k < 14; k++) e.noise(t + Math.random() * 1.1, 0.02, 0.3, { filter: 'bandpass', f: rnd(1500, 4000), q: 4, dest: out });
    },
    1.4,
    { gap: 0.4, max: 1, prio: 2, vol: 0.75, wet: 0.3 },
  ),
  cast_bear_traps: def(
    (c) => {
      ratchet(c, c.t, 5, 0.06, 0.35);
      clank(c, c.t + 0.35, 500, 0.35);
    },
    0.7,
    { gap: 0.4, max: 1, prio: 2, vol: 0.6, wet: 0.15 },
  ),
  impact_bear_traps: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.02, 0.9, { filter: 'highpass', f: 3000, dest: out });
      e.metal(t, 1700 * c.p, 0.3, 0.3, out, [1, 2.6, 4.4]);
      e.thump(t, 200, 70, 0.1, 0.8, out);
      bones(c, 5, 0.2, 0.4, 2600);
    },
    0.5,
    { gap: 0.08, max: 3, prio: 1, vol: 0.7, wet: 0.12 },
  ),
  cast_dawn_lance: def(
    (c) => {
      const { e, t, out } = c;
      e.tone(t, 300, 0.7, 0.22, { type: 'sine', f1: 2400, a: 0.05, dest: out });
      e.tone(t, 600, 0.7, 0.1, { type: 'triangle', f1: 4800, a: 0.05, dest: out });
      e.noise(t + 0.1, 0.6, 0.15, { filter: 'highpass', f: 4000, a: 0.3, dest: out });
    },
    0.9,
    { gap: 0.4, max: 1, prio: 2, vol: 0.65, wet: 0.35 },
  ),
  impact_dawn_lance: def(
    (c) => {
      const { e, t, out } = c;
      e.noise(t, 0.05, 0.8, { filter: 'highpass', f: 2000, dest: out });
      e.thump(t, 140, 40, 0.35, 0.9, out);
      [74, 78, 81, 86].forEach((m, k) => e.tone(t + k * 0.03, mtof(m), 1.2, 0.12, { type: 'triangle', dest: out }));
      e.noise(t, 0.8, 0.25, { filter: 'highpass', f: 6000, dest: out });
    },
    1.4,
    { gap: 0.3, max: 2, prio: 2, vol: 0.8, wet: 0.4 },
  ),
  cast_rally_horn: def(
    (c) => {
      horn(c, c.t, 55, 0.3, 0.4);
      horn(c, c.t + 0.3, 62, 0.3, 0.4);
      horn(c, c.t + 0.6, 67, 0.9, 0.45, 1.2);
      horn(c, c.t + 0.6, 74, 0.9, 0.2, 1.2);
      for (let k = 0; k < 8; k++) c.e.thump(c.t + 0.9 + k * 0.05, 130 - k * 5, 70, 0.07, 0.35, c.out);
    },
    1.7,
    { gap: 0.5, max: 1, prio: 2, vol: 0.7, wet: 0.35 },
  ),
  spell_impact: def(
    (c) => {
      c.e.thump(c.t, 110 * c.p, 40, 0.3, 0.8, c.out);
      c.e.noise(c.t, 0.3, 0.4, { filter: 'lowpass', f: 2500, f1: 200, dest: c.out });
    },
    0.5,
    { gap: 0.1, max: 2, prio: 1, vol: 0.6, wet: 0.2 },
  ),
};

export { vary };
