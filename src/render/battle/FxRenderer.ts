/**
 * Event-driven battle FX: pooled particles, pooled damage numbers, spell rings,
 * screen shake, Ash-hurt vignette, white flash, haptics.
 * Nothing here allocates per frame; spawns reuse pooled objects.
 */
import type { BattleRenderer, EntityState, EventBus, GameEvents, HudLayout, RenderView, Unsubscribe } from '../../contracts';
import { findEntity } from '../../core/world';
import { applyFrame, frameOf, spriteFrame, type FrameInfo } from '../art/atlas';
import { FONT_L } from '../art/build';
import { clamp01, numStr, plusStr } from '../style';
import type { WorldQuery } from './WorldRenderer';

interface Part {
  img: Phaser.GameObjects.Image;
  on: boolean;
  add: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  a0: number;
  rot: number;
  vr: number;
  align: boolean;
  stretch: number;
}

interface Num {
  t: Phaser.GameObjects.BitmapText;
  on: boolean;
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

const DMG_COLOR: Record<string, number> = {
  physical: 0xffffff,
  fire: 0xffa040,
  holy: 0xffe36a,
  pierce: 0x8fe8ff,
};
const SPARK_COLOR: Record<string, number> = {
  physical: 0xfff0c0,
  fire: 0xff8a2a,
  holy: 0xfff27a,
  pierce: 0x9fefff,
};

const DEPTH_PART = 2000;
const DEPTH_PART_ADD = 2001;
const DEPTH_NUM = 2200;

export class FxRenderer implements BattleRenderer {
  readonly id = 'fx';
  private scene!: Phaser.Scene;
  private view!: RenderView;
  private R = 1;
  private parts: Part[] = [];
  private nums: Num[] = [];
  private active = 0;
  private unsubs: Unsubscribe[] = [];
  private vignette!: Phaser.GameObjects.Image;
  private flash!: Phaser.GameObjects.Image;
  private dim!: Phaser.GameObjects.Image;
  private vignetteA = 0;
  private flashA = 0;
  private dimA = 0;
  private ashDead = false;
  private lastHaptic = 0;
  private clock = 0;
  private trailTick = 0;
  private fr: Record<string, FrameInfo> = {};
  private groundY = 610;

