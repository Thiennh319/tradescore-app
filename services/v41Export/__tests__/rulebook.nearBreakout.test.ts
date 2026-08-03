/**
 * Task 5 / Task 6 / Task 7 / Task 7b — NEARUSDT breakout branch in rulebook export.
 * BTC/SOL/BNB keep Trend Reversal checklist + Reasons unchanged.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as breakoutDetector from '../../v41/breakoutDetector';
import type { BreakoutTradeLevels } from '../../v41/breakoutDetector';
import type { KlineV41 } from '../../v41/indicators';
import type { SignalRowV41 } from '../../v41/scanV41';
import type { MarketIntelligenceSnapshot } from '../../v41/types';
import {
  buildRulebookV41Trace,
  buildRulebookV41Export,
  BREAKOUT_MC_REASON_VI,
  BREAKOUT_DECISION_REASON_VI,
} from '../rulebook';
import { resolveSymbolStrategy } from '../../v41/strategy/resolveSymbolStrategy';

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

function buildFlatKlines(count: number): KlineV41[] {
  return Array.from({ length: count }, (_, index) =>
    buildKline({ openTime: index * 3_600_000, closeTime: index * 3_600_000 + 1 }),
  );
}

function fixtureSnapshot(): MarketIntelligenceSnapshot {
  return {
    trendStrength: 40,
    trendDirection: 'NEUTRAL',
    trendExhaustion: 20,
    volumeDivergencePts: 0,
    reversalProbability: 20,
    rsiDivergenceScore: 0,
    cvdDivergenceScore: 0,
    marketConfidence: 20,
    btcAlignmentFactor: 1,
    btcDirection: 'NEUTRAL',
    marketState: 'Range',
    scanTimestamp: 1_700_000_000_000,
  };
}

/** WATCH-like row: has 1H klines (INPUT SNAPSHOT YES) but no actionable Confirm B. */
function fixtureRow(
  symbol: string,
  options?: { omitKlines1H?: boolean; klines1H?: KlineV41[] },
): SignalRowV41 {
  return {
    symbol,
    snapshot: fixtureSnapshot(),
    visibilityMode: 'WATCH_MODE',
    fetchedAt: 1_700_000_000_000,
    fundingRate: 0.0001,
    klines1H: options?.omitKlines1H
      ? undefined
      : (options?.klines1H ?? buildFlatKlines(30)),
    klines4H: buildFlatKlines(70),
    btcKlines4H: buildFlatKlines(70),
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
      momentumLong: 0,
      momentumShort: 0,
      momentumConfirmedLong: false,
      momentumConfirmedShort: false,
      signalsLong: [],
      signalsShort: [],
      tpMultiplier: 1,
      slMultiplier: 1,
    },
  };
}

function evidenceMap(
  rule: { evidence?: Array<{ label: string; value: unknown }> },
): Record<string, unknown> {
  return Object.fromEntries((rule.evidence ?? []).map((e) => [e.label, e.value]));
}

const MC_RULE_IDS = [
  'market_context_btc',
  'market_context_funding',
  'market_context_oi',
  'market_context_whale',
  'market_context_volatility',
] as const;

const DECISION_RULE_IDS = [
  'decision_long_short',
  'decision_watch',
  'decision_ignore',
  'decision_final_output',
  'decision_eligibility',
] as const;

