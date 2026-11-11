/**
 * Battle HUD. Draws ONLY at core/layout rects (controls hit-tests the same
 * rects) and reacts to ui:* events for pressed feedback. Numbers use the atlas
 * bitmap fonts; Thai labels are Text objects that only change on wave start or
 * language change. Graphics layers are redrawn per frame without allocations.
 */
import type { BattleRenderer, EntityState, EventBus, GameEvents, HudLayout, Rect, RenderView, Unsubscribe } from '../../contracts';
import { findEntity } from '../../core/world';
import { applyFrame, atlasScale, spriteFrame } from '../art/atlas';
import { FONT_L, FONT_S } from '../art/build';
import { C, addText, clamp01, numStr } from '../style';
import { PauseMenu } from './PauseMenu';

const D_STATIC = 3000;
const D_UNDER = 3005;
const D_ICON = 3010;
const D_OVER = 3020;
const D_NUM = 3030;
const D_BANNER = 3100;

interface SlotUi {
  icon: Phaser.GameObjects.Image;
  costIcon: Phaser.GameObjects.Image;
  cost: Phaser.GameObjects.BitmapText;
  cd: Phaser.GameObjects.BitmapText;
  key: Phaser.GameObjects.BitmapText;
  shown: string;
  lastCost: number;
  lastCd: number;
  baseScale: number;
}

const SPELL_KEYS = ['Q', 'E', 'R'];
const TAU = Math.PI * 2;

export class HudRenderer implements BattleRenderer {
  readonly id = 'hud';
  private scene!: Phaser.Scene;
  private view!: RenderView;
  private layout!: HudLayout;
  private R = 1;
  private unsubs: Unsubscribe[] = [];
  private gStatic!: Phaser.GameObjects.Graphics;
  private gUnder!: Phaser.GameObjects.Graphics;
  private gOver!: Phaser.GameObjects.Graphics;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private ashIcon!: Phaser.GameObjects.Image;
  private bookIcon!: Phaser.GameObjects.Image;
  private ashNum!: Phaser.GameObjects.BitmapText;
  private bookNum!: Phaser.GameObjects.BitmapText;
  private waveText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private remainIcon!: Phaser.GameObjects.Image;
  private remainNum!: Phaser.GameObjects.BitmapText;
  private goldIcon!: Phaser.GameObjects.Image;
  private goldNum!: Phaser.GameObjects.BitmapText;
  private speedIcon!: Phaser.GameObjects.Image;
  private speedNum!: Phaser.GameObjects.BitmapText;
  private pauseIcon!: Phaser.GameObjects.Image;
  private pauseHint!: Phaser.GameObjects.BitmapText;
  private speedHint!: Phaser.GameObjects.BitmapText;
  private ironIcon!: Phaser.GameObjects.Image;
  private ironNum!: Phaser.GameObjects.BitmapText;
  private ironMax!: Phaser.GameObjects.BitmapText;
  private units: SlotUi[] = [];
  private spells: SlotUi[] = [];
  private dodgeIcon!: Phaser.GameObjects.Image;
  private dodgeHint!: Phaser.GameObjects.BitmapText;
  private cancelIcon!: Phaser.GameObjects.Image;
  private fpsText!: Phaser.GameObjects.BitmapText;
  private banner!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private bannerT = 0;
  private bannerMax = 0;
  private pause!: PauseMenu;
  private showKeys = true;
  private sig = -1;
  private clock = 0;
  private pressUnit: boolean[] = [];
  private pressSpell: boolean[] = [];
  private pressDodge = false;
  private pressPause = false;
  private pressSpeed = false;
  private pressCancel = false;
  private denyUnit: number[] = [];
  private denySpell: number[] = [];
  private goldBump = 0;
  private bookFlash = 0;
  private last = { ash: -1, ashMax: -1, book: -1, gold: -1, iron: -1, ironMax: -1, remain: -1 };
  private ft = new Float32Array(60);
  private ftIdx = 0;
  private fpsTimer = 0;
  private outcomeShown = false;

  create(scene: Phaser.Scene, view: RenderView, bus: EventBus): void {
    this.scene = scene;
    this.view = view;
    this.layout = view.layout;
    this.R = atlasScale();
    try {
      this.showKeys = window.matchMedia ? window.matchMedia('(pointer: fine)').matches : true;
    } catch {
      this.showKeys = true;
    }
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      this.objs.push(o);
      return o;
    };
    this.gStatic = keep(scene.add.graphics().setDepth(D_STATIC));
    this.gUnder = keep(scene.add.graphics().setDepth(D_UNDER));
    this.gOver = keep(scene.add.graphics().setDepth(D_OVER));
    const icon = (key: string) => keep(this.img(key));
    const num = (large: boolean, size: number) => keep(scene.add.bitmapText(0, 0, large ? FONT_L : FONT_S, '', size).setDepth(D_NUM));

