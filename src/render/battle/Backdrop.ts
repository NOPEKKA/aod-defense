/**
 * The courtyard: background layers with parallax (baked, or the generated stand-in), the
 * animated props placed at the background anchors (Necronomicon, blacksmith, forge fire,
 * torches and their flickering glows, wall archers, catapult, pit lid), the chapter grade
 * and the weather (rain, embers, fog). Reads WorldState only.
 */
import type { EventBus, GameEvents, RenderView, Unsubscribe } from '../../contracts';
import { getApp } from '../../core/app';
import { atlasScale, spriteFrame, type FrameInfo } from '../art/atlas';
import { courtyardGeo, fallbackMeta, paintFar, paintFront, paintMain, paintSky, paletteOf } from '../art/courtyard';
import { placeholderKey } from '../art/placeholder';
import { assetScale, bgForChapter, bgTextureKey, type BgMeta } from '../assets/library';
import { getSpriteInfo, type ClipInfo, type SpriteInfo } from '../assets/sprites';
import { clamp01 } from '../style';
import { DEPTH } from './depth';

export interface BackdropFxHooks {
  anvilSparks(x: number, y: number): void;
  lightning(): void;
}

interface Pt {
  x: number;
  y: number;
}
interface Torch extends Pt {
  scale: number;
}
interface Glow extends Pt {
  r: number;
  color: string;
  a: number;
}

/** A prop drawn from a baked sprite (or a placeholder frame), animated by a render clock. */
class Prop {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image | null = null;
  info: SpriteInfo | null;
  clip: ClipInfo | null = null;
  clipT = 0;
  scale: number;

  constructor(scene: Phaser.Scene, key: string, fallback: FrameInfo | null, x: number, y: number, depth: number, mul = 1, withShadow = false) {
    this.info = getSpriteInfo(scene, key);
    if (this.info) {
      const i = this.info;
      this.scale = i.scale * mul;
      this.img = scene.add.image(x, y, i.tex, i.rest.names[0]).setOrigin(i.ox, i.oy).setScale(this.scale).setDepth(depth);
      if (withShadow && i.hasShadow) this.shadow = scene.add.image(x, y, i.tex, 'shadow').setOrigin(i.ox, i.oy).setScale(this.scale).setDepth(DEPTH.shadow).setAlpha(0.5);
      this.clip = i.rest;
    } else {
      const f = fallback ?? spriteFrame('fallback_effect');
      this.scale = mul / atlasScale();
      this.img = scene.add.image(x, y, f.tex, f.frame).setOrigin(f.ax, f.ay).setScale(this.scale).setDepth(depth);
    }
  }

  play(name: string): void {
    if (!this.info) return;
    const c = this.info.clips.get(name);
    if (c && c !== this.clip) {
      this.clip = c;
      this.clipT = 0;
    }
  }

  /** advances the clip; returns the frame index shown */
  step(dt: number, speed = 1): number {
    if (!this.info || !this.clip) return 0;
    this.clipT += dt * speed;
    const c = this.clip;
    let f = Math.floor((this.clipT / c.duration) * c.frames);
    f = c.loop ? f % c.frames : Math.min(c.frames - 1, f);
    this.img.setFrame(c.names[f], false, false);
    return f;
  }

  destroy(): void {
    this.img.destroy();
    this.shadow?.destroy();
  }
}

interface Drop {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s: number;
}

export class Backdrop {
  private scene!: Phaser.Scene;
  private view!: RenderView;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private props: Prop[] = [];
  private unsubs: Unsubscribe[] = [];
  private meta!: BgMeta;
  private clock = 0;
  private book: Prop | null = null;
  private bookGlow: Phaser.GameObjects.Image | null = null;
  private bookHurt = 0;
  private smith: Prop | null = null;
  private smithCheer = 0;
  private smithLastF = -1;
  private smithPos: Pt = { x: 640, y: 470 };
  private pit: Prop | null = null;
  private pitG: Phaser.GameObjects.Graphics | null = null;
  private pitTimer = 0;
  private pitShown = false;
  private archers: Prop[] = [];
  private archerTurn = 0;
  private archerT: number[] = [];
  private catapult: Phaser.GameObjects.Image | null = null;
  private flames: Array<{ prop: Prop; phase: number }> = [];
  private glows: Array<{ img: Phaser.GameObjects.Image; base: number; phase: number; speed: number; scale: number }> = [];
  private drops: Drop[] = [];
  private flash!: Phaser.GameObjects.Image;
  private flashA = 0;
  private boltT = 6;
  private weather: 'none' | 'rain' | 'embers' | 'fog' = 'none';
  private modArchers = 0;
  private modCatapult = 0;
  /** multiply tint for characters (chapter grade) */
  spriteTint = 0xffffff;

