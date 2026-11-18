/**
 * Entity visuals: pooled images for every entity, baked-sprite animation driven by sim time
 * (ART_BIBLE section 4), ground shadows, HP bars, status tints, lingering corpses, and the
 * neutral placeholder (procedurally animated) for sprites that are not baked or not loaded.
 *
 * Frame choice never uses Phaser timers: loops run on animTime (+ a per-entity phase), walk
 * advances by distance / stride, attack and cast are time-warped so the frame at hitAt lands
 * on the data windup, die plays once and holds, the corpse lingers then fades.
 */
import { SIM_DT, type EntityKind, type EntityState, type GameData, type RenderView, type WorldState } from '../../contracts';
import { atlasScale, spriteFrame, type FrameInfo } from '../art/atlas';
import { PH_HEIGHT, placeholderKey, type PlaceholderRole } from '../art/placeholder';
import { spriteMeta } from '../assets/library';
import { requestSprite } from '../assets/preload';
import { getSpriteInfo, resolveClip, type ClipInfo, type SpriteInfo } from '../assets/sprites';
import { clamp01, easeOutBack, easeOutCubic } from '../style';
import { DEPTH } from './depth';

/** hooks the layer calls into the FX renderer (dust, embers) */
export interface EntityFxHooks {
  footDust(x: number, y: number, big: boolean): void;
  ember(x: number, y: number): void;
  trail(x: number, y: number, tint: number): void;
}

const BAR_W = { small: 46, normal: 54, large: 66, huge: 0 } as const;
const BAR_COLOR: Partial<Record<EntityKind, number>> = { ally: 0x6ad65a, hero: 0xffc93a, enemy: 0xe8483a, ash: 0x6ad65a };
const CORPSE_HOLD = 1.6;
/** baked shadow frames are full-strength alpha maps (ART_BIBLE 3: about 45%) */
const SHADOW_A = 0.5;
/** display scale per kind: the player's side stands out from the enemy crowd */
const KIND_SCALE: Partial<Record<EntityState['kind'], number>> = { ash: 1.32, hero: 1.2, ally: 1.12, enemy: 0.96 };
const FLASH_T = 0.12;
const FLASH_WHITE = 0.035;
const CORPSE_FADE = 0.6;
const MAX_CORPSES = 28;
const TAU = Math.PI * 2;

export interface Vis {
  id: number;
  kind: EntityKind;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  /** e.sprite this visual was built for */
  sprite: string;
  /** key actually shown (ash / ash_left) */
  shown: string;
  info: SpriteInfo | null;
  ph: FrameInfo | null;
  /** logical height of the shown figure (HP bar, hit point, FX) */
  height: number;
  clip: ClipInfo | null;
  anim: string;
  action: string;
  lastTA: number;
  /** animTime of the last hit (entity:attack), -1 = none in this swing */
  hitBase: number;
  hitTick: number;
  /** seconds from swing start to the hit for this entity (data windup) */
  windup: number;
  windupAlt: number;
  /** boss telegraph duration of the current action */
  teleT: number;
  dist: number;
  lastX: number;
  phase: number;
  seen: number;
  age: number;
  flash: number;
  kick: number;
  lunge: number;
  hpShown: number;
  hpLag: number;
  dying: boolean;
  /** >= 0 once the entity is gone and the body lingers */
  corpse: number;
  /** last drawn position (FX queries) */
  x: number;
  y: number;
  drawY: number;
  frame: number;
  retry: number;
  dustT: number;
  emberT: number;
  flip: boolean;
  scaleBase: number;
  role: PlaceholderRole;
  /** multiply tint of an aliased projectile */
  tintKey: number;
}

export class EntityLayer {
  private scene!: Phaser.Scene;
  private data!: GameData;
  private byId = new Map<number, Vis>();
  private active: Vis[] = [];
  private pool: Vis[] = [];
  private corpses: Vis[] = [];
  private frameNo = 0;
  private paused = false;
  private clock = 0;
  private postClock = 0;
  private bars!: Phaser.GameObjects.Graphics;
  private phShadow!: FrameInfo;
  private gy = 520;
  private corpseTime = 0.6;
  private tint = 0xffffff;
  private hasAshLeft = false;
  /** world-space bounds for culling */
  private camL = 0;
  private camR = 0;

  constructor(private readonly fx: EntityFxHooks | null) {}

