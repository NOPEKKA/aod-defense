/**
 * World layer: parallax background, castle + Necronomicon + pit, pooled entity
 * sprites (interpolated, depth-sorted, procedurally animated), HP bars,
 * telegraphs and the spell-aim preview. Reads WorldState only.
 */
import {
  SIM_DT,
  type BattleRenderer,
  type EntityState,
  type EventBus,
  type GameEvents,
  type HudLayout,
  type RenderView,
  type Unsubscribe,
} from '../../contracts';
import { getApp } from '../../core/app';
import { findEntity } from '../../core/world';
import { applyFrame, atlasScale, spriteFrame, type FrameInfo } from '../art/atlas';
import { drawGround, drawHills, drawSky } from '../scenery';
import { chapterLook, clamp01, easeOutBack, easeOutCubic, type ChapterLook } from '../style';
import type { FxRenderer } from './FxRenderer';

interface Vis {
  id: number;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  key: string;
  f: FrameInfo;
  seen: number;
  age: number;
  flash: number;
  lunge: number;
  kick: number;
  sizeK: number;
  barW: number;
  phase: number;
  shadowW: number;
}

const SIZE_K = { small: 0.8, normal: 1, large: 1.3, huge: 2.1 } as const;
const BAR_W = { small: 30, normal: 38, large: 56, huge: 120 } as const;

const BAR_COLOR = {
  ash: 0x59d36b,
  ally: 0x7ee07a,
  hero: 0xffd34d,
  enemy: 0xff5a4f,
  boss: 0xc070ff,
} as const;

export class WorldRenderer implements BattleRenderer {
  readonly id = 'world';
  private scene!: Phaser.Scene;
  private view!: RenderView;
  private R = 1;
  private look!: ChapterLook;
  private byId = new Map<number, Vis>();
  private active: Vis[] = [];
  private pool: Vis[] = [];
  private frameNo = 0;
  private clock = 0;
  /** render-side clock after the wave ended (sim stops ticking): slow-mo deaths */
  private postClock = 0;
  private unsubs: Unsubscribe[] = [];
  private statics: Phaser.GameObjects.GameObject[] = [];
  private sky!: Phaser.GameObjects.Graphics;
  private far!: Phaser.GameObjects.Graphics;
  private near!: Phaser.GameObjects.Graphics;
  private pitG!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private tele!: Phaser.GameObjects.Graphics;
  private book!: Phaser.GameObjects.Image;
  private bookGlow!: Phaser.GameObjects.Image;
  private bookShake = 0;
  private pitOpen = 0;
  private pitDrawn = -1;
  private shadowF!: FrameInfo;

  constructor(private readonly fx: FxRenderer | null = null) {}

  create(scene: Phaser.Scene, view: RenderView, bus: EventBus): void {
    this.scene = scene;
    this.view = view;
    this.R = atlasScale();
    const w = view.data.balance.world;
    const level = view.world.wave.endless ? undefined : view.data.levels[view.world.wave.number - 1];
    this.look = chapterLook(level?.chapter ?? 5);
    this.shadowF = spriteFrame('shadow');
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => (this.statics.push(o), o);

    this.sky = keep(scene.add.graphics().setScrollFactor(0).setDepth(-1000));
    this.far = keep(scene.add.graphics().setScrollFactor(0.15, 0).setDepth(-900));
    this.near = keep(scene.add.graphics().setScrollFactor(0.4, 0).setDepth(-800));
    const ground = keep(scene.add.graphics().setDepth(-500));
    drawGround(ground, -40, w.width + 40, w.groundY, this.look);
    // castle zone floor is stone
    ground.fillStyle(0x4e4660, 1);
    ground.fillRect(-40, w.groundY - 22, w.castleRight + 40, 140);
    this.drawBackground(view.layout.viewW);

    keep(this.addImg('castle', 0, w.groundY + 30, -450));
    this.pitG = keep(scene.add.graphics().setDepth(-440));
    this.drawPit(0);

    // wall decorations follow the castle upgrades (stat keys from contracts)
    try {
      const app = getApp();
      const mods = app.progression.buildModifiers(app.profile);
      const archers = Math.max(0, Math.min(6, Math.round(mods.apply(0, 'castle.archers.count'))));
      for (let i = 0; i < archers; i++) {
        const img = keep(this.addImg('unit_archer', 186 + i * 28, w.groundY - 310, -445, 0.5));
        img.setOrigin(0.5, 1);
      }
      if (mods.apply(0, 'castle.catapult.level') >= 1) keep(this.addImg('wall_catapult', 312, w.groundY - 310, -444, 0.9));
    } catch {
      /* decor only */
    }

    keep(this.addImg('book_stand', w.bookX, w.groundY + 4, -430));
    this.bookGlow = keep(this.addImg('glow', w.bookX, w.groundY - 82, -429, 1.3));
    this.bookGlow.setTint(0xb070ff).setBlendMode(Phaser.BlendModes.ADD);
    this.book = keep(this.addImg('book', w.bookX, w.groundY - 82, -428, 0.9));

    this.tele = keep(scene.add.graphics().setDepth(-95));
    this.bars = keep(scene.add.graphics().setDepth(2100));

    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.unsubs.push(bus.on(k, fn));
    on('entity:damaged', (p) => {
      const v = this.byId.get(p.id);
      if (v && !p.blocked) {
        v.flash = 0.09;
        v.kick = 1;
      }
    });
    on('entity:attack', (p) => {
      const v = this.byId.get(p.id);
      if (v) v.lunge = 1;
    });
    on('book:damaged', () => {
      this.bookShake = 1;
    });
    on('castle:pit', () => {
      this.pitOpen = 1.4;
    });
  }