  constructor(private readonly fx: BackdropFxHooks | null) {}

  create(scene: Phaser.Scene, view: RenderView, bus: EventBus): void {
    this.scene = scene;
    this.view = view;
    const chapter = Math.max(1, view.world.wave.chapter || 1);
    const baked = bgForChapter(chapter);
    const bakedOk = !!baked && baked.layers.every((l) => {
      for (let i = 0; i < l.tiles; i++) if (!scene.textures.exists(bgTextureKey(baked.id, l.id, i))) return false;
      return true;
    });
    this.meta = bakedOk ? baked! : fallbackMeta(chapter, view.data.balance.world);
    if (!bakedOk) ensureFallbackTextures(scene, chapter, view);
    this.buildLayers(bakedOk);
    const grade = this.meta.grade ?? {};
    this.spriteTint = grade.spriteTint ? parseInt(grade.spriteTint.replace('#', ''), 16) : 0xffffff;
    this.weather = grade.weather ?? 'none';
    try {
      const app = getApp();
      const mods = app.progression.buildModifiers(app.profile);
      this.modArchers = Math.max(0, Math.min(6, Math.floor(mods.apply(0, 'castle.archers.count') + 1e-6)));
      this.modCatapult = Math.max(0, Math.floor(mods.apply(0, 'castle.catapult.level') + 1e-6));
    } catch {
      /* decor only */
    }
    this.buildProps();
    this.buildWeather();
    this.flash = scene.add.image(0, 0, spriteFrame('px').tex, spriteFrame('px').frame).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.weather + 5).setAlpha(0);
    this.objs.push(this.flash);
    this.relayout(view.layout.viewW);

    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.unsubs.push(bus.on(k, fn));
    on('book:damaged', () => {
      this.bookHurt = 0.45;
      this.book?.play('hurt');
    });
    on('castle:pit', () => (this.pitTimer = 1.6));
    on('castle:shot', (p) => {
      if (p.source !== 'archer' || this.archers.length === 0) return;
      const n = this.visibleArchers();
      if (n <= 0) return;
      const i = this.archerTurn++ % n;
      this.archers[i].play('attack');
      this.archerT[i] = 0.7;
    });
    on('smith:upgraded', () => {
      this.smithCheer = 1.8;
      this.smith?.play('cheer');
    });
  }

  /** sky/far/main/front images with parallax scroll factors */
  private buildLayers(baked: boolean): void {
    const s = this.scene;
    const id = this.meta.id;
    for (const layer of this.meta.layers) {
      const depth = layer.over ? DEPTH.front : layer.id === 'sky' ? DEPTH.sky : layer.id === 'far' ? DEPTH.far : DEPTH.main;
      for (let i = 0; i < layer.tiles; i++) {
        const key = baked ? bgTextureKey(id, layer.id, i) : fallbackKey(this.meta.chapter, layer.id, i);
        if (!s.textures.exists(key)) continue;
        const src = s.textures.get(key).getSourceImage() as { width: number; height: number };
        const tileW = Math.min(layer.tileW, layer.w - i * layer.tileW);
        const img = s.add.image(i * layer.tileW, 0, key).setOrigin(0, 0).setDepth(depth);
        img.setScale(tileW / src.width, layer.h / src.height);
        img.setScrollFactor(layer.parallax, 0);
        this.objs.push(img);
      }
    }
  }

  private anchor<T>(name: string, def: T): T {
    const a = this.meta.anchors[name];
    return (a ?? def) as T;
  }

  private buildProps(): void {
    const s = this.scene;
    const w = this.view.data.balance.world;
    const fb = fallbackMeta(this.meta.chapter, w).anchors;
    const pick = <T>(name: string) => this.anchor<T>(name, fb[name] as T);

    // torches: flame sheet + flickering additive glow
    const torches = pick<Torch[]>('torches') ?? [];
    // baked metas list a glow per torch themselves; the generated one does not
    const metaGlows = this.meta.anchors['glows'] as Glow[] | undefined;
    const torchGlows = !metaGlows || metaGlows.length < torches.length;
    for (const t of torches) {
      const p = new Prop(s, 'fx_fire', null, t.x, t.y, DEPTH.wallProps, 0.75 * (t.scale ?? 1));
      if (!p.info) p.img.setVisible(false);
      p.clipT = Math.random();
      this.props.push(p);
      this.flames.push({ prop: p, phase: Math.random() * 10 });
      if (torchGlows) this.addGlow(t.x, t.y - 20 * (t.scale ?? 1), 150 * (t.scale ?? 1), parseInt(paletteOf(this.meta.chapter).torch.slice(1), 16), 0.42);
    }
    for (const g of pick<Glow[]>('glows') ?? []) this.addGlow(g.x, g.y, g.r, parseInt(g.color.replace('#', ''), 16), g.a);
    // forge fire
    const forge = pick<Pt>('forge');
    if (forge) {
      const p = new Prop(s, 'fx_fire', null, forge.x, forge.y + 4, DEPTH.wallProps, 1.05);
      if (!p.info) p.img.setVisible(false);
      this.props.push(p);
      this.flames.push({ prop: p, phase: 3 });
    }
    // chapter 4: the castle burns
    if (paletteOf(this.meta.chapter).fires) {
      for (const [x, y, k] of [[980, 175, 1.3], [1520, 172, 1.1], [2080, 176, 1.4], [700, 300, 0.9]] as const) {
        const p = new Prop(s, 'fx_fire_big', null, x, y, DEPTH.wallProps, k);
        if (!p.info) p.img.setVisible(false);
        this.props.push(p);
        this.flames.push({ prop: p, phase: x });
        this.addGlow(x, y - 30, 220 * k, 0xff6a20, 0.4);
      }
    }

    // Necronomicon on its lectern
    const bookA = pick<Pt>('book');
    const bk = new Prop(s, 'book', null, bookA.x, bookA.y, DEPTH.char + bookA.y, 1, true);
    if (!bk.info) {
      // generated stand-in: lectern + book
      bk.img.destroy();
      const stand = spriteFrame('book_stand');
      bk.img = s.add.image(bookA.x, bookA.y, stand.tex, stand.frame).setOrigin(stand.ax, stand.ay).setScale(1.7 / atlasScale()).setDepth(DEPTH.char + bookA.y);
      const bf = spriteFrame('book');
      const top = s.add.image(bookA.x, bookA.y - 128, bf.tex, bf.frame).setScale(1.5 / atlasScale()).setDepth(DEPTH.char + bookA.y + 0.1);
      this.objs.push(top);
      this.bookTop = top;
    }
    this.book = bk;
    this.props.push(bk);
    this.bookGlow = this.addGlow(bookA.x, bookA.y - (bk.info ? bk.info.height * 0.75 : 128), 120, 0x9aff7a, 0.5);

    // blacksmith NPC hammering at the forge
    const sm = pick<Pt>('smith');
    this.smithPos = sm;
    this.smith = new Prop(s, 'npc_blacksmith', spriteFrame(placeholderKey('ally', 'large')), sm.x, sm.y, DEPTH.char + sm.y, 1, true);
    this.smith.play('attack');
    this.props.push(this.smith);

    // wall archers (up to 6 anchors); visible count follows world.castle.archers
    for (const a of pick<Pt[]>('archers') ?? []) {
      const p = new Prop(s, 'unit_archer', spriteFrame(placeholderKey('ally', 'normal')), a.x, a.y, DEPTH.wallProps + 1, 0.56);
      p.img.setVisible(false);
      this.archers.push(p);
      this.archerT.push(0);
      this.props.push(p);
    }
    const cat = pick<Pt>('catapult');
    if (cat) {
      const f = spriteFrame('wall_catapult');
      this.catapult = s.add.image(cat.x, cat.y, f.tex, f.frame).setOrigin(f.ax, f.ay).setScale(1.7 / atlasScale()).setDepth(DEPTH.wallProps + 1).setVisible(false);
      this.objs.push(this.catapult);
    }

    // pit lid (baked: 'idle' closed, 'open' 6 frames)
    const pitA = pick<{ x: number; y: number; w: number; h: number }>('pit');
    if (pitA) {
      const cx = pitA.x + pitA.w / 2;
      const lid = new Prop(s, 'pit_lid', null, cx, pitA.y, DEPTH.ground, 1);
      if (lid.info) {
        this.pit = lid;
        this.props.push(lid);
      } else {
        lid.destroy();
        this.pitG = s.add.graphics().setDepth(DEPTH.ground);
        this.objs.push(this.pitG);
        this.drawPitFallback(pitA, false);
        this.pitRect = pitA;
      }
    }
  }

  private bookTop: Phaser.GameObjects.Image | null = null;
  private pitRect: { x: number; y: number; w: number; h: number } | null = null;

  private drawPitFallback(r: { x: number; y: number; w: number; h: number }, open: boolean): void {
    const g = this.pitG!;
    g.clear();
    const cx = r.x + r.w / 2;
    if (open) {
      g.fillStyle(0x050307, 1);
      g.fillEllipse(cx, r.y, r.w + 18, r.h);
      g.fillStyle(0x6a4428, 1);
      g.fillRect(r.x - 10, r.y - 4, 8, r.h * 0.8);
      g.fillRect(r.x + r.w + 2, r.y - 4, 8, r.h * 0.8);
      return;
    }
    for (let i = 0; i < 5; i++) {
      g.fillStyle(i % 2 ? 0x7a5230 : 0x6a4428, 1);
      g.fillRect(r.x - 8 + (i * (r.w + 16)) / 5, r.y - r.h / 2 + 4, (r.w + 16) / 5 - 2, r.h - 8);
    }
    g.fillStyle(0x3a3a44, 1);
    g.fillRect(r.x - 8, r.y - 3, r.w + 16, 4);
  }

  private addGlow(x: number, y: number, r: number, color: number, a: number): Phaser.GameObjects.Image {
    const f = spriteFrame('glow');
    const scale = (r * 2) / f.w / atlasScale();
    const img = this.scene.add.image(x, y, f.tex, f.frame).setDepth(DEPTH.wallGlow).setBlendMode(Phaser.BlendModes.ADD).setTint(color).setAlpha(a).setScale(scale);
    this.objs.push(img);
    this.glows.push({ img, base: a, phase: Math.random() * 10, speed: 7 + Math.random() * 5, scale });
    return img;
  }

  private buildWeather(): void {
    const low = this.view.settings.fxQuality === 'low';
    const n = this.weather === 'rain' ? (low ? 60 : 130) : this.weather === 'embers' ? (low ? 18 : 40) : this.weather === 'fog' ? 7 : 0;
    const key = this.weather === 'rain' ? 'p_spark' : this.weather === 'embers' ? 'p_dot' : 'p_smoke';
    const f = spriteFrame(key);
    for (let i = 0; i < n; i++) {
      const img = this.scene.add.image(0, 0, f.tex, f.frame).setScrollFactor(0).setDepth(DEPTH.weather);
      if (this.weather === 'embers') img.setBlendMode(Phaser.BlendModes.ADD).setTint(0xff9a3a);
      if (this.weather === 'rain') img.setTint(0xb8c8e0).setAlpha(0.32);
      if (this.weather === 'fog') img.setTint(0xb090c0).setDepth(DEPTH.fx - 1).setScrollFactor(0.6, 0);
      const d: Drop = { img, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 1 };
      this.respawnDrop(d, true);
      this.drops.push(d);
      this.objs.push(img);
    }
  }

  private respawnDrop(d: Drop, initial: boolean): void {
    const vw = this.view.layout.viewW;
    switch (this.weather) {
      case 'rain':
        d.x = Math.random() * (vw + 200) - 100;
        d.y = initial ? Math.random() * 720 : -40 - Math.random() * 100;
        d.vx = -140;
        d.vy = 1100 + Math.random() * 300;
        d.s = 0.8 + Math.random() * 0.6;
        d.life = d.max = 9;
        break;
      case 'embers':
        d.x = Math.random() * vw;
        d.y = initial ? 200 + Math.random() * 520 : 600 + Math.random() * 120;
        d.vx = (Math.random() - 0.5) * 30;
        d.vy = -30 - Math.random() * 50;
        d.s = 0.25 + Math.random() * 0.3;
        d.life = d.max = 4 + Math.random() * 4;
        break;
      case 'fog':
        d.x = Math.random() * (vw + 600) - 300;
        d.y = 440 + Math.random() * 130;
        d.vx = 8 + Math.random() * 14;
        d.vy = 0;
        d.s = 9 + Math.random() * 6;
        d.life = d.max = 1e9;
        break;
      default:
        break;
    }
  }

  private visibleArchers(): number {
    const n = Math.max(this.view.world.castle.archers, this.modArchers);
    return Math.min(n, this.archers.length);
  }

  // ---------------------------------------------------------------------------

  frame(view: RenderView, dt: number): void {
    const paused = view.paused;
    const step = paused ? 0 : dt;
    this.clock += step;
    const t = this.clock;
    // torch flames and glows flicker
    for (const fl of this.flames) fl.prop.step(step, 1);
    for (const g of this.glows) {
      const k = 0.82 + 0.1 * Math.sin(t * g.speed + g.phase) + 0.08 * Math.sin(t * g.speed * 2.3 + g.phase * 1.7);
      g.img.setAlpha(g.base * k);
      g.img.setScale(g.scale * (0.96 + 0.04 * k));
    }

    // book: idle glow loop, hurt flash, glow turns red when low
    if (this.book) {
      if (this.bookHurt > 0) this.bookHurt -= step;
      else if (this.book.clip && this.book.clip.name === 'hurt') this.book.play('idle');
      this.book.step(step);
      const frac = view.world.book.maxHp > 0 ? view.world.book.hp / view.world.book.maxHp : 1;
      if (this.bookGlow) {
        this.bookGlow.setTint(frac < 0.3 ? 0xff3a2a : 0x9aff7a);
        this.bookGlow.setAlpha((0.42 + 0.12 * Math.sin(t * 3)) * (frac < 0.3 ? 1.3 : 1) + this.bookHurt);
      }
      const shake = this.bookHurt > 0 ? Math.sin(t * 70) * 4 * (this.bookHurt / 0.45) : 0;
      if (this.bookTop) {
        const bookA = this.anchor<Pt>('book', { x: view.data.balance.world.bookX, y: 470 });
        this.bookTop.setPosition(bookA.x + shake, bookA.y - 128 + Math.sin(t * 2) * 3);
        if (this.bookHurt > 0.25) this.bookTop.setTintFill(0xff5a4f);
        else this.bookTop.clearTint();
      } else this.book.img.setX(this.anchor<Pt>('book', { x: 0, y: 0 }).x + shake);
    }

    // blacksmith: hammers while the store fills, rests when full, cheers on an upgrade
    if (this.smith) {
      const sm = this.smith;
      const r = view.world.resources;
      if (this.smithCheer > 0) {
        this.smithCheer -= step;
        if (this.smithCheer <= 0) sm.play('attack');
      } else if (r.ironMax > 0 && r.iron >= r.ironMax) sm.play('idle');
      else sm.play('attack');
      if (sm.info) {
        const f = sm.step(step);
        const c = sm.clip!;
        if (c.name === 'attack') {
          const hitF = Math.floor((c.hitAt || 0.5) * c.frames);
          if (f === hitF && this.smithLastF !== hitF && !paused) this.fx?.anvilSparks(this.smithPos.x + sm.info.facing * 48, this.smithPos.y - 66);
        }
        this.smithLastF = f;
        sm.img.setTint(this.spriteTint);
      } else {
        // placeholder: bob like hammering, sparks on the down beat
        const ph = (t * 1.6) % 1;
        const hammering = this.smithCheer <= 0 && !(r.ironMax > 0 && r.iron >= r.ironMax);
        sm.img.setRotation(hammering ? Math.sin(ph * Math.PI * 2) * 0.08 : 0);
        sm.img.setY(this.smithPos.y - (this.smithCheer > 0 ? Math.abs(Math.sin(t * 8)) * 12 : 0));
        if (hammering && ph < 0.5 !== this.smithLastF < 0.5 && ph >= 0.5 && !paused) this.fx?.anvilSparks(this.smithPos.x + 52, this.smithPos.y - 86);
        this.smithLastF = ph;
      }
    }

    // archers and catapult on the wall
    const nArch = this.visibleArchers();
    for (let i = 0; i < this.archers.length; i++) {
      const a = this.archers[i];
      a.img.setVisible(i < nArch);
      if (i >= nArch) continue;
      if (this.archerT[i] > 0) {
        this.archerT[i] -= step;
        if (this.archerT[i] <= 0) a.play('idle');
      }
      a.step(step);
      a.img.setTint(this.spriteTint);
    }
    if (this.catapult) this.catapult.setVisible(Math.max(view.world.castle.catapultLevel, this.modCatapult) >= 1);

    // pit lid
    if (this.pitTimer > 0) this.pitTimer -= step;
    const open = view.world.castle.pitOpen || this.pitTimer > 0;
    if (this.pit) {
      if (open !== this.pitShown) {
        this.pitShown = open;
        this.pit.play(open ? 'open' : 'idle');
        if (!open && this.pit.info?.clips.get('open')) {
          // close: play the opening backwards
          this.pit.clip = this.pit.info.clips.get('open')!;
          this.pit.clipT = -this.pit.clip.duration;
        }
      }
      if (this.pit.clipT < 0) {
        // reverse playback
        this.pit.clipT = Math.min(0, this.pit.clipT + step);
        const c = this.pit.clip!;
        const f = Math.max(0, Math.min(c.frames - 1, Math.floor((-this.pit.clipT / c.duration) * c.frames)));
        this.pit.img.setFrame(c.names[f], false, false);
        if (this.pit.clipT >= 0) this.pit.play('idle');
      } else this.pit.step(step);
    } else if (this.pitG && this.pitRect && open !== this.pitShown) {
      this.pitShown = open;
      this.drawPitFallback(this.pitRect, open);
    }

    this.stepWeather(view, step);
  }

  private stepWeather(view: RenderView, dt: number): void {
    const vw = view.layout.viewW;
    for (const d of this.drops) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      switch (this.weather) {
        case 'rain':
          if (d.y > 720 || d.life <= 0) this.respawnDrop(d, false);
          d.img.setPosition(d.x, d.y).setRotation(Math.atan2(d.vy, d.vx)).setScale((d.s * 1.6) / atlasScale(), (d.s * 0.35) / atlasScale());
          break;
        case 'embers': {
          d.x += Math.sin(this.clock * 2 + d.s * 40) * 12 * dt;
          if (d.life <= 0 || d.y < -20) this.respawnDrop(d, false);
          const k = d.life / d.max;
          d.img.setPosition(d.x, d.y).setScale(d.s / atlasScale()).setAlpha(clamp01(k * 3) * 0.9 * (0.6 + 0.4 * Math.sin(this.clock * 9 + d.s * 30)));
          break;
        }
        case 'fog':
          if (d.x > vw + 400 + view.cameraX * 0.6) d.x = -400 + view.cameraX * 0.6;
          d.img.setPosition(d.x, d.y).setScale(d.s / atlasScale(), (d.s * 0.35) / atlasScale()).setAlpha(0.16);
          break;
        default:
          break;
      }
    }
    if (this.weather === 'rain' && dt > 0) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 7 + Math.random() * 9;
        this.flashA = 0.55;
        this.fx?.lightning();
      }
    }
    if (this.flashA > 0) {
      this.flashA = Math.max(0, this.flashA - dt * 2.2);
      this.flash.setAlpha(this.flashA * (Math.sin(this.clock * 60) > -0.3 ? 1 : 0.4));
    } else this.flash.setAlpha(0);
  }

  relayout(viewW: number): void {
    const px = spriteFrame('px');
    this.flash.setScale(viewW / px.w / atlasScale(), 720 / px.h / atlasScale()).setTint(0xdde6ff);
  }

  destroy(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    for (const p of this.props) p.destroy();
    for (const o of this.objs) o.destroy();
    this.props = [];
    this.objs = [];
    this.drops = [];
    this.glows = [];
    this.flames = [];
    this.archers = [];
  }
}

