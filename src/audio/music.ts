/**
 * audio/music.ts - generative, loop-safe music.
 *
 * Themes are step sequencers (16 steps per bar). Each theme instance owns a gain node
 * so themes can cross-fade; the conductor schedules notes ~0.3 s ahead on the context
 * clock. Melodies are generated per 8-bar section from a motif (rhythm + contour), so
 * repeats are recognisable but a long wave never loops identically.
 *
 * Themes: menu, battle (4 intensity layers), boss; stingers: victory, defeat.
 * Recorded loops (tracks.ts) replace the loop themes once decoded; these procedural
 * themes play while a track loads or if it fails.
 */
import { type Engine, mtof, clamp } from './engine';
import { TrackBank } from './tracks';

export type ThemeName = 'menu' | 'battle' | 'boss' | 'victory' | 'defeat';
export type LoopTheme = 'menu' | 'battle' | 'boss';

// ----------------------------------------------------------------------------
// small utilities
// ----------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];

interface M {
  e: Engine;
  dest: AudioNode;
  rng: Rng;
  /** battle/boss layer 0..3 */
  level: number;
  /** extra scalar for loudness of the whole theme (1 = normal) */
  gain: number;
}

// scales relative to the tonic (semitones)
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const degToMidi = (root: number, scale: number[], deg: number): number => {
  const oct = Math.floor(deg / 7);
  return root + oct * 12 + scale[((deg % 7) + 7) % 7];
};

// ----------------------------------------------------------------------------
// instruments
// ----------------------------------------------------------------------------

