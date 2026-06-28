import { describe, expect, it } from 'vitest';
import { FundingState } from '../constants/scoring';
import {
  applyCloseWithFundingPatch,
  fundingAtExitFromL6Detail,
  newAiJournalEntry,
  outcomeFromClose,
  resolveFundingExitPatchForClose,
} from './journalService';

const L6_AT_EXIT = {
  fundingCurrent: 0.004,
  fundingAvg8: 0.003,
  fundingVelocity: 0.001,
  fundingAcceleration: 0,
  fundingState: FundingState.LONG_EUPHORIA_FADING,
  isFallback: false,
};

function openV4Entry() {
  return newAiJournalEntry({
    symbol: 'BTCUSDT',
    accountSizeAtEntry: 34,
    market: {
      entryPrice: 100,
      priceAtAnalysis: 100,
      slippage: 0,
      cvdValue: 0,
      cvdTrend: 'FLAT',
      volumeRatio: 1,
      btcChangePct: 0,
      fundingRate: -0.008,
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
      scorerVersion: 'v4',
    },
    plan: {
      entryZoneType: 'MARKET',
      entryZoneOptimal: 100,
      entryZoneRangeLow: 99,
      entryZoneRangeHigh: 101,
      slProposed: 95,
      slActual: 95,
      tp1Proposed: 110,
      tp1Actual: 110,
      tp2: 115,
      tp3: 120,
      rrProposed: 2,
      sizeProposed: 6,
      sizeActual: 6,
      isSafeSL: true,
    },
    fundingAtEntry: -0.008,
    fundingVelocityAtEntry: -0.002,
    fundingStateAtEntry: FundingState.SHORT_SQUEEZE_BUILDING,
  });
}

describe('resolveFundingExitPatchForClose', () => {
  it('V4 + l6Detail cùng symbol → ghi fundingAtExit / fundingStateAtExit', () => {
    const entry = openV4Entry();
    const patch = resolveFundingExitPatchForClose({
      entry,
      options: {},
      l6Detail: L6_AT_EXIT,
      scorerVersion: 'v4',
      selectedSymbol: 'BTCUSDT',
    });
    expect(patch).toEqual({
      fundingAtExit: 0.004,
      fundingStateAtExit: FundingState.LONG_EUPHORIA_FADING,
    });
  });

  it('V4 khác symbol → funding exit null', () => {
    const entry = openV4Entry();
    const patch = resolveFundingExitPatchForClose({
      entry,
      options: {},
      l6Detail: L6_AT_EXIT,
      scorerVersion: 'v4',
      selectedSymbol: 'ETHUSDT',
    });
    expect(patch).toEqual({ fundingAtExit: null, fundingStateAtExit: null });
  });

  it('V3 entry → không patch funding exit', () => {
    const entry = openV4Entry();
    entry.scoring.scorerVersion = 'v3';
    const patch = resolveFundingExitPatchForClose({
      entry,
      options: {},
      l6Detail: L6_AT_EXIT,
      scorerVersion: 'v4',
      selectedSymbol: 'BTCUSDT',
    });
    expect(patch).toEqual({});
  });

  it('options explicit override l6Detail', () => {
    const entry = openV4Entry();
    const patch = resolveFundingExitPatchForClose({
      entry,
      options: {
        fundingAtExit: -0.01,
        fundingStateAtExit: FundingState.EXTREME_LONG_EUPHORIA,
      },
      l6Detail: L6_AT_EXIT,
      scorerVersion: 'v4',
      selectedSymbol: 'BTCUSDT',
    });
    expect(patch).toEqual({
      fundingAtExit: -0.01,
      fundingStateAtExit: FundingState.EXTREME_LONG_EUPHORIA,
    });
  });
});

describe('applyCloseWithFundingPatch', () => {
  it('mô phỏng closeTradeEntry — journal lưu funding exit sau đóng', () => {
    const entry = openV4Entry();
    const outcome = outcomeFromClose({
      exitPrice: 105,
      pnlUSDT: 1.2,
      pnlPct: 2,
      entryTimestamp: entry.timestamp,
      exitReason: 'MANUAL_CLOSE',
    });
    const fundingPatch = fundingAtExitFromL6Detail(L6_AT_EXIT, 'v4');
    const closed = applyCloseWithFundingPatch(entry, outcome, fundingPatch);

    expect(closed.outcome.status).toBe('WIN');
    expect(closed.fundingAtEntry).toBeCloseTo(-0.008);
    expect(closed.fundingStateAtEntry).toBe(FundingState.SHORT_SQUEEZE_BUILDING);
    expect(closed.fundingAtExit).toBeCloseTo(0.004);
    expect(closed.fundingStateAtExit).toBe(FundingState.LONG_EUPHORIA_FADING);
  });
});
