/**
 * Vitest wrapper — aliases react-native → react-native-web (vitest.config).
 * Chạy trusted-window V3+V4 XRP backtest.
 */
import { describe, it } from 'vitest';
import { main } from './backtest-v3v4-xrp-trusted-window';

describe('backtest-v3v4-xrp-trusted-window', () => {
  it(
    'runs XRP V3+V4 trusted ~21d backtest and writes CSV/MD',
    { timeout: 600_000 },
    async () => {
      process.argv = [
        process.argv[0] ?? 'node',
        'backtest-v3v4-xrp-trusted-window.ts',
        '--symbol',
        'XRPUSDT',
        '--days',
        '21',
      ];
      await main();
    },
  );
});
