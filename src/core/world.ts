import type { GameData, WaveStartParams, WorldState } from '../contracts';

/** Empty world for a wave. Systems fill it in their init(). */
export function createWorld(params: WaveStartParams, data: GameData): WorldState {
  const level = params.endless ? undefined : data.levels[params.wave - 1];
  return {
    tick: 0,
    time: 0,
    phase: 'intro',
    wave: {
      number: params.wave,
      endless: params.endless,
      kind: level?.kind ?? 'normal',
      enemiesTotal: 0,
      enemiesSpawned: 0,
      enemiesKilled: 0,
      chapter: (Math.floor((params.wave - 1) / 10) % 5) + 1,
      markers: [],
    },
    ashId: -1,
    book: { hp: data.balance.book.hp, maxHp: data.balance.book.hp },
    resources: { iron: 0, ironMax: 0, mana: 0, manaMax: 0, goldCollected: 0 },
    entities: [],
    telegraphs: [],
    summonSlots: [],
    spellSlots: [],
    dodge: { unlocked: false, cooldownLeft: 0, cooldownTotal: 0 },
    smith: { level: 1, maxLevel: 1, upgradeCost: 0, progress: 0 },
    rally: 'advance',
    combo: { count: 0, timeLeft: 0, window: 0, best: 0 },
    castle: { pitOpen: false, pitCooldownLeft: 0, pitCooldownTotal: 0, archers: 0, catapultLevel: 0 },
    boss: null,
    outcome: null,
  };
}

export function findEntity(world: WorldState, id: number) {
  for (const e of world.entities) if (e.id === id && e.alive) return e;
  return undefined;
}
