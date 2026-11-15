/**
 * The battle InputSource: keyboard, mouse and multi-touch -> InputFrame + ui:* events.
 *
 * Model
 * - `move` is level-triggered: the most recently pressed source that is still held
 *   wins (A/D/←/→ keys and move-zone pointers share one press order).
 * - Every other action is edge-triggered: it is queued as a SimCommand when the
 *   key/button goes down and drained by poll() exactly once. Key auto-repeat is ignored.
 * - Each pointer (mouse = id 0, touches = 1..n) is classified once, when it goes down:
 *     BUTTON  went down on an active HUD button; never moves Ash
 *     MOVE    went down in a move zone; steers by the half it is over until released
 *     AIM     went down on the field while a 'point' spell is being aimed; drags the
 *             preview and casts at the release point
 *     BLOCKED anything else (dead HUD space, pressed while paused, ...)
 *   so one finger can walk while another taps slots and spells.
 * - Nothing is pre-validated beyond "the slot exists": gameplay checks iron, mana and
 *   cooldowns and emits summon:denied / spell:denied.
 *
 * poll() returns the same InputFrame object every tick and alternates between two
 * command arrays, so polling allocates nothing. Copy a frame if you need to keep it.
 * The `ui:aim` payload is the live `aim` object (same as InputSource.aim).
 */
import type {
  AimState,
  CoordHelpers,
  EventBus,
  GameEvents,
  HudLayout,
  InputFrame,
  InputSource,
  SimCommand,
  Unsubscribe,
  WorldState,
} from '../contracts';
import { inRect } from '../core/layout';
import { findEntity } from '../core/world';
import { KEY_BINDINGS, SCROLL_KEYS, type KeyBinding } from './keymap';

type ButtonKind = GameEvents['ui:button']['button'];
type Dir = -1 | 0 | 1;
type Pointer = Phaser.Input.Pointer;

const TUNING = {
  /** pointer ids handled (Phaser: mouse = 0, touches 1..10) */
  maxPointers: 12,
  /** commands kept while nothing polls (e.g. after the wave ended) [เดา] */
  maxQueued: 32,
  /** touch swipe-up on a move finger = dodge (SPEC §2 "ปัดขึ้น") [เดา] thresholds */
  swipeMinDy: 70,
  swipeMaxMs: 300,
  swipeRatio: 1.5,
} as const;

const P_NONE = 0;
const P_BUTTON = 1;
const P_MOVE = 2;
const P_AIM = 3;
const P_BLOCKED = 4;
type PointerMode = typeof P_NONE | typeof P_BUTTON | typeof P_MOVE | typeof P_AIM | typeof P_BLOCKED;

interface PointerSlot {
  mode: PointerMode;
  pointer: Pointer | null;
  touch: boolean;
  /** MOVE: press order, for "last pressed wins" */
  seq: number;
  /** MOVE: half of the screen the pointer is over now */
  dir: -1 | 1;
  /** BUTTON: which button went down (for the matching ui:button release) */
  btn: ButtonKind;
  btnIndex: number;
  /** swipe-up detection */
  downX: number;
  downY: number;
  downAt: number;
  swiped: boolean;
}

interface KeySlot {
  readonly binding: KeyBinding;
  down: boolean;
  /** left/right: press order */
  seq: number;
  /** HUD button this key press lit up, or null */
  btn: ButtonKind | null;
  btnIndex: number;
}

function isTextTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

