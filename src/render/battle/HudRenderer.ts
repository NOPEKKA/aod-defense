/**
 * Battle HUD v3 ("war ledger" materials, ART_BIBLE section 8), drawn ONLY at the core/layout
 * rects (controls hit-tests the same rects):
 *   top-left     Ash portrait in a riveted iron frame, blood HP bar, smaller Necronomicon bar,
 *                pause plaque under the portrait
 *   top-centre   wave bar with skull markers (boss HP bar during a boss), minimap under it
 *   top-right    gold purse, speed plaque; the combo counter pops under them
 *   bottom-left  rally ring, blacksmith plaque (portrait, level, SILVER count + cap, silver
 *                progress, upgrade cost), oak unit boards with portraits and silver costs
 *   bottom-right iron spell rings (icon, mana groove, cooldown sweep), dodge ring
 * Every frame, plank, ring and bar is a pre-built kit image / NineSlice made once in create()
 * and only repositioned on relayout; bar fills are cropped images. A Graphics layer draws the
 * small dynamic overlays (sweeps, glints, minimap dots) without allocations.
 */
import type { BattleRenderer, EntityState, EventBus, GameEvents, HudLayout, Rect, RenderView, Unsubscribe } from '../../contracts';
import { findEntity } from '../../core/world';
import { atlasScale, spriteFrame } from '../art/atlas';
import { FONT_UI, FONT_UI_L } from '../art/build';
import { C, addText, clamp01, easeOutBack, numStr } from '../style';
import { KIT, KIT_RES, SKIN, nine, setIcon } from '../ui/skin';
import { DEPTH } from './depth';
import { PauseMenu } from './PauseMenu';

const D_STATIC = DEPTH.hud;
const D_UNDER = DEPTH.hud + 5;
const D_ICON = DEPTH.hud + 10;
const D_FRAME = DEPTH.hud + 15;
const D_OVER = DEPTH.hud + 20;
const D_NUM = DEPTH.hud + 30;
const D_BANNER = DEPTH.hud + 100;
const MAX_MARKERS = 10;

const BONE = 0xefe3c4;
const HP_COL = 0xc4281a;
const HP_LOW = 0xff4a2a;
const BOOK_COL = 0x5fae86;
const BOOK_LOW = 0xe0702a;
const WAVE_SPAWNED = 0x6a4030;
const WAVE_KILLED = 0xb3281c;
const BOSS_COL = 0x9a1430;
const SILVER_BAR = 0xbcc8d6;

interface SlotUi {
  icon: Phaser.GameObjects.Image;
  costIcon: Phaser.GameObjects.Image;
  cost: Phaser.GameObjects.BitmapText;
  cd: Phaser.GameObjects.BitmapText;
  key: Phaser.GameObjects.BitmapText;
  /** board / ring art (and the empty board for unit slots) */
  art: Phaser.GameObjects.Image;
  empty: Phaser.GameObjects.Image | null;
  pill: Phaser.GameObjects.NineSlice | null;
  shown: string;
  lastCost: number;
  lastCd: number;
  baseScale: number;
}

/** a horizontal bar: iron trough + cropped fill image(s) */
interface Bar {
  trough: Phaser.GameObjects.NineSlice;
  back: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Image;
  w: number;
  lastBack: number;
  lastFill: number;
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
  private gOver!: Phaser.GameObjects.Graphics;
  private objs: Phaser.GameObjects.GameObject[] = [];
  // static kit art
  private portraitBack!: Phaser.GameObjects.NineSlice;
  private portraitFrame!: Phaser.GameObjects.Image;
  private pausePlate!: Phaser.GameObjects.NineSlice;
  private speedPlate!: Phaser.GameObjects.NineSlice;
  private goldPlate!: Phaser.GameObjects.NineSlice;
  private smithPlate!: Phaser.GameObjects.NineSlice;
  private smithFrame!: Phaser.GameObjects.Image;
  private rallyRing!: Phaser.GameObjects.Image;
  private dodgeRing!: Phaser.GameObjects.Image;
  private cancelRing!: Phaser.GameObjects.Image;
  private miniTrough!: Phaser.GameObjects.NineSlice;
  private ashBar!: Bar;
  private bookBar!: Bar;
  private waveBar!: Bar;
  private smithBar!: Bar;
  // icons and numbers
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
  // blacksmith plaque (silver)
  private smithFace!: Phaser.GameObjects.Image;
  private smithLevel!: Phaser.GameObjects.Text;
  private ironIcon!: Phaser.GameObjects.Image;
  private ironBase = 1;
  private ironNum!: Phaser.GameObjects.BitmapText;
  private ironMax!: Phaser.GameObjects.BitmapText;
  private anvilIcon!: Phaser.GameObjects.Image;
  private smithCost!: Phaser.GameObjects.BitmapText;
  private smithHint!: Phaser.GameObjects.BitmapText;
  private smithFlash = 0;
  private smithDeny = 0;
  private silverBump = 0;
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
  private last = { ash: -1, ashMax: -1, book: -1, gold: -1, iron: -1, ironMax: -1, remain: -1, speed: -1 };
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
    const plate = (frame: string, res = KIT_RES) => keep(nine(scene, frame, 0, 0, 64, 64, res).setDepth(D_STATIC));
    const art = (frame: string, depth: number = D_STATIC) => keep(scene.add.image(0, 0, KIT, frame).setDepth(depth));
    const icon = (key: string) => keep(this.img(key));
    const num = (large: boolean, size: number) => keep(scene.add.bitmapText(0, 0, large ? FONT_UI_L : FONT_UI, '', size).setDepth(D_NUM));
    const bar = (res = KIT_RES): Bar => ({
      trough: plate('bar_trough', res),
      back: art('bar_fill', D_UNDER).setOrigin(0, 0).setVisible(false),
      fill: art('bar_fill', D_UNDER + 1).setOrigin(0, 0),
      w: 1,
      lastBack: -1,
      lastFill: -1,
    });

