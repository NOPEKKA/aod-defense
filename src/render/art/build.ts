/**
 * The texture catalog: every sprite key in data/ plus props, particles, UI icons
 * and fallbacks. Keys without dedicated art get a generated variant (coloured by
 * a hash of the key) so new data entries never crash and stay distinguishable.
 */
import type { GameData } from '../../contracts';
import { buildAtlas, type ArtItem, type FontSpec } from './atlas';
import {
  ASH_SPEC,
  CHAR_SPECS,
  SIZE_PX,
  drawBossHumanoid,
  drawCatapult,
  drawHorseman,
  drawRam,
  drawSheila,
  fitHumanoid,
  genericSpec,
  type CharSpec,
} from './characters';
import { UI_ICONS, drawRelicIcon, drawSpellIcon } from './icons';
import { circle, radial, type Ctx } from './kit';
import { placeholderItems } from './placeholder';
import * as P from './props';

export const FONT_S = 'aodd_num_s';
export const FONT_L = 'aodd_num_l';

const ASCII = (() => {
  let s = '';
  for (let c = 32; c < 127; c++) s += String.fromCharCode(c);
  return s + '×•';
})();

const human = (spec: CharSpec) => (ctx: Ctx, w: number, h: number) => fitHumanoid(ctx, w, h, spec);

/** silver coin (summon currency) for the fly-to-HUD effect; the field pickup is baked art */
function drawSilverCoin(ctx: Ctx, w: number, h: number): void {
  const x = w / 2;
  const y = h / 2;
  const r = Math.min(w, h) / 2 - 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, x - r * 0.3, y - r * 0.3, r * 1.4, [[0, '#ffffff'], [0.45, '#c9d2dc'], [1, '#6c7684']]);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.2);
  ctx.strokeStyle = '#1d2128';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = '#8b95a3';
  ctx.stroke();
}

