import Phaser from 'phaser';
import { VIEW_H } from './contracts';
import type { Modules } from './core/app';
import { computeRenderScale, computeViewWidth, measureRefreshHz } from './core/display';
import { audio } from './audio';
import { controls } from './controls';
import { gameplay } from './gameplay';
import { render } from './render';
import { Battle } from './scenes/Battle';
import { Boot, type BootConfig } from './scenes/Boot';
import { Preloader } from './scenes/Preloader';
import { systems } from './systems';

async function start(): Promise<void> {
  const modules: Modules = { systems, gameplay, controls, render, audio };
  const renderScale = computeRenderScale();
  // Phaser's fps target follows the display (brief: never lock to 60).
  const refreshHz = await measureRefreshHz();
  const viewW = computeViewWidth();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-container',
    width: viewW * renderScale,
    height: VIEW_H * renderScale,
    backgroundColor: '#14101c',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    fps: {
      target: refreshHz,
      // the user's 60 fps cap is applied after the save loads (core/app.ts)
      limit: 0,
      smoothStep: true,
    },
    input: { activePointers: 4 },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance', mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
    disableContextMenu: true,
    scene: [Boot, Preloader, Battle, ...render.menuScenes],
  });
  const bootConfig: BootConfig = { modules, renderScale, refreshHz };
  game.registry.set('bootConfig', bootConfig);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const w = computeViewWidth();
      if (Math.round(game.scale.gameSize.width) !== Math.round(w * renderScale)) {
        game.scale.setGameSize(w * renderScale, VIEW_H * renderScale);
      }
    }, 150);
  });
}

void start();
