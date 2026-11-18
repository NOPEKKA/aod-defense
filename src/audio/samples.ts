/**
 * audio/samples.ts - recorded sound effects (public/assets/audio/sfx, see CREDITS.md).
 *
 * Every SFX key can map to several variants. A variant is a stack of layers
 * [file, delay s, gain, rate]. Variants are played round-robin in a shuffled order
 * (never the same one twice in a row) so frequent sounds (bones, coins) do not get tiring.
 * Files are fetched and decoded lazily, in the background, after the audio context exists.
 * Until a sample is decoded (or when its file is missing) the synth patch in sfx.ts plays.
 */
import type { Engine } from './engine';

/** [file name without extension, delay seconds, gain, playback rate] */
type L = [string, number?, number?, number?];

interface Entry {
  /** variants; each one is a stack of layers played together */
  v: L[][];
  /** pick the variant by the `n` option instead of round-robin */
  byN?: boolean;
  /** extra playback rate from the `n` option (combo steps) */
  rateN?: (n: number) => number;
  /** extra gain multiplier */
  g?: number;
}

const f = (name: string, d = 0, g = 1, r = 1): L => [name, d, g, r];

const COMBO_STEPS = [0, 2, 4, 7, 9, 12]; // pentatonic semitones, capped at one octave
const semis = (st: number): number => Math.pow(2, st / 12);

const ARROW: L[][] = [
  [f('bow_1', 0, 0.9), f('swish_4', 0.04, 0.45)],
  [f('bow_2', 0, 1), f('swish_3', 0.05, 0.4)],
  [f('bow_1', 0, 0.9, 1.08), f('swish_2', 0.03, 0.4)],
];