    this.ashIcon = icon('ui_ash');
    this.bookIcon = icon('ui_book');
    this.ashNum = num(false, 14).setOrigin(1, 0.5);
    this.bookNum = num(false, 14).setOrigin(1, 0.5);
    this.waveText = keep(addText(scene, 0, 0, '', 15, { originY: 0.5 }).setDepth(D_NUM));
    this.bossText = keep(addText(scene, 0, 0, '', 15, { originY: 0.5, color: '#ffd8e0' }).setDepth(D_NUM));
    this.remainIcon = icon('ui_skull');
    this.remainNum = num(false, 14).setOrigin(1, 0.5);
    this.goldIcon = icon('ui_gold');
    this.goldNum = num(true, 26).setOrigin(0, 0.5);
    this.speedIcon = icon('ui_speed');
    this.speedNum = num(false, 13).setOrigin(0.5, 0.5);
    this.pauseIcon = icon('ui_pause');
    this.pauseHint = num(false, 11).setOrigin(0, 0).setText('P');
    this.speedHint = num(false, 11).setOrigin(0, 0).setText('F');
    this.ironIcon = icon('ui_iron');
    this.ironNum = num(true, 28).setOrigin(0, 0.5);
    this.ironMax = num(false, 14).setOrigin(0, 0.5);
    for (let i = 0; i < view.layout.unitSlots.length; i++) {
      this.units.push(this.makeSlot(keep, String(i + 1), 'ui_iron'));
      this.pressUnit.push(false);
      this.denyUnit.push(0);
    }
    for (let i = 0; i < view.layout.spellButtons.length; i++) {
      this.spells.push(this.makeSlot(keep, SPELL_KEYS[i] ?? '', 'ui_mana'));
      this.pressSpell.push(false);
      this.denySpell.push(0);
    }
    this.dodgeIcon = icon('ui_dodge');
    this.dodgeHint = num(false, 11).setOrigin(0.5, 0).setText('SPACE');
    this.cancelIcon = icon('ui_cancel');
    this.fpsText = num(false, 14).setOrigin(0, 0);
    this.banner = keep(addText(scene, 0, 0, '', 44, { originX: 0.5, originY: 0.5, stroke: 8, align: 'center' }).setDepth(D_BANNER));
    this.bannerSub = keep(addText(scene, 0, 0, '', 22, { originX: 0.5, originY: 0.5, stroke: 5, align: 'center', color: C.gold }).setDepth(D_BANNER));
    this.banner.setAlpha(0);
    this.bannerSub.setAlpha(0);

    this.pause = new PauseMenu(scene, view);

    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.unsubs.push(bus.on(k, fn));
    on('ui:button', (p) => {
      switch (p.button) {
        case 'unit':
          if (p.index >= 0 && p.index < this.pressUnit.length) this.pressUnit[p.index] = p.down;
          break;
        case 'spell':
          if (p.index >= 0 && p.index < this.pressSpell.length) this.pressSpell[p.index] = p.down;
          break;
        case 'dodge':
          this.pressDodge = p.down;
          break;
        case 'pause':
          this.pressPause = p.down;
          break;
        case 'speed':
          this.pressSpeed = p.down;
          break;
        case 'cancel':
          this.pressCancel = p.down;
          break;
      }
    });
    on('summon:denied', (p) => {
      if (p.slot >= 0 && p.slot < this.denyUnit.length) this.denyUnit[p.slot] = 0.35;
    });
    on('spell:denied', (p) => {
      if (p.slot >= 0 && p.slot < this.denySpell.length) this.denySpell[p.slot] = 0.35;
    });
    on('pickup:collected', (p) => {
      if (p.pickup === 'gold') this.goldBump = 1;
    });
    on('book:damaged', () => {
      this.bookFlash = 0.4;
    });
    on('wave:started', (p) => {
      const key = p.endless ? 'ui.wave_endless' : 'ui.wave';
      this.showBanner(this.view.t(key, { n: p.wave, total: this.view.data.balance.campaignWaves }), p.kind === 'boss' ? this.view.t('hud.boss_wave') : '', 2.2);
      this.refreshLabels();
    });
    on('boss:spawned', (p) => {
      const def = this.view.data.bosses.get(p.bossId);
      this.showBanner(def ? this.view.t(def.nameKey) : p.bossId, this.view.t('hud.boss_arrives'), 2.4, '#ff8a9a');
    });
    on('settings:changed', () => {
      this.refreshLabels();
      this.pause.rebuild(this.layout);
    });