function kick(m: M, t: number, v = 1): void {
  m.e.thump(t, 140, 40, 0.22, 0.9 * v, m.dest);
  m.e.noise(t, 0.01, 0.25 * v, { filter: 'highpass', f: 3000, dest: m.dest });
}
function snare(m: M, t: number, v = 1): void {
  m.e.noise(t, 0.16, 0.5 * v, { filter: 'bandpass', f: 1900, q: 0.8, dest: m.dest });
  m.e.tone(t, 200, 0.1, 0.35 * v, { type: 'triangle', f1: 140, dest: m.dest });
}
function clap(m: M, t: number, v = 1): void {
  for (let k = 0; k < 3; k++) m.e.noise(t + k * 0.011, 0.05, 0.3 * v, { filter: 'bandpass', f: 1500, q: 1.2, dest: m.dest });
  m.e.noise(t + 0.033, 0.18, 0.25 * v, { filter: 'bandpass', f: 1300, q: 1, dest: m.dest });
}
function hat(m: M, t: number, v = 1, open = false): void {
  m.e.noise(t, open ? 0.14 : 0.03, 0.2 * v, { filter: 'highpass', f: 7500, dest: m.dest });
}
function tom(m: M, t: number, f: number, v = 1): void {
  m.e.thump(t, f * 1.5, f, 0.28, 0.75 * v, m.dest);
  m.e.noise(t, 0.05, 0.18 * v, { filter: 'bandpass', f: 700, q: 1.5, dest: m.dest });
}
function taiko(m: M, t: number, v = 1): void {
  m.e.thump(t, 95, 48, 0.5, 0.95 * v, m.dest);
  m.e.noise(t, 0.08, 0.3 * v, { filter: 'lowpass', f: 1500, dest: m.dest });
}
function bass(m: M, t: number, midi: number, dur: number, v = 1): void {
  const f = mtof(midi);
  m.e.tone(t, f, dur, 0.34 * v, { type: 'sawtooth', lp: 650, lpEnd: 220, q: 2, a: 0.004, dest: m.dest });
  m.e.tone(t, f * 0.5, dur, 0.34 * v, { type: 'sine', a: 0.006, dest: m.dest });
}
function pluck(m: M, t: number, midi: number, dur: number, v = 1): void {
  const f = mtof(midi);
  m.e.tone(t, f, dur, 0.2 * v, { type: 'triangle', a: 0.002, lp: 3000, lpEnd: 900, dest: m.dest });
  m.e.tone(t, f * 2.003, dur * 0.6, 0.07 * v, { type: 'sine', a: 0.002, dest: m.dest });
}
/** reedy shawm / hurdy-gurdy-ish lead */
function lead(m: M, t: number, midi: number, dur: number, v = 1, bright = 1): void {
  const f = mtof(midi);
  m.e.tone(t, f, dur, 0.15 * v, { type: 'sawtooth', a: 0.015, r: dur * 0.4, lp: 1700 * bright, lpEnd: 1100 * bright, q: 4, vib: [5.2, 14], vibDelay: 0.15, dest: m.dest });
  m.e.tone(t, f * 1.006, dur, 0.1 * v, { type: 'square', a: 0.02, r: dur * 0.4, lp: 1300 * bright, q: 3, dest: m.dest });
}
function pad(m: M, t: number, midis: number[], dur: number, v = 1, lp = 800): void {
  for (const mi of midis) {
    const f = mtof(mi);
    m.e.tone(t, f * 0.997, dur, 0.07 * v, { type: 'sawtooth', a: dur * 0.35, r: dur * 0.45, lp, lpEnd: lp * 0.6, dest: m.dest });
    m.e.tone(t, f * 1.004, dur, 0.07 * v, { type: 'sawtooth', a: dur * 0.35, r: dur * 0.45, lp, lpEnd: lp * 0.6, detune: 4, dest: m.dest });
  }
}
function brassStab(m: M, t: number, midis: number[], dur: number, v = 1): void {
  for (const mi of midis) {
    const f = mtof(mi);
    m.e.tone(t, f, dur, 0.13 * v, { type: 'sawtooth', a: 0.02, r: dur * 0.5, lp: 500, lpEnd: 1900, q: 1.5, dest: m.dest });
    m.e.tone(t, f * 1.005, dur, 0.09 * v, { type: 'square', a: 0.025, r: dur * 0.5, lp: 700, lpEnd: 1500, dest: m.dest });
  }
}
function strings(m: M, t: number, midi: number, dur: number, v = 1): void {
  const f = mtof(midi);
  m.e.tone(t, f, dur, 0.1 * v, { type: 'sawtooth', a: 0.03, r: dur * 0.5, lp: 2600, q: 1, vib: [5.8, 12], vibDelay: 0.1, dest: m.dest });
  m.e.tone(t, f * 1.007, dur, 0.07 * v, { type: 'sawtooth', a: 0.03, r: dur * 0.5, lp: 2200, detune: 5, dest: m.dest });
}
function bellTone(m: M, t: number, midi: number, dur: number, v = 1): void {
  m.e.metal(t, mtof(midi), dur, 0.12 * v, m.dest, [1, 2, 3, 4.2, 5.4]);
}
function flute(m: M, t: number, midi: number, dur: number, v = 1): void {
  const f = mtof(midi);
  m.e.tone(t, f, dur, 0.17 * v, { type: 'triangle', a: 0.07, r: dur * 0.6, vib: [5, 16], vibDelay: 0.2, dest: m.dest });
  m.e.tone(t, f * 2, dur, 0.04 * v, { type: 'sine', a: 0.09, dest: m.dest });
  m.e.noise(t, dur * 0.7, 0.025 * v, { filter: 'bandpass', f: f * 2, q: 3, a: 0.06, dest: m.dest });
}
function choir(m: M, t: number, midis: number[], dur: number, v = 1): void {
  for (const mi of midis) {
    const f = mtof(mi);
    m.e.tone(t, f, dur, 0.06 * v, { type: 'sawtooth', a: dur * 0.3, r: dur * 0.5, lp: 900, q: 6, vib: [5, 22], vibDelay: 0.4, dest: m.dest });
  }
}
function swell(m: M, t: number, dur: number, v = 1): void {
  m.e.noise(t, dur, 0.22 * v, { color: 'pink', filter: 'bandpass', f: 300, f1: 1800, q: 1.2, a: dur * 0.85, dest: m.dest });
}
function riser(m: M, t: number, dur: number, v = 1): void {
  m.e.noise(t, dur, 0.32 * v, { filter: 'bandpass', f: 300, f1: 6000, q: 1.5, a: dur * 0.95, dest: m.dest });
  m.e.tone(t, 110, dur, 0.1 * v, { type: 'sawtooth', f1: 440, a: dur * 0.95, lp: 1200, dest: m.dest });
}

