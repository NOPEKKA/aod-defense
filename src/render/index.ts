/**
 * render/ — sprites, animation, spell FX, particles, camera polish, HUD, menu scenes.
 * Owner: render agent.
 *
 * PHASE 2 STUB: placeholder textures + one placeholder battle renderer, no menus
 * (Preloader then jumps straight into wave 1).
 */
import type { RenderModule } from '../contracts';
import { getApp } from '../core/app';
import { PlaceholderBattleRenderer } from './PlaceholderBattleRenderer';
import { buildPlaceholderTextures } from './placeholders';

export const render: RenderModule = {
  buildTextures(scene, renderScale) {
    buildPlaceholderTextures(scene, getApp().data, renderScale);
  },
  createBattleRenderers: () => [new PlaceholderBattleRenderer()],
  menuScenes: [],
};
