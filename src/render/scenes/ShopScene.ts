import { SceneKey, type UpgradeDef } from '../../contracts';
import { addArt, hasFrame } from '../art/atlas';
import { addIcon } from '../ui/skin';
import { C, addNum, addText, fitText, numStr } from '../style';
import { Button, ScrollArea, panel, toast } from '../ui/widgets';
import { MenuScene } from './MenuScene';

type Tab = UpgradeDef['category'];
const TABS: Tab[] = ['ash', 'army', 'spell', 'castle', 'mana'];
const TAB_ICON: Record<Tab, string> = { ash: 'ui_ash', army: 'ui_sword', spell: 'ui_spellbook', castle: 'ui_castle', mana: 'ui_mana' };
const ROW_ICON: Record<string, string> = {
  'ash.hp': 'ui_heart',
  'ash.melee': 'ui_sword',
  'ash.gun_damage': 'icon_super_boomstick',
  'ash.gun_rate': 'ui_speed',
  'ash.speed': 'ui_dodge',
  'ash.magnet': 'ui_gold',
  'castle.book_hp': 'ui_book',
  'castle.archers': 'unit_archer',
  'castle.catapult': 'wall_catapult',
  'castle.pit': 'ui_skull',
  'castle.smithy': 'ui_iron',
  'castle.iron_cap': 'ui_iron',
  'mana.max': 'ui_mana',
  'mana.regen': 'mana_orb',
};

// remembered between visits
let lastTab: Tab = 'ash';
const lastScroll: Partial<Record<Tab, number>> = {};

/** Upgrade shop: tabs per category, drag-scroll rows, Buy with gold. */
export class ShopScene extends MenuScene {
  private area!: ScrollArea;
  private goldText!: Phaser.GameObjects.BitmapText;
  private tabButtons: Button[] = [];

  constructor() {
    super(SceneKey.Shop);
  }

  protected build(): void {
    this.tabButtons = [];
    this.header(this.t('shop.title'), { label: this.t('ui.map'), to: () => this.go(SceneKey.Map) }, false);
    this.goldText = this.goldBadge(this.vw - 24, 48);
    const vw = this.vw;
    const pw = Math.min(1100, vw - 60);
    const px = (vw - pw) / 2;
    // tabs
    const tw = (pw - 16 * (TABS.length - 1)) / TABS.length;
    TABS.forEach((tab, i) => {
      const b = new Button(this, px + tw / 2 + i * (tw + 16), 124, this.t(`shop.tab.${tab}`), () => this.selectTab(tab), {
        w: tw, h: 60, variant: tab === lastTab ? 'selected' : 'ghost', size: 21, icon: TAB_ICON[tab], iconSize: 30,
      });
      this.tabButtons.push(b);
    });
    const top = 172;
    panel(this, px, top, pw, 720 - top - 20);
    this.area = new ScrollArea(this, { x: px + 16, y: top + 14, w: pw - 44, h: 720 - top - 20 - 28 });
    this.drawList();
  }

  private selectTab(tab: Tab): void {
    lastScroll[lastTab] = this.area.getScroll();
    lastTab = tab;
    TABS.forEach((t, i) => this.tabButtons[i].setVariant(t === tab ? 'selected' : 'ghost'));
    this.drawList();
  }

  private effectText(def: UpgradeDef): string {
    const parts = def.perLevel.map((m) => {
      const v = m.op === 'mul' ? `${m.value >= 0 ? '+' : '−'}${Math.round(Math.abs(m.value) * 100)}%` : `${m.value >= 0 ? '+' : '−'}${Math.abs(m.value)}`;
      return v;
    });
    return this.t('shop.per_level', { fx: [...new Set(parts)].join(' / ') });
  }

  private rowIcon(def: UpgradeDef): string {
    if (def.category === 'army' && def.target) return this.app.data.units.get(def.target)?.sprite ?? 'ui_sword';
    if (def.category === 'spell' && def.target) return this.app.data.spells.get(def.target)?.icon ?? 'ui_spellbook';
    const k = ROW_ICON[def.id];
    return k && hasFrame(k) ? k : TAB_ICON[def.category];
  }

