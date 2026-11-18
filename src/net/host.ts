import type { EventBus, InputFrame, SimCommand, Unsubscribe, WaveStartParams, WorldState } from '../contracts';
import type { PeerLink } from './peer';
import { FORWARDED_EVENTS, SNAPSHOT_MS, isArmyCommand, type GuestMsg, type NetEvent } from './protocol';
import { SnapshotEncoder } from './snapshot';

/** keep-alive snapshot while nothing changes (paused) */
const IDLE_SNAPSHOT_MS = 1000;

/**
 * Host side of one battle: streams snapshots + bus events to the guest and merges
 * the guest's army commands into the next tick's InputFrame.
 */
export class HostBattleLink {
  private readonly encoder = new SnapshotEncoder();
  private readonly events: NetEvent[] = [];
  private readonly unsubs: Unsubscribe[] = [];
  private readonly guestCmds: SimCommand[] = [];
  private readonly merged: InputFrame = { move: 0, commands: [] };
  private lastSendAt = -1e9;
  private lastTick = -1;
  /** sampled size of a snapshot message as JSON (bytes; the wire format is binary-packed), for QA */
  lastSize = 0;
  maxSize = 0;
  sends = 0;

  constructor(
    private readonly link: PeerLink,
    private readonly bus: EventBus,
    private readonly world: WorldState,
    private readonly params: WaveStartParams,
    private readonly isPaused: () => boolean,
  ) {
    for (const name of FORWARDED_EVENTS) {
      this.unsubs.push(
        bus.on(name, (p) => {
          // payloads may be live objects (telegraphs): copy now, send with the next snapshot
          if (this.link.connected) this.events.push([name, p && typeof p === 'object' ? { ...p } : p]);
        }),
      );
    }
    this.sendStart();
  }

  /** (re)open the battle on the guest: on create, and when a guest joins mid-battle */
  sendStart(): void {
    if (!this.link.connected) return;
    this.encoder.reset();
    this.events.length = 0;
    this.lastTick = -1;
    this.link.send({ t: 'start', params: this.params });
    this.flush(performance.now());
  }

  onGuestMsg(msg: GuestMsg): void {
    if (msg.t === 'cmd') {
      for (const c of msg.c) if (c && isArmyCommand(c) && this.guestCmds.length < 16) this.guestCmds.push(c);
    } else if (msg.t === 'pause') {
      if (msg.p !== this.isPaused() && !this.world.outcome) this.bus.emit('ui:pause', { paused: msg.p });
    }
  }

  /** wraps the device poll: the host's own frame plus whatever the guest asked for */
  merge(frame: InputFrame): InputFrame {
    if (!this.guestCmds.length) return frame;
    this.merged.move = frame.move;
    this.merged.commands = frame.commands.length ? [...frame.commands, ...this.guestCmds] : this.guestCmds.slice();
    this.guestCmds.length = 0;
    return this.merged;
  }

  /** called every rendered frame by the Battle scene */
  frame(now: number): void {
    if (!this.link.connected) {
      this.events.length = 0;
      return;
    }
    const since = now - this.lastSendAt;
    if (since < SNAPSHOT_MS) return;
    if (this.world.tick === this.lastTick && !this.events.length && since < IDLE_SNAPSHOT_MS) return;
    this.flush(now);
  }

  /** battle scene is closing: deliver the last events, or tell the guest to wait if there was no result */
  end(ended: boolean): void {
    if (this.link.connected) {
      if (this.events.length) this.flush(performance.now());
      if (!ended) this.link.send({ t: 'idle' });
    }
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
  }

  private flush(now: number): void {
    const s = this.encoder.encode(this.world);
    const msg = { t: 'snap' as const, s, ev: this.events.splice(0, this.events.length) };
    if (this.sends++ % 20 === 0) {
      this.lastSize = JSON.stringify(msg).length;
      this.maxSize = Math.max(this.maxSize, this.lastSize);
    }
    this.link.send(msg);
    this.lastSendAt = now;
    this.lastTick = this.world.tick;
  }
}
