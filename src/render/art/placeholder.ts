/**
 * Neutral placeholder silhouettes for sprites that are not baked (or not loaded) yet.
 * Chunky big-head figures at the ART_BIBLE size classes, dark slate with a team-coloured
 * rim, so a missing atlas reads as "a soldier / a deadite goes here" without pretending
 * to be finished art. The world renderer animates them procedurally (bob, lunge, fall).
 */
import type { ArtItem } from './atlas';
import { radial, type Ctx } from './kit';

export type PlaceholderRole = 'ally' | 'hero' | 'enemy' | 'flyer' | 'boss';

/** logical heights per size class (ART_BIBLE section 2) */
export const PH_HEIGHT = { small: 140, normal: 165, large: 195, huge: 330 } as const;
export type PhSize = keyof typeof PH_HEIGHT;

const RIM: Record<PlaceholderRole, string> = {
  ally: '#7fb0ff',
  hero: '#f0c040',
  enemy: '#d8ff3a',
  flyer: '#d8ff3a',
  boss: '#b05cff',
};
const BODY: Record<PlaceholderRole, [string, string]> = {
  ally: ['#3a4660', '#1c2232'],
  hero: ['#4a4636', '#22201a'],
  enemy: ['#4a4440', '#201c1c'],
  flyer: ['#3e3a44', '#1a1820'],
  boss: ['#3a2a48', '#160e1e'],
};

export function placeholderKey(role: PlaceholderRole, size: PhSize): string {
  return `ph_${role}_${size}`;
}

function blob(ctx: Ctx, path: () => void, fill: CanvasGradient | string, rim: string, lw: number): void {
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = '#120c18';
  ctx.stroke();
  // rim light on the right (the side the figure faces)
  ctx.save();
  path();
  ctx.clip();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = lw * 2.2;
  ctx.strokeStyle = rim;
  ctx.translate(-lw * 1.1, 0);
  path();
  ctx.stroke();
  ctx.restore();
}

function drawFigure(ctx: Ctx, w: number, h: number, role: PlaceholderRole): void {
  const cx = w / 2;
  const foot = h * 0.97;
  const H = h * 0.93;
  const lw = Math.max(2, h / 70);
  const [c0, c1] = BODY[role];
  const rim = RIM[role];
  const fill = radial(ctx, cx + H * 0.12, foot - H * 0.75, H * 0.9, [[0, c0], [1, c1]]);
  // ground contact shadow is drawn by the game; here just the figure
  if (role === 'flyer' || role === 'boss') {
    // bat wings
    const wy = foot - H * 0.62;
    const span = role === 'boss' ? w * 0.5 : w * 0.48;
    for (const s of [-1, 1]) {
      blob(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(cx, wy);
          ctx.quadraticCurveTo(cx + s * span * 0.6, wy - H * 0.32, cx + s * span, wy - H * 0.18);
          ctx.lineTo(cx + s * span * 0.78, wy + H * 0.02);
          ctx.lineTo(cx + s * span * 0.6, wy - H * 0.04);
          ctx.lineTo(cx + s * span * 0.42, wy + H * 0.08);
          ctx.closePath();
        },
        '#241c2a',
        rim,
        lw,
      );
    }
  }
  if (role === 'boss') {
    ctx.beginPath();
    ctx.arc(cx, foot - H * 0.5, H * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = radial(ctx, cx, foot - H * 0.5, H * 0.5, [[0, 'rgba(176,92,255,0.25)'], [1, 'rgba(176,92,255,0)']]);
    ctx.fill();
  }
  // legs
  for (const s of [-1, 1]) {
    blob(ctx, () => {
      ctx.beginPath();
      ctx.roundRect(cx + s * H * 0.08 - H * 0.055, foot - H * 0.26, H * 0.11, H * 0.26, H * 0.04);
    }, fill, rim, lw);
  }
  // body
  blob(ctx, () => {
    ctx.beginPath();
    ctx.roundRect(cx - H * 0.17, foot - H * 0.58, H * 0.34, H * 0.36, H * 0.1);
  }, fill, rim, lw);
  // arms
  for (const s of [-1, 1]) {
    blob(ctx, () => {
      ctx.beginPath();
      ctx.roundRect(cx + s * H * 0.2 - H * 0.05, foot - H * 0.55, H * 0.1, H * 0.26, H * 0.05);
    }, fill, rim, lw);
  }
  // head (big, KayKit proportions)
  const hr = H * 0.21;
  const hy = foot - H * 0.58 - hr * 0.82;
  blob(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(cx, hy, hr * 1.05, hr, 0, 0, Math.PI * 2);
  }, fill, rim, lw);
  if (role === 'boss') {
    for (const s of [-1, 1]) {
      blob(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(cx + s * hr * 0.5, hy - hr * 0.7);
        ctx.quadraticCurveTo(cx + s * hr * 1.2, hy - hr * 1.3, cx + s * hr * 0.9, hy - hr * 1.9);
        ctx.quadraticCurveTo(cx + s * hr * 0.8, hy - hr * 1.2, cx + s * hr * 0.15, hy - hr * 0.85);
        ctx.closePath();
      }, '#2a1c30', rim, lw);
    }
  }
  // eyes: team read at a glance
  const eye = role === 'ally' || role === 'hero' ? '#e8f0ff' : rim;
  ctx.fillStyle = eye;
  ctx.globalAlpha = 0.9;
  for (const dx of [0.18, 0.55]) {
    ctx.beginPath();
    ctx.ellipse(cx + hr * dx, hy + hr * 0.05, hr * 0.11, hr * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // team sash
  ctx.fillStyle = role === 'enemy' || role === 'flyer' ? '#6b2a2a' : role === 'boss' ? '#4a2a5a' : role === 'hero' ? '#c89a2a' : '#3a6cc8';
  ctx.globalAlpha = 0.85;
  ctx.fillRect(cx - H * 0.17, foot - H * 0.4, H * 0.34, H * 0.05);
  ctx.globalAlpha = 1;
}

/** Atlas items for every role x size (the atlas builder draws them once at boot). */
export function placeholderItems(): ArtItem[] {
  const out: ArtItem[] = [];
  const roles: PlaceholderRole[] = ['ally', 'hero', 'enemy', 'flyer', 'boss'];
  for (const role of roles) {
    for (const size of Object.keys(PH_HEIGHT) as PhSize[]) {
      if (role === 'boss' && size !== 'huge' && size !== 'large') continue;
      const h = PH_HEIGHT[size];
      const w = Math.round(h * (role === 'flyer' || role === 'boss' ? 0.95 : 0.62));
      out.push({ key: placeholderKey(role, size), w, h, ax: 0.5, ay: 0.97, draw: (ctx, ww, hh) => drawFigure(ctx, ww, hh, role) });
    }
  }
  return out;
}
