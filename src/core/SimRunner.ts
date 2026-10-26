import {
  MAX_FRAME_DELTA_MS,
  MAX_TICKS_PER_FRAME,
  SIM_DT,
  SIM_HZ,
  type AppContext,
  type GameplayModule,
  type InputFrame,
  type SimContext,
  type SimSystem,
  type SystemsModule,
  type WaveStartParams,
  type WorldState,
} from '../contracts';
import { createRng } from './rng';
import { createWorld } from './world';

const EMPTY_INPUT: InputFrame = { move: 0, commands: [] };

/**
 * Fixed-timestep simulation driver.
 * - frame(dtMs): accumulate real time, run whole ticks, return the interpolation alpha.
 * - advance(ms): run ticks synchronously (QA / balance bots), ignores pause.
 * Speed x2 runs two ticks per SIM_DT of real time; dt itself never changes.
 */
export class SimRunner {
  readonly world: WorldState;
  readonly ctx: SimContext;
  paused = false;
  speed: 1 | 2 = 1;
  private acc = 0;
  private alpha = 0;
  private readonly systems: SimSystem[];
  private readonly injected: { frame: InputFrame; ticks: number }[] = [];

  constructor(
    app: AppContext,
    readonly params: WaveStartParams,
    systemsModule: SystemsModule,
    gameplay: GameplayModule,
    private readonly pollInput: () => InputFrame,
  ) {
    this.world = createWorld(params, app.data);
    const mods = app.progression.buildModifiers(app.profile);
    const bus = app.bus;
    const simSystems = systemsModule.createSimSystems();
    this.ctx = {
      world: this.world,
      data: app.data,
      profile: app.profile,
      bus,
      rng: createRng(params.seed),
      wave: params,
      services: {
        mods,
        economy: systemsModule.createEconomy(this.world, app.data, mods),
        waves: systemsModule.createWaveApi(),
        spawn: gameplay.createSpawnApi(this.world, app.data, () => mods, bus),
      },
    };
    this.systems = [...simSystems, ...gameplay.createSimSystems()].sort((a, b) => a.order - b.order);
  }

  start(): void {
    for (const s of this.systems) s.init(this.ctx);
  }

  /** Returns interpolation alpha in [0, 1). */
  frame(dtMs: number): number {
    if (this.paused || this.world.outcome) return this.alpha;
    this.acc += (Math.min(dtMs, MAX_FRAME_DELTA_MS) / 1000) * this.speed;
    const maxTicks = MAX_TICKS_PER_FRAME * this.speed;
    let n = 0;
    while (this.acc >= SIM_DT && n < maxTicks) {
      this.tick();
      this.acc -= SIM_DT;
      n++;
    }
    if (n === maxTicks) this.acc = Math.min(this.acc, SIM_DT); // drop backlog instead of spiralling
    this.alpha = this.acc / SIM_DT;
    return this.alpha;
  }

  advance(ms: number): void {
    const ticks = Math.round((ms / 1000) * SIM_HZ);
    for (let i = 0; i < ticks && !this.world.outcome; i++) this.tick();
    this.alpha = 0;
  }

  /** QA: force an input frame for the next `ticks` ticks (devices are ignored meanwhile). */
  inject(frame: Partial<InputFrame>, ticks = 1): void {
    this.injected.push({ frame: { move: frame.move ?? 0, commands: frame.commands ?? [] }, ticks });
  }

  get tickCount(): number {
    return this.world.tick;
  }

  private nextInput(): InputFrame {
    const head = this.injected[0];
    if (head) {
      const frame = head.frame;
      head.ticks--;
      if (head.ticks <= 0) this.injected.shift();
      // commands fire once, move is held
      const out = { move: frame.move, commands: frame.commands };
      frame.commands = [];
      this.pollInput(); // drain device queue so stale taps don't fire later
      return out;
    }
    return this.pollInput() ?? EMPTY_INPUT;
  }

  private tick(): void {
    const w = this.world;
    w.tick++;
    w.time += SIM_DT;
    for (const e of w.entities) {
      e.prevX = e.x;
      e.prevY = e.y;
    }
    const input = this.nextInput();
    for (const s of this.systems) s.tick(this.ctx, input);
  }

  dispose(): void {
    for (const s of this.systems) s.dispose();
    this.systems.length = 0;
  }
}