  create(scene: Phaser.Scene, view: RenderView, spriteTint: number): void {
    this.scene = scene;
    this.data = view.data;
    this.gy = view.data.balance.world.groundY;
    this.corpseTime = view.data.balance.combat.corpseTime > 0 ? view.data.balance.combat.corpseTime : 0.6;
    this.tint = spriteTint;
    this.phShadow = spriteFrame('shadow');
    this.bars = scene.add.graphics().setDepth(DEPTH.bars);
    this.hasAshLeft = !!spriteMeta('ash_left');
  }

  get(id: number): Vis | undefined {
    return this.byId.get(id);
  }

  /** world-space top of an entity's figure (for FX); falls back to a size guess */
  topOf(e: EntityState): number {
    const v = this.byId.get(e.id);
    if (v) return v.drawY - v.height;
    return e.y - e.alt - PH_HEIGHT[e.size];
  }
  heightOf(e: EntityState): number {
    const v = this.byId.get(e.id);
    return v ? v.height : PH_HEIGHT[e.size];
  }

  onDamaged(id: number): void {
    const v = this.byId.get(id);
    if (!v) return;
    v.flash = FLASH_T;
    v.kick = 1;
  }

  onAttack(id: number, tick: number): void {
    const v = this.byId.get(id);
    if (!v) return;
    v.hitTick = tick;
    v.lunge = 1;
  }

  // ---------------------------------------------------------------------------

  private acquire(e: EntityState): Vis {
    let v = this.pool.pop();
    if (!v) {
      const img = this.scene.add.image(0, 0, this.phShadow.tex, this.phShadow.frame);
      const shadow = this.scene.add.image(0, 0, this.phShadow.tex, this.phShadow.frame).setDepth(DEPTH.shadow);
      v = {
        id: 0, kind: e.kind, img, shadow, sprite: '', shown: '', info: null, ph: null, height: 100, clip: null, anim: '', action: '',
        lastTA: 0, hitBase: -1, hitTick: -1, windup: 0, windupAlt: 0, teleT: 0, dist: 0, lastX: 0, phase: 0, seen: 0, age: 0,
        flash: 0, kick: 0, lunge: 0, hpShown: 1, hpLag: 1, dying: false, corpse: -1, x: 0, y: 0, drawY: 0, frame: -1, retry: 0,
        dustT: 0, emberT: 0, flip: false, scaleBase: 1, role: 'ally', tintKey: 0xffffff,
      };
    }
    v.id = e.id;
    v.kind = e.kind;
    v.sprite = '';
    v.shown = '';
    v.info = null;
    v.ph = null;
    v.clip = null;
    v.anim = '';
    v.action = '';
    v.lastTA = 0;
    v.hitBase = -1;
    v.hitTick = -1;
    v.dist = 0;
    v.lastX = e.x;
    v.phase = ((e.id * 0.6180339) % 1) * 3;
    v.age = 0;
    v.flash = 0;
    v.kick = 0;
    v.lunge = 0;
    v.hpShown = e.maxHp > 0 ? clamp01(e.hp / e.maxHp) : 1;
    v.hpLag = v.hpShown;
    v.dying = false;
    v.corpse = -1;
    v.frame = -1;
    v.retry = 0;
    v.dustT = 0;
    v.emberT = (e.id % 7) * 0.05;
    v.role = roleOf(e);
    v.img.setVisible(true).setAlpha(1).setRotation(0).clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
    v.shadow.setVisible(false).setAlpha(1).setRotation(0);
    this.resolveWindups(v, e);
    this.byId.set(e.id, v);
    this.active.push(v);
    return v;
  }

  private resolveWindups(v: Vis, e: EntityState): void {
    const d = this.data;
    v.windup = 0;
    v.windupAlt = 0;
    if (e.kind === 'ash') {
      v.windup = d.balance.ash.stats.attack.windup ?? 0;
      v.windupAlt = d.balance.ash.melee.windup ?? 0;
    } else if (e.kind === 'ally' || e.kind === 'hero') {
      v.windup = d.units.get(e.defId)?.stats.attack.windup ?? 0;
    } else if (e.kind === 'enemy') {
      v.windup = d.enemies.get(e.defId)?.stats.attack.windup ?? 0;
    }
  }

