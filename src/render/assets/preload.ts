/**
 * What a wave needs on screen, queued in Battle.preload() (render.preloadBattle), plus lazy
 * loading for sprites that show up by surprise (random summons) and a loading bar.
 */
import type { AppContext, GameData, WaveStartParams } from '../../contracts';
import { setupCamera } from '../../core/camera';
import {
  bgForChapter,
  getManifest,
  isSpriteLoaded,
  queueBackground,
  queueSprite,
  spriteMeta,
  spriteTextureKey,
  syncQuality,
  warnOnce,
} from './library';
import { clearSpriteInfo } from './sprites';

/** sprites every battle uses besides the loadout and the wave's enemies */
const ALWAYS = ['ash', 'ash_left', 'npc_blacksmith', 'book', 'coin', 'coin_silver', 'mana_orb', 'food', 'shot', 'arrow', 'rock', 'gib_bone_a', 'gib_bone_b', 'gib_bone_c', 'gib_skull', 'unit_archer'];

/**
 * Effect sheets every fight shows from the first second (hits, deaths, shots). The bigger,
 * rarer ones (explosions, spell circles, portals, beams ...) stream in after the wave starts
 * (lazyFx); until then FxRenderer falls back to procedural particles.
 */
const FX_CORE = new Set(['fx_bone_burst', 'fx_dust_puff', 'fx_slash', 'fx_smoke_puff', 'fx_spark_burst', 'fx_muzzle_flash', 'fx_ember', 'fx_glow', 'fx_soul', 'fx_fire']);

/** Queue every baked fx sheet not loaded up-front; `onDone` runs when the loader goes idle. */
export function lazyFx(scene: Phaser.Scene, onDone: () => void): void {
  let any = false;
  for (const key of Object.keys(getManifest().sprites)) {
    if (!key.startsWith('fx_') || FX_CORE.has(key)) continue;
    if (!requestSprite(scene, key)) any = true;
  }
  if (any) scene.load.once('complete', onDone);
}

/** chapter (1-based) of a wave, matching core/world.ts */
export function chapterOf(wave: number): number {
  return (Math.floor((Math.max(1, wave) - 1) / 10) % 5) + 1;
}

function addUnit(data: GameData, id: string, out: Set<string>, depth = 0): void {
  const u = data.units.get(id);
  if (!u || depth > 2) return;
  out.add(u.sprite);
  if (u.stats.attack.projectile) out.add(u.stats.attack.projectile);
  for (const e of u.escorts) addUnit(data, e.unitId, out, depth + 1);
}

function addEnemy(data: GameData, id: string, out: Set<string>): void {
  const e = data.enemies.get(id);
  if (!e) return;
  out.add(e.sprite);
  if (e.stats.attack.projectile) out.add(e.stats.attack.projectile);
}

/** Every sprite key the wave can show (deduplicated). */
export function spritesForWave(app: AppContext, params: WaveStartParams): Set<string> {
  const data = app.data;
  const out = new Set<string>(ALWAYS);
  for (const id of params.units) addUnit(data, id, out);
  const plan = app.waves.plan(params.wave, params.endless);
  for (const g of plan.groups) addEnemy(data, g.enemy, out);
  // spell props that are entities (not fx sheets)
  for (const id of params.spells) {
    if (id === 'bear_traps') out.add('bear_trap');
    else if (id === 'dawn_lance') out.add('lance');
  }
  if (plan.bossId) {
    const b = data.bosses.get(plan.bossId);
    if (b) {
      out.add(b.sprite);
      // what bosses throw (falling hazards)
      for (const k of ['coffin', 'pumpkin_head', 'poison_flask', 'fireball', 'rock']) out.add(k);
      for (const ph of b.phases) {
        for (const m of ph.minions) addEnemy(data, m.enemy, out);
        // summon steps name their minion in params (e.g. {"enemy": "winged_deadite"})
        for (const step of ph.loop) {
          for (const v of Object.values(step.params)) if (typeof v === 'string' && data.enemies.has(v)) addEnemy(data, v, out);
        }
      }
    }
  }
  // the common effect sheets; the rest stream in during the wave (lazyFx)
  for (const key of FX_CORE) if (getManifest().sprites[key]) out.add(key);
  return out;
}

// ---------------------------------------------------------------------------

const pending = new Set<string>();

/**
 * Lazy load of a sprite not queued up-front (a surprise summon). Safe to call every frame:
 * it queues once and starts the loader when idle. Returns true when it is loaded.
 */
export function requestSprite(scene: Phaser.Scene, key: string): boolean {
  if (isSpriteLoaded(scene, key)) return true;
  if (pending.has(key) || !spriteMeta(key)) return false;
  pending.add(key);
  const tex = spriteTextureKey(key);
  const done = () => {
    pending.delete(key);
    scene.load.off(`filecomplete-multiatlas-${tex}`, done);
  };
  scene.load.once(`filecomplete-multiatlas-${tex}`, done);
  scene.load.once('loaderror', (file: Phaser.Loader.File) => {
    if (file.key === tex) warnOnce(`loadfail:${key}`, `could not load sprite "${key}"`);
  });
  if (queueSprite(scene, key)) {
    if (!scene.load.isLoading()) scene.load.start();
  } else pending.delete(key);
  return false;
}

