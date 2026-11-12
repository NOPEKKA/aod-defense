/**
 * Keyboard bindings (SPEC §2). Keys are matched by `KeyboardEvent.code` (the
 * physical key), so they keep working when the OS keyboard layout is Thai:
 * the "A" key reports code 'KeyA' even though it types 'ฟ'.
 */

export type KeyAction = 'left' | 'right' | 'summon' | 'spell' | 'dodge' | 'pause' | 'escape' | 'speed' | 'smith' | 'rally';

export interface KeyBinding {
  readonly action: KeyAction;
  /** summon slot / spell slot for 'summon' and 'spell', 0 otherwise */
  readonly index: number;
}

const bind = (action: KeyAction, index = 0): KeyBinding => ({ action, index });

function buildBindings(): ReadonlyMap<string, KeyBinding> {
  const m = new Map<string, KeyBinding>([
    ['KeyA', bind('left')],
    ['ArrowLeft', bind('left')],
    ['KeyD', bind('right')],
    ['ArrowRight', bind('right')],
    ['KeyQ', bind('spell', 0)],
    ['KeyE', bind('spell', 1)],
    ['KeyR', bind('spell', 2)],
    ['Space', bind('dodge')],
    ['KeyP', bind('pause')],
    ['Escape', bind('escape')],
    ['KeyF', bind('speed')],
    ['KeyB', bind('smith')],
    ['KeyG', bind('rally')],
  ]);
  for (let i = 0; i < 8; i++) {
    m.set(`Digit${i + 1}`, bind('summon', i));
    // [เดา] numpad 1–8 also summon; SPEC only says "1–8"
    m.set(`Numpad${i + 1}`, bind('summon', i));
  }
  return m;
}

export const KEY_BINDINGS = buildBindings();

/** Keys whose browser default (page scroll, button activation) is suppressed. */
export const SCROLL_KEYS: ReadonlySet<string> = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