  private addImg(key: string, x: number, y: number, depth: number, mul = 1): Phaser.GameObjects.Image {
    const f = spriteFrame(key);
    const img = this.scene.add.image(x, y, f.tex, f.frame);
    img.setOrigin(f.ax, f.ay).setScale(mul / this.R).setDepth(depth);
    return img;
  }

  private drawBackground(viewW: number): void {
    const worldW = this.view.data.balance.world.width;
    const gy = this.view.data.balance.world.groundY;
    drawSky(this.sky, viewW, 720, this.look);
    this.far.clear();
    drawHills(this.far, viewW + (worldW - viewW) * 0.15 + 60, gy - 120, 120, this.look.far, 11, false);
    this.near.clear();
    drawHills(this.near, viewW + (worldW - viewW) * 0.4 + 60, gy - 40, 90, this.look.near, 23, true);
  }

  private drawPit(open: number): void {
    const w = this.view.data.balance.world;
    const g = this.pitG;
    g.clear();
    const x = w.pit.left;
    const pw = w.pit.right - w.pit.left;
    const top = w.groundY - 16;
    g.fillStyle(0x0c0810, 1);
    g.fillRect(x, top, pw, 44);
    g.lineStyle(3, 0x1b1424, 1);
    g.strokeRect(x, top, pw, 44);
    if (open) {
      // planks hang down into the hole
      g.fillStyle(0x6e4a28, 1);
      g.fillRect(x - 2, top, 7, 40);
      g.fillRect(x + pw - 5, top, 7, 40);
    } else {
      for (let i = 0; i < 4; i++) {
        g.fillStyle(i % 2 ? 0x7a5230 : 0x6e4a28, 1);
        g.fillRect(x + 2 + (i * (pw - 4)) / 4, top + 2, (pw - 4) / 4 - 2, 26);
      }
      g.fillStyle(0x8e98a6, 1);
      g.fillRect(x + 4, top + 12, pw - 8, 3);
    }
  }

  // ---------------------------------------------------------------------------

  private acquire(e: EntityState): Vis {
    let v = this.pool.pop();
    if (!v) {
      const img = this.scene.add.image(0, 0, this.shadowF.tex, this.shadowF.frame);
      const shadow = this.scene.add.image(0, 0, this.shadowF.tex, this.shadowF.frame).setDepth(-60);
      v = { id: 0, img, shadow, key: '', f: this.shadowF, seen: 0, age: 0, flash: 0, lunge: 0, kick: 0, sizeK: 1, barW: 38, phase: 0, shadowW: 1 };
    }
    v.id = e.id;
    v.key = '';
    v.age = 0;
    v.flash = 0;
    v.lunge = 0;
    v.kick = 0;
    v.phase = (e.id * 1.37) % 6.28;
    v.img.setVisible(true).setAlpha(1).setRotation(0).clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
    v.shadow.setVisible(e.kind !== 'projectile' && e.kind !== 'effect');
    this.byId.set(e.id, v);
    this.active.push(v);
    return v;
  }