export function createInputSource(): InputSource {
  const aim: AimState = { slot: null, worldX: null };

  // double-buffered command queue: poll() hands one array out and refills the other
  const bufA: SimCommand[] = [];
  const bufB: SimCommand[] = [];
  let pending = bufA;
  const frame: InputFrame = { move: 0, commands: bufB };

  const keys = new Map<string, KeySlot>();
  const moveKeys: KeySlot[] = [];
  for (const [code, binding] of KEY_BINDINGS) {
    const k: KeySlot = { binding, down: false, seq: 0, btn: null, btnIndex: 0 };
    keys.set(code, k);
    if (binding.action === 'left' || binding.action === 'right') moveKeys.push(k);
  }
  const keyList = [...keys.values()];

  const ptrs: PointerSlot[] = [];
  for (let i = 0; i < TUNING.maxPointers; i++) {
    ptrs.push({ mode: P_NONE, pointer: null, touch: false, seq: 0, dir: 1, btn: 'unit', btnIndex: 0, downX: 0, downY: 0, downAt: 0, swiped: false });
  }

  let attached = false;
  let scene: Phaser.Scene | null = null;
  let layout: HudLayout | null = null;
  let world: Readonly<WorldState> | null = null;
  let bus: EventBus | null = null;
  let coords: CoordHelpers | null = null;
  let unsubs: Unsubscribe[] = [];

  /** mirrors of runner state; updated from the bus so render's menus can change them too */
  let paused = false;
  let speed: 1 | 2 = 1;
  let pressSeq = 0;
  let emittingPause = false;
  /** performance.now() of the last ui:pause emitted by someone else */
  let lastExternalPauseAt = -Infinity;

  /** last mouse position in view px, and whether it is over the field */
  let mouseViewX = 0;
  let mouseOverField = false;
  /** view x the aim preview follows (NaN = none yet); re-projected every tick as the camera scrolls */
  let aimViewX = NaN;

  /** scratch out-param of hitTest (avoids allocating a result object) */
  let hitIndex = 0;

  // ---------------------------------------------------------------- helpers

  const emitButton = (button: ButtonKind, index: number, down: boolean): void => {
    bus?.emit('ui:button', { button, index, down });
  };

  const setAim = (slot: number | null, worldX: number | null): void => {
    if (aim.slot === slot && aim.worldX === worldX) return;
    aim.slot = slot;
    aim.worldX = worldX;
    bus?.emit('ui:aim', aim);
  };

  const cancelAim = (): void => {
    aimViewX = NaN;
    setAim(null, null);
  };

  const aimAtView = (viewX: number): void => {
    if (!coords || aim.slot === null) return;
    aimViewX = viewX;
    setAim(aim.slot, coords.toWorldX(viewX));
  };

  const inField = (x: number, y: number): boolean => {
    if (!layout || !(inRect(layout.moveZoneLeft, x, y) || inRect(layout.moveZoneRight, x, y))) return false;
    // buttons win over the move zones where they overlap (rally, dodge, cancel-aim)
    if (inRect(layout.rallyButton, x, y) || (!!world?.dodge.unlocked && inRect(layout.dodgeButton, x, y))) return false;
    return !(aim.slot !== null && inRect(layout.cancelAimButton, x, y));
  };

  const halfOf = (x: number): -1 | 1 => (layout && x < layout.moveZoneRight.x ? -1 : 1);

  /** spectacle:action at Ash (or at the cast target x) in world coordinates [เดา: render wants world coords] */
  const spectacle = (action: 'summon' | 'cast' | 'dodge', x?: number): void => {
    if (!bus || !world) return;
    const ash = findEntity(world as WorldState, world.ashId);
    bus.emit('spectacle:action', { action, x: x ?? ash?.x ?? 0, y: ash?.y ?? 0 });
  };

  const queue = (cmd: SimCommand): void => {
    if (pending.length < TUNING.maxQueued) pending.push(cmd);
  };

  /** may player actions (summon/cast/dodge/aim/speed) happen right now? */
  const canAct = (): boolean => attached && !paused && !!world && !world.outcome;

  // ---------------------------------------------------------------- actions

  const pressSummon = (i: number): boolean => {
    if (!canAct()) return false;
    const slot = world!.summonSlots[i];
    if (!slot || !slot.unitId) return false; // empty slot: nothing to send
    queue({ type: 'summon', slot: i });
    spectacle('summon');
    return true;
  };

  const cast = (i: number, target: { x: number } | 'auto'): void => {
    queue({ type: 'cast', slot: i, target });
    spectacle('cast', target === 'auto' ? undefined : target.x);
  };

  const pressSpell = (i: number): boolean => {
    if (!canAct()) return false;
    const slot = world!.spellSlots[i];
    if (!slot || !slot.spellId) return false;
    if (slot.targeting !== 'point') {
      // 'line' fires where Ash faces, 'none' is instant: gameplay resolves both
      cast(i, 'auto');
      return true;
    }
    if (aim.slot === i) {
      // second press of the same spell while aiming = auto-target (SPEC §2 double press)
      cancelAim();
      cast(i, 'auto');
      return true;
    }
    // enter aim, or switch to this spell keeping the current preview position
    if (aimViewX !== aimViewX && mouseOverField) aimViewX = mouseViewX;
    setAim(i, aimViewX === aimViewX && coords ? coords.toWorldX(aimViewX) : null);
    return true;
  };

  /** blacksmith upgrade (B / tap the panel): gameplay-free, systems validate iron and level */
  const pressSmith = (): boolean => {
    if (!canAct()) return false;
    queue({ type: 'smith' });
    return true;
  };

  /** army stance toggle (G / tap the banner), handled by gameplay */
  const pressRally = (): boolean => {
    if (!canAct()) return false;
    queue({ type: 'rally' });
    return true;
  };

  const pressDodge = (): boolean => {
    if (!canAct() || !world!.dodge.unlocked) return false;
    queue({ type: 'dodge' });
    spectacle('dodge');
    return true;
  };

  /**
   * `inputTime` is the DOM event timeStamp. If another listener already toggled pause
   * for this very event (e.g. a pause menu that also binds Esc), don't toggle it back.
   */
  const togglePause = (inputTime: number): boolean => {
    if (!attached || !bus) return false;
    if (lastExternalPauseAt >= inputTime) return false;
    emittingPause = true;
    try {
      bus.emit('ui:pause', { paused: !paused });
    } finally {
      emittingPause = false;
    }
    return true;
  };

  const toggleSpeed = (): boolean => {
    if (!attached || !bus || paused) return false;
    bus.emit('ui:speed', { speed: speed === 1 ? 2 : 1 });
    return true;
  };

  // ---------------------------------------------------------------- release

  const releaseKey = (k: KeySlot, emit: boolean): void => {
    k.down = false;
    k.seq = 0;
    if (k.btn !== null) {
      const b = k.btn;
      k.btn = null;
      if (emit) emitButton(b, k.btnIndex, false);
    }
  };

  const releasePointer = (s: PointerSlot, emit: boolean): void => {
    if (s.mode === P_BUTTON && emit) emitButton(s.btn, s.btnIndex, false);
    s.mode = P_NONE;
    s.pointer = null;
    s.seq = 0;
    s.swiped = false;
  };

  const releaseAll = (emit: boolean): void => {
    for (const k of keyList) if (k.down) releaseKey(k, emit);
    for (const s of ptrs) if (s.mode !== P_NONE) releasePointer(s, emit);
  };

  // ---------------------------------------------------------------- keyboard

  const onKeyDown = (e: KeyboardEvent): void => {
    const k = keys.get(e.code);
    if (!k || !attached || isTextTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Battle paused/asleep at the Phaser level (an overlay owns input): ignore presses
    if (scene && !scene.sys.canInput()) return;
    if (SCROLL_KEYS.has(e.code)) e.preventDefault();

    const b = k.binding;
    if (b.action === 'left' || b.action === 'right') {
      // level-triggered: a repeat also (re)registers a key held across a restart/blur
      if (!k.down && !paused) {
        k.down = true;
        k.seq = ++pressSeq;
      }
      return;
    }
    if (e.repeat || k.down) return; // edge-triggered: ignore auto-repeat
    k.down = true;

    let btn: ButtonKind | null = null;
    switch (b.action) {
      case 'summon':
        if (pressSummon(b.index)) btn = 'unit';
        break;
      case 'spell':
        if (pressSpell(b.index)) btn = 'spell';
        break;
      case 'dodge':
        if (pressDodge()) btn = 'dodge';
        break;
      case 'pause':
        if (togglePause(e.timeStamp)) btn = 'pause';
        break;
      case 'escape':
        if (aim.slot !== null && !paused) {
          cancelAim();
          btn = 'cancel';
        } else if (togglePause(e.timeStamp)) {
          btn = 'pause';
        }
        break;
      case 'speed':
        if (toggleSpeed()) btn = 'speed';
        break;
      case 'smith':
        if (pressSmith()) btn = 'smith';
        break;
      case 'rally':
        if (pressRally()) btn = 'rally';
        break;
    }
    k.btn = btn;
    k.btnIndex = b.index;
    if (btn !== null) emitButton(btn, b.index, true);
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    const k = keys.get(e.code);
    if (k && k.down) releaseKey(k, true); // releases are always honoured, even while paused
  };

  // ---------------------------------------------------------------- pointer

  const slotOf = (p: Pointer): PointerSlot | null => (p.id >= 0 && p.id < ptrs.length ? ptrs[p.id] : null);

  /** active HUD button under (x, y), index in `hitIndex`; null = none */
  const hitTest = (x: number, y: number): ButtonKind | null => {
    const L = layout!;
    const w = world!;
    hitIndex = 0;
    if (inRect(L.pauseButton, x, y)) return 'pause';
    if (inRect(L.speedButton, x, y)) return 'speed';
    if (aim.slot !== null && inRect(L.cancelAimButton, x, y)) return 'cancel';
    const nu = Math.min(w.summonSlots.length, L.unitSlots.length);
    for (let i = 0; i < nu; i++) {
      if (inRect(L.unitSlots[i], x, y)) {
        hitIndex = i;
        return 'unit';
      }
    }
    const ns = Math.min(w.spellSlots.length, L.spellButtons.length);
    for (let i = 0; i < ns; i++) {
      if (inRect(L.spellButtons[i], x, y)) {
        hitIndex = i;
        return 'spell';
      }
    }
    if (w.dodge.unlocked && inRect(L.dodgeButton, x, y)) return 'dodge';
    if (inRect(L.rallyButton, x, y)) return 'rally';
    if (inRect(L.ironPanel, x, y)) return 'smith';
    return null;
  };

  const isRightClick = (p: Pointer): boolean =>
    p.button === 2 || (p.button === 0 && p.rightButtonDown() && !p.leftButtonDown()); // macOS ctrl-click

  const onPointerDown = (p: Pointer): void => {
    if (!attached || !layout || !coords || !world) return;
    const s = slotOf(p);
    if (!s) return;
    if (!p.wasTouch) {
      if (isRightClick(p)) {
        if (aim.slot !== null) cancelAim(); // right-click = cancel aim
        return;
      }
      if (p.button !== 0) return;
    }
    if (s.mode !== P_NONE) releasePointer(s, true); // missed release (should not happen)

    const v = coords.toView(p);
    s.pointer = p;
    s.touch = p.wasTouch;
    s.downX = v.x;
    s.downY = v.y;
    s.downAt = performance.now();
    s.swiped = false;
    const inputTime = p.event ? p.event.timeStamp : performance.now();

    const btn = hitTest(v.x, v.y);
    const idx = hitIndex;
    if (paused) {
      // only the pause button works while paused
      if (btn === 'pause' && togglePause(inputTime)) {
        s.mode = P_BUTTON;
        s.btn = 'pause';
        s.btnIndex = 0;
        emitButton('pause', 0, true);
      } else {
        s.mode = P_BLOCKED;
      }
      return;
    }

    if (btn !== null) {
      let ok = false;
      switch (btn) {
        case 'pause':
          ok = togglePause(inputTime);
          break;
        case 'speed':
          ok = toggleSpeed();
          break;
        case 'cancel':
          cancelAim();
          ok = true;
          break;
        case 'unit':
          ok = pressSummon(idx);
          break;
        case 'spell':
          ok = pressSpell(idx);
          break;
        case 'dodge':
          ok = pressDodge();
          break;
        case 'smith':
          ok = pressSmith();
          break;
        case 'rally':
          ok = pressRally();
          break;
      }
      // a pointer that went down on a button never moves Ash, even if the press did nothing
      if (ok) {
        s.mode = P_BUTTON;
        s.btn = btn;
        s.btnIndex = idx;
        emitButton(btn, idx, true);
      } else {
        s.mode = P_BLOCKED;
      }
      return;
    }

    if (world.outcome || !inField(v.x, v.y)) {
      s.mode = P_BLOCKED;
      return;
    }
    if (aim.slot !== null) {
      s.mode = P_AIM;
      aimAtView(v.x);
      return;
    }
    s.mode = P_MOVE;
    s.seq = ++pressSeq;
    s.dir = halfOf(v.x);
  };

  const onPointerMove = (p: Pointer): void => {
    if (!attached || !coords || !world) return;
    const v = coords.toView(p);
    if (!p.wasTouch) {
      mouseViewX = v.x;
      mouseOverField = inField(v.x, v.y);
    }
    const s = slotOf(p);
    const mode = s ? s.mode : P_NONE;
    if (mode === P_AIM) {
      aimAtView(v.x); // a finger dragging the preview follows x anywhere
      return;
    }
    if (mode === P_MOVE) {
      s!.dir = halfOf(v.x);
      if (s!.touch && !s!.swiped && !paused && world.dodge.unlocked) {
        const dy = s!.downY - v.y;
        const dx = Math.abs(v.x - s!.downX);
        if (dy >= TUNING.swipeMinDy && dy >= dx * TUNING.swipeRatio && performance.now() - s!.downAt <= TUNING.swipeMaxMs) {
          s!.swiped = true;
          pressDodge();
        }
      }
      return;
    }
    // mouse hovering over the field moves the preview [เดา: hovering the HUD keeps the last spot]
    if (mode === P_NONE && !p.wasTouch && !paused && aim.slot !== null && mouseOverField) aimAtView(v.x);
  };

  const onPointerUp = (p: Pointer): void => {
    const s = slotOf(p);
    if (!s || s.mode === P_NONE) return;
    if (!p.wasTouch && p.button !== 0) return; // right/middle released while left is still held
    if (s.mode === P_AIM && coords && layout && aim.slot !== null && !paused && world && !world.outcome) {
      const v = coords.toView(p);
      if (inRect(layout.cancelAimButton, v.x, v.y)) {
        cancelAim(); // [เดา] dragging the preview onto × and letting go cancels
      } else {
        aimAtView(v.x);
        const slot = aim.slot;
        const x = aim.worldX ?? coords.toWorldX(v.x);
        cancelAim();
        cast(slot, { x });
      }
    }
    releasePointer(s, true);
  };

  const onGameOut = (): void => {
    mouseOverField = false;
  };

  /** drop pointers whose release we never saw (lost touchend, released during a blur) */
  const sweepPointers = (): void => {
    for (const s of ptrs) {
      if (s.mode === P_NONE || !s.pointer) continue;
      const held = s.touch ? s.pointer.isDown : s.pointer.primaryDown;
      if (!held) releasePointer(s, true);
    }
  };

  // ---------------------------------------------------------------- focus

  const onBlur = (): void => {
    releaseAll(true);
    mouseOverField = false;
    cancelAim();
  };
  const onVisibility = (): void => {
    if (document.hidden) onBlur();
  };

  // ---------------------------------------------------------------- move

  const computeMove = (): Dir => {
    let best = 0;
    let dir: Dir = 0;
    for (const k of moveKeys) {
      if (k.down && k.seq > best) {
        best = k.seq;
        dir = k.binding.action === 'left' ? -1 : 1;
      }
    }
    for (const s of ptrs) {
      if (s.mode === P_MOVE && s.seq > best) {
        best = s.seq;
        dir = s.dir;
      }
    }
    return dir;
  };

  // ---------------------------------------------------------------- lifecycle

  const detach = (): void => {
    if (!attached) return;
    if (scene) {
      const input = scene.input;
      input.off('pointerdown', onPointerDown);
      input.off('pointermove', onPointerMove);
      input.off('pointerup', onPointerUp);
      input.off('pointerupoutside', onPointerUp);
      input.off('gameout', onGameOut);
    }
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    for (const off of unsubs) off();
    unsubs = [];
    releaseAll(false);
    aim.slot = null;
    aim.worldX = null;
    aimViewX = NaN;
    mouseOverField = false;
    bufA.length = 0;
    bufB.length = 0;
    attached = false;
    scene = null;
    layout = null;
    world = null;
    bus = null;
    coords = null;
  };

  return {
    aim,

    attach(s, l, w, b, c) {
      if (attached) detach();
      scene = s;
      layout = l;
      world = w;
      bus = b;
      coords = c;
      attached = true;
      // Battle creates a fresh runner: unpaused at ×1
      paused = false;
      speed = 1;
      lastExternalPauseAt = -Infinity;

      s.input.on('pointerdown', onPointerDown);
      s.input.on('pointermove', onPointerMove);
      s.input.on('pointerup', onPointerUp);
      s.input.on('pointerupoutside', onPointerUp);
      s.input.on('gameout', onGameOut);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      document.addEventListener('visibilitychange', onVisibility);

      unsubs = [
        b.on('ui:pause', (e) => {
          if (!emittingPause) lastExternalPauseAt = performance.now();
          paused = e.paused;
          if (paused) cancelAim(); // pausing cancels aiming
        }),
        b.on('ui:speed', (e) => {
          speed = e.speed;
        }),
        b.on('wave:ended', () => {
          releaseAll(true);
          cancelAim();
        }),
      ];
    },

    relayout(l) {
      layout = l;
    },

    poll(): InputFrame {
      if (attached && world && coords) {
        sweepPointers();
        if (aim.slot !== null) {
          const slot = world.spellSlots[aim.slot];
          if (!slot || slot.targeting !== 'point') {
            cancelAim();
          } else if (aimViewX === aimViewX) {
            // keep the preview under the pointer while the camera scrolls
            const wx = coords.toWorldX(aimViewX);
            if (wx !== aim.worldX) setAim(aim.slot, wx);
          }
        }
        frame.move = computeMove();
      } else {
        frame.move = 0;
      }
      const out = pending;
      pending = out === bufA ? bufB : bufA;
      pending.length = 0; // the array handed out last tick; its consumer is done with it
      frame.commands = out;
      return frame;
    },

    detach,
  };
}
