/**
 * audio/samples.ts - recorded sound effects (public/assets/audio/sfx, see CREDITS.md).
 *
 * The files are 48 kHz mono Ogg Opus one-shots, pre-mixed and trimmed at build time from
 * professional libraries (Sonniss GDC bundles, Mixkit). Every SFX key can map to several
 * variants. A variant is a stack of layers [file, delay s, gain, rate]. Variants are
 * played round-robin in a shuffled order (never the same one twice in a row) so frequent
 * sounds (bones, coins) do not get tiring. Files are fetched and decoded lazily, in the
 * background, after the audio context exists. Until a sample is decoded (or when its
 * file is missing) the synth patch in sfx.ts plays.
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
  /** extra random playback-rate spread (+-), on top of the system's small pitch variation */
  vr?: number;
}

const f = (name: string, d = 0, g = 1, r = 1): L => [name, d, g, r];
/** one variant per file */
const each = (...names: string[]): L[][] => names.map((n) => [f(n)]);

const COMBO_STEPS = [0, 2, 4, 7, 9, 12]; // pentatonic semitones, capped at one octave
const semis = (st: number): number => Math.pow(2, st / 12);

// Ash's boomstick: blast (sub boom + crack + short room tail), then the pump rack.
// The fire interval is 1.5 s, so the rack lands at 0.42 s and is done before the next shot.
const SHOTGUN: L[][] = [
  [f('sg_blast_1'), f('sg_pump_1', 0.42, 0.75)],
  [f('sg_blast_2'), f('sg_pump_2', 0.42, 0.75)],
  [f('sg_blast_3'), f('sg_pump_3', 0.4, 0.7)],
  [f('sg_blast_1', 0, 1, 0.96), f('sg_pump_2', 0.43, 0.75, 1.03)],
  [f('sg_blast_3', 0, 1, 1.03), f('sg_pump_1', 0.42, 0.75, 0.97)],
];

