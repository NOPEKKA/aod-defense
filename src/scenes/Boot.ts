import { SceneKey } from '../contracts';
import { createApp, type Modules } from '../core/app';
import { DataError, loadGameData } from '../core/data';
import { installQaHooks } from '../core/qa';

export interface BootConfig {
  modules: Modules;
  renderScale: number;
  refreshHz: number;
}

/** Loads and validates data/, creates the app context, installs QA hooks. */
export class Boot extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    const cfg = this.game.registry.get('bootConfig') as BootConfig;
    installQaHooks();
    try {
      const data = loadGameData(cfg.modules.gameplay);
      createApp(this.game, cfg.modules, data, cfg.renderScale, cfg.refreshHz);
    } catch (err) {
      this.showFatal(err);
      return;
    }
    this.scene.start(SceneKey.Preloader);
  }

  private showFatal(err: unknown): void {
    const msg = err instanceof DataError ? err.message : String(err instanceof Error ? err.stack ?? err.message : err);
    console.error(msg);
    this.cameras.main.setBackgroundColor('#2a0a0a');
    this.add
      .text(16, 16, `Boot failed\n\n${msg}`, {
        fontFamily: 'monospace',
        fontSize: `${14 * (this.game.registry.get('bootConfig') as BootConfig).renderScale}px`,
        color: '#ffd0d0',
        wordWrap: { width: this.scale.gameSize.width - 32 },
      })
      .setScrollFactor(0);
  }
}
