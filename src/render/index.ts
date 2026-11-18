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
import { queueBoot } from './assets/library';
import { queueUiKit } from './ui/skin';
import { preloadBattle } from './assets/preload';
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
  preloadBoot(scene) {
    // baked-art manifest + icon atlases (see assets/library.ts)
    queueBoot(scene, getApp().profile.settings);
    // bundled Thai font: the bold face goes through the loader so menus and the generated
    // bitmap number fonts never render with a fallback; the other weights load alongside
    if (!document.fonts.check('700 20px Kanit')) scene.load.font('Kanit', 'fonts/Kanit-Bold.ttf', 'truetype', { weight: '700' });
    for (const w of ['400', '600']) void document.fonts.load(`${w} 20px Kanit`).catch(() => undefined);
    // UI faces (SIL OFL, bundled): Taviraj body, Pirata One + Chonburi headings
    // The loader names each FontFace after its key and drops duplicate keys, so the three
    // Taviraj weights use case variants of the family name (CSS matches families
    // case-insensitively, so all three answer to "Taviraj").
    const faces: Array<[string, string, string]> = [
      ['Taviraj', 'fonts/Taviraj-Regular.ttf', '400'],
      ['taviraj', 'fonts/Taviraj-SemiBold.ttf', '600'],
      ['TAVIRAJ', 'fonts/Taviraj-Bold.ttf', '700'],
      ['Pirata One', 'fonts/PirataOne-Regular.ttf', '400'],
      ['Chonburi', 'fonts/Chonburi-Regular.ttf', '400'],
    ];
    for (const [family, url, weight] of faces) {
      // Pirata One's numerals read poorly ("1" looks like "l"): leave digits to Chonburi
      const range = family === 'Pirata One' ? { unicodeRange: 'U+0020-002F, U+003A-024F, U+2000-206F' } : {};
      scene.load.font(family, url, 'truetype', { weight, ...range });
    }
    // the UI material kit (ui/skin.ts)
    queueUiKit(scene);
  },
  preloadBattle(scene, params) {
    preloadBattle(scene, getApp(), params);
  },
  buildTextures(scene, renderScale) {
    buildAllTextures(scene, getApp().data, renderScale);
  },
  createBattleRenderers() {
    const fx = new FxRenderer();
    return [new WorldRenderer(fx), fx, new HudRenderer()];
  },
  menuScenes: [TitleScene, MapScene, ShopScene, PreWaveScene, ResultScene, SettingsScene],
};