export const SAMPLE_MAP: Record<string, Entry> = {
  // ---------------------------------------------------------------- Ash
  ash_shotgun: {
    v: [
      [f('shotgun_1', 0, 1), f('slam_1', 0, 0.45, 0.55), f('pump_a', 0.36, 0.8), f('pump_b', 0.47, 0.8)],
      [f('shotgun_1', 0, 1, 0.94), f('slam_1', 0, 0.45, 0.5), f('pump_a', 0.36, 0.8, 1.04), f('pump_b', 0.47, 0.8, 1.04)],
    ],
  },
  chainsaw_rev: { v: [[f('chainsaw_1')], [f('chainsaw_1', 0, 1, 0.9)]] },
  chainsaw_bite: { v: [[f('chainsaw_1', 0, 0.8, 1.15), f('blade_1', 0, 0.6)], [f('chainsaw_2', 0, 0.8), f('blade_2', 0, 0.6)]] },
  ash_hurt: { v: [[f('hurt_h1')], [f('hurt_h2')]] },
  ash_dodge: { v: [[f('cloth_1', 0, 1.4)]] },
  ash_death: { v: [[f('die_h1')], [f('die_h2')]] },
  // ----------------------------------------------------- melee and defence
  sword_hit: { v: [[f('sword_3')], [f('sword_4')], [f('sword_7')], [f('blade_1')], [f('blade_2')], [f('blade_3')]] },
  axe_hit: { v: [[f('chop_1'), f('wood_hit_8', 0, 0.6)], [f('chop_1', 0, 1, 0.85), f('bfh_hit_5', 0, 0.6)]] },
  blunt_hit: { v: [[f('wood_hit_1')], [f('wood_hit_5')], [f('wood_hit_8')], [f('bfh_hit_5')]] },
  stab_hit: { v: [[f('knife_2'), f('blade_3', 0, 0.6)], [f('knife_1', 0, 1, 1.1), f('blade_2', 0, 0.6)]] },
  shield_block: { v: [[f('metal_hit_1')], [f('metal_hit_4')], [f('metal_hit_5')], [f('clash_2', 0, 0.7, 1.1)]] },
  // --------------------------------------------------------- ranged, mounted
  arrow_shot: { v: ARROW },
  castle_archer: { v: ARROW, g: 0.8 },
  bolt_shot: { v: [[f('bolt_1')], [f('bolt_1', 0, 1, 0.92)]] },
  arrow_hit: { v: [[f('thunk_1')], [f('thunk_2')], [f('thunk_3')]] },
  spear_thrust: { v: [[f('swish_3', 0, 0.9)], [f('swish_2', 0, 1), f('knife_1', 0.04, 0.4)]] },
  horse_charge: {
    v: [
      [f('horse_1'), f('stomp_1', 0.2, 0.5)],
      [f('stomp_1', 0, 0.8), f('stomp_1', 0.2, 0.7, 0.9), f('stomp_1', 0.4, 0.6, 0.95)],
    ],
  },
  summon: { v: [[f('latch_1'), f('cloth_1', 0.05, 1.3)], [f('belt_1', 0, 1.4), f('latch_1', 0.1, 0.8, 0.9)]] },
  denied: { v: [[f('lock_3')], [f('lock_1', 0, 1, 0.9)]] },
  // ------------------------------------------------------------- the dead
  bone_hit: {
    v: [[f('bone_0')], [f('bone_2')], [f('bone_5')], [f('bone_6')], [f('bone_8')], [f('bone_9')], [f('crack_2', 0, 0.8)], [f('crack_4', 0, 0.8)]],
  },
  bone_collapse: {
    v: [
      [f('shatter_1'), f('bone_5', 0.1, 0.8)],
      [f('shatter_2'), f('bone_8', 0.06, 0.8), f('bone_0', 0.18, 0.6)],
      [f('shatter_3'), f('bone_0', 0.15, 0.7), f('bone_6', 0.24, 0.6)],
    ],
  },
  deadite_groan: { v: [[f('groan_1')], [f('groan_2')], [f('groan_3')]] },
  flyer_screech: { v: [[f('scream_1')], [f('scream_2')]] },
  hag_chirp: { v: [[f('hag_1')], [f('hag_2')], [f('hag_3')]] },
  // -------------------------------------------------------- fire, siege
  fireball_cast: { v: [[f('fireball_1')], [f('fire_6', 0, 1.4)]] },
  fire_burst: { v: [[f('boom_1', 0, 0.9, 1.1)], [f('cannon_03', 0, 0.8)], [f('cannon_01', 0, 0.8, 1.2)]] },
  ram_thud: { v: [[f('wslam_3')], [f('slam_2', 0, 1, 0.8)], [f('wslam_2')]] },
  catapult_creak: { v: [[f('creak_1')], [f('creak_2')], [f('creak_3')]] },
  castle_catapult: { v: [[f('creak_3', 0, 0.7), f('wslam_3', 0.12, 1, 0.75)], [f('creak_1', 0, 0.6), f('wslam_2', 0.14, 1, 0.8)]] },
  boulder_crash: { v: [[f('rock_2'), f('stones_4', 0.1, 0.8)], [f('rock_3')], [f('rock_f1')]] },
  pit_trap: { v: [[f('wbreak_3'), f('rock_3', 0.1, 0.8)], [f('wbreak_1'), f('stones_4', 0.12, 0.9)]] },
  // ------------------------------------------------------------- economy
  coin: {
    v: [[f('coin_g1')], [f('coin_g2')], [f('coin_g3')]],
    rateN: (n) => semis(COMBO_STEPS[Math.min(COMBO_STEPS.length - 1, Math.max(0, n))] * 0.5),
  },
  coin_silver: { v: [[f('coin_s1')], [f('coin_s2')], [f('coin_s3', 0, 1, 1.3)], [f('coin_s4', 0, 1, 1.1)]] },
  mana_chime: { v: [[f('gem_4')], [f('gem_1', 0, 1, 0.85)]] },
  food: { v: [[f('leather_1', 0, 1.3)], [f('misc_5')]] },
  smith_hammer: { v: [[f('hammer_2')], [f('hammer_3')], [f('hammer_4')]] },
  anvil_ring: { v: [[f('anvil_m1')], [f('bell_2', 0, 0.6), f('anvil_m1', 0, 0.7, 1.15)]] },
  combo_ping: {
    v: [[f('gem_1')], [f('gem_4', 0, 0.8)]],
    rateN: (n) => semis(COMBO_STEPS[Math.min(COMBO_STEPS.length - 1, Math.max(0, n))]),
  },
  combo_flourish: { v: [[f('bell_1', 0, 0.7), f('gem_4', 0.05, 0.6)]] },
  heal: { v: [[f('cure_1', 0, 0.8)], [f('cure_3', 0, 0.8)]] },
  book_hit: { v: [[f('bookplace_1')], [f('bookplace_2')], [f('bookplace_3')], [f('bookclose'), f('wood_hit_1', 0, 0.5)]] },
  // ---------------------------------------------------------------- boss
  boss_enter: { v: [[f('roar_big'), f('stomp_1', 0.5, 0.8, 0.7)]] },
  telegraph: { v: [[f('swish_2', 0, 1.2)], [f('spell_1', 0, 0.8)], [f('swish_4', 0, 1.2)], [f('monster_3', 0, 0.7)]], byN: true },
  boss_phase: { v: [[f('roar_5')], [f('roar_6')], [f('roar_4')]] },
  boss_defeat: { v: [[f('die_4'), f('cannon_02', 0.25, 0.8)]] },
  // ----------------------------------------------------- flow and interface
  wave_horn: { v: [[f('horn_1'), f('drums_1', 0.5, 0.8)]] },
  crowd_cheer: { v: [[f('crowd_1')]] },
  button: { v: [[f('btn_1')], [f('btn_2')], [f('btn_3')]] },
  rally: { v: [[f('chain_1')], [f('chain_2')]] },
  pause: { v: [[f('page_3')], [f('page_1')]], byN: true },
  speed: { v: [[f('btn_3', 0, 1, 1.1)], [f('btn_2', 0, 1, 0.9)]] },
  // --------------------------------------------------------------- spells
  cast_super_boomstick: { v: [[f('shotgun_1', 0, 1, 0.85), f('slam_1', 0, 0.6, 0.5)]] },
  impact_super_boomstick: { v: [[f('cannon_03'), f('boom_1', 0.04, 0.7)]] },
  cast_arrow_volley: {
    v: [[f('bow_1', 0, 0.9), f('bow_2', 0.08, 0.8), f('bow_1', 0.17, 0.8, 1.08), f('swish_3', 0.05, 0.5)]],
  },
  impact_arrow_volley: {
    v: [[f('thunk_1'), f('thunk_2', 0.07, 0.9), f('thunk_3', 0.14, 0.9), f('thunk_1', 0.22, 0.8, 1.1)]],
  },
  cast_magic_words: { v: [[f('spell_1')], [f('spell_2')]] },
  impact_magic_words: { v: [[f('gem_4'), f('fire_7', 0, 0.8)], [f('spell_2', 0, 1, 0.9), f('gem_1', 0.08, 0.8)]] },
  cast_catapult_volley: { v: [[f('creak_2'), f('wslam_2', 0.3, 0.9)]] },
  impact_catapult_volley: { v: [[f('rock_2'), f('stones_4', 0.1, 0.8)], [f('rock_f1')], [f('rock_3'), f('stones_4', 0.06, 0.8)]] },
  cast_wrong_book: { v: [[f('monster_3', 0, 0.9, 0.8), f('bookplace_2', 0, 0.7)]] },
  impact_wrong_book: { v: [[f('cannon_03', 0, 0.8, 1.3), f('scream_1', 0.05, 0.4, 0.7)]] },
  cast_chainsaw: { v: [[f('chainsaw_1')], [f('chainsaw_1', 0, 1, 1.1)]] },
  impact_chainsaw: { v: [[f('chainsaw_2'), f('blade_3', 0, 0.7), f('bone_5', 0.1, 0.8)]] },
  cast_deathcoaster: { v: [[f('creak_2'), f('chain_2', 0.1, 0.8)]] },
  impact_deathcoaster: { v: [[f('cannon_01'), f('shatter_2', 0.1, 0.8)]] },
  cast_salt_circle: { v: [[f('cloth_1', 0, 1.3), f('fire_7', 0.05, 0.5)]] },
  impact_salt_circle: { v: [[f('stones_4'), f('cloth_1', 0.05, 1)]] },
  cast_matins_bell: { v: [[f('bell_1')]] },
  impact_matins_bell: { v: [[f('bell_1', 0, 1, 0.8), f('gong_1', 0.03, 0.6)]] },
  cast_hellfire_pitch: { v: [[f('fireball_1', 0, 1, 0.8)], [f('fire_6', 0, 1.3)]] },
  impact_hellfire_pitch: { v: [[f('bang_05', 0, 0.8), f('fire_6', 0.05, 1.2)]] },
  cast_bear_traps: { v: [[f('latch_1'), f('chain_1', 0.08)]] },
  impact_bear_traps: { v: [[f('metal_hit_4'), f('bone_5', 0.04, 0.8), f('bone_8', 0.1, 0.8), f('chain_2', 0.05, 0.6)]] },
  cast_dawn_lance: { v: [[f('cure_1')], [f('cure_3')]] },
  impact_dawn_lance: { v: [[f('thunder_1'), f('gem_4', 0.1, 0.7), f('cure_1', 0.1, 0.6)]] },
  cast_rally_horn: { v: [[f('horn_1', 0, 0.9), f('drums_1', 0.7, 0.7)]] },
  spell_impact: { v: [[f('slam_2', 0, 0.8, 0.8), f('rock_3', 0.02, 0.5)], [f('slam_6', 0, 0.9), f('stones_4', 0.04, 0.6)]] },
};