// ----------------------------------------------------------------------------
// melody generator
// ----------------------------------------------------------------------------

const RHYTHMS: number[][] = [
  [0, 3, 6, 8, 10, 12],
  [0, 2, 4, 6, 8, 12, 14],
  [0, 4, 6, 8, 12],
  [0, 3, 4, 8, 11, 12, 14],
  [0, 6, 8, 10, 14],
  [0, 2, 3, 6, 8, 11, 12],
];
const STEP_MOVES = [-2, -1, -1, 0, 1, 1, 2, 3, -3];

class Melody {
  private rhythm: number[] = RHYTHMS[0];
  private rhythmB: number[] = RHYTHMS[1];
  private moves: number[] = [];
  private movesB: number[] = [];
  constructor(private rng: Rng, private lo: number, private hi: number) {}

  newSection(): void {
    this.rhythm = pick(this.rng, RHYTHMS);
    this.rhythmB = pick(this.rng, RHYTHMS);
    this.moves = Array.from({ length: 8 }, () => pick(this.rng, STEP_MOVES));
    this.movesB = Array.from({ length: 8 }, () => pick(this.rng, STEP_MOVES));
  }

  /**
   * notes for one bar. barInSection 0..7; chordDeg = scale degree of the chord root.
   * returns [step, degree, lengthInSteps][]
   */
  bar(barInSection: number, chordDeg: number): Array<[number, number, number]> {
    if (barInSection === 0 && this.moves.length === 0) this.newSection();
    const useB = barInSection >= 4 && barInSection < 6;
    const rh = useB ? this.rhythmB : this.rhythm;
    const mv = useB ? this.movesB : this.moves;
    const out: Array<[number, number, number]> = [];
    let d = chordDeg + 7 + pick(this.rng, [0, 2, 4]);
    const lastBar = barInSection === 7;
    const endVar = barInSection % 2 === 1;
    for (let k = 0; k < rh.length; k++) {
      let move = mv[k % mv.length];
      if (endVar && k >= rh.length - 2) move = pick(this.rng, STEP_MOVES); // variation at the end of each pair
      if (k > 0) d += move;
      d = clamp(d, this.lo, this.hi);
      const step = rh[k];
      const next = k + 1 < rh.length ? rh[k + 1] : 16;
      let deg = d;
      if (lastBar && k === rh.length - 1) deg = chordDeg + 7; // resolve to the root
      out.push([step, deg, Math.max(1, next - step)]);
    }
    return out;
  }
}

// ----------------------------------------------------------------------------
// themes
// ----------------------------------------------------------------------------

export interface ThemeImpl {
  bpm: number;
  /** schedule step s (0..15) of bar `bar` at time t; sd = step duration in seconds */
  step(m: M, bar: number, s: number, t: number, sd: number): void;
}