    this.refreshLabels();
    this.relayout(view.layout);
  }

  private img(key: string): Phaser.GameObjects.Image {
    const f = spriteFrame(key);
    return this.scene.add.image(0, 0, f.tex, f.frame).setOrigin(0.5, 0.5).setDepth(D_ICON);
  }

  private makeSlot(keep: <T extends Phaser.GameObjects.GameObject>(o: T) => T, hint: string, costKey: 'ui_iron' | 'ui_mana'): SlotUi {
    const s = this.scene;
    const icon = keep(this.img('px'));
    const costIcon = keep(this.img(costKey));
    const cost = keep(s.add.bitmapText(0, 0, FONT_S, '', 15).setOrigin(0, 0.5).setDepth(D_NUM));
    const cd = keep(s.add.bitmapText(0, 0, FONT_L, '', 22).setOrigin(0.5, 0.5).setDepth(D_NUM));
    const key = keep(s.add.bitmapText(0, 0, FONT_S, hint, 12).setOrigin(0, 0).setDepth(D_NUM).setTint(0xe8deef));
    return { icon, costIcon, cost, cd, key, shown: '', lastCost: -1, lastCd: -1, baseScale: 1 };
  }

  private showBanner(text: string, sub: string, seconds: number, color: string = C.text, size = 44): void {
    this.banner.setText(text).setColor(color).setFontSize(size);
    this.bannerSub.setText(sub);
    this.bannerT = seconds;
    this.bannerMax = seconds;
  }

  private refreshLabels(): void {
    const w = this.view.world;
    const key = w.wave.endless ? 'ui.wave_endless' : 'ui.wave';
    this.waveText.setText(this.view.t(key, { n: w.wave.number, total: this.view.data.balance.campaignWaves }));
    if (w.boss) this.bossText.setText(this.view.t(w.boss.nameKey));
  }

  // ---------------------------------------------------------------------------

  relayout(layout: HudLayout): void {
    this.layout = layout;
    const L = layout;
    const cy = (r: Rect) => r.y + r.h / 2;
    this.ashIcon.setPosition(L.ashBar.x + 10, cy(L.ashBar)).setScale(30 / 48 / this.R);
    this.bookIcon.setPosition(L.bookBar.x + 10, cy(L.bookBar)).setScale(28 / 48 / this.R);
    this.ashNum.setPosition(L.ashBar.x + L.ashBar.w - 6, cy(L.ashBar));
    this.bookNum.setPosition(L.bookBar.x + L.bookBar.w - 6, cy(L.bookBar));
    this.waveText.setPosition(L.waveBar.x + 10, cy(L.waveBar));
    this.bossText.setPosition(L.waveBar.x + 10, cy(L.waveBar));
    this.remainIcon.setPosition(L.waveBar.x + L.waveBar.w - 44, cy(L.waveBar)).setScale(18 / 48 / this.R);
    this.remainNum.setPosition(L.waveBar.x + L.waveBar.w - 8, cy(L.waveBar));
    this.goldIcon.setPosition(L.goldLabel.x + 24, cy(L.goldLabel)).setScale(30 / 48 / this.R);
    this.goldNum.setPosition(L.goldLabel.x + 44, cy(L.goldLabel));
    this.speedIcon.setPosition(L.speedButton.x + L.speedButton.w / 2, cy(L.speedButton) - 5).setScale(30 / 48 / this.R);
    this.speedNum.setPosition(L.speedButton.x + L.speedButton.w / 2, L.speedButton.y + L.speedButton.h - 9);
    this.pauseIcon.setPosition(L.pauseButton.x + L.pauseButton.w / 2, cy(L.pauseButton)).setScale(30 / 48 / this.R);
    this.pauseHint.setPosition(L.pauseButton.x + 5, L.pauseButton.y + 3).setVisible(this.showKeys);
    this.speedHint.setPosition(L.speedButton.x + 5, L.speedButton.y + 3).setVisible(this.showKeys);
    const ip = L.ironPanel;
    this.ironIcon.setPosition(ip.x + 26, ip.y + 30).setScale(34 / 48 / this.R);
    this.ironNum.setPosition(ip.x + 50, ip.y + 24);
    this.ironMax.setPosition(ip.x + 52, ip.y + 50);
    for (let i = 0; i < this.units.length; i++) {
      const r = L.unitSlots[i];
      const s = this.units[i];
      s.costIcon.setPosition(r.x + r.w / 2 - 14, r.y + r.h - 13).setScale(16 / 48 / this.R);
      s.cost.setPosition(r.x + r.w / 2 - 4, r.y + r.h - 13);
      s.cd.setPosition(r.x + r.w / 2, r.y + 38);
      s.key.setPosition(r.x + 6, r.y + 4).setVisible(this.showKeys);
      s.shown = '';
    }
    for (let i = 0; i < this.spells.length; i++) {
      const r = L.spellButtons[i];
      const s = this.spells[i];
      s.costIcon.setPosition(r.x + r.w / 2 - 12, r.y + r.h - 6).setScale(18 / 48 / this.R);
      s.cost.setPosition(r.x + r.w / 2 - 2, r.y + r.h - 6);
      s.cd.setPosition(r.x + r.w / 2, r.y + r.h / 2);
      s.key.setPosition(r.x + 2, r.y).setVisible(this.showKeys);
      s.shown = '';
    }
    const d = L.dodgeButton;
    this.dodgeIcon.setPosition(d.x + d.w / 2, d.y + d.h / 2).setScale(46 / 48 / this.R);
    this.dodgeHint.setPosition(d.x + d.w / 2, d.y + d.h - 4);
    const c = L.cancelAimButton;
    this.cancelIcon.setPosition(c.x + c.w / 2, c.y + c.h / 2).setScale(34 / 48 / this.R);
    this.fpsText.setPosition(L.bookBar.x, L.bookBar.y + L.bookBar.h + 10);
    this.banner.setPosition(L.viewW / 2, 210);
    this.bannerSub.setPosition(L.viewW / 2, 268);
    this.sig = -1;
    this.pause.rebuild(L);
  }

  private drawStatic(nUnits: number, nSpells: number, dodge: boolean, aiming: boolean): void {
    const g = this.gStatic;
    const L = this.layout;
    g.clear();
    const panelR = (r: Rect, rad: number, fill: number = C.panelN, alpha = 0.82) => {
      g.fillStyle(0x0b0810, 0.4);
      g.fillRoundedRect(r.x, r.y + 3, r.w, r.h, rad);
      g.fillStyle(fill, alpha);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, rad);
      g.lineStyle(2.5, C.inkN, 1);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, rad);
    };
    const bar = (r: Rect) => {
      g.fillStyle(C.inkN, 0.9);
      g.fillRoundedRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, (r.h + 4) / 2);
      g.fillStyle(0x3a2f48, 1);
      g.fillRoundedRect(r.x + 20, r.y, r.w - 20, r.h, r.h / 2);
    };
    bar(L.ashBar);
    bar(L.bookBar);
    // wave bar
    g.fillStyle(C.inkN, 0.9);
    g.fillRoundedRect(L.waveBar.x - 2, L.waveBar.y - 2, L.waveBar.w + 4, L.waveBar.h + 4, 8);
    g.fillStyle(0x3a2f48, 1);
    g.fillRoundedRect(L.waveBar.x, L.waveBar.y, L.waveBar.w, L.waveBar.h, 6);
    // minimap
    const m = L.minimap;
    g.fillStyle(C.inkN, 0.85);
    g.fillRoundedRect(m.x - 3, m.y - 3, m.w + 6, m.h + 6, 5);
    g.fillStyle(0x2a3a2a, 1);
    g.fillRect(m.x, m.y, m.w, m.h);
    const ww = this.view.data.balance.world;
    g.fillStyle(0x6a6278, 1);
    g.fillRect(m.x, m.y, (ww.castleRight / ww.width) * m.w, m.h);
    panelR(L.goldLabel, 14);
    panelR(L.speedButton, 14, C.panel2N, 0.9);
    panelR(L.pauseButton, 14, C.panel2N, 0.9);
    // iron panel
    panelR(L.ironPanel, 14);
    const ip = L.ironPanel;
    g.fillStyle(0x3a2f48, 1);
    g.fillRoundedRect(ip.x + 10, ip.y + ip.h - 20, ip.w - 20, 10, 5);
    for (let i = 0; i < L.unitSlots.length; i++) {
      const r = L.unitSlots[i];
      if (i < nUnits) {
        panelR(r, 12, 0x2c2238, 0.92);
        g.fillStyle(0xffffff, 0.06);
        g.fillRoundedRect(r.x + 4, r.y + 4, r.w - 8, r.h * 0.42, 8);
        g.fillStyle(0x1b1424, 0.6);
        g.fillRoundedRect(r.x + 6, r.y + r.h - 24, r.w - 12, 19, 8);
      } else {
        g.lineStyle(2, 0xffffff, 0.12);
        g.strokeRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 12);
      }
    }
    for (let i = 0; i < L.spellButtons.length && i < nSpells; i++) {
      const r = L.spellButtons[i];
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      g.fillStyle(0x0b0810, 0.45);
      g.fillCircle(cx, cy + 3, r.w / 2);
      g.fillStyle(0x2a1f38, 0.95);
      g.fillCircle(cx, cy, r.w / 2);
      g.lineStyle(3, C.inkN, 1);
      g.strokeCircle(cx, cy, r.w / 2);
      g.fillStyle(C.inkN, 0.85);
      g.fillRoundedRect(cx - 26, r.y + r.h - 16, 52, 20, 10);
    }
    if (dodge) {
      const d = L.dodgeButton;
      g.fillStyle(0x0b0810, 0.45);
      g.fillCircle(d.x + d.w / 2, d.y + d.h / 2 + 3, d.w / 2);
      g.fillStyle(0x2f4a6a, 0.92);
      g.fillCircle(d.x + d.w / 2, d.y + d.h / 2, d.w / 2);
      g.lineStyle(3, C.inkN, 1);
      g.strokeCircle(d.x + d.w / 2, d.y + d.h / 2, d.w / 2);
    }
    if (aiming) {
      const c = L.cancelAimButton;
      g.fillStyle(0x0b0810, 0.45);
      g.fillCircle(c.x + c.w / 2, c.y + c.h / 2 + 3, c.w / 2);
      g.fillStyle(0xa8322a, 0.95);
      g.fillCircle(c.x + c.w / 2, c.y + c.h / 2, c.w / 2);
      g.lineStyle(3, C.inkN, 1);
      g.strokeCircle(c.x + c.w / 2, c.y + c.h / 2, c.w / 2);
    }
  }

  // ---------------------------------------------------------------------------

  frame(view: RenderView, _alpha: number, frameDtMs: number): void {
    const dt = Math.min(frameDtMs, 100) / 1000;
    this.clock += dt;
    const L = this.layout;
    const w = view.world;
    const aiming = view.aim.slot !== null;
    const nUnits = Math.min(w.summonSlots.length, L.unitSlots.length);
    const nSpells = Math.min(w.spellSlots.length, L.spellButtons.length);
    const sig = nUnits + nSpells * 16 + (w.dodge.unlocked ? 256 : 0) + (aiming ? 512 : 0);
    if (sig !== this.sig) {
      this.sig = sig;
      this.drawStatic(nUnits, nSpells, w.dodge.unlocked, aiming);
    }
    const gu = this.gUnder;
    const go = this.gOver;
    gu.clear();
    go.clear();

    // --- Ash / book bars
    const ash = findEntity(w as never, w.ashId) as EntityState | undefined;
    const ashHp = ash ? Math.max(0, Math.ceil(ash.hp)) : 0;
    const ashMax = ash ? Math.ceil(ash.maxHp) : 1;
    this.fillBar(L.ashBar, ashMax > 0 ? ashHp / ashMax : 0, ashHp / ashMax < 0.3 ? 0xff5a4f : 0x59d36b);
    if (ashHp !== this.last.ash || ashMax !== this.last.ashMax) {
      this.last.ash = ashHp;
      this.last.ashMax = ashMax;
      this.ashNum.setText(numStr(ashHp));
    }
    const bookHp = Math.max(0, Math.ceil(w.book.hp));
    if (this.bookFlash > 0) this.bookFlash -= dt;
    this.fillBar(L.bookBar, w.book.maxHp > 0 ? w.book.hp / w.book.maxHp : 0, this.bookFlash > 0 && Math.sin(this.clock * 40) > 0 ? 0xffffff : 0xf0b43c);
    if (bookHp !== this.last.book) {
      this.last.book = bookHp;
      this.bookNum.setText(numStr(bookHp));
    }

    // --- wave / boss bar
    const wb = L.waveBar;
    if (w.boss) {
      if (!this.bossText.visible || this.bossText.text === '') this.bossText.setText(view.t(w.boss.nameKey));
      this.waveText.setVisible(false);
      this.bossText.setVisible(true);
      this.remainIcon.setVisible(false);
      this.remainNum.setVisible(false);
      const frac = clamp01(w.boss.hpFrac);
      gu.fillStyle(0xd0304a, 1);
      gu.fillRoundedRect(wb.x, wb.y, Math.max(2, wb.w * frac), wb.h, 6);
      gu.fillStyle(0xffffff, 0.18);
      gu.fillRect(wb.x + 4, wb.y + 3, Math.max(0, wb.w * frac - 8), 4);
      const def = view.data.bosses.get(w.boss.bossId);
      if (def) {
        for (const ph of def.phases) {
          if (ph.untilHpFrac <= 0 || ph.untilHpFrac >= 1) continue;
          const tx = wb.x + wb.w * ph.untilHpFrac;
          go.fillStyle(0xffffff, 0.95);
          go.fillRect(tx - 1.5, wb.y - 3, 3, wb.h + 6);
          go.fillStyle(C.inkN, 1);
          go.fillRect(tx - 0.5, wb.y, 1, wb.h);
        }
      }
    } else {
      this.waveText.setVisible(true);
      this.bossText.setVisible(false);
      this.remainIcon.setVisible(true);
      this.remainNum.setVisible(true);
      const tot = Math.max(1, w.wave.enemiesTotal);
      const frac = clamp01(w.wave.enemiesKilled / tot);
      gu.fillStyle(0x7d6aa8, 1);
      gu.fillRoundedRect(wb.x, wb.y, Math.max(0, wb.w * frac), wb.h, 6);
      const remain = Math.max(0, w.wave.enemiesTotal - w.wave.enemiesKilled);
      if (remain !== this.last.remain) {
        this.last.remain = remain;
        this.remainNum.setText(numStr(remain));
      }
    }

    // --- minimap
    this.drawMinimap(view);

    // --- gold
    const gold = w.resources.goldCollected | 0;
    if (gold !== this.last.gold) {
      this.last.gold = gold;
      this.goldNum.setText(numStr(gold));
    }
    if (this.goldBump > 0) this.goldBump = Math.max(0, this.goldBump - dt * 4);
    const gs = 1 + this.goldBump * 0.25;
    this.goldIcon.setScale((30 / 48 / this.R) * gs);
    this.goldNum.setFontSize(26 * (1 + this.goldBump * 0.12));

    // --- speed / pause
    const sb = L.speedButton;
    if (view.speed === 2) {
      go.fillStyle(0xffd34d, 0.35);
      go.fillRoundedRect(sb.x + 3, sb.y + 3, sb.w - 6, sb.h - 6, 11);
    }
    this.speedNum.setText(view.speed === 2 ? 'x2' : 'x1');
    this.speedNum.setTint(view.speed === 2 ? 0xffd34d : 0xc9bfd6);
    this.pressFx(go, sb, this.pressSpeed, 14);
    this.pressFx(go, L.pauseButton, this.pressPause, 14);
    this.speedIcon.setScale((30 / 48 / this.R) * (this.pressSpeed ? 0.88 : 1));
    this.pauseIcon.setScale((30 / 48 / this.R) * (this.pressPause ? 0.88 : 1));

    // --- iron
    const r = w.resources;
    const iron = Math.floor(r.iron);
    const ironMax = Math.floor(r.ironMax);
    if (iron !== this.last.iron) {
      this.last.iron = iron;
      this.ironNum.setText(numStr(iron));
    }
    if (ironMax !== this.last.ironMax) {
      this.last.ironMax = ironMax;
      this.ironMax.setText(`/${numStr(ironMax)}`);
    }
    const ip = L.ironPanel;
    const ironFrac = r.ironMax > 0 ? clamp01(r.iron / r.ironMax) : 0;
    gu.fillStyle(0xb8c4d0, 1);
    gu.fillRoundedRect(ip.x + 10, ip.y + ip.h - 20, Math.max(0, (ip.w - 20) * ironFrac), 10, 5);
    // smithy ring: progress to the next 10 iron [เดา]
    const ring = r.iron >= r.ironMax ? 1 : (r.iron % 10) / 10;
    gu.lineStyle(4, 0x3a2f48, 1);
    gu.strokeCircle(ip.x + 26, ip.y + 30, 21);
    gu.lineStyle(4, r.iron >= r.ironMax ? 0xffd34d : 0xe0e8f0, 1);
    gu.beginPath();
    gu.arc(ip.x + 26, ip.y + 30, 21, -Math.PI / 2, -Math.PI / 2 + TAU * ring, false);
    gu.strokePath();

    // --- unit slots
    for (let i = 0; i < this.units.length; i++) this.drawUnitSlot(i, i < nUnits ? w.summonSlots[i] : null, r.iron, dt);
    // --- spells
    const aimSlot = view.aim.slot;
    for (let i = 0; i < this.spells.length; i++) this.drawSpell(i, i < nSpells ? w.spellSlots[i] : null, r.mana, aimSlot === i, dt);

    // --- dodge / cancel
    const d = L.dodgeButton;
    this.dodgeIcon.setVisible(w.dodge.unlocked);
    this.dodgeHint.setVisible(w.dodge.unlocked && this.showKeys);
    if (w.dodge.unlocked) {
      this.dodgeIcon.setScale((46 / 48 / this.R) * (this.pressDodge ? 0.88 : 1));
      if (w.dodge.cooldownLeft > 0 && w.dodge.cooldownTotal > 0) this.sweep(go, d.x + d.w / 2, d.y + d.h / 2, d.w / 2 - 4, w.dodge.cooldownLeft / w.dodge.cooldownTotal);
      if (this.pressDodge) {
        go.lineStyle(4, 0xffffff, 0.9);
        go.strokeCircle(d.x + d.w / 2, d.y + d.h / 2, d.w / 2 - 2);
      }
    }
    this.cancelIcon.setVisible(aiming);
    if (aiming) {
      const c = L.cancelAimButton;
      this.cancelIcon.setScale((34 / 48 / this.R) * (this.pressCancel ? 0.85 : 1));
      if (this.pressCancel) {
        go.lineStyle(4, 0xffffff, 0.9);
        go.strokeCircle(c.x + c.w / 2, c.y + c.h / 2, c.w / 2 - 2);
      }
    }

    // --- FPS readout
    this.ft[this.ftIdx] = frameDtMs;
    this.ftIdx = (this.ftIdx + 1) % this.ft.length;
    const showFps = view.settings.showFps;
    this.fpsText.setVisible(showFps);
    if (showFps) {
      this.fpsTimer -= dt;
      if (this.fpsTimer <= 0) {
        this.fpsTimer = 0.25;
        let sum = 0;
        let max = 0;
        for (let i = 0; i < this.ft.length; i++) {
          sum += this.ft[i];
          if (this.ft[i] > max) max = this.ft[i];
        }
        const avg = sum / this.ft.length;
        const fps = avg > 0 ? 1000 / avg : 0;
        this.fpsText.setText(`FPS ${fps.toFixed(0)}  ${avg.toFixed(1)}ms  max ${max.toFixed(1)}ms`);
      }
    }

    // --- banner
    if (w.outcome && !this.outcomeShown) {
      this.outcomeShown = true;
      const won = w.outcome.result === 'won';
      const sub = won ? '' : this.view.t(w.outcome.reason === 'book_destroyed' ? 'result.reason.book' : 'result.reason.ash');
      this.showBanner(this.view.t(won ? 'ui.victory' : 'ui.defeat'), sub, 3, won ? C.gold : '#ff7a6a', 72);
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      const k = 1 - this.bannerT / this.bannerMax;
      const a = k < 0.12 ? k / 0.12 : this.bannerT < 0.5 ? this.bannerT / 0.5 : 1;
      this.banner.setAlpha(a).setScale(k < 0.12 ? 0.8 + (k / 0.12) * 0.2 : 1);
      this.bannerSub.setAlpha(a);
    } else if (this.banner.alpha > 0) {
      this.banner.setAlpha(0);
      this.bannerSub.setAlpha(0);
    }

    if (view.paused && this.bannerT > 0) {
      this.banner.setAlpha(0);
      this.bannerSub.setAlpha(0);
    }
    this.pause.setVisible(view.paused && !w.outcome);
  }

  private fillBar(r: Rect, frac: number, color: number): void {
    const g = this.gUnder;
    const x = r.x + 20;
    const w = (r.w - 20) * clamp01(frac);
    if (w <= 0) return;
    g.fillStyle(color, 1);
    g.fillRoundedRect(x, r.y, Math.max(w, r.h), r.h, r.h / 2);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(x + 3, r.y + 2, Math.max(0, w - 6), r.h * 0.3, r.h * 0.15);
  }

  private pressFx(g: Phaser.GameObjects.Graphics, r: Rect, down: boolean, rad: number): void {
    if (!down) return;
    g.fillStyle(0xffffff, 0.18);
    g.fillRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, rad);
    g.lineStyle(3, 0xffffff, 0.85);
    g.strokeRoundedRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, rad);
  }

  /** dark pie for the remaining cooldown fraction, shrinking clockwise */
  private sweep(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rad: number, frac: number): void {
    const f = clamp01(frac);
    if (f <= 0) return;
    g.fillStyle(0x07040b, 0.62);
    g.slice(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + TAU * f, false);
    g.fillPath();
    g.lineStyle(2, 0xffffff, 0.5);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(-Math.PI / 2 + TAU * f) * rad, cy + Math.sin(-Math.PI / 2 + TAU * f) * rad);
    g.strokePath();
  }

  private setSlotIcon(s: SlotUi, key: string, kind: 'ally' | 'icon', maxW: number, maxH: number): void {
    if (s.shown === key) return;
    s.shown = key;
    const f = spriteFrame(key, kind === 'ally' ? 'ally' : undefined);
    const mul = Math.min(1.2, maxW / f.w, maxH / f.h);
    applyFrame(s.icon, f, mul);
    s.baseScale = mul / this.R;
  }

  private drawUnitSlot(i: number, slot: RenderView['world']['summonSlots'][number] | null, iron: number, dt: number): void {
    const s = this.units[i];
    const r = this.layout.unitSlots[i];
    const go = this.gOver;
    if (this.denyUnit[i] > 0) this.denyUnit[i] -= dt;
    if (!slot) {
      s.icon.setVisible(false);
      s.costIcon.setVisible(false);
      s.cost.setVisible(false);
      s.cd.setVisible(false);
      s.key.setVisible(false);
      return;
    }
    const def = this.view.data.units.get(slot.unitId);
    this.setSlotIcon(s, def?.sprite ?? slot.unitId, 'ally', r.w - 14, r.h - 34);
    const pressed = this.pressUnit[i];
    const shake = this.denyUnit[i] > 0 ? Math.sin(this.clock * 70) * 3 : 0;
    s.icon.setVisible(true).setPosition(r.x + r.w / 2 + shake, r.y + r.h - 26).setScale(s.baseScale * (pressed ? 0.9 : 1));
    if (s.icon.originY !== 1) s.icon.setY(r.y + 4 + (r.h - 30) * s.icon.originY);
    s.costIcon.setVisible(true);
    s.cost.setVisible(true);
    s.key.setVisible(this.showKeys);
    if (slot.ironCost !== s.lastCost) {
      s.lastCost = slot.ironCost;
      s.cost.setText(numStr(slot.ironCost));
    }
    const affordable = iron >= slot.ironCost;
    const cooling = slot.cooldownLeft > 0 && slot.cooldownTotal > 0;
    const ok = affordable && slot.available && !cooling;
    s.icon.setAlpha(affordable && slot.available ? 1 : 0.4);
    s.cost.setTint(affordable ? 0xffffff : 0xff6a5a);
    if (!slot.available || !affordable) {
      go.fillStyle(0x07040b, 0.35);
      go.fillRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 11);
    }
    if (cooling) {
      this.sweep(go, r.x + r.w / 2, r.y + 38, 30, slot.cooldownLeft / slot.cooldownTotal);
      const sec = Math.ceil(slot.cooldownLeft);
      if (sec !== s.lastCd) {
        s.lastCd = sec;
        s.cd.setText(numStr(sec));
      }
      s.cd.setVisible(true);
    } else {
      s.cd.setVisible(false);
      s.lastCd = -1;
    }
    if (ok) {
      go.lineStyle(2, 0x9fe08a, 0.55 + 0.25 * Math.sin(this.clock * 4));
      go.strokeRoundedRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 12);
    }
    if (pressed) this.pressFx(go, r, true, 12);
    if (this.denyUnit[i] > 0) {
      go.lineStyle(4, 0xff3b3b, 0.95);
      go.strokeRoundedRect(r.x, r.y, r.w, r.h, 12);
    }
  }

  private drawSpell(i: number, slot: RenderView['world']['spellSlots'][number] | null, mana: number, aiming: boolean, dt: number): void {
    const s = this.spells[i];
    const r = this.layout.spellButtons[i];
    const gu = this.gUnder;
    const go = this.gOver;
    if (this.denySpell[i] > 0) this.denySpell[i] -= dt;
    if (!slot) {
      s.icon.setVisible(false);
      s.costIcon.setVisible(false);
      s.cost.setVisible(false);
      s.cd.setVisible(false);
      s.key.setVisible(false);
      return;
    }
    const def = this.view.data.spells.get(slot.spellId);
    this.setSlotIcon(s, def?.icon ?? 'fallback_icon', 'icon', r.w - 18, r.h - 18);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const pressed = this.pressSpell[i];
    const shake = this.denySpell[i] > 0 ? Math.sin(this.clock * 70) * 3 : 0;
    s.icon.setVisible(true).setPosition(cx + shake, cy).setScale(s.baseScale * (pressed ? 0.9 : 1));
    s.costIcon.setVisible(true);
    s.cost.setVisible(true);
    s.key.setVisible(this.showKeys);
    const cost = Math.ceil(slot.manaCost);
    if (cost !== s.lastCost) {
      s.lastCost = cost;
      s.cost.setText(numStr(cost));
    }
    const affordable = mana >= slot.manaCost;
    s.icon.setAlpha(affordable ? 1 : 0.5);
    s.cost.setTint(affordable ? 0xbfe6ff : 0xff6a5a);
    // mana ring
    const rr = r.w / 2 + 5;
    const f = slot.manaCost > 0 ? clamp01(mana / slot.manaCost) : 1;
    gu.lineStyle(6, C.inkN, 0.9);
    gu.strokeCircle(cx, cy, rr);
    gu.lineStyle(4, f >= 1 ? 0x9fe0ff : 0x3f7fd0, 1);
    gu.beginPath();
    gu.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + TAU * f, false);
    gu.strokePath();
    const cooling = slot.cooldownLeft > 0 && slot.cooldownTotal > 0;
    if (cooling) {
      this.sweep(go, cx, cy, r.w / 2 - 6, slot.cooldownLeft / slot.cooldownTotal);
      const sec = Math.ceil(slot.cooldownLeft);
      if (sec !== s.lastCd) {
        s.lastCd = sec;
        s.cd.setText(numStr(sec));
      }
      s.cd.setVisible(true);
    } else {
      s.cd.setVisible(false);
      s.lastCd = -1;
    }
    if (aiming) {
      go.lineStyle(5, 0xffd34d, 0.7 + 0.3 * Math.sin(this.clock * 10));
      go.strokeCircle(cx, cy, rr + 6);
    }
    if (pressed) {
      go.fillStyle(0xffffff, 0.15);
      go.fillCircle(cx, cy, r.w / 2 - 2);
    }
    if (this.denySpell[i] > 0) {
      go.lineStyle(4, 0xff3b3b, 0.95);
      go.strokeCircle(cx, cy, r.w / 2);
    }
  }

  private drawMinimap(view: RenderView): void {
    const g = this.gOver;
    const m = this.layout.minimap;
    const w = view.world;
    const ww = view.data.balance.world.width;
    const sx = m.w / ww;
    // camera window
    g.lineStyle(1.5, 0xffffff, 0.55);
    g.strokeRect(m.x + view.cameraX * sx, m.y - 1, this.layout.viewW * sx, m.h + 2);
    // book
    g.fillStyle(0xf0b43c, 1);
    g.fillRect(m.x + view.data.balance.world.bookX * sx - 2, m.y + 1, 4, m.h - 2);
    const ents = w.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive || e.hp <= 0) continue;
      const x = m.x + e.x * sx;
      switch (e.kind) {
        case 'ally':
          g.fillStyle(0x7ee07a, 1);
          g.fillRect(x - 1.5, m.y + 3, 3, 4);
          break;
        case 'hero':
          g.fillStyle(0xffd34d, 1);
          g.fillRect(x - 2, m.y + 2, 4, 6);
          break;
        case 'enemy':
          g.fillStyle(0xff5a4f, 1);
          g.fillRect(x - 1.5, e.flying ? m.y + 1 : m.y + 3, 3, 4);
          break;
        case 'boss':
          g.fillStyle(0xd070ff, 1);
          g.fillRect(x - 4, m.y - 2, 8, m.h + 4);
          break;
        case 'pickup':
          if (e.sprite === 'coin') {
            g.fillStyle(0xffe36a, 1);
            g.fillRect(x - 1, m.y + m.h - 3, 2, 2);
          }
          break;
        default:
          break;
      }
    }
    const ash = findEntity(w as never, w.ashId) as EntityState | undefined;
    if (ash) {
      g.fillStyle(0xffffff, 1);
      g.fillRect(m.x + ash.x * sx - 2.5, m.y - 3, 5, m.h + 6);
      g.fillStyle(0x4aa8ff, 1);
      g.fillRect(m.x + ash.x * sx - 1.5, m.y - 2, 3, m.h + 4);
    }
  }

  destroy(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.units = [];
    this.spells = [];
    this.pause.destroy();
  }
}

