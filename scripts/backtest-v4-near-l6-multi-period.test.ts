/**
 * Vitest wrapper — multi-period L6 stability (V4 NEAR).
 */
import { describe, it } from 'vitest';
import { runMultiPeriodAnalysis } from './backtest-v4-near-l6-multi-period';

describe('backtest-v4-near-l6-multi-period', () => {
  it(
    'runs 90/180/365d and writes near_rule_comparison_multi_period.md',
    { timeout: 900_000 },
    async () => {
      await runMultiPeriodAnalysis();
    },
  );
});
