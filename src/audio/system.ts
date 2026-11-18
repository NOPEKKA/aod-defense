/**
 * audio/system.ts - lifecycle of the audio layer: lazy AudioContext, gesture unlock,
 * volumes, pause/hidden handling, SFX playback with voice limiting, and the music
 * conductor timer. Event wiring lives in events.ts.
 */
import { Engine, clamp, rnd, vary } from './engine';
import { Conductor, type ThemeName } from './music';
import { SFX } from './sfx';
import { SampleBank } from './samples';

export interface PlayOpts {
  vol?: number;
  pitch?: number;
  /** world x of the sound (for stereo position and distance) */
  x?: number;
  /** intensity 0..1 */
  i?: number;
  /** variant / step */
  n?: number;
  /** seconds from now */
  delay?: number;
}

interface PerSound {
  last: number;
  ends: number[];
  suppressed: number;
  played: number;
  dropped: number;
}

const PLAYED_LOG = 40;

export class AudioSystem {
  eng: Engine | null = null;
  music: Conductor | null = null;
  /** recorded samples; synth patches play until a sample is decoded */
  readonly bank = new SampleBank();
  /** how many plays used a sample vs the synth patch */
  samplePlays = 0;
  synthPlays = 0;
  sfxVolume = 0.8;
  musicVolume = 0.6;
  paused = false;
  hiddenSuspended = false;
  /** world x of the player's focus (Ash) for stereo panning */
  listenerX = NaN;
  readonly played: Array<{ name: string; t: number }> = [];
  readonly counts: Record<string, number> = {};
  readonly droppedCounts: Record<string, number> = {};
  totalPlayed = 0;
  totalDropped = 0;
  errors = 0;
  /** what the game currently wants (scene logic), used again once the context exists */
  wantedTheme: ThemeName | 'none' = 'none';
  wantedFade = 1.2;
  private readonly per = new Map<string, PerSound>();
  private burst: number[] = [];
  private timer = 0;
  private sweepTimer = 0;
  private baseSpeed = 1;

  // ----- context lifecycle --------------------------------------------------

  /** create the context (needs a user gesture to actually run) */
  ensure(): Engine | null {
    if (this.eng) return this.eng;
    try {
      const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC({ latencyHint: 'interactive' });
      const eng = new Engine(ctx);
      this.eng = eng;
      this.music = new Conductor(eng);
      void this.music.tracks.load('menu');
      this.music.sampleStinger = (kind, t, dest) => this.bank.stinger(eng, kind, t, dest);
      this.bank.load(ctx);
      this.applyVolumes(true);
      this.applyPause(true);
      ctx.addEventListener('statechange', () => {
        if (ctx.state === 'suspended' && !document.hidden && !this.hiddenSuspended) void ctx.resume().catch(() => undefined);
      });
      this.timer = window.setInterval(() => this.tick(), 60);
      this.sweepTimer = window.setInterval(() => eng.sweep(), 1000);
      if (this.wantedTheme !== 'none') this.music.setTheme(this.wantedTheme, 0.4);
      this.music.tempoMul = this.baseSpeed;
      return eng;
    } catch {
      this.errors++;
      return null;
    }
  }

  /** call on a user gesture */
  unlock(): void {
    const eng = this.ensure();
    if (!eng) return;
    const ctx = eng.ctx as AudioContext;
    // iOS Safari: state can be 'suspended' or 'interrupted' (after backgrounding / a call)
    if ((ctx.state as string) === 'running' || document.hidden) return;
    void ctx.resume().catch(() => undefined);
    // iOS: a silent buffer started inside the gesture fully unlocks output
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  }

  onVisibility(): void {
    const eng = this.eng;
    if (!eng) return;
    const ctx = eng.ctx as AudioContext;
    if (document.hidden) {
      this.hiddenSuspended = true;
      void ctx.suspend().catch(() => undefined);
    } else {
      this.hiddenSuspended = false;
      // may need a fresh gesture on iOS: the persistent gesture listeners retry
      void ctx.resume().catch(() => undefined);
    }
  }