  create(scene: Phaser.Scene, view: RenderView, bus: EventBus): void {
    this.scene = scene;
    this.view = view;
    this.R = scene.cameras.main.zoom;
    this.groundY = view.data.balance.world.groundY;
    for (const k of ['p_dot', 'p_spark', 'p_smoke', 'p_ring', 'p_star', 'p_shard', 'p_bone', 'glow', 'arrow', 'rock', 'px', 'vignette', 'coin']) {
      this.fr[k] = frameOf(k) ?? spriteFrame(k);
    }
    const lim = view.data.balance.limits;
    const pool = Math.max(lim.maxParticlesHigh, lim.maxParticlesLow);
    for (let i = 0; i < pool; i++) {
      const img = scene.add.image(0, 0, this.fr.p_dot.tex, this.fr.p_dot.frame).setVisible(false).setDepth(DEPTH_PART);
      this.parts.push({ img, on: false, add: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 1, s0: 1, s1: 1, a0: 1, rot: 0, vr: 0, align: false, stretch: 1 });
    }
    for (let i = 0; i < lim.maxDamageNumbers; i++) {
      const t = scene.add.bitmapText(0, 0, FONT_L, '0', 20).setOrigin(0.5, 0.5).setVisible(false).setDepth(DEPTH_NUM);
      this.nums.push({ t, on: false, x: 0, y: 0, vy: 0, life: 0, max: 1, size: 20 });
    }
    const v = this.fr.vignette;
    this.vignette = scene.add.image(0, 0, v.tex, v.frame).setOrigin(0, 0).setScrollFactor(0).setDepth(2900).setTint(0xff1a1a).setAlpha(0);
    this.flash = scene.add.image(0, 0, this.fr.px.tex, this.fr.px.frame).setOrigin(0, 0).setScrollFactor(0).setDepth(2950).setAlpha(0);
    this.dim = scene.add.image(0, 0, this.fr.px.tex, this.fr.px.frame).setOrigin(0, 0).setScrollFactor(0).setDepth(2890).setTint(0x14060c).setAlpha(0);
    this.relayout(view.layout);

    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.unsubs.push(bus.on(k, fn));
    on('entity:damaged', (p) => this.onDamaged(p));
    on('entity:healed', (p) => {
      this.burst('p_star', p.x, p.y - 40, 5, 30, 90, -2.6, -0.5, 0.6, 0.5, 0.1, 0x7ee07a, -40, true);
      if (this.view.settings.damageNumbers) this.number(p.x, p.y - 56, plusStr(Math.round(p.amount)), 0x7ee07a, 18);
    });
    on('entity:died', (p) => this.onDied(p));
    on('entity:attack', (p) => this.onAttack(p));
    on('entity:status', (p) => {
      if (!p.applied) return;
      const e = findEntity(this.view.world as never, p.id) as EntityState | undefined;
      if (!e) return;
      const top = this.topOf(e);
      if (p.status === 'burn') this.burst('p_dot', e.x, top + 10, 5, 20, 60, -2.4, -0.7, 0.45, 0.5, 0.1, 0xff8a2a, -80, true);
      else if (p.status === 'stun') this.burst('p_star', e.x, top, 4, 30, 70, -3, 0, 0.5, 0.45, 0.2, 0xfff07a, 0, true);
    });
    on('pickup:collected', (p) => {
      const tint = p.pickup === 'gold' ? 0xffd34d : p.pickup === 'mana' ? 0x6ac8ff : 0x7ee07a;
      this.burst('p_star', p.x, p.y - 8, 6, 40, 120, -Math.PI, 0, 0.45, 0.55, 0.1, tint, 60, true);
      this.number(p.x, p.y - 30, plusStr(Math.round(p.value)), tint, 18);
    });
    on('pickup:dropped', (p) => this.burst('p_dot', p.x, p.y - 6, 3, 20, 60, -2.6, -0.5, 0.3, 0.4, 0.1, 0xfff0a0, 80, true));
    on('spell:cast', (p) => {
      const ash = findEntity(this.view.world as never, this.view.world.ashId) as EntityState | undefined;
      if (ash) {
        this.emit('glow', ash.x, ash.y - 46, 0, 0, 0.35, 0.6, 1.4, 0xc58cff, 0, true, false, 0, 0, 0.9);
        this.ring(ash.x, ash.y - 40, 60, 0xc58cff, 0.4);
      }
      void p;
    });
    on('spell:impact', (p) => this.onImpact(p));
    on('unit:summoned', () => {
      const w = this.view.data.balance.world;
      this.burst('p_smoke', w.stairsX, w.groundY - 10, 6, 30, 90, -Math.PI, 0, 0.6, 0.7, 1.6, 0xd8d0c0, -30, false);
      this.burst('p_star', w.stairsX, w.groundY - 40, 5, 40, 110, -Math.PI, 0, 0.5, 0.5, 0.15, 0x8ec8ff, 0, true);
      this.haptic(12);
    });
    on('book:damaged', () => {
      const w = this.view.data.balance.world;
      this.burst('p_spark', w.bookX, w.groundY - 70, 6, 80, 200, -Math.PI, 0, 0.3, 0.8, 0.3, 0xff5a4f, 300, true, true);
      this.shake(140, 0.0035);
    });
    on('spectacle:hit', (p) => {
      if (p.big) this.shake(180, 0.006);
    });
    on('boss:spawned', () => {
      this.shake(400, 0.008);
      this.flashA = Math.max(this.flashA, 0.35);
    });
    on('boss:phase', (p) => {
      const e = findEntity(this.view.world as never, p.id) as EntityState | undefined;
      if (e) {
        this.ring(e.x, e.y - 80, 260, 0xc070ff, 0.6);
        this.burst('p_spark', e.x, e.y - 80, 18, 120, 360, -Math.PI, Math.PI, 0.5, 1, 0.3, 0xe0a0ff, 0, true, true);
      }
      this.shake(350, 0.009);
      this.flashA = Math.max(this.flashA, 0.45);
    });
    on('castle:shot', (p) => this.onCastleShot(p.source, p.x, p.y));
    on('castle:pit', () => {
      const w = this.view.data.balance.world;
      const cx = (w.pit.left + w.pit.right) / 2;
      this.burst('p_smoke', cx, w.groundY, 10, 40, 120, -Math.PI, 0, 0.8, 0.8, 1.8, 0x8a7a6a, -20, false);
      this.shake(200, 0.005);
    });
    on('ash:dodged', (p) => {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x = p.fromX + ((p.toX - p.fromX) * i) / (n - 1);
        this.emit('p_smoke', x, this.groundY - 8, 0, -20, 0.5, 0.5, 1.2, 0xd8d0c0, 0, false, false, 0, 0, 0.7);
      }
    });
    on('wave:ended', (o) => {
      if (o.reason === 'ash_died') {
        this.ashDead = true;
        this.flashA = 0.6;
        this.shake(300, 0.01);
      }
    });
  }

