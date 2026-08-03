import { describe, expect, it, vi } from 'vitest';
import type { SignalRowV41 } from '../../v41/scanV41';
import type { MarketIntelligenceSnapshot } from '../../v41/types';
import {
  resolveV41ExportRow,
  runV41MarketIntelligenceExport,
  V41_PANEL_EXPORT_OPTIONS,
} from '../wire/runV41MiExport';

function fixtureSnapshot(): MarketIntelligenceSnapshot {
  return {
    trendStrength: 82,
    trendDirection: 'BULL',
    trendExhaustion: 75,
    volumeDivergencePts: 20,
    reversalProbability: 55,
    rsiDivergenceScore: 50,
    cvdDivergenceScore: 0,
    marketConfidence: 41,
    btcAlignmentFactor: 1,
    btcDirection: 'BULL',
    marketState: 'Distribution',
    scanTimestamp: 1_700_000_000_000,
  };
}

function fixtureRow(symbol: string): SignalRowV41 {
  return {
    symbol,
    snapshot: fixtureSnapshot(),
    visibilityMode: 'WATCH_MODE',
    fetchedAt: 1_700_000_000_000,
  };
}

describe('runV41MarketIntelligenceExport', () => {
  it('resolves row by symbol', () => {
    const rows = [fixtureRow('BTCUSDT'), fixtureRow('SOLUSDT')];
    expect(resolveV41ExportRow(rows, 'SOLUSDT')?.symbol).toBe('SOLUSDT');
    expect(resolveV41ExportRow(rows, 'NEARUSDT')).toBeNull();
  });

  it('Market Intelligence + Rulebook are enabled; P1–P4 stay disabled', () => {
    const enabled = V41_PANEL_EXPORT_OPTIONS.filter((o) => o.enabled).map((o) => o.id);
    expect(enabled).toEqual(['marketIntelligence', 'rulebook']);
  });

  it('empty rows → ok:false, does not call share', async () => {
    const share = vi.fn(async () => undefined);
    const result = await runV41MarketIntelligenceExport([], 'BTCUSDT', { share });
    expect(result.ok).toBe(false);
    expect(share).not.toHaveBeenCalled();
  });

  it('missing symbol → ok:false', async () => {
    const share = vi.fn(async () => undefined);
    const result = await runV41MarketIntelligenceExport(
      [fixtureRow('BTCUSDT')],
      'SOLUSDT',
      { share },
    );
    expect(result.ok).toBe(false);
    expect(share).not.toHaveBeenCalled();
  });

  it('found row → wire markdown + share with expected filename', async () => {
    const share = vi.fn(async (_filename: string, _markdown: string) => undefined);
    const result = await runV41MarketIntelligenceExport(
      [fixtureRow('BTCUSDT')],
      'BTCUSDT',
      { share },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filename).toBe('01_MARKET_INTELLIGENCE_V41_BTCUSDT.md');
    }
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith(
      '01_MARKET_INTELLIGENCE_V41_BTCUSDT.md',
      expect.stringContaining('Market State: Distribution'),
    );
    expect(share).toHaveBeenCalledWith(
      '01_MARKET_INTELLIGENCE_V41_BTCUSDT.md',
      expect.stringContaining('## AI REVIEW SPECIFICATION (V4.1 — EMBEDDED)'),
    );
  });
});