/** MENU: slow, modal, atmospheric (D dorian) */
function makeMenu(rng: Rng): ThemeImpl {
  const ROOT = 50; // D3
  const prog = [0, 5, 3, 4, 0, 2, 5, 4]; // Dm, Bb(b6), Gm?, A ... as scale degrees
  const mel = new Melody(rng, 4, 13);
  let barNotes: Array<[number, number, number]> = [];
  const chordMidis = (deg: number): number[] => [degToMidi(ROOT, DORIAN, deg), degToMidi(ROOT, DORIAN, deg + 2), degToMidi(ROOT, DORIAN, deg + 4)];
  return {
    bpm: 62,
    step(m, bar, s, t, sd) {
      const deg = prog[bar % prog.length];
      const bs = sd * 16;
      if (s === 0) {
        if (bar % 8 === 0) mel.newSection();
        // pad and drone
        pad(m, t, chordMidis(deg).map((x) => x + 12), bs * 1.15, 0.9, 700 + (bar % 4) * 120);
        m.e.tone(t, mtof(ROOT - 12), bs * 1.1, 0.24, { type: 'sawtooth', a: bs * 0.4, r: bs * 0.5, lp: 180 + (bar % 3) * 40, dest: m.dest });
        m.e.tone(t, mtof(ROOT - 12 + 7), bs * 1.1, 0.12, { type: 'sine', a: bs * 0.4, r: bs * 0.5, dest: m.dest });
        if (bar % 4 === 1) swell(m, t, bs * 1.3, 0.8);
        if (bar % 8 === 6 && m.rng() < 0.7) choir(m, t, chordMidis(deg).map((x) => x + 12), bs * 1.2, 0.9);
        barNotes = bar >= 2 ? mel.bar(bar % 8, deg) : [];
      }
      // soft frame drum
      if (s === 0) tom(m, t, 62, 0.55);
      if (s === 8) tom(m, t, 78, 0.28);
      if (s === 14 && bar % 4 === 3) tom(m, t, 70, 0.22);
      // sparse melody: flute on lower density, music-box bell echoes
      for (const [st, d, len] of barNotes) {
        if (st !== s) continue;
        if (m.rng() < 0.35) continue; // leave air
        const midi = degToMidi(ROOT, DORIAN, d);
        flute(m, t, midi, Math.min(len * sd * 1.2, 2.5), 0.9);
        if (m.rng() < 0.28) bellTone(m, t + sd * 3, midi + 12, 1.6, 0.6);
      }
      // distant arpeggio pluck on the 8th
      if (s % 4 === 2 && bar % 2 === 1 && m.rng() < 0.5) pluck(m, t, degToMidi(ROOT, DORIAN, deg + [7, 9, 11, 14][(s >> 2) % 4]) , 0.9, 0.5);
      // a cheeky out-of-tune plink now and then (horror-comedy wink)
      if (s === 10 && bar % 16 === 11) m.e.tone(t, mtof(86), 0.12, 0.1, { type: 'triangle', f1: mtof(86) * 0.94, dest: m.dest });
    },
  };
}

