/**
 * controls/ — keyboard, mouse and touch input; unit/spell/dodge buttons; spell aiming;
 * pause and ×2 toggles. Owner: controls agent.
 *
 * Only talks to the rest of the game through InputSource (InputFrame + AimState) and
 * 'ui:*' / 'spectacle:action' events. Implementation: InputSourceImpl.ts, keys: keymap.ts.
 */
import type { ControlsModule } from '../contracts';
import { createInputSource } from './InputSourceImpl';

export const controls: ControlsModule = { createInputSource };
