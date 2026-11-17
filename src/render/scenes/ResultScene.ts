import { SceneKey, type BattleSceneData, type PreWaveSceneData, type ResultSceneData } from '../../contracts';
import { makeWaveParams } from '../../core/app';
import { addArt } from '../art/atlas';
import { addIcon } from '../ui/skin';
import { C, addNum, addText, numStr } from '../style';
import { Button, panel } from '../ui/widgets';
import { MenuScene } from './MenuScene';

/** Result: victory/defeat, gold breakdown, stars, unlocks. Core already applied the outcome. */
export class ResultScene extends MenuScene<ResultSceneData> {
  constructor() {
    super(SceneKey.Result);
  }

  private unlockName(id: string): string {
    const d = this.app.data;
    const key = d.units.get(id)?.nameKey ?? d.spells.get(id)?.nameKey ?? d.upgrades.get(id)?.nameKey ?? d.relics.get(id)?.nameKey;
    if (key) return d.upgrades.has(id) ? this.t('result.unlock_upgrade', { name: this.t(key) }) : this.t(key);
    const k2 = `unlock.${id}`;
    const s = this.t(k2);
    return s === k2 ? id : s;
  }

  protected build(): void {
    const o = this.args.outcome;
    if (!o) {
      this.go(SceneKey.Map);
      return;
    }
    const app = this.app;
    const vw = this.vw;
    const won = o.result === 'won';
    const pw = Math.min(980, vw - 80);
    const px = (vw - pw) / 2;
    const py = 40;
    const ph = 720 - py - 120;
    panel(this, px, py, pw, ph, won ? 0x2a2440 : 0x2e1a22);

    const title = addText(this, vw / 2, py + 50, this.t(won ? 'ui.victory' : 'ui.defeat'), 64, { originX: 0.5, originY: 0.5, color: won ? C.gold : '#ff7a6a', stroke: 10, shadow: true });
    title.setScale(0.6);
    this.tweens.add({ targets: title, scale: 1, duration: 420, ease: 'Back.out' });
    const waveLabel = o.endless ? this.t('ui.wave_endless', { n: o.wave }) : this.t('ui.wave', { n: o.wave, total: app.data.balance.campaignWaves });
    const reason = won ? '' : this.t(o.reason === 'book_destroyed' ? 'result.reason.book' : 'result.reason.ash');
    addText(this, vw / 2, py + 102, reason ? `${waveLabel} · ${reason}` : waveLabel, 20, { originX: 0.5, originY: 0.5, color: C.textDim, bold: false });

    // stars
    for (let i = 0; i < 3; i++) {
      const on = i < o.stars;
      const st = addArt(this, vw / 2 + (i - 1) * 76, py + 160 - (i === 1 ? 10 : 0), on ? 'ui_star' : 'ui_star_empty', i === 1 ? 1.4 : 1.15);
      if (on) {
        st.setScale(0);
        this.tweens.add({ targets: st, scale: (i === 1 ? 1.4 : 1.15) / this.R, delay: 300 + i * 220, duration: 320, ease: 'Back.out' });
      }
    }

    // gold breakdown
    const colX = px + 60;
    const colW = pw / 2 - 80;
    let y = py + 214;
    addText(this, colX, y, this.t('result.gold'), 24, { color: C.gold });
    y += 62;
    const row = (label: string, value: number, strong = false, note = '') => {
      addText(this, colX, y, label, strong ? 22 : 19, { originY: 0.5, color: strong ? C.text : C.textDim, bold: strong });
      if (note) addText(this, colX, y + 20, note, 13, { originY: 0.5, color: C.green, bold: false });
      addArt(this, colX + colW - 96, y, 'ui_gold', 0.5);
      addNum(this, colX + colW, y, numStr(value), strong ? 28 : 22, true).setOrigin(1, 0.5).setTint(strong ? 0xffd34d : 0xffffff);
      y += note ? 50 : 40;
    };
    row(this.t('result.collected'), o.goldCollected);
    row(this.t('result.uncollected'), o.goldUncollectedKept);
    row(this.t('result.bonus'), o.goldBonus, false, o.firstClear ? this.t('result.first_clear') : '');
    const lg = this.add.graphics();
    lg.lineStyle(2, 0xffffff, 0.25);
    lg.lineBetween(colX, y - 16, colX + colW, y - 16);
    y += 6;
    row(this.t('result.total'), o.goldTotal, true);
    addText(this, colX, y + 4, this.t('result.gold_now', { n: app.profile.gold }), 16, { color: C.textDim, bold: false });

    // unlocks
    const ux = px + pw / 2 + 30;
    let uy = py + 214;
    addText(this, ux, uy, this.t('result.unlocked'), 24, { color: C.gold });
    uy += 66;
    const ids = [...o.unlocks];
    if (o.relicDropped && !ids.includes(o.relicDropped)) ids.push(o.relicDropped);
    if (ids.length === 0) {
      addText(this, ux, uy, this.t('result.no_unlocks'), 18, { color: C.textDim, bold: false });
    }
    for (const id of ids.slice(0, 6)) {
      const d = app.data;
      const sprite = d.units.get(id)?.sprite ?? d.spells.get(id)?.icon ?? d.relics.get(id)?.icon ?? 'ui_up';
      const g = this.add.graphics();
      g.fillStyle(0x0b0810, 0.45);
      g.fillRoundedRect(ux, uy - 27, pw / 2 - 90, 54, 10);
      addIcon(this, ux + 30, uy, d.units.has(id) ? `portrait_${sprite}` : sprite, sprite, 46, 48);
      addText(this, ux + 58, uy, this.unlockName(id), 19, { originY: 0.5 });
      uy += 62;
    }

    // buttons
    const maxWave = app.progression.maxPlayableWave(app.profile);
    const nextOk = won && (o.endless || (o.wave < app.data.balance.campaignWaves && o.wave + 1 <= maxWave));
    const by = 720 - 54;
    const btns: Array<[string, () => void, 'primary' | 'secondary' | 'gold' | 'ghost', string]> = [];
    if (nextOk) btns.push([this.t('ui.next_wave'), () => this.go(SceneKey.PreWave, { wave: o.wave + 1, endless: o.endless } satisfies PreWaveSceneData), 'primary', 'ui_play']);
    btns.push([this.t('ui.retry'), () => this.retry(), nextOk ? 'secondary' : 'primary', 'ui_retry']);
    btns.push([this.t('ui.upgrade'), () => this.go(SceneKey.Shop), 'gold', 'ui_shop']);
    btns.push([this.t('ui.map'), () => this.go(SceneKey.Map), 'ghost', 'ui_map']);
    const bw = Math.min(250, (pw - 30 * (btns.length - 1)) / btns.length);
    const totalW = bw * btns.length + 24 * (btns.length - 1);
    btns.forEach(([label, fn, variant, icon], i) => {
      new Button(this, vw / 2 - totalW / 2 + bw / 2 + i * (bw + 24), by, label, fn, { w: bw, h: 68, variant, size: 24, icon, iconSize: 30 });
    });
  }

  private retry(): void {
    const o = this.args.outcome;
    const data: BattleSceneData = { params: makeWaveParams(this.app, o.wave, o.endless) };
    this.scene.start(SceneKey.Battle, data);
  }
}
