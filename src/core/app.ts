import type {
  AppContext,
  ControlsModule,
  GameData,
  GameplayModule,
  ProfileState,
  RenderModule,
  Settings,
  SystemsModule,
  WaveStartParams,
} from '../contracts';
import { applyFpsCap } from './display';
import { createEventBus } from './EventBus';
import { createTranslator } from './i18n';
import type { SimRunner } from './SimRunner';

export interface Modules {
  systems: SystemsModule;
  gameplay: GameplayModule;
  controls: ControlsModule;
  render: RenderModule;
}

interface Runtime {
  app: AppContext;
  modules: Modules;
  game: Phaser.Game;
  battle: { runner: SimRunner; scene: Phaser.Scene } | null;
  frameTimes: number[];
}

let runtime: Runtime | null = null;

export function getRuntime(): Runtime {
  if (!runtime) throw new Error('app not created yet (Boot scene has not run)');
  return runtime;
}
export function tryRuntime(): Runtime | null {
  return runtime;
}
export function getApp(): AppContext {
  return getRuntime().app;
}

export function createApp(game: Phaser.Game, modules: Modules, data: GameData, renderScale: number, refreshHz: number): AppContext {
  const bus = createEventBus();
  const { save, progression, upgrades, waves } = modules.systems.createMeta(data, bus);
  let profile: ProfileState = save.load();
  let lastSettings = JSON.stringify(profile.settings);
  const t = createTranslator(data, () => app.profile.settings.lang);

  const app: AppContext = {
    data,
    bus,
    get profile() {
      return profile;
    },
    set profile(p: ProfileState) {
      profile = p;
    },
    save,
    progression,
    upgrades,
    waves,
    renderScale,
    refreshHz,
    t,
    commitProfile() {
      save.save(profile);
      const now = JSON.stringify(profile.settings);
      if (now !== lastSettings) {
        lastSettings = now;
        applyFpsCap(game, profile.settings.fpsCap);
        bus.emit('settings:changed', profile.settings);
      }
    },
    applySettings(next: Settings) {
      profile.settings = { ...next };
      app.commitProfile();
    },
  };

  const frameTimes: number[] = [];
  let lastRender = -1;
  game.events.on('prerender', () => {
    const now = performance.now();
    if (lastRender >= 0) {
      frameTimes.push(now - lastRender);
      if (frameTimes.length > 2000) frameTimes.splice(0, frameTimes.length - 2000);
    }
    lastRender = now;
  });

  runtime = { app, modules, game, battle: null, frameTimes };
  applyFpsCap(game, profile.settings.fpsCap);
  return app;
}

export function setBattle(battle: Runtime['battle']): void {
  getRuntime().battle = battle;
}

/** Params for starting a wave from the profile's current loadout. */
export function makeWaveParams(app: AppContext, wave: number, endless = false, seed?: number): WaveStartParams {
  const p = app.profile;
  const level = endless ? undefined : app.data.levels[wave - 1];
  return {
    wave,
    endless,
    units: p.loadout.units.filter((id) => app.progression.isUnitUnlocked(p, id)).slice(0, app.data.balance.loadout.unitSlots),
    spells: p.loadout.spells.filter((id) => app.progression.isSpellUnlocked(p, id)),
    relics: p.relicsEquipped.filter((r): r is string => r !== null),
    seed: seed ?? level?.seed ?? wave * 1000 + (endless ? 7 : 1),
  };
}
