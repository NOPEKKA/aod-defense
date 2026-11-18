/**
 * Event-driven battle FX (ART_BIBLE section 7), sized for the 165 px baked characters:
 *   - baked fx_* sheets (slash, spark burst, muzzle flash, bone burst, smoke, dust, explosion,
 *     shockwave, magic circle, portal, heal, holy beam, soul...) played from a pooled set of
 *     images by render time, procedural particles when a sheet is not baked;
 *   - pooled particles with gravity and a ground plane (bone gibs fly, bounce and settle);
 *   - pooled damage numbers, pickups flying to the HUD, boss intro banner;
 *   - camera shake, hit-stop, white flash, Ash-hurt vignette, haptics.
 * Nothing here allocates per frame; every spawn reuses a pooled object and respects
 * balance.limits and settings.fxQuality.
 */
import type { BattleRenderer, EntityState, EventBus, GameEvents, HudLayout, RenderView, Unsubscribe } from '../../contracts';
import { findEntity } from '../../core/world';
import { applyFrame, atlasScale, frameOf, spriteFrame, type FrameInfo } from '../art/atlas';
import { FONT_DMG } from '../art/build';
import { warnOnce } from '../assets/library';
import { lazyFx } from '../assets/preload';
import { getSpriteInfo, type ClipInfo, type SpriteInfo } from '../assets/sprites';
import { FONT, clamp01, easeOutBack, easeOutCubic, numStr, plusStr } from '../style';
import { DEPTH } from './depth';
import { hitStop, hitStopActive, resetHitStop } from './hitstop';
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
  life: number;
  max: number;
  s0: number;
  s1: number;
  a0: number;
  rot: number;
  vr: number;
  align: boolean;
  /** ground y to bounce on (0 = none) */
  floor: number;
  /** display scale factor of the texture (1/atlasScale or 1/assetScale) */
  k: number;
  settled: boolean;
}

interface Sheet {
  img: Phaser.GameObjects.Image;
  on: boolean;
  clip: ClipInfo | null;
  t: number;
  speed: number;
  x: number;
  y: number;
  vy: number;
  s: number;
  a: number;
  /** extra hold seconds on the last frame with a fade (non-looping) */
  hold: number;
  /** total life for looping sheets (seconds) */
  life: number;
  fadeIn: number;
}

interface Num {
  t: Phaser.GameObjects.BitmapText;
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

interface Flyer {
  img: Phaser.GameObjects.Image;
  on: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  T: number;
  s: number;
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
const SHEET_POOL = 56;
const FLYER_POOL = 18;

export class FxRenderer implements BattleRenderer {
  readonly id = 'fx';
  private scene!: Phaser.Scene;
  private view!: RenderView;
  private world: WorldQuery | null = null;
  private parts: Part[] = [];
  private sheets: Sheet[] = [];
  private nums: Num[] = [];
  private flyers: Flyer[] = [];
  private active = 0;
  private unsubs: Unsubscribe[] = [];
  private vignette!: Phaser.GameObjects.Image;
  private flash!: Phaser.GameObjects.Image;
  private dim!: Phaser.GameObjects.Image;
  private banner!: Phaser.GameObjects.Container;
  private bannerBg!: Phaser.GameObjects.Graphics;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerName!: Phaser.GameObjects.Text;
  private bannerT = -1;
  private vignetteA = 0;
  private flashA = 0;
  private dimA = 0;
  private ashDead = false;
  private lastHaptic = 0;
  private clock = 0;
  private trailTick = 0;
  private fr: Record<string, FrameInfo> = {};
  private infos = new Map<string, SpriteInfo | null>();
  private gy = 520;
  private layout!: HudLayout;