  /** (Re)binds the sprite: baked info when loaded, else the neutral placeholder (lazy-loads the atlas). */
  private bind(v: Vis, e: EntityState, want: string): void {
    v.shown = want;
    v.sprite = e.sprite;
    // thrown things without baked art borrow a baked look-alike (coffin -> rock, poison -> green orb)
    let key = want;
    v.tintKey = 0xffffff;
    if ((e.kind === 'projectile' || e.kind === 'effect') && !spriteMeta(want)) {
      const al = projectileAlias(want);
      key = al.key;
      v.tintKey = al.tint;
    }
    v.info = getSpriteInfo(this.scene, key);
    v.clip = null;
    v.anim = '';
    v.frame = -1;
    if (!v.info && spriteMeta(key)) requestSprite(this.scene, key);
    if (v.info) {
      const info = v.info;
      v.ph = null;
      // Ash and the player's side read bigger than the horde (hero focus)
      const k = KIND_SCALE[e.kind] ?? 1;
      v.height = info.height * k;
      v.scaleBase = info.scale * k;
      v.img.setTexture(info.tex, info.rest.names[0]);
      v.img.setOrigin(info.ox, info.oy);
      v.img.setBlendMode(e.kind === 'effect' && info.blend === 'add' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      if (info.hasShadow && e.kind !== 'projectile') {
        v.shadow.setTexture(info.tex, 'shadow').setOrigin(info.ox, info.oy);
      } else this.phShadowOn(v);
    } else {
      v.ph = this.placeholderFrame(e, key);
      v.height = e.kind === 'projectile' || e.kind === 'pickup' || e.kind === 'effect' ? v.ph.h * 0.6 : v.ph.h * 0.94;
      v.scaleBase = 1 / atlasScale();
      v.img.setTexture(v.ph.tex, v.ph.frame).setOrigin(v.ph.ax, v.ph.ay);
      v.img.setBlendMode(Phaser.BlendModes.NORMAL);
      this.phShadowOn(v);
      v.retry = 30;
    }
  }

  private phShadowOn(v: Vis): void {
    const f = this.phShadow;
    v.shadow.setTexture(f.tex, f.frame).setOrigin(0.5, 0.5);
  }

  private placeholderFrame(e: EntityState, key: string): FrameInfo {
    if (e.kind === 'projectile' || e.kind === 'pickup' || e.kind === 'effect') return spriteFrame(key, e.kind);
    if (key === 'npc_blacksmith') return spriteFrame(placeholderKey('ally', 'large'));
    const role = roleOf(e);
    const size = role === 'boss' ? (e.size === 'huge' ? 'huge' : 'large') : e.size;
    return spriteFrame(placeholderKey(role, size));
  }

  // ---------------------------------------------------------------------------

  frame(view: RenderView, alpha: number, dt: number): void {
    const world = view.world;
    const paused = view.paused;
    this.paused = paused;
    if (!paused) this.clock += dt;
    if (world.outcome && !paused) this.postClock += dt;
    this.frameNo++;
    const fn = this.frameNo;
    const margin = 340;
    this.camL = view.cameraX - margin;
    this.camR = view.cameraX + view.layout.viewW + margin;
    const bars = this.bars;
    bars.clear();
    const won = world.outcome?.result === 'won';

    const ents = world.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive) continue;
      let v = this.byId.get(e.id);
      if (!v) v = this.acquire(e);
      v.seen = fn;
      const want = e.kind === 'ash' ? (e.facing < 0 && this.hasAshLeft ? 'ash_left' : e.sprite === 'ash' ? 'ash' : e.sprite) : e.sprite;
      if (want !== v.shown || e.sprite !== v.sprite) this.bind(v, e, want);
      else if (!v.info && v.retry-- <= 0) {
        // a lazy load may have finished
        v.retry = 30;
        if (getSpriteInfo(this.scene, want)) this.bind(v, e, want);
      }
      if (!paused) v.age += dt;
      this.drawEntity(v, e, world, alpha, dt, paused, won);
    }

