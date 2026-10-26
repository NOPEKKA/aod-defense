/**
 * render/ — sprites, animation, spell FX, particles, HUD, menu scenes.
 * Owner: render agent.
 *
 * Textures: one generated Canvas atlas (+ bitmap fonts) built in the Preloader.
 * Battle: world (sprites/background/telegraphs) + fx (particles/numbers/shake) + hud.
 * Menus: Title, Map, Shop, PreWave, Result, Settings.
 */
import type { RenderModule } from '../contracts';
import { getApp } from '../core/app';
import { buildAllTextures } from './art/build';
import { FxRenderer } from './battle/FxRenderer';
import { HudRenderer } from './battle/HudRenderer';
import { WorldRenderer } from './battle/WorldRenderer';
import { MapScene } from './scenes/MapScene';
import { PreWaveScene } from './scenes/PreWaveScene';
import { ResultScene } from './scenes/ResultScene';
import { SettingsScene } from './scenes/SettingsScene';
import { ShopScene } from './scenes/ShopScene';
import { TitleScene } from './scenes/TitleScene';

export const render: RenderModule = {
  buildTextures(scene, renderScale) {
    buildAllTextures(scene, getApp().data, renderScale);
  },
  createBattleRenderers() {
    const fx = new FxRenderer();
    return [new WorldRenderer(fx), fx, new HudRenderer()];
  },
  menuScenes: [TitleScene, MapScene, ShopScene, PreWaveScene, ResultScene, SettingsScene],
};