  // ---- public helpers (also used by the world renderer) ---------------------

  private world: WorldQuery | null = null;
  attachWorld(w: WorldQuery): void {
    this.world = w;
  }
  footDust(x: number, y: number, big: boolean): void {
    this.emit('p_smoke', x, y - 4, (Math.random() - 0.5) * 30, -12, 0.5, big ? 0.5 : 0.3, big ? 1.1 : 0.7, 0xb8a88e, 0, false, false, 0, 0, 0.45);
  }
  ember(x: number, y: number): void {
    this.emit('p_dot', x, y, (Math.random() - 0.5) * 20, -50 - Math.random() * 40, 0.6, 0.45, 0.1, 0xff8a2a, -30, true, false, 0, 0, 0.9);
  }
  anvilSparks(x: number, y: number): void {
    this.burst('p_spark', x, y, 5, 80, 200, -2.8, -0.3, 0.35, 0.45, 0.1, 0xffc060, 500, true, true);
  }
  lightning(): void {
    this.haptic(20);
  }

  /** Small fading trail puff (fireballs etc.), throttled. */
  trail(x: number, y: number, tint: number): void {
    if ((this.trailTick++ & 1) === 1) return;
    this.emit('p_dot', x, y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.3, 0.8, 0.2, tint, 0, true, false, 0, 0, 0.8);
  }

  shake(ms: number, intensity: number): void {
    this.scene.cameras.main.shake(ms, intensity);
  }

  // ---- event handlers -------------------------------------------------------

  private topOf(e: EntityState): number {
    if (this.world) return this.world.topOf(e);
    const f = spriteFrame(e.sprite, e.kind);
    return e.y - f.h * f.ay;
  }

  private onDamaged(p: GameEvents['entity:damaged']): void {
    const world = this.view.world;
    const e = findEntity(world as never, p.id) as EntityState | undefined;
    const isAsh = p.id === world.ashId;
    let hy = p.y - 40;
    if (e) {
      const f = spriteFrame(e.sprite, e.kind);
      hy = e.y - f.h * f.ay * 0.55;
    }
    if (p.blocked) {
      this.burst('p_shard', p.x, hy, 4, 60, 160, -Math.PI, 0, 0.3, 0.5, 0.2, 0xc8c8d0, 400, false);
    } else {
      const n = Math.min(9, 3 + Math.floor(p.amount / 8));
      this.burst('p_spark', p.x, hy, n, 90, 260, -Math.PI, Math.PI, 0.28, 0.7, 0.2, SPARK_COLOR[p.damageKind] ?? 0xffffff, 200, true, true);
      if (e && e.defId.includes('skeleton')) this.burst('p_bone', p.x, hy, 2, 60, 160, -2.8, -0.4, 0.5, 1, 1, 0xffffff, 600, false);
    }
    if (this.view.settings.damageNumbers) {
      const playerSide = e ? e.team === 'player' : isAsh;
      const tint = p.blocked ? 0xa8a8b4 : playerSide ? 0xff6a5a : DMG_COLOR[p.damageKind] ?? 0xffffff;
      const big = p.amount >= 40;
      this.number(p.x + (Math.random() - 0.5) * 14, hy - 14, p.blocked ? '0' : numStr(Math.max(1, Math.round(p.amount))), tint, big ? 28 : 20);
    }
    if (isAsh && !p.blocked) {
      this.vignetteA = Math.min(0.75, this.vignetteA + 0.3 + p.amount / 80);
      this.haptic(35);
      if (p.amount >= 15) this.shake(120, 0.004);
    }
  }

