/**
 * World layer (render v2): the courtyard backdrop with its animated props, the pooled entity
 * sprites (baked atlases animated from sim time, placeholders otherwise), boss telegraphs and
 * the spell-aim preview. Reads WorldState only.
 */
import { groundAt } from '../../core/terrain';
import type { BattleRenderer, EntityState, EventBus, GameEvents, HudLayout, RenderView, Unsubscribe } from '../../contracts';
import { findEntity } from '../../core/world';
import { clamp01 } from '../style';
import { Backdrop } from './Backdrop';
import { DEPTH } from './depth';
import { EntityLayer } from './EntityLayer';
import type { FxRenderer } from './FxRenderer';
import { hitStopActive } from './hitstop';

/** what the FX renderer asks the world about */
export interface WorldQuery {
  /** world-space y of the top of an entity's figure as drawn */
  topOf(e: EntityState): number;
  /** drawn height of an entity's figure */
  heightOf(e: EntityState): number;
  /** drawn feet position (x, ground y) and draw y (y - alt) of an entity, or null */
  posOf(id: number): { x: number; y: number; drawY: number } | null;
}

export class WorldRenderer implements BattleRenderer, WorldQuery {
  readonly id = 'world';
  private backdrop: Backdrop;
  private ents: EntityLayer;
  private tele!: Phaser.GameObjects.Graphics;
  private teleAdd!: Phaser.GameObjects.Graphics;
  private unsubs: Unsubscribe[] = [];
  private clock = 0;
  private posBuf = { x: 0, y: 0, drawY: 0 };

  constructor(private readonly fx: FxRenderer | null = null) {
    this.backdrop = new Backdrop(fx);
    this.ents = new EntityLayer(fx);
  }

  create(scene: Phaser.Scene, view: RenderView, bus: EventBus): void {
    this.backdrop.create(scene, view, bus);
    this.ents.create(scene, view, this.backdrop.spriteTint);
    this.tele = scene.add.graphics().setDepth(DEPTH.ground + 2);
    this.teleAdd = scene.add.graphics().setDepth(DEPTH.groundAdd).setBlendMode(Phaser.BlendModes.ADD);
    this.fx?.attachWorld(this);

    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.unsubs.push(bus.on(k, fn));
    on('entity:damaged', (p) => {
      if (!p.blocked) this.ents.onDamaged(p.id);
    });
    on('entity:attack', (p) => this.ents.onAttack(p.id, view.world.tick));
  }

  topOf(e: EntityState): number {
    return this.ents.topOf(e);
  }
  heightOf(e: EntityState): number {
    return this.ents.heightOf(e);
  }
  posOf(id: number): { x: number; y: number; drawY: number } | null {
    const v = this.ents.get(id);
    if (!v) return null;
    this.posBuf.x = v.x;
    this.posBuf.y = v.y;
    this.posBuf.drawY = v.drawY;
    return this.posBuf;
  }

  frame(view: RenderView, alpha: number, frameDtMs: number): void {
    const dt = Math.min(frameDtMs, 50) / 1000;
    if (!view.paused) this.clock += dt;
    this.backdrop.frame(view, dt);
    if (!hitStopActive()) this.ents.frame(view, alpha, dt);
    this.drawTelegraphs(view);
  }

