import { SceneKey, type SpellDef, type UpgradeDef } from '../../contracts';
import { hasFrame } from '../art/atlas';
import { addIcon, inkRule, kitImage } from '../ui/skin';
import { C, addText, fitText, numStr } from '../style';
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
  'castle.smithy': 'ui_anvil',
  'castle.iron_cap': 'ui_iron',
  'mana.max': 'ui_mana',
  'mana.regen': 'mana_orb',
};
const GOLD_INK = '#7a4e08';
const RED_INK = '#a8321a';

// remembered between visits
let lastTab: Tab = 'ash';
const lastScroll: Partial<Record<Tab, number>> = {};

/** Upgrade shop: tabs per category, drag-scroll ledger rows, Buy with gold; spell trees in 'spell'. */
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
    this.goldText = this.goldBadge(this.vw - 22, 46);
    const vw = this.vw;
    const pw = Math.min(1120, vw - 60);
    const px = (vw - pw) / 2;
    // tabs: leather-strapped planks; the open one is a vellum tab
    const tw = (pw - 40 - 12 * (TABS.length - 1)) / TABS.length;
    TABS.forEach((tab, i) => {
      const b = new Button(this, px + 20 + tw / 2 + i * (tw + 12), 118, this.t(`shop.tab.${tab}`), () => this.selectTab(tab), {
        w: tw, h: 56, variant: tab === lastTab ? 'selected' : 'secondary', size: 20, icon: TAB_ICON[tab], iconSize: 28,
      });
      this.tabButtons.push(b);
    });
    const top = 156;
    panel(this, px, top, pw, 720 - top - 14);
    this.area = new ScrollArea(this, { x: px + 34, y: top + 26, w: pw - 84, h: 720 - top - 14 - 52 });
    this.drawList();
  }

  private selectTab(tab: Tab): void {
    lastScroll[lastTab] = this.area.getScroll();
    lastTab = tab;
    TABS.forEach((t, i) => this.tabButtons[i].setVariant(t === tab ? 'selected' : 'secondary'));
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
    return k && (hasFrame(k) || k.startsWith('ui_')) ? k : TAB_ICON[def.category];
  }

  /** inked roundel with an icon */
  private roundel(x: number, y: number, icon: string, baked: string, locked: boolean): void {
    const g = this.add.graphics();
    g.fillStyle(0x2a1a10, locked ? 0.35 : 0.85);
    g.fillCircle(x, y, 30);
    g.lineStyle(2, C.inkN, 0.8);
    g.strokeCircle(x, y, 32);
    this.area.content.add(g);
    const ic = addIcon(this, x, y, baked, icon, 54, 54);
    if (locked) ic.setTint(0x4a4038);
    this.area.content.add(ic);
  }

  /** gold price printed in ink: coin + number */
  private price(right: number, y: number, cost: number, afford: boolean): void {
    const n = addText(this, right, y, numStr(cost), 22, { originX: 1, originY: 0.5, color: afford ? GOLD_INK : RED_INK });
    this.area.content.add(n);
    this.area.content.add(kitImage(this, 'coin_gold', right - n.width - 14, y, 26, 26));
  }

  private drawList(): void {
    const app = this.app;
    const p = app.profile;
    const area = this.area;
    area.content.removeAll(true);
    const defs = [...app.data.upgrades.values()].filter((d) => d.category === lastTab);
    const w = area.rect.w;
    const rowH = 88;
    let y = 0;
    const rules = this.add.graphics();
    area.content.add(rules);
    defs.forEach((def) => {
      const lvl = app.upgrades.level(p, def.id);
      const cost = app.upgrades.cost(p, def.id);
      const locked = def.unlockWave > p.highestWave + 1;
      const maxed = cost === null;
      const afford = !locked && !maxed && app.upgrades.canBuy(p, def.id);
      const icon = this.rowIcon(def);
      const baked = def.category === 'army' && (icon.startsWith('unit_') || icon.startsWith('hero_')) ? `portrait_${icon}` : icon;
      this.roundel(38, y + rowH / 2, icon, baked, locked);
      const name = addText(this, 86, y + 26, this.t(def.nameKey), 21, { originY: 0.5, color: locked ? C.inkSoft : C.ink });
      fitText(name, w * 0.4, 14);
      area.content.add(name);
      area.content.add(addText(this, 86, y + 56, locked ? this.t('shop.unlock_at', { n: def.unlockWave }) : this.effectText(def), 15, { originY: 0.5, color: locked ? C.rubric : C.inkSoft, bold: false }));
      // level pips: inked diamonds, red when owned
      const pipsX = Math.max(86 + Math.min(name.width, w * 0.4) + 28, w * 0.47);
      const pg = this.add.graphics();
      const step = Math.min(22, (w * 0.2) / def.maxLevel);
      for (let k = 0; k < def.maxLevel; k++) {
        const cx = pipsX + k * step + 7;
        const cy = y + 26;
        if (k < lvl) {
          pg.fillStyle(C.rubricN, 0.9);
          pg.fillPoints([{ x: cx, y: cy - 7 }, { x: cx + 6, y: cy }, { x: cx, y: cy + 7 }, { x: cx - 6, y: cy }], true);
        }
        pg.lineStyle(1.5, C.inkN, 0.7);
        pg.strokePoints([{ x: cx, y: cy - 7 }, { x: cx + 6, y: cy }, { x: cx, y: cy + 7 }, { x: cx - 6, y: cy }], true);
      }
      area.content.add(pg);
      area.content.add(addText(this, pipsX, y + 56, this.t('shop.level', { n: lvl, max: def.maxLevel }), 15, { originY: 0.5, color: C.inkSoft, bold: false }));
      const bx = w - 84;
      if (maxed) {
        area.content.add(addText(this, bx, y + rowH / 2, this.t('shop.maxed'), 22, { originX: 0.5, originY: 0.5, color: C.rubric, font: 'head' }));
      } else {
        this.price(w - 184, y + rowH / 2, cost, afford);
        area.content.add(new Button(this, bx, y + rowH / 2 - 2, this.t('shop.buy'), () => this.buy(def), {
          w: 150, h: 56, variant: afford ? 'primary' : 'ghost', size: 21, enabled: afford, guard: area.guard,
        }));
      }
      y += rowH;
      inkRule(rules, 8, y - 3, w - 8, 0.2);
    });
    if (lastTab === 'spell') {
      for (const s of app.data.spells.values()) {
        if (!s.tree) continue;
        y = this.treeRow(s, y, w, rules);
      }
    }
    area.setContentHeight(y + 8);
    area.setScroll(lastScroll[lastTab] ?? 0);
  }

  /** one spell tree: learn (tier 1), tier 2, then pick path A or B; switch later for a fee */
  private treeRow(s: SpellDef, y0: number, w: number, rules: Phaser.GameObjects.Graphics): number {
    const tree = s.tree!;
    const app = this.app;
    const p = app.profile;
    const area = this.area;
    const st = p.spellTiers[s.id];
    const tier = st?.tier ?? 0;
    const reached = s.unlockWave <= p.highestWave + 1;
    const choose = tier === 2;
    const done = tier === 3;
    const h = choose || done ? 168 : 100;
    this.roundel(38, y0 + 44, s.icon, s.icon, !reached);
    const name = addText(this, 86, y0 + 24, this.t(s.nameKey), 21, { originY: 0.5, color: reached ? C.ink : C.inkSoft });
    area.content.add(name);
    const tierT = addText(this, 86 + name.width + 14, y0 + 25, tier > 0 ? this.t('shop.tree.tier', { n: tier }) : this.t('shop.tree.not_learned'), 15, { originY: 0.5, color: tier > 0 ? C.rubric : C.inkSoft, bold: tier > 0 });
    area.content.add(tierT);
    const descW = w - 86 - 260;
    if (!reached) {
      area.content.add(addText(this, 86, y0 + 54, this.t('shop.unlock_at', { n: s.unlockWave }), 15, { color: C.rubric, bold: false }));
    } else if (!choose && !done) {
      const next = tier === 0 ? tree.tier1 : tree.tier2;
      area.content.add(addText(this, 86, y0 + 44, `${this.t('shop.tree.next')}: ${this.t(next.descKey)}`, 15, { color: C.inkSoft, bold: false, wrap: descW }));
      const cost = app.upgrades.tierCost(p, s.id) ?? 0;
      const afford = p.gold >= cost;
      this.price(w - 184, y0 + 44, cost, afford);
      area.content.add(new Button(this, w - 84, y0 + 42, tier === 0 ? this.t('shop.tree.learn') : this.t('shop.buy'), () => this.buyTier(s), {
        w: 150, h: 56, variant: afford ? 'primary' : 'ghost', size: 21, enabled: afford, guard: area.guard,
      }));
    }
    if (choose || done) {
      area.content.add(addText(this, w - 8, y0 + 25, choose ? this.t('shop.tree.pick') : '', 14, { originX: 1, originY: 0.5, color: C.inkSoft, bold: false }));
      const bw = (w - 86 - 16) / 2;
      (['A', 'B'] as const).forEach((br, i) => {
        const bx = 86 + i * (bw + 16);
        const by = y0 + 46;
        const patch = br === 'A' ? tree.tier3A : tree.tier3B;
        const active = done && st?.branch === br;
        const box = this.add.graphics();
        box.fillStyle(active ? C.rubricN : 0x6a4a24, active ? 0.12 : 0.08);
        box.fillRoundedRect(bx, by, bw, 110, 6);
        box.lineStyle(active ? 2.5 : 1.5, active ? C.rubricN : C.inkN, active ? 0.8 : 0.3);
        box.strokeRoundedRect(bx, by, bw, 110, 6);
        area.content.add(box);
        area.content.add(addText(this, bx + 12, by + 8, this.t(br === 'A' ? 'shop.tree.path_a' : 'shop.tree.path_b'), 16, { color: C.rubric }));
        area.content.add(addText(this, bx + 12, by + 32, this.t(patch.descKey), 14, { color: C.ink, bold: false, wrap: bw - 190 }));
        if (active) {
          area.content.add(kitImage(this, 'seal_red', bx + bw - 56, by + 55, 54, 54).setAngle(-10));
          area.content.add(addText(this, bx + bw - 56, by + 55, this.t('shop.tree.current'), 12, { originX: 0.5, originY: 0.5, color: '#f6e2c0', stroke: 1 }).setAngle(-10));
          return;
        }
        const cost = choose ? app.upgrades.tierCost(p, s.id, br) : app.upgrades.respecCost(p, s.id, br);
        if (cost === null) return;
        const afford = p.gold >= cost;
        this.price(bx + bw - 12, by + 30, cost, afford);
        area.content.add(new Button(this, bx + bw - 78, by + 74, choose ? this.t('shop.buy') : this.t('shop.tree.switch'), () => (choose ? this.buyTier(s, br) : this.respec(s, br)), {
          w: 136, h: 48, variant: afford ? 'primary' : 'ghost', size: 19, enabled: afford, guard: area.guard,
        }));
      });
    }
    inkRule(rules, 8, y0 + h - 3, w - 8, 0.2);
    return y0 + h;
  }

  private afterPurchase(msg: string): void {
    this.app.commitProfile();
    lastScroll[lastTab] = this.area.getScroll();
    this.goldText.setText(numStr(this.app.profile.gold));
    this.drawList();
    toast(this, this.vw, msg, C.green);
  }

  private buy(def: UpgradeDef): void {
    const app = this.app;
    const p = app.profile;
    if (def.unlockWave > p.highestWave + 1) return;
    if (!app.upgrades.canBuy(p, def.id)) return;
    if (!app.upgrades.buy(p, def.id)) return;
    this.afterPurchase(this.t('shop.bought', { name: this.t(def.nameKey), n: app.upgrades.level(p, def.id) }));
  }

  private buyTier(s: SpellDef, branch?: 'A' | 'B'): void {
    const p = this.app.profile;
    if (!this.app.upgrades.buyTier(p, s.id, branch)) return;
    const tier = p.spellTiers[s.id]?.tier ?? 1;
    this.afterPurchase(tier === 1 ? this.t('shop.tree.learned', { name: this.t(s.nameKey) }) : this.t('shop.bought', { name: this.t(s.nameKey), n: tier }));
  }

  private respec(s: SpellDef, branch: 'A' | 'B'): void {
    const p = this.app.profile;
    if (!this.app.upgrades.respecBranch(p, s.id, branch)) return;
    this.afterPurchase(this.t('shop.bought', { name: this.t(s.nameKey), n: 3 }));
  }
}