/** BATTLE: driving, D aeolian, 4 intensity layers */
function makeBattle(rng: Rng): ThemeImpl {
  const ROOT = 38; // D2 for bass
  const progA = [0, -1, -2, -1]; // Dm C Bb C  (degrees: C = -1, Bb = -2)
  const progB = [0, -2, -1, 4];
  const mel = new Melody(rng, 2, 14);
  const ctr = new Melody(rng, 7, 16);
  let barNotes: Array<[number, number, number]> = [];
  let ctrNotes: Array<[number, number, number]> = [];
  const rootDeg = (bar: number): number => ((bar >> 2) & 1 ? progB : progA)[bar & 3];
  const BASS: number[] = [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0];
  return {
    bpm: 128,
    step(m, bar, s, t, sd) {
      const L = m.level;
      const deg = rootDeg(bar);
      const rootMidi = degToMidi(ROOT, AEOLIAN, deg);
      const sec = bar & 7;
      const bs = sd * 16;

      if (s === 0) {
        if (sec === 0) {
          mel.newSection();
          ctr.newSection();
        }
        barNotes = L >= 1 || bar % 16 >= 4 ? mel.bar(sec, deg) : [];
        ctrNotes = L >= 2 ? ctr.bar(sec, deg) : [];
        // drone pad underneath
        pad(m, t, [rootMidi + 24, rootMidi + 27, rootMidi + 31].map((x, i) => (deg === -2 && i === 1 ? x + 0 : x)), bs * 1.1, 0.6 + L * 0.1, 900);
        if (sec === 7 && L >= 1) riser(m, t + bs * 0.5, bs * 0.5, 0.5);
        if (sec === 0 && bar > 0) m.e.noise(t, 1.2, 0.2, { filter: 'highpass', f: 5000, f1: 2000, dest: m.dest }); // crash
      }

      // drums
      if (s === 0 || s === 8) kick(m, t, s === 0 ? 1 : 0.85);
      if (s === 6 || (s === 10 && L >= 1)) kick(m, t, 0.7);
      if (s === 3 && L >= 3) kick(m, t, 0.6);
      if (s === 4 || s === 12) {
        if (L >= 2) {
          snare(m, t, 1);
          if (L >= 3) clap(m, t, 0.6);
        } else tom(m, t, 90, 0.6);
      }
      if (L >= 1 && s % 2 === 0) hat(m, t, s % 4 === 2 ? 1 : 0.6, s === 14);
      if (L >= 2 && s % 2 === 1) hat(m, t, 0.35);
      if (L >= 2 && s === 15 && sec % 2 === 1) {
        tom(m, t, 120, 0.5);
        tom(m, t + sd * 0.5, 100, 0.5);
      }
      // war-drum rolls into the next section
      if (sec === 7 && s >= 12 && L >= 1) tom(m, t, 110 - (s - 12) * 8, 0.55);
      if (L >= 3 && (s === 0 || s === 10)) taiko(m, t, 0.7);

      // bass ostinato
      if (BASS[s] || (L >= 3 && s % 2 === 1 && s !== 5)) {
        const oct = s === 10 || s === 15 ? 12 : 0;
        bass(m, t, rootMidi + oct, sd * 1.6, L >= 3 ? 0.95 : 0.8);
      }

      // modal lead
      for (const [st, d, len] of barNotes) {
        if (st !== s) continue;
        const midi = degToMidi(50, AEOLIAN, d);
        lead(m, t, midi, Math.min(len * sd * 0.95, 1.4), L >= 2 ? 1 : 0.85, 1 + L * 0.12);
      }
      // counter line: plucked, a third above, off-beat
      for (const [st, d, len] of ctrNotes) {
        if (st !== s) continue;
        if (len > 0) strings(m, t + sd * 0.02, degToMidi(50, AEOLIAN, d - 2) + 12, Math.min(len * sd, 0.9), 0.6);
      }
      // low brass stabs on section changes at the high intensity
      if (L >= 3 && s === 0 && sec % 4 === 0) brassStab(m, t, [rootMidi + 12, rootMidi + 19], bs * 0.5, 0.9);
      // arpeggiated pluck keeps the energy on even a quiet layer
      if (L === 0 && s % 4 === 2) pluck(m, t, rootMidi + 24 + [0, 3, 7, 10][(s >> 2) & 3], sd * 3, 0.6);
      // the comic "boing" at the end of a long phrase
      if (sec === 7 && s === 13 && m.rng() < 0.35) m.e.tone(t, 600, 0.18, 0.1, { type: 'square', f1: 1400, lp: 3000, vib: [14, 80], dest: m.dest });
    },
  };
}

