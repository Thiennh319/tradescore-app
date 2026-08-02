/**
 * Vitest harness — react-native → react-native-web alias (vitest.config).
 * Runs Task 2 Part A ambiguity sweep: 4 symbols × 5 thresholds × 180d.
 *
 *   npx vitest run scripts/sweep-v4-ambiguity-180d.test.ts
 */
import path from 'node:path';
import { describe, it } from 'vitest';
import {
  runAmbiguitySweep,
} from './backtest-v4-near-90d';
import { TRADE_SYMBOLS } from '../constants/scoring';

describe('sweep-v4-ambiguity-180d', () => {
  it(
    'runs 4-coin × 5-threshold ambiguity sweep (180d)',
    { timeout: 3_600_000 },
    async () => {
      const outDir = path.resolve(
        process.cwd(),
        'docs/exports/ambiguity-sweep-180d',
      );
      await runAmbiguitySweep({
        symbols: [...TRADE_SYMBOLS],
        days: 180,
        outDir,
        thresholds: [1.0, 1.5, 2.0, 2.5, 3.0],
      });
    },
  );
});