export const SAMPLE_MAP: Record<string, Entry> = {
  // ---------------------------------------------------------------- Ash
  ash_shotgun: { v: SHOTGUN, g: 1.1, vr: 0.015 },
  chainsaw_rev: { v: each('cs_rev_1', 'cs_rev_2', 'cs_rev_3'), vr: 0.04 },
  chainsaw_bite: { v: each('cs_cut_1', 'cs_cut_2', 'cs_cut_3'), vr: 0.04 },
  ash_hurt: { v: each('ash_hurt_1', 'ash_hurt_2'), vr: 0.03 },
  ash_dodge: { v: each('dodge_1', 'dodge_2'), vr: 0.05 },
  ash_death: { v: [[f('ash_death_1')], [f('ash_death_1', 0, 1, 0.94)]] },
  // ----------------------------------------------------- melee and defence
  sword_hit: { v: each('sword_1', 'sword_2', 'sword_3', 'sword_4', 'sword_5', 'sword_6'), vr: 0.05 },
  axe_hit: { v: each('axe_1', 'axe_2', 'axe_3'), vr: 0.05 },
  blunt_hit: { v: each('blunt_1', 'blunt_2', 'blunt_3'), vr: 0.06 },
  stab_hit: { v: each('stab_1', 'stab_2'), vr: 0.06 },
  shield_block: { v: each('block_1', 'block_2', 'block_3'), vr: 0.05 },
  // --------------------------------------------------------- ranged, mounted
  arrow_shot: { v: each('bow_1', 'bow_2', 'bow_3'), vr: 0.05 },
  castle_archer: { v: each('bow_1', 'bow_2', 'bow_3'), g: 0.8, vr: 0.06 },
  bolt_shot: { v: [[f('xbow_1')], [f('xbow_1', 0, 1, 0.9)], [f('xbow_1', 0, 0.9, 1.06)]] },
  arrow_hit: { v: each('thunk_1', 'thunk_2', 'thunk_3', 'thunk_4'), vr: 0.06 },
  spear_thrust: { v: each('thrust_1', 'thrust_2'), vr: 0.06 },
  horse_charge: { v: each('horse_1', 'horse_2'), vr: 0.03 },
  summon: {
    // by unit: 0 foot soldier, 1 archers, 2 horseman, 3 heroes, 4 wiseman
    v: [[f('summon_1')], [f('summon_2')], [f('summon_2', 0, 1, 0.85)], [f('summon_1', 0, 1, 0.9), f('anvil', 0.12, 0.35)], [f('page_1'), f('mana_1', 0.06, 0.6)]],
    byN: true,
  },
  denied: { v: each('ui_denied_1', 'ui_denied_2') },
  // ------------------------------------------------------------- the dead
  bone_hit: { v: each('bone_1', 'bone_2', 'bone_3', 'bone_4', 'bone_5', 'bone_6'), g: 1.3, vr: 0.08 },
  bone_collapse: { v: each('bone_burst_1', 'bone_burst_2', 'bone_burst_3', 'bone_burst_4'), vr: 0.07 },
  deadite_groan: { v: each('groan_1', 'groan_2', 'groan_3'), vr: 0.06 },
  flyer_screech: { v: each('screech_1', 'screech_2'), vr: 0.05 },
  hag_chirp: { v: each('hag_1', 'hag_2'), vr: 0.06 },
  // -------------------------------------------------------- fire, siege
  fireball_cast: { v: each('fireball_1', 'fireball_2'), vr: 0.05 },
  fire_burst: { v: each('fire_burst_1', 'fire_burst_2'), vr: 0.06 },
  ram_thud: { v: each('ram_1', 'ram_2'), vr: 0.04 },
  catapult_creak: { v: each('creak_1', 'creak_2'), vr: 0.06 },
  castle_catapult: { v: each('cat_launch_1', 'cat_launch_2'), vr: 0.04 },
  boulder_crash: { v: each('boulder_1', 'boulder_2'), vr: 0.06 },
  pit_trap: { v: [[f('pit_1')], [f('pit_1', 0, 1, 0.92)]] },
  // ------------------------------------------------------------- economy
  coin: {
    v: each('coin_g1', 'coin_g2', 'coin_g3'),
    rateN: (n) => semis(COMBO_STEPS[Math.min(COMBO_STEPS.length - 1, Math.max(0, n))] * 0.5),
    g: 1.3,
  },
  // silver plays on almost every kill: soft, short, lots of variation
  coin_silver: { v: each('coin_s1', 'coin_s2', 'coin_s3', 'coin_s4'), g: 1.5, vr: 0.1 },
  mana_chime: { v: [[f('mana_1')], [f('mana_1', 0, 1, 1.12)], [f('mana_1', 0, 1, 0.92)]] },
  food: { v: [[f('food_1')], [f('food_1', 0, 1, 1.1)]] },
  smith_hammer: { v: each('hammer_1', 'hammer_2'), vr: 0.05 },
  anvil_ring: { v: [[f('anvil')], [f('anvil', 0, 1, 1.06)]] },
  combo_ping: {
    v: [[f('ping')]],
    rateN: (n) => semis(COMBO_STEPS[Math.min(COMBO_STEPS.length - 1, Math.max(0, n))]),
  },
  combo_flourish: { v: [[f('flourish')]] },
  heal: { v: each('heal_1', 'heal_2'), vr: 0.04 },
  book_hit: { v: each('book_1', 'book_2', 'book_3', 'book_4'), vr: 0.05 },
  // ---------------------------------------------------------------- boss
  boss_enter: { v: [[f('boss_enter')]] },
  // by shape: band (big swing), circle (spell charge), line (blade scrape), shadow (growl)
  telegraph: { v: [[f('dodge_1', 0, 1.2, 0.85)], [f('words_impact_2', 0, 0.8)], [f('tele_3')], [f('tele_4', 0, 0.9)]], byN: true },
  boss_phase: { v: each('boss_roar_1', 'boss_roar_2'), vr: 0.03 },
  boss_defeat: { v: [[f('boss_death')]] },
  // ----------------------------------------------------- flow and interface
  wave_horn: { v: [[f('wave_horn')]] },
  crowd_cheer: { v: [[f('crowd_cheer')]] },
  button: { v: each('ui_click_1', 'ui_click_2'), g: 1.4, vr: 0.04 },
  rally: { v: [[f('rally_1')], [f('rally_1', 0, 1, 0.9)]] },
  pause: { v: each('page_1', 'page_2'), byN: true, g: 1.3 },
  speed: { v: [[f('ui_click_1', 0, 1, 1.12)], [f('ui_click_2', 0, 1, 0.9)]], g: 1.4 },
  // --------------------------------------------------------------- spells
  cast_super_boomstick: { v: [[f('sg_super'), f('sg_pump_1', 0.55, 0.8, 0.9)]] },
  impact_super_boomstick: { v: [[f('expl_big')]] },
  cast_arrow_volley: { v: [[f('volley_cast')]] },
  impact_arrow_volley: { v: [[f('volley_hit')]] },
  cast_magic_words: { v: [[f('words_cast_1')], [f('words_cast_1', 0, 1, 0.92)]] },
  impact_magic_words: { v: each('words_impact_1', 'words_impact_2') },
  cast_catapult_volley: { v: [[f('creak_2', 0, 0.8), f('cat_launch_1', 0.3), f('cat_launch_2', 0.5, 0.8)]] },
  impact_catapult_volley: { v: [[f('boulder_1')], [f('boulder_2')], [f('boulder_1', 0, 1, 0.9)]] },
  cast_wrong_book: { v: [[f('wrong_cast')]] },
  impact_wrong_book: { v: [[f('wrong_impact')], [f('wrong_impact', 0, 1, 0.9)]] },
  cast_chainsaw: { v: [[f('cs_cast')]] },
  impact_chainsaw: { v: [[f('cs_impact')], [f('cs_impact', 0, 1, 0.94)]] },
  cast_deathcoaster: { v: [[f('coaster_cast')]] },
  impact_deathcoaster: { v: [[f('coaster_impact')], [f('coaster_impact', 0, 1, 0.92)]] },
  cast_salt_circle: { v: [[f('salt_cast')]] },
  impact_salt_circle: { v: [[f('salt_impact')]] },
  cast_matins_bell: { v: [[f('bell_cast')]] },
  impact_matins_bell: { v: [[f('bell_impact')]] },
  cast_hellfire_pitch: { v: [[f('hellfire_cast')]] },
  impact_hellfire_pitch: { v: [[f('hellfire_impact')], [f('hellfire_impact', 0, 1, 0.92)]] },
  cast_bear_traps: { v: [[f('traps_cast')]] },
  impact_bear_traps: { v: [[f('traps_impact')], [f('traps_impact', 0, 1, 0.94)]] },
  cast_dawn_lance: { v: [[f('lance_cast')]] },
  impact_dawn_lance: { v: [[f('lance_impact')]] },
  cast_rally_horn: { v: [[f('wave_horn', 0, 0.9)]] },
  spell_impact: { v: [[f('words_impact_1', 0, 1, 0.9), f('boulder_2', 0.02, 0.35, 1.2)], [f('words_impact_2', 0, 1, 0.9)]] },
};

