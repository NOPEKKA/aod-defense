/**
 * Battle HUD v2 (ART_BIBLE section 8), arranged like the original game and drawn ONLY at the
 * core/layout rects (controls hit-tests the same rects):
 *   top-left     Ash portrait in an iron frame, HP bar, smaller book bar, pause under the portrait
 *   top-centre   wave bar with skull markers (boss HP bar during a boss), minimap under it
 *   top-right    gold, speed; the combo counter pops under them
 *   bottom-left  rally banner, blacksmith panel (portrait, "L2", iron, blue progress, upgrade cost),
 *                wooden unit slots with portraits and iron costs
 *   bottom-right round spell buttons (icon, mana ring, cooldown sweep), dodge button
 * Stone / iron / wood skin from ui/skin.ts, baked icons with generated fallbacks. Numbers use the
 * atlas bitmap fonts; Text objects change only on wave start, level up or language change.
 * Graphics layers are redrawn per frame without allocations.
 */
import type { BattleRenderer, EntityState, EventBus, GameEvents, HudLayout, Rect, RenderView, Unsubscribe } from '../../contracts';
import { findEntity } from '../../core/world';
import { atlasScale, spriteFrame } from '../art/atlas';
import { FONT_L, FONT_S } from '../art/build';
import { C, FONT, addText, clamp01, easeOutBack, numStr } from '../style';
import { SKIN, barFill, goldStyle, ironRing, setIcon, stonePanel, trough, woodPanel } from '../ui/skin';
import { DEPTH } from './depth';
import { PauseMenu } from './PauseMenu';

