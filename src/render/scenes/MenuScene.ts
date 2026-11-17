/**
 * Base for the render-owned menu scenes: logical-coordinate camera, backdrop,
 * rebuild on resize / language change, shared header helpers.
 */
import type { AppContext, SceneKeyName } from '../../contracts';
import { getApp } from '../../core/app';
import { setupCamera, viewSize } from '../../core/camera';
import { spriteFrame } from '../art/atlas';
import { bgForChapter, queueBackground, queueSprite, syncQuality } from '../assets/library';
import { clearSpriteInfo } from '../assets/sprites';
import { addStaticCourtyard } from '../battle/Backdrop';
import { addNum, numStr } from '../style';
import { SKIN, addIcon, goldStyle, stonePanel } from '../ui/skin';
import { Button } from '../ui/widgets';

export abstract class MenuScene<D extends object = object> extends Phaser.Scene {
  protected app!: AppContext;
  protected R = 1;
  protected vw = 1280;
  protected vh = 720;
  protected args!: D;
  private restarting = false;

  constructor(key: SceneKeyName) {
    super(key);
  }

  /** sprite atlases this menu shows (baked art; generated art is used until they load) */
  protected menuSprites(): string[] {
    return [];
  }

  /** where the battle camera would look for the backdrop (world px) */
  protected backdropScroll(): number {
    return 0;
  }

  preload(): void {
    const app = getApp();
    if (syncQuality(this, app.profile.settings)) clearSpriteInfo();
    const bg = bgForChapter(this.chapter(app));
    if (bg) queueBackground(this, bg.id);
    for (const k of this.menuSprites()) queueSprite(this, k);
  }

  create(data: D): void {
    this.app = getApp();
    this.restarting = false;
    this.R = this.app.renderScale;
    setupCamera(this, this.R);
    this.vw = viewSize(this, this.R).w;
    this.vh = 720;
    this.args = (data ?? {}) as D;
    this.drawBackdrop();
    this.build();
    const onResize = () => {
      const w = viewSize(this, this.R).w;
      if (Math.abs(w - this.vw) > 0.5) this.rebuild();
    };
    this.scale.on('resize', onResize);
    const offSettings = this.app.bus.on('settings:changed', () => this.onSettingsChanged());
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      offSettings();
    });
  }

  protected abstract build(): void;

  /** default: rebuild everything (text language may have changed) */
  protected onSettingsChanged(): void {
    this.rebuild();
  }

  protected rebuild(): void {
    if (this.restarting) return;
    this.restarting = true;
    // deferred through the scene clock: if the scene is stopped/switched in the
    // meantime (e.g. settings applied right before starting a battle) it never fires
    this.time.delayedCall(0, () => {
      if (this.scene.isActive()) this.scene.restart(this.args);
    });
  }

  protected t(key: string, vars?: Record<string, string | number>): string {
    return this.app.t(key, vars);
  }

  /** chapter of the furthest reachable wave, for the backdrop palette */
  protected chapter(app: AppContext = this.app): number {
    const w = app.progression.maxPlayableWave(app.profile);
    return app.data.levels[Math.max(0, Math.min(app.data.levels.length - 1, w - 1))]?.chapter ?? 1;
  }

  /** The castle courtyard of the current chapter, darkened, as the menu backdrop. */
  protected drawBackdrop(dim = 0.5): void {
    const scroll = Math.max(0, Math.min(this.app.data.balance.world.width - this.vw, this.backdropScroll()));
    addStaticCourtyard(this, this.chapter(), scroll, this.vw, -100, { data: this.app.data });
    if (dim > 0) {
      const px = spriteFrame('px');
      this.add.image(0, 0, px.tex, px.frame).setOrigin(0, 0).setDisplaySize(this.vw, 720).setTint(0x0b0612).setAlpha(dim).setDepth(-90);
      const v = spriteFrame('vignette');
      this.add.image(0, 0, v.tex, v.frame).setOrigin(0, 0).setDisplaySize(this.vw, 720).setTint(0x000000).setAlpha(0.85).setDepth(-89);
    }
  }

  /** Title + optional back button + gold counter along the top. */
  protected header(title: string, back?: { label?: string; to: () => void }, showGold = true): void {
    this.add.text(this.vw / 2, 46, title, goldStyle(38)).setOrigin(0.5).setResolution(this.R).setShadow(0, 3, 'rgba(0,0,0,0.6)', 4, true, true);
    if (back) {
      new Button(this, 96, 48, back.label ?? this.t('ui.back'), back.to, { w: 160, h: 60, variant: 'ghost', size: 22, icon: 'ui_back', iconSize: 28 });
    }
    if (showGold) this.goldBadge(this.vw - 24, 48);
  }

  protected goldBadge(right: number, cy: number): Phaser.GameObjects.BitmapText {
    const w = 190;
    const g = this.add.graphics();
    stonePanel(g, { x: right - w, y: cy - 26, w, h: 52 }, 12);
    addIcon(this, right - w + 30, cy, 'ui_gold', 'ui_gold', 38);
    return addNum(this, right - 20, cy, numStr(this.app.profile.gold), 28, true).setOrigin(1, 0.5).setTint(SKIN.gold);
  }

  protected go(key: SceneKeyName, data?: object): void {
    this.scene.start(key, data);
  }
}