  private onDied(p: GameEvents['entity:died']): void {
    const y = p.y;
    if (p.kind === 'boss') {
      for (let i = 0; i < 3; i++) this.ring(p.x, y - 90, 140 + i * 90, 0xffc070, 0.5 + i * 0.15);
      this.burst('p_spark', p.x, y - 90, 30, 160, 480, -Math.PI, Math.PI, 0.7, 1.2, 0.3, 0xffd080, 300, true, true);
      this.burst('p_smoke', p.x, y - 60, 14, 40, 160, -Math.PI, 0, 1.1, 1.2, 2.6, 0x6a5a6a, -30, false);
      this.shake(600, 0.012);
      this.flashA = Math.max(this.flashA, 0.6);
      return;
    }
    if (p.kind === 'enemy') {
      if (p.cause === 'portal') {
        this.ring(p.x, y - 30, 50, 0xb070ff, 0.4);
        this.burst('p_star', p.x, y - 30, 8, 40, 120, -Math.PI, Math.PI, 0.5, 0.6, 0.1, 0xb070ff, -60, true);
        return;
      }
      if (p.defId.includes('skeleton')) this.burst('p_bone', p.x, y - 30, 6, 80, 220, -2.9, -0.25, 0.7, 1, 1, 0xffffff, 700, false);
      else this.burst('p_dot', p.x, y - 30, 7, 60, 180, -2.9, -0.25, 0.5, 0.8, 0.4, 0x8fae6a, 500, false);
      this.burst('p_smoke', p.x, y - 16, 4, 20, 60, -Math.PI, 0, 0.7, 0.6, 1.4, 0xcfc6b8, -20, false);
      return;
    }
    if (p.kind === 'ally' || p.kind === 'hero') {
      this.burst('p_smoke', p.x, y - 16, 4, 20, 60, -Math.PI, 0, 0.6, 0.6, 1.4, 0xcfc6b8, -20, false);
      this.burst('p_star', p.x, y - 30, 4, 40, 100, -Math.PI, 0, 0.5, 0.5, 0.1, 0x8ec8ff, 100, true);
    }
  }

  private onAttack(p: GameEvents['entity:attack']): void {
    if (!p.ranged) return;
    const world = this.view.world;
    const e = findEntity(world as never, p.id) as EntityState | undefined;
    if (!e) return;
    const f = spriteFrame(e.sprite, e.kind);
    const mx = e.x + e.facing * f.w * 0.48;
    const my = e.y - f.h * f.ay * 0.36;
    if (p.id === world.ashId) {
      this.emit('glow', mx, my, 0, 0, 0.12, 0.35, 0.7, 0xffd080, 0, true, false, 0, 0, 1);
      this.burst('p_spark', mx, my, 4, 120, 260, e.facing > 0 ? -0.4 : Math.PI - 0.4, e.facing > 0 ? 0.4 : Math.PI + 0.4, 0.18, 0.6, 0.2, 0xffe0a0, 0, true, true);
    }
  }