  private drawTelegraphs(view: RenderView): void {
    const g = this.tele;
    const ga = this.teleAdd;
    g.clear();
    ga.clear();
    const world = view.world;
    const data = view.data;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 16);
    // the ground band is drawn with the camera pitch: depth rows span about +-40 px around groundY
    const bandH = 92;
    for (let i = 0; i < world.telegraphs.length; i++) {
      const tg = world.telegraphs[i];
      const gy = groundAt(data, tg.x); // the field slopes downhill: mark the ground under the telegraph
      const p = 1 - clamp01(tg.remaining / Math.max(0.001, tg.total));
      const urgent = tg.remaining < 0.2;
      const edge = urgent ? 0xffffff : 0xff4a3a;
      switch (tg.shape) {
        case 'band': {
          const x0 = tg.x - tg.size / 2;
          const top = gy - bandH / 2;
          g.fillStyle(0x200000, 0.25);
          g.fillRect(x0, top, tg.size, bandH);
          ga.fillStyle(0xff2a1a, 0.16 + pulse * 0.1);
          ga.fillRect(x0, top, tg.size, bandH);
          ga.fillStyle(0xff3a1a, 0.32);
          ga.fillRect(tg.x - (tg.size * p) / 2, top, tg.size * p, bandH);
          ga.lineStyle(3, edge, 0.9);
          ga.strokeRect(x0, top, tg.size, bandH);
          // chevrons pointing inward
          ga.fillStyle(edge, 0.55 + pulse * 0.3);
          for (let k = 0; k < 3; k++) {
            const cx = x0 + 14 + k * 16;
            ga.fillTriangle(cx, gy - 10, cx + 9, gy, cx, gy + 10);
            const cx2 = x0 + tg.size - 14 - k * 16;
            ga.fillTriangle(cx2, gy - 10, cx2 - 9, gy, cx2, gy + 10);
          }
          break;
        }
        case 'circle': {
          const ry = Math.max(14, tg.size * 0.34);
          const cy = tg.y > gy + 60 || tg.y < gy - 60 ? gy : tg.y;
          g.fillStyle(0x200000, 0.25);
          g.fillEllipse(tg.x, cy, tg.size * 2, ry * 2);
          ga.fillStyle(0xff2a1a, 0.14 + pulse * 0.1);
          ga.fillEllipse(tg.x, cy, tg.size * 2, ry * 2);
          ga.fillStyle(0xff3a1a, 0.36);
          ga.fillEllipse(tg.x, cy, tg.size * 2 * p, ry * 2 * p);
          ga.lineStyle(3, edge, 0.95);
          ga.strokeEllipse(tg.x, cy, tg.size * 2, ry * 2);
          break;
        }
        case 'line': {
          const x0 = tg.x - tg.size / 2;
          ga.fillStyle(0xff2a1a, 0.25 + pulse * 0.2);
          ga.fillRect(x0, tg.y - 4, tg.size, 8);
          ga.fillStyle(0xffffff, 0.6);
          ga.fillRect(x0, tg.y - 1, tg.size * p, 2);
          break;
        }
        case 'shadow': {
          const rx = tg.size * (0.35 + 0.65 * p);
          const cy = tg.y > gy - 60 && tg.y < gy + 60 ? tg.y : gy;
          g.fillStyle(0x000000, 0.2 + 0.45 * p);
          g.fillEllipse(tg.x, cy, rx * 2, rx * 0.6);
          ga.lineStyle(2, edge, 0.7);
          ga.strokeEllipse(tg.x, cy, tg.size * 2, tg.size * 0.6);
          break;
        }
        default:
          break;
      }
    }
    this.drawAim(view, groundAt(data, view.aim.worldX ?? 0), pulse);
  }

  private drawAim(view: RenderView, gy: number, pulse: number): void {
    const aim = view.aim;
    if (aim.slot === null) return;
    const world = view.world;
    const slot = world.spellSlots[aim.slot];
    if (!slot) return;
    const g = this.teleAdd;
    if (slot.targeting === 'point' && aim.worldX !== null) {
      const r = slot.aimRadius > 0 ? slot.aimRadius : 100;
      const x = aim.worldX;
      const ry = r * 0.34;
      g.fillStyle(0xffc84a, 0.12 + pulse * 0.08);
      g.fillEllipse(x, gy, r * 2, ry * 2);
      g.lineStyle(3, 0xffd86a, 0.95);
      g.strokeEllipse(x, gy, r * 2, ry * 2);
      g.lineStyle(1.5, 0xffe8a0, 0.6);
      g.strokeEllipse(x, gy, r * 1.4, ry * 1.4);
      // light pillars at the rim
      for (let k = 0; k < 7; k++) {
        const a = 0.42 - k * 0.055;
        g.fillStyle(0xffd86a, a);
        g.fillRect(x - r - 1.5, gy - k * 18 - 14, 3, 12);
        g.fillRect(x + r - 1.5, gy - k * 18 - 14, 3, 12);
      }
      g.lineStyle(2, 0xffffff, 0.9);
      g.lineBetween(x - 12, gy, x + 12, gy);
      g.lineBetween(x, gy - 5, x, gy + 5);
    } else if (slot.targeting === 'line') {
      const ash = findEntity(world as never, world.ashId) as EntityState | undefined;
      if (!ash) return;
      const def = view.data.spells.get(slot.spellId);
      const len = Number(def?.effects[0]?.params.length ?? slot.aimRadius ?? 500) || 500;
      const x0 = ash.x;
      const x1 = ash.x + ash.facing * len;
      const top = gy - 46;
      g.fillStyle(0xffc84a, 0.1 + pulse * 0.08);
      g.fillRect(Math.min(x0, x1), top, Math.abs(x1 - x0), 92);
      g.lineStyle(2, 0xffd86a, 0.85);
      g.strokeRect(Math.min(x0, x1), top, Math.abs(x1 - x0), 92);
      g.fillStyle(0xffd86a, 0.9);
      g.fillTriangle(x1, gy, x1 - ash.facing * 26, gy - 20, x1 - ash.facing * 26, gy + 20);
    }
  }

  relayout(layout: HudLayout): void {
    this.backdrop.relayout(layout.viewW);
  }

  destroy(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.backdrop.destroy();
    this.ents.destroy();
    this.tele.destroy();
    this.teleAdd.destroy();
  }
}