/** one-shot stingers (played through the music bus) */
export const STINGERS: Record<string, string> = { victory: 'stinger_victory', defeat: 'stinger_defeat' };

const BASE = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './') + 'assets/audio/sfx/';
const EXT = '.ogg';

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

  /**
   * Choose a decoded variant of `key` and return a function that plays it, plus how long it
   * rings (seconds), so the caller can keep the voice output alive long enough.
   * Null when nothing is decoded yet (the caller falls back to the synth patch).
   */
  prepare(e: Engine, key: string, p: number, i: number, n: number): { dur: number; start: (t: number, out: AudioNode) => boolean } | null {
    const ent = SAMPLE_MAP[key];
    if (!ent) return null;
    const v = this.pick(key, ent, n);
    if (!v) return null;
    const spread = ent.vr ? 1 + (Math.random() * 2 - 1) * ent.vr : 1;
    const rate = p * spread * (ent.rateN ? ent.rateN(n) : 1);
    const gain = (ent.g ?? 1) * (0.85 + 0.15 * Math.min(1, i));
    let dur = 0;
    for (const l of v) {
      const buf = this.bufs.get(l[0]);
      if (buf) dur = Math.max(dur, (l[1] ?? 0) + buf.duration / (rate * (l[3] ?? 1)));
    }
    return {
      dur,
      start: (t, out) => {
        let any = false;
        for (const l of v) {
          const buf = this.bufs.get(l[0]);
          if (!buf) continue;
          if (e.sample(buf, t + (l[1] ?? 0), out, (l[2] ?? 1) * gain, rate * (l[3] ?? 1))) any = true;
        }
        return any;
      },
    };
  }

  /** play a sample variant of `key`; false when nothing is decoded yet (caller falls back to synth) */
  play(e: Engine, key: string, t: number, out: AudioNode, p: number, i: number, n: number): boolean {
    const s = this.prepare(e, key, p, i, n);
    return s ? s.start(t, out) : false;
  }

  /** play a stinger straight into `dest`; returns its length in seconds or 0 */
  stinger(e: Engine, kind: string, t: number, dest: AudioNode): number {
    const name = STINGERS[kind];
    const buf = name ? this.bufs.get(name) : undefined;
    if (!buf) return 0;
    return e.sample(buf, t, dest, 1, 1) ? buf.duration : 0;
  }
}