  // ----- volumes and modes --------------------------------------------------

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = clamp(Number.isFinite(sfx) ? sfx : 0.8, 0, 1);
    this.musicVolume = clamp(Number.isFinite(music) ? music : 0.6, 0, 1);
    this.applyVolumes(false);
  }

  private applyVolumes(immediate: boolean): void {
    const eng = this.eng;
    if (!eng) return;
    const now = eng.ctx.currentTime;
    // squared taper: slider feels linear to the ear, 0 is exactly silent
    const s = this.sfxVolume <= 0.001 ? 0 : this.sfxVolume * this.sfxVolume * 1.0;
    const m = this.musicVolume <= 0.001 ? 0 : this.musicVolume * this.musicVolume * 0.62;
    for (const [node, v] of [
      [eng.sfxBus.gain, s],
      [eng.sfxWet.gain, s],
      [eng.musicBus.gain, m],
      [eng.musicWet.gain, m],
    ] as Array<[AudioParam, number]>) {
      node.cancelScheduledValues(now);
      if (immediate || v === 0) node.setValueAtTime(v, now);
      else node.setTargetAtTime(v, now, 0.03);
    }
    const r = eng.reverbOut.gain;
    r.cancelScheduledValues(now);
    if (s === 0 && m === 0) r.setValueAtTime(0, now);
    else r.setTargetAtTime(0.55, now, 0.05);
    if (this.music) this.music.enabled = m > 0;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.applyPause(false);
  }

  private applyPause(immediate: boolean): void {
    const eng = this.eng;
    if (!eng) return;
    const now = eng.ctx.currentTime;
    const f = eng.musicFilter.frequency;
    f.cancelScheduledValues(now);
    const target = this.paused ? 520 : 20000;
    if (immediate) f.setValueAtTime(target, now);
    else f.setTargetAtTime(target, now, this.paused ? 0.05 : 0.12);
  }

  setSpeed(speed: number): void {
    // x2 speed: tempo +12 % (not x2: the music must stay listenable)
    this.baseSpeed = speed >= 2 ? 1.12 : 1;
    if (this.music) this.music.tempoMul = this.baseSpeed;
  }

  // ----- music --------------------------------------------------------------

  setTheme(name: ThemeName | 'none', fade = 1.2): void {
    this.wantedTheme = name;
    this.wantedFade = fade;
    if (this.music) this.music.setTheme(name, fade);
  }

  setIntensity(level: number): void {
    if (this.music) this.music.intensity = clamp(Math.round(level), 0, 3);
  }

  private tick(): void {
    const eng = this.eng;
    if (!eng || eng.ctx.state !== 'running') return;
    try {
      this.music?.update();
    } catch (err) {
      this.errors++;
      if (this.errors < 4) console.warn('[audio] music error', err);
    }
  }

  // ----- sound effects ------------------------------------------------------

  /** play a named SFX. Returns true when it actually started. */
  play(name: string, o: PlayOpts = {}): boolean {
    const eng = this.eng;
    if (!eng) return false;
    const def = SFX[name];
    if (!def) return false;
    if (this.sfxVolume <= 0.001) return false;
    const ctx = eng.ctx;
    const now = ctx.currentTime;
    let st = this.per.get(name);
    if (!st) {
      st = { last: -10, ends: [], suppressed: 0, played: 0, dropped: 0 };
      this.per.set(name, st);
    }
    // per-sound rate limit
    if (now - st.last < def.gap) return this.drop(name, st, true);
    // simultaneous instances of this sound
    const ends = st.ends;
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i] < now) ends.splice(i, 1);
    if (ends.length >= def.max) return this.drop(name, st, true);
    // global load shedding: low priority first
    const v = eng.voices;
    if (def.prio === 0 && v > 60) return this.drop(name, st, false);
    if (def.prio === 1 && v > 100) return this.drop(name, st, false);
    if (v > eng.hardCap - 10) return this.drop(name, st, false);
    // burst governor: at most ~28 sounds start per 100 ms
    const b = this.burst;
    while (b.length && b[0] < now - 0.1) b.shift();
    if (b.length >= 28 && def.prio < 2) return this.drop(name, st, false);
    b.push(now);

    const boost = 1 + Math.min(0.5, st.suppressed * 0.07);
    st.suppressed = 0;
    st.last = now;
    ends.push(now + def.life);

    // stereo + distance from the player's focus
    let pan = 0;
    let dist = 1;
    if (o.x !== undefined && Number.isFinite(this.listenerX) && Number.isFinite(o.x)) {
      const dx = o.x - this.listenerX;
      pan = clamp(dx / 900, -1, 1) * 0.75;
      dist = 1 - 0.45 * clamp(Math.abs(dx) / 1400, 0, 1);
    }
    const t = now + 0.006 + (o.delay ?? 0) + rnd(0, 0.01);
    try {
      const p = (o.pitch ?? 1) * vary(0.05);
      // a recorded sample keeps its voice output connected for its whole length
      const smp = this.bank.prepare(eng, name, p, o.i ?? 0, o.n ?? 0);
      const life = Math.max(def.life, smp ? smp.dur + 0.05 : 0);
      const out = eng.voiceOut(def.vol * (o.vol ?? 1) * boost * dist, pan, def.wet, t, life + (o.delay ?? 0));
      if (smp && smp.start(t, out)) this.samplePlays++;
      else {
        def.fn({ e: eng, t, out, p, i: o.i ?? 0, n: o.n ?? 0 });
        this.synthPlays++;
      }
    } catch (err) {
      this.errors++;
      if (this.errors < 4) console.warn('[audio] sfx error', name, err);
      return false;
    }
    st.played++;
    this.totalPlayed++;
    this.counts[name] = (this.counts[name] ?? 0) + 1;
    this.played.push({ name, t: now });
    if (this.played.length > PLAYED_LOG) this.played.shift();
    return true;
  }

  private drop(name: string, st: PerSound, count: boolean): false {
    if (count) st.suppressed++;
    st.dropped++;
    this.totalDropped++;
    this.droppedCounts[name] = (this.droppedCounts[name] ?? 0) + 1;
    return false;
  }

  dispose(): void {
    window.clearInterval(this.timer);
    window.clearInterval(this.sweepTimer);
  }
}
