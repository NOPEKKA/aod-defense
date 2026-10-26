import { SceneKey, type BattleSceneData, type PreWaveSceneData } from '../../contracts';
import { makeWaveParams } from '../../core/app';
import { addArt, fitScale } from '../art/atlas';
import { C, addNum, addText, fitText, numStr } from '../style';
import { Button, ScrollArea, panel } from '../ui/widgets';
import { MenuScene } from './MenuScene';

/** Pre-wave: enemy preview, tip, loadout picker (units + spells), Start. */
export class PreWaveScene extends MenuScene<PreWaveSceneData> {
  private units: string[] = [];
  private spells: string[] = [];
  private loadoutObjs: Phaser.GameObjects.GameObject[] = [];
  private unitArea: ScrollArea | null = null;

  constructor() {
    super(SceneKey.PreWave);
  }

  protected build(): void {
    this.unitArea = null;
    this.loadoutObjs = [];
    const app = this.app;
    const { wave, endless } = { wave: this.args.wave ?? 1, endless: this.args.endless ?? false };
    const p = app.profile;
    const slotsU = app.data.balance.loadout.unitSlots;
    const slotsS = app.data.balance.loadout.spellSlots;
    this.units = p.loadout.units.filter((id) => app.progression.isUnitUnlocked(p, id)).slice(0, slotsU);
    this.spells = p.loadout.spells.filter((id) => app.progression.isSpellUnlocked(p, id)).slice(0, slotsS);

    const waveTitle = endless ? this.t('ui.wave_endless', { n: wave }) : this.t('ui.wave', { n: wave, total: app.data.balance.campaignWaves });
    this.header(waveTitle, { label: this.t('ui.map'), to: () => this.go(SceneKey.Map) });

    const vw = this.vw;
    const leftW = 430;
    const lx = Math.max(20, (vw - 1240) / 2);
    const top = 96;
    const bottom = 720 - 100;
    // --- enemy preview panel
    panel(this, lx, top, leftW, bottom - top);
    addText(this, lx + 22, top + 16, this.t('prewave.enemies'), 22, { color: C.gold });
    const plan = app.waves.plan(wave, endless);
    const counts = new Map<string, number>();
    for (const g of plan.groups) counts.set(g.enemy, (counts.get(g.enemy) ?? 0) + g.count);
    let y = top + 60;
    const rowH = 60;
    const level = endless ? undefined : app.data.levels[wave - 1];
    const tip = level?.tipKey ? this.t(level.tipKey) : '';
    const maxRows = Math.max(1, Math.floor((bottom - top - 80 - (tip ? 110 : 10)) / rowH));
    let shown = 0;
    if (plan.bossId) {
      const b = app.data.bosses.get(plan.bossId);
      this.enemyRow(lx + 16, y, leftW - 32, b?.sprite ?? plan.bossId, b ? this.t(b.nameKey) : plan.bossId, '', true, false);
      y += rowH + 6;
      shown++;
    }
    for (const [id, n] of counts) {
      if (shown >= maxRows) {
        addText(this, lx + 22, y + 8, this.t('prewave.more', { n: counts.size - (shown - (plan.bossId ? 1 : 0)) }), 16, { color: C.textDim, bold: false });
        break;
      }
      const def = app.data.enemies.get(id);
      this.enemyRow(lx + 16, y, leftW - 32, def?.sprite ?? id, def ? this.t(def.nameKey) : id, `×${n}`, false, !endless && def?.firstWave === wave);
      y += rowH;
      shown++;
    }
    if (counts.size === 0 && !plan.bossId) addText(this, lx + 22, y, this.t('prewave.no_preview'), 18, { color: C.textDim, bold: false, wrap: leftW - 44 });
    if (tip) {
      const tg = this.add.graphics();
      tg.fillStyle(0x0b0810, 0.5);
      tg.fillRoundedRect(lx + 14, bottom - 116, leftW - 28, 100, 12);
      addArt(this, lx + 40, bottom - 66, 'ui_book', 0.7);
      addText(this, lx + 66, bottom - 108, this.t('prewave.tip'), 15, { color: C.gold });
      const tt = addText(this, lx + 66, bottom - 86, tip, 15, { bold: false, wrap: leftW - 100 });
      if (tt.height > 70) tt.setFontSize(13);
    }

    // --- loadout panel
    const rx = lx + leftW + 20;
    const rw = Math.min(vw - rx - 20, 800);
    panel(this, rx, top, rw, bottom - top);
    this.drawLoadout(rx, top, rw, bottom - top);

    // --- start
    new Button(this, rx + rw - 150, 720 - 50, this.t('prewave.start'), () => this.start(wave, endless), {
      w: 280, h: 72, variant: 'primary', size: 30, icon: 'ui_play',
    });
    new Button(this, rx + rw - 410, 720 - 50, this.t('ui.upgrade'), () => this.go(SceneKey.Shop), { w: 200, h: 64, variant: 'gold', size: 22, icon: 'ui_shop', iconSize: 30 });
  }

