/**
 * Placeholder character art: big-headed chibi silhouettes with thick outlines,
 * drawn with Canvas 2D at atlas-build time. Everything faces RIGHT; render
 * flips by `facing`.
 *
 * Colour language (SPEC §0, phase-6 art replaces this):
 *   allies  = blue cloth           heroes = gold trim + cape/crown
 *   enemies = bone / rotten green  bosses = huge + purple aura
 *
 * Humanoids are drawn in a canonical 64x88 box (feet at y=86, body centre x=30)
 * and scaled to the frame.
 */
import {
  OUT,
  PAL,
  circle,
  ellipse,
  fillStroke,
  gloss,
  hashKey,
  hsl,
  line,
  poly,
  radial,
  rrect,
  setLW,
  shade,
  stick,
  getLW,
  type Ctx,
} from './kit';

export type Hat =
  | 'none' | 'straw' | 'cap' | 'kettle' | 'helm' | 'hood' | 'crown' | 'wizard' | 'horns'
  | 'greathelm' | 'hornhelm' | 'pompadour' | 'bald';
export type Weapon =
  | 'none' | 'sword' | 'greatsword' | 'spear' | 'pitchfork' | 'bow' | 'crossbow' | 'torch'
  | 'axe' | 'staff' | 'shotgun' | 'claws' | 'mace' | 'orbstaff';
export type HeadKind = 'human' | 'skull' | 'ghoul' | 'hag' | 'demon';

export interface CharSpec {
  head: HeadKind;
  skin?: string;
  hair?: string;
  beard?: string;
  body: string;
  legs: string;
  boots?: string;
  belt?: string;
  trim?: string;
  hat?: Hat;
  hatColor?: string;
  plume?: string;
  weapon?: Weapon;
  weaponColor?: string;
  orb?: string;
  shield?: 'round' | 'tower' | 'buckler';
  shieldColor?: string;
  shieldFront?: boolean;
  cape?: string;
  robe?: boolean;
  bones?: boolean;
  armor?: string;
  eye?: string;
  mouth?: 'smile' | 'grim' | 'teeth' | 'evil' | 'open';
  hunch?: number;
  wings?: string;
  floating?: boolean;
  noLegs?: boolean;
}

const BONE_DARK = '#2a1d30';

// ---------------------------------------------------------------------------
// humanoid parts (canonical box)
// ---------------------------------------------------------------------------

function batWing(ctx: Ctx, pts: number[], color: string): void {
  poly(ctx, pts, color);
  // membrane ribs
  const n = pts.length / 2;
  ctx.globalAlpha = 0.5;
  for (let i = 2; i < n - 1; i += 2) line(ctx, pts[0], pts[1], pts[i * 2], pts[i * 2 + 1], shade(color, -0.45), 1.5);
  ctx.globalAlpha = 1;
}

function drawLegs(ctx: Ctx, s: CharSpec): void {
  if (s.noLegs) return;
  if (s.robe) {
    poly(ctx, [19, 52, 41, 52, 46, 85, 14, 85], s.body);
    line(ctx, 16, 80, 44, 80, shade(s.body, -0.3), 2);
    if (s.trim) line(ctx, 15.5, 82.5, 44.5, 82.5, s.trim, 2.5);
    return;
  }
  const legC = s.bones ? PAL.bone : s.legs;
  const lw = s.bones ? 3.6 : 7;
  if (s.floating) {
    stick(ctx, 26, 69, 21, 80, lw, legC);
    stick(ctx, 34, 69, 31, 82, lw, legC);
    return;
  }
  stick(ctx, 26, 70, 25, 82, lw, legC);
  stick(ctx, 34, 70, 36, 82, lw, legC);
  const boot = s.boots ?? (s.bones ? PAL.bone : shade(s.legs, -0.35));
  ellipse(ctx, 24.5, 84, s.bones ? 4.5 : 6, 3.2, boot);
  ellipse(ctx, 37.5, 84, s.bones ? 4.5 : 6, 3.2, boot);
}

function drawTorso(ctx: Ctx, s: CharSpec): void {
  if (s.bones && !s.armor) {
    rrect(ctx, 20, 50, 20, 19, 7, PAL.bone);
    for (const y of [55, 59, 63]) line(ctx, 23, y, 37, y, BONE_DARK, 1.6);
    line(ctx, 30, 51, 30, 68, BONE_DARK, 1.6);
    rrect(ctx, 22, 67, 16, 5, 2, PAL.bone);
    return;
  }
  if (s.robe) {
    rrect(ctx, 18, 49, 24, 20, 8, s.body);
  } else {
    rrect(ctx, 18, 50, 24, 22, 8, s.body);
  }
  gloss(ctx, 24, 55, 4, 3, 0.22);
  if (s.armor) {
    rrect(ctx, 21, 52, 18, 12, 5, s.armor);
    gloss(ctx, 25, 55, 3, 2, 0.35);
    ellipse(ctx, 20, 53, 6, 5, s.armor);
    ellipse(ctx, 40, 53, 6, 5, s.armor);
  }
  if (s.trim) {
    line(ctx, 30, 51, 30, 70, s.trim, 2.5);
  }
  if (s.belt) rrect(ctx, 18, 64, 24, 4, 1.5, s.belt, 2);
}

