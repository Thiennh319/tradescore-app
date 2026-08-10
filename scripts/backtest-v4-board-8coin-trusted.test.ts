/**
 * Vitest orchestrator — Task 5 board 8-coin V4 trusted verify.
 */
import { describe, it } from 'vitest';
import { run } from './backtest-v4-board-8coin-trusted';

describe('backtest-v4-board-8coin-trusted', () => {
  it(
    'runs TRADE_SYMBOLS 8-coin V4 absolute CVD trusted window and writes report',
    { timeout: 1_800_000 },
    async () => {
      await run();
    },
  );
});
