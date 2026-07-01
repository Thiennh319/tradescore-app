/** Ngưỡng chênh lệch điểm Long vs Short — dưới mức này coi là "sát nhau". */
export const AMBIGUOUS_THRESHOLD = 1.0;

export type AmbiguityState = {
  status: 'AMBIGUOUS' | 'CLEAR';
  scoreDiff: number;
  leaningDirection: 'LONG' | 'SHORT';
  /** Số scan liên tiếp đang ở trạng thái sát nhau */
  consecutiveAmbiguousCount: number;
  /** Số scan liên tiếp đã rõ ràng trở lại (khi đang/thoát AMBIGUOUS) */
  consecutiveClearCount: number;
  message: string;
};

function buildAmbiguousMessage(
  longScore: number,
  shortScore: number,
  scoreDiff: number,
  leaningDirection: 'LONG' | 'SHORT',
): string {
  const leanVi = leaningDirection === 'LONG' ? 'Long' : 'Short';
  return (
    `Xu hướng chưa rõ ràng — Long ${longScore.toFixed(1)}đ vs Short ${shortScore.toFixed(1)}đ, ` +
    `chênh lệch ${scoreDiff.toFixed(1)}đ, nghiêng nhẹ về ${leanVi}`
  );
}

/**
 * Hysteresis 2-scan: vào AMBIGUOUS sau 2 lần sát nhau liên tiếp;
 * thoát sau 2 lần rõ ràng liên tiếp.
 *
 * Caller tự truyền longScore/shortScore đúng engine:
 * - V4: officialTotalScore ?? referenceTotalScore
 * - V3: totalScore
 */
export function resolveDirectionAmbiguity(
  longScore: number,
  shortScore: number,
  previousState: AmbiguityState | null,
): AmbiguityState {
  const scoreDiff = Math.abs(longScore - shortScore);
  const isCurrentlyAmbiguous = scoreDiff < AMBIGUOUS_THRESHOLD;
  const leaningDirection: 'LONG' | 'SHORT' =
    longScore >= shortScore ? 'LONG' : 'SHORT';

  if (previousState === null) {
    if (isCurrentlyAmbiguous) {
      return {
        status: 'CLEAR',
        scoreDiff,
        leaningDirection,
        consecutiveAmbiguousCount: 1,
        consecutiveClearCount: 0,
        message: '',
      };
    }
    return {
      status: 'CLEAR',
      scoreDiff,
      leaningDirection,
      consecutiveAmbiguousCount: 0,
      consecutiveClearCount: 0,
      message: '',
    };
  }

  if (previousState.status === 'CLEAR') {
    if (isCurrentlyAmbiguous) {
      const consecutiveAmbiguousCount = previousState.consecutiveAmbiguousCount + 1;
      const status = consecutiveAmbiguousCount >= 2 ? 'AMBIGUOUS' : 'CLEAR';
      return {
        status,
        scoreDiff,
        leaningDirection,
        consecutiveAmbiguousCount,
        consecutiveClearCount: 0,
        message:
          status === 'AMBIGUOUS'
            ? buildAmbiguousMessage(longScore, shortScore, scoreDiff, leaningDirection)
            : '',
      };
    }
    return {
      status: 'CLEAR',
      scoreDiff,
      leaningDirection,
      consecutiveAmbiguousCount: 0,
      consecutiveClearCount: 0,
      message: '',
    };
  }

  // previousState.status === 'AMBIGUOUS'
  if (isCurrentlyAmbiguous) {
    return {
      status: 'AMBIGUOUS',
      scoreDiff,
      leaningDirection,
      consecutiveAmbiguousCount: previousState.consecutiveAmbiguousCount,
      consecutiveClearCount: 0,
      message: buildAmbiguousMessage(longScore, shortScore, scoreDiff, leaningDirection),
    };
  }

  const consecutiveClearCount = previousState.consecutiveClearCount + 1;
  const status = consecutiveClearCount >= 2 ? 'CLEAR' : 'AMBIGUOUS';
  return {
    status,
    scoreDiff,
    leaningDirection,
    consecutiveAmbiguousCount: 0,
    consecutiveClearCount,
    message:
      status === 'AMBIGUOUS'
        ? buildAmbiguousMessage(longScore, shortScore, scoreDiff, leaningDirection)
        : '',
  };
}