  private setSprite(v: Vis, e: EntityState): void {
    v.key = e.sprite;
    v.f = spriteFrame(e.sprite, e.kind);
    applyFrame(v.img, v.f);
    v.sizeK = SIZE_K[e.size] ?? 1;
    v.barW = BAR_W[e.size] ?? 38;
    const sw = e.kind === 'pickup' ? 18 : e.kind === 'boss' ? v.f.w * 0.55 : v.f.w * 0.72;
    v.shadowW = sw;
    v.shadow.setScale(sw / this.shadowF.w / this.R, (sw * 0.28) / this.shadowF.h / this.R);
  }

  frame(view: RenderView, alpha: number, frameDtMs: number): void {
    const dt = Math.min(frameDtMs, 50) / 1000;
    const world = view.world;
    if (!view.paused) this.clock += dt;
    if (world.outcome && !view.paused) this.postClock += dt * 0.4;
    this.frameNo++;
    const fn = this.frameNo;
    const camL = view.cameraX - 260;
    const camR = view.cameraX + view.layout.viewW + 260;
    const bal = view.data.balance;
    const gy = bal.world.groundY;
    const corpse = bal.combat.corpseTime > 0 ? bal.combat.corpseTime : 0.6;
    const clock = this.clock;
    const bars = this.bars;
    bars.clear();

    const ents = world.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive) continue;
      let v = this.byId.get(e.id);
      if (!v) v = this.acquire(e);
      v.seen = fn;
      if (v.key !== e.sprite) this.setSprite(v, e);
      if (!view.paused) v.age += dt;
      const x = e.prevX + (e.x - e.prevX) * alpha;
      const y = e.prevY + (e.y - e.prevY) * alpha;
      if (x < camL || x > camR) {
        v.img.setVisible(false);
        v.shadow.setVisible(false);
        continue;
      }
      v.img.setVisible(true);
      const img = v.img;
      const dir = e.facing;
      const sz = v.sizeK;
      let ox = 0;
      let oy = 0;
      let rot = 0;
      let sx = 1;
      let sy = 1;
      let a = 1;
      const anim = e.hp <= 0 && (e.kind === 'ash' || e.kind === 'ally' || e.kind === 'hero' || e.kind === 'enemy' || e.kind === 'boss') ? 'die' : e.anim;
      let t = e.animTime + alpha * SIM_DT;
      if (anim === 'die' && world.outcome) t += this.postClock;

      if (e.kind === 'projectile') {
        const dx = e.x - e.prevX;
        const dy = e.y - e.prevY;
        rot = dx === 0 && dy === 0 ? (dir < 0 ? Math.PI : 0) : Math.atan2(dy, dx);
        if (e.sprite === 'rock') rot = clock * 9;
        img.setFlipX(false);
        if (e.sprite === 'fireball' && this.fx && !view.paused) this.fx.trail(x, y, 0xff8a2a);
        img.setPosition(x, y).setRotation(rot).setScale(1 / this.R).setDepth(1500 + y);
        continue;
      }
      if (e.kind === 'pickup') {
        oy = -10 - Math.sin(clock * 4 + v.phase) * 3;
        if (e.sprite === 'coin') sx = 0.35 + 0.65 * Math.abs(Math.cos(clock * 4.5 + v.phase));
        if (e.ttl < 3 && e.ttl > 0) a = Math.sin(clock * 22) > 0 ? 1 : 0.35;
        if (v.age < 0.3) {
          const p = v.age / 0.3;
          oy -= Math.sin(p * Math.PI) * 26;
        }
        img.setPosition(x, y + oy).setScale((sx * 1) / this.R, 1 / this.R).setAlpha(a).setDepth(y - 1);
        v.shadow.setVisible(true).setPosition(x, y + 2).setAlpha(0.6);
        continue;
      }
      if (e.kind === 'effect') {
        img.setPosition(x, y).setDepth(1200 + y).setAlpha(e.ttl < 0.4 && e.ttl > 0 ? e.ttl / 0.4 : 1);
        continue;
      }

