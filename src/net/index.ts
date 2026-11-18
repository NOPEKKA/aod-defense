/**
 * Online co-op (two players, WebRTC via PeerJS, host-authoritative).
 * - host: plays Ash, runs the real simulation, streams snapshots + bus events.
 * - guest: commands the army (summon / spells / smith / rally) from a mirror of the host's world.
 * Nothing here runs until the player opens the lobby; single player never touches it.
 */
import { SceneKey, type BattleSceneData, type EventBus, type NetService, type SceneKeyName, type WaveStartParams, type WorldState } from '../contracts';
import { tryRuntime } from '../core/app';
import { HostBattleLink } from './host';
import { PeerLink } from './peer';
import type { GuestMsg, HostMsg } from './protocol';
import { RemoteRunner } from './remote';
import { SnapshotMirror } from './snapshot';

export { HostBattleLink } from './host';
export { RemoteRunner } from './remote';

const link = new PeerLink();
export const net: NetService = link;

let hostBattle: HostBattleLink | null = null;
/** guest: mirror of the battle the host is running (created on 'start', before Battle has loaded) */
let mirror: SnapshotMirror | null = null;
let remoteActive = false;
let applying = false;
/** until when a scene change is one we asked for (not the guest quitting from the pause menu) */
let routingUntil = 0;

/** stop whatever is on screen and open `key` (also used when a message arrives mid-scene) */
function goto(key: SceneKeyName, data?: object): void {
  const rt = tryRuntime();
  if (!rt) return;
  routingUntil = performance.now() + 800;
  for (const s of rt.game.scene.getScenes(true)) rt.game.scene.stop(s.scene.key);
  rt.game.scene.start(key, data);
}

function activeKeys(): string[] {
  return tryRuntime()?.game.scene.getScenes(true).map((s) => s.scene.key) ?? [];
}

link.onMessage = (msg) => {
  if (link.role === 'host') {
    hostBattle?.onGuestMsg(msg as GuestMsg);
    return;
  }
  const m = msg as HostMsg;
  const rt = tryRuntime();
  if (!rt) return;
  switch (m.t) {
    case 'start': {
      mirror = new SnapshotMirror(m.params, rt.app.data);
      remoteActive = false;
      goto(SceneKey.Battle, { params: m.params, remote: true } satisfies BattleSceneData);
      break;
    }
    case 'snap': {
      if (!mirror) return;
      mirror.apply(m.s);
      if (!remoteActive) return;
      applying = true;
      try {
        for (const [name, payload] of m.ev) rt.app.bus.emit(name, payload as never);
      } finally {
        applying = false;
      }
      break;
    }
    case 'idle':
      mirror = null;
      if (activeKeys().includes(SceneKey.Battle)) goto(SceneKey.Lobby);
      break;
    case 'pause':
      break;
  }
};

link.onLost = (role) => {
  if (role === 'guest') {
    mirror = null;
    remoteActive = false;
    goto(SceneKey.Title, { netMessage: 'net.host_left' });
  } else {
    console.info('[net] guest left; the host plays on alone');
  }
};

link.onGuestJoined = () => hostBattle?.sendStart();

if (typeof window !== 'undefined') window.addEventListener('pagehide', () => link.role !== 'off' && link.leave());

/** Host battle: null when not hosting (single player pays nothing). */
export function attachHostBattle(bus: EventBus, world: WorldState, params: WaveStartParams, isPaused: () => boolean): HostBattleLink | null {
  if (link.role !== 'host') return null;
  hostBattle = new HostBattleLink(link, bus, world, params, isPaused);
  return hostBattle;
}

export function detachHostBattle(h: HostBattleLink, ended: boolean): void {
  h.end(ended);
  if (hostBattle === h) hostBattle = null;
}

/** Guest battle: the runner over the mirror the host is filling, or null if there is none. */
export function createRemoteRunner(params: WaveStartParams, bus: EventBus): RemoteRunner | null {
  if (link.role !== 'guest' || !mirror) return null;
  remoteActive = true;
  const runner = new RemoteRunner(
    mirror,
    params,
    bus,
    (c) => link.send({ t: 'cmd', c }),
    (p) => link.send({ t: 'pause', p }),
    () => applying,
  );
  const dispose = runner.dispose.bind(runner);
  runner.dispose = () => {
    dispose();
    remoteActive = false;
  };
  return runner;
}

/** guest Battle closed without a result: if we did not route it, the guest quit, so leave the room */
export function remoteBattleClosed(): void {
  if (link.role === 'guest' && performance.now() > routingUntil) link.leave();
}

/** for render_game_to_text */
export function netDebug(): Record<string, unknown> | null {
  if (link.role === 'off' && link.status === 'idle') return null;
  return {
    role: link.role,
    status: link.status,
    code: link.code,
    error: link.error,
    snapBytes: hostBattle?.lastSize ?? 0,
    snapBytesMax: hostBattle?.maxSize ?? 0,
    sends: hostBattle?.sends ?? 0,
    mirrorTick: mirror?.world.tick ?? -1,
    snapMs: mirror ? Math.round(mirror.interval) : 0,
  };
}
