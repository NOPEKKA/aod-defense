import { SceneKey, type SettingsSceneData } from '../../contracts';
import { addArt } from '../art/atlas';
import { C, addText } from '../style';
import { Button, confirmDialog, toast } from '../ui/widgets';
import { MenuScene } from './MenuScene';

let recoveryShown = false;

/** Title: Continue / New game / Settings. */
export class TitleScene extends MenuScene {
  constructor() {
    super(SceneKey.Title);
  }

  private hasProgress(): boolean {
    const p = this.app.profile;
    return p.highestWave > 0 || p.gold > 0 || Object.values(p.upgrades).some((l) => l > 0);
  }

  protected build(): void {
    const vw = this.vw;
    // decoration: Ash in front of the castle, skeletons approaching
    const ash = addArt(this, 330, 662, 'ash', 2.1);
    this.tweens.add({ targets: ash, y: 656, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    for (let i = 0; i < 3; i++) {
      const sk = addArt(this, vw - 120 - i * 110, 664 + (i % 2) * 6, i === 1 ? 'enemy_skeleton_helm' : 'enemy_skeleton', 1.5 - i * 0.12);
      sk.setFlipX(true);
      this.tweens.add({ targets: sk, angle: 4, duration: 420 + i * 60, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }

    const cx = vw / 2 + 120;
    const title = addText(this, cx, 104, this.t('game.title'), 76, { originX: 0.5, originY: 0.5, color: C.gold, stroke: 12, shadow: true });
    this.tweens.add({ targets: title, scale: 1.03, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    addText(this, cx, 166, this.t('title.subtitle'), 22, { originX: 0.5, originY: 0.5, color: C.text, bold: false });

    const bw = 380;
    let y = 270;
    const progress = this.hasProgress();
    if (progress) {
      new Button(this, cx, y, this.t('ui.continue'), () => this.go(SceneKey.Map), {
        w: bw, h: 76, variant: 'primary', size: 30, icon: 'ui_play',
        sub: this.t('title.progress', { wave: this.app.profile.highestWave, total: this.app.data.balance.campaignWaves }),
      });
      y += 96;
    }
    new Button(this, cx, y, this.t('ui.new_game'), () => {
      if (!this.hasProgress()) return this.startNew();
      confirmDialog(this, this.vw, this.vh, {
        title: this.t('title.new_confirm_title'),
        message: this.t('title.new_confirm'),
        yes: this.t('ui.new_game'),
        no: this.t('ui.back'),
        danger: true,
        onYes: () => this.startNew(),
      });
    }, { w: bw, h: progress ? 64 : 76, variant: progress ? 'secondary' : 'primary', size: progress ? 24 : 30, icon: progress ? undefined : 'ui_play' });
    y += progress ? 84 : 96;
    new Button(this, cx, y, this.t('ui.settings'), () => this.go(SceneKey.Settings, { returnTo: SceneKey.Title } satisfies SettingsSceneData), {
      w: bw, h: 64, variant: 'ghost', size: 24, icon: 'ui_gear', iconSize: 32,
    });

    addText(this, vw - 14, 704, this.t('title.footer'), 13, { originX: 1, originY: 1, color: C.textDim, bold: false });

    // save recovery notice (systems exposes app.save.lastRecovery once the lead wires it)
    const rec = (this.app.save as unknown as { lastRecovery?: { from: 'backup' | 'defaults'; error: string } | null }).lastRecovery;
    if (rec && !recoveryShown) {
      recoveryShown = true;
      toast(this, this.vw, this.t(rec.from === 'backup' ? 'save.recovered.backup' : 'save.recovered.defaults'), '#ffb08a');
    }
  }

  private startNew(): void {
    const lang = this.app.profile.settings;
    this.app.profile = this.app.save.defaults();
    // keep the player's settings (language etc.) across a new game
    this.app.profile.settings = { ...lang };
    this.app.commitProfile();
    this.go(SceneKey.Map);
  }
}