      switch (anim) {
        case 'walk': {
          const ph = clock * 9 + v.phase;
          oy = -Math.abs(Math.sin(ph)) * 3.2 * sz;
          rot = Math.sin(ph) * 0.06;
          break;
        }
        case 'idle':
          sy = 1 + Math.sin(clock * 2.6 + v.phase) * 0.022;
          sx = 1 - (sy - 1) * 0.5;
          break;
        case 'attack':
          if (v.lunge <= 0) {
            const p = (t % 0.9) / 0.9;
            const k = p < 0.3 ? Math.sin((p / 0.3) * Math.PI) : 0;
            ox = dir * k * 6 * sz;
            rot = dir * k * 0.1;
          }
          break;
        case 'cast':
          sy = 1 + Math.sin(t * 18) * 0.04;
          break;
        case 'hurt':
          ox = -dir * 5 * sz * clamp01(1 - t / 0.2);
          break;
        case 'die': {
          const p = clamp01(t / corpse);
          const f = easeOutCubic(clamp01(p * 1.8));
          rot = -dir * f * 1.4;
          a = 1 - clamp01((p - 0.35) / 0.65);
          if (e.kind === 'ash' && world.outcome) a = Math.max(a, 0.85);
          oy = e.flying ? (gy - y) * p * p : p * 4;
          break;
        }
        case 'spawn': {
          const p = clamp01(t / 0.3);
          sx = sy = 0.3 + 0.7 * easeOutBack(p);
          break;
        }
        case 'stunned':
          rot = Math.sin(clock * 16 + v.phase) * 0.14;
          break;
        case 'dodge': {
          const p = clamp01(t / 0.35);
          rot = dir * p * Math.PI * 2;
          oy = -Math.sin(p * Math.PI) * 14;
          sy = 0.86;
          a = 0.8;
          break;
        }
        case 'telegraph':
          ox = Math.sin(clock * 55) * 1.6 * sz;
          sy = 1 + Math.sin(clock * 12) * 0.03;
          break;
        default:
          break;
      }
      if (anim !== 'spawn' && anim !== 'die' && v.age < 0.25 && e.kind !== 'boss') {
        const s = 0.3 + 0.7 * easeOutBack(v.age / 0.25);
        sx *= s;
        sy *= s;
      }
      if (v.lunge > 0) {
        const k = Math.sin((1 - v.lunge) * Math.PI);
        ox += dir * k * 8 * sz;
        rot += dir * k * 0.12;
        if (!view.paused) v.lunge -= dt / 0.25;
      }
      if (v.kick > 0) {
        ox -= dir * v.kick * 4 * sz;
        if (!view.paused) v.kick -= dt / 0.16;
      }
      if (e.flying && anim !== 'die') oy += Math.sin(clock * 3 + v.phase) * 5;

      img.setFlipX(dir < 0);
      img.setPosition(x + ox, y + oy);
      img.setRotation(rot);
      img.setScale(sx / this.R, sy / this.R);
      img.setAlpha(a);
      img.setDepth(e.flying ? 1000 + y : y);

      // tint: hit flash > statuses > clear
      if (v.flash > 0) {
        img.setTintFill(0xffffff);
        if (!view.paused) v.flash -= dt;
      } else {
        let tint = -1;
        for (let s = 0; s < e.statuses.length; s++) {
          const st = e.statuses[s];
          if (st.id === 'burn') tint = Math.sin(clock * 20) > 0 ? 0xffa070 : 0xffd0a0;
          else if (st.id === 'slow' && tint < 0) tint = 0x9cc8ff;
          else if ((st.id === 'stun' || st.id === 'root') && tint < 0) tint = 0xfff0a0;
          else if (st.id === 'mark' && tint < 0) tint = 0xffb0d0;
          else if (st.id === 'invuln') img.setAlpha(a * (Math.sin(clock * 30) > 0 ? 1 : 0.45));
        }
        if (anim === 'telegraph' && tint < 0) tint = Math.sin(clock * 14) > 0 ? 0xff9a9a : 0xffffff;
        if (tint >= 0) img.setTint(tint);
        else img.clearTint();
      }