/**
 * Battle.preload(): queue the wave's atlases and the chapter background, with a loading bar
 * when anything has to come over the network.
 */
export function preloadBattle(scene: Phaser.Scene, app: AppContext, params: WaveStartParams): void {
  if (syncQuality(scene, app.profile.settings)) clearSpriteInfo();
  let queued = 0;
  for (const key of spritesForWave(app, params)) {
    if (!spriteMeta(key)) {
      warnOnce(`nometa:${key}`, `sprite "${key}" is not baked yet: drawing a placeholder`);
      continue;
    }
    if (queueSprite(scene, key)) queued++;
  }
  const bg = bgForChapter(params.endless ? chapterOf(params.wave) : app.data.levels[params.wave - 1]?.chapter ?? chapterOf(params.wave));
  if (bg && queueBackground(scene, bg.id)) queued++;
  scene.load.on('loaderror', (file: Phaser.Loader.File) => warnOnce(`loadfail:${file.key}`, `could not load ${file.type} "${file.key}" (${String(file.url)})`));
  if (queued > 0) loadingBar(scene, app, params);
}

/** Stone-and-iron loading bar drawn in logical coordinates; removed when the load completes. */
function loadingBar(scene: Phaser.Scene, app: AppContext, params: WaveStartParams): void {
  const R = app.renderScale;
  setupCamera(scene, R);
  const vw = scene.scale.gameSize.width / R;
  const cx = vw / 2;
  const cy = 420;
  const bw = Math.min(560, vw - 160);
  const g = scene.add.graphics().setDepth(100000);
  const fill = scene.add.graphics().setDepth(100001);
  g.fillStyle(0x0d0a12, 1);
  g.fillRect(0, 0, vw, 720);
  g.fillGradientStyle(0x1a1422, 0x1a1422, 0x0d0a12, 0x0d0a12, 1);
  g.fillRect(0, 0, vw, 420);
  // iron frame
  g.fillStyle(0x07050a, 1);
  g.fillRoundedRect(cx - bw / 2 - 8, cy - 18, bw + 16, 36, 10);
  g.fillStyle(0x4a4650, 1);
  g.fillRoundedRect(cx - bw / 2 - 5, cy - 15, bw + 10, 30, 8);
  g.fillStyle(0x16121c, 1);
  g.fillRoundedRect(cx - bw / 2, cy - 10, bw, 20, 6);
  for (const x of [cx - bw / 2 - 1, cx + bw / 2 + 1]) {
    g.fillStyle(0xb0a890, 1);
    g.fillCircle(x, cy, 3);
  }
  const level = params.endless ? undefined : app.data.levels[params.wave - 1];
  const title = params.endless ? app.t('ui.wave_endless', { n: params.wave }) : app.t('ui.wave', { n: params.wave, total: app.data.balance.campaignWaves });
  const chap = level ? app.t(`map.chapter${level.chapter}`) : '';
  // same type as the menus: Chonburi/Taviraj heading, thin engraved edge instead of a fat stroke
  const style = { fontFamily: 'Chonburi, Taviraj, "Leelawadee UI", serif', fontStyle: 'normal', color: '#e8c46a', stroke: '#140c08', strokeThickness: 3, fontSize: '40px' };
  const t1 = scene.add.text(cx, cy - 92, title, style).setOrigin(0.5).setDepth(100002).setResolution(R);
  const t2 = scene.add.text(cx, cy - 46, chap, { ...style, color: '#e8dcc8', fontSize: '22px', strokeThickness: 4, fontStyle: 'normal' }).setOrigin(0.5).setDepth(100002).setResolution(R);
  const t3 = scene.add.text(cx, cy + 34, app.t('ui.loading'), { ...style, color: '#b8aec8', fontSize: '16px', strokeThickness: 3, fontStyle: 'normal' }).setOrigin(0.5, 0).setDepth(100002).setResolution(R);
  const onProgress = (p: number) => {
    fill.clear();
    const w = Math.max(6, (bw - 4) * p);
    fill.fillStyle(0xc0701c, 1);
    fill.fillRoundedRect(cx - bw / 2 + 2, cy - 8, w, 16, 5);
    fill.fillStyle(0xffd060, 1);
    fill.fillRoundedRect(cx - bw / 2 + 2, cy - 8, w, 7, { tl: 5, tr: 5, bl: 0, br: 0 });
  };
  onProgress(0);
  scene.load.on('progress', onProgress);
  scene.load.once('complete', () => {
    scene.load.off('progress', onProgress);
    for (const o of [g, fill, t1, t2, t3]) o.destroy();
  });
}
