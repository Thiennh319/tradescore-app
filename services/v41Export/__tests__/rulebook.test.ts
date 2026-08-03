import { describe, expect, it, vi } from 'vitest';
import { computeConfidenceEngineResult } from '../../v41/confidenceEngine';
import { readConfidenceDecisionContext } from '../../v41/confidence/decisionContext';
import { V41_DECISION_CONFIG } from '../../v41/decision/decisionConfig';
import {
  computeDecisionEngineResult,
  isEligibleForDirection,
} from '../../v41/decisionEngine';
import type { KlineV41 } from '../../v41/indicators';
import { evaluateTrendReversalWithContext } from '../../v41/marketContextFilter';
import type { SignalRowV41 } from '../../v41/scanV41';
import type { MarketIntelligenceSnapshot } from '../../v41/types';
import {
  buildDecisionBandRulesForTest,
  buildRulebookV41Export,
  buildRulebookV41TraceDocument,
  evaluateDecisionTierConsistency,
  V41_PANEL_EXPORT_OPTIONS,
} from '../index';
import { runV41RulebookExport } from '../wire/runV41MiExport';

const FIXED_GENERATED_AT = '2026-07-26T12:00:00.000Z';

const EXPECTED_RULE_IDS = [
  'cvd_flip',
  'volume_confirmation',
  'trend_exhaustion_gate',
  'structure_break',
  'trend_reversal_confidence',
  'market_context_btc',
  'market_context_funding',
  'market_context_oi',
  'market_context_whale',
  'market_context_volatility',
  'decision_long_short',
  'decision_watch',
  'decision_ignore',
  'decision_final_output',
  'decision_eligibility',
  'visibility_show',
  'visibility_hide',
  'early_warning_block',
  'momentum_confirmed',
] as const;

const TR_RULE_IDS = [
  'cvd_flip',
  'volume_confirmation',
  'trend_exhaustion_gate',
  'structure_break',
  'trend_reversal_confidence',
] as const;

function buildKline(overrides: Partial<KlineV41> = {}): KlineV41 {
  return {
    openTime: 0,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
    closeTime: 1,
    takerBuyVolume: 500,
    ...overrides,
  };
}

function buildFlatKlines(
  count: number,
  overrides: Partial<KlineV41> | ((index: number) => Partial<KlineV41>) = {},
): KlineV41[] {
  return Array.from({ length: count }, (_, index) => {
    const patch = typeof overrides === 'function' ? overrides(index) : overrides;
    return buildKline({ openTime: index, closeTime: index + 1, ...patch });
  });
}

function buildHhLhKlines(count = 30): KlineV41[] {
  const klines = buildFlatKlines(count, {
    close: 100,
    high: 101,
    low: 99,
    volume: 1000,
  });
  const olderIdx = count - 12;
  const newerIdx = count - 6;
  klines[olderIdx] = buildKline({
    openTime: olderIdx,
    closeTime: olderIdx + 1,
    open: 108,
    high: 110,
    low: 107,
    close: 109,
    volume: 1000,
    takerBuyVolume: 600,
  });
  for (let i = olderIdx - 3; i <= olderIdx + 3; i++) {
    if (i !== olderIdx) klines[i] = { ...klines[i], high: Math.min(klines[i].high, 108) };
  }
  klines[newerIdx] = buildKline({
    openTime: newerIdx,
    closeTime: newerIdx + 1,
    open: 104,
    high: 105,
    low: 103,
    close: 104,
    volume: 1000,
    takerBuyVolume: 600,
  });
  for (let i = newerIdx - 3; i <= newerIdx + 3; i++) {
    if (i !== newerIdx) klines[i] = { ...klines[i], high: Math.min(klines[i].high, 104) };
  }
  return klines;
}

/** Enough structure for evaluateTrendReversalWithContext → confidence → decision. */
function buildTrendActiveKlines(): KlineV41[] {
  const klines = buildHhLhKlines();
  const n = klines.length;
  for (let i = n - 3; i < n - 1; i++) {
    klines[i] = { ...klines[i], takerBuyVolume: 700, volume: 1000 };
  }
  klines[n - 1] = { ...klines[n - 1], takerBuyVolume: 200, volume: 2500 };
  return klines;
}

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

function fixtureRow(options?: { omitKlines1H?: boolean }): SignalRowV41 {
  const klines1H = options?.omitKlines1H ? undefined : buildTrendActiveKlines();
  return {
    symbol: 'BTCUSDT',
    snapshot: fixtureSnapshot(),
    visibilityMode: 'WATCH_MODE',
    fetchedAt: 1_700_000_000_000,
    fundingRate: 0.0001,
    klines1H,
    klines4H: buildFlatKlines(70, { high: 100.5, low: 99.5, volume: 1000 }),
    btcKlines4H: buildFlatKlines(70, { high: 100.5, low: 99.5, volume: 1000 }),
    earlyWarning: {
      severity: 'CLEAR',
      rawSeverity: 'CLEAR',
      signalCount: 0,
      volumeConfirmed: false,
      signals30M: [],
      signals1H: [],
      warningMessage: '',
      blockMessage: '',
      direction: 'BOTH',
    },
    momentum: {
      momentumLong: 1,
      momentumShort: 0,
      momentumConfirmedLong: false,
      momentumConfirmedShort: false,
      signalsLong: ['CVD_RISING_1H'],
      signalsShort: [],
      tpMultiplier: 1,
      slMultiplier: 1,
    },
  };
}

