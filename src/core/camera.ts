/**
 * Every scene works in logical coordinates (view is viewW x 720). The canvas is
 * renderScale times larger for crisp high-DPI output, so the main camera zooms
 * by renderScale anchored at the top-left. Call this at the top of create().
 */
export function setupCamera(scene: Phaser.Scene, renderScale: number): Phaser.Cameras.Scene2D.Camera {
  const cam = scene.cameras.main;
  cam.setOrigin(0, 0);
  cam.setZoom(renderScale);
  return cam;
}

/** Logical view size of the current canvas. */
export function viewSize(scene: Phaser.Scene, renderScale: number): { w: number; h: number } {
  return { w: scene.scale.gameSize.width / renderScale, h: scene.scale.gameSize.height / renderScale };
}