function drawHumanHead(ctx: Ctx, s: CharSpec): void {
  const skin = s.skin ?? PAL.skin;
  // ear behind
  ellipse(ctx, 19.5, 35, 3.2, 4.6, skin, 2.2);
  circle(ctx, 30, 33, 17, skin);
  gloss(ctx, 24, 25, 6, 4, 0.25);
  // hair cap
  if (s.hair && s.hat !== 'bald' && s.hat !== 'greathelm') {
    ctx.beginPath();
    ctx.arc(30, 33, 17.6, Math.PI * 0.93, Math.PI * 1.86);
    ctx.quadraticCurveTo(40, 22, 30, 23);
    ctx.quadraticCurveTo(20, 25, 15.5, 40);
    ctx.closePath();
    fillStroke(ctx, s.hair, 2.4);
  }
  // beard
  if (s.beard) {
    poly(ctx, [20, 39, 47, 39, 44, 52, 36, 58, 27, 54], s.beard, 2.4);
    // mouth gap
    line(ctx, 36, 43.5, 43, 43.5, shade(s.beard, -0.45), 1.8);
  }
  // eyes
  if (s.eye) {
    ellipse(ctx, 35, 32.5, 3.8, 3.6, '#2a1d30', 0);
    ellipse(ctx, 43, 32.5, 3.2, 3.3, '#2a1d30', 0);
    circle(ctx, 35.4, 32.8, 2, s.eye, 0);
    circle(ctx, 43.2, 32.8, 1.7, s.eye, 0);
    line(ctx, 31, 27, 38, 30, OUT, 2.2);
    line(ctx, 40, 30, 46, 27.5, OUT, 2.2);
  } else {
    ellipse(ctx, 34.5, 33, 3.6, 4.4, '#ffffff', 1.6);
    ellipse(ctx, 42.6, 33, 3.1, 4.1, '#ffffff', 1.6);
    circle(ctx, 35.9, 33.7, 1.9, OUT, 0);
    circle(ctx, 43.7, 33.7, 1.7, OUT, 0);
    line(ctx, 31, 27.6, 37, 28.4, OUT, 2);
    line(ctx, 40, 28.4, 45.5, 27.6, OUT, 2);
  }
  // nose
  ellipse(ctx, 46.6, 37.4, 2.7, 2.2, shade(skin, -0.12), 1.6);
  if (!s.beard) {
    ctx.beginPath();
    switch (s.mouth) {
      case 'open':
        ellipse(ctx, 40, 43, 2.6, 2, '#6b2a2a', 1.6);
        break;
      case 'grim':
        line(ctx, 36, 43.5, 43, 43, OUT, 2);
        break;
      case 'evil':
        ctx.arc(39.5, 39.5, 5.5, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.closePath();
        fillStroke(ctx, '#ffffff', 1.8);
        break;
      default:
        ctx.arc(40, 40.5, 4, 0.15 * Math.PI, 0.8 * Math.PI);
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
  }
}

function drawSkull(ctx: Ctx, s: CharSpec): void {
  rrect(ctx, 24, 40, 15, 9, 3.5, PAL.bone);
  for (let x = 27; x <= 36; x += 3) line(ctx, x, 42, x, 47, BONE_DARK, 1.2);
  circle(ctx, 30, 32, 16, PAL.bone);
  gloss(ctx, 24, 24, 6, 4, 0.35);
  ellipse(ctx, 34.5, 31, 4.4, 5, BONE_DARK, 0);
  ellipse(ctx, 43, 31, 3.6, 4.6, BONE_DARK, 0);
  const eye = s.eye ?? PAL.eyeRed;
  circle(ctx, 35, 32, 2, eye, 0);
  circle(ctx, 43.3, 32, 1.7, eye, 0);
  poly(ctx, [39.5, 36, 41.5, 40, 37.5, 40], BONE_DARK, 0);
  line(ctx, 19, 26, 23, 30, BONE_DARK, 1.3);
}

function drawGhoul(ctx: Ctx, s: CharSpec): void {
  const skin = s.skin ?? PAL.ghoul;
  circle(ctx, 30, 33, 16.5, skin);
  gloss(ctx, 24, 25, 5, 3.5, 0.2);
  // messy hair spikes
  const hair = s.hair ?? '#2c2420';
  poly(ctx, [13, 34, 16, 18, 22, 22, 26, 12, 31, 19, 37, 13, 40, 20, 46, 20, 45, 26, 30, 22, 18, 30], hair, 2.2);
  // glowing eyes
  const eye = s.eye ?? PAL.eyeYellow;
  ellipse(ctx, 35, 32, 3.8, 3, '#1d1420', 0);
  ellipse(ctx, 43, 32, 3.2, 2.8, '#1d1420', 0);
  ellipse(ctx, 35, 32, 2.6, 2, eye, 0);
  ellipse(ctx, 43, 32, 2.2, 1.8, eye, 0);
  line(ctx, 30.5, 27, 38, 29.5, OUT, 2.4);
  line(ctx, 40.5, 29.5, 46.5, 27, OUT, 2.4);
  // jagged mouth
  poly(ctx, [33, 41, 46, 40, 45, 46, 34, 46.5], '#3a1218', 1.8);
  poly(ctx, [35, 41, 37, 44, 39, 41, 41, 44, 43, 40.5], '#f4ecd8', 0, false);
  ctx.fillStyle = '#f4ecd8';
  ctx.fill();
}

function drawHag(ctx: Ctx, s: CharSpec): void {
  const skin = s.skin ?? '#9db085';
  // long hair behind
  poly(ctx, [16, 26, 30, 18, 40, 22, 30, 30, 26, 58, 16, 60, 12, 44], s.hair ?? '#c9c6bd', 2.4);
  circle(ctx, 32, 35, 14, skin);
  // hooked nose
  poly(ctx, [42, 32, 53, 41, 46, 42, 42, 39], shade(skin, -0.1), 2);
  circle(ctx, 47, 39, 1.3, '#5a6a40', 0);
  ellipse(ctx, 38, 31, 3, 2.6, '#fff4a0', 1.4);
  circle(ctx, 38.7, 31.3, 1.3, OUT, 0);
  line(ctx, 34, 27, 41, 28.5, OUT, 2.2);
  line(ctx, 38, 45, 44, 45.5, OUT, 2);
}

function drawDemonHead(ctx: Ctx, s: CharSpec): void {
  const skin = s.skin ?? '#a65bd0';
  // flowing hair behind
  poly(ctx, [12, 22, 30, 14, 44, 18, 36, 26, 22, 56, 8, 64, 6, 44], s.hair ?? '#d12a33', 2.4);
  // horns
  poly(ctx, [19, 21, 8, 4, 14, 6, 25, 18], PAL.bone, 2.2);
  poly(ctx, [37, 18, 44, 2, 47, 8, 42, 21], PAL.bone, 2.2);
  circle(ctx, 30, 33, 16, skin);
  gloss(ctx, 24, 25, 5, 3.5, 0.22);
  const eye = s.eye ?? PAL.eyeYellow;
  poly(ctx, [31, 30, 39, 31, 38, 34, 32, 33.5], eye, 1.4);
  poly(ctx, [40.5, 31, 46, 30, 45.5, 33.5, 41, 34], eye, 1.4);
  line(ctx, 30, 27, 39, 29.5, OUT, 2.4);
  line(ctx, 40, 29.5, 47, 26.5, OUT, 2.4);
  ctx.beginPath();
  ctx.arc(40, 39, 5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.closePath();
  fillStroke(ctx, '#3a0d18', 1.6);
  poly(ctx, [37, 42, 38, 45, 39, 42.5], '#ffffff', 0);
  ctx.fillStyle = '#fff';
  ctx.fill();
  poly(ctx, [41.5, 42.5, 42.5, 45, 43.5, 42.5], '#ffffff', 0);
  ctx.fill();
}

function drawHead(ctx: Ctx, s: CharSpec): void {
  if (s.hat === 'hood') ellipse(ctx, 28.5, 33, 20.5, 21.5, s.hatColor ?? PAL.green);
  switch (s.head) {
    case 'skull':
      drawSkull(ctx, s);
      break;
    case 'ghoul':
      drawGhoul(ctx, s);
      break;
    case 'hag':
      drawHag(ctx, s);
      break;
    case 'demon':
      drawDemonHead(ctx, s);
      break;
    default:
      drawHumanHead(ctx, s);
  }
  drawHat(ctx, s);
}

function drawHat(ctx: Ctx, s: CharSpec): void {
  const c = s.hatColor;
  switch (s.hat) {
    case 'straw': {
      const straw = c ?? '#e9c45c';
      ellipse(ctx, 30, 20, 24, 5.5, straw);
      rrect(ctx, 19, 6, 22, 15, 7, straw);
      line(ctx, 20, 16, 40, 16, PAL.red, 3);
      gloss(ctx, 25, 10, 4, 2.5, 0.3);
      break;
    }
    case 'cap': {
      ctx.beginPath();
      ctx.arc(30, 31, 18.5, Math.PI, Math.PI * 2);
      ctx.closePath();
      fillStroke(ctx, c ?? PAL.steel);
      stick(ctx, 11.5, 31, 48.5, 31, 3, shade(c ?? PAL.steel, -0.25), 2);
      gloss(ctx, 23, 21, 5, 3, 0.4);
      break;
    }
    case 'kettle': {
      ctx.beginPath();
      ctx.arc(30, 28, 16, Math.PI, Math.PI * 2);
      ctx.closePath();
      fillStroke(ctx, c ?? PAL.steel);
      ellipse(ctx, 30, 28.5, 25, 4.5, c ?? PAL.steel);
      gloss(ctx, 24, 18, 4, 2.5, 0.4);
      break;
    }
    case 'helm': {
      poly(ctx, [11, 30, 49, 30, 42, 15, 30, 9, 18, 15], c ?? PAL.iron);
      stick(ctx, 41, 30, 41, 40, 3, c ?? PAL.iron, 2);
      gloss(ctx, 23, 19, 4, 2.5, 0.4);
      break;
    }
    case 'hood': {
      ctx.beginPath();
      ctx.arc(30, 33, 19, Math.PI * 0.82, Math.PI * 2.02);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.strokeStyle = c ?? PAL.green;
      ctx.lineWidth = 6.5;
      ctx.stroke();
      break;
    }
    case 'crown':
      poly(ctx, [17, 20, 17, 8, 23, 14, 30, 4, 37, 14, 43, 8, 43, 20], PAL.gold);
      circle(ctx, 30, 15, 2.2, PAL.red, 1.4);
      circle(ctx, 22, 17, 1.6, '#4aa8ff', 1.2);
      circle(ctx, 38, 17, 1.6, '#4aa8ff', 1.2);
      break;
    case 'wizard': {
      const hc = c ?? PAL.purple;
      poly(ctx, [13, 22, 47, 22, 38, 9, 22, 0, 26, 12], hc);
      ellipse(ctx, 30, 22, 23, 4.5, hc);
      line(ctx, 17, 19, 43, 19, PAL.gold, 2.5);
      break;
    }
    case 'horns':
      poly(ctx, [18, 22, 9, 6, 15, 8, 24, 18], PAL.bone, 2.2);
      poly(ctx, [39, 19, 47, 3, 50, 9, 44, 22], PAL.bone, 2.2);
      break;
    case 'greathelm': {
      const hc = c ?? PAL.steel;
      if (s.plume) poly(ctx, [24, 14, 20, 0, 34, 2, 36, 14], s.plume, 2.4);
      rrect(ctx, 12, 13, 35, 38, 11, hc);
      gloss(ctx, 20, 21, 5, 4, 0.4);
      rrect(ctx, 29, 28, 18, 4.5, 2, '#1d1622', 0);
      for (const y of [37, 41]) for (const x of [36, 40, 44]) circle(ctx, x, y, 0.9, '#1d1622', 0);
      break;
    }
    case 'hornhelm': {
      const hc = c ?? '#3e3848';
      poly(ctx, [16, 20, 4, 4, 11, 4, 22, 16], PAL.bone, 2.2);
      poly(ctx, [40, 16, 50, 0, 54, 6, 45, 20], PAL.bone, 2.2);
      ctx.beginPath();
      ctx.arc(30, 31, 18.5, Math.PI, Math.PI * 2);
      ctx.closePath();
      fillStroke(ctx, hc);
      stick(ctx, 41, 31, 41, 41, 3, hc, 2);
      break;
    }
    case 'pompadour':
      poly(ctx, [14, 34, 15, 20, 24, 12, 40, 11, 49, 18, 40, 20, 32, 19, 22, 24, 18, 36], s.hair ?? '#3a2516', 2.4);
      gloss(ctx, 30, 14, 6, 2, 0.35);
      break;
    default:
      break;
  }
}

function drawWeapon(ctx: Ctx, s: CharSpec): void {
  const wc = s.weaponColor;
  switch (s.weapon) {
    case 'sword':
      stick(ctx, 47.5, 59, 57, 26, 4.6, wc ?? PAL.steel);
      line(ctx, 49, 55, 56, 31, 'rgba(255,255,255,0.5)', 1.2);
      stick(ctx, 42.5, 56.5, 53.5, 60, 3.4, PAL.gold, 2);
      stick(ctx, 47.2, 62, 45.8, 67, 3, PAL.leather, 2);
      break;
    case 'greatsword':
      stick(ctx, 48, 58, 60, 8, 7, wc ?? '#9aa3b0');
      line(ctx, 50, 53, 59, 14, 'rgba(255,255,255,0.45)', 1.4);
      stick(ctx, 40.5, 55.5, 56, 60, 4, '#4a4452', 2);
      stick(ctx, 47, 62, 45.6, 68, 3.4, '#2a2230', 2);
      break;
    case 'spear':
      stick(ctx, 50.5, 7, 45.5, 85, 3.4, wc ?? PAL.wood);
      poly(ctx, [51, 0, 55, 9, 50.6, 14, 46.8, 8.6], PAL.steel, 2.2);
      break;
    case 'pitchfork':
      stick(ctx, 51, 12, 46, 85, 3.2, wc ?? PAL.wood);
      stick(ctx, 44.5, 12.5, 57.5, 11.5, 2.4, PAL.iron, 2);
      for (const x of [45, 51, 57]) stick(ctx, x, 12, x, 2, 2, PAL.iron, 1.6);
      break;
    case 'bow': {
      ctx.beginPath();
      ctx.arc(31, 60, 19, -1.15, 1.15);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = wc ?? PAL.wood;
      ctx.lineWidth = 3.8;
      ctx.stroke();
      const ex = 31 + Math.cos(1.15) * 19;
      const ey = Math.sin(1.15) * 19;
      line(ctx, ex, 60 - ey, ex, 60 + ey, '#efe9dc', 1.2);
      stick(ctx, ex, 60, 57, 60, 1.6, PAL.cloth, 1.4);
      poly(ctx, [57, 57, 62, 60, 57, 63], PAL.steel, 1.4);
      break;
    }
    case 'crossbow':
      stick(ctx, 35, 61, 58, 58.5, 4, wc ?? PAL.wood);
      ctx.beginPath();
      ctx.arc(48, 59, 12, -1.25, 1.25);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 6.5;
      ctx.stroke();
      ctx.strokeStyle = PAL.steelD;
      ctx.lineWidth = 3.4;
      ctx.stroke();
      line(ctx, 52.5, 47.6, 52.5, 70.4, '#efe9dc', 1);
      poly(ctx, [58, 56, 63, 58.4, 58, 61], PAL.steel, 1.4);
      break;
    case 'torch':
      stick(ctx, 47, 63, 51.5, 38, 3.6, wc ?? PAL.wood);
      rrect(ctx, 48, 36, 7, 5, 1.5, PAL.iron, 1.8);
      ellipse(ctx, 51.8, 29, 5.8, 9, PAL.fire, 2);
      ellipse(ctx, 51.8, 31.5, 3, 5, PAL.fireL, 0);
      break;
    case 'axe':
      stick(ctx, 46.5, 66, 53.5, 28, 3.6, wc ?? PAL.wood);
      poly(ctx, [51, 28, 63, 20, 66, 33, 56, 39], PAL.steel);
      gloss(ctx, 60, 27, 2.5, 3.5, 0.45);
      break;
    case 'staff':
    case 'orbstaff':
      stick(ctx, 51.5, 12, 46, 85, 3.6, wc ?? PAL.woodD);
      ctx.save();
      ctx.globalAlpha = 0.35;
      circle(ctx, 52, 9, 10, s.orb ?? '#7dffa0', 0);
      ctx.restore();
      circle(ctx, 52, 9, 6, s.orb ?? '#7dffa0', 2.2);
      gloss(ctx, 50, 7, 2.4, 1.6, 0.7);
      break;
    case 'shotgun':
      stick(ctx, 34, 65, 45, 61.5, 6, PAL.wood);
      stick(ctx, 44, 60, 65, 56.5, 4.6, '#5b5f6a');
      line(ctx, 46, 58.2, 64, 55.2, '#8e939e', 1.2);
      circle(ctx, 64.5, 56.5, 1.4, OUT, 0);
      break;
    case 'claws':
      for (const [x2, y2] of [[54, 56], [55, 62], [53, 68]]) stick(ctx, 47.5, 62, x2, y2, 1.8, PAL.bone, 1.6);
      break;
    case 'mace':
      stick(ctx, 47, 63, 53, 42, 3.6, wc ?? PAL.woodD);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        poly(ctx, [54 + Math.cos(a) * 5, 39 + Math.sin(a) * 5, 54 + Math.cos(a + 0.25) * 9.5, 39 + Math.sin(a + 0.25) * 9.5, 54 + Math.cos(a + 0.5) * 5, 39 + Math.sin(a + 0.5) * 5], PAL.iron, 1.6);
      }
      circle(ctx, 54, 39, 6.2, PAL.iron);
      break;
    default:
      break;
  }
}

function drawShield(ctx: Ctx, s: CharSpec, front: boolean): void {
  const c = s.shieldColor ?? PAL.blue;
  if (s.shield === 'tower') {
    rrect(ctx, 37, 43, 19, 40, 5, c);
    gloss(ctx, 42, 50, 3, 6, 0.3);
    stick(ctx, 46.5, 50, 46.5, 76, 3.4, PAL.gold, 1.6);
    stick(ctx, 40.5, 59, 52.5, 59, 3.4, PAL.gold, 1.6);
    return;
  }
  if (s.shield === 'buckler') {
    circle(ctx, 16, 64, 7.5, c);
    circle(ctx, 16, 64, 2.2, PAL.steel, 1.4);
    return;
  }
  const x = front ? 43 : 16;
  circle(ctx, x, 63, front ? 12 : 10, c);
  ctx.beginPath();
  ctx.arc(x, 63, front ? 9 : 7.5, 0, Math.PI * 2);
  ctx.strokeStyle = PAL.steelD;
  ctx.lineWidth = 2;
  ctx.stroke();
  circle(ctx, x, 63, 2.8, PAL.steel, 1.6);
}

/** Draws a humanoid in the canonical 64x88 box (feet on y=86). */
export function humanoid(ctx: Ctx, s: CharSpec): void {
  const skin = s.bones ? PAL.bone : s.head === 'ghoul' ? s.skin ?? PAL.ghoul : s.head === 'hag' ? s.skin ?? '#9db085' : s.head === 'demon' ? s.skin ?? '#a65bd0' : s.skin ?? PAL.skin;
  const sleeve = s.bones ? PAL.bone : s.armor ?? s.body;
  const armW = s.bones ? 3 : 5.5;
  if (s.cape) poly(ctx, [20, 50, 40, 50, 45, 82, 33, 85, 22, 85, 11, 81], s.cape);
  if (s.wings) {
    batWing(ctx, [26, 50, 0, 18, 6, 40, 0, 56, 13, 54, 11, 70, 27, 60], s.wings);
    batWing(ctx, [37, 50, 64, 22, 58, 44, 64, 56, 51, 55, 49, 68, 38, 60], shade(s.wings, 0.12));
  }
  ctx.save();
  if (s.hunch) {
    ctx.translate(30, 72);
    ctx.rotate(s.hunch);
    ctx.translate(-30, -72);
  }
  // back arm
  stick(ctx, 22, 54, 17, 66, armW, sleeve);
  circle(ctx, 16.5, 67, s.bones ? 2.6 : 3.2, skin, 2);
  if (s.shield && !s.shieldFront && s.shield !== 'tower') drawShield(ctx, s, false);
  drawLegs(ctx, s);
  drawTorso(ctx, s);
  drawHead(ctx, s);
  // front arm + weapon
  stick(ctx, 38, 54, 46, 61.5, armW, sleeve);
  drawWeapon(ctx, s);
  circle(ctx, 47, 62, s.bones ? 2.8 : 3.5, skin, 2);
  if (s.shield && (s.shieldFront || s.shield === 'tower')) drawShield(ctx, s, true);
  ctx.restore();
}

/** Head + hat only, centred on (32,32) in a 64x64 box (portrait icons). */
export function portrait(ctx: Ctx, s: CharSpec): void {
  ctx.save();
  ctx.translate(2, 2);
  drawHead(ctx, s);
  ctx.restore();
}

/** Scale the canonical humanoid into a w x h frame, keeping outlines readable. */
export function fitHumanoid(ctx: Ctx, w: number, h: number, s: CharSpec, scaleMul = 1): void {
  const k = Math.min((w - 4) / 66, (h - 2) / 88) * scaleMul;
  const prev = getLW();
  setLW((3 * Math.min(1.45, Math.max(1, k))) / k);
  ctx.save();
  ctx.translate(w / 2 - 32 * k, h - 1 - 87 * k);
  ctx.scale(k, k);
  humanoid(ctx, s);
  ctx.restore();
  setLW(prev);
}

// ---------------------------------------------------------------------------
// custom silhouettes
// ---------------------------------------------------------------------------

function aura(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, x, y, r, [[0, color], [1, 'rgba(0,0,0,0)']]);
  ctx.fill();
}

export function drawHorseman(ctx: Ctx, w: number, h: number, rider: CharSpec, horse = '#8a5a32', cloth = PAL.blue): void {
  const k = Math.min(w / 110, h / 120);
  ctx.save();
  ctx.scale(k, k);
  const g = 118;
  const dark = shade(horse, -0.4);
  stick(ctx, 22, 74, 10, 94, 6, dark); // tail
  stick(ctx, 33, 88, 31, g - 4, 6, shade(horse, -0.15));
  stick(ctx, 42, 89, 44, g - 4, 6, shade(horse, -0.15));
  ellipse(ctx, 52, 80, 31, 15, horse);
  gloss(ctx, 44, 72, 10, 4, 0.2);
  poly(ctx, [30, 70, 72, 70, 76, 88, 28, 88], cloth, 2.6);
  line(ctx, 29, 84, 75, 84, PAL.gold, 2.5);
  stick(ctx, 66, 88, 67, g - 4, 6, horse);
  stick(ctx, 75, 86, 79, g - 4, 6, horse);
  for (const x of [31, 44, 67, 79]) ellipse(ctx, x, g - 2, 4.6, 2.6, '#2a1d18', 2);
  poly(ctx, [68, 76, 78, 50, 88, 46, 92, 56, 80, 84], horse);
  poly(ctx, [70, 68, 78, 48, 84, 46, 76, 70], dark, 2);
  ellipse(ctx, 94, 55, 12, 7.5, horse, 3, 0.5);
  poly(ctx, [85, 46, 86, 38, 90, 45], horse, 2);
  circle(ctx, 92, 51, 1.8, OUT, 0);
  circle(ctx, 101, 60, 1.2, OUT, 0);
  // rider on top
  ctx.save();
  ctx.translate(52 - 30 * 0.8, 70 - 70 * 0.8);
  ctx.scale(0.8, 0.8);
  humanoid(ctx, { ...rider, noLegs: true, weapon: 'none' });
  ctx.restore();
  // lance
  stick(ctx, 50, 74, 108, 40, 3.6, PAL.wood);
  poly(ctx, [104, 38, 110, 34, 107, 42], PAL.steel, 2);
  poly(ctx, [96, 45, 104, 36, 102, 48], cloth, 1.6);
  ctx.restore();
}

export function drawRam(ctx: Ctx, w: number, h: number): void {
  const k = Math.min(w / 110, h / 120);
  ctx.save();
  ctx.scale(k, k);
  const g = 118;
  for (const x of [30, 70]) {
    circle(ctx, x, 72, 9, PAL.bone);
    circle(ctx, x + 3, 71, 1.8, PAL.eyeRed, 0);
  }
  for (const x of [26, 38, 64, 76]) {
    stick(ctx, x, 90, x - 2, g - 3, 3.6, PAL.bone);
    ellipse(ctx, x - 3, g - 1.5, 4, 2.4, PAL.bone, 2);
  }
  stick(ctx, 16, 64, 16, 92, 4, PAL.woodD);
  stick(ctx, 92, 64, 92, 92, 4, PAL.woodD);
  rrect(ctx, 6, 72, 92, 20, 10, PAL.wood);
  for (const x of [22, 44, 66]) line(ctx, x, 75, x + 8, 89, PAL.woodD, 2);
  rrect(ctx, 92, 67, 16, 30, 6, PAL.iron);
  gloss(ctx, 98, 74, 3, 5, 0.4);
  for (const y of [72, 82, 92]) circle(ctx, 95, y, 1.3, OUT, 0);
  poly(ctx, [4, 64, 104, 64, 90, 36, 18, 36], '#6e4a28');
  for (let x = 24; x < 92; x += 11) line(ctx, x, 40, x - 4, 62, PAL.woodD, 2);
  poly(ctx, [12, 64, 96, 64, 94, 60, 14, 60], PAL.woodD, 2);
  ctx.restore();
}

export function drawCatapult(ctx: Ctx, w: number, h: number): void {
  const k = Math.min(w / 110, h / 120);
  ctx.save();
  ctx.scale(k, k);
  stick(ctx, 44, 92, 62, 54, 4, PAL.woodD);
  stick(ctx, 82, 92, 62, 54, 4, PAL.woodD);
  stick(ctx, 64, 84, 20, 40, 6, PAL.wood);
  ellipse(ctx, 17, 38, 11, 7, PAL.woodD);
  circle(ctx, 16, 32, 7, '#8f8a84');
  gloss(ctx, 14, 30, 2.5, 2, 0.4);
  rrect(ctx, 12, 84, 86, 13, 3, PAL.woodD);
  circle(ctx, 62, 54, 4, PAL.iron, 2);
  for (const x of [28, 82]) {
    circle(ctx, x, 103, 13, PAL.wood);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4;
      line(ctx, x - Math.cos(a) * 11, 103 - Math.sin(a) * 11, x + Math.cos(a) * 11, 103 + Math.sin(a) * 11, PAL.woodD, 2);
    }
    circle(ctx, x, 103, 3, PAL.iron, 2);
  }
  circle(ctx, 98, 78, 9, PAL.bone);
  ellipse(ctx, 101, 77, 2.6, 3, BONE_DARK, 0);
  circle(ctx, 101, 77.5, 1.3, PAL.eyeRed, 0);
  ctx.restore();
}