/** BOSS: faster, heavier, dissonant (D phrygian with a tritone pedal) */
function makeBoss(rng: Rng): ThemeImpl {
  const ROOT = 38;
  const prog = [0, 1, 0, -2, 0, 1, 2, 1]; // D Eb D C | D Eb F Eb (phrygian)
  const mel = new Melody(rng, 4, 15);
  let barNotes: Array<[number, number, number]> = [];
  const GALLOP = [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1];
  return {
    bpm: 150,
    step(m, bar, s, t, sd) {
      const L = Math.max(1, m.level);
      const deg = prog[bar % prog.length];
      const rootMidi = degToMidi(ROOT, PHRYGIAN, deg);
      const bs = sd * 16;
      const sec = bar & 7;
      if (s === 0) {
        if (sec === 0) mel.newSection();
        barNotes = mel.bar(sec, deg);
        // choir drone cluster: root, minor second, tritone
        choir(m, t, [rootMidi + 24, rootMidi + 25, rootMidi + 30], bs * 1.1, 0.8 + L * 0.1);
        pad(m, t, [rootMidi + 12, rootMidi + 19], bs * 1.1, 0.8, 600);
        if (sec === 7) riser(m, t, bs, 0.8);
        if (sec === 0) {
          m.e.noise(t, 1.4, 0.25, { filter: 'highpass', f: 4000, f1: 1500, dest: m.dest });
          taiko(m, t, 1);
        }
      }
      // drums: double-kick gallop, backbeat, toms
      if (s % 4 === 0) kick(m, t, s === 0 ? 1 : 0.85);
      if (s === 3 || s === 11 || (L >= 2 && s === 14)) kick(m, t, 0.65);
      if (s === 4 || s === 12) {
        snare(m, t, 1.1);
        clap(m, t, 0.5);
      }
      if (s % 2 === 0) hat(m, t, 0.7, s === 14);
      if (L >= 2 && s % 2 === 1) hat(m, t, 0.4);
      if (s === 0 || s === 6 || s === 10) taiko(m, t, 0.75);
      if (sec % 4 === 3 && s >= 12) tom(m, t, 150 - (s - 12) * 18, 0.7);
      // gallop bass with the tritone
      if (GALLOP[s]) {
        const tri = sec === 3 || sec === 7 ? (s % 8 >= 4 ? 6 : 0) : 0;
        bass(m, t, rootMidi + (s === 10 || s === 15 ? 12 : 0) + tri, sd * 1.3, 1);
      }
      // brass stabs and dissonant strings
      if (s === 0 || s === 6 || s === 10) brassStab(m, t, [rootMidi + 12, rootMidi + 19, rootMidi + 25], sd * 3, 0.9);
      if (L >= 3 && s % 4 === 2) strings(m, t, rootMidi + 36 + (s === 14 ? 6 : 0), sd * 2, 0.6);
      // screaming lead
      for (const [st, d, len] of barNotes) {
        if (st !== s) continue;
        const midi = degToMidi(50, PHRYGIAN, d);
        lead(m, t, midi, Math.min(len * sd * 0.9, 1.1), 1, 1.5);
      }
    },
  };
}

export const THEMES: Record<LoopTheme, (rng: Rng) => ThemeImpl> = {
  menu: makeMenu,
  battle: makeBattle,
  boss: makeBoss,
};

// ----------------------------------------------------------------------------
// stingers (one shot, scheduled up front)
// ----------------------------------------------------------------------------

/** returns the stinger's length in seconds */
function stinger(m: M, kind: 'victory' | 'defeat', t: number): number {
  const e = m.e;
  if (kind === 'victory') {
    const q = 0.3; // beat
    // timpani roll into a brass fanfare in D major
    for (let k = 0; k < 10; k++) tom(m, t + k * 0.06, 90 + k * 3, 0.35 + k * 0.05);
    taiko(m, t + 0.6, 1);
    const f: Array<[number, number, number]> = [
      [0.6, 62, 0.28], [0.9, 66, 0.28], [1.2, 69, 0.28], [1.5, 74, 0.7],
      [2.3, 71, 0.28], [2.6, 74, 0.28], [2.9, 78, 1.8],
    ];
    for (const [at, midi, d] of f) {
      brassStab(m, t + at, [midi, midi - 12], d, 1.3);
      if (d > 1) e.metal(t + at, mtof(midi + 12), 2.2, 0.08, m.dest);
    }
    brassStab(m, t + 2.9, [62, 69, 74, 78, 81], 2.2, 1.0);
    taiko(m, t + 2.9, 1);
    for (let k = 0; k < 5; k++) e.tone(t + 2.9 + k * 0.07, mtof(86 + [0, 4, 7, 12, 16][k] - 2), 1.4, 0.07, { type: 'triangle', dest: m.dest });
    void q;
    return 5.6;
  }
  // defeat: slow minor dirge, tolling bell, sad trombone slide
  for (let k = 0; k < 3; k++) {
    bellTone(m, t + k * 1.1, 38 - k, 2.4, 1.6);
    taiko(m, t + k * 1.1, 0.7 - k * 0.12);
  }
  pad(m, t, [50, 53, 57], 4, 1.4, 600);
  pad(m, t + 2, [49, 53, 56], 4.4, 1.4, 500);
  choir(m, t + 0.5, [62, 65, 69], 3.5, 0.7);
  const slide: Array<[number, number, number, number]> = [
    [3.6, 58, 56, 0.5], [4.15, 56, 54, 0.5], [4.7, 54, 52, 0.5], [5.25, 52, 46, 1.6],
  ];
  for (const [at, a, b, d] of slide) {
    e.tone(t + at, mtof(a), d, 0.2, { type: 'sawtooth', f1: mtof(b), a: 0.04, r: d * 0.4, lp: 900, q: 2, vib: [5, 30], vibDelay: 0.2, dest: m.dest });
    e.tone(t + at, mtof(a) * 1.01, d, 0.12, { type: 'square', f1: mtof(b) * 1.01, a: 0.05, lp: 700, dest: m.dest });
  }
  return 7.6;
}