function fallbackEffect(ctx: Ctx, w: number, h: number): void {
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, w / 2, h / 2, w / 2, [[0, 'rgba(255,240,200,0.95)'], [0.4, 'rgba(200,120,255,0.6)'], [1, 'rgba(120,60,200,0)']]);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * (0.18 + i * 0.09), i * 2, i * 2 + 3.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function buildAllTextures(scene: Phaser.Scene, data: GameData, R: number): void {
  const items: ArtItem[] = [];
  const add = (key: string, w: number, h: number, draw: ArtItem['draw'], ax = 0.5, ay = 1) => items.push({ key, w, h, ax, ay, draw });

  add('ash', ...SIZE_PX.normal, human(ASH_SPEC));

  for (const u of data.units.values()) {
    const [w, h] = SIZE_PX[u.size];
    if (u.sprite === 'unit_horseman') add(u.sprite, w, h, (c, ww, hh) => drawHorseman(c, ww, hh, CHAR_SPECS.unit_spearman));
    else add(u.sprite, w, h, human(CHAR_SPECS[u.sprite] ?? genericSpec(u.kind === 'hero' ? 'hero' : 'ally', u.sprite)));
  }
  for (const e of data.enemies.values()) {
    const [w, h] = SIZE_PX[e.size];
    const ay = e.flying ? 0.62 : 1;
    if (e.sprite === 'enemy_battering_ram') add(e.sprite, w, h, drawRam);
    else if (e.sprite === 'enemy_skeleton_catapult') add(e.sprite, w, h, drawCatapult);
    else add(e.sprite, w, h, human(CHAR_SPECS[e.sprite] ?? genericSpec(e.flying ? 'flyer' : 'enemy', e.sprite)), 0.5, ay);
  }
  for (const b of data.bosses.values()) {
    const [w, h] = SIZE_PX[b.size];
    const ay = b.flying ? 0.6 : 1;
    if (b.sprite === 'boss_sheila_demon') add(b.sprite, w, h, drawSheila, 0.5, ay);
    else {
      const spec = CHAR_SPECS[b.sprite] ?? genericSpec('boss', b.sprite);
      add(b.sprite, w, h, (c, ww, hh) => drawBossHumanoid(c, ww, hh, spec, 'rgba(160,40,200,0.4)'), 0.5, ay);
    }
  }
  for (const s of data.spells.values()) add(s.icon, 80, 80, drawSpellIcon(s.icon), 0.5, 0.5);
  for (const r of data.relics.values()) add(r.icon, 64, 64, drawRelicIcon(r.icon), 0.5, 0.5);

  // fallbacks for keys that appear only at runtime
  add('fallback_ally', ...SIZE_PX.normal, human(genericSpec('ally', 'fallback_ally')));
  add('fallback_hero', ...SIZE_PX.normal, human(genericSpec('hero', 'fallback_hero')));
  add('fallback_enemy', ...SIZE_PX.normal, human(genericSpec('enemy', 'fallback_enemy')));
  add('fallback_flyer', ...SIZE_PX.normal, human(genericSpec('flyer', 'fallback_flyer')), 0.5, 0.62);
  add('fallback_boss', ...SIZE_PX.huge, (c, w, h) => drawBossHumanoid(c, w, h, genericSpec('boss', 'fallback_boss'), 'rgba(160,40,200,0.4)'));
  add('fallback_icon', 80, 80, drawSpellIcon('fallback_icon'), 0.5, 0.5);
  add('fallback_relic', 64, 64, drawRelicIcon('fallback_relic'), 0.5, 0.5);
  add('fallback_effect', 64, 64, fallbackEffect, 0.5, 0.5);

  // pickups & projectiles
  add('coin', 22, 22, P.drawCoin, 0.5, 0.5);
  add('coin_silver', 22, 22, drawSilverCoin, 0.5, 0.5);
  add('mana_orb', 28, 28, P.drawManaOrb, 0.5, 0.5);
  add('food', 28, 20, P.drawFood, 0.5, 0.5);
  add('shot', 30, 10, P.drawShot, 0.7, 0.5);
  add('arrow', 36, 9, P.drawArrow, 0.7, 0.5);
  add('bolt', 30, 9, P.drawBolt, 0.7, 0.5);
  add('fireball', 36, 20, P.drawFireball, 0.7, 0.5);
  add('rock', 22, 22, P.drawRock, 0.5, 0.5);

  // scenery
  add('book', 54, 44, P.drawBook, 0.5, 0.5);
  add('book_stand', 70, 76, P.drawBookStand, 0.5, 1);
  add('castle', 420, 370, P.drawCastle, 0, 1);
  add('wall_catapult', 64, 48, P.drawWallCatapult, 0.5, 1);

  // particles / overlays (white)
  add('p_dot', 16, 16, P.drawDot, 0.5, 0.5);
  add('p_spark', 32, 8, P.drawSpark, 0.5, 0.5);
  add('p_smoke', 40, 40, P.drawSmoke, 0.5, 0.5);
  add('p_ring', 96, 96, P.drawRing, 0.5, 0.5);
  add('p_star', 20, 20, P.drawStar4, 0.5, 0.5);
  add('p_shard', 10, 10, P.drawShard, 0.5, 0.5);
  add('p_bone', 16, 8, P.drawBoneChip, 0.5, 0.5);
  add('glow', 96, 96, P.drawGlow, 0.5, 0.5);
  add('shadow', 64, 18, P.drawShadow, 0.5, 0.5);
  add('vignette', 320, 180, P.drawVignette, 0, 0);
  add('px', 4, 4, P.drawPx, 0, 0);
  add('p_circle', 32, 32, (c, w) => circle(c, w / 2, w / 2, w / 2 - 1, '#ffffff', 0), 0.5, 0.5);

  // neutral silhouettes drawn in battle for sprites that are not baked / not loaded yet
  items.push(...placeholderItems());

  for (const [key, draw] of Object.entries(UI_ICONS)) add(key, 48, 48, draw, 0.5, 0.5);
  // the same coin/mana art in UI size for convenience
  add('icon_coin_small', 20, 20, P.drawCoin, 0.5, 0.5);

  const fonts: FontSpec[] = [
    { key: FONT_S, base: 16, outline: 2.6, chars: ASCII },
    { key: FONT_L, base: 30, outline: 3.6, chars: ASCII },
  ];
  buildAtlas(scene, items, fonts, R);
}
