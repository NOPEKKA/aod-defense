import { SceneKey, type BattleSceneData } from '../contracts';
import { getRuntime, makeWaveParams } from '../core/app';

/** Builds every texture (vector art is generated, nothing is downloaded), then opens the title. */
export class Preloader extends Phaser.Scene {
  constructor() {
    super(SceneKey.Preloader);
  }

  preload(): void {
    getRuntime().modules.render.preloadBoot?.(this);
  }

  create(): void {
    const rt = getRuntime();
    rt.modules.render.buildTextures(this, rt.app.renderScale);
    if (this.scene.get(SceneKey.Title)) {
      this.scene.start(SceneKey.Title);
    } else {
      // menus not built yet (phase 2): go straight into wave 1
      const data: BattleSceneData = { params: makeWaveParams(rt.app, 1) };
      this.scene.start(SceneKey.Battle, data);
    }
  }
}
