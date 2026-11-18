/**
 * audio/tracks.ts - recorded music loops (public/assets/audio/music, see CREDITS.md).
 *
 * Each file is a pre-baked seamless loop (the tail is cross-faded into the head at build
 * time), so playback is a plain AudioBufferSourceNode with loop = true. Files are fetched
 * and decoded lazily on first request; until a buffer is ready (or if loading fails) the
 * procedural theme in music.ts plays.
 */
import type { LoopTheme } from './music';

const BASE = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './') + 'assets/audio/music/';

/** files for each theme; a theme with several files alternates between them */
export const TRACKS: Record<LoopTheme, string[]> = {
  menu: ['menu'],
  battle: ['battle1', 'battle2'],
  boss: ['boss'],
};

export class TrackBank {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, Promise<AudioBuffer | null>>();
  private readonly counter: Record<string, number> = {};
  /** files that failed to load or decode (for the debug hook) */
  readonly missing: string[] = [];

  constructor(private ctx: BaseAudioContext) {}

  get loaded(): string[] {
    return [...this.buffers.keys()];
  }

  /** file to use for the next start of a theme (round-robin across its files) */
  next(theme: LoopTheme): string {
    const files = TRACKS[theme];
    const n = this.counter[theme] ?? 0;
    this.counter[theme] = n + 1;
    return files[n % files.length];
  }

  get(file: string): AudioBuffer | null {
    return this.buffers.get(file) ?? null;
  }

  /** start fetching and decoding; resolves with the buffer or null on failure */
  load(file: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(file);
    if (have) return Promise.resolve(have);
    let p = this.pending.get(file);
    if (p) return p;
    p = (async () => {
      try {
        const res = await fetch(BASE + file + '.ogg');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(file, buf);
        return buf;
      } catch (err) {
        if (!this.missing.includes(file)) this.missing.push(file);
        console.warn('[audio] music track failed', file, err);
        return null;
      }
    })();
    this.pending.set(file, p);
    return p;
  }
}
