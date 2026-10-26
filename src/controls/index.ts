/**
 * controls/ — keyboard, mouse and touch input; spell buttons; aiming and targeting.
 * Owner: controls agent.
 *
 * PHASE 2 STUB: walking only (A/D, arrows, or hold the left/right move zone).
 */
import type { AimState, ControlsModule, CoordHelpers, HudLayout, InputFrame, InputSource } from '../contracts';
import { inRect } from '../core/layout';

function createInputSource(): InputSource {
  const aim: AimState = { slot: null, worldX: null };
  let scene: Phaser.Scene | null = null;
  let layout: HudLayout | null = null;
  let coords: CoordHelpers | null = null;
  let keys: Record<'left' | 'right' | 'a' | 'd', Phaser.Input.Keyboard.Key> | null = null;

  const touchMove = (): -1 | 0 | 1 => {
    if (!scene || !layout || !coords) return 0;
    let dir = 0;
    for (const p of scene.input.manager.pointers) {
      if (!p.isDown) continue;
      const v = coords.toView(p);
      if (inRect(layout.moveZoneLeft, v.x, v.y)) dir -= 1;
      else if (inRect(layout.moveZoneRight, v.x, v.y)) dir += 1;
    }
    return Math.sign(dir) as -1 | 0 | 1;
  };

  return {
    aim,
    attach(s, l, _world, _bus, c) {
      scene = s;
      layout = l;
      coords = c;
      const kb = s.input.keyboard;
      if (kb) {
        keys = {
          left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
          right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
          a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
          d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };
      }
    },
    relayout(l) {
      layout = l;
    },
    poll(): InputFrame {
      let move = 0;
      if (keys) move = (keys.right.isDown || keys.d.isDown ? 1 : 0) - (keys.left.isDown || keys.a.isDown ? 1 : 0);
      if (move === 0) move = touchMove();
      return { move: move as -1 | 0 | 1, commands: [] };
    },
    detach() {
      scene = null;
      keys = null;
    },
  };
}

export const controls: ControlsModule = { createInputSource };