  private enemyRow(x: number, y: number, w: number, sprite: string, name: string, count: string, boss: boolean, isNew: boolean): void {
    const g = this.add.graphics();
    g.fillStyle(boss ? 0x5a1a2a : 0x2c2238, 0.9);
    g.fillRoundedRect(x, y, w, boss ? 58 : 54, 10);
    const s = fitScale(sprite, 50, boss ? 56 : 52, 1, boss ? 'boss' : 'enemy');
    const img = addArt(this, x + 32, y + (boss ? 57 : 53), sprite, s, boss ? 'boss' : 'enemy');
    img.setOrigin(0.5, 1);
    const nameT = addText(this, x + 66, y + (boss ? 29 : 27), name, boss ? 20 : 18, { originY: 0.5, color: boss ? '#ff9aaa' : C.text });
    fitText(nameT, w - 66 - 90, 12);
    if (boss) addArt(this, x + w - 30, y + 29, 'ui_skull', 0.7);
    if (count) addNum(this, x + w - 14, y + 27, count, 22, true).setOrigin(1, 0.5);
    if (isNew) {
      const badgeX = x + 66 + nameT.width + 8;
      const bg = this.add.graphics();
      bg.fillStyle(0xd9a52a, 1);
      bg.fillRoundedRect(badgeX, y + 15, 52, 24, 8);
      addText(this, badgeX + 26, y + 27, this.t('prewave.new'), 13, { originX: 0.5, originY: 0.5, color: '#2a1a08', stroke: 0 });
    }
  }

  private drawLoadout(x: number, y: number, w: number, h: number): void {
    for (const o of this.loadoutObjs) o.destroy();
    this.loadoutObjs = [];
    const app = this.app;
    const p = app.profile;
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => (this.loadoutObjs.push(o), o);
    const slotsU = app.data.balance.loadout.unitSlots;
    const slotsS = app.data.balance.loadout.spellSlots;

    keep(addText(this, x + 22, y + 16, this.t('prewave.units', { n: this.units.length, max: slotsU }), 22, { color: C.gold }));
    keep(addText(this, x + w - 22, y + 20, this.t('prewave.pick_hint'), 15, { originX: 1, color: C.textDim, bold: false }));
    const cardW = 104;
    const cardH = 118;
    const gap = 10;
    const cols = Math.max(1, Math.floor((w - 40 + gap) / (cardW + gap)));
    const allUnits = [...app.data.units.values()];
    const rows = Math.ceil(allUnits.length / cols);
    const areaTop = y + 56;
    const areaH = Math.min(rows * (cardH + gap), h - 56 - 190);
    if (!this.unitArea) {
      this.unitArea = new ScrollArea(this, { x: x + 20, y: areaTop, w: w - 40, h: areaH });
    }
    const area = this.unitArea;
    area.content.removeAll(true);
    allUnits.forEach((u, i) => {
      const cx = (i % cols) * (cardW + gap);
      const cy = Math.floor(i / cols) * (cardH + gap);
      const unlocked = app.progression.isUnitUnlocked(p, u.id);
      const sel = this.units.indexOf(u.id);
      this.card(area, cx, cy, cardW, cardH, u.sprite, this.t(u.nameKey), unlocked, sel, u.kind === 'hero', unlocked ? `${u.ironCost}` : this.t('prewave.unlock_at', { n: u.unlockWave }), 'iron', () => {
        const idx = this.units.indexOf(u.id);
        if (idx >= 0) this.units.splice(idx, 1);
        else if (this.units.length < slotsU) this.units.push(u.id);
        else return;
        this.saveLoadout();
        this.drawLoadout(x, y, w, h);
      });
    });
    area.setContentHeight(rows * (cardH + gap));

    // spells
    const sy = areaTop + areaH + 14;
    keep(addText(this, x + 22, sy, this.t('prewave.spells', { n: this.spells.length, max: slotsS }), 22, { color: C.gold }));
    const allSpells = [...app.data.spells.values()];
    const sw = 92;
    const scols = Math.max(1, Math.floor((w - 40 + gap) / (sw + gap)));
    allSpells.slice(0, scols).forEach((s, i) => {
      const unlocked = app.progression.isSpellUnlocked(p, s.id);
      const sel = this.spells.indexOf(s.id);
      keep(this.spellCard(x + 20 + i * (sw + gap), sy + 40, sw, 112, s.icon, this.t(s.nameKey), unlocked, sel, unlocked ? `${s.mana}` : this.t('prewave.unlock_at', { n: s.unlockWave }), () => {
        const idx = this.spells.indexOf(s.id);
        if (idx >= 0) this.spells.splice(idx, 1);
        else if (this.spells.length < slotsS) this.spells.push(s.id);
        else this.spells[this.spells.length - 1] = s.id;
        this.saveLoadout();
        this.drawLoadout(x, y, w, h);
      }));
    });
  }

