/**
 * Deterministic wave planner (SPEC 5.1). Same wave + endless flag = same plan.
 *   - campaign level with `groups`: the hand-made schedule
 *   - otherwise: budget formula from data/wave_formula.json
 *   - boss level: the level's boss + a smaller escort budget
 *   - endless (wave > campaignWaves): B(campaign) * (1 + growth)^(n - campaign), a boss every `bossEvery` waves
 * Runs once per wave start / PreWave preview, so it may allocate freely.
 */
import type { EnemyDef, GameData, Rng, SpawnGroup, WavePlanner } from '../contracts';
import { createRng } from '../core/rng';
import { formulaExtras, type FormulaExtras } from './tunables';

export type WavePlan = ReturnType<WavePlanner['plan']>;

/** Seconds are rounded so plans print cleanly and compare exactly. */
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Same fallback seed rule as core/app.makeWaveParams. */
export function waveSeed(data: GameData, wave: number, endless: boolean): number {
  const level = !endless || wave <= data.balance.campaignWaves ? data.levels[wave - 1] : undefined;
  return level?.seed ?? wave * 1000 + (endless ? 7 : 1);
}

/** B(n) = a + b*n + c*n^2 */
export function campaignBudget(data: GameData, n: number): number {
  const { a, b, c } = data.waveFormula.budget;
  return a + b * n + c * n * n;
}

export function waveBudget(data: GameData, wave: number, endless: boolean): number {
  const campaign = data.balance.campaignWaves;
  if (endless && wave > campaign) {
    return campaignBudget(data, campaign) * Math.pow(1 + data.waveFormula.endless.growthPerWave, wave - campaign);
  }
  return campaignBudget(data, wave);
}

/**
 * Spend `budget` on enemies unlocked by wave n. Each pick costs its threat. Pick weight =
 * (newEnemyWeight on firstWave..firstWave+2, else 1) / threat^threatWeightExponent:
 * exponent 0 picks types uniformly (big siege types then eat most of the budget),
 * 1 gives every type an equal expected share of the budget.
 */
function buyEnemies(data: GameData, budget: number, n: number, rng: Rng, threatExponent: number): EnemyDef[] {
  const pool: EnemyDef[] = [];
  const weights: number[] = [];
  for (const e of data.enemies.values()) {
    if (e.firstWave > n) continue;
    pool.push(e);
    const fresh = n <= e.firstWave + 2 ? data.waveFormula.newEnemyWeight : 1;
    weights.push(fresh / Math.pow(e.threat, threatExponent));
  }
  const bought: EnemyDef[] = [];
  let left = budget;
  // the guard only stops a runaway loop on absurd data; threat is always > 0
  for (let guard = 0; guard < 10_000; guard++) {
    let total = 0;
    for (let i = 0; i < pool.length; i++) if (pool[i].threat <= left) total += weights[i];
    if (total <= 0) break;
    let roll = rng.next() * total;
    let pick = -1;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].threat > left) continue;
      pick = i;
      roll -= weights[i];
      if (roll < 0) break;
    }
    bought.push(pool[pick]);
    left -= pool[pick].threat;
  }
  return bought;
}

/**
 * Shuffle, split into subwaves (later ones slightly bigger), lay out spawn times.
 * If spawning would run longer than maxSpawnTime, intervals and gaps shrink together
 * (SPEC: a wave lasts 2-4 minutes). Consecutive same-type spawns merge into one group.
 */
function scheduleFormula(data: GameData, enemies: EnemyDef[], rng: Rng, extras: FormulaExtras): SpawnGroup[] {
  const f = data.waveFormula;
  const groups: SpawnGroup[] = [];
  if (enemies.length === 0) return groups;
  for (let i = enemies.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = enemies[i];
    enemies[i] = enemies[j];
    enemies[j] = tmp;
  }
  const lo = Math.min(f.subwaves.min, f.subwaves.max);
  const hi = Math.max(f.subwaves.min, f.subwaves.max);
  const k = Math.max(1, Math.min(enemies.length, rng.int(lo, hi)));
  const base = Math.floor(enemies.length / k);
  const extra = enemies.length % k;
  const sizes: number[] = [];
  const intervals: number[] = [];
  const gaps: number[] = [];
  let total = 0;
  for (let s = 0; s < k; s++) {
    sizes.push(base + (s >= k - extra ? 1 : 0));
    intervals.push(rng.range(f.spawnInterval.min, f.spawnInterval.max));
    gaps.push(s < k - 1 ? rng.range(f.subwaveGap.min, f.subwaveGap.max) : 0);
    total += (sizes[s] - 1) * intervals[s] + gaps[s];
  }
  const squeeze = total > extras.maxSpawnTime ? extras.maxSpawnTime / total : 1;
  let t = extras.firstSpawnAt;
  let at = 0;
  for (let s = 0; s < k; s++) {
    // squeezed intervals round down so many spawns never overshoot maxSpawnTime
    const interval = squeeze < 1 ? Math.floor(intervals[s] * squeeze * 100) / 100 : round2(intervals[s]);
    let open: SpawnGroup | null = null;
    for (let j = 0; j < sizes[s]; j++) {
      const id = enemies[at + j].id;
      if (open && open.enemy === id) {
        open.count++;
      } else {
        open = { enemy: id, count: 1, interval, startAt: round2(t + j * interval) };
        groups.push(open);
      }
    }
    at += sizes[s];
    t += (sizes[s] - 1) * interval + gaps[s] * squeeze;
  }
  return groups;
}

/** Bosses that end a campaign boss level, in wave order (beaten by anyone who reached Endless). */
function campaignBosses(data: GameData): string[] {
  const out: string[] = [];
  for (const l of data.levels) if (l.kind === 'boss' && l.bossId && !out.includes(l.bossId)) out.push(l.bossId);
  return out;
}

export function createPlanner(data: GameData): WavePlanner & { budget(wave: number, endless: boolean): number } {
  return {
    budget: (wave, endless) => waveBudget(data, wave, endless),

    plan(wave, endless) {
      const n = Math.max(1, Math.floor(wave));
      const campaign = data.balance.campaignWaves;
      const isEndless = endless && n > campaign;
      const level = isEndless ? undefined : data.levels[n - 1];
      const extras = formulaExtras(data);
      const rng = createRng(waveSeed(data, n, endless));

      let bossId: string | null = null;
      if (level?.kind === 'boss' && level.bossId) {
        bossId = level.bossId;
      } else if (isEndless && n % data.waveFormula.endless.bossEvery === 0) {
        // SPEC: a boss "already beaten" — every boss on a campaign boss level qualifies [เดา: no profile here]
        const candidates = campaignBosses(data);
        if (candidates.length === 0) for (const id of data.bosses.keys()) candidates.push(id);
        if (candidates.length > 0) bossId = rng.pick(candidates);
      }

      let groups: SpawnGroup[];
      if (level?.groups) {
        groups = level.groups.map((g) => ({ ...g }));
      } else {
        const budget = waveBudget(data, n, endless) * (bossId ? extras.escortBudgetFactor : 1);
        groups = scheduleFormula(data, buyEnemies(data, budget, n, rng, extras.threatWeightExponent), rng, extras);
      }
      return { groups, bossId, bossAt: bossId ? extras.bossAt : 0 };
    },
  };
}
