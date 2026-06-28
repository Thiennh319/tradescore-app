import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { vi } from '../constants/vi';
import type { TradePlan } from '../constants/scoring';
import {
  formatJournalCloseReason,
  isJournalRunning,
  outcomeFromClose,
  resolveJournalCloseReasonDisplay,
  resolveJournalDisplayStatus,
  resolveJournalOpenReasonDisplay,
  resolveOpenReasonFromTradePlan,
} from './journalService';

function miniEntry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  const basePlan = {
    entryZoneType: 'WALL_SUPPORT' as const,
    entryZoneOptimal: 65000,
    entryZoneRangeLow: 64900,
    entryZoneRangeHigh: 65100,
    slProposed: 64000,
    slActual: 64000,
    tp1Proposed: 66000,
    tp1Actual: 66000,
    tp2: 67000,
    tp3: 68000,
    rrProposed: 2,
    sizeProposed: 50,
    sizeActual: 50,
    isSafeSL: true,
  };
  return {
    id: 'j1',
    timestamp: Date.now(),
    symbol: 'BTCUSDT',
    accountSizeAtEntry: 100,
    market: {
      entryPrice: 65000,
      priceAtAnalysis: 64900,
      slippage: 0.15,
      cvdValue: 100,
      cvdTrend: 'UP',
      volumeRatio: 1,
      btcChangePct: 0.5,
      fundingRate: 0.01,
      topLSRatio: 1.1,
      oiChangePct: 0.2,
      sessionType: 'GOOD',
      hourVN: 10,
    },
    scoring: {
      totalScore: 10,
      direction: 'LONG',
      layerScores: {
        l1: 1, l2: 1, l3: 1, l4: 1, l5: 1,
        l6: 1, l7: 1, l8: 1, l9: 1, l10: 1,
      },
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
    },
    tags: [],
    version: '1.0.3',
    ...overrides,
    plan: { ...basePlan, ...overrides.plan },
    outcome: { status: 'OPEN', ...overrides.outcome },
  };
}

describe('journal open/close reasons', () => {
  it('stores openReason from trade plan entryZone.reasoning', () => {
    const plan = {
      entryZone: { reasoning: 'EMA20 bounce with whale support' },
      notes: 'ignored when reasoning present',
    } as TradePlan;

    expect(resolveOpenReasonFromTradePlan(plan)).toBe('EMA20 bounce with whale support');
  });

  it('falls back openReason display to vi entryZoneTypes for legacy entries', () => {
    const entry = miniEntry({
      plan: {
        ...miniEntry().plan,
        entryZoneType: 'PULLBACK_EMA',
      },
    });

    expect(resolveJournalOpenReasonDisplay(entry)).toBe(vi.recommend.entryZoneTypes.PULLBACK_EMA);
  });

  it('uses stored openReason when present', () => {
    const entry = miniEntry({
      plan: {
        ...miniEntry().plan,
        openReason: 'CVD recovery breakout',
        entryZoneType: 'PULLBACK_EMA',
      },
    });

    expect(resolveJournalOpenReasonDisplay(entry)).toBe('CVD recovery breakout');
  });

  it('maps close reason via vi.tradeHistory.closeReason', () => {
    expect(formatJournalCloseReason('SL_HIT')).toBe(vi.tradeHistory.closeReason.SL);
    expect(formatJournalCloseReason('MANUAL_CLOSE')).toBe(vi.tradeHistory.closeReason.MANUAL_STOP);
  });

  it('outcomeFromClose stores closeReason label', () => {
    const outcome = outcomeFromClose({
      exitPrice: 64000,
      entryTimestamp: Date.now() - 60_000,
      exitReason: 'SL_HIT',
    });

    expect(outcome.closeReason).toBe(vi.tradeHistory.closeReason.SL);
    expect(outcome.exitReason).toBe('SL_HIT');
  });

  it('resolveJournalCloseReasonDisplay falls back from exitReason for legacy entries', () => {
    const entry = miniEntry({
      outcome: {
        status: 'LOSS',
        exitReason: 'TP1_HIT',
        exitPrice: 66000,
        pnlUSDT: -1,
      },
    });

    expect(resolveJournalCloseReasonDisplay(entry)).toBe(vi.tradeHistory.closeReason.TP1);
  });
});

describe('journal display status', () => {
  it('maps OPEN to RUNNING', () => {
    expect(resolveJournalDisplayStatus('OPEN')).toBe('RUNNING');
  });

  it('keeps PENDING as PENDING', () => {
    expect(resolveJournalDisplayStatus('PENDING')).toBe('PENDING');
  });

  it('isJournalRunning is true only for OPEN', () => {
    expect(isJournalRunning(miniEntry({ outcome: { status: 'OPEN' } }))).toBe(true);
    expect(isJournalRunning(miniEntry({ outcome: { status: 'PENDING' } }))).toBe(false);
  });
});
