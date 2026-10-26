/**
 * Pause overlay (render-owned modal UI, uses its own interactive buttons).
 * Resume emits ui:pause {paused:false}; restart restarts the Battle scene with
 * the same data; quick toggles go through app.applySettings.
 */
import { SceneKey, type HudLayout, type RenderView } from '../../contracts';
import { getApp } from '../../core/app';
import { C, addText } from '../style';
import { Button, confirmDialog, panel } from '../ui/widgets';

const DEPTH = 5000;

export class PauseMenu {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private visible = false;
  private layout: HudLayout | null = null;
  private closeDialog: (() => void) | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly view: RenderView) {}

  rebuild(layout: HudLayout): void {
    this.layout = layout;
    this.clear();
    if (this.visible) this.build();
  }

  setVisible(on: boolean): void {
    if (on === this.visible) return;
    this.visible = on;
    if (on) this.build();
    else this.clear();
  }

  private clear(): void {
    this.closeDialog?.();
    this.closeDialog = null;
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }

  private build(): void {
    const L = this.layout ?? this.view.layout;
    const app = getApp();
    const t = app.t;
    const s = this.scene;
    const vw = L.viewW;
    const vh = L.viewH;
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as { setScrollFactor(x: number, y?: number, c?: boolean): void }).setScrollFactor(0, 0, true);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH + this.objs.length);
      this.objs.push(o);
      return o;
    };
    const dim = keep(s.add.rectangle(0, 0, vw, vh, 0x07040b, 0.66).setOrigin(0, 0));
    dim.setInteractive();
    const pw = 520;
    const ph = 420;
    const px = (vw - pw) / 2;
    const py = (vh - ph) / 2;
    keep(panel(s, px, py, pw, ph));
    keep(addText(s, vw / 2, py + 22, t('ui.paused'), 36, { originX: 0.5, color: C.gold }));
    const w = this.view.world;
    const waveKey = w.wave.endless ? 'ui.wave_endless' : 'ui.wave';
    keep(addText(s, vw / 2, py + 70, t(waveKey, { n: w.wave.number, total: this.view.data.balance.campaignWaves }), 18, { originX: 0.5, color: C.textDim, bold: false }));

    const bw = pw - 80;
    let y = py + 128;
    const resume = new Button(s, vw / 2, y, t('ui.resume'), () => app.bus.emit('ui:pause', { paused: false }), { w: bw, h: 64, variant: 'primary', size: 26, icon: 'ui_play' });
    keep(resume);
    y += 78;
    const restart = new Button(s, vw / 2, y, t('pause.restart_wave'), () => {
      this.closeDialog = confirmDialog(s, vw, vh, {
        title: t('pause.restart_wave'),
        message: t('pause.restart_confirm'),
        yes: t('ui.restart'),
        no: t('ui.back'),
        scrollFactor: 0,
        onYes: () => {
          this.closeDialog = null;
          this.scene.scene.restart(this.scene.sys.settings.data);
        },
        onNo: () => (this.closeDialog = null),
      });
    }, { w: bw, h: 60, variant: 'secondary', size: 22, icon: 'ui_retry' });
    keep(restart);
    y += 74;
    const half = (bw - 14) / 2;
    const st = app.profile.settings;
    const lang = new Button(s, vw / 2 - half / 2 - 7, y, t('pause.lang', { lang: t(st.lang === 'th' ? 'lang.th' : 'lang.en') }), () => {
      app.applySettings({ ...app.profile.settings, lang: app.profile.settings.lang === 'th' ? 'en' : 'th' });
    }, { w: half, h: 58, variant: 'ghost', size: 19, icon: 'ui_globe', iconSize: 28 });
    keep(lang);
    const fps = new Button(s, vw / 2 + half / 2 + 7, y, t(st.fpsCap === 60 ? 'pause.fps60_on' : 'pause.fps60_off'), () => {
      app.applySettings({ ...app.profile.settings, fpsCap: app.profile.settings.fpsCap === 60 ? 0 : 60 });
    }, { w: half, h: 58, variant: st.fpsCap === 60 ? 'selected' : 'ghost', size: 19 });
    keep(fps);
    y += 74;
    const quit = new Button(s, vw / 2, y, t('ui.quit_map'), () => {
      this.closeDialog = confirmDialog(s, vw, vh, {
        title: t('ui.quit_map'),
        message: t('pause.quit_confirm'),
        yes: t('ui.quit_map'),
        no: t('ui.back'),
        danger: true,
        scrollFactor: 0,
        onYes: () => {
          this.closeDialog = null;
          this.scene.scene.start(SceneKey.Map);
        },
        onNo: () => (this.closeDialog = null),
      });
    }, { w: bw, h: 60, variant: 'danger', size: 22, icon: 'ui_map' });
    keep(quit);
  }

  destroy(): void {
    this.clear();
  }
}
