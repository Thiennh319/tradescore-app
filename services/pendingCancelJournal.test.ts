import { describe, expect, it } from 'vitest';
import {
  newAiJournalPendingEntry,
  pendingCancelOutcomeFromUnlockReason,
  resolvePendingEntryForLockedPlan,
} from './journalService';

describe('pending cancel journal', () => {
  it('PLAN_EXPIRED → exitReason + notes + positionAdvisorActionAtExit', () => {
    const opts = pendingCancelOutcomeFromUnlockReason('PLAN_EXPIRED', {
      lockedScore: 6.9,
      expiryHours: 4,
    });
    expect(opts.exitReason).toBe('PLAN_EXPIRED');
    expect(opts.notes).toContain('hết hạn sau 4h');
    expect(opts.positionAdvisorActionAtExit).toBe('PLAN_EXPIRED');
  });

  it('resolvePendingEntryForLockedPlan fallback theo symbol + hướng', () => {
    const pending = newAiJournalPendingEntry({
      symbol: 'BNBUSDT',
      accountSizeAtEntry: 30,
      market: {
        entryPrice: 580,
        priceAtAnalysis: 579,
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
        totalScore: 6.9,
        direction: 'SHORT',
        layerScores: {
          l1: 0, l2: 0, l3: 0, l4: 0, l5: 0, l6: 0, l7: 0, l8: 0, l9: 0, l10: 0,
        },
        mandatoryViolations: [],
        decision: 'KHONG_VAO',
      },
      plan: {
        entryZoneType: 'SR',
        entryZoneOptimal: 580,
        entryZoneRangeLow: 578,
        entryZoneRangeHigh: 582,
        slProposed: 586,
        slActual: 586,
        tp1Proposed: 570,
        tp1Actual: 570,
        tp2: 565,
        tp3: 560,
        rrProposed: 2,
        sizeProposed: 6,
        sizeActual: 6,
        isSafeSL: true,
      },
      limitOrderPrice: 580.88,
      id: 'pending-bnb',
    });

    const found = resolvePendingEntryForLockedPlan([pending], {
      pendingEntryId: 'wrong-id',
      symbol: 'BNBUSDT',
      lockedDirection: 'SHORT',
    });
    expect(found?.id).toBe('pending-bnb');
  });
});
