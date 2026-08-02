/**
 * Smoke: NEAR 14d single thr via vitest RN alias.
 *   npx vitest run scripts/smoke-v4-ambiguity.test.ts
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runV4Backtest, writeCsv, computeStats } from './backtest-v4-near-90d';

describe('smoke-v4-ambiguity', () => {
  it(
    'NEAR 14d amb=1.0 produces CSV columns',
    { timeout: 600_000 },
    async () => {
      const result = await runV4Backtest({
        symbol: 'NEARUSDT',
        days: 14,
        ambiguityThreshold: 1.0,
      });
      const out = path.resolve(
        process.cwd(),
        'docs/exports/_smoke_near_amb1.csv',
      );
      writeCsv(out, result.trades);
      const stats = computeStats(result.trades);
      console.log('smoke n=', stats.n, 'WR=', stats.wr);
      if (result.trades.length > 0) {
        const t = result.trades[0];
        expect(t).toHaveProperty('longScore');
        expect(t).toHaveProperty('shortScore');
        expect(t).toHaveProperty('scoreDiff');
        expect(t).toHaveProperty('ambiguityStatus');
        expect(t.ambiguityStatus).toBe('CLEAR');
      }
      expect(result.meta.ambiguityThreshold).toBe(1.0);
      expect(result.meta.symbol).toBe('NEARUSDT');
    },
  );
});
