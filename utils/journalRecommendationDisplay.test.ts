import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { FinalEntryStatus } from '../types/scoring';
import { StateMachineEntryState } from '../services/entryStateManager';
import { migrateAiJournalEntry } from '../services/phase1Migration';
import { runProductionEsmBridge } from '../services/productionEsmBridge';
import type { SignalRow } from '../hooks/useSignalBoard';
import {
  resolveJournalUlReviewRecommendation,
  resolveJournalUlReviewSource,
} from './journalRecommendationDisplay';
import { resolveEsmUlReviewDisplay } from './esmUiDisplay';

function openEntry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  const base = migrateAiJournalEntry({
    id: 't-open',
    timestamp: Date.now(),
    symbol: 'BTCUSDT',
    outcome: { status: 'OPEN' },
    scoring: {
      totalScore: 11,
      direction: 'LONG',
      decision: 'VAO_TU_TIN',
      recommendationLabel: 'STRONG LONG 10.2/15',
    },
    market: { entryPrice: 63902, priceAtAnalysis: 63902 },
    plan: {
      slProposed: 63000,
      slActual: 63000,
      sizeProposed: 6,
      sizeActual: 6,
      tp1Proposed: 65000,
      tp1Actual: 65000,
    },
    strategySource: 'V4',
  });
  if (!base) throw new Error('migrate failed');
  return { ...base, ...overrides };
}

function buildMinimalSignalRow(symbol = 'BTCUSDT'): SignalRow {
  return {
    symbol,
    price: 100000,
    change24h: 0,
    trend: 'BULLISH',
    regimeConfidence: 0.8,
    score: 11,
    longScore: 11,
    shortScore: 6,
    direction: 'LONG',
    decisionLabel: 'VAO_TU_TIN',
    decisionDisplay: 'Vào tự tin',
    winrate: '62%',
    canEnter: true,
    tradePlan: null,
    layers: [],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
  };
}

describe('journal UL Review recommendation binding', () => {
  it('OPEN trade uses ESM UL Review, never journal snapshot', () => {
    const entry = openEntry();
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: 'ul-journal-001',
      timestamp: '2026-07-13T00:00:00.000Z',
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.READY,
    });
    const review = resolveJournalUlReviewRecommendation(entry, snapshot);
    expect(review.label).toBe(resolveEsmUlReviewDisplay(snapshot, 'BTCUSDT').label);
    expect(review.label).not.toBe(entry.scoring.recommendationLabel);
    expect(resolveJournalUlReviewSource(entry, snapshot)).toBe('ul-review-esm');
  });

  it('CLOSED trade shows Closed', () => {
    const entry = openEntry({
      outcome: { status: 'WIN', pnlUSDT: 2.5, exitPrice: 64500 },
    });
    const review = resolveJournalUlReviewRecommendation(entry, null);
    expect(review.label).toBe('Closed');
    expect(resolveJournalUlReviewSource(entry, null)).toBe('closed');
  });

  it('maps READY scan to Hold Position review label', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: 'ul-journal-ready',
      timestamp: '2026-07-13T00:00:00.000Z',
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.READY,
    });
    expect(resolveEsmUlReviewDisplay(snapshot, 'BTCUSDT').label).toBe('Hold Position');
  });
});
