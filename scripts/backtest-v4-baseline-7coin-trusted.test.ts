/**
 * Vitest orchestrator — TASK 2/9 baseline 7-coin V4 absolute CVD.
 */
import { describe, it } from 'vitest';
import { run } from './backtest-v4-baseline-7coin-trusted';

describe('backtest-v4-baseline-7coin-trusted', () => {
  it(
    'runs BTC/SOL/BNB/XRP/ETH/LINK/AVAX V4 absolute baseline and writes report',
    { timeout: 1_800_000 },
    async () => {
      await run();
    },
  );
});