// ----------------------------------------------------------------------------
// conductor
// ----------------------------------------------------------------------------

interface Instance {
  name: ThemeName;
  gain: GainNode;
  send: GainNode;
  impl: ThemeImpl | null;
  rng: Rng;
  nextTime: number;
  bar: number;
  s: number;
  /** context time after which the instance is removed */
  endAt: number;
  fading: boolean;
  /** stingers: context time the sound finishes */
  stingerEnd: number;
  startedAt: number;
  /** recorded loop (replaces the procedural impl) */
  src: AudioBufferSourceNode | null;
  track: string | null;
}

export class Conductor {
  private cur: Instance | null = null;
  private old: Instance[] = [];
  /** 0..3 */
  intensity = 0;
  /** tempo multiplier (speed x2) */
  tempoMul = 1;
  /** optional recorded stinger: plays it into dest and returns its length (0 = not available) */
  sampleStinger: ((kind: string, t: number, dest: AudioNode) => number) | null = null;
  /** 0 mutes scheduling entirely */
  enabled = true;
  readonly log: string[] = [];
  /** recorded loops; the procedural themes cover the gap while one loads or if it fails */
  readonly tracks: TrackBank;
  /** set false to force the procedural themes (debug / tests) */
  useTracks = true;

  constructor(private e: Engine) {
    this.tracks = new TrackBank(e.ctx);
  }

  /** file of the track playing now, or null */
  get track(): string | null {
    return this.cur ? this.cur.track : null;
  }

  get theme(): ThemeName | 'none' {
    return this.cur ? this.cur.name : 'none';
  }

  /** seconds left of a running stinger (0 if none) */
  stingerLeft(): number {
    const c = this.cur;
    if (!c || c.impl || c.track || (c.name !== 'victory' && c.name !== 'defeat')) return 0;
    return Math.max(0, c.stingerEnd - this.e.ctx.currentTime);
  }

  setTheme(name: ThemeName | 'none', fade = 1.2): void {
    if ((this.cur && this.cur.name === name) || (!this.cur && name === 'none')) return;
    const ctx = this.e.ctx;
    const now = ctx.currentTime;
    if (this.cur) this.fadeOut(this.cur, fade);
    this.log.push(name);
    if (this.log.length > 20) this.log.shift();
    if (name === 'none') {
      this.cur = null;
      return;
    }
    const gain = ctx.createGain();
    const send = ctx.createGain();
    send.gain.value = name === 'menu' ? 0.35 : name === 'battle' ? 0.16 : 0.22;
    gain.connect(this.e.musicBus);
    gain.connect(send);
    send.connect(this.e.musicWet);
    const quick = name === 'victory' || name === 'defeat';
    gain.gain.setValueAtTime(quick ? 1 : 0.0001, now);
    if (!quick) gain.gain.exponentialRampToValueAtTime(1, now + Math.max(0.1, fade));
    const rng = mulberry32((Math.random() * 4294967296) >>> 0);
    const loopName = name === 'menu' || name === 'battle' || name === 'boss' ? name : null;
    const file = loopName && this.useTracks ? this.tracks.next(loopName) : null;
    const ready = file ? this.tracks.get(file) : null;
    const inst: Instance = {
      name,
      gain,
      send,
      impl: quick || ready ? null : THEMES[name as LoopTheme](rng),
      rng,
      nextTime: now + 0.06,
      bar: 0,
      s: 0,
      endAt: Infinity,
      fading: false,
      stingerEnd: 0,
      startedAt: now,
      src: null,
      track: null,
    };
    if (ready && file) this.attachTrack(inst, file, ready);
    else if (file) {
      // not decoded yet: the procedural theme plays and the recording takes over when ready
      void this.tracks.load(file).then((buf) => {
        if (buf && this.cur === inst && !inst.fading && !inst.src) this.swapToTrack(inst, file, buf);
      });
    }
    if (quick) {
      const recorded = this.sampleStinger ? this.sampleStinger(name, now + 0.08, inst.gain) : 0;
      const len = recorded > 0 ? recorded : stinger(this.ctxM(inst), name as 'victory' | 'defeat', now + 0.08);
      inst.stingerEnd = now + len;
      inst.endAt = now + len + 3;
    }
    this.cur = inst;
  }