/** one-shot stingers (played through the music bus) */
export const STINGERS: Record<string, string> = { victory: 'stinger_victory', defeat: 'stinger_defeat' };

const BASE = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './') + 'assets/audio/sfx/';
const EXT = '.wav';

export class SampleBank {
  private readonly bufs = new Map<string, AudioBuffer>();
  private readonly failed = new Set<string>();
  private readonly last = new Map<string, number>();
  private readonly bag = new Map<string, number[]>();
  private started = false;
  loaded = 0;
  total = 0;
  /** files that failed to load or decode (for the debug hook) */
  readonly missing: string[] = [];

  /** start fetching and decoding every file in the background (idempotent) */
  load(ctx: BaseAudioContext): void {
    if (this.started) return;
    this.started = true;
    const names = new Set<string>();
    for (const e of Object.values(SAMPLE_MAP)) for (const v of e.v) for (const l of v) names.add(l[0]);
    for (const n of Object.values(STINGERS)) names.add(n);
    const list = [...names];
    this.total = list.length;
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < list.length) {
        const name = list[next++];
        try {
          const res = await fetch(BASE + name + EXT);
          if (!res.ok) throw new Error('http ' + res.status);
          const data = await res.arrayBuffer();
          this.bufs.set(name, await ctx.decodeAudioData(data));
          this.loaded++;
        } catch {
          this.failed.add(name);
          this.missing.push(name);
        }
      }
    };
    for (let i = 0; i < 4; i++) void worker();
  }

  has(key: string): boolean {
    return key in SAMPLE_MAP;
  }

  buffer(name: string): AudioBuffer | undefined {
    return this.bufs.get(name);
  }

  private ready(v: L[]): boolean {
    for (const l of v) if (!this.bufs.has(l[0])) return false;
    return true;
  }

  private pick(key: string, e: Entry, n: number): L[] | null {
    const vs = e.v;
    if (e.byN) {
      const v = vs[((n % vs.length) + vs.length) % vs.length];
      return this.ready(v) ? v : null;
    }
    let bag = this.bag.get(key);
    for (let tries = 0; tries < 2; tries++) {
      if (!bag || bag.length === 0) {
        bag = vs.map((_, i) => i);
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        // never repeat the previous variant straight away
        if (bag.length > 1 && bag[bag.length - 1] === this.last.get(key)) {
          [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
        }
        this.bag.set(key, bag);
      }
      const idx = bag.pop() as number;
      if (this.ready(vs[idx])) {
        this.last.set(key, idx);
        return vs[idx];
      }
    }
    return null;
  }

  /** play a sample variant of `key`; false when nothing is decoded yet (caller falls back to synth) */
  play(e: Engine, key: string, t: number, out: AudioNode, p: number, i: number, n: number): boolean {
    const ent = SAMPLE_MAP[key];
    if (!ent) return false;
    const v = this.pick(key, ent, n);
    if (!v) return false;
    const rate = p * (ent.rateN ? ent.rateN(n) : 1);
    const gain = (ent.g ?? 1) * (0.85 + 0.15 * Math.min(1, i));
    let any = false;
    for (const l of v) {
      const buf = this.bufs.get(l[0]);
      if (!buf) continue;
      if (e.sample(buf, t + (l[1] ?? 0), out, (l[2] ?? 1) * gain, rate * (l[3] ?? 1))) any = true;
    }
    return any;
  }

  /** play a stinger straight into `dest`; returns its length in seconds or 0 */
  stinger(e: Engine, kind: string, t: number, dest: AudioNode): number {
    const name = STINGERS[kind];
    const buf = name ? this.bufs.get(name) : undefined;
    if (!buf) return 0;
    return e.sample(buf, t, dest, 1, 1) ? buf.duration : 0;
  }
}
