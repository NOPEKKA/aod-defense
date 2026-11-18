import { SceneKey, type SettingsSceneData } from '../../contracts';
import { C, addText, gildText } from '../style';
import { addMenuShadow, addMenuSprite } from '../ui/menuSprite';
import { KIT, KIT_RES, divider, kitImage } from '../ui/skin';
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
    // a pool of shadow behind the logo so it reads over the torch-lit courtyard
    kitImage(this, 'soft_glow', cx, 120, 760, 300).setTint(0x000000).setAlpha(0.75);
    kitImage(this, 'soft_glow', cx, 112, 520, 150).setTint(0x8a1a10).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD);
    const title = addText(this, cx, 104, this.t('game.title'), 104, { originX: 0.5, originY: 0.5, font: 'head', color: '#e9c463', stroke: 3, shadow: true });
    gildText(title);
    this.tweens.add({ targets: title, scale: 1.015, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    divider(this, cx, 168, 460, true);
    addText(this, cx, 196, this.t('title.subtitle'), 21, { originX: 0.5, originY: 0.5, color: '#e8d8b4', bold: false });

    // the menu hangs from the logo bar on chains, like tavern signs
    const bw = 360;
    let y = 290;
    let chainTop = 176;
    const progress = this.hasProgress();
    const sign = (h: number) => {
      for (const sx of [-1, 1]) {
        const x = cx + sx * (bw / 2 - 40);
        const top = chainTop;
        const len = y - h / 2 + 6 - top;
        if (len > 4) this.add.tileSprite(x, top, 32, len * KIT_RES, KIT, 'chain').setOrigin(0.5, 0).setScale(1 / KIT_RES).setAlpha(0.95);
      }
      chainTop = y + h / 2 - 8;
    };
    if (progress) {
      sign(80);
      new Button(this, cx, y, this.t('ui.continue'), () => this.go(SceneKey.Map), {
        w: bw, h: 80, variant: 'primary', size: 32, icon: 'ui_play', head: true,
        sub: this.t('title.progress', { wave: this.app.profile.highestWave, total: this.app.data.balance.campaignWaves }),
      });
      y += 98;
    }
    const nh = progress ? 64 : 80;
    sign(nh);
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
    }, { w: progress ? bw - 30 : bw, h: nh, variant: progress ? 'secondary' : 'primary', size: progress ? 25 : 32, icon: progress ? undefined : 'ui_play', head: true });
    y += progress ? 84 : 98;
    sign(60);
    new Button(this, cx, y, this.t('ui.settings'), () => this.go(SceneKey.Settings, { returnTo: SceneKey.Title } satisfies SettingsSceneData), {
      w: bw - 60, h: 60, variant: 'ghost', size: 23, icon: 'ui_gear', iconSize: 28, head: true,
    });

    addText(this, vw - 14, 704, this.t('title.footer'), 14, { originX: 1, originY: 1, color: C.textDim, bold: false });

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
