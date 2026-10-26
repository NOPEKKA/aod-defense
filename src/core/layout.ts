import { VIEW_H, type HudLayout, type Rect } from '../contracts';

export interface SafeInsets { top: number; right: number; bottom: number; left: number }

/** Reads CSS env(safe-area-inset-*) in CSS px, converted to logical view px. */
export function readSafeInsets(viewW: number): SafeInsets {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const toLogical = viewW / Math.max(1, window.innerWidth);
  const insets = {
    top: (parseFloat(cs.paddingTop) || 0) * toLogical,
    right: (parseFloat(cs.paddingRight) || 0) * toLogical,
    bottom: (parseFloat(cs.paddingBottom) || 0) * toLogical,
    left: (parseFloat(cs.paddingLeft) || 0) * toLogical,
  };
  probe.remove();
  return insets;
}

const L = {
  margin: 16,
  topH: 64,
  barW: 280,
  barH: 18,
  waveW: 360,
  minimapW: 520,
  topButton: 60,
  bottomH: 112,
  ironW: 120,
  slotW: 84,
  slotH: 96,
  slotGap: 8,
  slotCount: 8,
  spellD: 96,
  spellGap: 12,
  spellCount: 3,
  dodgeD: 88,
  cancelD: 64,
} as const;

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** Single source of truth for HUD hit areas (controls) and drawing positions (render). */
export function computeHudLayout(viewW: number, insets: SafeInsets): HudLayout {
  const H = VIEW_H;
  const left = L.margin + insets.left;
  const right = viewW - L.margin - insets.right;
  const top = 8 + insets.top;
  const bottomY = H - L.bottomH - insets.bottom; // top edge of the bottom bar

  const pauseButton = rect(right - L.topButton, top, L.topButton, L.topButton - 8);
  const speedButton = rect(pauseButton.x - 8 - L.topButton, top, L.topButton, L.topButton - 8);
  const goldLabel = rect(speedButton.x - 12 - 140, top, 140, L.topButton - 8);

  const ironPanel = rect(left, bottomY + 8, L.ironW, L.slotH);
  const unitSlots: Rect[] = [];
  for (let i = 0; i < L.slotCount; i++) {
    unitSlots.push(rect(ironPanel.x + L.ironW + 12 + i * (L.slotW + L.slotGap), bottomY + 8, L.slotW, L.slotH));
  }

  const spellButtons: Rect[] = [];
  for (let i = 0; i < L.spellCount; i++) {
    const x = right - (L.spellCount - i) * L.spellD - (L.spellCount - 1 - i) * L.spellGap;
    spellButtons.push(rect(x, bottomY + 8, L.spellD, L.spellD));
  }

  const dodgeButton = rect(right - L.dodgeD, bottomY - L.dodgeD - 12, L.dodgeD, L.dodgeD);
  const cancelAimButton = rect(spellButtons[1].x + (L.spellD - L.cancelD) / 2, bottomY - L.cancelD - 12, L.cancelD, L.cancelD);

  const zoneTop = L.topH + insets.top + 8;
  const zoneBottom = dodgeButton.y - 8;
  const half = viewW / 2;

  return {
    viewW,
    viewH: H,
    topBar: rect(0, 0, viewW, L.topH + insets.top),
    ashBar: rect(left, top + 4, L.barW, L.barH),
    bookBar: rect(left, top + 4 + L.barH + 8, L.barW, L.barH),
    waveBar: rect((viewW - L.waveW) / 2, top + 4, L.waveW, 20),
    minimap: rect((viewW - L.minimapW) / 2, top + 32, L.minimapW, 10),
    goldLabel,
    speedButton,
    pauseButton,
    ironPanel,
    unitSlots,
    spellButtons,
    dodgeButton,
    cancelAimButton,
    moveZoneLeft: rect(0, zoneTop, half, zoneBottom - zoneTop),
    moveZoneRight: rect(half, zoneTop, half, zoneBottom - zoneTop),
  };
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}