  private onImpact(p: GameEvents['spell:impact']): void {
    const r = Math.max(30, p.radius);
    switch (p.effect) {
      case 'line_blast': {
        const ash = findEntity(this.view.world as never, this.view.world.ashId) as EntityState | undefined;
        const dir = ash ? ash.facing : 1;
        for (let i = 0; i < 10; i++) {
          const x = p.x + dir * (i / 10) * r;
          this.emit('glow', x, p.y - 40, dir * 200, 0, 0.35, 1.2, 0.5, 0xffb040, 0, true, false, 0, 0, 0.9);
        }
        this.burst('p_spark', p.x, p.y - 40, 16, 200, 520, dir > 0 ? -0.3 : Math.PI - 0.3, dir > 0 ? 0.3 : Math.PI + 0.3, 0.4, 1, 0.3, 0xffd080, 0, true, true);
        this.shake(220, 0.007);
        break;
      }
      case 'area_rain':
        for (let i = 0; i < 12; i++) {
          const x = p.x + (Math.random() - 0.5) * r * 2;
          this.emit('arrow', x - 60, p.y - 260 - Math.random() * 80, 260, 700, 0.42, 1, 1, 0xffffff, 0, false, true, 0, 0, 1);
        }
        this.ring(p.x, p.y, r, 0xfff0a0, 0.4);
        break;
      case 'area_strike':
        this.ring(p.x, p.y - 10, r, 0xffc080, 0.45);
        this.burst('p_smoke', p.x, p.y - 10, 12, 60, 200, -Math.PI, 0, 0.8, 0.9, 2.2, 0x9a8a7a, -20, false);
        this.burst('p_shard', p.x, p.y - 10, 10, 120, 320, -Math.PI, 0, 0.5, 0.9, 0.5, 0x8f8a84, 700, false);
        this.shake(260, 0.008);
        break;
      case 'portal_execute':
        this.ring(p.x, p.y - 30, r, 0xb070ff, 0.6);
        this.ring(p.x, p.y - 30, r * 0.6, 0x7dff7a, 0.5);
        this.burst('p_star', p.x, p.y - 30, 14, 40, 160, -Math.PI, Math.PI, 0.7, 0.6, 0.1, 0xc58cff, -40, true);
        break;
      case 'random_boon':
        this.burst('p_star', p.x, p.y - 60, 16, 60, 220, -Math.PI, Math.PI, 0.7, 0.6, 0.2, 0xa8ffbe, -30, true);
        this.flashA = Math.max(this.flashA, 0.25);
        break;
      case 'self_buff':
        this.ring(p.x, p.y - 40, 70, 0xff5a4f, 0.4);
        this.burst('p_spark', p.x, p.y - 40, 10, 80, 200, -Math.PI, Math.PI, 0.4, 0.6, 0.2, 0xff8a6a, 0, true, true);
        break;
      case 'dash_vehicle':
        this.burst('p_smoke', p.x, p.y - 20, 10, 40, 140, -Math.PI, 0, 0.8, 0.8, 2, 0x8a8a8a, -20, false);
        this.shake(300, 0.008);
        break;
      default:
        this.ring(p.x, p.y - 20, r, 0xffffff, 0.45);
        this.burst('p_spark', p.x, p.y - 20, 12, 100, 300, -Math.PI, Math.PI, 0.4, 0.8, 0.2, 0xffffff, 100, true, true);
    }
    this.emit('glow', p.x, p.y - 30, 0, 0, 0.25, r / 40, (r / 40) * 1.4, 0xfff0d0, 0, true, false, 0, 0, 0.8);
  }

  private onCastleShot(source: 'archer' | 'catapult', x: number, y: number): void {
    const w = this.view.data.balance.world;
    const sx = (w.castleRight + 180) / 2;
    const sy = w.groundY - 300;
    const T = source === 'archer' ? 0.32 : 0.7;
    const dx = x - sx;
    const dy = y - 30 - sy;
    if (source === 'archer') {
      this.emit('arrow', sx, sy, dx / T, dy / T, T, 1, 1, 0xffffff, 0, false, true, 0, 0, 1);
    } else {
      const g = 900;
      this.emit('rock', sx, sy, dx / T, dy / T - 0.5 * g * T, T, 1.2, 1.2, 0xffffff, g, false, false, 0, 8, 1);
    }
  }

  // ---- pools -------------------------------------------------------------------

  private cap(): number {
    const lim = this.view.data.balance.limits;
    return this.view.settings.fxQuality === 'low' ? lim.maxParticlesLow : lim.maxParticlesHigh;
  }

  /** Spawn one particle (dropped silently when the quality cap is reached). */
  emit(
    key: string, x: number, y: number, vx: number, vy: number, life: number, s0: number, s1: number,
    tint: number, g: number, add: boolean, align: boolean, rot: number, vr: number, a0: number,
  ): void {
    if (this.active >= this.cap()) return;
    let p: Part | undefined;
    for (let i = 0; i < this.parts.length; i++) {
      if (!this.parts[i].on) {
        p = this.parts[i];
        break;
      }
    }
    if (!p) return;
    const f = this.fr[key] ?? spriteFrame(key);
    applyFrame(p.img, f, s0);
    p.img.setOrigin(0.5, 0.5).setTint(tint).setVisible(true).setAlpha(a0);
    p.img.setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    p.img.setDepth(add ? DEPTH_PART_ADD : DEPTH_PART);
    p.on = true;
    p.add = add;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.g = g;
    p.drag = 0;
    p.life = life;
    p.max = life;
    p.s0 = s0;
    p.s1 = s1;
    p.a0 = a0;
    p.rot = rot;
    p.vr = vr;
    p.align = align;
    this.active++;
  }

