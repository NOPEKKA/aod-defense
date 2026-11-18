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
import { C, addNum, addText, numStr } from '../style';
import { SKIN, coin, divider, ironPlate, queueUiKit, ribbon } from '../ui/skin';
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
    queueUiKit(this);
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
      this.add.image(0, 0, px.tex, px.frame).setOrigin(0, 0).setDisplaySize(this.vw, 720).setTint(0x0d0604).setAlpha(dim).setDepth(-90);
      const v = spriteFrame('vignette');
      this.add.image(0, 0, v.tex, v.frame).setOrigin(0, 0).setDisplaySize(this.vw, 720).setTint(0x000000).setAlpha(0.85).setDepth(-89);
    }
  }

  /** Title on a blood-red banner + optional back plank + gold purse along the top. */
  protected header(title: string, back?: { label?: string; to: () => void }, showGold = true): void {
    const cx = this.vw / 2;
    const t = addText(this, cx, 44, title, 34, { originX: 0.5, originY: 0.5, color: '#f6e2b0', font: 'head', shadow: true });
    ribbon(this, cx, 46, t.width);
    t.setDepth(1);
    if (back) {
      new Button(this, 98, 46, back.label ?? this.t('ui.back'), back.to, { w: 168, h: 58, variant: 'secondary', size: 21, icon: 'ui_back', iconSize: 26 });
    }
    if (showGold) this.goldBadge(this.vw - 22, 46);
  }

  protected goldBadge(right: number, cy: number): Phaser.GameObjects.BitmapText {
    const w = 178;
    ironPlate(this, { x: right - w, y: cy - 27, w, h: 56 });
    coin(this, right - w + 32, cy, 'gold', 34);
    return addNum(this, right - 22, cy - 1, numStr(this.app.profile.gold), 28, true).setOrigin(1, 0.5).setTint(SKIN.gold);
  }

  /** gold rule under a floating heading */
  protected rule(cx: number, y: number, w: number): void {
    divider(this, cx, y, w, true).setAlpha(0.9);
  }

  /** muted caption colour on the dark backdrop */
  protected get dim(): string {
    return C.textDim;
  }

  protected go(key: SceneKeyName, data?: object): void {
    this.scene.start(key, data);
  }
}
