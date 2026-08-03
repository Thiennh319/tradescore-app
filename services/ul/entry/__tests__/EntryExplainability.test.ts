/**
 * Task 15.7.1 — Entry Quality explainability tests.
 */
import { describe, expect, it } from 'vitest';
import {
  buildEntryQualityEvidence,
  buildEntryQualityReport,
  ENTRY_QUALITY_EVIDENCE_MISSING,
  formatEntryEvidenceLine,
} from '../index';
import type {
  EntryQualityEntryDecisionInput,
  EntryQualityMarketSnapshot,
  EntryQualityRuleBookView,
} from '../EntryQualityTypes';

function baseMarket(): EntryQualityMarketSnapshot {
  return {
    price: 100,
    emaFast: 102,
    emaMid: 100,
    emaSlow: 98,
    emaSlope: 'UP',
    trendDirection: 'BULL',
    momentum: 1.2,
    rsi: 52,
    macdHistogram: 0.3,
    volumeRatio: 1.5,
    cvdTrend: 'UP',
    oiChangePct: 2,
    fundingRate: 0.0001,
    longShortRatio: 1.0,
    whaleWall: 'SUPPORT',
    support: 99.5,
    resistance: 105,
    atrPct: 1.5,
    spreadPct: 0.02,
    liquidityScore: 80,
    sessionQuality: 'GOOD',
  };
}

function baseEntry(): EntryQualityEntryDecisionInput {
  return { side: 'LONG', plannedRr: 2.5, timing: 'ON_TIME', executionReady: true };
}

function readyBook(): EntryQualityRuleBookView {
  return { status: 'READY', minRr: 2 };
}

describe('Entry explainability', () => {
  it('PASS evidence — EMA alignment', () => {
    const report = buildEntryQualityReport(baseMarket(), baseEntry(), readyBook());
    const ema = report.evidence.find((e) => e.checkId === 'ema_alignment');
    expect(ema).toBeTruthy();
    expect(ema!.status).toBe('PASS');
    expect(ema!.actual).toBe('EMA20 > EMA50 > EMA200');
    expect(ema!.expected).toBe('Bullish Alignment');
    expect(ema!.source).toBe('EMA');
    expect(ema!.reason).toBeTruthy();
    expect(ema!.recommendation).toBeTruthy();
  });

  it('FAIL evidence — volume + RR', () => {
    const market = { ...baseMarket(), volumeRatio: 0.83 };
    const entry = { ...baseEntry(), plannedRr: 1.35 };
    const report = buildEntryQualityReport(market, entry, readyBook());

    const vol = report.evidence.find((e) => e.checkId === 'volume_confirmation')!;
    expect(vol.status).toBe('FAIL');
    expect(vol.actual).toBe('0.83');
    expect(vol.expected).toContain('1.2');
    expect(vol.unit).toBe('ratio');
    expect(vol.source).toBe('Volume');

    const rr = report.evidence.find((e) => e.checkId === 'risk_reward')!;
    expect(rr.status).toBe('FAIL');
    expect(rr.actual).toBe('1.35');
    expect(rr.expected).toBe('>=2');
    expect(rr.unit).toBe('RR');
  });

  it('WARNING evidence — whale with size', () => {
    const market: EntryQualityMarketSnapshot = {
      ...baseMarket(),
      whaleWall: 'NONE',
      whaleSizeUsdt: 6_400_000,
    };
    const report = buildEntryQualityReport(market, baseEntry(), readyBook());
    const whale = report.evidence.find((e) => e.checkId === 'whale_wall')!;
    expect(whale.status).toBe('WARNING');
    expect(whale.actual).toContain('6.4M');
    expect(whale.unit).toBe('USDT');
    expect(whale.source).toBe('Whale');
  });

  it('Missing values → n/a', () => {
    const report = buildEntryQualityReport(
      { trendDirection: 'RANGE' },
      { side: 'LONG' },
      { status: 'WATCH' },
    );
    const vol = report.evidence.find((e) => e.checkId === 'volume_confirmation')!;
    expect(vol.actual).toBe(ENTRY_QUALITY_EVIDENCE_MISSING);
    const ema = report.evidence.find((e) => e.checkId === 'ema_alignment')!;
    expect(ema.actual).toBe(ENTRY_QUALITY_EVIDENCE_MISSING);
    const rr = report.evidence.find((e) => e.checkId === 'risk_reward')!;
    expect(rr.actual).toBe(ENTRY_QUALITY_EVIDENCE_MISSING);
  });

  it('Formatting line helper', () => {
    const report = buildEntryQualityReport(baseMarket(), baseEntry(), readyBook());
    const funding = report.evidence.find((e) => e.checkId === 'funding')!;
    const line = formatEntryEvidenceLine(funding);
    expect(line).toContain('Funding');
    expect(line).toContain(funding.status);
    expect(line).toContain('actual=');
    expect(line).toContain('expected=');
    expect(line).toContain('Funding');
  });

  it('One evidence per check · no duplicates', () => {
    const report = buildEntryQualityReport(baseMarket(), baseEntry(), readyBook());
    expect(report.evidence.length).toBe(report.checks.length);
    const ids = report.evidence.map((e) => e.checkId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Stable output + score unchanged by evidence layer', () => {
    const a = buildEntryQualityReport(baseMarket(), baseEntry(), readyBook());
    const b = buildEntryQualityReport(baseMarket(), baseEntry(), readyBook());
    expect(a).toEqual(b);

    const checks = a.checks;
    const evidenceOnly = buildEntryQualityEvidence(
      checks,
      baseMarket(),
      baseEntry(),
      readyBook(),
    );
    expect(evidenceOnly).toEqual(a.evidence);
    // Rebuilding evidence alone does not alter score fields on report
    expect(a.score).toBe(b.score);
    expect(a.decision).toBe(b.decision);
    expect(a.grade).toBe(b.grade);
  });

  it('Empty report has empty evidence', () => {
    const report = buildEntryQualityReport(null, null, null);
    expect(report.evidence).toEqual([]);
  });
});
