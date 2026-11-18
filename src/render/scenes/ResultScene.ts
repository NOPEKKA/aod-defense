import { SceneKey, type BattleSceneData, type PreWaveSceneData, type ResultSceneData } from '../../contracts';
import { makeWaveParams, tryRuntime } from '../../core/app';
import { addIcon, divider, inkRule, kitImage, ribbon } from '../ui/skin';
import { C, addText, gildText, numStr } from '../style';
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
    const py = 56;
    const ph = 720 - py - 104;
    panel(this, px, py, pw, ph, undefined, undefined, undefined, { tint: won ? 0xffffff : 0xe6d2c0 });

    // the verdict on a banner across the top of the page
    const title = addText(this, vw / 2, py - 2, this.t(won ? 'ui.victory' : 'ui.defeat'), 54, { originX: 0.5, originY: 0.5, color: won ? C.gold : '#f1dcc8', font: 'head', stroke: 2, shadow: true });
    const rb = ribbon(this, vw / 2, py, title.width + 40);
    if (!won) rb.setTint(0x6a5a58);
    title.setDepth(2);
    if (won) gildText(title);
    title.setScale(0.6);
    this.tweens.add({ targets: title, scale: 1, duration: 420, ease: 'Back.out' });
    const waveLabel = o.endless ? this.t('ui.wave_endless', { n: o.wave }) : this.t('ui.wave', { n: o.wave, total: app.data.balance.campaignWaves });
    const reason = won ? '' : this.t(o.reason === 'book_destroyed' ? 'result.reason.book' : 'result.reason.ash');
    addText(this, vw / 2, py + 62, reason ? `${waveLabel} · ${reason}` : waveLabel, 19, { originX: 0.5, originY: 0.5, color: C.inkSoft, bold: false });

    // stars, struck in gold (empty ones are inked outlines)
    for (let i = 0; i < 3; i++) {
      const on = i < o.stars;
      const size = i === 1 ? 70 : 56;
      const st = kitImage(this, on ? 'star_gold' : 'star_ink', vw / 2 + (i - 1) * 74, py + 118 - (i === 1 ? 8 : 0), size, size);
      if (on) {
        const sc = st.scaleX;
        st.setScale(0);
        this.tweens.add({ targets: st, scale: sc, delay: 300 + i * 220, duration: 320, ease: 'Back.out' });
      }
    }
    divider(this, vw / 2, py + 166, 420);

    // gold ledger
    const colX = px + 64;
    const colW = pw / 2 - 96;
    let y = py + 188;
    addText(this, colX, y, this.t('result.gold'), 24, { color: C.rubric, font: 'head' });
    y += 58;
    const row = (label: string, value: number, strong = false, note = '') => {
      addText(this, colX, y, label, strong ? 21 : 18, { originY: 0.5, color: strong ? C.ink : C.inkSoft, bold: strong });
      if (note) addText(this, colX, y + 20, note, 13, { originY: 0.5, color: C.greenInk, bold: false });
      const n = addText(this, colX + colW, y, numStr(value), strong ? 26 : 20, { originX: 1, originY: 0.5, color: strong ? '#7a4e08' : C.ink, font: strong ? 'head' : 'body' });
      kitImage(this, 'coin_gold', colX + colW - n.width - 14, y, strong ? 26 : 22, strong ? 26 : 22);
      y += note ? 50 : 38;
    };
    row(this.t('result.collected'), o.goldCollected);
    row(this.t('result.uncollected'), o.goldUncollectedKept);
    row(this.t('result.bonus'), o.goldBonus, false, o.firstClear ? this.t('result.first_clear') : '');
    const lg = this.add.graphics();
    inkRule(lg, colX, y - 16, colX + colW, 0.45);
    y += 6;
    row(this.t('result.total'), o.goldTotal, true);
    addText(this, colX, y + 2, this.t('result.gold_now', { n: app.profile.gold }), 15, { color: C.inkSoft, bold: false });

    // unlocks
    const ux = px + pw / 2 + 34;
    let uy = py + 188;
    lg.lineStyle(1.5, C.inkN, 0.2);
    lg.lineBetween(px + pw / 2, py + 196, px + pw / 2, py + ph - 40);
    addText(this, ux, uy, this.t('result.unlocked'), 24, { color: C.rubric, font: 'head' });
    uy += 64;
    const ids = [...o.unlocks];
    if (o.relicDropped && !ids.includes(o.relicDropped)) ids.push(o.relicDropped);
    if (ids.length === 0) {
      addText(this, ux, uy - 10, this.t('result.no_unlocks'), 17, { color: C.inkSoft, bold: false });
    }
    for (const id of ids.slice(0, 5)) {
      const d = app.data;
      const sprite = d.units.get(id)?.sprite ?? d.spells.get(id)?.icon ?? d.relics.get(id)?.icon ?? 'ui_up';
      const g = this.add.graphics();
      g.fillStyle(0x2a1a10, 0.85);
      g.fillCircle(ux + 26, uy, 24);
      g.lineStyle(2, C.inkN, 0.8);
      g.strokeCircle(ux + 26, uy, 26);
      addIcon(this, ux + 26, uy, d.units.has(id) ? `portrait_${sprite}` : sprite, sprite, 44, 44);
      addText(this, ux + 62, uy, this.unlockName(id), 19, { originY: 0.5, color: C.ink });
      uy += 60;
    }

    // online guest: the host decides what comes next; wait in the lobby
    if (tryRuntime()?.modules.net?.role === 'guest') {
      new Button(this, vw / 2, 720 - 50, this.t('lobby.continue'), () => this.go(SceneKey.Lobby), { w: 320, h: 64, variant: 'primary', size: 23, icon: 'ui_play', iconSize: 28, head: true });
      return;
    }

    // buttons
    const maxWave = app.progression.maxPlayableWave(app.profile);
    const nextOk = won && (o.endless || (o.wave < app.data.balance.campaignWaves && o.wave + 1 <= maxWave));
    const by = 720 - 50;
    const btns: Array<[string, () => void, 'primary' | 'secondary' | 'gold' | 'ghost', string]> = [];
    if (nextOk) btns.push([this.t('ui.next_wave'), () => this.go(SceneKey.PreWave, { wave: o.wave + 1, endless: o.endless } satisfies PreWaveSceneData), 'primary', 'ui_play']);
    btns.push([this.t('ui.retry'), () => this.retry(), nextOk ? 'secondary' : 'primary', 'ui_retry']);
    btns.push([this.t('ui.upgrade'), () => this.go(SceneKey.Shop), 'gold', 'ui_shop']);
    btns.push([this.t('ui.map'), () => this.go(SceneKey.Map), 'ghost', 'ui_map']);
    const bw = Math.min(250, (pw - 30 * (btns.length - 1)) / btns.length);
    const totalW = bw * btns.length + 24 * (btns.length - 1);
    btns.forEach(([label, fn, variant, icon], i) => {
      new Button(this, vw / 2 - totalW / 2 + bw / 2 + i * (bw + 24), by, label, fn, { w: bw, h: 64, variant: variant === 'ghost' ? 'secondary' : variant, size: 23, icon, iconSize: 28, head: true });
    });
  }

  private retry(): void {
    const o = this.args.outcome;
    const data: BattleSceneData = { params: makeWaveParams(this.app, o.wave, o.endless) };
    this.scene.start(SceneKey.Battle, data);
  }
}
