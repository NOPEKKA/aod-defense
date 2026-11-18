import type { DataConnection, Peer } from 'peerjs';
import type { NetRole, NetService, NetStatus, Unsubscribe } from '../contracts';
import { CODE_ALPHABET, CODE_LEN, PEER_PREFIX, PROTOCOL_VERSION, randomCode, type GuestMsg, type HostMsg } from './protocol';

type AnyMsg = HostMsg | GuestMsg | { t: 'ping' };

const PING_MS = 1000;
/** no message for this long = the other side is gone (tab closed, network lost) */
const SILENCE_MS = 12000;

/**
 * PeerJS wrapper: one room, one guest. PeerJS (and its signalling socket) is
 * loaded lazily on host()/join(), so single player never pays for it.
 */
export class PeerLink implements NetService {
  role: NetRole = 'off';
  status: NetStatus = 'idle';
  code = '';
  error = '';
  /** called for every game message from the other side */
  onMessage: (msg: HostMsg | GuestMsg) => void = () => {};
  /** called once when an established link drops (not on our own leave()) */
  onLost: (role: NetRole) => void = () => {};
  /** host: called when a guest finishes connecting */
  onGuestJoined: () => void = () => {};

  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private readonly listeners = new Set<() => void>();
  private pingTimer = 0;
  private lastRecv = 0;
  private gen = 0;

  onChange(fn: () => void): Unsubscribe {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get connected(): boolean {
    return this.status === 'connected' && !!this.conn?.open;
  }

  send(msg: AnyMsg): void {
    if (this.conn?.open) {
      try {
        void this.conn.send(msg);
      } catch (err) {
        console.warn('[net] send failed', err);
      }
    }
  }

  host(): void {
    this.reset();
    const gen = ++this.gen;
    this.role = 'host';
    this.set('opening');
    void this.open(gen, randomCode());
  }

  join(rawCode: string): void {
    const code = rawCode.toUpperCase().split('').filter((c) => CODE_ALPHABET.includes(c)).join('');
    this.reset();
    if (code.length !== CODE_LEN) {
      this.error = 'lobby.err_code';
      this.set('error');
      return;
    }
    const gen = ++this.gen;
    this.role = 'guest';
    this.code = code;
    this.set('opening');
    void (async () => {
      const PeerCtor = await this.loadPeer();
      if (gen !== this.gen || !PeerCtor) return;
      const peer = new PeerCtor({ debug: 1 });
      this.peer = peer;
      peer.on('open', () => {
        if (gen !== this.gen) return;
        this.attach(peer.connect(PEER_PREFIX + code, { reliable: true }), gen);
      });
      peer.on('error', (err) => this.onPeerError(gen, err.type));
    })();
  }

  leave(): void {
    this.reset();
    this.set('idle');
  }

  private async open(gen: number, code: string): Promise<void> {
    const PeerCtor = await this.loadPeer();
    if (gen !== this.gen || !PeerCtor) return;
    this.code = code;
    const peer = new PeerCtor(PEER_PREFIX + code, { debug: 1 });
    this.peer = peer;
    peer.on('open', () => {
      if (gen === this.gen) this.set('waiting');
    });
    peer.on('connection', (c) => {
      if (gen !== this.gen) return;
      if (this.conn?.open) {
        // one guest per room
        c.on('open', () => c.close());
        return;
      }
      this.attach(c, gen);
    });
    peer.on('error', (err) => {
      if (gen !== this.gen) return;
      if (err.type === 'unavailable-id') {
        // code collision: pick another
        peer.destroy();
        void this.open(gen, randomCode());
        return;
      }
      this.onPeerError(gen, err.type);
    });
  }

  private attach(c: DataConnection, gen: number): void {
    this.conn = c;
    c.on('open', () => {
      if (gen !== this.gen) return;
      this.lastRecv = performance.now();
      this.send({ t: 'hello', v: PROTOCOL_VERSION });
      this.startPing(gen);
      this.error = '';
      this.set('connected');
      if (this.role === 'host') this.onGuestJoined();
    });
    c.on('data', (data) => {
      if (gen !== this.gen) return;
      this.lastRecv = performance.now();
      const msg = data as AnyMsg;
      if (!msg || typeof msg !== 'object' || msg.t === 'ping' || msg.t === 'hello') return;
      this.onMessage(msg);
    });
    c.on('close', () => this.dropped(gen, c));
    c.on('error', () => this.dropped(gen, c));
  }

  private dropped(gen: number, c: DataConnection): void {
    if (gen !== this.gen || this.conn !== c) return;
    const role = this.role;
    const wasConnected = this.status === 'connected';
    this.conn = null;
    window.clearInterval(this.pingTimer);
    if (role === 'host') {
      // the room stays open: a friend can rejoin with the same code
      this.set(this.peer && !this.peer.destroyed ? 'waiting' : 'closed');
    } else {
      this.reset();
      this.error = 'net.host_left';
      this.set('closed');
    }
    if (wasConnected) this.onLost(role);
  }

  private startPing(gen: number): void {
    window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => {
      if (gen !== this.gen || !this.conn) return;
      if (performance.now() - this.lastRecv > SILENCE_MS) {
        const c = this.conn;
        try {
          c.close();
        } catch {
          /* already closed */
        }
        this.dropped(gen, c);
        return;
      }
      this.send({ t: 'ping' });
    }, PING_MS);
  }

  private onPeerError(gen: number, type: string): void {
    if (gen !== this.gen) return;
    console.warn('[net] peer error', type);
    if (this.status === 'connected' && (type === 'network' || type === 'disconnected')) return; // signalling lost, the P2P link may live on
    const role = this.role;
    const wasConnected = this.status === 'connected';
    this.reset();
    this.role = 'off';
    this.error = type === 'peer-unavailable' ? 'lobby.err_no_room' : type === 'browser-incompatible' ? 'lobby.err_browser' : 'lobby.err_network';
    this.set('error');
    if (wasConnected) this.onLost(role);
  }

  private async loadPeer(): Promise<typeof Peer | null> {
    try {
      return (await import('peerjs')).Peer;
    } catch (err) {
      console.warn('[net] could not load peerjs', err);
      this.error = 'lobby.err_network';
      this.set('error');
      return null;
    }
  }

  private reset(): void {
    this.gen++;
    window.clearInterval(this.pingTimer);
    const conn = this.conn;
    const peer = this.peer;
    this.conn = null;
    this.peer = null;
    try {
      conn?.close();
    } catch {
      /* ignore */
    }
    try {
      peer?.destroy();
    } catch {
      /* ignore */
    }
    this.role = 'off';
    this.code = '';
    this.error = '';
  }

  private set(status: NetStatus): void {
    this.status = status;
    for (const fn of [...this.listeners]) fn();
  }
}
