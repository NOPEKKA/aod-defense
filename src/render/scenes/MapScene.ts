import { SceneKey, type PreWaveSceneData, type SettingsSceneData } from '../../contracts';
import { C, addText, fitText, numStr } from '../style';
import { KIT, kitImage, page } from '../ui/skin';
import { Button } from '../ui/widgets';
import { MenuScene } from './MenuScene';

const PER_CHAPTER = 10;
const INK = 0x2b1a10;
const RED_INK = 0x8a1a10;

interface Node {
  wave: number;
  x: number;
  y: number;
}

/**
 * Campaign map: a scorched parchment sheet with an ink road snaking through five chapter
 * bands (dusk, storm, full moon, fire night, blood moon). Cleared waves are red wax seals,
 * boss waves black seals with a skull, the next wave glows; the road is inked in red as far
 * as the player has come.
 */
export class MapScene extends MenuScene {
  constructor() {
    super(SceneKey.Map);
  }

  protected build(): void {
    const app = this.app;
    const p = app.profile;
    const vw = this.vw;

    // the sheet first so the header banner sits over its top edge
    const sw = Math.min(vw - 40, 1260);
    const sx = (vw - sw) / 2;
    const sy = 64;
    const sh = 720 - sy - 74;
    page(this, sx, sy, sw, sh, { bound: false, seed: 7 });
    kitImage(this, 'compass', sx + sw - 70, sy + sh - 66, 104, 104).setAlpha(0.55).setAngle(-8);
    this.header(this.t('map.title'), { label: this.t('ui.title_screen'), to: () => this.go(SceneKey.Title) });

    const maxWave = app.progression.maxPlayableWave(p);
    const total = app.data.balance.campaignWaves;
    const chapters = Math.ceil(total / PER_CHAPTER);
    const labelW = 170;
    const left = sx + 34;
    const gx0 = left + labelW + 26;
    const gx1 = sx + sw - 70;
    const top = sy + 64;
    const rowH = (sh - 96) / chapters;
    const cellW = (gx1 - gx0) / (PER_CHAPTER - 1);

    // node positions: boustrophedon rows with a hand-drawn wobble
    const nodes: Node[] = [];
    for (let c = 0; c < chapters; c++) {
      const rowY = top + c * rowH + rowH * 0.42;
      for (let i = 0; i < PER_CHAPTER; i++) {
        const wave = c * PER_CHAPTER + i + 1;
        if (wave > total) break;
        const col = c % 2 === 0 ? i : PER_CHAPTER - 1 - i;
        nodes.push({ wave, x: gx0 + col * cellW, y: rowY + Math.sin(wave * 1.7 + c) * 7 });
      }
    }

    // chapter bands: faint wash, emblem, title
    const bands = this.add.graphics();
    for (let c = 0; c < chapters; c++) {
      const y = top + c * rowH - 18;
      const unlocked = c * PER_CHAPTER + 1 <= maxWave;
      if (c > 0) {
        bands.lineStyle(1.2, INK, 0.22);
        for (let x = left; x < sx + sw - 40; x += 14) bands.lineBetween(x, y, x + 7, y);
      }
      const em = kitImage(this, `em_ch${c + 1}`, left + 30, y + rowH * 0.5, 50, 50);
      em.setAlpha(unlocked ? 0.95 : 0.35);
      const ct = addText(this, left + 62, y + rowH * 0.5 - 13, this.t('map.chapter', { n: c + 1 }), 22, { originY: 0.5, color: unlocked ? C.rubric : C.inkSoft, font: 'head' });
      ct.setAlpha(unlocked ? 1 : 0.55);
      const nt = addText(this, left + 62, y + rowH * 0.5 + 13, this.t(`map.chapter${c + 1}`), 15, { originY: 0.5, color: C.ink, bold: false });
      nt.setAlpha(unlocked ? 0.9 : 0.45);
      fitText(nt, labelW - 40, 11);
    }

    // the road: red ink where travelled, dashed brown ink ahead
    const road = this.add.graphics();
    const reached = Math.max(1, maxWave);
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const done = b.wave <= reached;
      const turn = Math.abs(a.y - b.y) > rowH * 0.5;
      const pts = turn ? this.turnCurve(a, b, a.x > gx0 + (gx1 - gx0) / 2 ? 1 : -1) : [a, b];
      for (let k = 0; k < pts.length - 1; k++) this.inkLine(road, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y, done);
    }

    for (const n of nodes) this.waveNode(n.wave, n.x, n.y, n.wave <= maxWave, n.wave === maxWave && n.wave > p.highestWave);

