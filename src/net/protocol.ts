import type { GameEventName, SimCommand, WaveStartParams } from '../contracts';

/** PeerJS id of a host is `aodd-<code>`. */
export const PEER_PREFIX = 'aodd-';
export const CODE_LEN = 6;
/** no I/O/0/1, so a code read aloud or off a phone is unambiguous */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** wall-clock ms between host snapshots (~20 Hz) */
export const SNAPSHOT_MS = 50;
export const PROTOCOL_VERSION = 1;

/**
 * One entity in a snapshot, as a flat array:
 *   [id, x, y, alt, hp, anim, animTime*100, facing, action, statuses, ttl*100 (-1 = none), ...static]
 * The static tail is sent the first time the host sends an id, and again whenever it changes:
 *   [kind, team, defId, sprite, maxHp, flying (0/1), size]
 */
export type NetEntity = Array<number | string>;

/** Everything about the world besides entities, small enough to send whole every time. */
export interface NetMeta {
  tick: number;
  time: number;
  phase: string;
  ashId: number;
  wave: unknown;
  book: unknown;
  res: unknown;
  tel: unknown;
  sum: unknown;
  spl: unknown;
  dodge: unknown;
  smith: unknown;
  rally: string;
  combo: unknown;
  castle: unknown;
  boss: unknown;
  out: unknown;
}

export interface Snapshot {
  m: NetMeta;
  e: NetEntity[];
}

/** a bus event forwarded from host to guest: [name, payload] */
export type NetEvent = [GameEventName, unknown];

export type HostMsg =
  | { t: 'hello'; v: number }
  /** a battle starts: the guest opens Battle in remote mode with the same params */
  | { t: 'start'; params: WaveStartParams }
  /** world snapshot + the bus events since the previous one (applied in that order) */
  | { t: 'snap'; s: Snapshot; ev: NetEvent[] }
  /** the host left the battle without a result: back to the waiting screen */
  | { t: 'idle' }
  | { t: 'pause'; p: boolean };

export type GuestMsg =
  | { t: 'hello'; v: number }
  /** army commands: summon / cast / smith / rally (move and dodge belong to Ash) */
  | { t: 'cmd'; c: SimCommand[] }
  | { t: 'pause'; p: boolean };

/** Bus events the host forwards so the guest's render and audio react the same way. */
export const FORWARDED_EVENTS: GameEventName[] = [
  'wave:started',
  'wave:ended',
  'entity:spawned',
  'entity:damaged',
  'entity:healed',
  'entity:died',
  'entity:status',
  'entity:attack',
  'unit:summoned',
  'summon:denied',
  'spell:cast',
  'spell:denied',
  'spell:impact',
  'ash:dodged',
  'pickup:dropped',
  'pickup:collected',
  'resource:changed',
  'smith:upgraded',
  'smith:denied',
  'rally:changed',
  'combo:changed',
  'combo:ended',
  'castle:pit',
  'castle:shot',
  'book:damaged',
  'boss:spawned',
  'boss:phase',
  'boss:telegraph',
  'boss:defeated',
  'ui:pause',
  'ui:speed',
  'spectacle:entrance',
  'spectacle:action',
  'spectacle:hit',
  'spectacle:combo',
  'spectacle:streak',
];

/** commands the guest may send */
export function isArmyCommand(c: SimCommand): boolean {
  return c.type === 'summon' || c.type === 'cast' || c.type === 'smith' || c.type === 'rally';
}

export function randomCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}
