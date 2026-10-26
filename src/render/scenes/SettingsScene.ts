import { SceneKey, type Settings, type SettingsSceneData } from '../../contracts';
import { C, addNum, addText, numStr } from '../style';
import { Button, confirmDialog, panel, toast } from '../ui/widgets';
import { MenuScene } from './MenuScene';

/** Settings (SPEC §7.3) + save export / import / reset. */
export class SettingsScene extends MenuScene<SettingsSceneData> {
  private pendingToast: { text: string; color: string } | null = null;

  constructor() {
    super(SceneKey.Settings);
  }

  private back(): void {
    const to = this.args.returnTo ?? SceneKey.Title;
    if (to === SceneKey.Battle) {
      // launched on top of a paused battle: just close
      this.scene.stop();
      return;
    }
    this.go(to);
  }

  private apply(patch: Partial<Settings>): void {
    this.app.applySettings({ ...this.app.profile.settings, ...patch });
    // settings:changed rebuilds the scene (language may have changed)
  }

  protected build(): void {
    this.header(this.t('ui.settings'), { to: () => this.back() }, false);
    const vw = this.vw;
    const s = this.app.profile.settings;
    const colW = Math.min(560, (vw - 100) / 2);
    const lx = vw / 2 - colW - 14;
    const rx = vw / 2 + 14;
    const top = 100;
    const rowH = 82;
    panel(this, lx - 12, top - 10, colW + 24, rowH * 6 + 24);
    panel(this, rx - 12, top - 10, colW + 24, rowH * 6 + 24);

    let y = top + rowH / 2;
    this.choice(lx, y, colW, this.t('settings.lang'), [['th', this.t('lang.th')], ['en', this.t('lang.en')]], s.lang, (v) => this.apply({ lang: v as Settings['lang'] }));
    y += rowH;
    this.choice(lx, y, colW, this.t('settings.fps'), [['0', this.t('settings.fps_unlimited', { hz: this.app.refreshHz })], ['60', '60 fps']], String(s.fpsCap), (v) => this.apply({ fpsCap: v === '60' ? 60 : 0 }));
    y += rowH;
    this.choice(lx, y, colW, this.t('settings.fx'), [['low', this.t('settings.low')], ['high', this.t('settings.high')]], s.fxQuality, (v) => this.apply({ fxQuality: v as Settings['fxQuality'] }));
    y += rowH;
    this.toggle(lx, y, colW, this.t('settings.show_fps'), s.showFps, (v) => this.apply({ showFps: v }));
    y += rowH;
    this.toggle(lx, y, colW, this.t('settings.damage_numbers'), s.damageNumbers, (v) => this.apply({ damageNumbers: v }));
    y += rowH;
    this.toggle(lx, y, colW, this.t('settings.haptics'), s.haptics, (v) => this.apply({ haptics: v }));

    y = top + rowH / 2;
    this.volume(rx, y, colW, this.t('settings.sfx'), s.sfxVolume, (v) => this.apply({ sfxVolume: v }));
    y += rowH;
    this.volume(rx, y, colW, this.t('settings.music'), s.musicVolume, (v) => this.apply({ musicVolume: v }));
    y += rowH;
    addText(this, rx + 8, y - 6, this.t('settings.save'), 22, { originY: 0.5, color: C.gold });
    addText(this, rx + 8, y + 22, this.t('settings.save_hint'), 14, { originY: 0.5, color: C.textDim, bold: false, wrap: colW - 16 });
    y += rowH;
    const bw = (colW - 16) / 2;
    new Button(this, rx + bw / 2, y, this.t('settings.export'), () => this.exportSave(), { w: bw, h: 62, variant: 'secondary', size: 21, icon: 'ui_export', iconSize: 30 });
    new Button(this, rx + colW - bw / 2, y, this.t('settings.import'), () => this.importSave(), { w: bw, h: 62, variant: 'secondary', size: 21, icon: 'ui_import', iconSize: 30 });
    y += rowH;
    new Button(this, rx + colW / 2, y, this.t('settings.reset'), () => this.resetSave(), { w: colW, h: 62, variant: 'danger', size: 21, icon: 'ui_trash', iconSize: 30 });

    if (this.pendingToast) {
      toast(this, this.vw, this.pendingToast.text, this.pendingToast.color);
      this.pendingToast = null;
    }
  }