describe('rulebook NEARUSDT breakout branch (Task 5 + Task 6 + Task 7b)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolveSymbolStrategy(NEARUSDT) === breakout', () => {
    expect(resolveSymbolStrategy('NEARUSDT')).toBe('breakout');
    expect(resolveSymbolStrategy('BTCUSDT')).toBe('trend_reversal');
    expect(resolveSymbolStrategy('SOLUSDT')).toBe('trend_reversal');
    expect(resolveSymbolStrategy('BNBUSDT')).toBe('trend_reversal');
  });

  it('NEAR: no Trend Reversal checklist; breakout_strategy + breakout_context present', () => {
    const trace = buildRulebookV41Trace({ row: fixtureRow('NEARUSDT') });
    const ids = new Set(trace.rules.map((r) => r.id));
    expect(ids.has('breakout_strategy')).toBe(true);
    expect(ids.has('breakout_context')).toBe(true);
    expect(ids.has('breakout_setup')).toBe(false);
    expect(ids.has('breakout_confirmed_active')).toBe(false);
    expect(ids.has('trend_4h')).toBe(false);
    expect(ids.has('cvd_flip')).toBe(false);
    expect(ids.has('trend_reversal_confidence')).toBe(false);
  });

  it('Task 6 NEAR WATCH: market_context ×5 + decision ×5 SKIPPED with breakout N/A reasons', () => {
    const trace = buildRulebookV41Trace({ row: fixtureRow('NEARUSDT') });
    expect(trace.input.hasKlines1H).toBe(true);
    expect(trace.summary.decisionOutput).toBe('WATCH');

    for (const id of MC_RULE_IDS) {
      const r = trace.rules.find((x) => x.id === id)!;
      expect(r.status).toBe('SKIPPED');
      expect(r.reasonVi).toBe(BREAKOUT_MC_REASON_VI);
    }

    for (const id of DECISION_RULE_IDS) {
      const r = trace.rules.find((x) => x.id === id)!;
      expect(r.status).toBe('SKIPPED');
      expect(r.reasonVi).toBe(BREAKOUT_DECISION_REASON_VI);
    }
  });

  it('Task 6b NEAR: Source Module of rules 03–12 matches BTC TR-path modules (not resolveSymbolStrategy)', () => {
    const near = buildRulebookV41Trace({ row: fixtureRow('NEARUSDT') });
    const btc = buildRulebookV41Trace({ row: fixtureRow('BTCUSDT') });

    const expectedMc = 'services/v41/marketContextFilter.ts';
    for (const id of MC_RULE_IDS) {
      const n = near.rules.find((r) => r.id === id)!;
      const b = btc.rules.find((r) => r.id === id)!;
      expect(n.sourceModule, id).toBe(expectedMc);
      expect(n.sourceModule, id).toBe(b.sourceModule);
      expect(n.sourceModule).not.toContain('resolveSymbolStrategy');
      expect(n.dataSourceDetail ?? '').toMatch(/không được gọi trên breakout path/);
    }

    const expectedDecision: Record<(typeof DECISION_RULE_IDS)[number], string> = {
      decision_long_short:
        'services/v41/decision/decisionConfig.ts (thresholds.long/short)',
      decision_watch: 'services/v41/decision/decisionConfig.ts (thresholds.watch/long)',
      decision_ignore: 'services/v41/decision/decisionConfig.ts + decisionEngine ladder',
      decision_final_output: 'services/v41/decisionEngine.ts (evaluateDecision → state)',
      decision_eligibility: 'services/v41/decisionEngine.ts (isEligibleForDirection)',
    };

    for (const id of DECISION_RULE_IDS) {
      const n = near.rules.find((r) => r.id === id)!;
      const b = btc.rules.find((r) => r.id === id)!;
      expect(n.sourceModule, id).toBe(expectedDecision[id]);
      expect(n.sourceModule, id).toBe(b.sourceModule);
      expect(n.sourceModule).not.toContain('resolveSymbolStrategy');
      expect(n.dataSourceDetail ?? '').toMatch(/không được gọi trên breakout path/);
    }
  });

  it('Task 6 BTC regression: TR path keeps classic MC / decision Reasons', () => {
    const btcWatch = buildRulebookV41Trace({ row: fixtureRow('BTCUSDT') });
    const mcBtc = btcWatch.rules.find((r) => r.id === 'market_context_btc')!;
    expect(mcBtc.reasonVi).toMatch(/Market Context không áp dụng \(Trend Reversal ≠ ACTIVE\)/);
    expect(mcBtc.reasonVi).not.toBe(BREAKOUT_MC_REASON_VI);
    expect(mcBtc.sourceModule).toBe('services/v41/marketContextFilter.ts');

    const btcNoKlines = buildRulebookV41Trace({
      row: fixtureRow('BTCUSDT', { omitKlines1H: true }),
    });
    const elig = btcNoKlines.rules.find((r) => r.id === 'decision_eligibility')!;
    expect(elig.reasonVi).toMatch(/Thiếu decisionContext/);
    expect(elig.reasonVi).not.toBe(BREAKOUT_DECISION_REASON_VI);
    expect(elig.sourceModule).toBe(
      'services/v41/decisionEngine.ts (isEligibleForDirection)',
    );

    for (const sym of ['SOLUSDT', 'BNBUSDT'] as const) {
      const t = buildRulebookV41Trace({ row: fixtureRow(sym) });
      const mc = t.rules.find((r) => r.id === 'market_context_btc')!;
      expect(mc.sourceModule).toBe('services/v41/marketContextFilter.ts');
      expect(mc.reasonVi).toMatch(/Trend Reversal ≠ ACTIVE/);
    }
  });

  it('Task 7b WATCH: breakout_context INFO only; no breakout_confirmed_active', () => {
    const trace = buildRulebookV41Trace({ row: fixtureRow('NEARUSDT') });
    const ctx = trace.rules.find((r) => r.id === 'breakout_context')!;
    expect(ctx.status).toBe('INFO');
    expect(ctx.threshold).toBe('N/A — mô tả bối cảnh');
    expect(ctx.actual).toBe('no_active_setup');
    expect(trace.rules.some((r) => r.id === 'breakout_confirmed_active')).toBe(false);
    expect(trace.rules.some((r) => r.id === 'breakout_setup')).toBe(false);

    const ev = evidenceMap(ctx);
    expect(ev.rangeHigh).toBeTypeOf('number');
    expect(ev.rangeLow).toBeTypeOf('number');
    expect(ev.widthPct).toBeTypeOf('number');
    expect(ev.breakoutDetected).toBe(false);
    expect(ev.awaitingRetest).toBe(false);
    expect(ev.maxRetestBars).toBe(10);
    expect(ev.entry).toBeUndefined();
    expect(ev.atrValue).toBeUndefined();
    expect(ev.sl).toBeUndefined();
    expect(ev.tp1).toBeUndefined();

    // SUMMARY auto from rules.length (no hardcode 16)
    expect(trace.summary.totalRules).toBe(trace.rules.length);
    expect(trace.summary.info).toBe(trace.rules.filter((r) => r.status === 'INFO').length);
  });

  it('Task 7b omit klines: breakout_context UNAVAILABLE fields; still no confirmed_active', () => {
    const trace = buildRulebookV41Trace({
      row: fixtureRow('NEARUSDT', { omitKlines1H: true }),
    });
    const ctx = trace.rules.find((r) => r.id === 'breakout_context')!;
    expect(ctx.status).toBe('INFO');
    const ev = evidenceMap(ctx);
    expect(String(ev.rangeHigh)).toMatch(/UNAVAILABLE — thiếu klines1H/);
    expect(trace.rules.some((r) => r.id === 'breakout_confirmed_active')).toBe(false);
  });

  it('Task 7b active: breakout_context INFO + breakout_confirmed_active PASS/CONFIRMED', () => {
    const klines1H = buildFlatKlines(40);
    const last = klines1H[klines1H.length - 1]!;
    const breakoutBar = klines1H[klines1H.length - 5]!;
    const mocked: BreakoutTradeLevels = {
      side: 'LONG',
      entry: 105,
      sl: 99,
      tp1: 114,
      slDistancePct: ((105 - 99) / 105) * 100,
      tp1RR: 1.5,
      rangeHigh: 101,
      rangeLow: 99,
      confirmMode: 'retest',
      consolidationMode: 'width',
      breakoutOpenTime: breakoutBar.openTime,
      activeOpenTime: last.openTime,
    };
    vi.spyOn(breakoutDetector, 'scanBreakoutSetups').mockReturnValue([mocked]);

    const trace = buildRulebookV41Trace({
      row: fixtureRow('NEARUSDT', { klines1H }),
    });

    const ctx = trace.rules.find((r) => r.id === 'breakout_context')!;
    expect(ctx.status).toBe('INFO');
    expect(ctx.threshold).toBe('N/A — mô tả bối cảnh');
    expect(ctx.actual).toBe('active_setup');
    const ctxEv = evidenceMap(ctx);
    expect(ctxEv.breakoutDetected).toBe(true);
    expect(ctxEv.side).toBe('LONG');
    expect(ctxEv.awaitingRetest).toBe(false);
    expect(ctxEv.entry).toBeUndefined();
    expect(ctxEv.atrValue).toBeUndefined();

    const conf = trace.rules.find((r) => r.id === 'breakout_confirmed_active')!;
    expect(conf.status).toBe('PASS');
    expect(conf.actual).toBe('CONFIRMED');
    expect(conf.threshold).toBe('Confirm B retest + ATR×1.0 within 80×1H');
    const confEv = evidenceMap(conf);
    expect(confEv.side).toBe('LONG');
    expect(confEv.entry).toBe(105);
    expect(confEv.sl).toBe(99);
    expect(confEv.tp1).toBe(114);
    expect(confEv.tp1RR).toBe(1.5);
    expect(confEv.setupRangeHigh).toBe(101);
    expect(confEv.setupRangeLow).toBe(99);
    expect(confEv.confirmMode).toBe('retest');
    expect(confEv.breakoutOpenTime).toBe(breakoutBar.openTime);
    expect(confEv.activeOpenTime).toBe(last.openTime);
    expect(typeof confEv.atrValue === 'number' || String(confEv.atrValue).startsWith('UNAVAILABLE')).toBe(
      true,
    );

    expect(trace.summary.totalRules).toBe(trace.rules.length);
    expect(trace.summary.passed).toBeGreaterThanOrEqual(1);
    expect(trace.rules.some((r) => r.id === 'breakout_side')).toBe(true);

    // EVALUATION TABLE / markdown auto-includes both IDs; SUMMARY from rules.length
    const md = buildRulebookV41Export({
      row: fixtureRow('NEARUSDT', { klines1H }),
      metadata: { generatedAt: '2026-08-02T00:00:00.000Z' },
    });
    expect(md).toContain('breakout_context');
    expect(md).toContain('breakout_confirmed_active');
    expect(md).not.toContain('breakout_setup');
    expect(md).toContain('Total Rules');
    expect(md).toMatch(/Total Rules: \d+/);
  });
});