export function drawSheila(ctx: Ctx, w: number, h: number): void {
  const k = Math.min(w / 220, h / 250);
  ctx.save();
  ctx.scale(k, k);
  aura(ctx, 110, 130, 120, 'rgba(170,60,220,0.45)');
  const prev = getLW();
  setLW(4);
  batWing(ctx, [100, 104, 4, 26, 26, 86, 0, 118, 40, 122, 26, 168, 98, 132], '#5a2a6e');
  batWing(ctx, [120, 104, 216, 26, 194, 86, 220, 118, 180, 122, 194, 168, 122, 132], '#6b3484');
  setLW(3 / 2.05);
  ctx.save();
  ctx.translate(110 - 32 * 2.05, 34);
  ctx.scale(2.05, 2.05);
  humanoid(ctx, {
    head: 'demon', skin: '#b066d8', hair: '#d6283a', body: '#3a1030', legs: '#3a1030', robe: true,
    trim: '#d6283a', weapon: 'claws', floating: true, eye: PAL.eyeYellow,
  });
  ctx.restore();
  setLW(prev);
  ctx.restore();
}

export function drawBossHumanoid(ctx: Ctx, w: number, h: number, s: CharSpec, auraColor: string): void {
  aura(ctx, w / 2, h * 0.55, Math.min(w, h) * 0.55, auraColor);
  fitHumanoid(ctx, w, h, s);
}

