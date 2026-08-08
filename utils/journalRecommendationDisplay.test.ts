import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import {
  JOURNAL_WAITING_FILL_LABEL,
  JOURNAL_WAITING_FILL_REASON,
  resolveJournalActiveTradeRecommendation,
  resolveJournalUlReviewRecommendation,
  resolveJournalUlReviewSource,
} from './journalRecommendationDisplay';

vi.mock('./esmUiDisplay', async () => {
  const actual = await vi.importActual<typeof import('./esmUiDisplay')>('./esmUiDisplay');
  return {
    ...actual,
    resolveEsmUlReviewDisplay: vi.fn(),
  };
});

vi.mock('./esmUlReviewExplanation', () => ({
  resolveEsmUlReviewExplanationPanel: vi.fn(() => ({
    hasContent: false,
    recommendation: '—',
    finalAction: null,
    confidence: null,
    decisionScore: null,
    supportingReasons: [],
    warningFactors: [],
    rejectedActions: [],
    updatedAt: null,
    executiveSummary: null,
  })),
}));

import { resolveEsmUlReviewDisplay } from './esmUiDisplay';

const mockedEsm = vi.mocked(resolveEsmUlReviewDisplay);

function openEntry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  const base: AiTradeJournalEntry = {
    id: 't-open',
    timestamp: Date.now(),
    symbol: 'BTCUSDT',
    accountSizeAtEntry: 100,
    outcome: { status: 'OPEN' },
    scoring: {
      totalScore: 11,
      direction: 'LONG',
      layerScores: {
        l1: 1, l2: 1, l3: 1, l4: 1, l5: 1,
        l6: 1, l7: 1, l8: 1, l9: 1, l10: 1,
      },
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
      recommendationLabel: 'STRONG LONG 10.2/15',
      scorerVersion: 'v4',
    },
    market: {
      entryPrice: 63902,
      priceAtAnalysis: 63902,
      slippage: 0,
      cvdValue: 0,
      cvdTrend: 'UP',
      volumeRatio: 1,
      btcChangePct: 0,
      fundingRate: 0,
      topLSRatio: 1,
      oiChangePct: 0,
      sessionType: 'GOOD',
      hourVN: 10,
    },
    plan: {
      entryZoneType: 'PULLBACK_EMA',
      entryZoneOptimal: 63900,
      entryZoneRangeLow: 63800,
      entryZoneRangeHigh: 64000,
      slProposed: 63000,
      slActual: 63000,
      sizeProposed: 6,
      sizeActual: 6,
      tp1Proposed: 65000,
      tp1Actual: 65000,
      tp2: 66000,
      tp3: 67000,
      rrProposed: 2,
      isSafeSL: true,
    },
    tags: [],
    version: '1.0.8',
    strategySource: 'V4',
  };
  return {
    ...base,
    ...overrides,
    outcome: { ...base.outcome, ...overrides.outcome },
    scoring: { ...base.scoring, ...overrides.scoring },
    market: { ...base.market, ...overrides.market },
    plan: { ...base.plan, ...overrides.plan },
  };
}

describe('journal UL Review recommendation binding', () => {
  beforeEach(() => {
    mockedEsm.mockReset();
    mockedEsm.mockReturnValue({
      label: 'Hold Position',
      tone: 'hold',
      tooltipLines: ['• READY'],
    });
  });

  it('OPEN trade uses ESM UL Review, never journal snapshot', () => {
    const entry = openEntry();
    const review = resolveJournalUlReviewRecommendation(entry, null);
    expect(review.label).toBe('Hold Position');
    expect(review.label).not.toBe(entry.scoring.recommendationLabel);
    expect(mockedEsm).toHaveBeenCalled();
    expect(resolveJournalUlReviewSource(entry, null)).toBe('ul-review-esm');
  });

  it('CLOSED trade shows Closed', () => {
    const entry = openEntry({
      outcome: { status: 'WIN', pnlUSDT: 2.5, exitPrice: 64500 },
    });
    const review = resolveJournalUlReviewRecommendation(entry, null);
    expect(review.label).toBe('Closed');
    expect(resolveJournalUlReviewSource(entry, null)).toBe('closed');
    expect(mockedEsm).not.toHaveBeenCalled();
  });

  it('PENDING returns Waiting Fill, not ESM Hold Position', () => {
    const entry = openEntry({
      id: 't-pending',
      outcome: {
        status: 'PENDING',
        limitOrderPrice: 1.672,
        limitOrderPlacedAt: Date.now(),
      },
      market: { entryPrice: 1.672, priceAtAnalysis: 1.67 },
      symbol: 'NEARUSDT',
      scoring: {
        totalScore: 10,
        direction: 'SHORT',
        decision: 'VAO_TU_TIN',
        recommendationLabel: 'STRONG SHORT',
      },
    });
    const review = resolveJournalUlReviewRecommendation(entry, null);
    expect(review.label).toBe(JOURNAL_WAITING_FILL_LABEL);
    expect(review.label).toBe('Waiting Fill');
    expect(review.tone).toBe('wait');
    expect(review.tooltipLines.some((l) => l.includes(JOURNAL_WAITING_FILL_REASON))).toBe(true);
    expect(resolveJournalUlReviewSource(entry, null)).toBe('waiting-fill');
    expect(mockedEsm).not.toHaveBeenCalled();
  });
});

describe('Active Trades per-entry advisor binding', () => {
  beforeEach(() => {
    mockedEsm.mockReset();
    mockedEsm.mockReturnValue({
      label: 'Close Position',
      tone: 'close',
      tooltipLines: ['• EXIT'],
    });
  });

  it('OPEN prefers advisorLabelById over ESM symbol label', () => {
    const entry = openEntry({ id: 'btc-a' });
    const resolved = resolveJournalActiveTradeRecommendation(entry, null, {
      'btc-a': 'Đóng lệnh',
    });
    expect(resolved.label).toBe('Đóng lệnh');
    expect(resolved.source).toBe('position-advisor');
    expect(resolved.tone).toBe('close');
    expect(mockedEsm).not.toHaveBeenCalled();
  });

  it('OPEN falls back to ESM when advisorLabelById missing for id', () => {
    const entry = openEntry({ id: 'btc-missing' });
    const resolved = resolveJournalActiveTradeRecommendation(entry, null, {
      'other-id': 'Đóng lệnh',
    });
    expect(resolved.label).toBe('Close Position');
    expect(resolved.source).toBe('ul-review-esm');
    expect(mockedEsm).toHaveBeenCalled();
  });

  it('two OPEN entries same symbol get different advisor labels', () => {
    const a = openEntry({
      id: 'btc-1',
      market: { entryPrice: 64470.6, priceAtAnalysis: 64470 },
    });
    const b = openEntry({
      id: 'btc-2',
      market: { entryPrice: 64192.6, priceAtAnalysis: 64190 },
    });
    const advisorLabelById = {
      'btc-1': 'Đóng lệnh',
      'btc-2': 'Tiếp tục giữ',
    };
    const labelA = resolveJournalActiveTradeRecommendation(a, null, advisorLabelById).label;
    const labelB = resolveJournalActiveTradeRecommendation(b, null, advisorLabelById).label;
    expect(labelA).not.toBe(labelB);
    expect(labelA).toBe('Đóng lệnh');
    expect(labelB).toBe('Tiếp tục giữ');
    expect(resolveJournalUlReviewRecommendation(a, null).label).toBe(
      resolveJournalUlReviewRecommendation(b, null).label,
    );
    expect(resolveJournalUlReviewRecommendation(a, null).label).toBe('Close Position');
  });
});
