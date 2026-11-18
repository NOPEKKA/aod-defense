import type { AnimState, EntityKind, EntityState, GameData, Team, WaveStartParams, WorldState } from '../contracts';
import { createWorld } from '../core/world';
import type { NetEntity, NetMeta, Snapshot } from './protocol';

const ANIMS: AnimState[] = ['idle', 'walk', 'attack', 'cast', 'hurt', 'die', 'dodge', 'spawn', 'stunned', 'telegraph', 'leap', 'cheer'];
const ANIM_INDEX = new Map(ANIMS.map((a, i) => [a, i]));

/** round to 2 decimals, recursively (meta objects are tiny, so a copy per snapshot is fine) */
function q(v: unknown): unknown {
  if (typeof v === 'number') return Number.isInteger(v) || !Number.isFinite(v) ? v : Math.round(v * 100) / 100;
  if (Array.isArray(v)) return v.map(q);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k in v) o[k] = q((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}

/** Host side: world -> compact snapshot. Static entity fields are sent once per id (the channel is reliable + ordered). */
export class SnapshotEncoder {
  private readonly sent = new Map<number, string>();
  private readonly seen = new Set<number>();

  /** after a (re)start: the guest has a fresh mirror, send every static field again */
  reset(): void {
    this.sent.clear();
  }

  encode(w: WorldState): Snapshot {
    const out: NetEntity[] = [];
    this.seen.clear();
    for (const e of w.entities) {
      if (!e.alive) continue;
      this.seen.add(e.id);
      const rec: NetEntity = [
        e.id,
        Math.round(e.x),
        Math.round(e.y),
        Math.round(e.alt),
        e.hp > 0 ? Math.max(1, Math.round(e.hp)) : 0,
        ANIM_INDEX.get(e.anim) ?? 0,
        Math.round(e.animTime * 100),
        e.facing,
        e.action,
        e.statuses.length ? e.statuses.map((s) => s.id).join(',') : '',
        Number.isFinite(e.ttl) ? Math.round(e.ttl * 100) : -1,
      ];
      const sig = `${e.kind}|${e.team}|${e.defId}|${e.sprite}|${Math.round(e.maxHp)}|${e.flying ? 1 : 0}|${e.size}`;
      if (this.sent.get(e.id) !== sig) {
        this.sent.set(e.id, sig);
        rec.push(e.kind, e.team, e.defId, e.sprite, Math.round(e.maxHp), e.flying ? 1 : 0, e.size);
      }
      out.push(rec);
    }
    for (const id of this.sent.keys()) if (!this.seen.has(id)) this.sent.delete(id);
    const m: NetMeta = {
      tick: w.tick,
      time: Math.round(w.time * 100) / 100,
      phase: w.phase,
      ashId: w.ashId,
      wave: w.wave,
      book: q(w.book),
      res: q(w.resources),
      tel: q(w.telegraphs),
      sum: q(w.summonSlots),
      spl: q(w.spellSlots),
      dodge: q(w.dodge),
      smith: q(w.smith),
      rally: w.rally,
      combo: q(w.combo),
      castle: q(w.castle),
      boss: q(w.boss),
      out: w.outcome,
    };
    return { m, e: out };
  }
}

interface Static {
  kind: EntityKind;
  team: Team;
  defId: string;
  sprite: string;
  maxHp: number;
  flying: boolean;
  size: EntityState['size'];
}

/** copy the fields of `src` into `dst` element by element, keeping dst's objects (renderers may hold them) */
function syncArray<T extends object>(dst: T[], src: T[] | undefined): void {
  const n = src?.length ?? 0;
  for (let i = 0; i < n; i++) {
    if (dst[i]) Object.assign(dst[i], src![i]);
    else dst.push({ ...src![i] });
  }
  dst.length = n;
}

/**
 * Guest side: a WorldState mirror updated in place from snapshots. Entity objects are
 * reused (a pool, like the sim's), prevX/prevY/prevAlt hold the previous snapshot so
 * render interpolates between the last two snapshots.
 */
export class SnapshotMirror {
  readonly world: WorldState;
  /** performance.now() of the last snapshot, and the smoothed gap between snapshots */
  lastAt = -1;
  interval = 50;
  private readonly byId = new Map<number, EntityState>();
  private readonly statics = new Map<number, Static>();
  private readonly free: EntityState[] = [];
  private readonly seen = new Set<number>();

  constructor(params: WaveStartParams, data: GameData) {
    this.world = createWorld(params, data);
  }

  apply(s: Snapshot): void {
    const now = performance.now();
    if (this.lastAt >= 0) {
      const gap = Math.min(250, now - this.lastAt);
      this.interval += (gap - this.interval) * 0.2;
    }
    this.lastAt = now;
    const w = this.world;
    const m = s.m;
    w.tick = m.tick;
    w.time = m.time;
    w.phase = m.phase as WorldState['phase'];
    w.ashId = m.ashId;
    Object.assign(w.wave, m.wave);
    Object.assign(w.book, m.book);
    Object.assign(w.resources, m.res);
    syncArray(w.telegraphs, m.tel as WorldState['telegraphs']);
    syncArray(w.summonSlots, m.sum as WorldState['summonSlots']);
    syncArray(w.spellSlots, m.spl as WorldState['spellSlots']);
    Object.assign(w.dodge, m.dodge);
    Object.assign(w.smith, m.smith);
    w.rally = m.rally as WorldState['rally'];
    Object.assign(w.combo, m.combo);
    Object.assign(w.castle, m.castle);
    const boss = m.boss as WorldState['boss'];
    w.boss = boss ? Object.assign(w.boss ?? ({} as NonNullable<WorldState['boss']>), boss) : null;
    w.outcome = (m.out as WorldState['outcome']) ?? null;

    this.seen.clear();
    for (const r of s.e) {
      const id = r[0] as number;
      if (r.length > 11) {
        this.statics.set(id, {
          kind: r[11] as EntityKind,
          team: r[12] as Team,
          defId: r[13] as string,
          sprite: r[14] as string,
          maxHp: r[15] as number,
          flying: r[16] === 1,
          size: r[17] as EntityState['size'],
        });
      }
      const st = this.statics.get(id);
      if (!st) continue; // never got its static fields (should not happen on a reliable channel)
      this.seen.add(id);
      const x = r[1] as number;
      const y = r[2] as number;
      const alt = r[3] as number;
      let e = this.byId.get(id);
      if (!e) {
        const pooled = this.free.pop();
        e = pooled ?? this.newEntity();
        if (!pooled) w.entities.push(e);
        this.byId.set(id, e);
        e.id = id;
        e.alive = true;
        e.prevX = x;
        e.prevY = y;
        e.prevAlt = alt;
      } else {
        e.prevX = e.x;
        e.prevY = e.y;
        e.prevAlt = e.alt;
      }
      e.x = x;
      e.y = y;
      e.alt = alt;
      e.hp = r[4] as number;
      e.anim = ANIMS[r[5] as number] ?? 'idle';
      e.animTime = (r[6] as number) / 100;
      e.facing = (r[7] as number) < 0 ? -1 : 1;
      e.action = r[8] as string;
      this.syncStatuses(e, r[9] as string);
      const ttl = r[10] as number;
      e.ttl = ttl < 0 ? Infinity : ttl / 100;
      e.kind = st.kind;
      e.team = st.team;
      e.defId = st.defId;
      e.sprite = st.sprite;
      e.maxHp = st.maxHp;
      e.flying = st.flying;
      e.size = st.size;
    }
    for (const [id, e] of this.byId) {
      if (this.seen.has(id)) continue;
      e.alive = false;
      this.byId.delete(id);
      this.free.push(e);
    }
    for (const id of this.statics.keys()) if (!this.seen.has(id)) this.statics.delete(id);
  }

  /** visual clock between snapshots, so animations play at full frame rate */
  advanceAnims(sec: number): void {
    for (const e of this.world.entities) if (e.alive) e.animTime += sec;
  }

  private syncStatuses(e: EntityState, ids: string): void {
    const list = e.statuses;
    if (!ids) {
      list.length = 0;
      return;
    }
    const parts = ids.split(',');
    for (let i = 0; i < parts.length; i++) {
      const s = list[i];
      if (s) {
        s.id = parts[i];
        s.remaining = 1;
      } else list.push({ id: parts[i], remaining: 1, magnitude: 0 });
    }
    list.length = parts.length;
  }

  private newEntity(): EntityState {
    return {
      id: -1, alive: false, kind: 'enemy', team: 'enemy', defId: '', sprite: '', x: 0, y: 0, alt: 0,
      prevX: 0, prevY: 0, prevAlt: 0, facing: 1, hp: 0, maxHp: 1, armor: 0, flying: false, size: 'normal',
      anim: 'idle', animTime: 0, action: '', statuses: [], value: 0, ttl: Infinity,
    };
  }
}
