import type {
  PositionRecommendation,
  RecommendationType,
} from './positionAdvisorV3';

export interface StabilityState {
  lastStableType: RecommendationType;
  lastStableUrgency: PositionRecommendation['urgency'];
  /** Snapshot output đã confirm — dùng khi chưa đủ lần xác nhận. */
  lastStableRecommendation: PositionRecommendation;
  pendingType: RecommendationType | null;
  pendingUrgency: PositionRecommendation['urgency'] | null;
  pendingCount: number;
  requiredCount: number;
}

export const REQUIRED_CONFIRMATIONS: Record<PositionRecommendation['urgency'], number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 1,
};

const CONFIRMATION_NOTE_PREFIX = 'Đang xác nhận tín hiệu';

function confirmationNote(pendingCount: number, requiredCount: number): string {
  return `${CONFIRMATION_NOTE_PREFIX} (${pendingCount}/${requiredCount} lần)`;
}

function withConfirmationNote(
  recommendation: PositionRecommendation,
  pendingCount: number,
  requiredCount: number,
): PositionRecommendation {
  const note = confirmationNote(pendingCount, requiredCount);
  const reasons = recommendation.reasons.includes(note)
    ? recommendation.reasons
    : [note, ...recommendation.reasons].slice(0, 5);
  return { ...recommendation, reasons };
}

function resetPending(state: StabilityState): StabilityState {
  return {
    ...state,
    pendingType: null,
    pendingUrgency: null,
    pendingCount: 0,
    requiredCount: 1,
  };
}

/** Khởi tạo state từ khuyến nghị đầu tiên (coi như đã stable). */
export function createInitialStabilityState(
  recommendation: PositionRecommendation,
): StabilityState {
  return {
    lastStableType: recommendation.type,
    lastStableUrgency: recommendation.urgency,
    lastStableRecommendation: recommendation,
    pendingType: null,
    pendingUrgency: null,
    pendingCount: 0,
    requiredCount: 1,
  };
}

export function applyStabilityFilter(
  newRecommendation: PositionRecommendation,
  state: StabilityState,
): {
  output: PositionRecommendation;
  newState: StabilityState;
} {
  if (newRecommendation.type === state.lastStableType) {
    if (
      state.pendingType !== null &&
      state.pendingType !== state.lastStableType
    ) {
      return {
        output: state.lastStableRecommendation,
        newState: state,
      };
    }

    const newState: StabilityState = {
      ...resetPending(state),
      lastStableType: newRecommendation.type,
      lastStableUrgency: newRecommendation.urgency,
      lastStableRecommendation: newRecommendation,
    };
    return { output: newRecommendation, newState };
  }

  let pendingType = state.pendingType;
  let pendingUrgency = state.pendingUrgency;
  let pendingCount = state.pendingCount;
  let requiredCount = state.requiredCount;

  if (newRecommendation.type === pendingType) {
    pendingCount += 1;
  } else {
    pendingType = newRecommendation.type;
    pendingUrgency = newRecommendation.urgency;
    pendingCount = 1;
    requiredCount = REQUIRED_CONFIRMATIONS[newRecommendation.urgency];
  }

  if (pendingCount >= requiredCount) {
    const newState: StabilityState = {
      lastStableType: pendingType!,
      lastStableUrgency: pendingUrgency!,
      lastStableRecommendation: newRecommendation,
      pendingType: null,
      pendingUrgency: null,
      pendingCount: 0,
      requiredCount: 1,
    };
    return { output: newRecommendation, newState };
  }

  const newState: StabilityState = {
    ...state,
    pendingType,
    pendingUrgency,
    pendingCount,
    requiredCount,
  };

  const output = withConfirmationNote(
    state.lastStableRecommendation,
    pendingCount,
    requiredCount,
  );

  return { output, newState };
}

/** Gắn stability vào output evaluate — giữ side-effect flags từ raw recommendation. */
export function applyRecommendationStability(
  rawRecommendation: PositionRecommendation,
  stabilityState?: StabilityState,
): PositionRecommendation {
  const sideEffectFields = {
    shouldSetCVDFlag: rawRecommendation.shouldSetCVDFlag,
    shouldSetFundingReversalPending: rawRecommendation.shouldSetFundingReversalPending,
    shouldClearFundingReversalPending: rawRecommendation.shouldClearFundingReversalPending,
  };

  if (!stabilityState) {
    const initial = createInitialStabilityState(rawRecommendation);
    return {
      ...rawRecommendation,
      ...sideEffectFields,
      stabilityState: initial,
    };
  }

  const { output, newState } = applyStabilityFilter(rawRecommendation, stabilityState);
  return {
    ...output,
    ...sideEffectFields,
    stabilityState: newState,
  };
}
