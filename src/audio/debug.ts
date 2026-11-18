/**
 * audio/debug.ts - window.__aoddAudio: state, stats, play(name), setTheme(name) and
 * offline rendering for numeric inspection (no ears needed).
 */
import { Engine } from './engine';
import { Conductor, type ThemeName } from './music';
import { SFX } from './sfx';
import type { AudioSystem } from './system';
import type { Wiring } from './events';

export interface RenderReport {
  name: string;
  seconds: number;
  /** time until the signal stays under -60 dB */
  tail: number;
  peak: number;
  rms: number;
  /** spectral centroid in Hz over the loudest second */
  centroid: number;
}

export interface AoddAudio {
  state(): Record<string, unknown>;
  stats(): Record<string, unknown>;
  play(name: string, opts?: Record<string, number>): boolean;
  setTheme(name: string): void;
  unlock(): void;
  sfxNames(): string[];
  /** render sfx names (all at t=0, or spaced) offline and report numbers */
  renderSfx(names: string[], seconds?: number, spacing?: number): Promise<RenderReport>;
  renderTheme(name: ThemeName, seconds: number, intensity?: number): Promise<RenderReport>;
}

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

function analyse(name: string, buf: AudioBuffer): RenderReport {
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  let peak = 0;
  let sum = 0;
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    sum += d[i] * d[i];
    if (a > 0.001) last = i;
  }
  // centroid over the loudest 4096-sample window
  const W = 4096;
  let bestStart = 0;
  let bestE = -1;
  for (let s = 0; s + W <= d.length; s += 1024) {
    let e = 0;
    for (let i = s; i < s + W; i++) e += d[i] * d[i];
    if (e > bestE) {
      bestE = e;
      bestStart = s;
    }
  }
  const re = new Float32Array(W);
  const im = new Float32Array(W);
  for (let i = 0; i < W; i++) re[i] = (d[bestStart + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W));
  fft(re, im);
  let num = 0;
  let den = 0;
  for (let k = 1; k < W / 2; k++) {
    const mag = Math.hypot(re[k], im[k]);
    num += mag * ((k * sr) / W);
    den += mag;
  }
  return { name, seconds: d.length / sr, tail: last / sr, peak, rms: Math.sqrt(sum / d.length), centroid: den > 0 ? num / den : 0 };
}

async function offline(seconds: number, build: (e: Engine) => void, name: string): Promise<RenderReport> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(sr * seconds), sr);
  const e = new Engine(ctx);
  e.sfxBus.gain.value = 1;
  e.sfxWet.gain.value = 1;
  e.musicBus.gain.value = 0.9 * 0.36;
  e.musicWet.gain.value = 0.9 * 0.36;
  build(e);
  const buf = await ctx.startRendering();
  return analyse(name, buf);
}

export function installDebug(A: AudioSystem, wiring: Wiring): void {
  const api: AoddAudio = {
    state() {
      const eng = A.eng;
      const m = eng ? eng.meter() : { rms: 0, peak: 0 };
      const w = wiring.state();
      return {
        ctx: eng ? eng.ctx.state : 'none',
        theme: A.music ? A.music.theme : 'none',
        wantedTheme: A.wantedTheme,
        themeLog: A.music ? A.music.log.slice() : [],
        intensity: A.music ? A.music.intensity : 0,
        tempoMul: A.music ? A.music.tempoMul : 1,
        musicEnabled: A.music ? A.music.enabled : false,
        paused: A.paused,
        voices: eng ? eng.voices : 0,
        voicePeak: eng ? eng.voicePeak : 0,
        gains: eng
          ? {
              master: eng.master.gain.value,
              sfx: eng.sfxBus.gain.value,
              music: eng.musicBus.gain.value,
              musicFilterHz: eng.musicFilter.frequency.value,
            }
          : null,
        volumes: { sfx: A.sfxVolume, music: A.musicVolume },
        rms: m.rms,
        peak: m.peak,
        battle: w,
        music: A.music ? A.music.info() : null,
        errors: A.errors,
        samples: { loaded: A.bank.loaded, total: A.bank.total, missing: A.bank.missing.slice(), samplePlays: A.samplePlays, synthPlays: A.synthPlays },
      };
    },
    stats() {
      return {
        totalPlayed: A.totalPlayed,
        totalDropped: A.totalDropped,
        counts: { ...A.counts },
        dropped: { ...A.droppedCounts },
        last: A.played.slice(-20).map((p) => p.name),
        voicePeak: A.eng ? A.eng.voicePeak : 0,
        errors: A.errors,
        samples: { loaded: A.bank.loaded, total: A.bank.total, missing: A.bank.missing.slice(), samplePlays: A.samplePlays, synthPlays: A.synthPlays },
      };
    },
    play(name, opts) {
      A.ensure();
      return A.play(name, opts ?? {});
    },
    setTheme(name) {
      A.ensure();
      A.setTheme(name as ThemeName | 'none', 0.6);
    },
    unlock() {
      A.unlock();
    },
    sfxNames() {
      return Object.keys(SFX);
    },
    async renderSfx(names, seconds = 3, spacing = 0) {
      return offline(
        seconds,
        (e) => {
          names.forEach((n, i) => {
            const def = SFX[n];
            if (!def) return;
            const t = 0.02 + i * spacing;
            const out = e.voiceOut(def.vol, 0, def.wet, t, def.life);
            def.fn({ e, t, out, p: 1, i: 0.6, n: 3 });
          });
        },
        names.join('+'),
      );
    },
    async renderTheme(name, seconds, intensity = 1) {
      return offline(
        seconds,
        (e) => {
          const c = new Conductor(e);
          c.intensity = intensity;
          c.setTheme(name, 0.01);
          c.update(seconds);
        },
        name + '@' + intensity,
      );
    },
  };
  (window as unknown as { __aoddAudio: AoddAudio }).__aoddAudio = api;
}