    // entities gone this frame: dying bodies become corpses, the rest go back to the pool
    for (let i = this.active.length - 1; i >= 0; i--) {
      const v = this.active[i];
      if (v.seen === fn) continue;
      this.byId.delete(v.id);
      this.active[i] = this.active[this.active.length - 1];
      this.active.pop();
      if (v.dying && v.info && v.clip && v.img.visible) {
        v.corpse = 0;
        this.corpses.push(v);
        if (this.corpses.length > MAX_CORPSES) this.release(this.corpses.shift()!);
      } else this.release(v);
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const v = this.corpses[i];
      if (!paused) v.corpse += dt;
      const k = v.corpse - CORPSE_HOLD;
      if (k >= CORPSE_FADE) {
        this.corpses.splice(i, 1);
        this.release(v);
        continue;
      }
      const a = k <= 0 ? 1 : 1 - k / CORPSE_FADE;
      v.img.setAlpha(a);
      v.shadow.setAlpha(a * 0.9);
      if (v.x < this.camL || v.x > this.camR) {
        v.img.setVisible(false);
        v.shadow.setVisible(false);
      } else {
        v.img.setVisible(true);
        v.shadow.setVisible(true);
      }
    }
  }

  private release(v: Vis): void {
    v.img.setVisible(false);
    v.shadow.setVisible(false);
    v.corpse = -1;
    this.pool.push(v);
  }

  private drawEntity(v: Vis, e: EntityState, world: Readonly<WorldState>, alpha: number, dt: number, paused: boolean, won: boolean): void {
    const x = e.prevX + (e.x - e.prevX) * alpha;
    let y = e.prevY + (e.y - e.prevY) * alpha;
    let alt = e.prevAlt + (e.alt - e.prevAlt) * alpha;
    // compatibility with the pre-v2 sim: a flyer whose y still includes its height
    if (e.flying && alt <= 0 && y < this.gy - 60) {
      alt = this.gy - y;
      y = this.gy;
    }
    // walk cycle distance (interpolated, so it is smooth at any refresh rate)
    const dx = x - v.lastX;
    v.dist += dx < 0 ? -dx : dx;
    v.lastX = x;
    v.x = x;
    v.y = y;
    if (x < this.camL || x > this.camR) {
      v.img.setVisible(false);
      v.shadow.setVisible(false);
      v.drawY = y - alt;
      return;
    }
    v.img.setVisible(true);
    const bars = this.bars;
    const dying = e.hp <= 0 && (e.kind === 'ash' || e.kind === 'ally' || e.kind === 'hero' || e.kind === 'enemy' || e.kind === 'boss');
    v.dying = dying;

    switch (e.kind) {
      case 'projectile':
        this.drawProjectile(v, e, x, y, alt);
        return;
      case 'pickup':
        this.drawPickup(v, e, x, y, alt);
        return;
      case 'effect':
        this.drawEffect(v, e, x, y, alt, alpha);
        return;
      default:
        break;
    }

    let anim: string = dying ? 'die' : e.anim;
    let action = e.action;
    if (won && !dying && (e.kind === 'ash' || e.kind === 'hero' || e.kind === 'ally')) {
      anim = 'cheer';
      action = '';
    }
    let tA = e.animTime + alpha * SIM_DT;
    if (world.outcome) tA += anim === 'die' || anim === 'cheer' ? this.postClock : 0;

    let ox = 0;
    let oy = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    let a = 1;
    const dir = e.facing;

    if (v.info) {
      this.pickFrame(v, e, anim, action, tA, world);
      // stunned without a clip: hurt's last frame and a sway
      if (anim === 'stunned' && v.clip && !v.clip.name.startsWith('stunned')) rot = Math.sin(this.clock * 9 + v.phase) * 0.07;
    } else {
      // placeholder: procedural motion
      const sz = e.size === 'huge' ? 1.8 : e.size === 'large' ? 1.2 : 1;
      switch (anim) {
        case 'walk': {
          const ph = v.dist * 0.09 + v.phase;
          oy = -Math.abs(Math.sin(ph)) * 4 * sz;
          rot = Math.sin(ph) * 0.05;
          break;
        }
        case 'attack':
        case 'cast': {
          const p = clamp01((tA % 0.9) / 0.3);
          const k = p < 1 ? Math.sin(p * Math.PI) : 0;
          ox = dir * k * 7 * sz;
          rot = dir * k * 0.12;
          break;
        }
        case 'hurt':
          ox = -dir * 6 * sz * clamp01(1 - tA / 0.2);
          break;
        case 'die': {
          const p = clamp01(tA / this.corpseTime);
          rot = -dir * easeOutCubic(clamp01(p * 1.8)) * 1.35;
          a = 1 - clamp01((p - 0.4) / 0.6);
          break;
        }
        case 'spawn': {
          const p = clamp01(tA / 0.35);
          sx = sy = 0.4 + 0.6 * easeOutBack(p);
          break;
        }
        case 'stunned':
          rot = Math.sin(this.clock * 14 + v.phase) * 0.12;
          break;
        case 'telegraph':
          ox = Math.sin(this.clock * 50) * 2 * sz;
          break;
        case 'dodge': {
          const p = clamp01(tA / 0.35);
          rot = dir * p * TAU;
          oy = -Math.sin(p * Math.PI) * 16;
          break;
        }
        default:
          sy = 1 + Math.sin(this.clock * 2.6 + v.phase * 2) * 0.02;
          sx = 1 - (sy - 1) * 0.5;
      }
      if (v.lunge > 0) {
        const k = Math.sin((1 - v.lunge) * Math.PI);
        ox += dir * k * 8 * sz;
      }
    }
    if (!paused) {
      if (v.lunge > 0) v.lunge = Math.max(0, v.lunge - dt / 0.25);
      if (v.flash > 0) v.flash -= dt;
    }
    if (v.kick > 0) {
      ox -= dir * v.kick * 5;
      if (!paused) v.kick = Math.max(0, v.kick - dt / 0.14);
    }
    // flyers hover
    if (alt > 0 && !dying) oy += Math.sin(this.clock * 3 + v.phase * 2) * 4;

    const img = v.img;
    const flip = v.info ? (e.kind === 'ash' && v.shown === 'ash_left' ? false : dir !== v.info.facing) : dir < 0;
    v.flip = flip;
    const s = v.scaleBase;
    const drawY = y - alt + oy;
    v.drawY = drawY;
    img.setPosition(x + ox, drawY);
    img.setRotation(rot);
    img.setScale((flip ? -sx : sx) * s, sy * s);
    img.setAlpha(a);
    // depth by ground y; old-model flyers (huge alt) still sort over the ground units
    img.setDepth(DEPTH.char + y + (e.kind === 'boss' ? 0.4 : 0) + x * 1e-5);

    // tint: hit flash > statuses > chapter grade
    // hit flash: a brief white pop, then a warm red tint while the knock-back plays
    if (v.flash > FLASH_T - FLASH_WHITE && e.kind !== 'ash') img.setTintFill(0xfff4ec);
    else if (v.flash > 0) img.setTint(0xff9a8a);
    else {
      let tint = this.tint;
      for (let s2 = 0; s2 < e.statuses.length; s2++) {
        const st = e.statuses[s2];
        switch (st.id) {
          case 'burn':
            tint = mulColor(tint, Math.sin(this.clock * 18) > 0 ? 0xffa060 : 0xffd0a0);
            if (this.fx && !paused) {
              v.emberT -= dt;
              if (v.emberT <= 0) {
                v.emberT = 0.12;
                this.fx.ember(x + (Math.random() - 0.5) * 30, drawY - v.height * (0.2 + Math.random() * 0.6));
              }
            }
            break;
          case 'slow':
            tint = mulColor(tint, 0x9cc4ff);
            break;
          case 'root':
            tint = mulColor(tint, 0xd8c8a0);
            break;
          case 'buff':
            tint = mulColor(tint, Math.sin(this.clock * 8) > 0 ? 0xffe8a0 : 0xffffff);
            break;
          case 'invuln':
            img.setAlpha(a * (Math.sin(this.clock * 30) > 0 ? 1 : 0.5));
            break;
          default:
            break;
        }
      }
      if (anim === 'telegraph') tint = mulColor(tint, Math.sin(this.clock * 14) > 0 ? 0xffb0a0 : 0xffffff);
      if (tint !== 0xffffff) img.setTint(tint);
      else img.clearTint();
    }

    // shadow on the ground under the figure, smaller and fainter with height
    const sh = v.shadow;
    if (a <= 0.02) sh.setVisible(false);
    else {
      sh.setVisible(true);
      const hk = alt > 0 ? clamp01(1 - alt / 520) : 1;
      const k = 0.45 + 0.55 * hk;
      if (v.info && v.info.hasShadow) {
        sh.setPosition(x, y).setScale((flip ? -k : k) * s, k * s).setAlpha(a * SHADOW_A * (0.3 + 0.7 * hk));
      } else {
        const w = Math.max(30, (v.ph ? v.ph.w : 60) * 0.8);
        sh.setPosition(x, y + 2).setScale((w / this.phShadow.w) * k / atlasScale(), ((w * 0.3) / this.phShadow.h) * k / atlasScale()).setAlpha(a * 0.8 * hk + 0.2);
      }
    }

    // walking dust
    if (this.fx && !paused && anim === 'walk' && alt <= 0 && (e.kind === 'enemy' || e.kind === 'boss' || e.size !== 'small')) {
      v.dustT -= dt;
      if (v.dustT <= 0) {
        v.dustT = e.size === 'huge' || e.size === 'large' ? 0.32 : 0.55;
        this.fx.footDust(x - dir * 10, y, e.size === 'huge' || e.defId === 'horseman');
      }
    }

    // HP bar (trailing chip shows the damage just taken)
    const frac = e.maxHp > 0 ? clamp01(e.hp / e.maxHp) : 0;
    if (!paused) {
      v.hpShown = frac;
      if (v.hpLag > frac) v.hpLag = Math.max(frac, v.hpLag - dt * 0.9);
      else v.hpLag = frac;
    }
    const bw = BAR_W[e.size];
    if (bw > 0 && !dying && frac < 1 && e.kind !== 'ash' && e.kind !== 'boss') {
      const top = drawY - v.height * sy - 12;
      const col = BAR_COLOR[e.kind] ?? 0xffffff;
      const bh = 6;
      const bx = x - bw / 2;
      bars.fillStyle(0x0c0810, 0.85);
      bars.fillRect(bx - 2, top - 2, bw + 4, bh + 4);
      bars.fillStyle(0x2a2230, 1);
      bars.fillRect(bx, top, bw, bh);
      if (v.hpLag > frac) {
        bars.fillStyle(0xfff0d0, 0.9);
        bars.fillRect(bx + bw * frac, top, bw * (v.hpLag - frac), bh);
      }
      bars.fillStyle(col, 1);
      bars.fillRect(bx, top, bw * frac, bh);
      bars.fillStyle(0xffffff, 0.28);
      bars.fillRect(bx, top, bw * frac, 2);
    }
    // stun stars
    if (!dying && (anim === 'stunned' || hasStatus(e, 'stun'))) {
      const top = drawY - v.height - 4;
      for (let k = 0; k < 3; k++) {
        const ang = this.clock * 5 + k * 2.094;
        bars.fillStyle(0xfff07a, 1);
        bars.fillCircle(x + Math.cos(ang) * 16, top + Math.sin(ang) * 4, 3.2);
      }
    }
    if (hasStatus(e, 'mark') && !dying) {
      const top = drawY - v.height - 18 + Math.sin(this.clock * 6) * 3;
      bars.fillStyle(0xff4a3a, 0.95);
      bars.fillTriangle(x - 7, top - 10, x + 7, top - 10, x, top);
    }
  }

  /** Chooses the clip and frame of a baked sprite from sim time. */
  private pickFrame(v: Vis, e: EntityState, anim: string, action: string, tA: number, world: Readonly<WorldState>): void {
    const info = v.info!;
    if (anim !== v.anim || action !== v.action || !v.clip) {
      v.anim = anim;
      v.action = action;
      v.clip = resolveClip(info, anim, action);
      v.hitBase = -1;
      v.teleT = anim === 'telegraph' ? this.telegraphTime(e, action) : 0;
      if (anim === 'walk' || anim === 'die') v.dist = 0;
    } else if (tA < v.lastTA - 0.03) {
      // animTime went backwards: a new swing of the same anim
      v.hitBase = -1;
    }
    v.lastTA = tA;
    let clip = v.clip;
    const D = clip.duration;
    let c = 0;
    let loop = clip.loop;
    switch (anim) {
      case 'walk':
        if (clip.stride > 0 && clip.name.startsWith('walk')) {
          c = (v.dist / clip.stride) * D + v.phase;
          loop = true;
        } else c = tA + v.phase;
        break;
      case 'attack':
      case 'cast': {
        const isSwing = clip.name.startsWith('attack') || clip.name.startsWith('cast');
        if (!isSwing) {
          c = tA + v.phase;
          break;
        }
        if (e.kind === 'boss' || clip.hitAt <= 0) {
          c = tA;
        } else {
          const W = e.kind === 'ash' && action === 'melee' ? v.windupAlt : v.windup;
          const h = clip.hitAt * D;
          if (v.hitTick >= 0) {
            // entity:attack marks the hit moment (sim time); ignore it when it marks the start of a long windup
            const at = e.animTime - (world.tick - v.hitTick) * SIM_DT;
            v.hitTick = -1;
            if (W <= 0 || at >= W * 0.5) v.hitBase = at;
          }
          if (v.hitBase >= 0 && tA >= v.hitBase) c = h + (tA - v.hitBase);
          else if (W > 0) c = tA < W ? (tA * h) / W : h + (tA - W);
          else c = h + tA;
        }
        if (c >= D && !loop) {
          // the swing is over but the sim still says attack: rest pose until the next swing
          clip = info.rest;
          c = c - D + v.phase;
          loop = true;
        }
        break;
      }
      case 'telegraph': {
        const T = v.teleT > 0 ? v.teleT : 0.8;
        if (clip.name.startsWith('attack')) {
          c = clamp01(tA / T) * clip.hitAt * D * 0.85;
          loop = false;
        } else if (clip.name.startsWith('telegraph')) {
          c = clamp01(tA / T) * D * 0.999;
          loop = false;
        } else c = tA + v.phase;
        break;
      }
      case 'die': {
        const speed = Math.max(1, D / (this.corpseTime * 0.85));
        c = tA * speed;
        loop = false;
        break;
      }
      case 'spawn':
        c = tA;
        if (c >= D && !loop) {
          clip = info.rest;
          c = c - D;
          loop = true;
        }
        break;
      case 'stunned':
        if (clip.name.startsWith('hurt')) {
          c = D;
          loop = false;
        } else c = tA + v.phase;
        break;
      case 'idle':
      case 'cheer':
        c = tA + v.phase;
        break;
      default:
        c = tA;
        if (c >= D && !loop && anim !== 'hurt' && anim !== 'dodge' && anim !== 'leap') {
          clip = info.rest;
          c -= D;
          loop = true;
        }
    }
    const n = clip.frames;
    let f: number;
    if (loop) {
      const r = c % D;
      f = Math.floor(((r < 0 ? r + D : r) / D) * n);
      if (f >= n) f = n - 1;
    } else {
      f = c <= 0 ? 0 : Math.floor((c / D) * n);
      if (f >= n) f = n - 1;
    }
    const name = clip.names[f];
    if (v.frame !== f || v.img.frame.name !== name) {
      v.frame = f;
      v.img.setFrame(name, false, false);
    }
  }

  private telegraphTime(e: EntityState, action: string): number {
    const b = this.data.bosses.get(e.defId);
    if (!b) return 0.8;
    for (const ph of b.phases) for (const st of ph.loop) if (st.attack === action) return st.telegraph;
    return 0.8;
  }

  private drawProjectile(v: Vis, e: EntityState, x: number, y: number, alt: number): void {
    const img = v.img;
    // direction of travel on screen: (x, y - alt)
    const dx = e.x - e.prevX;
    const dy = e.y - e.alt - (e.prevY - e.prevAlt);
    let rot = dx === 0 && dy === 0 ? (e.facing < 0 ? Math.PI : 0) : Math.atan2(dy, dx);
    const tumbling = e.sprite === 'rock' || v.tintKey !== 0xffffff || (v.info !== null && v.info.key === 'rock');
    if (tumbling) rot = this.clock * 9 + v.phase;
    if (v.info) {
      const clip = v.info.rest;
      const f = clip.frames > 1 ? Math.floor(((this.clock + v.phase) / clip.duration) * clip.frames) % clip.frames : 0;
      img.setFrame(clip.names[f], false, false);
    }
    const s = v.scaleBase;
    // pre-v2 sim: a projectile's y is its height on screen; keep it in front of the ground units it flies past
    const airborne = alt <= 0 && y < this.gy - 24;
    img.setPosition(x, y - alt).setRotation(rot).setScale(s, s).setAlpha(1).setDepth(DEPTH.char + (airborne ? this.gy + 80 : y + 0.5));
    if (v.tintKey !== 0xffffff) img.setTint(v.tintKey);
    else img.clearTint();
    if (this.fx && !this.paused && (e.sprite === 'fireball' || v.tintKey === 0x9aff6a) && (this.frameNo & 1) === 0) this.fx.trail(x, y - alt, e.sprite === 'fireball' ? 0xff8a2a : 0x8aff5a);
    v.drawY = y - alt;
    // small shadow for things in the air
    if (alt > 8 && (e.sprite === 'rock' || e.sprite === 'fireball')) {
      const w = 26;
      const f = this.phShadow;
      v.shadow.setTexture(f.tex, f.frame).setOrigin(0.5, 0.5);
      v.shadow.setVisible(true).setPosition(x, y).setScale(w / f.w / atlasScale(), (w * 0.3) / f.h / atlasScale()).setAlpha(0.5);
    } else v.shadow.setVisible(false);
  }

  private drawPickup(v: Vis, e: EntityState, x: number, y: number, alt: number): void {
    const img = v.img;
    let oy = -6 - Math.sin(this.clock * 4 + v.phase * 2) * 3;
    if (v.age < 0.45) {
      // pop out of the body and bounce twice
      const p = v.age / 0.45;
      oy -= p < 0.62 ? Math.sin((p / 0.62) * Math.PI) * 46 : Math.sin(((p - 0.62) / 0.38) * Math.PI) * 12;
    }
    let a = 1;
    if (e.ttl < 3 && e.ttl > 0) a = Math.sin(this.clock * 22) > 0 ? 1 : 0.35;
    if (v.info) {
      const clip = v.info.rest;
      const f = Math.floor(((this.clock + v.phase) / clip.duration) * clip.frames) % clip.frames;
      if (f !== v.frame) {
        v.frame = f;
        img.setFrame(clip.names[f], false, false);
      }
    }
    const s = v.scaleBase * (v.info ? 1 : 1.6);
    img.setPosition(x, y - alt + oy).setRotation(0).setScale(s, s).setAlpha(a).setDepth(DEPTH.char + y - 1);
    img.clearTint();
    v.drawY = y - alt + oy;
    const sh = v.shadow;
    sh.setVisible(true);
    if (v.info && v.info.hasShadow) sh.setPosition(x, y).setScale(s, s).setAlpha(SHADOW_A * a);
    else {
      const f = this.phShadow;
      sh.setPosition(x, y + 1).setScale(26 / f.w / atlasScale(), 8 / f.h / atlasScale()).setAlpha(0.6 * a);
    }
  }

  private drawEffect(v: Vis, e: EntityState, x: number, y: number, alt: number, alpha: number): void {
    const img = v.img;
    if (v.info) {
      // effects can change anim (a bear trap snapping shut): re-resolve the clip when it does
      if (v.anim !== e.anim) {
        v.anim = e.anim;
        v.clip = null;
      }
      const clip = v.clip ?? (v.clip = resolveClip(v.info, e.anim, e.action));
      const tA = e.animTime + alpha * SIM_DT;
      let f: number;
      if (clip.stride > 0) f = Math.floor((v.dist / clip.stride) * clip.frames) % clip.frames;
      else f = Math.floor((tA / clip.duration) * clip.frames);
      f = clip.loop ? f % clip.frames : Math.min(clip.frames - 1, f);
      img.setFrame(clip.names[f], false, false);
    }
    let rot = 0;
    if (e.sprite === 'rock') rot = this.clock * 7 + v.phase;
    const flip = v.info ? e.facing !== v.info.facing : false;
    const s = v.scaleBase;
    img.setPosition(x, y - alt).setRotation(rot).setScale(flip ? -s : s, s);
    img.setAlpha(e.ttl < 0.35 && e.ttl > 0 ? e.ttl / 0.35 : 1).setDepth(DEPTH.char + y + 0.3);
    img.clearTint();
    v.drawY = y - alt;
    if (v.info && v.info.hasShadow) v.shadow.setVisible(true).setPosition(x, y).setScale(flip ? -s : s, s).setAlpha(SHADOW_A);
    else v.shadow.setVisible(false);
  }

  destroy(): void {
    for (const v of [...this.active, ...this.pool, ...this.corpses]) {
      v.img.destroy();
      v.shadow.destroy();
    }
    this.active = [];
    this.pool = [];
    this.corpses = [];
    this.byId.clear();
    this.bars.destroy();
  }
}

