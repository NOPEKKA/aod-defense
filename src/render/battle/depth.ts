/**
 * Display depths of the battle scene, back to front. Characters sort by their ground y
 * (CHAR + y, so roughly 430..700); everything else sits in a fixed band around them.
 * Additive effects get their own contiguous bands so blend switches stay few (draw calls).
 */
export const DEPTH = {
  sky: -1000,
  far: -900,
  main: -800,
  /** baked props on the wall and floor that never overlap characters (torch flames, forge fire) */
  wallProps: -720,
  /** additive torch / forge / book glows over the background */
  wallGlow: -700,
  /** ground decals: pit lid, telegraphs, aim circle, poison pools, magic circles */
  ground: -600,
  groundAdd: -590,
  /** every ground shadow */
  shadow: -550,
  /** + ground y */
  char: 0,
  /** world particles (normal blend), then additive ones */
  fx: 1000,
  fxAdd: 1050,
  /** baked 'front' layer (parallax 1.2, over the characters) */
  front: 1100,
  /** HP bars, stun stars */
  bars: 1200,
  /** damage numbers */
  nums: 1300,
  /** rain, embers, fog */
  weather: 1400,
  /** screen overlays: vignette, flash */
  overlay: 2900,
  hud: 3000,
} as const;