    // footer
    const by = 720 - 38;
    new Button(this, vw / 2 - 210, by, this.t('ui.upgrade'), () => this.go(SceneKey.Shop), { w: 250, h: 60, variant: 'gold', size: 23, icon: 'ui_shop', iconSize: 32, head: true });
    new Button(this, vw / 2 + 60, by, this.t('ui.settings'), () => this.go(SceneKey.Settings, { returnTo: SceneKey.Map } satisfies SettingsSceneData), { w: 210, h: 60, variant: 'secondary', size: 21, icon: 'ui_gear', iconSize: 28 });
    if (p.highestWave >= total) {
      const start = Math.max(total + 1, p.endlessBest + 1);
      new Button(this, vw / 2 + 320, by, this.t('map.endless'), () => this.go(SceneKey.PreWave, { wave: start, endless: true } satisfies PreWaveSceneData), {
        w: 250, h: 60, variant: 'danger', size: 22, icon: 'ui_skull', iconSize: 30, sub: this.t('map.endless_best', { n: p.endlessBest }), head: true,
      });
    }
  }

  /** half-loop joining the end of one row to the start of the next */
  private turnCurve(a: Node, b: Node, side: number): Node[] {
    const out: Node[] = [];
    const cx = Math.max(a.x, b.x) * (side > 0 ? 1 : 0) + Math.min(a.x, b.x) * (side > 0 ? 0 : 1);
    const cy = (a.y + b.y) / 2;
    const ry = (b.y - a.y) / 2;
    const rx = 42;
    for (let k = 0; k <= 12; k++) {
      const t = -Math.PI / 2 + (k / 12) * Math.PI;
      out.push({ wave: 0, x: cx + side * Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
    }
    out[0] = a;
    out[out.length - 1] = b;
    return out;
  }

  private inkLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, done: boolean): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (done) {
      g.lineStyle(4, RED_INK, 0.85);
      g.lineBetween(x0, y0, x1, y1);
      g.lineStyle(1.5, 0x3a0804, 0.5);
      g.lineBetween(x0, y0 + 1.5, x1, y1 + 1.5);
      return;
    }
    const dash = 7;
    const gap = 6;
    g.lineStyle(2.4, INK, 0.5);
    for (let d = 0; d < len; d += dash + gap) {
      const t0 = d / len;
      const t1 = Math.min(1, (d + dash) / len);
      g.lineBetween(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
    }
  }

  private waveNode(wave: number, cx: number, cy: number, unlocked: boolean, current: boolean): void {
    const level = this.app.data.levels[wave - 1];
    const boss = level?.kind === 'boss';
    const stars = this.app.profile.stars[wave] ?? 0;
    const cleared = wave <= this.app.profile.highestWave;
    const c = this.add.container(cx, cy);
    const size = boss ? 58 : 46;
    if (current) {
      const glow = kitImage(this, 'soft_glow', 0, 0, size * 2.4, size * 2.4).setTint(0xffc860).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
      c.add(glow);
      this.tweens.add({ targets: glow, alpha: 0.2, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    if (unlocked) {
      const frame = boss ? 'seal_black' : current ? 'seal_gold' : 'seal_red';
      const seal = this.add.image(0, 0, KIT, frame).setDisplaySize(size, size).setAngle((wave * 37) % 30 - 15);
      c.add(seal);
      if (boss) {
        // number on a small ink tag above the black seal (the skull fills the stamp)
        c.add(addText(this, 0, -size / 2 - 9, numStr(wave), 17, { originX: 0.5, originY: 0.5, color: C.rubric, font: 'head' }));
      } else {
        const col = current ? '#3a2406' : '#f6e2c0';
        c.add(addText(this, 0, -1, numStr(wave), 21, { originX: 0.5, originY: 0.5, color: col, font: 'head', stroke: current ? 0 : 1 }));
      }
    } else {
      const g = this.add.graphics();
      g.lineStyle(2, INK, 0.38);
      g.strokeCircle(0, 0, boss ? 22 : 16);
      g.fillStyle(0xf0dfb8, 0.35);
      g.fillCircle(0, 0, boss ? 21 : 15);
      c.add(g);
      if (boss) c.add(kitImage(this, 'em_skull', 0, 0, 34, 34).setAlpha(0.45));
      else c.add(addText(this, 0, -1, numStr(wave), 16, { originX: 0.5, originY: 0.5, color: C.inkSoft, font: 'head' }).setAlpha(0.6));
    }
    if (cleared) {
      for (let s = 0; s < 3; s++) {
        c.add(kitImage(this, s < stars ? 'star_gold' : 'star_ink', (s - 1) * 15, size / 2 + 9 - (s === 1 ? 2 : 0), 17, 17));
      }
    }
    if (!unlocked) return;
    c.setSize(Math.max(64, size + 12), size + 24);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.92));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      c.setScale(1);
      this.go(SceneKey.PreWave, { wave, endless: false } satisfies PreWaveSceneData);
    });
  }
}
