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

/**
 * HUD v2, arranged like the original game:
 *   top-left    Ash portrait, HP bar, book bar; pause button under the portrait
 *   top-centre  wave progress bar (skull markers), thin minimap under it
 *   top-right   gold, speed button
 *   bottom-left blacksmith panel (tap = upgrade), then the unit buttons; rally banner above the panel
 *   bottom-right spell buttons; dodge button above them
 */
const L = {
  margin: 16,
  topH: 64,
  portrait: 76,
  barW: 260,
  barH: 24,
  bookW: 220,
  bookH: 16,
  pauseW: 96,
  pauseH: 84,
  waveW: 420,
  waveH: 26,
  minimapH: 8,
  goldW: 150,
  speedW: 88,
  topButtonH: 84,
  bottomH: 116,
  ironW: 132,
  slotW: 88,
  slotH: 100,
  slotGap: 6,
  slotCount: 8,
  spellD: 100,
  spellGap: 10,
  spellCount: 3,
  dodgeD: 84,
  rallyD: 84,
  cancelD: 84,
} as const;

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** Single source of truth for HUD hit areas (controls) and drawing positions (render). */
export function computeHudLayout(viewW: number, insets: SafeInsets): HudLayout {
  const H = VIEW_H;
  const left = L.margin + insets.left;
  const right = viewW - L.margin - insets.right;
  const top = 8 + insets.top;
  const bottomY = H - L.bottomH - insets.bottom; // top edge of the bottom bar

  const ashPortrait = rect(left, top, L.portrait, L.portrait);
  const barX = left + L.portrait + 10;
  const pauseButton = rect(left, top + L.portrait + 8, L.pauseW, L.pauseH);
  const goldLabel = rect(right - L.goldW, top, L.goldW, L.topButtonH);
  const speedButton = rect(goldLabel.x - 10 - L.speedW, top, L.speedW, L.topButtonH);

  const ironPanel = rect(left, bottomY + 8, L.ironW, L.slotH);
  const unitSlots: Rect[] = [];
  for (let i = 0; i < L.slotCount; i++) {
    unitSlots.push(rect(ironPanel.x + L.ironW + 10 + i * (L.slotW + L.slotGap), bottomY + 8, L.slotW, L.slotH));
  }
  const rallyButton = rect(left, bottomY - L.rallyD - 10, L.rallyD, L.rallyD);

  const spellButtons: Rect[] = [];
  for (let i = 0; i < L.spellCount; i++) {
    const x = right - (L.spellCount - i) * L.spellD - (L.spellCount - 1 - i) * L.spellGap;
    spellButtons.push(rect(x, bottomY + 8, L.spellD, L.spellD));
  }

  const dodgeButton = rect(right - L.dodgeD, bottomY - L.dodgeD - 10, L.dodgeD, L.dodgeD);
  const cancelAimButton = rect(spellButtons[1].x + (L.spellD - L.cancelD) / 2, bottomY - L.cancelD - 10, L.cancelD, L.cancelD);

  // move zones cover the playfield; controls test the buttons first, so overlaps with
  // the rally / dodge / cancel buttons are fine
  const zoneTop = pauseButton.y + pauseButton.h + 6;
  const zoneBottom = bottomY - 4;
  const half = viewW / 2;

  return {
    viewW,
    viewH: H,
    topBar: rect(0, 0, viewW, L.topH + insets.top),
    ashPortrait,
    ashBar: rect(barX, top + 6, L.barW, L.barH),
    bookBar: rect(barX, top + 6 + L.barH + 8, L.bookW, L.bookH),
    waveBar: rect((viewW - L.waveW) / 2, top + 6, L.waveW, L.waveH),
    minimap: rect((viewW - L.waveW) / 2, top + 6 + L.waveH + 8, L.waveW, L.minimapH),
    goldLabel,
    speedButton,
    pauseButton,
    ironPanel,
    rallyButton,
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
