import { SceneKey, type BattleSceneData, type PreWaveSceneData } from '../../contracts';
import { makeWaveParams } from '../../core/app';
import { C, addNum, addText, fitText, numStr } from '../style';
import { KIT, addIcon, divider, inkRule, kitImage } from '../ui/skin';
import { Button, ScrollArea, panel } from '../ui/widgets';
import { MenuScene } from './MenuScene';


/**
 * Pre-wave: two ledger pages. Left, the bestiary of what is coming (boss first, new foes
 * marked) and a tip; right, the muster roll: oak unit boards (silver cost) and spell rings
 * (mana cost), picked order stamped with a wax seal. Start / Upgrade below.
 */
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
    const leftW = 420;
    const lx = Math.max(20, (vw - 1240) / 2);
    const top = 92;
    const bottom = 720 - 92;
    // --- bestiary page
    panel(this, lx, top, leftW, bottom - top);
    addText(this, lx + leftW / 2, top + 34, this.t('prewave.enemies'), 26, { originX: 0.5, originY: 0.5, color: C.rubric, font: 'head' });
    divider(this, lx + leftW / 2, top + 58, leftW - 90);
    const plan = app.waves.plan(wave, endless);
    const counts = new Map<string, number>();
    for (const g of plan.groups) counts.set(g.enemy, (counts.get(g.enemy) ?? 0) + g.count);
    let y = top + 74;
    const rowH = 56;
    const level = endless ? undefined : app.data.levels[wave - 1];
    const tip = level?.tipKey ? this.t(level.tipKey) : '';
    const maxRows = Math.max(1, Math.floor((bottom - top - 100 - (tip ? 120 : 20)) / rowH));
    let shown = 0;
    const rules = this.add.graphics();
    if (plan.bossId) {
      const b = app.data.bosses.get(plan.bossId);
      this.enemyRow(lx + 26, y, leftW - 52, b?.sprite ?? plan.bossId, b ? this.t(b.nameKey) : plan.bossId, '', true, false);
      y += rowH + 8;
      shown++;
    }
    for (const [id, n] of counts) {
      if (shown >= maxRows) {
        addText(this, lx + 30, y + 8, this.t('prewave.more', { n: counts.size - (shown - (plan.bossId ? 1 : 0)) }), 16, { color: C.inkSoft, bold: false });
        break;
      }
      const def = app.data.enemies.get(id);
      this.enemyRow(lx + 26, y, leftW - 52, def?.sprite ?? id, def ? this.t(def.nameKey) : id, `×${n}`, false, !endless && def?.firstWave === wave);
      y += rowH;
      inkRule(rules, lx + 30, y - 4, lx + leftW - 30, 0.18);
      shown++;
    }
    if (counts.size === 0 && !plan.bossId) addText(this, lx + 30, y, this.t('prewave.no_preview'), 18, { color: C.inkSoft, bold: false, wrap: leftW - 60 });
    if (tip) {
      const tg = this.add.graphics();
      tg.fillStyle(0x6a4a24, 0.12);
      tg.fillRoundedRect(lx + 24, bottom - 128, leftW - 48, 104, 6);
      tg.lineStyle(1.5, C.inkN, 0.25);
      tg.strokeRoundedRect(lx + 24, bottom - 128, leftW - 48, 104, 6);
      addIcon(this, lx + 54, bottom - 76, 'ui_book', 'ui_book', 40);
      addText(this, lx + 82, bottom - 120, this.t('prewave.tip'), 17, { color: C.rubric, font: 'head' });
      const tt = addText(this, lx + 82, bottom - 96, tip, 15, { bold: false, wrap: leftW - 124, color: C.ink });
      if (tt.height > 70) tt.setFontSize(13);
    }

    // --- muster page
    const rx = lx + leftW + 18;
    const rw = Math.min(vw - rx - 20, 820);
    panel(this, rx, top, rw, bottom - top);
    this.drawLoadout(rx, top, rw, bottom - top);

    // --- start
    new Button(this, rx + rw - 150, 720 - 46, this.t('prewave.start'), () => this.start(wave, endless), {
      w: 290, h: 70, variant: 'primary', size: 32, icon: 'ui_play', head: true,
    });
    new Button(this, rx + rw - 410, 720 - 46, this.t('ui.upgrade'), () => this.go(SceneKey.Shop), { w: 210, h: 60, variant: 'gold', size: 22, icon: 'ui_shop', iconSize: 30, head: true });
  }

  private enemyRow(x: number, y: number, w: number, sprite: string, name: string, count: string, boss: boolean, isNew: boolean): void {
    const h = boss ? 60 : 50;
    if (boss) {
      const g = this.add.graphics();
      g.fillStyle(C.rubricN, 0.14);
      g.fillRoundedRect(x - 6, y - 2, w + 12, h + 4, 6);
      g.lineStyle(1.5, C.rubricN, 0.5);
      g.strokeRoundedRect(x - 6, y - 2, w + 12, h + 4, 6);
    }
    // portrait in an inked roundel
    const pg = this.add.graphics();
    pg.fillStyle(0x2a1a10, 0.85);
    pg.fillCircle(x + 26, y + h / 2, boss ? 27 : 23);
    pg.lineStyle(2, boss ? C.rubricN : C.inkN, 0.9);
    pg.strokeCircle(x + 26, y + h / 2, boss ? 29 : 25);
    addIcon(this, x + 26, y + h / 2, `portrait_${sprite}`, sprite, boss ? 52 : 44, boss ? 52 : 44);
    const nameT = addText(this, x + 62, y + h / 2, name, boss ? 21 : 18, { originY: 0.5, color: boss ? C.rubric : C.ink, font: boss ? 'head' : 'body' });
    fitText(nameT, w - 62 - 80, 12);
    if (boss) kitImage(this, 'seal_black', x + w - 22, y + h / 2, 44, 44);
    if (count) addText(this, x + w - 4, y + h / 2, count, 22, { originX: 1, originY: 0.5, color: C.ink, font: 'head' });
    if (isNew) {
      const badgeX = x + 62 + nameT.width + 10;
      const t = addText(this, badgeX, y + h / 2, this.t('prewave.new'), 13, { originY: 0.5, color: C.rubric });
      const g = this.add.graphics();
      g.lineStyle(1.5, C.rubricN, 0.85);
      g.strokeRoundedRect(badgeX - 6, y + h / 2 - 11, t.width + 12, 22, 4);
      t.setAngle(-4);
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

    keep(addText(this, x + 34, y + 20, this.t('prewave.units', { n: this.units.length, max: slotsU }), 24, { color: C.rubric, font: 'head' }));
    keep(addText(this, x + w - 34, y + 28, this.t('prewave.pick_hint'), 15, { originX: 1, color: C.inkSoft, bold: false }));
    const cardW = 96;
    const cardH = 110;
    const gap = 10;
    const areaX = x + 32;
    const areaW = w - 72;
    const cols = Math.max(1, Math.floor((areaW + gap) / (cardW + gap)));
    const allUnits = [...app.data.units.values()];
    const rows = Math.ceil(allUnits.length / cols);
    const areaTop = y + 62;
    const areaH = Math.min(rows * (cardH + gap), h - 62 - 196);
    if (!this.unitArea) {
      this.unitArea = new ScrollArea(this, { x: areaX, y: areaTop, w: areaW, h: areaH });
    }
    const area = this.unitArea;
    area.content.removeAll(true);
    allUnits.forEach((u, i) => {
      const cx = (i % cols) * (cardW + gap);
      const cy = Math.floor(i / cols) * (cardH + gap);
      const unlocked = app.progression.isUnitUnlocked(p, u.id);
      const sel = this.units.indexOf(u.id);
      this.card(area, cx, cy, cardW, cardH, u.sprite, this.t(u.nameKey), unlocked, sel, u.kind === 'hero', unlocked ? `${u.ironCost}` : this.t('prewave.unlock_at', { n: u.unlockWave }), () => {
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
    const sy = areaTop + areaH + 12;
    const rg = keep(this.add.graphics());
    inkRule(rg, x + 34, sy, x + w - 34, 0.3);
    keep(addText(this, x + 34, sy + 8, this.t('prewave.spells', { n: this.spells.length, max: slotsS }), 24, { color: C.rubric, font: 'head' }));
    const allSpells = [...app.data.spells.values()];
    const sw = 84;
    const scols = Math.max(1, Math.floor((areaW + gap) / (sw + gap)));
    allSpells.slice(0, scols).forEach((s, i) => {
      const unlocked = app.progression.isSpellUnlocked(p, s.id);
      const sel = this.spells.indexOf(s.id);
      const locked = !unlocked && s.tree && app.progression.isSpellUnlocked({ ...p, spellTiers: { ...p.spellTiers, [s.id]: { tier: 1 } } }, s.id);
      const sub = unlocked ? `${s.mana}` : locked ? this.t('shop.tree.not_learned') : this.t('prewave.unlock_at', { n: s.unlockWave });
      keep(this.spellCard(areaX + i * (sw + gap), sy + 46, sw, 112, s.icon, this.t(s.nameKey), unlocked, sel, sub, () => {
        const idx = this.spells.indexOf(s.id);
        if (idx >= 0) this.spells.splice(idx, 1);
        else if (this.spells.length < slotsS) this.spells.push(s.id);
        else this.spells[this.spells.length - 1] = s.id;
        this.saveLoadout();
        this.drawLoadout(x, y, w, h);
      }));
    });
  }

  /** order stamp: red wax seal with a number / key */
  private seal(c: Phaser.GameObjects.Container, x: number, y: number, label: string): void {
    c.add(this.add.image(x, y, KIT, 'seal_red').setDisplaySize(30, 30).setAngle(-8));
    c.add(addText(this, x, y - 1, label, 15, { originX: 0.5, originY: 0.5, color: '#f6e2c0', font: 'head', stroke: 1 }));
  }

  private card(area: ScrollArea, x: number, y: number, w: number, h: number, sprite: string, name: string, unlocked: boolean, sel: number, hero: boolean, sub: string, onTap: () => void): void {
    const c = this.add.container(x + w / 2, y + h / 2);
    const selected = sel >= 0;
    const board = this.add.image(0, 0, KIT, 'slot_unit').setDisplaySize(w, h);
    if (!unlocked) board.setTint(0x6a5a50);
    c.add(board);
    if (hero && unlocked) {
      const g = this.add.graphics();
      g.lineStyle(2, 0xe9c463, 0.8);
      g.strokeRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h * 0.63, 4);
      c.add(g);
    }
    const img = addIcon(this, 0, -h * 0.1, `portrait_${sprite}`, sprite, w * 0.8, h * 0.6);
    if (!unlocked) img.setTint(0x1a1412).setAlpha(0.85);
    c.add(img);
    // name on a vellum tag across the bottom of the portrait well
    const tag = this.add.graphics();
    tag.fillStyle(0xe8d6ac, unlocked ? 0.92 : 0.6);
    tag.fillRect(-w / 2 + 7, h * 0.14, w - 14, 16);
    c.add(tag);
    const nameT = addText(this, 0, h * 0.14 + 8, name, 12, { originX: 0.5, originY: 0.5, color: C.ink });
    fitText(nameT, w - 18, 9);
    c.add(nameT);
    if (unlocked) {
      c.add(kitImage(this, 'coin_silver', -12, h * 0.34, 16, 16));
      c.add(addNum(this, -2, h * 0.34, sub, 15).setOrigin(0, 0.5).setTint(0xe4eaf0));
    } else {
      c.add(addIcon(this, 0, -h * 0.14, 'ui_lock', 'ui_lock', 30));
      const lt = addText(this, 0, h * 0.34, sub, 11, { originX: 0.5, originY: 0.5, color: C.textDim, bold: false });
      fitText(lt, w - 20, 8);
      c.add(lt);
    }
    if (selected) {
      const g = this.add.graphics();
      g.lineStyle(3, C.rubricN, 1);
      g.strokeRoundedRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, 8);
      c.addAt(g, 0);
      this.seal(c, w / 2 - 12, -h / 2 + 12, numStr(sel + 1));
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
    const selected = sel >= 0;
    const ring = this.add.image(0, -h / 2 + 34, KIT, 'ring_small').setDisplaySize(68, 68);
    if (!unlocked) ring.setTint(0x8a7a70);
    c.add(ring);
    const img = addIcon(this, 0, -h / 2 + 34, icon, icon, 48, 48);
    if (!unlocked) img.setTint(0x3a3430);
    c.add(img);
    const nameT = addText(this, 0, h / 2 - 34, name, 13, { originX: 0.5, originY: 0.5, color: unlocked ? C.ink : C.inkSoft });
    fitText(nameT, w + 4, 9);
    c.add(nameT);
    if (unlocked) {
      c.add(addIcon(this, -10, h / 2 - 13, 'ui_mana', 'ui_mana', 16));
      c.add(addNum(this, 0, h / 2 - 13, sub, 15).setOrigin(0, 0.5).setTint(0x2a4a7a));
    } else {
      c.add(addIcon(this, 0, -h / 2 + 34, 'ui_lock', 'ui_lock', 26));
      const lt = addText(this, 0, h / 2 - 13, sub, 11, { originX: 0.5, originY: 0.5, color: C.inkSoft, bold: false });
      fitText(lt, w + 2, 8);
      c.add(lt);
    }
    if (selected) {
      const g = this.add.graphics();
      g.lineStyle(3, C.rubricN, 0.9);
      g.strokeCircle(0, -h / 2 + 34, 37);
      c.addAt(g, 0);
      this.seal(c, w / 2 - 10, -h / 2 + 8, ['Q', 'E', 'R'][sel] ?? numStr(sel + 1));
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

