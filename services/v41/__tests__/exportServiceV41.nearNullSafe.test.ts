import { describe, expect, it } from 'vitest';
import { buildExportRowV41, formatAsTXTV41 } from '../exportServiceV41';
import type { SignalRowV41 } from '../scanV41';

function nearBase(overrides: Partial<SignalRowV41> = {}): SignalRowV41 {
  return {
    symbol: 'NEARUSDT',
    visibilityMode: 'WATCH_MODE',
    markPrice: 2.45,
    snapshot: {
      marketState: 'HealthyUptrend',
      trendStrength: 50,
      trendDirection: 'BULL',
      trendExhaustion: 10,
      volumeDivergencePts: 0,
      reversalProbability: 20,
      rsiDivergenceScore: 0,
      cvdDivergenceScore: 0,
      marketConfidence: 60,
      btcAlignmentFactor: 1,
      btcDirection: 'UP',
    },
    fetchedAt: 1_720_000_000_000,
    ...overrides,
  } as SignalRowV41;
}

describe('exportServiceV41 — NEAR Path A null-safe', () => {
  it('undefined reversalState → NONE / empty counter, no throw', () => {
    const row = buildExportRowV41(nearBase({ reversalState: undefined }));
    expect(row.reversalPhase).toBe('NONE');
    expect(row.reversalCounterDirection).toBe('');
    expect(String(row.reversalPhase)).not.toBe('undefined');
    expect(String(row.reversalCounterDirection)).not.toContain('undefined');
  });

  it('empty NONE state with null counterDirection → safe strings', () => {
    const row = buildExportRowV41(
      nearBase({
        reversalState: {
          phase: 'NONE',
          detectedAt: 0,
          retestPrice: null,
          counterDirection: null,
          expiresAt: null,
          symbol: 'NEARUSDT',
        },
      }),
    );
    expect(row.reversalPhase).toBe('NONE');
    expect(row.reversalCounterDirection).toBe('');
    const txt = formatAsTXTV41([row]);
    expect(txt).toContain('Không theo dõi đảo chiều');
    expect(txt).not.toMatch(/Counter:\s*undefined/);
    expect(txt).not.toMatch(/Phase:\s*undefined/);
  });

  it('BTC with RETEST_CONFIRMED still exports counter direction', () => {
    const row = buildExportRowV41(
      nearBase({
        symbol: 'BTCUSDT',
        reversalState: {
          phase: 'RETEST_CONFIRMED',
          detectedAt: 1,
          retestPrice: 65000,
          counterDirection: 'SHORT',
          expiresAt: null,
          symbol: 'BTCUSDT',
        },
      }),
    );
    expect(row.reversalPhase).toBe('RETEST_CONFIRMED');
    expect(row.reversalCounterDirection).toBe('SHORT');
  });
});