  private label(x: number, y: number, text: string, maxW: number): void {
    const t = addText(this, x + 8, y, text, 21, { originY: 0.5 });
    if (t.width > maxW) t.setFontSize(17);
  }

  private choice(x: number, y: number, w: number, label: string, opts: Array<[string, string]>, current: string, set: (v: string) => void): void {
    this.label(x, y, label, w * 0.42);
    const bw = Math.min(150, (w * 0.56 - 8 * (opts.length - 1)) / opts.length);
    opts.forEach(([v, text], i) => {
      const bx = x + w - (opts.length - i) * bw - (opts.length - 1 - i) * 8 + bw / 2;
      new Button(this, bx, y, text, () => v !== current && set(v), { w: bw, h: 58, variant: v === current ? 'selected' : 'ghost', size: 18 });
    });
  }

  private toggle(x: number, y: number, w: number, label: string, on: boolean, set: (v: boolean) => void): void {
    this.choice(x, y, w, label, [['off', this.t('settings.off')], ['on', this.t('settings.on')]], on ? 'on' : 'off', (v) => set(v === 'on'));
  }

  private volume(x: number, y: number, w: number, label: string, value: number, set: (v: number) => void): void {
    this.label(x, y, label, w * 0.36);
    const step = 0.1;
    const right = x + w;
    const barW = w * 0.32;
    const barX = right - 64 - 10 - barW;
    new Button(this, barX - 10 - 32, y, '−', () => set(Math.max(0, Math.round((value - step) * 10) / 10)), { w: 64, h: 58, variant: 'ghost', size: 28 });
    new Button(this, right - 32, y, '+', () => set(Math.min(1, Math.round((value + step) * 10) / 10)), { w: 64, h: 58, variant: 'ghost', size: 28 });
    const g = this.add.graphics();
    g.fillStyle(C.inkN, 1);
    g.fillRoundedRect(barX - 2, y - 11, barW + 4, 22, 11);
    g.fillStyle(0x3a2f48, 1);
    g.fillRoundedRect(barX, y - 9, barW, 18, 9);
    if (value > 0) {
      g.fillStyle(C.blueN, 1);
      g.fillRoundedRect(barX, y - 9, Math.max(18, barW * value), 18, 9);
    }
    addNum(this, barX + barW / 2, y, `${numStr(Math.round(value * 100))}%`, 14).setOrigin(0.5, 0.5);
  }

  private exportSave(): void {
    try {
      const json = this.app.save.exportJson(this.app.profile);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      a.href = url;
      a.download = `aod-defense-save-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(this, this.vw, this.t('settings.exported'), C.green);
    } catch (err) {
      toast(this, this.vw, this.t('settings.export_failed', { error: String(err) }), '#ff8a7a');
    }
  }

  private importSave(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      file
        .text()
        .then((text) => {
          const res = this.app.save.importJson(text);
          if (!res.ok) {
            toast(this, this.vw, this.t('settings.import_failed', { error: res.error }), '#ff8a7a');
            return;
          }
          this.app.profile = res.profile;
          this.pendingToast = { text: this.t('settings.imported'), color: C.green };
          this.app.commitProfile();
          this.rebuild();
        })
        .catch((err: unknown) => toast(this, this.vw, this.t('settings.import_failed', { error: String(err) }), '#ff8a7a'));
    });
    input.click();
  }

  private resetSave(): void {
    confirmDialog(this, this.vw, this.vh, {
      title: this.t('settings.reset'),
      message: this.t('settings.reset_confirm1'),
      yes: this.t('settings.reset_yes'),
      no: this.t('ui.back'),
      danger: true,
      onYes: () => {
        confirmDialog(this, this.vw, this.vh, {
          title: this.t('settings.reset_confirm2_title'),
          message: this.t('settings.reset_confirm2'),
          yes: this.t('settings.reset_final'),
          no: this.t('ui.back'),
          danger: true,
          onYes: () => {
            this.app.profile = this.app.save.defaults();
            this.pendingToast = { text: this.t('settings.reset_done'), color: C.green };
            this.app.commitProfile();
            this.rebuild();
          },
        });
      },
    });
  }
}

