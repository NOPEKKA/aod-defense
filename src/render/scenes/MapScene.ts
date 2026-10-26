import { SceneKey, type PreWaveSceneData, type SettingsSceneData } from '../../contracts';
import { addArt } from '../art/atlas';
import { C, addNum, addText, chapterLook, numStr } from '../style';
import { Button } from '../ui/widgets';
import { MenuScene } from './MenuScene';

const PER_CHAPTER = 10;

/** Wave map: 5 chapters x 10 waves, stars, locks, boss skulls. */
export class MapScene extends MenuScene {
  constructor() {
    super(SceneKey.Map);
  }

  protected build(): void {
    const app = this.app;
    const p = app.profile;
    const vw = this.vw;
    this.header(this.t('map.title'), { label: this.t('ui.title_screen'), to: () => this.go(SceneKey.Title) });

    const maxWave = app.progression.maxPlayableWave(p);
    const total = app.data.balance.campaignWaves;
    const chapters = Math.ceil(total / PER_CHAPTER);
    const labelW = 150;
    const left = Math.max(24, (vw - 1240) / 2);
    const gridX = left + labelW;
    const gridW = Math.min(vw - gridX - 24, 1090);
    const cellW = gridW / PER_CHAPTER;
    const top = 100;
    const rowH = Math.min(104, (720 - top - 100) / chapters);
    const node = Math.min(66, cellW - 14);

    for (let c = 0; c < chapters; c++) {
      const y = top + c * rowH;
      const look = chapterLook(c + 1);
      const band = this.add.graphics();
      band.fillStyle(0x1b1424, 0.82);
      band.fillRoundedRect(left, y + 4, gridX + gridW - left, rowH - 8, 14);
      band.fillGradientStyle(look.skyTop, look.skyBottom, look.skyTop, look.skyBottom, 0.55);
      band.fillRoundedRect(left, y + 4, gridX + gridW - left, rowH - 8, 14);
      band.lineStyle(2, C.inkN, 0.9);
      band.strokeRoundedRect(left, y + 4, gridX + gridW - left, rowH - 8, 14);
      const chapterUnlocked = c * PER_CHAPTER + 1 <= maxWave;
      addText(this, left + 14, y + rowH / 2 - 14, this.t('map.chapter', { n: c + 1 }), 20, { originY: 0.5, color: chapterUnlocked ? C.gold : C.textDim });
      addText(this, left + 14, y + rowH / 2 + 12, this.t(`map.chapter${c + 1}`), 15, { originY: 0.5, color: chapterUnlocked ? C.text : C.textDim, bold: false });

      for (let i = 0; i < PER_CHAPTER; i++) {
        const wave = c * PER_CHAPTER + i + 1;
        if (wave > total) break;
        const cx = gridX + cellW * i + cellW / 2;
        const cy = y + rowH / 2 - 8;
        this.waveNode(wave, cx, cy, node, wave <= maxWave, wave === maxWave && wave > p.highestWave);
      }
    }

    // footer buttons
    const by = 720 - 46;
    new Button(this, vw / 2 - 210, by, this.t('ui.upgrade'), () => this.go(SceneKey.Shop), { w: 260, h: 64, variant: 'gold', size: 24, icon: 'ui_shop', iconSize: 34 });
    new Button(this, vw / 2 + 70, by, this.t('ui.settings'), () => this.go(SceneKey.Settings, { returnTo: SceneKey.Map } satisfies SettingsSceneData), { w: 220, h: 64, variant: 'ghost', size: 22, icon: 'ui_gear', iconSize: 30 });
    if (p.highestWave >= total) {
      const start = Math.max(total + 1, p.endlessBest + 1);
      new Button(this, vw / 2 + 330, by, this.t('map.endless'), () => this.go(SceneKey.PreWave, { wave: start, endless: true } satisfies PreWaveSceneData), {
        w: 240, h: 64, variant: 'danger', size: 22, icon: 'ui_skull', iconSize: 30, sub: this.t('map.endless_best', { n: p.endlessBest }),
      });
    }
  }

  private waveNode(wave: number, cx: number, cy: number, size: number, unlocked: boolean, current: boolean): void {
    const level = this.app.data.levels[wave - 1];
    const boss = level?.kind === 'boss';
    const stars = this.app.profile.stars[wave] ?? 0;
    const cleared = wave <= this.app.profile.highestWave;
    const c = this.add.container(cx, cy);
    const g = this.add.graphics();
    const half = size / 2;
    const fill = !unlocked ? 0x2a2432 : boss ? 0x8a2a3a : cleared ? 0x3f5f9a : 0x4a3f6a;
    g.fillStyle(0x0b0810, 0.5);
    g.fillRoundedRect(-half, -half + 4, size, size, 14);
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-half, -half, size, size, 14);
    g.fillStyle(0xffffff, unlocked ? 0.12 : 0.04);
    g.fillRoundedRect(-half + 4, -half + 3, size - 8, size * 0.4, { tl: 10, tr: 10, bl: 4, br: 4 });
    g.lineStyle(3, current ? 0xffd34d : C.inkN, 1);
    g.strokeRoundedRect(-half, -half, size, size, 14);
    c.add(g);
    if (unlocked) {
      const n = addNum(this, 0, 2, numStr(wave), size * 0.42, true).setOrigin(0.5, 0.5);
      c.add(n);
    } else {
      c.add(addArt(this, 0, 0, 'ui_lock', (size * 0.55) / 48));
    }
    if (boss) c.add(addArt(this, half - 6, -half + 6, 'ui_skull', 0.55));
    // stars
    for (let s = 0; s < 3; s++) {
      const st = addArt(this, (s - 1) * 17, half + 11, s < stars ? 'ui_star' : 'ui_star_empty', 0.36);
      if (!cleared) st.setAlpha(0.35);
      c.add(st);
    }
    if (current) {
      const glow = addArt(this, 0, 0, 'glow', (size * 1.5) / 96).setTint(0xffd34d).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
      c.addAt(glow, 0);
      this.tweens.add({ targets: glow, alpha: 0.15, duration: 700, yoyo: true, repeat: -1 });
    }
    if (!unlocked) {
      c.setAlpha(0.75);
      return;
    }
    c.setSize(size, size + 20);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.92));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      c.setScale(1);
      this.go(SceneKey.PreWave, { wave, endless: false } satisfies PreWaveSceneData);
    });
  }
}