    // --- static kit art
    this.portraitBack = plate('iron_plate');
    this.portraitFrame = art('portrait_frame', D_FRAME);
    this.pausePlate = plate('iron_plate');
    this.speedPlate = plate('iron_plate');
    this.goldPlate = plate('iron_plate');
    this.smithPlate = plate('iron_plate');
    this.smithFrame = art('portrait_frame', D_FRAME);
    this.rallyRing = art('ring_small');
    this.dodgeRing = art('ring_small');
    this.cancelRing = art('ring_small').setTint(0xe07060);
    this.ashBar = bar();
    this.bookBar = bar();
    this.waveBar = bar();
    this.waveBar.back.setVisible(true);
    this.smithBar = bar(4);
    this.miniTrough = plate('bar_trough', 4);
    this.gOver = keep(scene.add.graphics().setDepth(D_OVER));

    // --- icons / numbers
    this.portrait = icon('ui_ash');
    this.bookIcon = icon('ui_book');
    this.ashNum = num(false, 15).setOrigin(1, 0.5);
    this.bookNum = num(false, 12).setOrigin(1, 0.5);
    this.waveText = keep(addText(scene, 0, 0, '', 15, { originY: 0.5 }).setDepth(D_NUM));
    this.bossText = keep(addText(scene, 0, 0, '', 15, { originY: 0.5, color: '#ffd8d0' }).setDepth(D_NUM));
    this.remainIcon = icon('ui_skull');
    this.remainNum = num(false, 14).setOrigin(1, 0.5);
    for (let i = 0; i < MAX_MARKERS; i++) this.markers.push(icon('ui_skull').setVisible(false));
    this.goldIcon = icon('coin_gold');
    this.goldNum = num(true, 26).setOrigin(0, 0.5);
    this.speedIcon = icon('ui_speed').setTint(BONE);
    this.speedNum = num(false, 13).setOrigin(0.5, 0.5);
    this.pauseIcon = icon('ui_pause').setTint(BONE);
    this.pauseHint = num(false, 11).setOrigin(0, 0).setText('P').setTint(0xbcaa86);
    this.speedHint = num(false, 11).setOrigin(0, 0).setText('F').setTint(0xbcaa86);

    this.smithFace = icon('fallback_ally');
    this.smithLevel = keep(addText(scene, 0, 0, '', 17, { originX: 0.5, originY: 0.5, color: C.gold, font: 'head', stroke: 2 }).setDepth(D_NUM));
    this.ironIcon = icon('coin_silver');
    this.ironNum = num(true, 27).setOrigin(0, 0.5);
    this.ironMax = num(false, 13).setOrigin(0, 0.5).setTint(0xb8c2cc);
    this.anvilIcon = icon('ui_anvil');
    this.smithCost = num(false, 13).setOrigin(0, 0.5);
    this.smithHint = num(false, 11).setOrigin(1, 0).setText('B').setTint(0xbcaa86);
    this.rallyIcon = icon('ui_dodge');
    this.rallyHint = num(false, 11).setOrigin(0, 0).setText('G').setTint(0xbcaa86);
    this.comboNum = keep(addText(scene, 0, 0, '', 40, { originX: 0.5, originY: 0.5, color: SKIN.goldText, font: 'head', stroke: 3, shadow: true }).setDepth(D_NUM).setVisible(false));
    this.comboLabel = keep(addText(scene, 0, 0, '', 15, { originX: 0.5, originY: 0.5, color: '#ffb070', stroke: 2 }).setDepth(D_NUM).setVisible(false));
    this.comboBonus = keep(addText(scene, 0, 0, '', 20, { originX: 0.5, originY: 0.5, color: SKIN.goldText, stroke: 2, shadow: true }).setDepth(D_NUM).setVisible(false));

