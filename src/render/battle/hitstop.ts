/**
 * Render-side hit-stop: for a few real milliseconds after a big hit the entity sprites and the
 * particles hold their pose (the sim keeps its fixed step, so nothing gameplay-relevant changes).
 */
let until = 0;

/** freeze the battle visuals for `ms` real milliseconds (longest request wins) */
export function hitStop(ms: number): void {
  const t = performance.now() + ms;
  if (t > until) until = t;
}

export function hitStopActive(): boolean {
  return until > 0 && performance.now() < until;
}

export function resetHitStop(): void {
  until = 0;
}