  private drawList(): void {
    const app = this.app;
    const p = app.profile;
    const area = this.area;
    area.content.removeAll(true);
    const defs = [...app.data.upgrades.values()].filter((d) => d.category === lastTab);
    const w = area.rect.w;
    const rowH = 92;
    defs.forEach((def, i) => {
      const y = i * rowH;
      const lvl = app.upgrades.level(p, def.id);
      const cost = app.upgrades.cost(p, def.id);
      const locked = def.unlockWave > p.highestWave + 1;
      const maxed = cost === null;
      const afford = !locked && !maxed && app.upgrades.canBuy(p, def.id);
      const g = this.add.graphics();
      g.fillStyle(locked ? 0x1e1a24 : 0x2c2238, 0.95);
      g.fillRoundedRect(0, y + 4, w, rowH - 10, 14);
      g.lineStyle(2, C.inkN, 1);
      g.strokeRoundedRect(0, y + 4, w, rowH - 10, 14);
      area.content.add(g);
      const icon = this.rowIcon(def);
      const baked = def.category === 'army' && (icon.startsWith('unit_') || icon.startsWith('hero_')) ? `portrait_${icon}` : icon;
      const ic = addIcon(this, 46, y + rowH / 2, baked, icon, 60, 62);
      if (locked) ic.setTint(0x333038);
      area.content.add(ic);
      const name = addText(this, 92, y + 28, this.t(def.nameKey), 22, { originY: 0.5, color: locked ? C.textDim : C.text });
      fitText(name, w * 0.42, 14);
      area.content.add(name);
      area.content.add(addText(this, 92, y + 58, locked ? this.t('shop.unlock_at', { n: def.unlockWave }) : this.effectText(def), 15, { originY: 0.5, color: locked ? '#ff9a8a' : C.textDim, bold: false }));
      // level pips
      const pipsX = Math.max(92 + Math.min(name.width, w * 0.42) + 24, w * 0.46);
      const pipW = Math.min(18, (w * 0.22) / def.maxLevel - 4);
      for (let k = 0; k < def.maxLevel; k++) {
        g.fillStyle(k < lvl ? 0xffd34d : 0x463a56, 1);
        g.fillRoundedRect(pipsX + k * (pipW + 4), y + 22, pipW, 12, 4);
      }
      area.content.add(addText(this, pipsX, y + 58, this.t('shop.level', { n: lvl, max: def.maxLevel }), 15, { originY: 0.5, color: C.textDim, bold: false }));
      // cost + buy
      const bx = w - 92;
      if (maxed) {
        area.content.add(addText(this, bx, y + rowH / 2, this.t('shop.maxed'), 22, { originX: 0.5, originY: 0.5, color: C.gold }));
      } else {
        const cx = w - 200;
        area.content.add(addArt(this, cx - 62, y + rowH / 2, 'ui_gold', 0.55));
        area.content.add(addNum(this, cx + 10, y + rowH / 2, numStr(cost), 24, true).setOrigin(1, 0.5).setTint(afford ? 0xffd34d : 0xff7a6a));
        const btn = new Button(this, bx, y + rowH / 2 - 1, this.t('shop.buy'), () => this.buy(def), {
          w: 150, h: 58, variant: afford ? 'primary' : 'ghost', size: 22, enabled: afford, guard: area.guard,
        });
        area.content.add(btn);
      }
    });
    area.setContentHeight(defs.length * rowH + 8);
    area.setScroll(lastScroll[lastTab] ?? 0);
  }

  private buy(def: UpgradeDef): void {
    const app = this.app;
    const p = app.profile;
    if (def.unlockWave > p.highestWave + 1) return;
    if (!app.upgrades.canBuy(p, def.id)) return;
    if (!app.upgrades.buy(p, def.id)) return;
    app.commitProfile();
    lastScroll[lastTab] = this.area.getScroll();
    this.goldText.setText(numStr(p.gold));
    this.drawList();
    toast(this, this.vw, this.t('shop.bought', { name: this.t(def.nameKey), n: app.upgrades.level(p, def.id) }), C.green);
  }
}
