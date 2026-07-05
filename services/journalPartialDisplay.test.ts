import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import {
  buildJournalOpenPnlBreakdown,
  computeJournalPartialStats,
  enrichAdvisorLabelWithPartial,
  formatPartialCloseExitReason,
  resolveJournalCloseReasonDisplay,
  resolveJournalStatusLabel,
} from './journalService';

function openEntry(
  partialCloses: AiTradeJournalEntry['partialCloses'],
  sizeActual = 50,
): AiTradeJournalEntry {
  return {
    id: 't1',
    timestamp: 1,
    symbol: 'BTCUSDT',
    accountSizeAtEntry: 1000,
    market: {
      entryPrice: 100,
      priceAtAnalysis: 100,
      slippage: 0,
      cvdValue: 0,
      cvdTrend: 'FLAT',
      volumeRatio: 1,
      btcChangePct: 0,
      fundingRate: 0,
      topLSRatio: 1,
      oiChangePct: 0,
      sessionType: 'GOOD',
      hourVN: 10,
    },
    scoring: {
      totalScore: 10,
      direction: 'LONG',
      layerScores: {
        l1: 1,
        l2: 1,
        l3: 1,
        l4: 1,
        l5: 1,
        l6: 1,
        l7: 1,
        l8: 1,
        l9: 1,
        l10: 1,
      },
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
    },
    plan: {
      entryZoneType: 'LIMIT',
      entryZoneOptimal: 100,
      entryZoneRangeLow: 99,
      entryZoneRangeHigh: 101,
      slProposed: 95,
      slActual: 95,
      tp1Proposed: 110,
      tp1Actual: 110,
      tp2: 120,
      tp3: 130,
      rrProposed: 2,
      sizeProposed: 100,
      sizeActual,
      sizeOriginal: 100,
      isSafeSL: true,
    },
    outcome: { status: 'OPEN' },
    tags: [],
    version: '2.0.0',
    partialCloses,
  };
}

describe('journal partial display', () => {
  it('resolveJournalStatusLabel shows PARTIAL on OPEN', () => {
    const entry = openEntry([
      {
        partialClosePercent: 50,
        partialClosePrice: 110,
        partialCloseTime: 1,
        partialCloseReason: 'PARTIAL_TP1',
        realizedPnlUSDT: 25,
        realizedPnlPct: 50,
        closedSizeUsdt: 50,
      },
    ]);
    expect(resolveJournalStatusLabel(entry)).toBe('RUNNING • PARTIAL 50%');
  });

  it('buildJournalOpenPnlBreakdown splits realized and unrealized', () => {
    const entry = openEntry([
      {
        partialClosePercent: 50,
        partialClosePrice: 110,
        partialCloseTime: 1,
        partialCloseReason: 'PARTIAL_TP1',
        realizedPnlUSDT: 25,
        realizedPnlPct: 50,
        closedSizeUsdt: 50,
      },
    ]);
    const breakdown = buildJournalOpenPnlBreakdown(entry, 110, 5);
    expect(breakdown.hasPartial).toBe(true);
    expect(breakdown.closedPercent).toBe(50);
    expect(breakdown.remainingPercent).toBe(50);
    expect(breakdown.realizedPnl).toBe(25);
    expect(breakdown.unrealizedPnl).toBe(25);
    expect(breakdown.totalPnl).toBe(50);
  });

  it('formatPartialCloseExitReason after full close', () => {
    const entry: AiTradeJournalEntry = {
      ...openEntry([
        {
          partialClosePercent: 50,
          partialClosePrice: 110,
          partialCloseTime: 1,
          partialCloseReason: 'PARTIAL_TP1',
          realizedPnlUSDT: 25,
          realizedPnlPct: 50,
          closedSizeUsdt: 50,
        },
      ]),
      outcome: {
        status: 'WIN',
        exitPrice: 112,
        pnlUSDT: 60,
        pnlPct: 60,
      },
    };
    const label = formatPartialCloseExitReason(entry);
    expect(label).toContain('Chốt 50% tại 110');
    expect(label).toContain('Đóng 50% còn lại tại 112');
    expect(resolveJournalCloseReasonDisplay(entry)).toBe(label);
  });

  it('enrichAdvisorLabelWithPartial prefixes badge', () => {
    const entry = openEntry([
      {
        partialClosePercent: 30,
        partialClosePrice: 105,
        partialCloseTime: 1,
        partialCloseReason: 'PARTIAL_CLOSE_30',
        realizedPnlUSDT: 5,
        realizedPnlPct: 10,
        closedSizeUsdt: 30,
      },
    ]);
    expect(enrichAdvisorLabelWithPartial(entry, 'Tiếp tục giữ')).toBe(
      'Đã chốt 30% · Tiếp tục giữ',
    );
  });

  it('computeJournalPartialStats aggregates', () => {
    const stats = computeJournalPartialStats([
      openEntry([
        {
          partialClosePercent: 50,
          partialClosePrice: 110,
          partialCloseTime: 1,
          partialCloseReason: 'PARTIAL_TP1',
          realizedPnlUSDT: 10,
          realizedPnlPct: 20,
          closedSizeUsdt: 50,
        },
      ]),
      openEntry([]),
    ]);
    expect(stats.partialTradeCount).toBe(1);
    expect(stats.totalRealizedPnl).toBe(10);
  });
});

describe('journal gist sync shape', () => {
  it('serializes partialCloses fields in journal.json payload', () => {
    const entry = openEntry([
      {
        partialClosePercent: 50,
        partialClosePrice: 110,
        partialCloseTime: 1_700_000_000_000,
        partialCloseReason: 'PARTIAL_TP1',
        realizedPnlUSDT: 25,
        realizedPnlPct: 50,
        closedSizeUsdt: 50,
      },
    ]);
    const wrapper = {
      version: '1.0.2',
      lastUpdated: new Date().toISOString(),
      deviceId: 'APK' as const,
      data: [entry],
    };
    const json = JSON.stringify(wrapper);
    expect(json).toContain('"partialCloses"');
    expect(json).toContain('"partialClosePercent":50');
    expect(json).toContain('"partialClosePrice":110');
    expect(json).toContain('"partialCloseTime":1700000000000');
    expect(json).toContain('"partialCloseReason":"PARTIAL_TP1"');
  });
});