describe('v41Export Rulebook (Step 2)', () => {
  it('panel menu enables Market Intelligence + Rulebook; P1–P4 stay disabled', () => {
    const enabled = V41_PANEL_EXPORT_OPTIONS.filter((o) => o.enabled).map((o) => o.id);
    expect(enabled).toEqual(['marketIntelligence', 'rulebook']);
    expect(V41_PANEL_EXPORT_OPTIONS.find((o) => o.id === 'rulebook')?.label).toBe(
      'Rulebook',
    );
    const disabled = V41_PANEL_EXPORT_OPTIONS.filter((o) => !o.enabled).map((o) => o.id);
    expect(disabled).toEqual([
      'visibilityEntry',
      'decisionConfidence',
      'rc3',
      'position',
    ]);
  });

  it('đủ data → 19 rules; actual/threshold thật; OI/Whale SKIPPED + no data on row', () => {
    const doc = buildRulebookV41TraceDocument({
      row: fixtureRow(),
      metadata: { generatedAt: FIXED_GENERATED_AT },
    });
    expect(doc.rules.map((r) => r.id)).toEqual([...EXPECTED_RULE_IDS]);
    expect(doc.summary.totalRules).toBe(19);

    for (const rule of doc.rules) {
      if (rule.id === 'decision_final_output') {
        expect(rule.status).toBe('INFO');
        expect(rule.threshold).toBeNull();
        continue;
      }
      expect(rule.threshold, rule.id).not.toBeNull();
      expect(rule.threshold, rule.id).not.toBeUndefined();
      if (rule.id === 'market_context_oi' || rule.id === 'market_context_whale') {
        expect(rule.status).toBe('SKIPPED');
        expect(rule.reasonVi.toLowerCase()).toContain('không có data trên row');
        continue;
      }
      expect(rule.actual, rule.id).not.toBeNull();
      expect(rule.actual, rule.id).not.toBeUndefined();
    }

    const md = buildRulebookV41Export({
      row: fixtureRow(),
      metadata: { generatedAt: FIXED_GENERATED_AT },
    });
    expect(md).toContain('# 01_RULEBOOK_V41');
    expect(md).toContain('decision_eligibility');
    expect(md).toContain('CONDITION_AT_SCAN_TIME');
  });

  it('thiếu klines1H → TR (+ decision chain) SKIPPED, không bịa actual', () => {
    const doc = buildRulebookV41TraceDocument({
      row: fixtureRow({ omitKlines1H: true }),
      metadata: { generatedAt: FIXED_GENERATED_AT },
    });
    expect(doc.rules).toHaveLength(19);

    for (const id of TR_RULE_IDS) {
      const rule = doc.rules.find((r) => r.id === id);
      expect(rule?.status).toBe('SKIPPED');
      expect(rule?.actual).toBeNull();
      expect(rule?.reasonVi).toMatch(/Thiếu klines1H/);
    }

    for (const id of [
      'decision_long_short',
      'decision_watch',
      'decision_ignore',
      'decision_eligibility',
    ] as const) {
      const rule = doc.rules.find((r) => r.id === id);
      expect(rule?.status).toBe('SKIPPED');
    }

    const eligibility = doc.rules.find((r) => r.id === 'decision_eligibility');
    expect(eligibility?.actual).toBeNull();

    const finalOut = doc.rules.find((r) => r.id === 'decision_final_output');
    expect(finalOut?.status).toBe('INFO');
    expect(finalOut?.actual).toBeNull();
  });

  it('decision_eligibility matches direct isEligibleForDirection (no mirror)', () => {
    const row = fixtureRow();
    const tr = evaluateTrendReversalWithContext(
      { klines1H: row.klines1H!, trendDirection: row.snapshot.trendDirection },
      {
        fundingRate: row.fundingRate,
        klines4H: row.klines4H,
        btcKlines4H: row.btcKlines4H,
      },
    );
    const confidenceResult = computeConfidenceEngineResult(tr);
    computeDecisionEngineResult(confidenceResult);
    const ctx = readConfidenceDecisionContext(confidenceResult);
    expect(ctx).not.toBeNull();
    const direct = isEligibleForDirection(ctx!, V41_DECISION_CONFIG);

    const doc = buildRulebookV41TraceDocument({
      row,
      metadata: { generatedAt: FIXED_GENERATED_AT },
    });
    const eligibility = doc.rules.find((r) => r.id === 'decision_eligibility');
    expect(eligibility).toBeDefined();
    expect(eligibility?.dataSource).toBe('pure_recall');
    expect(eligibility?.dataSourceDetail).toContain('isEligibleForDirection');
    expect(eligibility?.actual).toBe(direct);
    expect(eligibility?.evidence?.some((e) => e.label === 'isEligibleForDirection')).toBe(
      true,
    );
  });

  it('runV41RulebookExport shares 01_RULEBOOK_V41_{SYMBOL}.md', async () => {
    const share = vi.fn(async (_filename: string, _markdown: string) => undefined);
    const result = await runV41RulebookExport([fixtureRow()], 'BTCUSDT', { share });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filename).toBe('01_RULEBOOK_V41_BTCUSDT.md');
    }
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith(
      '01_RULEBOOK_V41_BTCUSDT.md',
      expect.stringContaining('01_RULEBOOK_V41'),
    );
  });
});