  create(scene: Phaser.Scene, view: RenderView, bus: EventBus): void {
    this.scene = scene;
    this.view = view;
    this.layout = view.layout;
    this.gy = view.data.balance.world.groundY;
    resetHitStop();
    // stream the rarer effect sheets in once the wave is running; drop cached misses when done
    scene.time.delayedCall(1200, () =>
      lazyFx(scene, () => {
        for (const [k, v] of this.infos) if (v === null) this.infos.delete(k);
      }),
    );
    for (const k of ['p_dot', 'p_spark', 'p_smoke', 'p_ring', 'p_star', 'p_shard', 'p_bone', 'glow', 'arrow', 'rock', 'px', 'vignette', 'coin', 'coin_silver', 'mana_orb', 'food']) {
      this.fr[k] = frameOf(k) ?? spriteFrame(k);
    }
    const lim = view.data.balance.limits;
    const pool = Math.max(lim.maxParticlesHigh, lim.maxParticlesLow);
    const p0 = this.fr.p_dot;
    for (let i = 0; i < pool; i++) {
      const img = scene.add.image(0, 0, p0.tex, p0.frame).setVisible(false).setDepth(DEPTH.fx);
      this.parts.push({ img, on: false, add: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, s0: 1, s1: 1, a0: 1, rot: 0, vr: 0, align: false, floor: 0, k: 1, settled: false });
    }
    for (let i = 0; i < SHEET_POOL; i++) {
      const img = scene.add.image(0, 0, p0.tex, p0.frame).setVisible(false).setDepth(DEPTH.fx);
      this.sheets.push({ img, on: false, clip: null, t: 0, speed: 1, x: 0, y: 0, vy: 0, s: 1, a: 1, hold: 0, life: 0, fadeIn: 0 });
    }
    for (let i = 0; i < lim.maxDamageNumbers; i++) {
      const t = scene.add.bitmapText(0, 0, FONT_DMG, '0', 20).setOrigin(0.5, 0.5).setVisible(false).setDepth(DEPTH.nums);
      this.nums.push({ t, on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 20 });
    }
    for (let i = 0; i < FLYER_POOL; i++) {
      const img = scene.add.image(0, 0, p0.tex, p0.frame).setVisible(false).setScrollFactor(0).setDepth(DEPTH.hud + 50);
      this.flyers.push({ img, on: false, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, T: 1, s: 1 });
    }
    const v = this.fr.vignette;
    this.vignette = scene.add.image(0, 0, v.tex, v.frame).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.overlay).setTint(0xff1a1a).setAlpha(0);
    this.flash = scene.add.image(0, 0, this.fr.px.tex, this.fr.px.frame).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.overlay + 20).setAlpha(0);
    this.dim = scene.add.image(0, 0, this.fr.px.tex, this.fr.px.frame).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.overlay - 10).setTint(0x14060c).setAlpha(0);
    this.buildBanner();
    this.relayout(view.layout);

    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.unsubs.push(bus.on(k, fn));
    on('entity:damaged', (p) => this.onDamaged(p));
    on('entity:healed', (p) => {
      const e = this.ent(p.id);
      const top = e ? this.topOf(e) : p.y - 120;
      if (!this.sheet('fx_heal', p.x, e ? e.y : p.y, 0.7, 0)) this.burst('p_star', p.x, top + 40, 6, 30, 90, -2.6, -0.5, 0.7, 0.7, 0.15, 0x7ee07a, -40, true);
      if (this.view.settings.damageNumbers) this.number(p.x, top - 6, plusStr(Math.round(p.amount)), 0x7ee07a, 20);
    });
    on('entity:died', (p) => this.onDied(p));
    on('entity:attack', (p) => this.onAttack(p));
    on('entity:status', (p) => {
      if (!p.applied) return;
      const e = this.ent(p.id);
      if (!e) return;
      const top = this.topOf(e);
      if (p.status === 'burn') this.burst('p_dot', e.x, top + 30, 6, 20, 70, -2.4, -0.7, 0.55, 0.8, 0.15, 0xff8a2a, -80, true);
      else if (p.status === 'stun') this.burst('p_star', e.x, top, 5, 30, 80, -3, 0, 0.55, 0.6, 0.25, 0xfff07a, 0, true);
    });
    on('pickup:collected', (p) => this.onCollected(p));
    on('pickup:dropped', (p) => this.burst('p_star', p.x, p.y - 20, 3, 30, 80, -2.6, -0.5, 0.35, 0.5, 0.1, 0xfff0a0, 80, true));
    on('spell:cast', () => {
      const ash = this.ent(this.view.world.ashId);
      if (!ash) return;
      if (!this.sheet('fx_magic_circle', ash.x, ash.y, 0.8, 0, 0.35)) this.ring(ash.x, ash.y - 10, 70, 0xc58cff, 0.5);
      this.emit('glow', ash.x, this.topOf(ash) + 60, 0, 0, 0.35, 0.9, 1.8, 0xc58cff, 0, true, false, 0, 0, 0.8);
    });
    on('spell:impact', (p) => this.onImpact(p));
    on('unit:summoned', () => {
      const w = this.view.data.balance.world;
      if (!this.sheet('fx_magic_circle', w.stairsX + 10, this.gy, 0.7, 0, 0.1)) this.ring(w.stairsX, this.gy - 6, 60, 0x8ec8ff, 0.5);
      if (!this.sheet('fx_smoke_puff', w.stairsX + 10, this.gy, 1, 0)) this.burst('p_smoke', w.stairsX, this.gy - 14, 6, 30, 90, -Math.PI, 0, 0.6, 1, 2.2, 0xd8d0c0, -30, false);
      this.burst('p_star', w.stairsX, this.gy - 70, 5, 40, 120, -Math.PI, 0, 0.5, 0.7, 0.2, 0x8ec8ff, 0, true);
      this.haptic(12);
    });
    on('book:damaged', () => {
      const w = this.view.data.balance.world;
      this.burst('p_spark', w.bookX, this.gy - 100, 7, 80, 220, -Math.PI, 0, 0.3, 1.1, 0.4, 0xff5a4f, 300, true, true);
      this.shake(140, 0.0035);
    });
    on('spectacle:hit', (p) => {
      if (p.big) {
        this.shake(180, 0.006);
        hitStop(45);
      }
    });
    on('boss:spawned', (p) => this.onBossSpawned(p.bossId));
    on('boss:phase', (p) => {
      const e = this.ent(p.id);
      if (e) {
        const cy = this.topOf(e) + this.heightOf(e) * 0.5;
        if (!this.sheet('fx_shockwave', e.x, e.y, 1.6, 0)) this.ring(e.x, e.y, 260, 0xc070ff, 0.6);
        this.burst('p_spark', e.x, cy, 18, 140, 380, -Math.PI, Math.PI, 0.5, 1.4, 0.4, 0xe0a0ff, 0, true, true);
      }
      this.shake(350, 0.009);
      hitStop(80);
      this.flashA = Math.max(this.flashA, 0.45);
    });
    on('castle:shot', (p) => {
      // the projectile itself is a sim entity; this is only the release puff on the wall
      if (p.source === 'catapult') this.shake(90, 0.002);
    });
    on('castle:pit', () => {
      const w = this.view.data.balance.world;
      const cx = (w.pit.left + w.pit.right) / 2;
      if (!this.sheet('fx_dust_puff', cx, this.gy, 2.2, 0)) this.burst('p_smoke', cx, this.gy, 10, 40, 120, -Math.PI, 0, 0.8, 1.1, 2.4, 0x8a7a6a, -20, false);
      this.burst('p_shard', cx, this.gy - 10, 8, 80, 220, -2.8, -0.3, 0.6, 0.8, 0.5, 0x6a4a2a, 900, false);
      this.shake(220, 0.006);
    });
    on('ash:dodged', (p) => {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x = p.fromX + ((p.toX - p.fromX) * i) / (n - 1);
        if (!this.sheet('fx_dust_puff', x, this.gy, 0.8, 0)) this.emit('p_smoke', x, this.gy - 10, 0, -20, 0.5, 0.7, 1.6, 0xd8d0c0, 0, false, false, 0, 0, 0.7);
      }
    });
    on('smith:upgraded', () => this.flashA = Math.max(this.flashA, 0.12));
    on('wave:ended', (o) => {
      if (o.reason === 'ash_died') {
        this.ashDead = true;
        this.flashA = 0.6;
        this.shake(300, 0.01);
      }
    });
  }

  attachWorld(w: WorldQuery): void {
    this.world = w;
  }

  // ---- hooks used by the world layers ----------------------------------------

  /** Small fading trail puff (fireballs etc.), throttled. */
  trail(x: number, y: number, tint: number): void {
    if ((this.trailTick++ & 1) === 1) return;
    this.emit('p_dot', x, y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.35, 1, 0.3, tint, 0, true, false, 0, 0, 0.8);
  }
  footDust(x: number, y: number, big: boolean): void {
    if (this.view.settings.fxQuality === 'low' && !big) return;
    if (!this.sheet('fx_dust_puff', x, y, big ? 0.9 : 0.55, 0, 0, 0.55)) {
      this.emit('p_smoke', x, y - 4, (Math.random() - 0.5) * 30, -12, 0.5, big ? 0.6 : 0.4, big ? 1.4 : 0.9, 0xb8a88e, 0, false, false, 0, 0, 0.4);
    }
  }
  ember(x: number, y: number): void {
    this.emit('p_dot', x, y, (Math.random() - 0.5) * 20, -50 - Math.random() * 40, 0.6, 0.6, 0.15, 0xff8a2a, -30, true, false, 0, 0, 0.9);
  }
  anvilSparks(x: number, y: number): void {
    this.burst('p_spark', x, y, 6, 90, 220, -2.8, -0.3, 0.35, 0.6, 0.15, 0xffc060, 600, true, true);
  }
  lightning(): void {
    this.haptic(20);
  }
  shake(ms: number, intensity: number): void {
    this.scene.cameras.main.shake(ms, intensity);
  }

  // ---- lookups -------------------------------------------------------------------

  private ent(id: number): EntityState | undefined {
    return findEntity(this.view.world as never, id) as EntityState | undefined;
  }
  private topOf(e: EntityState): number {
    if (this.world) return this.world.topOf(e);
    return e.y - e.alt - 160;
  }
  private heightOf(e: EntityState): number {
    return this.world ? this.world.heightOf(e) : 160;
  }
  /** a point at fraction `k` of the figure's height (0 feet, 1 head top) */
  private bodyY(e: EntityState, k: number): number {
    const top = this.topOf(e);
    const h = this.heightOf(e);
    return top + h * (1 - k);
  }
  private info(key: string): SpriteInfo | null {
    let i = this.infos.get(key);
    if (i === undefined || (i === null && Math.random() < 0.02)) {
      i = getSpriteInfo(this.scene, key);
      this.infos.set(key, i);
    }
    return i;
  }

  // ---- event handlers --------------------------------------------------------------

  private onDamaged(p: GameEvents['entity:damaged']): void {
    const world = this.view.world;
    const e = this.ent(p.id);
    const isAsh = p.id === world.ashId;
    const hy = e ? this.bodyY(e, 0.55) : p.y - 80;
    const hx = e ? e.x : p.x;
    if (p.blocked) {
      this.burst('p_shard', hx, hy, 5, 80, 200, -Math.PI, 0, 0.35, 0.7, 0.3, 0xd8d8e0, 500, false);
      this.sheet('fx_spark_burst', hx, hy, 0.45, 0, 0, 0.8, 0xc8d8ff);
    } else {
      const n = Math.min(9, 3 + Math.floor(p.amount / 8));
      const tint = SPARK_COLOR[p.damageKind] ?? 0xffffff;
      if (!this.sheet('fx_spark_burst', hx + (Math.random() - 0.5) * 16, hy, 0.5 + Math.min(0.5, p.amount / 80), Math.random() * 6, 0, 0.95, tint)) {
        this.emit('glow', hx, hy, 0, 0, 0.15, 0.5, 0.9, tint, 0, true, false, 0, 0, 0.8);
      }
      this.burst('p_spark', hx, hy, n, 110, 300, -Math.PI, Math.PI, 0.28, 1, 0.3, tint, 260, true, true);
      if (e && isBony(e.defId) && Math.random() < 0.6) this.gibs(hx, hy, e.y, 1, 0.8);
    }
    if (this.view.settings.damageNumbers) {
      const playerSide = e ? e.team === 'player' : isAsh;
      const tint = p.blocked ? 0xa8a8b4 : playerSide ? 0xff6a5a : DMG_COLOR[p.damageKind] ?? 0xffffff;
      const big = p.amount >= 40;
      const top = e ? this.topOf(e) : p.y - 140;
      this.number(hx + (Math.random() - 0.5) * 20, top - 4, p.blocked ? '0' : numStr(Math.max(1, Math.round(p.amount))), tint, big ? 30 : 22);
    }
    if (isAsh && !p.blocked) {
      this.vignetteA = Math.min(0.42, this.vignetteA + 0.2 + p.amount / 120);
      this.haptic(35);
      if (p.amount >= 15) {
        this.shake(120, 0.004);
        hitStop(40);
      }
    } else if (e && e.kind === 'boss' && p.amount >= 25) {
      hitStop(35);
    } else if (p.amount >= 60) {
      hitStop(45);
      this.shake(120, 0.003);
    }
  }

  private onDied(p: GameEvents['entity:died']): void {
    const y = p.y;
    if (p.kind === 'boss') {
      const e = this.ent(p.id);
      const h = e ? this.heightOf(e) : 300;
      for (let i = 0; i < 3; i++) {
        if (!this.sheet('fx_explosion', p.x + (i - 1) * 60, y - h * (0.3 + i * 0.15), 1.4 - i * 0.2, Math.random() * 6, i * 0.12)) this.ring(p.x, y - 90, 140 + i * 90, 0xffc070, 0.5 + i * 0.15);
      }
      this.sheet('fx_shockwave', p.x, y, 2.2, 0, 0.1);
      this.burst('p_spark', p.x, y - h * 0.5, 30, 160, 480, -Math.PI, Math.PI, 0.7, 1.6, 0.4, 0xffd080, 300, true, true);
      this.burst('p_smoke', p.x, y - h * 0.3, 14, 40, 160, -Math.PI, 0, 1.1, 1.6, 3.4, 0x6a5a6a, -30, false);
      this.shake(600, 0.012);
      hitStop(120);
      this.flashA = Math.max(this.flashA, 0.6);
      return;
    }
    if (p.kind === 'enemy') {
      if (p.cause === 'portal') {
        if (!this.sheet('fx_portal', p.x, y, 0.5, 0)) this.ring(p.x, y - 30, 50, 0xb070ff, 0.4);
        this.sheet('fx_soul', p.x, y - 40, 0.9, 0, 0, 1, 0xc58cff, -60, 0.9);
        this.burst('p_star', p.x, y - 50, 8, 40, 120, -Math.PI, Math.PI, 0.5, 0.8, 0.15, 0xb070ff, -60, true);
        return;
      }
      if (isBony(p.defId)) {
        this.sheet('fx_bone_burst', p.x, y - 40, 0.9, 0);
        this.gibs(p.x, y - 60, y, 4, 1);
      } else {
        this.burst('p_dot', p.x, y - 50, 7, 60, 180, -2.9, -0.25, 0.5, 1, 0.5, 0x8fae6a, 500, false);
      }
      if (!this.sheet('fx_smoke_puff', p.x, y, 0.8, 0, 0.15, 0.8)) this.burst('p_smoke', p.x, y - 20, 4, 20, 60, -Math.PI, 0, 0.7, 0.8, 1.8, 0xcfc6b8, -20, false);
      return;
    }
    if (p.kind === 'ally' || p.kind === 'hero') {
      if (!this.sheet('fx_smoke_puff', p.x, y, 0.8, 0, 0.2, 0.8)) this.burst('p_smoke', p.x, y - 20, 4, 20, 60, -Math.PI, 0, 0.6, 0.8, 1.8, 0xcfc6b8, -20, false);
      if (!this.sheet('fx_soul', p.x, y - 60, 0.8, 0, 0.3, 0.9, 0xbfe6ff, -50, 1.2)) this.burst('p_star', p.x, y - 50, 4, 40, 100, -Math.PI, 0, 0.5, 0.7, 0.15, 0x8ec8ff, 100, true);
    }
  }

  private onAttack(p: GameEvents['entity:attack']): void {
    const world = this.view.world;
    const e = this.ent(p.id);
    if (!e) return;
    const dir = e.facing;
    if (p.ranged) {
      if (p.id === world.ashId) {
        const mx = e.x + dir * 58;
        const my = this.bodyY(e, 0.45);
        if (!this.sheet('fx_muzzle_flash', mx, my, 0.9, 0, 0, 1, 0xffffff, 0, 0, dir < 0)) {
          this.emit('glow', mx, my, 0, 0, 0.12, 0.5, 1, 0xffd080, 0, true, false, 0, 0, 1);
        }
        this.burst('p_spark', mx, my, 5, 140, 320, dir > 0 ? -0.35 : Math.PI - 0.35, dir > 0 ? 0.35 : Math.PI + 0.35, 0.2, 0.8, 0.3, 0xffe0a0, 0, true, true);
        this.emit('p_smoke', mx + dir * 10, my - 4, dir * 40, -20, 0.6, 0.4, 1.2, 0xd0c8c0, 0, false, false, 0, 0, 0.35);
      }
      return;
    }
    // melee swing: a short arc in front of the attacker
    if (e.kind === 'ash' || e.kind === 'hero' || e.kind === 'boss' || e.size === 'large' || Math.random() < 0.5) {
      const h = this.heightOf(e);
      const sx = e.x + dir * Math.min(70, h * 0.32);
      const sy = this.bodyY(e, 0.5);
      const s = clamp01(h / 165) * 0.85 + 0.15;
      this.sheet('fx_slash', sx, sy, s, dir < 0 ? Math.PI : 0, 0, 0.9, e.team === 'player' ? 0xfff4e0 : 0xffb0a0, 0, 0, dir < 0);
    }
  }

  private onCollected(p: GameEvents['pickup:collected']): void {
    const tint = p.pickup === 'gold' ? 0xffd34d : p.pickup === 'silver' ? 0xdfe8f2 : p.pickup === 'mana' ? 0x6ac8ff : 0x7ee07a;
    if (p.pickup !== 'silver') {
      // silver lands every kill: no star burst or number, just the coin flying home
      this.burst('p_star', p.x, p.y - 24, 6, 40, 120, -Math.PI, 0, 0.45, 0.7, 0.15, tint, 60, true);
      this.number(p.x, p.y - 56, plusStr(Math.round(p.value)), tint, 20);
    }
    // fly the pickup to its HUD readout
    const L = this.layout;
    let tx: number;
    let ty: number;
    let key: string;
    if (p.pickup === 'gold') {
      tx = L.goldLabel.x + 26;
      ty = L.goldLabel.y + L.goldLabel.h / 2;
      key = 'coin';
    } else if (p.pickup === 'silver') {
      tx = L.ironPanel.x + L.ironPanel.w * 0.62;
      ty = L.ironPanel.y + L.ironPanel.h * 0.45;
      key = 'coin_silver';
    } else if (p.pickup === 'mana') {
      const b = L.spellButtons[0];
      tx = b.x + b.w / 2;
      ty = b.y + b.h / 2;
      key = 'mana_orb';
    } else {
      tx = L.ashBar.x + 20;
      ty = L.ashBar.y + L.ashBar.h / 2;
      key = 'food';
    }
    const n = p.pickup === 'gold' ? Math.min(4, 1 + Math.floor(p.value / 6)) : 1;
    for (let i = 0; i < n; i++) this.fly(key, p.x - this.view.cameraX + (i - (n - 1) / 2) * 10, p.y - 30, tx, ty, 0.5 + i * 0.07);
  }

  private onImpact(p: GameEvents['spell:impact']): void {
    const r = Math.max(30, p.radius);
    const gy = this.gy;
    switch (p.effect) {
      case 'line_blast': {
        const ash = this.ent(this.view.world.ashId);
        const dir = ash ? ash.facing : 1;
        const y = ash ? this.bodyY(ash, 0.45) : gy - 70;
        this.sheet('fx_muzzle_flash', p.x + dir * 50, y, 2.2, 0, 0, 1, 0xffffff, 0, 0, dir < 0);
        for (let i = 0; i < 10; i++) {
          const x = p.x + dir * (i / 10) * Math.max(r, 360);
          this.emit('glow', x, y, dir * 260, 0, 0.35, 1.6, 0.7, 0xffb040, 0, true, false, 0, 0, 0.9);
        }
        this.burst('p_spark', p.x, y, 18, 220, 600, dir > 0 ? -0.3 : Math.PI - 0.3, dir > 0 ? 0.3 : Math.PI + 0.3, 0.45, 1.3, 0.4, 0xffd080, 0, true, true);
        this.shake(220, 0.007);
        hitStop(50);
        break;
      }
      case 'area_rain':
        for (let i = 0; i < 14; i++) {
          const x = p.x + (Math.random() - 0.5) * r * 2;
          this.emit('arrow', x - 80, gy - 420 - Math.random() * 120, 300, 900, 0.42, 1.4, 1.4, 0xffffff, 0, false, true, 0, 0, 1);
        }
        if (!this.sheet('fx_magic_circle', p.x, gy, (r * 2) / 230, 0, 0, 0.6, 0xfff0a0)) this.ring(p.x, gy, r, 0xfff0a0, 0.4);
        break;
      case 'area_strike':
        if (!this.sheet('fx_explosion', p.x, gy - 60, 1.2, Math.random() * 6)) this.ring(p.x, gy - 10, r, 0xffc080, 0.45);
        this.sheet('fx_shockwave', p.x, gy, (r * 2) / 300 + 0.3, 0, 0.05);
        this.sheet('fx_smoke_puff', p.x, gy, 1.6, 0, 0.2, 0.8);
        this.burst('p_shard', p.x, gy - 20, 12, 140, 380, -Math.PI, 0, 0.6, 1.1, 0.6, 0x8f8a84, 900, false);
        this.shake(260, 0.008);
        hitStop(55);
        break;
      case 'portal_execute':
        if (!this.sheet('fx_portal', p.x, gy, (r * 2) / 260 + 0.2, 0, 0, 1, 0xffffff, 0, 1.4)) {
          this.ring(p.x, gy - 30, r, 0xb070ff, 0.6);
          this.ring(p.x, gy - 30, r * 0.6, 0x7dff7a, 0.5);
        }
        this.burst('p_star', p.x, gy - 50, 14, 40, 160, -Math.PI, Math.PI, 0.7, 0.8, 0.15, 0xc58cff, -40, true);
        break;
      case 'random_boon':
        if (!this.sheet('fx_holy_beam', p.x, gy, 1, 0)) this.burst('p_star', p.x, gy - 90, 16, 60, 220, -Math.PI, Math.PI, 0.7, 0.8, 0.3, 0xa8ffbe, -30, true);
        this.sheet('fx_heal', p.x, gy, 1.1, 0, 0.1);
        this.flashA = Math.max(this.flashA, 0.25);
        break;
      case 'self_buff':
        if (!this.sheet('fx_magic_circle', p.x, gy, 0.9, 0, 0, 1, 0xff8a6a)) this.ring(p.x, gy - 40, 70, 0xff5a4f, 0.4);
        this.burst('p_spark', p.x, gy - 70, 12, 90, 220, -Math.PI, Math.PI, 0.45, 0.9, 0.3, 0xff8a6a, 0, true, true);
        break;
      case 'dash_vehicle':
        if (!this.sheet('fx_dust_puff', p.x, gy, 2, 0)) this.burst('p_smoke', p.x, gy - 20, 10, 40, 140, -Math.PI, 0, 0.8, 1.1, 2.8, 0x8a8a8a, -20, false);
        this.shake(300, 0.008);
        break;
      default:
        if (!this.sheet('fx_spark_burst', p.x, gy - 60, 1.4, 0)) this.ring(p.x, gy - 20, r, 0xffffff, 0.45);
        this.burst('p_spark', p.x, gy - 40, 12, 100, 300, -Math.PI, Math.PI, 0.4, 1.1, 0.3, 0xffffff, 100, true, true);
    }
    this.emit('glow', p.x, gy - 50, 0, 0, 0.3, r / 30, (r / 30) * 1.4, 0xfff0d0, 0, true, false, 0, 0, 0.7);
  }

  private onBossSpawned(bossId: string): void {
    this.shake(500, 0.01);
    hitStop(90);
    this.flashA = Math.max(this.flashA, 0.35);
    const def = this.view.data.bosses.get(bossId);
    this.bannerTitle.setText(this.view.t('ui.boss_incoming'));
    this.bannerName.setText(def ? this.view.t(def.nameKey) : bossId);
    this.bannerT = 0;
    this.banner.setVisible(true);
  }

  private buildBanner(): void {
    const s = this.scene;
    this.banner = s.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.overlay + 30).setVisible(false);
    this.bannerBg = s.add.graphics();
    const R = s.cameras.main.zoom;
    const style = { fontFamily: FONT, fontStyle: 'bold', color: '#ff6a4a', stroke: '#140608', strokeThickness: 6, fontSize: '22px' };
    this.bannerTitle = s.add.text(0, -30, '', style).setOrigin(0.5).setResolution(R);
    this.bannerName = s.add.text(0, 12, '', { ...style, color: '#ffe6c8', fontSize: '48px', strokeThickness: 9 }).setOrigin(0.5).setResolution(R);
    this.banner.add([this.bannerBg, this.bannerTitle, this.bannerName]);
  }

  private drawBannerBg(vw: number): void {
    const g = this.bannerBg;
    g.clear();
    const h = 128;
    g.fillStyle(0x080308, 0.78);
    g.fillRect(-vw / 2, -h / 2 - 12, vw, h);
    g.fillStyle(0x8e2a2a, 0.9);
    g.fillRect(-vw / 2, -h / 2 - 12, vw, 3);
    g.fillRect(-vw / 2, h / 2 - 15, vw, 3);
    g.fillStyle(0xff6a4a, 0.25);
    g.fillRect(-vw / 2, -h / 2 - 7, vw, 1);
    g.fillRect(-vw / 2, h / 2 - 20, vw, 1);
  }

  // ---- pools -------------------------------------------------------------------------

  private cap(): number {
    const lim = this.view.data.balance.limits;
    return this.view.settings.fxQuality === 'low' ? lim.maxParticlesLow : lim.maxParticlesHigh;
  }

  /**
   * Plays a baked fx_* sheet once (or for `life` seconds if it loops). Returns false when the
   * sheet is not baked / not loaded (callers then fall back to procedural particles).
   * `delay` starts it later; `vy` drifts it vertically; `flip` mirrors it.
   */
  sheet(key: string, x: number, y: number, scale: number, rot: number, delay = 0, alpha = 1, tint = 0xffffff, vy = 0, life = 0, flip = false): boolean {
    const info = this.info(key);
    if (!info) return false;
    const low = this.view.settings.fxQuality === 'low';
    let sh: Sheet | undefined;
    let used = 0;
    for (let i = 0; i < this.sheets.length; i++) {
      const s = this.sheets[i];
      if (!s.on) {
        if (!sh) sh = s;
      } else used++;
    }
    if (!sh || (low && used >= SHEET_POOL / 2)) return true; // budget spent: skip silently, no fallback spam
    const clip = info.clips.get('play') ?? info.rest;
    sh.on = true;
    sh.clip = clip;
    sh.t = -delay;
    sh.speed = 1;
    sh.x = x;
    sh.y = y;
    sh.vy = vy;
    sh.s = scale * info.scale;
    sh.a = alpha;
    sh.hold = clip.loop ? 0 : 0.12;
    sh.life = clip.loop ? (life > 0 ? life : clip.duration * 2) : 0;
    sh.fadeIn = 0;
    const img = sh.img;
    img.setTexture(info.tex, clip.names[0]).setOrigin(info.ox, info.oy);
    img.setScale(flip ? -sh.s : sh.s, sh.s).setRotation(rot).setAlpha(alpha).setTint(tint);
    const add = info.blend === 'add';
    img.setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    // ground sheets lie on the floor under the characters; the rest float over them
    img.setDepth(info.meta.ground ? (add ? DEPTH.groundAdd : DEPTH.ground) + 1 : add ? DEPTH.fxAdd : DEPTH.fx);
    img.setPosition(x, y).setVisible(delay <= 0);
    return true;
  }

  /** Spawn one particle (dropped silently when the quality cap is reached). */
  emit(
    key: string, x: number, y: number, vx: number, vy: number, life: number, s0: number, s1: number,
    tint: number, g: number, add: boolean, align: boolean, rot: number, vr: number, a0: number,
  ): Part | null {
    if (this.active >= this.cap()) return null;
    let p: Part | undefined;
    for (let i = 0; i < this.parts.length; i++) {
      if (!this.parts[i].on) {
        p = this.parts[i];
        break;
      }
    }
    if (!p) return null;
    const f = this.fr[key] ?? spriteFrame(key);
    applyFrame(p.img, f, s0);
    p.img.setOrigin(0.5, 0.5).setTint(tint).setVisible(true).setAlpha(a0);
    p.img.setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    p.img.setDepth(add ? DEPTH.fxAdd : DEPTH.fx);
    p.on = true;
    p.add = add;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.g = g;
    p.life = life;
    p.max = life;
    p.s0 = s0;
    p.s1 = s1;
    p.a0 = a0;
    p.rot = rot;
    p.vr = vr;
    p.align = align;
    p.floor = 0;
    p.k = 1 / atlasScale();
    p.settled = false;
    this.active++;
    return p;
  }

  /** Bone pieces that fly, bounce on the ground at `floorY` and lie there for a moment. */
  private gibs(x: number, y: number, floorY: number, count: number, s: number): void {
    const keys = ['gib_bone_a', 'gib_bone_b', 'gib_bone_c', 'gib_skull'];
    const n = this.view.settings.fxQuality === 'low' ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i++) {
      const a = -2.9 + Math.random() * 2.5;
      const sp = 140 + Math.random() * 220;
      const p = this.emit('p_bone', x, y, Math.cos(a) * sp, Math.sin(a) * sp - 120, 2.4 + Math.random(), 1.6 * s, 1.6 * s, 0xf0e6d6, 1500, false, false, Math.random() * 6, (Math.random() - 0.5) * 16, 1);
      if (!p) return;
      p.floor = floorY + (Math.random() - 0.5) * 24;
      // a baked gib replaces the generated chip when it is loaded
      const key = keys[i === 0 && count >= 4 ? 3 : Math.floor(Math.random() * 3)];
      const info = this.info(key);
      if (info) {
        p.img.setTexture(info.tex, info.rest.names[0]).setOrigin(0.5, 0.5).clearTint();
        p.k = info.scale;
        p.s0 = p.s1 = s * 0.42;
      }
    }
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
    n.vx = (Math.random() - 0.5) * 40;
    n.vy = -110;
    n.life = 0.85;
    n.max = 0.85;
    n.size = size;
    n.t.setText(text).setTint(tint).setVisible(true).setAlpha(1).setPosition(x, y);
  }

  private fly(key: string, x0: number, y0: number, x1: number, y1: number, T: number): void {
    let f: Flyer | undefined;
    for (const it of this.flyers) {
      if (!it.on) {
        f = it;
        break;
      }
    }
    if (!f) return;
    const info = this.info(key);
    if (info) {
      f.img.setTexture(info.tex, info.rest.names[0]).setOrigin(0.5, 0.5);
      f.s = info.scale * 0.8;
    } else {
      const fr = this.fr[key] ?? spriteFrame(key);
      f.img.setTexture(fr.tex, fr.frame).setOrigin(0.5, 0.5);
      f.s = 1.2 / atlasScale();
    }
    f.on = true;
    f.x0 = x0;
    f.y0 = y0;
    f.x1 = x1;
    f.y1 = y1;
    f.t = 0;
    f.T = T;
    f.img.setVisible(true).setAlpha(1).setPosition(x0, y0).setScale(f.s);
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

  // ---- frame -------------------------------------------------------------------------

  frame(view: RenderView, _alpha: number, frameDtMs: number): void {
    const realDt = Math.min(frameDtMs, 50) / 1000;
    const frozen = hitStopActive();
    const dt = view.paused || frozen ? 0 : realDt;
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
      if (!p.settled) {
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.floor > 0 && p.y >= p.floor && p.vy > 0) {
          p.y = p.floor;
          if (p.vy < 160) {
            p.settled = true;
            p.vx = 0;
          } else {
            p.vy *= -0.38;
            p.vx *= 0.5;
            p.vr *= 0.4;
          }
        }
      }
      const k = 1 - p.life / p.max;
      const s = (p.s0 + (p.s1 - p.s0) * k) * p.k;
      p.img.setPosition(p.x, p.y);
      p.img.setScale(s);
      if (p.floor > 0) {
        // gibs: full alpha while they fly and lie, fade over the last 0.5 s
        p.img.setAlpha(p.life < 0.5 ? p.life / 0.5 : 1);
        p.img.setDepth(DEPTH.char + p.floor + 0.2);
      } else p.img.setAlpha(p.a0 * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4));
      p.img.setRotation(p.align ? Math.atan2(p.vy, p.vx) : p.rot);
    }
    for (let i = 0; i < this.sheets.length; i++) {
      const s = this.sheets[i];
      if (!s.on || !s.clip) continue;
      s.t += dt;
      if (s.t < 0) continue;
      const c = s.clip;
      const img = s.img;
      if (!img.visible) img.setVisible(true);
      s.y += s.vy * dt;
      let f: number;
      let a = s.a;
      if (c.loop) {
        f = Math.floor((s.t / c.duration) * c.frames) % c.frames;
        const left = s.life - s.t;
        if (left <= 0) {
          s.on = false;
          img.setVisible(false);
          continue;
        }
        if (left < 0.3) a *= left / 0.3;
        if (s.t < 0.15) a *= s.t / 0.15;
      } else {
        f = Math.floor((s.t / c.duration) * c.frames);
        if (f >= c.frames) {
          f = c.frames - 1;
          const over = s.t - c.duration;
          if (over >= s.hold) {
            s.on = false;
            img.setVisible(false);
            continue;
          }
          a *= 1 - over / s.hold;
        }
      }
      img.setFrame(c.names[f], false, false);
      img.setPosition(s.x, s.y).setAlpha(a);
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
      n.vy *= 1 - Math.min(1, dt * 3.2);
      n.y += n.vy * dt;
      n.x += n.vx * dt;
      const pop = k < 0.12 ? 0.6 + easeOutBack(k / 0.12) * 0.6 : k < 0.25 ? 1.2 - ((k - 0.12) / 0.13) * 0.2 : 1;
      n.t.setPosition(n.x, n.y);
      n.t.setFontSize(n.size * pop);
      n.t.setAlpha(k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35);
    }
    for (const f of this.flyers) {
      if (!f.on) continue;
      f.t += realDt;
      const p = clamp01(f.t / f.T);
      if (p >= 1) {
        f.on = false;
        f.img.setVisible(false);
        continue;
      }
      const e = easeOutCubic(p);
      const lift = Math.sin(p * Math.PI) * 90;
      f.img.setPosition(f.x0 + (f.x1 - f.x0) * e, f.y0 + (f.y1 - f.y0) * p * p - lift * (1 - p));
      f.img.setScale(f.s * (1 - 0.35 * p));
      f.img.setAlpha(p > 0.85 ? (1 - p) / 0.15 : 1);
    }
    // boss banner
    if (this.bannerT >= 0) {
      this.bannerT += realDt;
      const t = this.bannerT;
      const T = 2.6;
      const inK = easeOutBack(clamp01(t / 0.35));
      const outK = clamp01((t - (T - 0.4)) / 0.4);
      this.banner.setAlpha(clamp01(t / 0.15) * (1 - outK));
      this.bannerName.setScale(0.6 + 0.4 * inK);
      this.bannerTitle.setX(-60 * (1 - clamp01(t / 0.3)));
      if (t >= T) {
        this.bannerT = -1;
        this.banner.setVisible(false);
      }
    }
    // overlays
    this.vignetteA = Math.max(0, this.vignetteA - realDt * 1.4);
    this.flashA = Math.max(0, this.flashA - realDt * 3);
    const ash = this.ent(view.world.ashId);
    let low = 0;
    if (ash && ash.hp > 0 && ash.hp / ash.maxHp < 0.3) low = 0.16 + 0.08 * Math.sin(this.clock * 6);
    if (this.ashDead) {
      low = 0.55;
      this.dimA = Math.min(0.45, this.dimA + realDt * 0.6);
    }
    this.vignette.setAlpha(clamp01(Math.max(this.vignetteA, low)));
    this.flash.setAlpha(this.flashA);
    this.dim.setAlpha(this.dimA);
  }

  relayout(layout: HudLayout): void {
    this.layout = layout;
    const R = atlasScale();
    const v = this.fr.vignette;
    this.vignette.setScale(layout.viewW / v.w / R, layout.viewH / v.h / R);
    const px = this.fr.px;
    this.flash.setScale(layout.viewW / px.w / R, layout.viewH / px.h / R);
    this.dim.setScale(layout.viewW / px.w / R, layout.viewH / px.h / R);
    this.banner.setPosition(layout.viewW / 2, 250);
    this.drawBannerBg(layout.viewW);
  }

  destroy(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    for (const p of this.parts) p.img.destroy();
    for (const s of this.sheets) s.img.destroy();
    for (const n of this.nums) n.t.destroy();
    for (const f of this.flyers) f.img.destroy();
    this.parts = [];
    this.sheets = [];
    this.nums = [];
    this.flyers = [];
    this.vignette.destroy();
    this.flash.destroy();
    this.dim.destroy();
    this.banner.destroy();
    this.infos.clear();
    this.world = null;
    void warnOnce;
  }
}

function isBony(defId: string): boolean {
  return defId.includes('skeleton') || defId.includes('deadite') || defId === 'battering_ram';
}
