/**
 * audio/events.ts - maps EventBus events to sounds and music state.
 *
 * Events carry defId only on spawn and death, so a small id -> {kind, defId} map is
 * kept from entity:spawned and dropped on entity:died.
 */
import type { AppContext, EntityKind, Telegraph } from '../contracts';
import type { AudioSystem } from './system';
import { clamp } from './engine';
import { SFX } from './sfx';

interface Who {
  kind: EntityKind;
  def: string;
}

const SKELETON_MELEE = new Set(['skeleton', 'skeleton_helm', 'skeleton_shield', 'skeleton_spear', 'skeleton_knight']);
const SWORD_UNITS = new Set(['swordsman', 'armored_guard', 'arthur', 'henry']);
const BLUNT_UNITS = new Set(['peasant', 'torch_boy']);
const HEROES = new Set(['arthur', 'henry']);
const TELEGRAPH_N: Record<Telegraph['shape'], number> = { band: 0, circle: 1, line: 2, shadow: 3 };

export interface Wiring {
  /** current battle state for the debug hook */
  state(): { battleOver: boolean; bossActive: boolean; enemies: number; level: number; waveTime: number; bookRatio: number };
}

export function wireEvents(app: AppContext, game: Phaser.Game, A: AudioSystem): Wiring {
  const bus = app.bus;
  const who = new Map<number, Who>();
  let ashId = -1;
  let enemies = 0;
  let battleOver = false;
  let bossActive = false;
  let bossPhase = 0;
  let waveStart = -1;
  let bookMax = 0;
  let bookRatio = 1;
  let coinStep = 0;
  let lastCoin = -10;
  let sceneKeys: string[] = [];
  let lastLevel = 0;
  let wasBattle = false;
  const now = (): number => performance.now() / 1000;

  // ----- music director -----------------------------------------------------
  const decideTheme = (): void => {
    const inBattle = sceneKeys.includes('Battle');
    const inMenu = sceneKeys.some((k) => k !== 'Battle' && k !== 'Boot' && k !== 'Preloader');
    const stingerLeft = A.music ? A.music.stingerLeft() : 0;
    if (inBattle && !wasBattle) {
      // entering a battle scene: fresh state
      bossActive = false;
      bossPhase = 0;
      battleOver = false;
    }
    if (!inBattle && wasBattle) {
      A.setSpeed(1);
      enemies = 0;
      A.setPaused(false);
    }
    wasBattle = inBattle;
    if (stingerLeft > 0.05) return; // let a stinger finish
    if (A.wantedTheme === 'victory' || A.wantedTheme === 'defeat') {
      // stinger done: hand over to the scene's theme
      if (inBattle && !battleOver) A.setTheme(bossActive ? 'boss' : 'battle', 1.5);
      else A.setTheme(inMenu || inBattle ? 'menu' : 'none', 2);
      return;
    }
    if (inBattle) {
      if (battleOver) {
        if (A.wantedTheme !== 'menu') A.setTheme('menu', 2);
      } else {
        const want = bossActive ? 'boss' : 'battle';
        if (A.wantedTheme !== want) A.setTheme(want, 1.2);
      }
    } else if (inMenu) {
      if (A.wantedTheme !== 'menu') A.setTheme('menu', 1.8);
    }
  };

  const computeLevel = (): number => {
    if (!wasBattle || battleOver) return 0;
    const t = waveStart < 0 ? 0 : now() - waveStart;
    let lvl = t < 20 ? 0 : t < 55 ? 1 : t < 100 ? 2 : 3;
    if (enemies >= 8) lvl = Math.max(lvl, 1);
    if (enemies >= 16) lvl = Math.max(lvl, 2);
    if (enemies >= 26) lvl = Math.max(lvl, 3);
    if (bookRatio < 0.5) lvl = Math.max(lvl, 2);
    if (bookRatio < 0.25) lvl = 3;
    if (bossActive) lvl = Math.min(3, 1 + bossPhase + (bookRatio < 0.5 ? 1 : 0) + (t > 40 ? 1 : 0));
    return lvl;
  };

  const pollTimer = window.setInterval(() => {
    try {
      sceneKeys = game.scene.getScenes(true).map((s) => s.scene.key);
    } catch {
      sceneKeys = [];
    }
    decideTheme();
    const lvl = computeLevel();
    if (lvl !== lastLevel) lastLevel = lvl;
    A.setIntensity(lvl);
  }, 250);
  void pollTimer;

  // ----- helpers ------------------------------------------------------------
  const att = (id: number | null): Who | undefined => (id === null ? undefined : who.get(id));
  const side = (w: Who | undefined): 'enemy' | 'ally' | 'ash' | 'none' => {
    if (!w) return 'none';
    if (w.kind === 'ash') return 'ash';
    if (w.kind === 'enemy' || w.kind === 'boss') return 'enemy';
    if (w.kind === 'ally' || w.kind === 'hero') return 'ally';
    return 'none';
  };
  const summonVariant = (id: string): number => {
    if (id === 'archer' || id === 'crossbowman') return 1;
    if (id === 'horseman') return 2;
    if (HEROES.has(id)) return 3;
    if (id === 'wiseman') return 4;
    return 0;
  };
  const trackAsh = (x: number): void => {
    A.listenerX = x;
  };

  // ----- flow ---------------------------------------------------------------
  bus.on('wave:started', ({ kind }) => {
    battleOver = false;
    bossActive = false;
    bossPhase = 0;
    waveStart = now();
    bookMax = 0;
    bookRatio = 1;
    A.setSpeed(1);
    A.play('wave_horn');
    A.setTheme('battle', 0.8);
    void kind;
  });
  bus.on('wave:ended', (o) => {
    battleOver = true;
    bossActive = false;
    A.setTheme(o.result === 'won' ? 'victory' : 'defeat', 0.5);
    // the crowd cheers after a boss wave is won
    if (o.result === 'won' && o.wave % 10 === 0) A.play('crowd_cheer', { delay: 0.6 });
  });

  // ----- entities -----------------------------------------------------------
  bus.on('entity:spawned', (e) => {
    who.set(e.id, { kind: e.kind, def: e.defId });
    if (who.size > 3000) {
      // safety net: drop the oldest quarter
      let n = 0;
      for (const k of who.keys()) {
        who.delete(k);
        if (++n > 700) break;
      }
    }
    if (e.kind === 'ash') ashId = e.id;
    if (e.kind === 'enemy') {
      enemies++;
      if (e.defId === 'winged_deadite') A.play('flyer_screech', { x: e.x, vol: 0.7, pitch: 0.9 });
    }
  });

  bus.on('entity:attack', (a) => {
    const w = att(a.id);
    if (!w) return;
    if (w.kind === 'ash') {
      trackAsh(a.x);
      if (a.ranged) A.play('ash_shotgun', { x: a.x });
      else {
        A.play('chainsaw_bite', { x: a.x });
        A.play('chainsaw_rev', { x: a.x });
      }
      return;
    }
    switch (w.def) {
      case 'archer':
        A.play('arrow_shot', { x: a.x });
        return;
      case 'deadite_archer':
        A.play('arrow_shot', { x: a.x, pitch: 0.8, vol: 0.9 });
        return;
      case 'crossbowman':
        A.play('bolt_shot', { x: a.x });
        return;
      case 'skeleton_wizard':
        A.play('fireball_cast', { x: a.x });
        return;
      case 'winged_deadite':
        A.play('flyer_screech', { x: a.x, pitch: 1.1 });
        return;
      case 'pit_hag':
        A.play('hag_chirp', { x: a.x });
        return;
      case 'battering_ram':
        A.play('ram_thud', { x: a.x });
        return;
      case 'skeleton_catapult':
        A.play('catapult_creak', { x: a.x });
        return;
      case 'spearman':
      case 'skeleton_spear':
        A.play('spear_thrust', { x: a.x });
        return;
      case 'horseman':
        A.play('horse_charge', { x: a.x, vol: 0.8 });
        return;
      default:
        break;
    }
    if (w.kind === 'boss') {
      if (a.ranged) A.play('fireball_cast', { x: a.x, pitch: 0.6, vol: 1.2 });
      else A.play('ram_thud', { x: a.x, pitch: 0.8, vol: 1 });
    }
  });

  bus.on('entity:damaged', (d) => {
    const tgt = att(d.id);
    const src = att(d.sourceId);
    const ts = side(tgt);
    if (ts === 'ash') trackAsh(d.x);
    if (d.blocked) {
      A.play('shield_block', { x: d.x });
      return;
    }
    if (d.amount <= 0) return;
    // heavy ordnance first
    const sd = src?.def ?? '';
    if (sd === 'rock' || sd === 'skeleton_catapult') {
      A.play('boulder_crash', { x: d.x });
      return;
    }
    if (ts === 'ash') {
      A.play('ash_hurt', { x: d.x, vol: clamp(0.6 + d.amount / 40, 0.6, 1.3) });
      return;
    }
    if (d.damageKind === 'fire' || sd === 'fireball') {
      A.play('fire_burst', { x: d.x });
      if (ts === 'enemy') A.play('bone_hit', { x: d.x, vol: 0.6 });
      return;
    }
    // attacker flavoured impact
    if (SWORD_UNITS.has(sd)) A.play('sword_hit', { x: d.x });
    else if (BLUNT_UNITS.has(sd)) A.play('blunt_hit', { x: d.x });
    else if (sd === 'horseman') A.play('axe_hit', { x: d.x, pitch: 0.9 });
    else if (sd === 'spearman' || sd === 'skeleton_spear') A.play('stab_hit', { x: d.x });
    else if (sd === 'arrow' || sd === 'archer' || sd === 'deadite_archer') A.play('arrow_hit', { x: d.x });
    else if (sd === 'bolt' || sd === 'crossbowman') A.play('arrow_hit', { x: d.x, pitch: 0.75, vol: 1.2 });
    else if (sd === 'battering_ram') A.play('ram_thud', { x: d.x, vol: 0.8 });
    else if (src && src.kind === 'boss') A.play('axe_hit', { x: d.x, pitch: 0.65, vol: 1.2 });
    else if (src && (src.kind === 'enemy') && SKELETON_MELEE.has(sd)) A.play('sword_hit', { x: d.x, pitch: 0.85 });
    else if (ts === 'ally') A.play('blunt_hit', { x: d.x, pitch: 0.9 });
    if (ts === 'enemy' && d.damageKind !== 'holy') A.play('bone_hit', { x: d.x });
    else if (ts === 'enemy') A.play('bone_hit', { x: d.x, pitch: 1.3, vol: 0.7 });
  });

  bus.on('entity:died', (d) => {
    const w = who.get(d.id);
    who.delete(d.id);
    const kind = w?.kind ?? d.kind;
    if (kind === 'enemy') enemies = Math.max(0, enemies - 1);
    if (d.cause === 'despawn' || d.cause === 'portal') return;
    if (kind === 'ash') {
      A.play('ash_death', { x: d.x });
      return;
    }
    if (kind === 'enemy') {
      if (d.cause === 'pit') return; // castle:pit covers the whole drop
      switch (d.defId) {
        case 'winged_deadite':
          A.play('flyer_screech', { x: d.x, pitch: 0.65, vol: 0.9 });
          A.play('blunt_hit', { x: d.x, pitch: 0.7 });
          return;
        case 'pit_hag':
          A.play('hag_chirp', { x: d.x, pitch: 0.7 });
          A.play('bone_collapse', { x: d.x, vol: 0.7 });
          return;
        case 'battering_ram':
          A.play('ram_thud', { x: d.x, pitch: 0.7 });
          A.play('boulder_crash', { x: d.x, vol: 0.5, pitch: 1.3 });
          return;
        case 'skeleton_catapult':
          A.play('boulder_crash', { x: d.x, vol: 0.7, pitch: 1.2 });
          return;
        default:
          A.play('bone_collapse', { x: d.x });
          // an occasional low groan from the dead; the sound itself has a long gap
          if (Math.random() < 0.08) A.play('deadite_groan', { x: d.x, delay: 0.12 });
          return;
      }
    }
    if (kind === 'ally' || kind === 'hero') A.play('blunt_hit', { x: d.x, pitch: 0.6, vol: 0.9 });
  });

  // ----- player actions -----------------------------------------------------
  bus.on('unit:summoned', (u) => {
    const v = summonVariant(u.unitId);
    A.play('summon', { n: v });
    if (u.unitId === 'horseman') A.play('horse_charge', { vol: 0.8, delay: 0.25 });
  });
  const denied = (): void => {
    A.play('denied');
  };
  bus.on('summon:denied', denied);
  bus.on('spell:denied', denied);
  bus.on('smith:denied', denied);

  bus.on('spell:cast', (s) => {
    if (!A.play('cast_' + s.spellId, { x: s.x })) {
      if (!hasSfx('cast_' + s.spellId)) A.play('cast_magic_words', { x: s.x });
    }
  });
  bus.on('spell:impact', (s) => {
    const n = 'impact_' + s.spellId;
    if (hasSfx(n)) A.play(n, { x: s.x });
    else A.play('spell_impact', { x: s.x, pitch: 1 / (1 + s.radius / 400) });
  });
  bus.on('ash:dodged', (d) => {
    trackAsh(d.toX);
    A.play('ash_dodge', { x: d.fromX });
  });

  // ----- economy ------------------------------------------------------------
  bus.on('pickup:collected', (p) => {
    const t = now();
    if (p.pickup === 'gold') {
      coinStep = t - lastCoin < 0.7 ? Math.min(coinStep + 1, 14) : 0;
      lastCoin = t;
      A.play('coin', { n: coinStep, x: p.x });
    } else if ((p.pickup as string) === 'silver') {
      A.play('coin_silver', { n: Math.floor(t * 7) % 3, x: p.x });
    } else if (p.pickup === 'mana') A.play('mana_chime', { x: p.x });
    else A.play('food', { x: p.x });
  });
  bus.on('entity:healed', (h) => {
    if (h.amount > 0) A.play('heal', { x: h.x });
  });
  bus.on('smith:upgraded', () => {
    A.play('smith_hammer');
    A.play('anvil_ring', { delay: 0.4 });
  });
  bus.on('combo:changed', (c) => {
    if (c.count >= 2) A.play('combo_ping', { n: c.count - 2 });
  });
  bus.on('combo:ended', (c) => {
    if (c.gold > 0) A.play('combo_flourish', { n: Math.min(6, Math.floor(c.count / 5)) });
  });

  // ----- castle -------------------------------------------------------------
  bus.on('castle:pit', () => A.play('pit_trap'));
  bus.on('castle:shot', (s) => A.play(s.source === 'archer' ? 'castle_archer' : 'castle_catapult', { x: s.x }));
  bus.on('book:damaged', (b) => {
    bookMax = Math.max(bookMax, b.hp + b.amount);
    bookRatio = bookMax > 0 ? clamp(b.hp / bookMax, 0, 1) : 1;
    A.play('book_hit', { i: 1 - bookRatio, vol: 0.8 + 0.3 * (1 - bookRatio) });
  });

  // ----- bosses -------------------------------------------------------------
  bus.on('boss:spawned', () => {
    bossActive = true;
    bossPhase = 0;
    A.play('boss_enter');
    A.setTheme('boss', 0.7);
    A.setIntensity(1);
  });
  bus.on('boss:telegraph', (t) => {
    A.play('telegraph', { n: TELEGRAPH_N[t.shape] ?? 0, x: t.x, pitch: 1 + (t.id % 3) * 0.06 });
  });
  bus.on('boss:phase', (p) => {
    bossPhase = Math.max(bossPhase, p.phase);
    A.play('boss_phase');
  });
  bus.on('boss:defeated', () => {
    bossActive = false;
    A.play('boss_defeat');
    if (!battleOver) A.setTheme('battle', 2.5);
  });

  // ----- ui -----------------------------------------------------------------
  bus.on('ui:button', (b) => {
    if (!b.down) return;
    A.play('button', { vol: b.button === 'unit' || b.button === 'spell' || b.button === 'dodge' ? 0.5 : 1, pitch: b.button === 'cancel' ? 0.8 : 1 });
  });
  bus.on('rally:changed', (r) => A.play('rally', { n: r.mode === 'advance' ? 1 : 0 }));
  bus.on('ui:pause', (p) => {
    A.setPaused(p.paused);
    A.play('pause', { n: p.paused ? 1 : 0 });
  });
  bus.on('ui:speed', (s) => {
    A.setSpeed(s.speed);
    A.play('speed', { n: s.speed });
  });
  bus.on('spectacle:action', (s) => {
    if (s.action === 'move' || s.action === 'dodge') trackAsh(s.x);
  });
  void ashId;

  return {
    state: () => ({ battleOver, bossActive, enemies, level: lastLevel, waveTime: waveStart < 0 ? 0 : now() - waveStart, bookRatio }),
  };
}

const hasSfx = (n: string): boolean => n in SFX;