describe('Rulebook Method A — decision bands + tier CRITICAL', () => {
  it('actual=82 + final LONG → long_short PASS, tier INFO (khớp)', () => {
    const rules = buildDecisionBandRulesForTest({ actual: 82, decisionFinal: 'LONG' });
    expect(rules.find((r) => r.id === 'decision_long_short')?.status).toBe('PASS');
    expect(rules.find((r) => r.id === 'decision_watch')?.status).toBe('FAIL');
    expect(rules.find((r) => r.id === 'decision_ignore')?.status).toBe('FAIL');
    expect(rules.find((r) => r.id === 'decision_final_output')?.actual).toBe('LONG');
    expect(evaluateDecisionTierConsistency(rules)).toBe('INFO');
  });

  it('actual=82 + final SHORT → long_short PASS (không tách rule SHORT), tier INFO', () => {
    const rules = buildDecisionBandRulesForTest({ actual: 82, decisionFinal: 'SHORT' });
    expect(rules.find((r) => r.id === 'decision_long_short')?.status).toBe('PASS');
    expect(rules.find((r) => r.id === 'decision_final_output')?.actual).toBe('SHORT');
    expect(evaluateDecisionTierConsistency(rules)).toBe('INFO');
  });

  it('actual=60 + final WATCH → watch PASS, tier INFO', () => {
    const rules = buildDecisionBandRulesForTest({ actual: 60, decisionFinal: 'WATCH' });
    expect(rules.find((r) => r.id === 'decision_watch')?.status).toBe('PASS');
    expect(rules.find((r) => r.id === 'decision_long_short')?.status).toBe('FAIL');
    expect(rules.find((r) => r.id === 'decision_ignore')?.status).toBe('FAIL');
    expect(evaluateDecisionTierConsistency(rules)).toBe('INFO');
  });

  it('actual=30 và actual=5 + final IGNORE → ignore PASS, reasonVi khác nhau, tier INFO', () => {
    const mid = buildDecisionBandRulesForTest({ actual: 30, decisionFinal: 'IGNORE' });
    const low = buildDecisionBandRulesForTest({ actual: 5, decisionFinal: 'IGNORE' });
    expect(mid.find((r) => r.id === 'decision_ignore')?.status).toBe('PASS');
    expect(low.find((r) => r.id === 'decision_ignore')?.status).toBe('PASS');
    expect(mid.find((r) => r.id === 'decision_ignore')?.reasonVi).toContain(
      'chưa đạt ngưỡng watch (45)',
    );
    expect(low.find((r) => r.id === 'decision_ignore')?.reasonVi).toContain(
      'dưới ngưỡng ignore gốc (25)',
    );
    expect(mid.find((r) => r.id === 'decision_ignore')?.reasonVi).not.toBe(
      low.find((r) => r.id === 'decision_ignore')?.reasonVi,
    );
    expect(evaluateDecisionTierConsistency(mid)).toBe('INFO');
    expect(evaluateDecisionTierConsistency(low)).toBe('INFO');
  });

  it('LỆCH: actual=60 (watch PASS) nhưng final=IGNORE → CRITICAL', () => {
    const rules = buildDecisionBandRulesForTest({ actual: 60, decisionFinal: 'IGNORE' });
    expect(rules.find((r) => r.id === 'decision_watch')?.status).toBe('PASS');
    expect(rules.find((r) => r.id === 'decision_ignore')?.status).toBe('FAIL');
    expect(rules.find((r) => r.id === 'decision_final_output')?.actual).toBe('IGNORE');
    // matchedTier=ignore nhưng ignore FAIL; watch (khác tier) PASS → CRITICAL
    expect(evaluateDecisionTierConsistency(rules)).toBe('CRITICAL');
  });

  it('LỆCH: actual=82 (long_short PASS) nhưng final=WATCH → CRITICAL', () => {
    const rules = buildDecisionBandRulesForTest({ actual: 82, decisionFinal: 'WATCH' });
    expect(rules.find((r) => r.id === 'decision_long_short')?.status).toBe('PASS');
    expect(rules.find((r) => r.id === 'decision_watch')?.status).toBe('FAIL');
    expect(evaluateDecisionTierConsistency(rules)).toBe('CRITICAL');
  });
});