const D_STATIC = DEPTH.hud;
const D_UNDER = DEPTH.hud + 5;
const D_ICON = DEPTH.hud + 10;
const D_OVER = DEPTH.hud + 20;
const D_NUM = DEPTH.hud + 30;
const D_BANNER = DEPTH.hud + 100;
const MAX_MARKERS = 10;

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
  private portrait!: Phaser.GameObjects.Image;
  private portraitBase = 1;
  private bookIcon!: Phaser.GameObjects.Image;
  private ashNum!: Phaser.GameObjects.BitmapText;
  private bookNum!: Phaser.GameObjects.BitmapText;
  private waveText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private remainIcon!: Phaser.GameObjects.Image;
  private remainNum!: Phaser.GameObjects.BitmapText;
  private markers: Phaser.GameObjects.Image[] = [];
  private markerBase = 1;
  private goldIcon!: Phaser.GameObjects.Image;
  private goldBase = 1;
  private goldNum!: Phaser.GameObjects.BitmapText;
  private speedIcon!: Phaser.GameObjects.Image;
  private speedNum!: Phaser.GameObjects.BitmapText;
  private pauseIcon!: Phaser.GameObjects.Image;
  private pauseHint!: Phaser.GameObjects.BitmapText;
  private speedHint!: Phaser.GameObjects.BitmapText;
  // blacksmith panel
  private smithFace!: Phaser.GameObjects.Image;
  private smithLevel!: Phaser.GameObjects.Text;
  private ironIcon!: Phaser.GameObjects.Image;
  private ironNum!: Phaser.GameObjects.BitmapText;
  private ironMax!: Phaser.GameObjects.BitmapText;
  private anvilIcon!: Phaser.GameObjects.Image;
  private smithCost!: Phaser.GameObjects.BitmapText;
  private smithHint!: Phaser.GameObjects.BitmapText;
  private smithFlash = 0;
  private smithDeny = 0;
  private lastLevel = -1;
  private lastCost = -2;
  // rally
  private rallyIcon!: Phaser.GameObjects.Image;
  private rallyHint!: Phaser.GameObjects.BitmapText;
  private rallyShown: '' | 'advance' | 'hold' = '';
  private rallyPop = 0;
  // combo
  private comboNum!: Phaser.GameObjects.Text;
  private comboLabel!: Phaser.GameObjects.Text;
  private comboBonus!: Phaser.GameObjects.Text;
  private comboPop = 0;
  private comboBonusT = 0;
  private lastCombo = -1;
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
  private pressSmith = false;
  private pressRally = false;
  private denyUnit: number[] = [];
  private denySpell: number[] = [];
  private goldBump = 0;
  private bookFlash = 0;
  private ashHurt = 0;
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
    const R = view.data ? scene.cameras.main.zoom : 1;

    this.portrait = icon('ui_ash');
    this.bookIcon = icon('ui_book');
    this.ashNum = num(false, 15).setOrigin(1, 0.5);
    this.bookNum = num(false, 12).setOrigin(1, 0.5);
    this.waveText = keep(addText(scene, 0, 0, '', 15, { originY: 0.5 }).setDepth(D_NUM));
    this.bossText = keep(addText(scene, 0, 0, '', 15, { originY: 0.5, color: '#ffd8e0' }).setDepth(D_NUM));
    this.remainIcon = icon('ui_skull');
    this.remainNum = num(false, 14).setOrigin(1, 0.5);
    for (let i = 0; i < MAX_MARKERS; i++) this.markers.push(icon('ui_skull').setVisible(false));
    this.goldIcon = icon('ui_gold');
    this.goldNum = num(true, 26).setOrigin(0, 0.5);
    this.speedIcon = icon('ui_speed');
    this.speedNum = num(false, 13).setOrigin(0.5, 0.5);
    this.pauseIcon = icon('ui_pause');
    this.pauseHint = num(false, 11).setOrigin(0, 0).setText('P');
    this.speedHint = num(false, 11).setOrigin(0, 0).setText('F');

    this.smithFace = icon('fallback_ally');
    this.smithLevel = keep(scene.add.text(0, 0, '', goldStyle(22)).setOrigin(0, 0.5).setResolution(R).setDepth(D_NUM));
    this.ironIcon = icon('ui_iron');
    this.ironNum = num(true, 24).setOrigin(0, 0.5);
    this.ironMax = num(false, 13).setOrigin(0, 0.5);
    this.anvilIcon = icon('ui_iron');
    this.smithCost = num(false, 13).setOrigin(0, 0.5);
    this.smithHint = num(false, 11).setOrigin(1, 0).setText('B');
    this.rallyIcon = icon('ui_dodge');
    this.rallyHint = num(false, 11).setOrigin(0, 0).setText('G');
    this.comboNum = keep(scene.add.text(0, 0, '', goldStyle(40)).setOrigin(0.5, 0.5).setResolution(R).setDepth(D_NUM).setVisible(false));
    this.comboLabel = keep(scene.add.text(0, 0, '', goldStyle(15, '#ffb070')).setOrigin(0.5, 0.5).setResolution(R).setDepth(D_NUM).setVisible(false));
    this.comboBonus = keep(scene.add.text(0, 0, '', goldStyle(20)).setOrigin(0.5, 0.5).setResolution(R).setDepth(D_NUM).setVisible(false));

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
    this.banner = keep(scene.add.text(0, 0, '', { ...goldStyle(48, C.text), fontFamily: FONT, align: 'center' }).setOrigin(0.5).setResolution(R).setDepth(D_BANNER));
    this.bannerSub = keep(scene.add.text(0, 0, '', { ...goldStyle(22), fontFamily: FONT, align: 'center' }).setOrigin(0.5).setResolution(R).setDepth(D_BANNER));
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
        case 'smith':
          this.pressSmith = p.down;
          break;
        case 'rally':
          this.pressRally = p.down;
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
    on('entity:damaged', (p) => {
      if (p.id === this.view.world.ashId && !p.blocked) this.ashHurt = 0.3;
    });
    on('smith:upgraded', (p) => {
      this.smithFlash = 1;
      this.showBanner(this.view.t('ui.smith_upgraded', { n: p.level }), '', 1.4, SKIN.goldText, 34);
    });
    on('smith:denied', () => {
      this.smithDeny = 0.4;
    });
    on('rally:changed', () => {
      this.rallyPop = 1;
    });
    on('combo:changed', () => {
      this.comboPop = 1;
    });
    on('combo:ended', (p) => {
      if (p.gold > 0) {
        this.comboBonus.setText(this.view.t('ui.combo_bonus', { gold: p.gold })).setVisible(true);
        this.comboBonusT = 1.6;
        this.goldBump = 1;
      }
    });
    on('wave:started', (p) => {
      const key = p.endless ? 'ui.wave_endless' : 'ui.wave';
      this.showBanner(this.view.t(key, { n: p.wave, total: this.view.data.balance.campaignWaves }), p.kind === 'boss' ? this.view.t('hud.boss_wave') : '', 2.2);
      this.refreshLabels();
    });
    on('boss:spawned', () => {
      // the FX boss banner takes the stage
      this.bannerT = 0;
    });
    on('settings:changed', () => {
      this.refreshLabels();
      this.pause.rebuild(this.layout);
    });

    // portraits are baked per sprite key; fall back to generated art
    this.portraitBase = this.fitIcon(this.portrait, 'portrait_ash', 'ash', 70, 70);
    this.fitIcon(this.smithFace, 'portrait_npc_blacksmith', 'fallback_ally', 46, 46);
    this.refreshLabels();
    this.relayout(view.layout);
  }

  private img(key: string): Phaser.GameObjects.Image {
    const f = spriteFrame(key);
    return this.scene.add.image(0, 0, f.tex, f.frame).setOrigin(0.5, 0.5).setDepth(D_ICON);
  }

  /** baked icon or generated frame fitted into w x h; returns the resulting scale */
  private fitIcon(img: Phaser.GameObjects.Image, id: string, fallback: string, w: number, h: number): number {
    setIcon(img, id, fallback, w, h);
    return img.scaleX;
  }

  private makeSlot(keep: <T extends Phaser.GameObjects.GameObject>(o: T) => T, hint: string, costKey: 'ui_iron' | 'ui_mana'): SlotUi {
    const s = this.scene;
    const icon = keep(this.img('px'));
    const costIcon = keep(this.img(costKey));
    setIcon(costIcon, costKey, costKey, 16, 16);
    const cost = keep(s.add.bitmapText(0, 0, FONT_S, '', 15).setOrigin(0, 0.5).setDepth(D_NUM));
    const cd = keep(s.add.bitmapText(0, 0, FONT_L, '', 24).setOrigin(0.5, 0.5).setDepth(D_NUM));
    const key = keep(s.add.bitmapText(0, 0, FONT_S, hint, 12).setOrigin(0, 0).setDepth(D_NUM).setTint(0xf0e2c8));
    return { icon, costIcon, cost, cd, key, shown: '', lastCost: -1, lastCd: -1, baseScale: 1 };
  }

  private showBanner(text: string, sub: string, seconds: number, color: string = C.text, size = 48): void {
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
    this.lastLevel = -1;
    this.comboLabel.setText(this.view.t('ui.combo'));
  }

  // ---------------------------------------------------------------------------

  relayout(layout: HudLayout): void {
    this.layout = layout;
    const L = layout;
    const cy = (r: Rect) => r.y + r.h / 2;
    const ap = L.ashPortrait;
    this.portrait.setPosition(ap.x + ap.w / 2, ap.y + ap.h / 2);
    this.bookIcon.setPosition(L.bookBar.x - 2, cy(L.bookBar));
    setIcon(this.bookIcon, 'ui_book', 'ui_book', 26, 26);
    this.ashNum.setPosition(L.ashBar.x + L.ashBar.w - 8, cy(L.ashBar));
    this.bookNum.setPosition(L.bookBar.x + L.bookBar.w - 8, cy(L.bookBar));
    this.waveText.setPosition(L.waveBar.x + 12, cy(L.waveBar));
    this.bossText.setPosition(L.waveBar.x + 12, cy(L.waveBar));
    this.remainIcon.setPosition(L.waveBar.x + L.waveBar.w - 46, cy(L.waveBar));
    setIcon(this.remainIcon, 'ui_skull', 'ui_skull', 18, 18);
    this.remainNum.setPosition(L.waveBar.x + L.waveBar.w - 10, cy(L.waveBar));
    for (const m of this.markers) setIcon(m, 'ui_skull', 'ui_skull', 20, 20);
    this.markerBase = this.markers[0]?.scaleX ?? 1;
    this.goldIcon.setPosition(L.goldLabel.x + 28, cy(L.goldLabel));
    this.goldBase = this.fitIcon(this.goldIcon, 'ui_gold', 'ui_gold', 34, 34);
    this.goldNum.setPosition(L.goldLabel.x + 52, cy(L.goldLabel) + 1);
    this.speedIcon.setPosition(L.speedButton.x + L.speedButton.w / 2, cy(L.speedButton) - 6).setScale(28 / 48 / this.R);
    this.speedNum.setPosition(L.speedButton.x + L.speedButton.w / 2, L.speedButton.y + L.speedButton.h - 11);
    this.pauseIcon.setPosition(L.pauseButton.x + L.pauseButton.w / 2, cy(L.pauseButton)).setScale(30 / 48 / this.R);
    this.pauseHint.setPosition(L.pauseButton.x + 6, L.pauseButton.y + 4).setVisible(this.showKeys);
    this.speedHint.setPosition(L.speedButton.x + 6, L.speedButton.y + 4).setVisible(this.showKeys);

    // blacksmith panel
    const ip = L.ironPanel;
    this.smithFace.setPosition(ip.x + 30, ip.y + 31);
    this.smithLevel.setPosition(ip.x + 60, ip.y + 18);
    this.ironIcon.setPosition(ip.x + 68, ip.y + 45);
    setIcon(this.ironIcon, 'ui_iron', 'ui_iron', 18, 18);
    this.ironNum.setPosition(ip.x + 79, ip.y + 45);
    this.ironMax.setPosition(ip.x + 80, ip.y + 45);
    this.anvilIcon.setPosition(ip.x + 18, ip.y + ip.h - 15);
    setIcon(this.anvilIcon, 'ui_anvil', 'ui_iron', 20, 20);
    this.smithCost.setPosition(ip.x + 31, ip.y + ip.h - 15);
    this.smithHint.setPosition(ip.x + ip.w - 6, ip.y + 4).setVisible(this.showKeys);
    // rally banner
    const rb = L.rallyButton;
    this.rallyIcon.setPosition(rb.x + rb.w / 2, rb.y + rb.h / 2);
    this.rallyShown = '';
    this.rallyHint.setPosition(rb.x + 6, rb.y + 4).setVisible(this.showKeys);
    // combo under the gold
    const comboX = L.goldLabel.x + L.goldLabel.w / 2 - 20;
    this.comboNum.setPosition(comboX, L.goldLabel.y + L.goldLabel.h + 44);
    this.comboLabel.setPosition(comboX, L.goldLabel.y + L.goldLabel.h + 74);
    this.comboBonus.setPosition(comboX, L.goldLabel.y + L.goldLabel.h + 100);

    for (let i = 0; i < this.units.length; i++) {
      const r = L.unitSlots[i];
      const s = this.units[i];
      s.costIcon.setPosition(r.x + r.w / 2 - 14, r.y + r.h - 14);
      s.cost.setPosition(r.x + r.w / 2 - 4, r.y + r.h - 14);
      s.cd.setPosition(r.x + r.w / 2, r.y + 38);
      s.key.setPosition(r.x + 7, r.y + 5).setVisible(this.showKeys);
      s.shown = '';
    }
    for (let i = 0; i < this.spells.length; i++) {
      const r = L.spellButtons[i];
      const s = this.spells[i];
      s.costIcon.setPosition(r.x + r.w / 2 - 12, r.y + r.h - 6);
      s.cost.setPosition(r.x + r.w / 2 - 2, r.y + r.h - 6);
      s.cd.setPosition(r.x + r.w / 2, r.y + r.h / 2);
      s.key.setPosition(r.x + 2, r.y).setVisible(this.showKeys);
      s.shown = '';
    }
    const d = L.dodgeButton;
    this.dodgeIcon.setPosition(d.x + d.w / 2, d.y + d.h / 2).setScale(44 / 48 / this.R);
    this.dodgeHint.setPosition(d.x + d.w / 2, d.y + d.h - 2);
    const c = L.cancelAimButton;
    this.cancelIcon.setPosition(c.x + c.w / 2, c.y + c.h / 2).setScale(34 / 48 / this.R);
    this.fpsText.setPosition(L.pauseButton.x + L.pauseButton.w + 12, L.pauseButton.y + 4);
    this.banner.setPosition(L.viewW / 2, 210);
    this.bannerSub.setPosition(L.viewW / 2, 262);
    this.sig = -1;
    this.pause.rebuild(L);
  }

  private drawStatic(nUnits: number, nSpells: number, dodge: boolean, aiming: boolean): void {
    const g = this.gStatic;
    const L = this.layout;
    g.clear();
    // portrait frame
    const ap = L.ashPortrait;
    stonePanel(g, ap, 8);
    g.fillStyle(0x0c0a10, 1);
    g.fillRoundedRect(ap.x + 5, ap.y + 5, ap.w - 10, ap.h - 10, 5);
    // bars
    trough(g, L.ashBar);
    trough(g, L.bookBar);
    // wave bar + minimap
    trough(g, L.waveBar, 8);
    const m = L.minimap;
    trough(g, m, 3);
    const ww = this.view.data.balance.world;
    g.fillStyle(0x5a5464, 1);
    g.fillRect(m.x, m.y, (ww.castleRight / ww.width) * m.w, m.h);
    stonePanel(g, L.goldLabel, 12);
    stonePanel(g, L.speedButton, 12);
    stonePanel(g, L.pauseButton, 12);
    // blacksmith panel
    const ip = L.ironPanel;
    stonePanel(g, ip, 12, 0.96, false);
    g.fillStyle(0x0c0a10, 1);
    g.fillRoundedRect(ip.x + 6, ip.y + 7, 48, 48, 6);
    g.lineStyle(2, 0x8a6a3a, 1);
    g.strokeRoundedRect(ip.x + 6, ip.y + 7, 48, 48, 6);
    trough(g, { x: ip.x + 8, y: ip.y + 62, w: ip.w - 16, h: 8 });
    // rally banner pole plate
    const rb = L.rallyButton;
    ironRing(g, rb.x + rb.w / 2, rb.y + rb.h / 2, rb.w / 2 - 2, 0x2a2232);
    for (let i = 0; i < L.unitSlots.length; i++) {
      const r = L.unitSlots[i];
      if (i < nUnits) {
        woodPanel(g, r, 9);
        g.fillStyle(0x140c08, 0.75);
        g.fillRoundedRect(r.x + 8, r.y + r.h - 24, r.w - 16, 20, 9);
      } else {
        g.fillStyle(0x000000, 0.22);
        g.fillRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10);
        g.lineStyle(2, 0x8a6a4a, 0.25);
        g.strokeRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10);
      }
    }
    for (let i = 0; i < L.spellButtons.length && i < nSpells; i++) {
      const r = L.spellButtons[i];
      ironRing(g, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0x241a30);
      g.fillStyle(0x0c0a10, 0.9);
      g.fillRoundedRect(r.x + r.w / 2 - 27, r.y + r.h - 17, 54, 21, 10);
      g.lineStyle(1.5, 0x4a6aa0, 0.9);
      g.strokeRoundedRect(r.x + r.w / 2 - 27, r.y + r.h - 17, 54, 21, 10);
    }
    if (dodge) {
      const d = L.dodgeButton;
      ironRing(g, d.x + d.w / 2, d.y + d.h / 2, d.w / 2, 0x223650);
    }
    if (aiming) {
      const c = L.cancelAimButton;
      ironRing(g, c.x + c.w / 2, c.y + c.h / 2, c.w / 2, 0x8a2a24);
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

    // --- portrait + bars
    const ash = findEntity(w as never, w.ashId) as EntityState | undefined;
    const ashHp = ash ? Math.max(0, Math.ceil(ash.hp)) : 0;
    const ashMax = ash ? Math.ceil(ash.maxHp) : 1;
    const ashFrac = ashMax > 0 ? ashHp / ashMax : 0;
    if (this.ashHurt > 0) this.ashHurt -= dt;
    const ap = L.ashPortrait;
    if (this.ashHurt > 0) this.portrait.setTint(0xff7060);
    else if (ashFrac < 0.3 && ashHp > 0) this.portrait.setTint(Math.sin(this.clock * 6) > 0 ? 0xffb0a0 : 0xffffff);
    else if (ashHp <= 0) this.portrait.setTint(0x605860);
    else this.portrait.clearTint();
    this.portrait.setScale(this.portraitBase * (this.ashHurt > 0 ? 1.06 : 1));
    if (ashFrac < 0.3) {
      go.lineStyle(3, 0xff3a2a, 0.5 + 0.4 * Math.sin(this.clock * 6));
      go.strokeRoundedRect(ap.x - 1, ap.y - 1, ap.w + 2, ap.h + 2, 9);
    }
    barFill(gu, L.ashBar, ashFrac, ashFrac < 0.3 ? 0xe8483a : 0x52c85a);
    if (ashHp !== this.last.ash || ashMax !== this.last.ashMax) {
      this.last.ash = ashHp;
      this.last.ashMax = ashMax;
      this.ashNum.setText(numStr(ashHp));
    }
    const bookHp = Math.max(0, Math.ceil(w.book.hp));
    if (this.bookFlash > 0) this.bookFlash -= dt;
    const bookFrac = w.book.maxHp > 0 ? w.book.hp / w.book.maxHp : 0;
    barFill(gu, L.bookBar, bookFrac, this.bookFlash > 0 && Math.sin(this.clock * 40) > 0 ? 0xffffff : bookFrac < 0.3 ? 0xe86a3a : 0x9a6ad8);
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
      for (const mk of this.markers) mk.setVisible(false);
      const frac = clamp01(w.boss.hpFrac);
      barFill(gu, wb, frac, 0xc0283e, 8);
      const def = view.data.bosses.get(w.boss.bossId);
      if (def) {
        for (const ph of def.phases) {
          if (ph.untilHpFrac <= 0 || ph.untilHpFrac >= 1) continue;
          const tx = wb.x + wb.w * ph.untilHpFrac;
          go.fillStyle(0xffffff, 0.95);
          go.fillRect(tx - 1.5, wb.y - 4, 3, wb.h + 8);
          go.fillStyle(0x140c08, 1);
          go.fillRect(tx - 0.5, wb.y, 1, wb.h);
        }
      }
      go.lineStyle(2, 0xff6a7a, 0.35 + 0.25 * Math.sin(this.clock * 5));
      go.strokeRoundedRect(wb.x - 3, wb.y - 3, wb.w + 6, wb.h + 6, 10);
    } else {
      this.waveText.setVisible(true);
      this.bossText.setVisible(false);
      this.remainIcon.setVisible(true);
      this.remainNum.setVisible(true);
      const tot = Math.max(1, w.wave.enemiesTotal);
      const frac = clamp01(w.wave.enemiesKilled / tot);
      const spawned = clamp01(w.wave.enemiesSpawned / tot);
      // spawned (dim) then killed (bright)
      barFill(gu, wb, spawned, 0x4a3060, 8);
      barFill(gu, wb, frac, 0x9a3ad0, 8);
      const remain = Math.max(0, w.wave.enemiesTotal - w.wave.enemiesKilled);
      if (remain !== this.last.remain) {
        this.last.remain = remain;
        this.remainNum.setText(numStr(remain));
      }
      // skull markers where each sub-wave starts; lit once that sub-wave has begun
      const mk = w.wave.markers;
      for (let i = 0; i < this.markers.length; i++) {
        const img = this.markers[i];
        const p = i < mk.length ? mk[i] : -1;
        if (p <= 0.001 || p >= 0.999) {
          img.setVisible(false);
          continue;
        }
        const lit = spawned >= p - 1e-3;
        const x = wb.x + wb.w * p;
        img.setVisible(true).setPosition(x, wb.y + 1);
        img.setScale(this.markerBase * (lit ? 1.05 : 0.9));
        if (lit) img.setTint(0xffb0a0);
        else img.setTint(0x8a8090);
        go.fillStyle(0x140c08, 1);
        go.fillRect(x - 1, wb.y + 6, 2, wb.h - 6);
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
    this.goldIcon.setScale(this.goldBase * (1 + this.goldBump * 0.25));
    this.goldNum.setFontSize(26 * (1 + this.goldBump * 0.12));
    this.goldNum.setTint(SKIN.gold);

    // --- speed / pause
    const sb = L.speedButton;
    if (view.speed === 2) {
      go.fillStyle(0xffd34d, 0.28);
      go.fillRoundedRect(sb.x + 3, sb.y + 3, sb.w - 6, sb.h - 6, 10);
    }
    this.speedNum.setText(view.speed === 2 ? 'x2' : 'x1');
    this.speedNum.setTint(view.speed === 2 ? 0xffd34d : 0xc9bfd6);
    this.pressFx(go, sb, this.pressSpeed, 12);
    this.pressFx(go, L.pauseButton, this.pressPause, 12);
    this.speedIcon.setScale((28 / 48 / this.R) * (this.pressSpeed ? 0.88 : 1));
    this.pauseIcon.setScale((30 / 48 / this.R) * (this.pressPause ? 0.88 : 1));

    // --- blacksmith panel
    this.drawSmith(view, dt);

    // --- rally banner
    this.drawRally(view, dt);

    // --- combo
    this.drawCombo(view, dt);

    // --- unit slots
    const r = w.resources;
    for (let i = 0; i < this.units.length; i++) this.drawUnitSlot(i, i < nUnits ? w.summonSlots[i] : null, r.iron, dt);
    // --- spells
    const aimSlot = view.aim.slot;
    for (let i = 0; i < this.spells.length; i++) this.drawSpell(i, i < nSpells ? w.spellSlots[i] : null, r.mana, aimSlot === i, dt);

    // --- dodge / cancel
    const d = L.dodgeButton;
    this.dodgeIcon.setVisible(w.dodge.unlocked);
    this.dodgeHint.setVisible(w.dodge.unlocked && this.showKeys);
    if (w.dodge.unlocked) {
      this.dodgeIcon.setScale((44 / 48 / this.R) * (this.pressDodge ? 0.88 : 1));
      if (w.dodge.cooldownLeft > 0 && w.dodge.cooldownTotal > 0) this.sweep(go, d.x + d.w / 2, d.y + d.h / 2, d.w / 2 - 5, w.dodge.cooldownLeft / w.dodge.cooldownTotal);
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
      this.showBanner(this.view.t(won ? 'ui.victory' : 'ui.defeat'), sub, 3, won ? C.gold : '#ff7a6a', 76);
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      const k = 1 - this.bannerT / this.bannerMax;
      const a = k < 0.12 ? k / 0.12 : this.bannerT < 0.5 ? this.bannerT / 0.5 : 1;
      this.banner.setAlpha(a).setScale(k < 0.12 ? 0.7 + easeOutBack(k / 0.12) * 0.3 : 1);
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

  private drawSmith(view: RenderView, dt: number): void {
    const w = view.world;
    const L = this.layout;
    const ip = L.ironPanel;
    const gu = this.gUnder;
    const go = this.gOver;
    const sm = w.smith;
    const r = w.resources;
    if (sm.level !== this.lastLevel) {
      this.lastLevel = sm.level;
      this.smithLevel.setText(view.t('ui.smith_level', { n: Math.max(1, sm.level) }));
    }
    const iron = Math.floor(r.iron);
    const ironMax = Math.floor(r.ironMax);
    if (iron !== this.last.iron) {
      this.last.iron = iron;
      this.ironNum.setText(numStr(iron));
    }
    if (ironMax !== this.last.ironMax || iron !== this.last.iron || this.ironMax.text === '') {
      this.last.ironMax = ironMax;
      this.ironMax.setText(`/${numStr(ironMax)}`);
    }
    this.ironMax.setX(this.ironNum.x + this.ironNum.width + 2);
    const full = r.ironMax > 0 && r.iron >= r.ironMax;
    this.ironNum.setTint(full ? SKIN.gold : 0xffffff);
    // blue progress to the next whole iron (systems fills world.smith.progress)
    const bar = { x: ip.x + 8, y: ip.y + 62, w: ip.w - 16, h: 8 };
    barFill(gu, bar, full ? 1 : clamp01(sm.progress), full ? 0xd8b048 : 0x3a9cff, 4);
    // upgrade cost
    const maxed = sm.level >= sm.maxLevel || sm.upgradeCost <= 0;
    const cost = maxed ? -1 : sm.upgradeCost;
    if (cost !== this.lastCost) {
      this.lastCost = cost;
      this.smithCost.setText(maxed ? view.t('ui.smith_max') : `${numStr(cost)}`);
    }
    const afford = !maxed && r.iron >= sm.upgradeCost;
    this.smithCost.setTint(maxed ? SKIN.gold : afford ? 0x9fe08a : 0xc0b0a0);
    this.anvilIcon.setAlpha(maxed ? 0.5 : 1);
    if (afford) {
      go.lineStyle(2, 0x9fe08a, 0.45 + 0.3 * Math.sin(this.clock * 5));
      go.strokeRoundedRect(ip.x - 1, ip.y - 1, ip.w + 2, ip.h + 2, 13);
    }
    if (this.smithFlash > 0) {
      this.smithFlash = Math.max(0, this.smithFlash - dt * 1.6);
      go.fillStyle(0xffd76a, 0.35 * this.smithFlash);
      go.fillRoundedRect(ip.x, ip.y, ip.w, ip.h, 12);
      this.smithLevel.setScale(1 + 0.4 * this.smithFlash);
    } else this.smithLevel.setScale(1);
    let shake = 0;
    if (this.smithDeny > 0) {
      this.smithDeny -= dt;
      shake = Math.sin(this.clock * 70) * 3;
      go.lineStyle(3, 0xff3b3b, 0.95);
      go.strokeRoundedRect(ip.x - 1, ip.y - 1, ip.w + 2, ip.h + 2, 13);
    }
    this.smithFace.setX(ip.x + 30 + shake);
    if (this.pressSmith) this.pressFx(go, ip, true, 12);
  }

  private drawRally(view: RenderView, dt: number): void {
    const rb = this.layout.rallyButton;
    const mode = view.world.rally === 'hold' ? 'hold' : 'advance';
    if (mode !== this.rallyShown) {
      this.rallyShown = mode;
      setIcon(this.rallyIcon, mode === 'hold' ? 'ui_banner_hold' : 'ui_banner_advance', 'ui_dodge', rb.w - 16, rb.h - 16);
    }
    const base = Math.min((rb.w - 16) / this.rallyIcon.frame.realWidth, (rb.h - 16) / this.rallyIcon.frame.realHeight);
    if (this.rallyPop > 0) this.rallyPop = Math.max(0, this.rallyPop - dt * 3);
    const sway = Math.sin(this.clock * 2.2) * 0.04;
    this.rallyIcon.setScale(base * (1 + this.rallyPop * 0.2) * (this.pressRally ? 0.9 : 1)).setRotation(sway);
    const go = this.gOver;
    if (mode === 'hold') {
      go.lineStyle(3, 0xffc84a, 0.8);
      go.strokeCircle(rb.x + rb.w / 2, rb.y + rb.h / 2, rb.w / 2 + 1);
    }
  }

  private drawCombo(view: RenderView, dt: number): void {
    const c = view.world.combo;
    const go = this.gOver;
    const on = c.count >= 2;
    if (c.count !== this.lastCombo) {
      this.lastCombo = c.count;
      if (on) this.comboNum.setText(`x${c.count}`);
    }
    this.comboNum.setVisible(on);
    this.comboLabel.setVisible(on);
    if (on) {
      if (this.comboPop > 0) this.comboPop = Math.max(0, this.comboPop - dt * 4);
      const s = 1 + 0.45 * this.comboPop;
      this.comboNum.setScale(s);
      const hot = c.count >= 20 ? '#ff6a3a' : c.count >= 10 ? '#ffb040' : SKIN.goldText;
      if (this.comboNum.style.color !== hot) this.comboNum.setColor(hot);
      // time left of the streak
      const k = c.window > 0 ? clamp01(c.timeLeft / c.window) : 0;
      const bw = 90;
      const x = this.comboLabel.x - bw / 2;
      const y = this.comboLabel.y + 14;
      go.fillStyle(0x0c0a10, 0.85);
      go.fillRoundedRect(x - 2, y - 2, bw + 4, 8, 4);
      go.fillStyle(k < 0.3 ? 0xff6a3a : 0xffc84a, 1);
      go.fillRoundedRect(x, y, Math.max(2, bw * k), 4, 2);
    }
    if (this.comboBonusT > 0) {
      this.comboBonusT -= dt;
      const a = this.comboBonusT < 0.4 ? this.comboBonusT / 0.4 : 1;
      this.comboBonus.setAlpha(a).setY(this.layout.goldLabel.y + this.layout.goldLabel.h + 100 - (1.6 - this.comboBonusT) * 14);
      if (this.comboBonusT <= 0) this.comboBonus.setVisible(false);
    }
  }

  private pressFx(g: Phaser.GameObjects.Graphics, r: Rect, down: boolean, rad: number): void {
    if (!down) return;
    g.fillStyle(0xffffff, 0.16);
    g.fillRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, rad);
    g.lineStyle(3, 0xffe8b0, 0.85);
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

  private setSlotIcon(s: SlotUi, id: string, fallback: string, maxW: number, maxH: number): void {
    if (s.shown === id) return;
    s.shown = id;
    setIcon(s.icon, id, fallback, maxW, maxH);
    s.baseScale = s.icon.scaleX;
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
    const sprite = def?.sprite ?? slot.unitId;
    this.setSlotIcon(s, `portrait_${sprite}`, sprite, r.w - 12, r.h - 30);
    const pressed = this.pressUnit[i];
    const shake = this.denyUnit[i] > 0 ? Math.sin(this.clock * 70) * 3 : 0;
    s.icon.setVisible(true).setPosition(r.x + r.w / 2 + shake, r.y + 4 + (r.h - 30) / 2).setScale(s.baseScale * (pressed ? 0.9 : 1));
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
    s.icon.setAlpha(affordable && slot.available ? 1 : 0.45);
    if (affordable && slot.available) s.icon.clearTint();
    else s.icon.setTint(0x8a8090);
    s.cost.setTint(affordable ? 0xffffff : 0xff6a5a);
    if (!slot.available || !affordable) {
      go.fillStyle(0x07040b, 0.3);
      go.fillRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 9);
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
      go.lineStyle(2, 0xffd76a, 0.45 + 0.3 * Math.sin(this.clock * 4));
      go.strokeRoundedRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, 10);
    }
    if (pressed) this.pressFx(go, r, true, 9);
    if (this.denyUnit[i] > 0) {
      go.lineStyle(4, 0xff3b3b, 0.95);
      go.strokeRoundedRect(r.x, r.y, r.w, r.h, 10);
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
    const iconId = def?.icon ?? `icon_${slot.spellId}`;
    this.setSlotIcon(s, iconId, iconId, r.w - 20, r.h - 20);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const pressed = this.pressSpell[i];
    const shake = this.denySpell[i] > 0 ? Math.sin(this.clock * 70) * 3 : 0;
    s.icon.setVisible(true).setPosition(cx + shake, cy - 2).setScale(s.baseScale * (pressed ? 0.9 : 1));
    s.costIcon.setVisible(true);
    s.cost.setVisible(true);
    s.key.setVisible(this.showKeys);
    const cost = Math.ceil(slot.manaCost);
    if (cost !== s.lastCost) {
      s.lastCost = cost;
      s.cost.setText(numStr(cost));
    }
    const affordable = mana >= slot.manaCost;
    s.icon.setAlpha(affordable ? 1 : 0.55);
    if (affordable) s.icon.clearTint();
    else s.icon.setTint(0x8090a8);
    s.cost.setTint(affordable ? 0xbfe6ff : 0xff6a5a);
    // mana ring
    const rr = r.w / 2 + 6;
    const f = slot.manaCost > 0 ? clamp01(mana / slot.manaCost) : 1;
    gu.lineStyle(7, 0x0c0a10, 0.9);
    gu.strokeCircle(cx, cy, rr);
    gu.lineStyle(4, f >= 1 ? 0x8fdcff : 0x2f6fd0, 1);
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
      if (f >= 1) {
        go.lineStyle(2, 0xbfe6ff, 0.25 + 0.25 * Math.sin(this.clock * 4 + i));
        go.strokeCircle(cx, cy, r.w / 2 - 3);
      }
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
    g.lineStyle(1.5, 0xffe8c0, 0.6);
    g.strokeRect(m.x + view.cameraX * sx, m.y - 2, this.layout.viewW * sx, m.h + 4);
    // book
    g.fillStyle(0x9a6ad8, 1);
    g.fillRect(m.x + view.data.balance.world.bookX * sx - 2, m.y + 1, 4, m.h - 2);
    const ents = w.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive || e.hp <= 0) continue;
      const x = m.x + e.x * sx;
      switch (e.kind) {
        case 'ally':
          g.fillStyle(0x6aa8ff, 1);
          g.fillRect(x - 1.5, m.y + 2, 3, 4);
          break;
        case 'hero':
          g.fillStyle(0xffd34d, 1);
          g.fillRect(x - 2, m.y + 1, 4, 6);
          break;
        case 'enemy':
          g.fillStyle(0xff5a4f, 1);
          g.fillRect(x - 1.5, e.flying ? m.y : m.y + 2, 3, 4);
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
    this.markers = [];
    this.pause.destroy();
  }
}
