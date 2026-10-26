/**
 * Data fields systems/ reads that the contract schemas do not declare yet.
 *
 * The values live in data/*.json, but zod strips unknown keys while loading,
 * so until the lead extends WaveFormulaSchema / BalanceSchema (see the systems
 * phase-3 report, CONTRACT REQUESTS) these readers fall back to the constants
 * below. Keep each constant equal to the JSON value.
 */
import type { GameData } from '../contracts';

/** Fallbacks, mirrored in data/wave_formula.json */
const FORMULA_FALLBACK = {
  /** seconds after wave start before the first formula subwave spawns [เดา] */
  firstSpawnAt: 4,
  /** formula waves squeeze intervals + gaps so spawning ends within this many seconds [เดา: SPEC wants 2-4 min waves] */
  maxSpawnTime: 170,
  /** enemy pick weight is divided by threat^this (0 = uniform types, 1 = equal budget share per type) [เดา] */
  threatWeightExponent: 1,
  boss: {
    /** escort budget on a boss wave = B(n) * this [เดา] */
    escortBudgetFactor: 0.35,
    /** seconds after wave start when the boss walks in [เดา] */
    bossAt: 6,
  },
} as const;

/** Fallbacks, mirrored in data/balance.json economy */
const ECONOMY_FALLBACK = {
  /** switching a spell's tier-3 branch costs this fraction of the new branch's tier-3 price [SPEC 6.2: 25%] */
  respecCostFrac: 0.25,
} as const;

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export interface FormulaExtras {
  firstSpawnAt: number;
  maxSpawnTime: number;
  threatWeightExponent: number;
  escortBudgetFactor: number;
  bossAt: number;
}

export function formulaExtras(data: GameData): FormulaExtras {
  const f = data.waveFormula as unknown as {
    firstSpawnAt?: unknown;
    maxSpawnTime?: unknown;
    threatWeightExponent?: unknown;
    boss?: { escortBudgetFactor?: unknown; bossAt?: unknown };
  };
  return {
    firstSpawnAt: num(f.firstSpawnAt, FORMULA_FALLBACK.firstSpawnAt),
    maxSpawnTime: Math.max(1, num(f.maxSpawnTime, FORMULA_FALLBACK.maxSpawnTime)),
    threatWeightExponent: num(f.threatWeightExponent, FORMULA_FALLBACK.threatWeightExponent),
    escortBudgetFactor: num(f.boss?.escortBudgetFactor, FORMULA_FALLBACK.boss.escortBudgetFactor),
    bossAt: num(f.boss?.bossAt, FORMULA_FALLBACK.boss.bossAt),
  };
}

export function respecCostFrac(data: GameData): number {
  const e = data.balance.economy as unknown as { respecCostFrac?: unknown };
  return num(e.respecCostFrac, ECONOMY_FALLBACK.respecCostFrac);
}
