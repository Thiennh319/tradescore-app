/**
 * Vitest wrapper — Phương án A: 30d clean OI/LS real window.
 */
import { describe, it } from 'vitest';
import { main } from './backtest-v4-near-90d';

describe('backtest-v4-near-30d-real', () => {
  it(
    'runs NEAR V4 30d clean backtest (OI/LS paginated)',
    { timeout: 600_000 },
    async () => {
      process.argv = [
        process.argv[0] ?? 'node',
        'backtest-v4-near-90d.ts',
        '--days',
        '30',
        '--csv',
        'docs/exports/near_backtest_30d_real.csv',
        '--md',
        'docs/exports/near_rule_comparison_30d_real.md',
      ];
      await main();
    },
  );
});
