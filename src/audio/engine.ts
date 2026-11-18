/**
 * audio/engine.ts - the Web Audio engine: context, buses, limiter, reverb, voice
 * accounting and the small synth toolkit (tone / noise / metal / thump) that every
 * SFX patch and music instrument is built from.
 *
 * The Engine class works on any BaseAudioContext, so the same patches can be rendered
 * with an OfflineAudioContext for numeric inspection (see debug.ts).
 *
 * Graph:
 *   sfxBus -> sfxComp ---------\
 *   musicBus -> musicFilter ----+-> master -> compressor -> softclip -> analyser -> destination
 *   sfxWet / musicWet -> reverb /
 */

export interface ToneOpts {
  type?: OscillatorType;
  /** end frequency (exponential glide over the duration) */
  f1?: number;
  /** attack seconds */
  a?: number;
  /** release seconds (default: the whole note decays from the attack) */
  r?: number;
  detune?: number;
  /** lowpass cutoff, optional glide to lpEnd */
  lp?: number;
  lpEnd?: number;
  q?: number;
  /** highpass cutoff */
  hp?: number;
  /** vibrato rate (Hz) and depth (cents) */
  vib?: [number, number];
  dest?: AudioNode;
  /** how long the vibrato takes to fade in (s) */
  vibDelay?: number;
}

export interface NoiseOpts {
  color?: 'white' | 'pink' | 'brown';
  filter?: BiquadFilterType;
  f?: number;
  f1?: number;
  q?: number;
  a?: number;
  r?: number;
  dest?: AudioNode;
}

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const rnd = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
/** random multiplier around 1: vary(0.05) -> 0.95..1.05 */
export const vary = (amt: number): number => 1 + (Math.random() * 2 - 1) * amt;
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const MIN_GAIN = 0.0001;

export class Engine {
  readonly ctx: BaseAudioContext;
  readonly master: GainNode;
  readonly sfxBus: GainNode;
  readonly musicBus: GainNode;
  readonly musicFilter: BiquadFilterNode;
  readonly sfxWet: GainNode;
  readonly musicWet: GainNode;
  readonly analyser: AnalyserNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly sfxComp: DynamicsCompressorNode;
  private readonly reverbIn: GainNode;
  /** reverb return level; set to 0 when both buses are muted so tails cannot leak */
  readonly reverbOut: GainNode;
  private readonly noises: Record<'white' | 'pink' | 'brown', AudioBuffer>;
  private readonly scratch: Float32Array;
  /** number of live source nodes (oscillators + noise sources) */
  voices = 0;
  /** peak voices seen since the last reset */
  voicePeak = 0;
  /** hard cap on live sources; patches skip optional layers above the soft cap */
  readonly softCap = 110;
  readonly hardCap = 180;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    const sr = ctx.sampleRate;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 10;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.2;

    // soft clipper: linear to 0.6, then a smooth knee that never exceeds 0.95
    const shaper = ctx.createWaveShaper();
    const N = 2049;
    const curve = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      const ax = Math.abs(x);
      const y = ax <= 0.6 ? ax : 0.6 + 0.35 * Math.tanh((ax - 0.6) / 0.35);
      curve[i] = Math.sign(x) * Math.min(0.95, y);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.scratch = new Float32Array(this.analyser.fftSize);