// ---------------------------------------------------------------------------

function fallbackKey(chapter: number, layer: string, tile: number): string {
  return `bgfb:${chapter}:${layer}:${tile}`;
}

/** Paints the generated courtyard for a chapter once per session (cached textures). */
export function ensureFallbackTextures(scene: Phaser.Scene, chapter: number, view: Pick<RenderView, 'data'>): void {
  const meta = fallbackMeta(chapter, view.data.balance.world);
  if (scene.textures.exists(fallbackKey(chapter, 'main', 0))) return;
  const pal = paletteOf(chapter);
  const geo = courtyardGeo(view.data.balance.world);
  const q = Math.min(assetScale(), 1.5);
  for (const layer of meta.layers) {
    // sky and far are soft: 1x is plenty
    const k = layer.id === 'sky' || layer.id === 'far' ? 1 : q;
    const full = document.createElement('canvas');
    full.width = Math.ceil(layer.w * k);
    full.height = Math.ceil(layer.h * k);
    const ctx = full.getContext('2d')!;
    ctx.scale(k, k);
    if (layer.id === 'sky') paintSky(ctx, layer.w, layer.h, pal);
    else if (layer.id === 'far') paintFar(ctx, layer.w, layer.h, pal);
    else if (layer.id === 'main') paintMain(ctx, layer.w, layer.h, pal, geo);
    else paintFront(ctx, layer.w, layer.h, pal);
    for (let i = 0; i < layer.tiles; i++) {
      const tw = Math.min(layer.tileW, layer.w - i * layer.tileW);
      const tex = scene.textures.createCanvas(fallbackKey(chapter, layer.id, i), Math.ceil(tw * k), full.height);
      if (!tex) continue;
      tex.getContext().drawImage(full, Math.floor(i * layer.tileW * k), 0, Math.ceil(tw * k), full.height, 0, 0, Math.ceil(tw * k), full.height);
      tex.refresh();
    }
  }
}

