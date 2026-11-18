import { SceneKey, type BattleSceneData, type ProfileState, type QaHooks } from '../contracts';
import { netDebug } from '../net';
import { getRuntime, makeWaveParams, tryRuntime } from './app';

/** Installs window.render_game_to_text / advanceTime / __aodd for Playwright and bots. */
export function installQaHooks(): void {
  const activeScene = (): string => {
    const rt = tryRuntime();
    if (!rt) return 'none';
    const active = rt.game.scene.getScenes(true).map((s) => s.scene.key);
    return active.join('+') || 'none';
  };

  const hooks: QaHooks = {
    render_game_to_text() {
      const rt = tryRuntime();
      if (!rt) return JSON.stringify({ scene: 'booting' });
      const scene = activeScene();
      const b = rt.battle;
      if (!b) {
        const p = rt.app.profile;
        return JSON.stringify({ scene, gold: p.gold, highestWave: p.highestWave, lang: p.settings.lang, net: netDebug() ?? undefined });
      }
      const w = b.runner.world;
      const ash = w.entities.find((e) => e.id === w.ashId && e.alive);
      const count: Record<string, number> = {};
      for (const e of w.entities) if (e.alive) count[e.kind] = (count[e.kind] ?? 0) + 1;
      const hostiles = w.entities
        .filter((e) => e.alive && (e.kind === 'enemy' || e.kind === 'boss'))
        .sort((a, c) => a.x - c.x)
        .slice(0, 12)
        .map((e) => ({ id: e.id, def: e.defId, x: Math.round(e.x), hp: Math.round(e.hp), anim: e.anim }));
      return JSON.stringify({
        scene,
        tick: w.tick,
        time: +w.time.toFixed(2),
        phase: w.phase,
        paused: b.runner.paused,
        speed: b.runner.speed,
        wave: w.wave,
        ash: ash ? { x: Math.round(ash.x), hp: Math.round(ash.hp), maxHp: ash.maxHp, anim: ash.anim, facing: ash.facing } : null,
        book: w.book,
        res: {
          iron: Math.floor(w.resources.iron),
          mana: Math.floor(w.resources.mana),
          gold: w.resources.goldCollected,
        },
        counts: count,
        hostiles,
        boss: w.boss,
        telegraphs: w.telegraphs.length,
        summonSlots: w.summonSlots.map((s) => ({ unit: s.unitId, cd: +s.cooldownLeft.toFixed(1), ok: s.available })),
        spellSlots: w.spellSlots.map((s) => ({ spell: s.spellId, cd: +s.cooldownLeft.toFixed(1) })),
        outcome: w.outcome,
        net: netDebug() ?? undefined,
      });
    },
    advanceTime(ms: number) {
      const rt = tryRuntime();
      rt?.battle?.runner.advance(ms);
    },
    __aodd: {
      app: () => tryRuntime()?.app ?? null,
      startWave(wave, opts) {
        const rt = getRuntime();
        const params = makeWaveParams(rt.app, wave, opts?.endless ?? false, opts?.seed);
        for (const s of rt.game.scene.getScenes(true)) rt.game.scene.stop(s.scene.key);
        const data: BattleSceneData = { params };
        rt.game.scene.start(SceneKey.Battle, data);
      },
      setProfile(profile: ProfileState) {
        const rt = getRuntime();
        rt.app.profile = profile;
        rt.app.commitProfile();
      },
      input(frame, ticks) {
        tryRuntime()?.battle?.runner.inject(frame, ticks);
      },
      currentScene: activeScene,
      runtime: () => tryRuntime() ?? null,
      frameTimes() {
        const rt = tryRuntime();
        if (!rt) return [];
        return rt.frameTimes.splice(0, rt.frameTimes.length);
      },
    },
  };
  Object.assign(window, hooks);
}
