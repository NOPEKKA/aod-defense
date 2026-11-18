import type { EventBus, InputFrame, SimCommand, Unsubscribe, WaveStartParams, WorldState } from '../contracts';
import { isArmyCommand } from './protocol';
import type { SnapshotMirror } from './snapshot';

/**
 * Guest stand-in for SimRunner: no systems run here. The world is a mirror the host
 * keeps up to date; frame() only returns how far we are between the last two snapshots.
 */
export class RemoteRunner {
  paused = false;
  speed: 1 | 2 = 1;
  private readonly unsubs: Unsubscribe[];

  constructor(
    private readonly mirror: SnapshotMirror,
    readonly params: WaveStartParams,
    bus: EventBus,
    private readonly sendCommands: (c: SimCommand[]) => void,
    private readonly sendPause: (paused: boolean) => void,
    /** true while net is re-emitting the host's events (so they are not echoed back) */
    private readonly fromHost: () => boolean,
  ) {
    this.unsubs = [
      bus.on('ui:pause', ({ paused }) => {
        this.paused = paused;
        if (!this.fromHost()) this.sendPause(paused);
      }),
      bus.on('ui:speed', ({ speed }) => {
        this.speed = speed;
      }),
    ];
  }

  get world(): WorldState {
    return this.mirror.world;
  }

  get tickCount(): number {
    return this.mirror.world.tick;
  }

  start(): void {}

  /** interpolation alpha between the previous and the latest snapshot */
  frame(dtMs: number): number {
    const m = this.mirror;
    if (!this.paused && !this.world.outcome) m.advanceAnims((Math.min(dtMs, 100) / 1000) * this.speed);
    if (m.lastAt < 0) return 0;
    return Math.min(0.999, Math.max(0, (performance.now() - m.lastAt) / Math.max(16, m.interval)));
  }

  /** the guest's own controls: only army commands go to the host (Ash is the host's) */
  forwardInput(frame: InputFrame): void {
    if (!frame.commands.length) return;
    const out: SimCommand[] = [];
    for (const c of frame.commands) if (isArmyCommand(c)) out.push({ ...c });
    if (out.length) this.sendCommands(out);
  }

  /** QA: there is no local sim to step */
  advance(_ms: number): void {}

  /** QA: __aodd.input() on the guest sends the commands to the host */
  inject(frame: Partial<InputFrame>, _ticks = 1): void {
    if (frame.commands?.length) this.forwardInput({ move: 0, commands: frame.commands });
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
  }
}