// ---------------------------------------------------------------------------

function roleOf(e: EntityState): PlaceholderRole {
  switch (e.kind) {
    case 'ash':
    case 'ally':
      return 'ally';
    case 'hero':
      return 'hero';
    case 'boss':
      return 'boss';
    case 'enemy':
      return e.flying ? 'flyer' : 'enemy';
    default:
      return 'ally';
  }
}

/** baked stand-ins for thrown things that have no art of their own */
function projectileAlias(key: string): { key: string; tint: number } {
  if (key.includes('poison') || key.includes('mire') || key.includes('acid') || key.includes('slime')) return { key: 'mana_orb', tint: 0x9aff6a };
  if (key.includes('head') || key.includes('pumpkin') || key.includes('fire') || key.includes('flame')) return { key: 'fireball', tint: 0xffffff };
  if (key.includes('coffin') || key.includes('stone') || key.includes('boulder') || key.includes('rock')) return { key: 'rock', tint: 0xd8c8b0 };
  if (key.includes('bolt')) return { key: 'bolt', tint: 0xffffff };
  if (key.includes('arrow')) return { key: 'arrow', tint: 0xffffff };
  return { key, tint: 0xffffff };
}

function hasStatus(e: EntityState, id: string): boolean {
  for (let i = 0; i < e.statuses.length; i++) if (e.statuses[i].id === id) return true;
  return false;
}

/** multiply two 0xRRGGBB colours */
export function mulColor(a: number, b: number): number {
  if (a === 0xffffff) return b;
  if (b === 0xffffff) return a;
  const r = (((a >> 16) & 255) * ((b >> 16) & 255)) / 255;
  const g = (((a >> 8) & 255) * ((b >> 8) & 255)) / 255;
  const bl = ((a & 255) * (b & 255)) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

