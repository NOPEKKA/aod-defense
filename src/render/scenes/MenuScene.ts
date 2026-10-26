/**
 * Base for the render-owned menu scenes: logical-coordinate camera, backdrop,
 * rebuild on resize / language change, shared header helpers.
 */
import type { AppContext, SceneKeyName } from '../../contracts';
import { getApp } from '../../core/app';
import { setupCamera, viewSize } from '../../core/camera';
import { addArt } from '../art/atlas';
import { drawGround, drawHills, drawSky } from '../scenery';
import { C, addNum, addText, chapterLook, numStr } from '../style';
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
  protected chapter(): number {
    const w = this.app.progression.maxPlayableWave(this.app.profile);
    return this.app.data.levels[Math.max(0, Math.min(this.app.data.levels.length - 1, w - 1))]?.chapter ?? 1;
  }

  protected drawBackdrop(dim = 0.42): void {
    const look = chapterLook(this.chapter());
    const g = this.add.graphics().setDepth(-100);
    drawSky(g, this.vw, 720, look);
    const far = this.add.graphics().setDepth(-99);
    drawHills(far, this.vw + 40, 520, 120, look.far, 11, false);
    const near = this.add.graphics().setDepth(-98);
    drawHills(near, this.vw + 40, 590, 90, look.near, 23, true);
    const ground = this.add.graphics().setDepth(-97);
    drawGround(ground, 0, this.vw, 650, look);
    addArt(this, -60, 680, 'castle', 0.95).setDepth(-96);
    if (dim > 0) this.add.rectangle(0, 0, this.vw, 720, 0x0b0612, dim).setOrigin(0, 0).setDepth(-90);
  }

  /** Title + optional back button + gold counter along the top. */
  protected header(title: string, back?: { label?: string; to: () => void }, showGold = true): void {
    addText(this, this.vw / 2, 22, title, 36, { originX: 0.5, color: C.gold, shadow: true });
    if (back) {
      new Button(this, 96, 48, back.label ?? this.t('ui.back'), back.to, { w: 160, h: 60, variant: 'ghost', size: 22, icon: 'ui_back', iconSize: 28 });
    }
    if (showGold) this.goldBadge(this.vw - 24, 48);
  }

  protected goldBadge(right: number, cy: number): Phaser.GameObjects.BitmapText {
    const w = 190;
    const g = this.add.graphics();
    g.fillStyle(0x0b0810, 0.5);
    g.fillRoundedRect(right - w, cy - 26 + 3, w, 52, 26);
    g.fillStyle(C.panelN, 0.92);
    g.fillRoundedRect(right - w, cy - 26, w, 52, 26);
    g.lineStyle(3, C.inkN, 1);
    g.strokeRoundedRect(right - w, cy - 26, w, 52, 26);
    addArt(this, right - w + 28, cy, 'ui_gold', 0.75);
    return addNum(this, right - 20, cy, numStr(this.app.profile.gold), 28, true).setOrigin(1, 0.5);
  }

  protected go(key: SceneKeyName, data?: object): void {
    this.scene.start(key, data);
  }
}
