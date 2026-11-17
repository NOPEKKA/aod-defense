import { SceneKey, type SettingsSceneData } from '../../contracts';
import { C, addText } from '../style';
import { addMenuShadow, addMenuSprite } from '../ui/menuSprite';
import { goldStyle } from '../ui/skin';
import { Button, confirmDialog, toast } from '../ui/widgets';
import { MenuScene } from './MenuScene';

let recoveryShown = false;

/** Title: Continue / New game / Settings. */
export class TitleScene extends MenuScene {
  constructor() {
    super(SceneKey.Title);
  }

  protected menuSprites(): string[] {
    return ['ash', 'unit_swordsman', 'unit_archer', 'enemy_skeleton', 'enemy_skeleton_helm', 'enemy_skeleton_knight'];
  }

  protected backdropScroll(): number {
    return 380;
  }

  private hasProgress(): boolean {
    const p = this.app.profile;
    return p.highestWave > 0 || p.gold > 0 || Object.values(p.upgrades).some((l) => l > 0);
  }

  protected build(): void {
    const vw = this.vw;
    // decoration: Ash and his men hold the courtyard, the dead close in from the right
    const gy = 668;
    const cast: Array<[string, number, number, 1 | -1, number, string]> = [
      ['unit_archer', 120, gy - 28, 1, 1.05, 'idle'],
      ['unit_swordsman', 215, gy - 8, 1, 1.15, 'idle'],
      ['ash', 330, gy + 6, 1, 1.45, 'idle'],
      ['enemy_skeleton_knight', vw - 110, gy - 30, -1, 1.15, 'idle'],
      ['enemy_skeleton', vw - 215, gy - 6, -1, 1.2, 'walk'],
      ['enemy_skeleton_helm', vw - 60, gy + 8, -1, 1.25, 'walk'],
    ];
    cast.forEach(([key, x, y, facing, scale, anim], i) => {
      addMenuShadow(this, key, x, y, scale, facing)?.setDepth(-60);
      addMenuSprite(this, key, x, y, { facing, scale, anim, phase: i * 0.37, speed: anim === 'walk' ? 0.5 : 1 }).setDepth(-50 + y * 0.01);
    });

    const cx = vw / 2 + 60;
    const title = this.add.text(cx, 110, this.t('game.title'), goldStyle(84)).setOrigin(0.5).setResolution(this.R).setShadow(0, 6, 'rgba(0,0,0,0.7)', 10, true, true);
    this.tweens.add({ targets: title, scale: 1.03, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    addText(this, cx, 176, this.t('title.subtitle'), 22, { originX: 0.5, originY: 0.5, color: '#e8dcc8', bold: false });

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