/**
 * Static courtyard for menus: the chapter background (baked when loaded, generated otherwise)
 * laid out as the battle camera would see it at `scrollX`. Returns the created images.
 */
export function addStaticCourtyard(scene: Phaser.Scene, chapter: number, scrollX: number, vw: number, depth: number, view: Pick<RenderView, 'data'>): Phaser.GameObjects.Image[] {
  const baked = bgForChapter(chapter);
  const bakedOk = !!baked && baked.layers.every((l) => {
    for (let i = 0; i < l.tiles; i++) if (!scene.textures.exists(bgTextureKey(baked.id, l.id, i))) return false;
    return true;
  });
  const meta = bakedOk ? baked! : fallbackMeta(chapter, view.data.balance.world);
  if (!bakedOk) ensureFallbackTextures(scene, chapter, view);
  const out: Phaser.GameObjects.Image[] = [];
  meta.layers.forEach((layer, li) => {
    for (let i = 0; i < layer.tiles; i++) {
      const key = bakedOk ? bgTextureKey(meta.id, layer.id, i) : fallbackKey(chapter, layer.id, i);
      if (!scene.textures.exists(key)) continue;
      const src = scene.textures.get(key).getSourceImage() as { width: number; height: number };
      const tileW = Math.min(layer.tileW, layer.w - i * layer.tileW);
      const x = i * layer.tileW - scrollX * layer.parallax;
      if (x > vw || x + tileW < 0) continue;
      const img = scene.add.image(x, 0, key).setOrigin(0, 0).setDepth(depth + li);
      img.setScale(tileW / src.width, layer.h / src.height);
      out.push(img);
    }
  });
  return out;
}