    for (let i = 0; i < view.layout.unitSlots.length; i++) {
      const s = this.makeSlot(keep, String(i + 1), 'coin_silver');
      s.art = art('slot_unit');
      s.empty = art('slot_empty');
      this.units.push(s);
      this.pressUnit.push(false);
      this.denyUnit.push(0);
    }
    for (let i = 0; i < view.layout.spellButtons.length; i++) {
      const s = this.makeSlot(keep, SPELL_KEYS[i] ?? '', 'ui_mana');
      s.art = art('ring_spell');
      s.pill = plate('bar_trough').setDepth(D_STATIC + 1);
      this.spells.push(s);
      this.pressSpell.push(false);
      this.denySpell.push(0);
    }
    this.dodgeIcon = icon('ui_dodge').setTint(BONE);
    this.dodgeHint = num(false, 11).setOrigin(0.5, 0).setText('SPACE').setTint(0xbcaa86);
    this.cancelIcon = icon('ui_cancel').setTint(BONE);
    this.fpsText = num(false, 14).setOrigin(0, 0);
    this.banner = keep(addText(scene, 0, 0, '', 48, { originX: 0.5, originY: 0.5, align: 'center', font: 'head', stroke: 3, shadow: true }).setDepth(D_BANNER));
    this.bannerSub = keep(addText(scene, 0, 0, '', 22, { originX: 0.5, originY: 0.5, align: 'center', color: SKIN.goldText, stroke: 2, shadow: true }).setDepth(D_BANNER));
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
      else if ((p.pickup as string) === 'silver') this.silverBump = 1;
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
    this.portraitBase = this.fitIcon(this.portrait, 'portrait_ash', 'ash', 62, 62);
    this.fitIcon(this.smithFace, 'portrait_npc_blacksmith', 'fallback_ally', 36, 36);
    this.refreshLabels();
    this.relayout(view.layout);
  }

  private img(key: string): Phaser.GameObjects.Image {
    const f = spriteFrame('px');
    const img = this.scene.add.image(0, 0, f.tex, f.frame).setOrigin(0.5, 0.5).setDepth(D_ICON);
    setIcon(img, key, key, 32, 32);
    return img;
  }

  /** baked icon or generated frame fitted into w x h; returns the resulting scale */
  private fitIcon(img: Phaser.GameObjects.Image, id: string, fallback: string, w: number, h: number): number {
    setIcon(img, id, fallback, w, h);
    return img.scaleX;
  }

  private makeSlot(keep: <T extends Phaser.GameObjects.GameObject>(o: T) => T, hint: string, costKey: string): SlotUi {
    const s = this.scene;
    const icon = keep(this.img('px'));
    const costIcon = keep(this.img(costKey));
    setIcon(costIcon, costKey, costKey, 16, 16);
    const cost = keep(s.add.bitmapText(0, 0, FONT_UI, '', 15).setOrigin(0, 0.5).setDepth(D_NUM));
    const cd = keep(s.add.bitmapText(0, 0, FONT_UI_L, '', 26).setOrigin(0.5, 0.5).setDepth(D_NUM));
    const key = keep(s.add.bitmapText(0, 0, FONT_UI, hint, 12).setOrigin(0, 0).setDepth(D_NUM).setTint(0xe8d8b4));
    return { icon, costIcon, cost, cd, key, art: icon, empty: null, pill: null, shown: '', lastCost: -1, lastCd: -1, baseScale: 1 };
  }

  private showBanner(text: string, sub: string, seconds: number, color: string = C.text, size = 52): void {
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

  private placeBar(b: Bar, r: Rect, pad: number): void {
    const res = 1 / b.trough.scaleX;
    b.trough.setPosition(r.x - pad, r.y - pad).setSize((r.w + pad * 2) * res, (r.h + pad * 2) * res);
    b.fill.setPosition(r.x, r.y).setDisplaySize(r.w, r.h);
    b.back.setPosition(r.x, r.y).setDisplaySize(r.w, r.h);
    b.w = b.fill.frame.realWidth;
    b.lastBack = -1;
    b.lastFill = -1;
  }

  /** crops a fill image to `frac` of its width (only when the visible pixel width changes) */
  private setBar(img: Phaser.GameObjects.Image, b: Bar, frac: number, back: boolean): void {
    const px = Math.round(b.w * clamp01(frac));
    if (back ? px === b.lastBack : px === b.lastFill) return;
    if (back) b.lastBack = px;
    else b.lastFill = px;
    img.setVisible(px > 0);
    img.setCrop(0, 0, px, img.frame.realHeight);
  }

  relayout(layout: HudLayout): void {
    this.layout = layout;
    const L = layout;
    const cy = (r: Rect) => r.y + r.h / 2;
    const cx = (r: Rect) => r.x + r.w / 2;
    const plateAt = (p: Phaser.GameObjects.NineSlice, r: Rect, grow = 0) => {
      p.setPosition(r.x - grow, r.y - grow).setSize((r.w + grow * 2) * KIT_RES, (r.h + grow * 2 + 2) * KIT_RES);
    };
    const ap = L.ashPortrait;
    plateAt(this.portraitBack, ap);
    this.portraitFrame.setPosition(cx(ap), cy(ap)).setDisplaySize(ap.w, ap.h);
    this.portrait.setPosition(cx(ap), cy(ap) + 1);
    this.placeBar(this.ashBar, L.ashBar, 4);
    this.placeBar(this.bookBar, L.bookBar, 3);
    this.placeBar(this.waveBar, L.waveBar, 4);
    this.bookIcon.setPosition(L.bookBar.x - 4, cy(L.bookBar));
    setIcon(this.bookIcon, 'ui_book', 'ui_book', 28, 28);
    this.ashNum.setPosition(L.ashBar.x + L.ashBar.w - 8, cy(L.ashBar));
    this.bookNum.setPosition(L.bookBar.x + L.bookBar.w - 8, cy(L.bookBar));
    this.waveText.setPosition(L.waveBar.x + 12, cy(L.waveBar));
    this.bossText.setPosition(L.waveBar.x + 12, cy(L.waveBar));
    this.remainIcon.setPosition(L.waveBar.x + L.waveBar.w - 46, cy(L.waveBar));
    setIcon(this.remainIcon, 'ui_skull', 'ui_skull', 18, 18);
    this.remainNum.setPosition(L.waveBar.x + L.waveBar.w - 10, cy(L.waveBar));
    for (const m of this.markers) setIcon(m, 'ui_skull', 'ui_skull', 22, 22);
    this.markerBase = this.markers[0]?.scaleX ?? 1;
    const m = L.minimap;
    this.miniTrough.setPosition(m.x - 3, m.y - 3).setSize((m.w + 6) * 4, Math.max(28, (m.h + 6) * 4));
    plateAt(this.goldPlate, L.goldLabel);
    plateAt(this.speedPlate, L.speedButton);
    plateAt(this.pausePlate, L.pauseButton);
    this.goldIcon.setPosition(L.goldLabel.x + 28, cy(L.goldLabel));
    this.goldBase = this.fitIcon(this.goldIcon, 'coin_gold', 'ui_gold', 32, 32);
    this.goldNum.setPosition(L.goldLabel.x + 50, cy(L.goldLabel));
    this.speedIcon.setPosition(cx(L.speedButton), cy(L.speedButton) - 6).setScale(26 / 48 / this.R);
    this.speedNum.setPosition(cx(L.speedButton), L.speedButton.y + L.speedButton.h - 13);
    this.pauseIcon.setPosition(cx(L.pauseButton), cy(L.pauseButton)).setScale(28 / 48 / this.R);
    this.pauseHint.setPosition(L.pauseButton.x + 9, L.pauseButton.y + 6).setVisible(this.showKeys);
    this.speedHint.setPosition(L.speedButton.x + 9, L.speedButton.y + 6).setVisible(this.showKeys);

    // blacksmith plaque: face top-left, big silver count beside it, progress, upgrade cost
    const ip = L.ironPanel;
    plateAt(this.smithPlate, ip);
    this.smithFrame.setPosition(ip.x + 27, ip.y + 27).setDisplaySize(42, 42);
    this.smithFace.setPosition(ip.x + 27, ip.y + 27);
    this.smithLevel.setPosition(ip.x + 27, ip.y + 53);
    this.ironIcon.setPosition(ip.x + 64, ip.y + 24);
    this.ironBase = this.fitIcon(this.ironIcon, 'coin_silver', 'coin_silver', 24, 24);
    this.ironNum.setPosition(ip.x + 78, ip.y + 25);
    this.ironMax.setPosition(ip.x + 66, ip.y + 47);
    this.placeBar(this.smithBar, { x: ip.x + 52, y: ip.y + 59, w: ip.w - 62, h: 7 }, 2);
    this.anvilIcon.setPosition(ip.x + 18, ip.y + ip.h - 16);
    setIcon(this.anvilIcon, 'ui_anvil', 'ui_iron', 22, 22);
    this.smithCost.setPosition(ip.x + 32, ip.y + ip.h - 15);
    this.smithHint.setPosition(ip.x + ip.w - 8, ip.y + ip.h - 22).setVisible(this.showKeys);
    // rally ring
    const rb = L.rallyButton;
    this.rallyRing.setPosition(cx(rb), cy(rb)).setDisplaySize(rb.w, rb.h);
    this.rallyIcon.setPosition(cx(rb), cy(rb));
    this.rallyShown = '';
    this.rallyHint.setPosition(rb.x + 4, rb.y + 2).setVisible(this.showKeys);
    // combo under the gold
    const comboX = L.goldLabel.x + L.goldLabel.w / 2 - 20;
    this.comboNum.setPosition(comboX, L.goldLabel.y + L.goldLabel.h + 44);
    this.comboLabel.setPosition(comboX, L.goldLabel.y + L.goldLabel.h + 74);
    this.comboBonus.setPosition(comboX, L.goldLabel.y + L.goldLabel.h + 100);

    for (let i = 0; i < this.units.length; i++) {
      const r = L.unitSlots[i];
      const s = this.units[i];
      s.art.setPosition(cx(r), r.y + r.h * 0.5 + 1).setDisplaySize(r.w, r.h + 2);
      s.empty?.setPosition(cx(r), r.y + r.h * 0.5 + 1).setDisplaySize(r.w, r.h + 2);
      s.costIcon.setPosition(cx(r) - 13, r.y + r.h * 0.84);
      s.cost.setPosition(cx(r) - 3, r.y + r.h * 0.84);
      s.cd.setPosition(cx(r), r.y + r.h * 0.4);
      s.key.setPosition(r.x + 9, r.y + 7).setVisible(this.showKeys);
      s.shown = '';
    }
    for (let i = 0; i < this.spells.length; i++) {
      const r = L.spellButtons[i];
      const s = this.spells[i];
      s.art.setPosition(cx(r), cy(r)).setDisplaySize(r.w * 1.24, r.h * 1.24);
      s.pill?.setPosition(cx(r) - 28, r.y + r.h - 16).setSize(56 * KIT_RES, 22 * KIT_RES);
      s.costIcon.setPosition(cx(r) - 12, r.y + r.h - 5);
      s.cost.setPosition(cx(r) - 2, r.y + r.h - 5);
      s.cd.setPosition(cx(r), cy(r));
      s.key.setPosition(r.x - 2, r.y - 4).setVisible(this.showKeys);
      s.shown = '';
    }
    const d = L.dodgeButton;
    this.dodgeRing.setPosition(cx(d), cy(d)).setDisplaySize(d.w, d.h);
    this.dodgeIcon.setPosition(cx(d), cy(d)).setScale(42 / 48 / this.R);
    this.dodgeHint.setPosition(cx(d), d.y + d.h - 2);
    const c = L.cancelAimButton;
    this.cancelRing.setPosition(cx(c), cy(c)).setDisplaySize(c.w, c.h);
    this.cancelIcon.setPosition(cx(c), cy(c)).setScale(30 / 48 / this.R);
    this.fpsText.setPosition(L.pauseButton.x + L.pauseButton.w + 12, L.pauseButton.y + 4);
    this.banner.setPosition(L.viewW / 2, 210);
    this.bannerSub.setPosition(L.viewW / 2, 262);
    this.sig = -1;
    this.pause.rebuild(L);
  }

  /** shows / hides the slot boards and rings that depend on the loadout */
  private applySig(nUnits: number, nSpells: number, dodge: boolean, aiming: boolean): void {
    for (let i = 0; i < this.units.length; i++) {
      const on = i < nUnits;
      this.units[i].art.setVisible(on);
      this.units[i].empty?.setVisible(!on);
    }
    for (let i = 0; i < this.spells.length; i++) {
      const on = i < nSpells;
      this.spells[i].art.setVisible(on);
      this.spells[i].pill?.setVisible(on);
    }
    this.dodgeRing.setVisible(dodge);
    this.cancelRing.setVisible(aiming);
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
      this.applySig(nUnits, nSpells, w.dodge.unlocked, aiming);
    }
    const go = this.gOver;
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
    const low = ashFrac < 0.3;
    if (low) {
      go.lineStyle(3, 0xff3a2a, 0.45 + 0.4 * Math.sin(this.clock * 6));
      go.strokeRoundedRect(ap.x - 2, ap.y - 2, ap.w + 4, ap.h + 4, 9);
    }
    this.setBar(this.ashBar.fill, this.ashBar, ashFrac, false);
    this.ashBar.fill.setTint(low && Math.sin(this.clock * 6) > 0 ? HP_LOW : HP_COL);
    if (ashHp !== this.last.ash || ashMax !== this.last.ashMax) {
      this.last.ash = ashHp;
      this.last.ashMax = ashMax;
      this.ashNum.setText(numStr(ashHp));
    }
    const bookHp = Math.max(0, Math.ceil(w.book.hp));
    if (this.bookFlash > 0) this.bookFlash -= dt;
    const bookFrac = w.book.maxHp > 0 ? w.book.hp / w.book.maxHp : 0;
    this.setBar(this.bookBar.fill, this.bookBar, bookFrac, false);
    this.bookBar.fill.setTint(this.bookFlash > 0 && Math.sin(this.clock * 40) > 0 ? 0xffffff : bookFrac < 0.3 ? BOOK_LOW : BOOK_COL);
    if (bookHp !== this.last.book) {
      this.last.book = bookHp;
      this.bookNum.setText(numStr(bookHp));
    }

    // --- wave / boss bar
    const wb = L.waveBar;
    const bar = this.waveBar;
    if (w.boss) {
      if (!this.bossText.visible || this.bossText.text === '') this.bossText.setText(view.t(w.boss.nameKey));
      this.waveText.setVisible(false);
      this.bossText.setVisible(true);
      this.remainIcon.setVisible(false);
      this.remainNum.setVisible(false);
      for (const mk of this.markers) mk.setVisible(false);
      this.setBar(bar.back, bar, 0, true);
      this.setBar(bar.fill, bar, w.boss.hpFrac, false);
      bar.fill.setTint(BOSS_COL);
      const def = view.data.bosses.get(w.boss.bossId);
      if (def) {
        for (const ph of def.phases) {
          if (ph.untilHpFrac <= 0 || ph.untilHpFrac >= 1) continue;
          const tx = wb.x + wb.w * ph.untilHpFrac;
          go.fillStyle(0xefe3c4, 0.95);
          go.fillRect(tx - 1.5, wb.y - 4, 3, wb.h + 8);
          go.fillStyle(0x140c08, 1);
          go.fillRect(tx - 0.5, wb.y, 1, wb.h);
        }
      }
      go.lineStyle(2, 0xff5a4a, 0.3 + 0.25 * Math.sin(this.clock * 5));
      go.strokeRoundedRect(wb.x - 5, wb.y - 5, wb.w + 10, wb.h + 10, 9);
    } else {
      this.waveText.setVisible(true);
      this.bossText.setVisible(false);
      this.remainIcon.setVisible(true);
      this.remainNum.setVisible(true);
      const tot = Math.max(1, w.wave.enemiesTotal);
      const frac = clamp01(w.wave.enemiesKilled / tot);
      const spawned = clamp01(w.wave.enemiesSpawned / tot);
      // spawned (dull) then killed (blood)
      this.setBar(bar.back, bar, spawned, true);
      bar.back.setTint(WAVE_SPAWNED);
      this.setBar(bar.fill, bar, frac, false);
      bar.fill.setTint(WAVE_KILLED);
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
        img.setScale(this.markerBase * (lit ? 1.05 : 0.88));
        if (lit) img.setTint(0xffc0a8);
        else img.setTint(0x8a8078);
        go.fillStyle(0x140c08, 0.9);
        go.fillRect(x - 1, wb.y + 7, 2, wb.h - 7);
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
    if (view.speed !== this.last.speed) {
      this.last.speed = view.speed;
      this.speedNum.setText(view.speed === 2 ? 'x2' : 'x1');
      this.speedNum.setTint(view.speed === 2 ? SKIN.gold : 0xbcaa86);
      this.speedIcon.setTint(view.speed === 2 ? SKIN.gold : BONE);
    }
    if (view.speed === 2) {
      go.lineStyle(2, SKIN.gold, 0.55);
      go.strokeRoundedRect(sb.x + 5, sb.y + 5, sb.w - 10, sb.h - 9, 6);
    }
    this.pressFx(go, sb, this.pressSpeed, 8);
    this.pressFx(go, L.pauseButton, this.pressPause, 8);
    this.speedIcon.setScale((26 / 48 / this.R) * (this.pressSpeed ? 0.88 : 1));
    this.pauseIcon.setScale((28 / 48 / this.R) * (this.pressPause ? 0.88 : 1));

    // --- blacksmith plaque
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
      this.dodgeIcon.setScale((42 / 48 / this.R) * (this.pressDodge ? 0.88 : 1));
      if (w.dodge.cooldownLeft > 0 && w.dodge.cooldownTotal > 0) this.sweep(go, d.x + d.w / 2, d.y + d.h / 2, d.w * 0.36, w.dodge.cooldownLeft / w.dodge.cooldownTotal);
      if (this.pressDodge) {
        go.lineStyle(3, 0xffe8b0, 0.85);
        go.strokeCircle(d.x + d.w / 2, d.y + d.h / 2, d.w / 2 - 3);
      }
    }
    this.cancelIcon.setVisible(aiming);
    if (aiming) {
      const c = L.cancelAimButton;
      this.cancelIcon.setScale((30 / 48 / this.R) * (this.pressCancel ? 0.85 : 1));
      if (this.pressCancel) {
        go.lineStyle(3, 0xffe8b0, 0.85);
        go.strokeCircle(c.x + c.w / 2, c.y + c.h / 2, c.w / 2 - 3);
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
      this.showBanner(this.view.t(won ? 'ui.victory' : 'ui.defeat'), sub, 3, won ? C.gold : '#ff7a6a', 84);
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
    const ip = this.layout.ironPanel;
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
    if (ironMax !== this.last.ironMax || this.ironMax.text === '') {
      this.last.ironMax = ironMax;
      this.ironMax.setText(`/${numStr(ironMax)}`);
    }
    const full = r.ironMax > 0 && r.iron >= r.ironMax;
    this.ironNum.setTint(full ? SKIN.gold : SKIN.silver);
    if (this.silverBump > 0) this.silverBump = Math.max(0, this.silverBump - dt * 5);
    this.ironIcon.setScale(this.ironBase * (1 + this.silverBump * 0.22));
    // silver progress to the next coin (systems fills world.smith.progress)
    this.setBar(this.smithBar.fill, this.smithBar, full ? 1 : clamp01(sm.progress), false);
    this.smithBar.fill.setTint(full ? SKIN.gold : SILVER_BAR);
    // upgrade cost
    const maxed = sm.level >= sm.maxLevel || sm.upgradeCost <= 0;
    const cost = maxed ? -1 : sm.upgradeCost;
    if (cost !== this.lastCost) {
      this.lastCost = cost;
      this.smithCost.setText(maxed ? view.t('ui.smith_max') : `${numStr(cost)}`);
    }
    const afford = !maxed && r.iron >= sm.upgradeCost;
    this.smithCost.setTint(maxed ? SKIN.gold : afford ? 0xb8e08a : 0xb0a090);
    this.anvilIcon.setAlpha(maxed ? 0.5 : 1);
    if (afford) {
      go.lineStyle(2, SKIN.gold, 0.4 + 0.3 * Math.sin(this.clock * 5));
      go.strokeRoundedRect(ip.x - 2, ip.y - 2, ip.w + 4, ip.h + 5, 9);
    }
    if (this.smithFlash > 0) {
      this.smithFlash = Math.max(0, this.smithFlash - dt * 1.6);
      go.fillStyle(0xffd76a, 0.3 * this.smithFlash);
      go.fillRoundedRect(ip.x + 4, ip.y + 4, ip.w - 8, ip.h - 6, 6);
      this.smithLevel.setScale(1 + 0.4 * this.smithFlash);
    } else this.smithLevel.setScale(1);
    let shake = 0;
    if (this.smithDeny > 0) {
      this.smithDeny -= dt;
      shake = Math.sin(this.clock * 70) * 3;
      go.lineStyle(3, 0xff3b3b, 0.95);
      go.strokeRoundedRect(ip.x - 2, ip.y - 2, ip.w + 4, ip.h + 5, 9);
    }
    this.smithFace.setX(ip.x + 27 + shake);
    if (this.pressSmith) this.pressFx(go, ip, true, 8);
  }

  private drawRally(view: RenderView, dt: number): void {
    const rb = this.layout.rallyButton;
    const mode = view.world.rally === 'hold' ? 'hold' : 'advance';
    if (mode !== this.rallyShown) {
      this.rallyShown = mode;
      setIcon(this.rallyIcon, mode === 'hold' ? 'ui_banner_hold' : 'ui_banner_advance', 'ui_dodge', rb.w - 22, rb.h - 22);
    }
    const base = Math.min((rb.w - 22) / this.rallyIcon.frame.realWidth, (rb.h - 22) / this.rallyIcon.frame.realHeight);
    if (this.rallyPop > 0) this.rallyPop = Math.max(0, this.rallyPop - dt * 3);
    const sway = Math.sin(this.clock * 2.2) * 0.04;
    this.rallyIcon.setScale(base * (1 + this.rallyPop * 0.2) * (this.pressRally ? 0.9 : 1)).setRotation(sway);
    if (mode === 'hold') {
      const go = this.gOver;
      go.lineStyle(3, SKIN.gold, 0.8);
      go.strokeCircle(rb.x + rb.w / 2, rb.y + rb.h / 2, rb.w / 2 - 1);
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
      go.fillStyle(0x0c0806, 0.85);
      go.fillRoundedRect(x - 2, y - 2, bw + 4, 8, 3);
      go.fillStyle(k < 0.3 ? 0xff6a3a : 0xe9c463, 1);
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
    g.fillStyle(0xffe8b0, 0.12);
    g.fillRoundedRect(r.x + 3, r.y + 3, r.w - 6, r.h - 4, rad);
    g.lineStyle(2, 0xffe8b0, 0.8);
    g.strokeRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 2, rad);
  }

  /** dark pie for the remaining cooldown fraction, shrinking clockwise */
  private sweep(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rad: number, frac: number): void {
    const f = clamp01(frac);
    if (f <= 0) return;
    g.fillStyle(0x070302, 0.62);
    g.slice(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + TAU * f, false);
    g.fillPath();
    g.lineStyle(2, 0xefe3c4, 0.55);
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
    // portrait well of the board: x 8..80, y 8..71 of 88 x 100
    this.setSlotIcon(s, `portrait_${sprite}`, sprite, r.w * 0.8, r.h * 0.62);
    const pressed = this.pressUnit[i];
    const shake = this.denyUnit[i] > 0 ? Math.sin(this.clock * 70) * 3 : 0;
    s.icon.setVisible(true).setPosition(r.x + r.w / 2 + shake, r.y + r.h * 0.4).setScale(s.baseScale * (pressed ? 0.9 : 1));
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
    s.icon.setAlpha(affordable && slot.available ? 1 : 0.5);
    if (affordable && slot.available) s.icon.clearTint();
    else s.icon.setTint(0x8a8078);
    s.cost.setTint(affordable ? SKIN.silver : 0xff6a5a);
    if (!slot.available || !affordable) {
      go.fillStyle(0x070302, 0.32);
      go.fillRoundedRect(r.x + 8, r.y + 8, r.w - 16, r.h * 0.63, 4);
    }
    if (cooling) {
      this.sweep(go, r.x + r.w / 2, r.y + r.h * 0.4, 28, slot.cooldownLeft / slot.cooldownTotal);
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
      go.lineStyle(2, SKIN.gold, 0.4 + 0.3 * Math.sin(this.clock * 4));
      go.strokeRoundedRect(r.x + 1, r.y + 1, r.w - 2, r.h - 1, 7);
    }
    if (pressed) this.pressFx(go, r, true, 7);
    if (this.denyUnit[i] > 0) {
      go.lineStyle(3, 0xff3b3b, 0.95);
      go.strokeRoundedRect(r.x + 1, r.y + 1, r.w - 2, r.h - 1, 7);
    }
  }

  private drawSpell(i: number, slot: RenderView['world']['spellSlots'][number] | null, mana: number, aiming: boolean, dt: number): void {
    const s = this.spells[i];
    const r = this.layout.spellButtons[i];
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
    this.setSlotIcon(s, iconId, iconId, r.w * 0.74, r.h * 0.74);
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
    s.cost.setTint(affordable ? 0xbfe0ff : 0xff6a5a);
    // mana fills the groove around the iron ring
    const rr = r.w * 0.56;
    const f = slot.manaCost > 0 ? clamp01(mana / slot.manaCost) : 1;
    if (f > 0) {
      go.lineStyle(5, f >= 1 ? 0x8fd0ff : 0x2f6fd0, f >= 1 ? 1 : 0.9);
      go.beginPath();
      go.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + TAU * f, false);
      go.strokePath();
    }
    const cooling = slot.cooldownLeft > 0 && slot.cooldownTotal > 0;
    if (cooling) {
      this.sweep(go, cx, cy, r.w * 0.39, slot.cooldownLeft / slot.cooldownTotal);
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
        go.lineStyle(2, 0xbfe6ff, 0.2 + 0.25 * Math.sin(this.clock * 4 + i));
        go.strokeCircle(cx, cy, r.w * 0.39);
      }
    }
    if (aiming) {
      go.lineStyle(4, SKIN.gold, 0.7 + 0.3 * Math.sin(this.clock * 10));
      go.strokeCircle(cx, cy, rr + 7);
    }
    if (pressed) {
      go.fillStyle(0xffe8b0, 0.14);
      go.fillCircle(cx, cy, r.w * 0.4);
    }
    if (this.denySpell[i] > 0) {
      go.lineStyle(4, 0xff3b3b, 0.95);
      go.strokeCircle(cx, cy, r.w * 0.5);
    }
  }

  private drawMinimap(view: RenderView): void {
    const g = this.gOver;
    const m = this.layout.minimap;
    const w = view.world;
    const ww = view.data.balance.world.width;
    const sx = m.w / ww;
    // castle ground
    const bw = view.data.balance.world;
    g.fillStyle(0x4a3a30, 0.9);
    g.fillRect(m.x, m.y + 1, (bw.castleRight / ww) * m.w, m.h - 2);
    // camera window
    g.lineStyle(1.5, 0xefe3c4, 0.6);
    g.strokeRect(m.x + view.cameraX * sx, m.y - 2, this.layout.viewW * sx, m.h + 4);
    // book
    g.fillStyle(BOOK_COL, 1);
    g.fillRect(m.x + bw.bookX * sx - 2, m.y + 1, 4, m.h - 2);
    const ents = w.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive || e.hp <= 0) continue;
      const x = m.x + e.x * sx;
      switch (e.kind) {
        case 'ally':
          g.fillStyle(0x7ab0e8, 1);
          g.fillRect(x - 1.5, m.y + 2, 3, 4);
          break;
        case 'hero':
          g.fillStyle(0xe9c463, 1);
          g.fillRect(x - 2, m.y + 1, 4, 6);
          break;
        case 'enemy':
          g.fillStyle(0xe0533c, 1);
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
      g.fillStyle(0xefe3c4, 1);
      g.fillRect(m.x + ash.x * sx - 2.5, m.y - 3, 5, m.h + 6);
      g.fillStyle(0x6aa8ff, 1);
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