  private attachTrack(inst: Instance, file: string, buf: AudioBuffer): void {
    const src = this.e.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(inst.gain);
    src.start(this.e.ctx.currentTime + 0.02);
    inst.src = src;
    inst.track = file;
  }

  /** replace a running procedural theme with its recording (cross-fade) */
  private swapToTrack(inst: Instance, file: string, buf: AudioBuffer): void {
    const ctx = this.e.ctx;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const send = ctx.createGain();
    send.gain.value = inst.send.gain.value;
    gain.connect(this.e.musicBus);
    gain.connect(send);
    send.connect(this.e.musicWet);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1, now + 2);
    const next: Instance = { ...inst, gain, send, impl: null, src: null, track: null, nextTime: Infinity, endAt: Infinity, fading: false };
    this.attachTrack(next, file, buf);
    this.fadeOut(inst, 2);
    this.cur = next;
  }

  private ctxM(inst: Instance): M {
    return { e: this.e, dest: inst.gain, rng: inst.rng, level: this.intensity, gain: 1 };
  }

  private fadeOut(inst: Instance, fade: number): void {
    const now = this.e.ctx.currentTime;
    inst.fading = true;
    inst.gain.gain.cancelScheduledValues(now);
    inst.gain.gain.setValueAtTime(Math.max(0.0001, inst.gain.gain.value), now);
    inst.gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.05, fade));
    inst.endAt = now + fade + 2.5; // let scheduled tails die out
    inst.impl = inst.impl ? inst.impl : null;
    inst.nextTime = Infinity;
    this.old.push(inst);
  }

  /** call a few times per second */
  update(ahead = 0.3): void {
    const ctx = this.e.ctx;
    const now = ctx.currentTime;
    // retire old instances
    for (let i = this.old.length - 1; i >= 0; i--) {
      if (now > this.old[i].endAt) {
        try {
          this.old[i].src?.stop();
          this.old[i].src?.disconnect();
          this.old[i].gain.disconnect();
          this.old[i].send.disconnect();
        } catch {
          /* ignore */
        }
        this.old.splice(i, 1);
      }
    }
    const c = this.cur;
    if (!c) return;
    if (!c.impl) {
      // stinger finished: leave it for the controller to replace
      return;
    }
    const impl = c.impl;
    if (!this.enabled) {
      if (c.nextTime < now) c.nextTime = now + 0.05;
      return;
    }
    const m: M = { e: this.e, dest: c.gain, rng: c.rng, level: this.intensity, gain: 1 };
    const horizon = now + ahead;
    let guard = 0;
    while (c.nextTime < horizon && guard++ < 8192) {
      const sd = 60 / (impl.bpm * this.tempoMul) / 4;
      if (c.nextTime < now - 0.5) c.nextTime = now + 0.02; // we fell behind (tab was throttled): resync
      impl.step(m, c.bar, c.s, c.nextTime, sd);
      c.nextTime += sd;
      c.s++;
      if (c.s >= 16) {
        c.s = 0;
        c.bar++;
      }
    }
  }

  /** drop everything immediately (used on shutdown or mute) */
  stopAll(): void {
    if (this.cur) this.fadeOut(this.cur, 0.1);
    this.cur = null;
  }

  info(): { bar: number; step: number; instances: number } {
    return { bar: this.cur ? this.cur.bar : 0, step: this.cur ? this.cur.s : 0, instances: this.old.length + (this.cur ? 1 : 0) };
  }
}