  private card(area: ScrollArea, x: number, y: number, w: number, h: number, sprite: string, name: string, unlocked: boolean, sel: number, hero: boolean, sub: string, costIcon: string, onTap: () => void): void {
    const c = this.add.container(x + w / 2, y + h / 2);
    const g = this.add.graphics();
    const selected = sel >= 0;
    g.fillStyle(0x0b0810, 0.45);
    g.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 12);
    g.fillStyle(!unlocked ? 0x241e2c : selected ? 0x2f5a46 : hero ? 0x4a3a1c : 0x2c2238, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.lineStyle(3, selected ? 0x7ee07a : hero ? 0xffd34d : C.inkN, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    c.add(g);
    const img = addArt(this, 0, h / 2 - 40, sprite, fitScale(sprite, w - 22, h - 52, 1, 'ally'), 'ally');
    img.setOrigin(0.5, 1);
    if (!unlocked) img.setTint(0x222026).setAlpha(0.8);
    c.add(img);
    const nameT = addText(this, 0, h / 2 - 30, name, 14, { originX: 0.5, originY: 0.5, color: unlocked ? C.text : C.textDim });
    fitText(nameT, w - 8, 10);
    c.add(nameT);
    if (unlocked) {
      c.add(addArt(this, -12, h / 2 - 11, costIcon === 'iron' ? 'ui_iron' : 'ui_mana', 0.36));
      c.add(addNum(this, -2, h / 2 - 11, sub, 15).setOrigin(0, 0.5));
    } else {
      c.add(addArt(this, 0, -12, 'ui_lock', 0.7));
      const lt = addText(this, 0, h / 2 - 11, sub, 12, { originX: 0.5, originY: 0.5, color: C.textDim, bold: false });
      fitText(lt, w - 8, 9);
      c.add(lt);
    }
    if (selected) {
      const b = this.add.graphics();
      b.fillStyle(0x2f9a52, 1);
      b.fillCircle(w / 2 - 14, -h / 2 + 14, 13);
      b.lineStyle(2.5, C.inkN, 1);
      b.strokeCircle(w / 2 - 14, -h / 2 + 14, 13);
      c.add(b);
      c.add(addNum(this, w / 2 - 14, -h / 2 + 14, numStr(sel + 1), 16).setOrigin(0.5, 0.5));
    }
    area.content.add(c);
    if (!unlocked) return;
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.94));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      c.setScale(1);
      if (area.guard(ptr)) onTap();
    });
  }

  private spellCard(x: number, y: number, w: number, h: number, icon: string, name: string, unlocked: boolean, sel: number, sub: string, onTap: () => void): Phaser.GameObjects.Container {
    const c = this.add.container(x + w / 2, y + h / 2);
    const g = this.add.graphics();
    const selected = sel >= 0;
    g.fillStyle(!unlocked ? 0x241e2c : selected ? 0x2f5a46 : 0x2c2238, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.lineStyle(3, selected ? 0x7ee07a : C.inkN, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    c.add(g);
    const img = addArt(this, 0, -h / 2 + 36, icon, 0.72);
    if (!unlocked) img.setTint(0x333038);
    c.add(img);
    const nameT = addText(this, 0, h / 2 - 30, name, 13, { originX: 0.5, originY: 0.5, color: unlocked ? C.text : C.textDim });
    fitText(nameT, w - 6, 9);
    c.add(nameT);
    if (unlocked) {
      c.add(addArt(this, -12, h / 2 - 11, 'ui_mana', 0.36));
      c.add(addNum(this, -2, h / 2 - 11, sub, 15).setOrigin(0, 0.5));
    } else {
      c.add(addArt(this, 0, -h / 2 + 36, 'ui_lock', 0.6));
      const lt = addText(this, 0, h / 2 - 11, sub, 12, { originX: 0.5, originY: 0.5, color: C.textDim, bold: false });
      fitText(lt, w - 6, 9);
      c.add(lt);
    }
    if (selected) {
      const b = this.add.graphics();
      b.fillStyle(0x2f9a52, 1);
      b.fillCircle(w / 2 - 12, -h / 2 + 12, 12);
      b.lineStyle(2.5, C.inkN, 1);
      b.strokeCircle(w / 2 - 12, -h / 2 + 12, 12);
      c.add(b);
      c.add(addNum(this, w / 2 - 12, -h / 2 + 12, ['Q', 'E', 'R'][sel] ?? numStr(sel + 1), 15).setOrigin(0.5, 0.5));
    }
    if (unlocked) {
      c.setSize(w, h);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => c.setScale(0.94));
      c.on('pointerout', () => c.setScale(1));
      c.on('pointerup', () => {
        c.setScale(1);
        onTap();
      });
    }
    return c;
  }

  private saveLoadout(): void {
    const p = this.app.profile;
    p.loadout = { units: [...this.units], spells: [...this.spells] };
    this.app.commitProfile();
  }

  private start(wave: number, endless: boolean): void {
    this.saveLoadout();
    const data: BattleSceneData = { params: makeWaveParams(this.app, wave, endless) };
    this.scene.start(SceneKey.Battle, data);
  }

  protected rebuild(): void {
    this.unitArea = null;
    this.loadoutObjs = [];
    super.rebuild();
  }
}
