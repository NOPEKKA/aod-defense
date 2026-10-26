import type { BattleRenderer, EntityState, HudLayout, RenderView } from '../contracts';

/**
 * PHASE 2 STUB renderer: flat ground, castle block, pooled entity images with
 * interpolation, and a text HUD. The render agent replaces it in phase 3.
 */
export class PlaceholderBattleRenderer implements BattleRenderer {
  readonly id = 'placeholder';
  private scene!: Phaser.Scene;
  private R = 1;
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private pool: Phaser.GameObjects.Image[] = [];
  private seen = new Set<number>();
  private hud!: Phaser.GameObjects.Text;
  private statics: Phaser.GameObjects.GameObject[] = [];

  create(scene: Phaser.Scene, view: RenderView): void {
    this.scene = scene;
    this.R = scene.cameras.main.zoom;
    const w = view.data.balance.world;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.statics.push(o), o);
    add(scene.add.rectangle(0, 0, w.width, w.groundY, 0x2b2440).setOrigin(0, 0).setDepth(-10));
    add(scene.add.rectangle(0, w.groundY, w.width, 720 - w.groundY, 0x3d3324).setOrigin(0, 0).setDepth(-9));
    add(scene.add.rectangle(0, w.groundY - 300, w.castleRight, 300, 0x555566).setOrigin(0, 0).setDepth(-8));
    add(scene.add.rectangle(w.pit.left, w.groundY, w.pit.right - w.pit.left, 40, 0x110d0a).setOrigin(0, 0).setDepth(-7));
    add(scene.add.image(w.bookX, w.groundY, 'book').setOrigin(0.5, 1).setScale(1 / this.R).setDepth(-6));
    this.hud = add(
      scene.add
        .text(16, 80, '', { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 8, y: 6 } })
        .setResolution(this.R)
        .setScrollFactor(0)
        .setDepth(1000),
    );
  }

  frame(view: RenderView, alpha: number): void {
    this.seen.clear();
    for (const e of view.world.entities) {
      if (!e.alive) continue;
      this.seen.add(e.id);
      this.draw(e, alpha);
    }
    for (const [id, img] of this.sprites) {
      if (!this.seen.has(id)) {
        img.setVisible(false);
        this.pool.push(img);
        this.sprites.delete(id);
      }
    }
    const wld = view.world;
    const r = wld.resources;
    this.hud.setText(
      [
        view.t('ui.wave', { n: wld.wave.number, total: view.data.balance.campaignWaves }),
        `${view.t('ui.book')} ${Math.ceil(wld.book.hp)}/${Math.ceil(wld.book.maxHp)}`,
        `${view.t('ui.iron')} ${Math.floor(r.iron)}/${Math.floor(r.ironMax)}   ${view.t('ui.mana')} ${Math.floor(r.mana)}`,
        `tick ${wld.tick}  fps ${Math.round(this.scene.game.loop.actualFps)}`,
      ].join('\n'),
    );
  }

  private draw(e: EntityState, alpha: number): void {
    let img = this.sprites.get(e.id);
    if (!img) {
      img = this.pool.pop() ?? this.scene.add.image(0, 0, e.sprite).setOrigin(0.5, 1);
      img.setTexture(e.sprite).setScale(1 / this.R).setVisible(true);
      this.sprites.set(e.id, img);
    }
    img.setPosition(e.prevX + (e.x - e.prevX) * alpha, e.prevY + (e.y - e.prevY) * alpha);
    img.setFlipX(e.facing < 0);
    img.setDepth(e.y);
  }

  relayout(_layout: HudLayout): void {}

  destroy(): void {
    for (const img of this.sprites.values()) img.destroy();
    for (const img of this.pool) img.destroy();
    for (const o of this.statics) o.destroy();
    this.sprites.clear();
    this.pool = [];
    this.statics = [];
  }
}