  burst(
    key: string, x: number, y: number, count: number, sMin: number, sMax: number, aMin: number, aMax: number,
    life: number, s0: number, s1: number, tint: number, g: number, add: boolean, align = false,
  ): void {
    const mul = this.view.settings.fxQuality === 'low' ? 0.5 : 1;
    const n = Math.max(1, Math.round(count * mul));
    for (let i = 0; i < n; i++) {
      const a = aMin + Math.random() * (aMax - aMin);
      const sp = sMin + Math.random() * (sMax - sMin);
      this.emit(key, x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * (0.7 + Math.random() * 0.6), s0, s1, tint, g, add, align, Math.random() * 6.28, align ? 0 : (Math.random() - 0.5) * 8, 1);
    }
  }

  ring(x: number, y: number, radius: number, tint: number, life: number): void {
    const end = radius / 46;
    this.emit('p_ring', x, y, 0, 0, life, end * 0.2, end, tint, 0, true, false, 0, 0, 0.95);
  }

  number(x: number, y: number, text: string, tint: number, size: number): void {
    let n: Num | undefined;
    let oldest: Num | undefined;
    for (const it of this.nums) {
      if (!it.on) {
        n = it;
        break;
      }
      if (!oldest || it.life < oldest.life) oldest = it;
    }
    n = n ?? oldest;
    if (!n) return;
    n.on = true;
    n.x = x;
    n.y = y;
    n.vy = -70;
    n.life = 0.8;
    n.max = 0.8;
    n.size = size;
    n.t.setText(text).setTint(tint).setVisible(true).setAlpha(1).setPosition(x, y);
  }

  haptic(ms: number): void {
    if (!this.view.settings.haptics) return;
    const now = performance.now();
    if (now - this.lastHaptic < 120) return;
    this.lastHaptic = now;
    try {
      const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
      if (typeof nav.vibrate !== 'function') return;
      if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
      if (!(navigator.maxTouchPoints > 0)) return;
      nav.vibrate(ms);
    } catch {
      /* haptics are best-effort */
    }
  }

  // ---- frame -------------------------------------------------------------------

  frame(view: RenderView, _alpha: number, frameDtMs: number): void {
    const dt = view.paused ? 0 : Math.min(frameDtMs, 50) / 1000;
    this.clock += dt;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        p.img.setVisible(false);
        this.active--;
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const k = 1 - p.life / p.max;
      const s = p.s0 + (p.s1 - p.s0) * k;
      p.img.setPosition(p.x, p.y);
      p.img.setScale(s / this.R);
      p.img.setAlpha(p.a0 * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4));
      p.img.setRotation(p.align ? Math.atan2(p.vy, p.vx) : p.rot);
    }
    for (const n of this.nums) {
      if (!n.on) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.on = false;
        n.t.setVisible(false);
        continue;
      }
      const k = 1 - n.life / n.max;
      n.vy *= 1 - Math.min(1, dt * 3);
      n.y += n.vy * dt;
      const pop = k < 0.15 ? 1.4 - (k / 0.15) * 0.4 : 1;
      n.t.setPosition(n.x, n.y);
      n.t.setFontSize(n.size * pop);
      n.t.setAlpha(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }
    // overlays
    const realDt = Math.min(frameDtMs, 50) / 1000;
    this.vignetteA = Math.max(0, this.vignetteA - realDt * 1.4);
    this.flashA = Math.max(0, this.flashA - realDt * 3);
    const ash = findEntity(view.world as never, view.world.ashId) as EntityState | undefined;
    let low = 0;
    if (ash && ash.hp > 0 && ash.hp / ash.maxHp < 0.3) low = 0.22 + 0.1 * Math.sin(this.clock * 6);
    if (this.ashDead) {
      low = 0.55;
      this.dimA = Math.min(0.45, this.dimA + realDt * 0.6);
    }
    this.vignette.setAlpha(clamp01(Math.max(this.vignetteA, low)));
    this.flash.setAlpha(this.flashA);
    this.dim.setAlpha(this.dimA);
  }

  relayout(layout: HudLayout): void {
    const v = this.fr.vignette;
    this.vignette.setScale(layout.viewW / v.w / this.R, layout.viewH / v.h / this.R);
    const px = this.fr.px;
    this.flash.setScale(layout.viewW / px.w / this.R, layout.viewH / px.h / this.R);
    this.dim.setScale(layout.viewW / px.w / this.R, layout.viewH / px.h / this.R);
  }

  destroy(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    for (const p of this.parts) p.img.destroy();
    for (const n of this.nums) n.t.destroy();
    this.parts = [];
    this.nums = [];
    this.vignette.destroy();
    this.flash.destroy();
    this.dim.destroy();
  }
}
