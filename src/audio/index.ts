/**
 * audio/ - procedural music and sound effects (Web Audio, no audio files).
 * Owner: audio agent.
 *
 *   engine.ts  context, buses, limiter, reverb, synth toolkit
 *   sfx.ts     every sound effect as a small patch
 *   music.ts   generative themes, stingers, conductor
 *   system.ts  lifecycle, volumes, voice limiting
 *   events.ts  EventBus -> sounds and music state
 *   debug.ts   window.__aoddAudio
 *
 * Volumes come from app.profile.settings (sfxVolume / musicVolume) and follow
 * 'settings:changed'. A mute button only has to set both to 0 via app.applySettings.
 */
import type { AppContext, AudioModule } from '../contracts';
import { installDebug } from './debug';
import { wireEvents } from './events';
import { AudioSystem } from './system';

let started = false;

export const audio: AudioModule = {
  init(app: AppContext, game: Phaser.Game) {
    if (started) return;
    started = true;
    const A = new AudioSystem();
    const apply = (): void => {
      const s = app.profile.settings;
      A.setVolumes(s.sfxVolume, s.musicVolume);
    };
    apply();
    app.bus.on('settings:changed', apply);

    // the context may only start after a user gesture
    const gesture = (): void => {
      A.unlock();
      apply();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown'] as const) {
      window.addEventListener(ev, gesture, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => A.onVisibility());
    window.addEventListener('pagehide', () => A.onVisibility());

    let wiring;
    try {
      wiring = wireEvents(app, game, A);
    } catch (err) {
      console.warn('[audio] could not wire events', err);
      return;
    }
    installDebug(A, wiring);
  },
};
