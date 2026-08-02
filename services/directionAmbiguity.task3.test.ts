/**
 * Task 3 — Ambiguity threshold 2.5 + U1 button rules + NEAR S1 independence.
 * Cases T1–T8 from REPORT_TASK3_ARCHITECTURE §3.2.
 */
import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS_THRESHOLD,
  resolveDirectionAmbiguity,
  type AmbiguityState,
} from './directionAmbiguity';
import {
  nearShortL3HardBlockReason,
  resolveNearShortL3Gate,
} from '../config/nearV4LayerGates';
import { isU1DirectionButtonEnabled } from '../components/dashboard/signalBoardU1';
import { TRADE_SYMBOLS } from '../constants/scoring';

function advanceAmbiguous(
  long: number,
  short: number,
  prev: AmbiguityState | null,
): AmbiguityState {
  return resolveDirectionAmbiguity(long, short, prev);
}

describe('Task3 T1 — AMBIGUOUS_THRESHOLD is 2.5', () => {
  it('exports AMBIGUOUS_THRESHOLD === 2.5', () => {
    expect(AMBIGUOUS_THRESHOLD).toBe(2.5);
  });
});

describe('Task3 T2 — trigger when |Δ| < 2.5, not when ≥ 2.5', () => {
  it('|Δ|=2.4 < 2.5 → after 2 scans becomes AMBIGUOUS', () => {
    // long 10, short 7.6 → diff 2.4
    let s = advanceAmbiguous(10, 7.6, null);
    expect(s.status).toBe('CLEAR');
    expect(s.consecutiveAmbiguousCount).toBe(1);
    s = advanceAmbiguous(10, 7.6, s);
    expect(s.status).toBe('AMBIGUOUS');
    expect(s.scoreDiff).toBeCloseTo(2.4, 5);
  });

  it('|Δ|=2.5 ≥ 2.5 → never enters AMBIGUOUS from CLEAR', () => {
    let s = advanceAmbiguous(10, 7.5, null);
    expect(s.status).toBe('CLEAR');
    expect(s.consecutiveAmbiguousCount).toBe(0);
    s = advanceAmbiguous(10, 7.5, s);
    expect(s.status).toBe('CLEAR');
    s = advanceAmbiguous(10, 7.5, s);
    expect(s.status).toBe('CLEAR');
  });

  it('|Δ|=2.6 → CLEAR', () => {
    let s = advanceAmbiguous(10, 7.4, null);
    expect(s.consecutiveAmbiguousCount).toBe(0);
    s = advanceAmbiguous(10, 7.4, s);
    expect(s.status).toBe('CLEAR');
  });
});

describe('Task3 T3 — hysteresis 2-scan enter / 2-scan exit', () => {
  it('1 close scan stays CLEAR; 2nd → AMBIGUOUS; 2 clear → CLEAR', () => {
    let s = advanceAmbiguous(9, 8, null); // diff 1 < 2.5
    expect(s.status).toBe('CLEAR');
    expect(s.consecutiveAmbiguousCount).toBe(1);

    s = advanceAmbiguous(9, 8, s);
    expect(s.status).toBe('AMBIGUOUS');

    s = advanceAmbiguous(12, 8, s); // diff 4 ≥ 2.5
    expect(s.status).toBe('AMBIGUOUS');
    expect(s.consecutiveClearCount).toBe(1);

    s = advanceAmbiguous(12, 8, s);
    expect(s.status).toBe('CLEAR');
  });
});

describe('Task3 T4 — symbol-agnostic (BTC/SOL/BNB/NEAR share same helper)', () => {
  it.each([...TRADE_SYMBOLS])(
    '%s: same scores → same ambiguity outcome (no symbol branch)',
    (_symbol) => {
      // Symbol is not an input to resolveDirectionAmbiguity — constant is shared.
      let s = advanceAmbiguous(10, 8, null); // Δ=2 < 2.5
      s = advanceAmbiguous(10, 8, s);
      expect(s.status).toBe('AMBIGUOUS');
      expect(AMBIGUOUS_THRESHOLD).toBe(2.5);
    },
  );
});

describe('Task3 T5 — U1 only official direction enabled when ready', () => {
  it('official SHORT + both ready → only SHORT enabled', () => {
    expect(
      isU1DirectionButtonEnabled({
        side: 'LONG',
        officialDirection: 'SHORT',
        isAmbiguous: false,
        directionReady: true,
      }),
    ).toBe(false);
    expect(
      isU1DirectionButtonEnabled({
        side: 'SHORT',
        officialDirection: 'SHORT',
        isAmbiguous: false,
        directionReady: true,
      }),
    ).toBe(true);
  });

  it('official LONG + long not ready → LONG disabled', () => {
    expect(
      isU1DirectionButtonEnabled({
        side: 'LONG',
        officialDirection: 'LONG',
        isAmbiguous: false,
        directionReady: false,
      }),
    ).toBe(false);
  });
});

describe('Task3 T6 — AMBIGUOUS disables both buttons', () => {
  it('both sides false when isAmbiguous even if ready and official', () => {
    expect(
      isU1DirectionButtonEnabled({
        side: 'LONG',
        officialDirection: 'LONG',
        isAmbiguous: true,
        directionReady: true,
      }),
    ).toBe(false);
    expect(
      isU1DirectionButtonEnabled({
        side: 'SHORT',
        officialDirection: 'LONG',
        isAmbiguous: true,
        directionReady: true,
      }),
    ).toBe(false);
  });
});

describe('Task3 T7 — NEAR S1 independent of ambiguity threshold', () => {
  it('S1 hard still fires at L3=1.0 SHORT; ambiguity does not clear it', () => {
    const s1 = nearShortL3HardBlockReason('NEARUSDT', 'SHORT', 1.0);
    expect(s1).toContain('NEAR SHORT');
    expect(s1).toContain('1.5');

    // Ambiguity with large Δ stays CLEAR — does not remove S1 reason string.
    let amb = advanceAmbiguous(11, 8, null); // Δ=3 ≥ 2.5
    amb = advanceAmbiguous(11, 8, amb);
    expect(amb.status).toBe('CLEAR');
    expect(nearShortL3HardBlockReason('NEARUSDT', 'SHORT', 1.0)).toBe(s1);

    // Even when AMBIGUOUS, S1 helper unchanged (orthogonal layers).
    amb = advanceAmbiguous(10, 8, null);
    amb = advanceAmbiguous(10, 8, amb);
    expect(amb.status).toBe('AMBIGUOUS');
    expect(resolveNearShortL3Gate('NEARUSDT', 'SHORT', 1.0).hardBlockReason).toBe(
      s1,
    );
  });

  it('BTC SHORT L3=1.0 still no NEAR S1', () => {
    expect(nearShortL3HardBlockReason('BTCUSDT', 'SHORT', 1.0)).toBeNull();
  });
});

describe('Task3 T8 — V3 shares same helper / threshold (smoke)', () => {
  it('resolveDirectionAmbiguity is the shared V3+V4 entry (thr 2.5)', () => {
    // V3 scan path calls the same function with V3 totalScore pair.
    const v3Like = advanceAmbiguous(8.0, 6.0, null); // Δ=2 < 2.5
    expect(v3Like.consecutiveAmbiguousCount).toBe(1);
    const second = advanceAmbiguous(8.0, 6.0, v3Like);
    expect(second.status).toBe('AMBIGUOUS');
    expect(AMBIGUOUS_THRESHOLD).toBe(2.5);
  });
});
