import type { GameData } from '../contracts';

/**
 * Placeholder textures: one rounded box per sprite key, tinted by role, with a
 * short label. Drawn at renderScale so they stay crisp; display them at
 * scale 1/renderScale. Phase 6 replaces these with the real vector art.
 */

const SIZE: Record<string, [number, number]> = {
  small: [44, 62],
  normal: [56, 84],
  large: [86, 108],
  huge: [200, 230],
};

const COLOR = {
  ash: 0x2f6fd6,
  troop: 0x4a8fe0,
  hero: 0xe0b23a,
  enemy: 0x6f8f5a,
  boss: 0x8e3fb3,
  icon: 0x3a3a52,
  pickup: 0xf2c94c,
  projectile: 0xffffff,
} as const;

function box(scene: Phaser.Scene, key: string, w: number, h: number, color: number, label: string, R: number, round = 10): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addDynamicTexture(key, Math.ceil(w * R), Math.ceil(h * R));
  if (!tex) return;
  const g = scene.make.graphics({}, false);
  g.fillStyle(color, 1);
  g.fillRoundedRect(2 * R, 2 * R, (w - 4) * R, (h - 4) * R, Math.min(round, w / 3) * R);
  g.lineStyle(3 * R, 0x101018, 1);
  g.strokeRoundedRect(2 * R, 2 * R, (w - 4) * R, (h - 4) * R, Math.min(round, w / 3) * R);
  tex.draw(g, 0, 0);
  if (label) {
    const t = scene.make.text(
      {
        text: label,
        style: { fontFamily: 'system-ui, sans-serif', fontSize: `${Math.max(9, Math.min(14, w / 5)) * R}px`, color: '#ffffff', align: 'center', wordWrap: { width: (w - 8) * R } },
      },
      false,
    );
    t.setOrigin(0.5, 0.5);
    tex.draw(t, (w / 2) * R, (h / 2) * R);
    t.destroy();
  }
  g.destroy();
}

const short = (id: string) => id.replace(/^(unit|hero|enemy|boss|icon)_/, '').replace(/_/g, ' ');

export function buildPlaceholderTextures(scene: Phaser.Scene, data: GameData, R: number): void {
  box(scene, 'ash', ...SIZE.normal, COLOR.ash, 'ASH', R);
  for (const u of data.units.values()) box(scene, u.sprite, ...SIZE[u.size], u.kind === 'hero' ? COLOR.hero : COLOR.troop, short(u.sprite), R);
  for (const e of data.enemies.values()) box(scene, e.sprite, ...SIZE[e.size], COLOR.enemy, short(e.sprite), R);
  for (const b of data.bosses.values()) box(scene, b.sprite, ...SIZE[b.size], COLOR.boss, short(b.sprite), R, 24);
  for (const s of data.spells.values()) box(scene, s.icon, 80, 80, COLOR.icon, short(s.icon), R, 40);
  for (const r of data.relics.values()) box(scene, r.icon, 64, 64, COLOR.icon, short(r.icon), R, 12);
  box(scene, 'coin', 18, 18, COLOR.pickup, '', R, 9);
  box(scene, 'mana_orb', 20, 20, 0x5ab0ff, '', R, 10);
  box(scene, 'food', 22, 18, 0xc98a4b, '', R, 6);
  for (const p of ['shot', 'arrow', 'bolt', 'fireball', 'rock']) box(scene, p, 16, 8, COLOR.projectile, '', R, 4);
  box(scene, 'book', 48, 40, 0x7a4a2a, 'BOOK', R, 6);
  box(scene, 'px', 4, 4, 0xffffff, '', R, 0);
}