    this.master.connect(this.compressor);
    this.compressor.connect(shaper);
    shaper.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxComp = ctx.createDynamicsCompressor();
    this.sfxComp.threshold.value = -14;
    this.sfxComp.knee.value = 8;
    this.sfxComp.ratio.value = 6;
    this.sfxComp.attack.value = 0.002;
    this.sfxComp.release.value = 0.12;
    this.sfxBus.connect(this.sfxComp);
    this.sfxComp.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.5;
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.master);

    // reverb: synthetic stone-hall impulse response
    this.reverbIn = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(2.4, sr);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    this.reverbOut = revOut;
    this.reverbIn.connect(conv);
    conv.connect(revOut);
    revOut.connect(this.master);
    this.sfxWet = ctx.createGain();
    this.musicWet = ctx.createGain();
    this.sfxWet.connect(this.reverbIn);
    this.musicWet.connect(this.reverbIn);

    this.noises = { white: this.makeNoise('white', 2), pink: this.makeNoise('pink', 2), brown: this.makeNoise('brown', 2) };
  }

  // ----- buffers ------------------------------------------------------------

  private makeNoise(color: 'white' | 'pink' | 'brown', secs: number): AudioBuffer {
    const n = Math.floor(this.ctx.sampleRate * secs);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (color === 'white') {
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } else if (color === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      let last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // make it loop without a click
    const fade = 256;
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[n - fade + i] = d[n - fade + i] * (1 - k) + d[i] * k;
    }
    return buf;
  }

  private makeImpulse(secs: number, sr: number): AudioBuffer {
    const n = Math.floor(sr * secs);
    const buf = this.ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const env = Math.pow(1 - t, 3.2);
        // the tail gets darker as it decays
        const k = 0.15 + 0.8 * t;
        lp += (Math.random() * 2 - 1 - lp) * (1 - k);
        d[i] = lp * env * (i < 400 ? i / 400 : 1);
      }
    }
    return buf;
  }

  // ----- source helpers -----------------------------------------------------

  private track(src: AudioScheduledSourceNode, tail: AudioNode[]): void {
    this.voices++;
    if (this.voices > this.voicePeak) this.voicePeak = this.voices;
    src.onended = () => {
      this.voices--;
      try {
        src.disconnect();
        for (const n of tail) n.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  /** true when there is room for an optional layer */
  hasRoom(): boolean {
    return this.voices < this.softCap;
  }

  /** One enveloped oscillator note. */
  tone(t: number, freq: number, dur: number, vol: number, o: ToneOpts = {}): void {
    if (this.voices >= this.hardCap) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.f1 !== undefined && o.f1 !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = Math.min(o.a ?? 0.004, dur * 0.9);
    const r = Math.min(o.r ?? dur - a, dur - a);
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (r < dur - a - 0.001) g.gain.setValueAtTime(vol, t + dur - r);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur);
    const tail: AudioNode[] = [g];
    let node: AudioNode = osc;
    if (o.lp !== undefined) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = o.q ?? 0.7;
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lpEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.lpEnd), t + dur);
      node.connect(f);
      node = f;
      tail.push(f);
    }
    if (o.hp !== undefined) {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = o.hp;
      node.connect(f);
      node = f;
      tail.push(f);
    }
    node.connect(g);
    g.connect(o.dest ?? this.sfxBus);
    if (o.vib && this.voices < this.softCap) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vib[0];
      const lg = ctx.createGain();
      const depth = o.vib[1];
      if (o.vibDelay) {
        lg.gain.setValueAtTime(0, t);
        lg.gain.linearRampToValueAtTime(depth, t + o.vibDelay);
      } else lg.gain.value = depth;
      lfo.connect(lg);
      lg.connect(osc.detune);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
      this.track(lfo, [lg]);
    }
    osc.start(t);
    osc.stop(t + dur + 0.03);
    this.track(osc, tail);
  }

  /** One recorded sample through its own gain into `dest`. Returns false when over the voice cap. */
  sample(buf: AudioBuffer, t: number, dest: AudioNode, gain = 1, rate = 1): boolean {
    if (this.voices >= this.hardCap) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(dest);
    src.start(t);
    this.track(src, [g]);
    return true;
  }

  /** Filtered noise burst. */
  noise(t: number, dur: number, vol: number, o: NoiseOpts = {}): void {
    if (this.voices >= this.hardCap) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noises[o.color ?? 'white'];
    src.loop = true;
    const g = ctx.createGain();
    const a = Math.min(o.a ?? 0.002, dur * 0.9);
    const r = Math.min(o.r ?? dur - a, dur - a);
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (r < dur - a - 0.001) g.gain.setValueAtTime(vol, t + dur - r);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur);
    const tail: AudioNode[] = [g];
    let node: AudioNode = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.Q.value = o.q ?? 0.8;
      f.frequency.setValueAtTime(o.f ?? 1000, t);
      if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
      node.connect(f);
      node = f;
      tail.push(f);
    }
    node.connect(g);
    g.connect(o.dest ?? this.sfxBus);
    src.start(t, Math.random() * 1.5, dur + 0.03);
    this.track(src, tail);
  }

  /** Sine/triangle thump with a fast downward pitch drop (kicks, impacts, ram). */
  thump(t: number, f0: number, f1: number, dur: number, vol: number, dest?: AudioNode, type: OscillatorType = 'sine'): void {
    this.tone(t, f0, dur, vol, { type, f1, a: 0.002, dest });
  }

  /** Inharmonic metal ring (swords, anvil, bells, shields). */
  metal(t: number, f: number, dur: number, vol: number, dest?: AudioNode, ratios: number[] = [1, 2.76, 5.4, 8.93]): void {
    for (let i = 0; i < ratios.length; i++) {
      if (i > 1 && !this.hasRoom()) break;
      const k = 1 / (1 + i * 0.9);
      this.tone(t, f * ratios[i] * (1 + (Math.random() - 0.5) * 0.004), dur / (1 + i * 0.35), vol * k, {
        type: i === 0 ? 'triangle' : 'sine',
        a: 0.001,
        dest,
      });
    }
  }

  /** Output node for a positioned sound: gain -> pan -> sfx bus, with an optional reverb send. */
  voiceOut(vol: number, pan: number, wet: number, t: number, life: number): GainNode {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    let last: AudioNode = g;
    if (pan !== 0 && 'createStereoPanner' in ctx) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -0.9, 0.9);
      g.connect(p);
      last = p;
    }
    last.connect(this.sfxBus);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      last.connect(w);
      w.connect(this.sfxWet);
    }
    // detach a little after the sound is over so the graph does not grow
    this.scheduleDisconnect(g, t + life + 0.1);
    return g;
  }

  private pendingDisconnect: Array<{ at: number; node: AudioNode }> = [];
  private scheduleDisconnect(node: AudioNode, at: number): void {
    this.pendingDisconnect.push({ at, node });
  }
  /** called a few times per second: disconnect finished voice outputs */
  sweep(): void {
    const now = this.ctx.currentTime;
    const list = this.pendingDisconnect;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].at < now) {
        try {
          list[i].node.disconnect();
        } catch {
          /* ignore */
        }
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  // ----- level metering -----------------------------------------------------

  /** instantaneous RMS / peak of the last analyser window (about 46 ms) */
  meter(): { rms: number; peak: number } {
    this.analyser.getFloatTimeDomainData(this.scratch);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < this.scratch.length; i++) {
      const v = this.scratch[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    return { rms: Math.sqrt(sum / this.scratch.length), peak };
  }
}