      // shadow
      const sh = v.shadow;
      if (anim === 'die' && a <= 0.02) sh.setVisible(false);
      else {
        sh.setVisible(true);
        if (e.flying) {
          const hgt = clamp01((gy - y) / 260);
          sh.setPosition(x, gy + 4).setAlpha(0.55 * (1 - hgt * 0.5));
        } else {
          sh.setPosition(x + ox * 0.5, y + 3).setAlpha(a * 0.85);
        }
      }

      // HP bar
      if (e.hp > 0 && e.hp < e.maxHp && anim !== 'die') {
        const bw = v.barW;
        const top = y + oy - v.f.h * v.f.ay * sy - (e.kind === 'boss' ? 14 : 9);
        const frac = clamp01(e.hp / e.maxHp);
        const col = BAR_COLOR[e.kind as keyof typeof BAR_COLOR] ?? 0xffffff;
        const bh = e.kind === 'boss' ? 7 : 5;
        bars.fillStyle(0x1b1424, 0.9);
        bars.fillRect(x - bw / 2 - 1.5, top - 1.5, bw + 3, bh + 3);
        bars.fillStyle(0x3a2f48, 1);
        bars.fillRect(x - bw / 2, top, bw, bh);
        bars.fillStyle(col, 1);
        bars.fillRect(x - bw / 2, top, bw * frac, bh);
      }
      // stun stars
      if (anim === 'stunned') {
        const top = y + oy - v.f.h * v.f.ay - 6;
        for (let k = 0; k < 3; k++) {
          const ang = clock * 5 + k * 2.094;
          bars.fillStyle(0xfff07a, 1);
          bars.fillCircle(x + Math.cos(ang) * 12 * sz, top + Math.sin(ang) * 3, 2.6);
        }
      }
    }

    // release visuals whose entity is gone
    for (let i = this.active.length - 1; i >= 0; i--) {
      const v = this.active[i];
      if (v.seen === fn) continue;
      v.img.setVisible(false);
      v.shadow.setVisible(false);
      this.byId.delete(v.id);
      this.active[i] = this.active[this.active.length - 1];
      this.active.pop();
      this.pool.push(v);
    }

    this.drawTelegraphs(view, clock);
    this.updateBook(view, dt);
    if (this.pitOpen > 0 && !view.paused) this.pitOpen -= dt;
    const open = this.pitOpen > 0 ? 1 : 0;
    if (open !== this.pitDrawn) {
      this.pitDrawn = open;
      this.drawPit(open);
    }
  }

  private updateBook(view: RenderView, dt: number): void {
    const w = view.data.balance.world;
    const frac = view.world.book.maxHp > 0 ? view.world.book.hp / view.world.book.maxHp : 1;
    if (this.bookShake > 0 && !view.paused) this.bookShake = Math.max(0, this.bookShake - dt / 0.45);
    const shake = Math.sin(this.clock * 70) * 5 * this.bookShake;
    const by = w.groundY - 82 + Math.sin(this.clock * 2) * 2;
    this.book.setPosition(w.bookX + shake, by);
    if (this.bookShake > 0.6) this.book.setTintFill(0xff5a4f);
    else this.book.clearTint();
    this.bookGlow.setPosition(w.bookX, by);
    this.bookGlow.setTint(frac < 0.3 ? 0xff3030 : 0xb070ff);
    this.bookGlow.setAlpha(0.3 + 0.15 * Math.sin(this.clock * 3) + this.bookShake * 0.4);
  }

  private drawTelegraphs(view: RenderView, clock: number): void {
    const g = this.tele;
    g.clear();
    const world = view.world;
    const gy = view.data.balance.world.groundY;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 16);
    for (let i = 0; i < world.telegraphs.length; i++) {
      const tg = world.telegraphs[i];
      const p = 1 - clamp01(tg.remaining / Math.max(0.001, tg.total));
      const urgent = tg.remaining < 0.18;
      const edge = urgent ? 0xffffff : 0xff3b3b;
      switch (tg.shape) {
        case 'band': {
          // [เดา] x = band centre, size = full length
          const x0 = tg.x - tg.size / 2;
          g.fillStyle(0xff2a2a, 0.14 + pulse * 0.08);
          g.fillRect(x0, gy - 20, tg.size, 40);
          g.fillStyle(0xff2a2a, 0.38);
          g.fillRect(tg.x - (tg.size * p) / 2, gy - 20, tg.size * p, 40);
          g.lineStyle(3, edge, 0.9);
          g.strokeRect(x0, gy - 20, tg.size, 40);
          break;
        }
        case 'circle': {
          const ry = Math.max(12, tg.size * 0.3);
          g.fillStyle(0xff2a2a, 0.14 + pulse * 0.08);
          g.fillEllipse(tg.x, tg.y, tg.size * 2, ry * 2);
          g.fillStyle(0xff2a2a, 0.4);
          g.fillEllipse(tg.x, tg.y, tg.size * 2 * p, ry * 2 * p);
          g.lineStyle(3, edge, 0.95);
          g.strokeEllipse(tg.x, tg.y, tg.size * 2, ry * 2);
          break;
        }
        case 'line': {
          // [เดา] x = line centre at height y, size = length
          const x0 = tg.x - tg.size / 2;
          g.fillStyle(0xff2a2a, 0.25 + pulse * 0.15);
          g.fillRect(x0, tg.y - 3, tg.size, 6);
          g.fillStyle(0xffffff, 0.5);
          g.fillRect(x0, tg.y - 1, tg.size * p, 2);
          break;
        }
        case 'shadow': {
          const rx = tg.size * (0.35 + 0.65 * p);
          g.fillStyle(0x000000, 0.2 + 0.4 * p);
          g.fillEllipse(tg.x, gy, rx * 2, rx * 0.56);
          g.lineStyle(2, edge, 0.8);
          g.strokeEllipse(tg.x, gy, tg.size * 2, tg.size * 0.56);
          break;
        }
        default:
          break;
      }
    }
    // spell aim preview
    const aim = view.aim;
    if (aim.slot === null) return;
    const slot = world.spellSlots[aim.slot];
    if (!slot) return;
    if (slot.targeting === 'point' && aim.worldX !== null) {
      const r = slot.aimRadius > 0 ? slot.aimRadius : 100;
      const x = aim.worldX;
      g.fillStyle(0xffd34d, 0.16 + pulse * 0.06);
      g.fillEllipse(x, gy, r * 2, r * 0.52);
      g.lineStyle(3, 0xffd34d, 0.95);
      g.strokeEllipse(x, gy, r * 2, r * 0.52);
      for (let k = 0; k < 6; k++) {
        const a = 0.5 - k * 0.08;
        g.lineStyle(3, 0xffd34d, a);
        g.lineBetween(x - r, gy - k * 16, x - r, gy - k * 16 - 14);
        g.lineBetween(x + r, gy - k * 16, x + r, gy - k * 16 - 14);
      }
      g.lineStyle(2, 0xffffff, 0.9);
      g.lineBetween(x - 10, gy, x + 10, gy);
      g.lineBetween(x, gy - 6, x, gy + 6);
    } else if (slot.targeting === 'line') {
      const ash = findEntity(world as never, world.ashId) as EntityState | undefined;
      if (!ash) return;
      const def = view.data.spells.get(slot.spellId);
      const len = Number(def?.effects[0]?.params.length ?? slot.aimRadius ?? 500) || 500;
      const x0 = ash.x;
      const x1 = ash.x + ash.facing * len;
      g.fillStyle(0xffd34d, 0.14 + pulse * 0.06);
      g.fillRect(Math.min(x0, x1), gy - 70, Math.abs(x1 - x0), 60);
      g.lineStyle(3, 0xffd34d, 0.9);
      g.strokeRect(Math.min(x0, x1), gy - 70, Math.abs(x1 - x0), 60);
      g.fillStyle(0xffd34d, 0.9);
      g.fillTriangle(x1, gy - 40, x1 - ash.facing * 22, gy - 58, x1 - ash.facing * 22, gy - 22);
    }
  }

  relayout(layout: HudLayout): void {
    this.drawBackground(layout.viewW);
  }

  destroy(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    for (const v of this.active) {
      v.img.destroy();
      v.shadow.destroy();
    }
    for (const v of this.pool) {
      v.img.destroy();
      v.shadow.destroy();
    }
    for (const o of this.statics) o.destroy();
    this.active = [];
    this.pool = [];
    this.statics = [];
    this.byId.clear();
  }
}