// ---------------------------------------------------------------------------
// spec table
// ---------------------------------------------------------------------------

const ALLY_LEGS = '#4a3b2a';

export const ASH_SPEC: CharSpec = {
  head: 'human', hair: '#3a2516', hat: 'pompadour', body: '#3a6fd4', legs: '#5a4632', boots: '#3b2a1c',
  belt: '#2a1f18', weapon: 'shotgun', mouth: 'smile',
};

export const CHAR_SPECS: Record<string, CharSpec> = {
  unit_peasant: { head: 'human', hat: 'straw', body: '#6b8cc4', legs: '#6d5a3e', weapon: 'pitchfork', mouth: 'open', belt: '#5a3f22' },
  unit_swordsman: { head: 'human', hair: '#6b4423', hat: 'cap', body: PAL.blue, legs: ALLY_LEGS, belt: PAL.leather, weapon: 'sword', shield: 'buckler', shieldColor: PAL.blueD },
  unit_archer: { head: 'human', hat: 'hood', hatColor: '#3f8f5a', body: '#3d6cc0', legs: ALLY_LEGS, belt: PAL.leather, weapon: 'bow' },
  unit_spearman: { head: 'human', hair: '#4a3020', hat: 'kettle', body: '#3a66c0', legs: ALLY_LEGS, belt: PAL.leather, weapon: 'spear', mouth: 'grim' },
  unit_torch_boy: { head: 'human', hair: '#c9772e', body: '#3f74d6', legs: ALLY_LEGS, trim: PAL.fire, weapon: 'torch', mouth: 'open' },
  unit_armored_guard: { head: 'human', hat: 'greathelm', plume: '#4a8cff', body: PAL.steelD, armor: PAL.steel, legs: '#6c7682', weapon: 'mace', shield: 'tower', shieldColor: '#2f5fae' },
  unit_crossbowman: { head: 'human', hair: '#2e2018', hat: 'cap', hatColor: '#7a4f2c', body: '#35609f', legs: ALLY_LEGS, belt: PAL.leather, weapon: 'crossbow', mouth: 'grim' },
  hero_arthur: { head: 'human', hair: '#d8b25e', beard: '#d8b25e', hat: 'crown', body: '#c9a227', armor: '#f1cf5a', legs: '#6c5a2a', cape: '#c0392b', trim: PAL.red, weapon: 'sword' },
  hero_wiseman: { head: 'human', hair: '#f2f2f2', beard: '#f4f4f4', hat: 'bald', body: '#7d6aa8', legs: '#7d6aa8', robe: true, trim: PAL.gold, weapon: 'orbstaff', orb: '#8fd8ff' },
  hero_henry: { head: 'human', hair: '#c0392b', beard: '#c0392b', body: '#a52a2a', armor: PAL.steel, legs: '#5a3a2a', cape: '#7a1e1e', trim: PAL.gold, weapon: 'axe' },
  enemy_skeleton: { head: 'skull', bones: true, body: PAL.bone, legs: PAL.bone, weapon: 'sword', weaponColor: '#a59a88' },
  enemy_skeleton_helm: { head: 'skull', bones: true, body: PAL.bone, legs: PAL.bone, hat: 'helm', weapon: 'sword', weaponColor: '#a59a88' },
  enemy_skeleton_shield: { head: 'skull', bones: true, body: PAL.bone, legs: PAL.bone, weapon: 'sword', weaponColor: '#a59a88', shield: 'round', shieldFront: true, shieldColor: '#7a5230' },
  enemy_skeleton_spear: { head: 'skull', bones: true, body: PAL.bone, legs: PAL.bone, hat: 'cap', hatColor: '#8a8478', weapon: 'spear', weaponColor: '#6e5a3e' },
  enemy_skeleton_wizard: { head: 'skull', bones: true, body: '#5b2f86', legs: '#5b2f86', robe: true, hat: 'wizard', hatColor: '#5b2f86', weapon: 'staff', orb: '#7dff7a', eye: '#7dff7a', trim: '#b88cff' },
  enemy_deadite_archer: { head: 'ghoul', body: '#5d5340', legs: '#3f3a2e', belt: '#2a2018', weapon: 'bow', weaponColor: '#6b4a2a' },
  enemy_winged_deadite: { head: 'ghoul', skin: '#86a070', body: '#4e5a3e', legs: PAL.ghoulD, wings: '#4a3f5a', weapon: 'claws', floating: true },
  enemy_pit_hag: { head: 'hag', body: '#4a5a3a', legs: '#4a5a3a', robe: true, weapon: 'claws', hunch: 0.18 },
  enemy_skeleton_knight: { head: 'skull', hat: 'hornhelm', body: '#4a4452', armor: '#5c5668', legs: '#3c3644', boots: '#2a2430', weapon: 'greatsword' },
  boss_evil_ash: { head: 'human', skin: '#9fae94', hair: '#140c0c', hat: 'pompadour', body: '#2a2633', legs: '#3a2e2a', boots: '#1a1418', belt: '#120e10', weapon: 'shotgun', eye: PAL.eyeRed, mouth: 'evil' },
};

