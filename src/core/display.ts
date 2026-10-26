import { VIEW_H, VIEW_W_MAX, VIEW_W_MIN } from '../contracts';

/** logical -> canvas pixel scale. Capped at 2 to keep fill-rate sane on phones. */
export function computeRenderScale(): number {
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
}

/** Logical view width for the current window: wider phones see more field instead of black bars. */
export function computeViewWidth(): number {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const w = Math.round(VIEW_H * aspect);
  return Math.min(VIEW_W_MAX, Math.max(VIEW_W_MIN, w));
}

/**
 * Measures the display refresh rate from requestAnimationFrame intervals.
 * Returns a common rate (60/75/90/120/144/165/240) nearest to the median interval.
 * Falls back to 60 if rAF is throttled (hidden tab, headless without GPU).
 */
export function measureRefreshHz(samples = 40, timeoutMs = 1500): Promise<number> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    let last = -1;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (intervals.length < 10) return resolve(60);
      intervals.sort((a, b) => a - b);
      const median = intervals[Math.floor(intervals.length / 2)];
      const hz = 1000 / median;
      const common = [60, 75, 90, 120, 144, 165, 240];
      resolve(common.reduce((best, c) => (Math.abs(c - hz) < Math.abs(best - hz) ? c : best), 60));
    };
    const step = (t: number) => {
      if (done) return;
      if (last >= 0) intervals.push(t - last);
      last = t;
      if (intervals.length >= samples) finish();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(finish, timeoutMs);
  });
}

/**
 * Applies an fps cap at runtime. Phaser 3.90 only reads `fps.limit` at boot,
 * so we flip the TimeStep fields and restart its raf loop.
 * The limit rate gets 2 ms of slack so a 120 Hz display reliably renders every
 * 2nd frame (16.6 ms) instead of drifting to every 3rd.
 */
export function applyFpsCap(game: Phaser.Game, cap: 0 | 60): void {
  const loop = game.loop as Phaser.Core.TimeStep & { _limitRate: number };
  loop.fpsLimit = cap;
  loop.hasFpsLimit = cap > 0;
  loop._limitRate = cap > 0 ? 1000 / cap - 2 : 0;
  loop.sleep();
  loop.wake(true);
}
