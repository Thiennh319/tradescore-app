import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry, WeeklyStats } from '../constants/aiJournal';
import { exportJournalToCSV, generateTextReport } from './exportService';

function miniEntry(): AiTradeJournalEntry {
  return {
    id: 't1',
    timestamp: Date.parse('2026-06-14T03:00:00.000Z'),
    symbol: 'NEARUSDT',
    accountSizeAtEntry: 32,
    market: {
      entryPrice: 2.105,
      priceAtAnalysis: 2.1,
      slippage: 0.24,
      cvdValue: 1000,
      cvdTrend: 'UP',
      volumeRatio: 1.1,
      btcChangePct: 0.5,
      fundingRate: 0.01,
      topLSRatio: 1.2,
      oiChangePct: 0.3,
      sessionType: 'GOOD',
      hourVN: 10,
    },
    scoring: {
      totalScore: 11.5,
      direction: 'LONG',
      layerScores: {
        l1: 1, l2: 1, l3: 1, l4: 0.5, l5: 1.5,
        l6: 1, l7: 1, l8: 1, l9: 1.5, l10: 1,
      },
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
    },
    plan: {
      entryZoneType: 'PULLBACK_EMA',
      entryZoneOptimal: 2.1,
      entryZoneRangeLow: 2.08,
      entryZoneRangeHigh: 2.12,
      slProposed: 2.05,
      slActual: 2.05,
      tp1Proposed: 2.2,
      tp1Actual: 2.2,
      tp2: 2.25,
      tp3: 2.3,
      rrProposed: 2,
      sizeProposed: 5,
      sizeActual: 5,
      isSafeSL: true,
    },
    outcome: { status: 'WIN', pnlUSDT: 1.57, exitPrice: 2.21 },
    tags: [],
    version: '1.0.2',
  };
}

describe('exportService', () => {
  it('exports full CSV headers', async () => {
    const csv = await exportJournalToCSV([miniEntry()]);
    expect(csv.split('\n')[0]).toContain('Entry Actual');
    expect(csv.split('\n')[0]).toContain('accountSizeAfter');
    expect(csv.split('\n')[0]).toContain('positionAdvisorActionAtExit');
    expect(csv.split('\n')[0]).toContain('followedAdvisorRecommendation');
    expect(csv.split('\n')[0]).toContain('scoringDecisionAtExit');
    expect(csv.split('\n')[0]).toContain('planHealthAtExit');
    expect(csv).toContain('NEARUSDT');
    expect(csv).toContain('VAO_TU_TIN');
  });

  it('includes accountSizeAfter from history', async () => {
    const csv = await exportJournalToCSV([miniEntry()], [
      {
        timestamp: Date.now(),
        value: 33.57,
        tradeId: 't1',
        pnlUSDT: 1.57,
        symbol: 'NEARUSDT',
      },
    ]);
    expect(csv).toContain('33.57');
  });

  it('generates weekly text report', () => {
    const stats: WeeklyStats = {
      from: '2026-06-09',
      to: '2026-06-14',
      trades: 8,
      wins: 5,
      losses: 2,
      breakevens: 1,
      winRate: 62.5,
      totalPnlUSDT: 2.66,
      avgScore: 10.2,
      bestDay: '2026-06-12',
      worstDay: '2026-06-13',
      accountStartUSDT: 32.54,
      accountEndUSDT: 35.2,
      accountChangePct: 8.2,
      bestTradeLabel: '+1.82 USDT (NEAR LONG 12/06)',
      worstTradeLabel: '-1.50 USDT (SOL 13/06)',
      bestLayer: 'l5',
      bestLayerAccuracy: 79,
    };
    const report = generateTextReport(stats, ['Win rate tốt nhất 08-10h']);
    expect(report).toContain('TRADESCORE WEEKLY REPORT');
    expect(report).toContain('62.5%');
    expect(report).toContain('Khuyến nghị');
  });
});