export type SizeClass = 'small' | 'normal' | 'large' | 'huge';
export const SIZE_PX: Record<SizeClass, [number, number]> = {
  small: [58, 78],
  normal: [68, 94],
  large: [112, 122],
  huge: [224, 256],
};

/** Hue-varied generic spec for a sprite key we have no art for. */
export function genericSpec(role: 'ally' | 'hero' | 'enemy' | 'flyer' | 'boss', key: string): CharSpec {
  const h = hashKey(key);
  const hue = h % 360;
  switch (role) {
    case 'ally':
      return { head: 'human', hair: hsl((h >> 3) % 40 + 10, 0.5, 0.25), hat: (['cap', 'kettle', 'none'] as const)[h % 3], body: hsl(200 + (h % 40), 0.55, 0.5), legs: ALLY_LEGS, belt: PAL.leather, weapon: (['sword', 'spear', 'axe'] as const)[(h >> 2) % 3] };
    case 'hero':
      return { head: 'human', hair: hsl(hue, 0.4, 0.4), hat: 'crown', body: hsl(40 + (h % 20), 0.7, 0.5), armor: PAL.gold, legs: ALLY_LEGS, cape: hsl(hue, 0.6, 0.4), trim: PAL.gold, weapon: (['sword', 'axe', 'orbstaff'] as const)[h % 3] };
    case 'flyer':
      return { head: 'ghoul', body: hsl(hue, 0.25, 0.35), legs: PAL.ghoulD, wings: hsl(hue, 0.3, 0.3), weapon: 'claws', floating: true };
    case 'boss':
      return { head: 'demon', skin: hsl(hue, 0.5, 0.55), body: hsl(hue, 0.4, 0.2), legs: hsl(hue, 0.4, 0.2), robe: true, weapon: 'claws', eye: PAL.eyeYellow };
    default:
      return { head: 'skull', bones: true, body: PAL.bone, legs: PAL.bone, hat: (['none', 'helm', 'cap'] as const)[h % 3], weapon: (['sword', 'spear', 'axe'] as const)[(h >> 2) % 3], eye: hsl(hue, 0.9, 0.6) };
  }
}
