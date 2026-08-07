import { describe, expect, it, vi } from 'vitest';
import type { SignalRowV41 } from '../../v41/scanV41';
import type { MarketIntelligenceSnapshot } from '../../v41/types';
import {
  buildV41PairedMiRulebookMarkdown,
  resolveV41ExportRow,
  runV41MarketIntelligenceExport,
  runV41PairedMiRulebookExport,
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

  it('Market Intelligence + Rulebook + paired are enabled; P1–P4 stay disabled', () => {
    const enabled = V41_PANEL_EXPORT_OPTIONS.filter((o) => o.enabled).map((o) => o.id);
    expect(enabled).toEqual(['marketIntelligence', 'rulebook', 'miRulebookPair']);
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

describe('buildV41PairedMiRulebookMarkdown / runV41PairedMiRulebookExport', () => {
  function scanTimestampFromMd(md: string): string | null {
    const m = md.match(/Scan Timestamp \(ms\):\s*(\d+)/);
    return m?.[1] ?? null;
  }

  function generatedAtFromMd(md: string): string | null {
    const m = md.match(/Generated At:\s*(.+)/);
    return m?.[1]?.trim() ?? null;
  }

  it('paired docs from one build share identical Scan Timestamp and Generated At', () => {
    const row = fixtureRow('NEARUSDT');
    const fixedAt = '2026-08-07T04:31:53.790Z';
    const paired = buildV41PairedMiRulebookMarkdown(row, { generatedAt: fixedAt });

    expect(paired.scanTimestamp).toBe(1_700_000_000_000);
    expect(paired.generatedAt).toBe(fixedAt);

    const miTs = scanTimestampFromMd(paired.marketIntelligence.markdown);
    const rbTs = scanTimestampFromMd(paired.rulebook.markdown);
    expect(miTs).toBe('1700000000000');
    expect(rbTs).toBe(miTs);

    const miGen = generatedAtFromMd(paired.marketIntelligence.markdown);
    const rbGen = generatedAtFromMd(paired.rulebook.markdown);
    expect(miGen).toBe(fixedAt);
    expect(rbGen).toBe(fixedAt);

    expect(paired.marketIntelligence.filename).toBe(
      '01_MARKET_INTELLIGENCE_V41_NEARUSDT.md',
    );
    expect(paired.rulebook.filename).toBe('01_RULEBOOK_V41_NEARUSDT.md');
  });

  it('runV41PairedMiRulebookExport shares both files once each', async () => {
    const share = vi.fn(async () => undefined);
    const result = await runV41PairedMiRulebookExport(
      [fixtureRow('NEARUSDT')],
      'NEARUSDT',
      { share },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filenames).toEqual([
        '01_MARKET_INTELLIGENCE_V41_NEARUSDT.md',
        '01_RULEBOOK_V41_NEARUSDT.md',
      ]);
      expect(result.scanTimestamp).toBe(1_700_000_000_000);
    }
    expect(share).toHaveBeenCalledTimes(2);
  });

  it('two separate export calls can diverge Scan Timestamp when rows differ', () => {
    // Evidence: sequential solo exports are independent — documenting prior risk.
    const rowA = fixtureRow('NEARUSDT');
    const rowB: SignalRowV41 = {
      ...fixtureRow('NEARUSDT'),
      snapshot: { ...fixtureSnapshot(), scanTimestamp: 1_700_000_120_000 },
    };
    const mi = buildV41PairedMiRulebookMarkdown(rowA).marketIntelligence.markdown;
    const rb = buildV41PairedMiRulebookMarkdown(rowB).rulebook.markdown;
    expect(scanTimestampFromMd(mi)).not.toBe(scanTimestampFromMd(rb));
  });
});
