/**
 * Vitest wrapper — aliases react-native → react-native-web (vitest.config).
 * Runs the V4 NEAR 90d backtest runner as a long test.
 */
import { describe, it } from 'vitest';
import { main } from './backtest-v4-near-90d';

describe('backtest-v4-near-90d', () => {
  it(
    'runs NEAR V4 90d backtest and writes CSV/MD',
    { timeout: 600_000 },
    async () => {
      process.argv = [
        process.argv[0] ?? 'node',
        'backtest-v4-near-90d.ts',
        '--csv',
        'docs/exports/near_backtest_90d.csv',
        '--md',
        'docs/exports/near_rule_comparison.md',
      ];
      await main();
    },
  );
});
