import { create } from 'zustand';
import type { OpportunitySnapshot } from '../services/v41/entryQualityEngine';
import type { EarlyWarningResult } from '../services/v41/earlyWarningEngine';
import type { ReversalState } from '../services/v41/reversalDetector';
import type { MarketIntelligenceSnapshot, VisibilityMode } from '../services/v41/types';

export type EarlyWarningSeverity = 'CLEAR' | 'WARNING_SOFT' | 'WARNING_HARD' | 'BLOCK';

export interface V41SymbolState {
  previousMode: VisibilityMode;
  lastSnapshot?: MarketIntelligenceSnapshot;
  updatedAt?: number;
  lastEarlyWarning?: EarlyWarningResult & { severity: EarlyWarningSeverity };
  lastReversalState?: ReversalState;
  lastOpportunity?: OpportunitySnapshot;
  /** Early Warning Hysteresis */
  ewCurrentSeverity: EarlyWarningSeverity;
  ewConfirmCount: number;
  ewClearCount: number;
  ewLastChangedAt: number;
}

interface V41StoreState {
  isScanning: boolean;
  symbolStates: Record<string, V41SymbolState>;
  setScanning: (scanning: boolean) => void;
  getSymbolState: (symbol: string) => V41SymbolState;
  updateSymbolState: (
    symbol: string,
    visibilityMode: VisibilityMode,
    snapshot: MarketIntelligenceSnapshot,
    earlyWarning?: EarlyWarningResult & { severity: EarlyWarningSeverity },
    opportunity?: OpportunitySnapshot,
    reversalState?: ReversalState,
  ) => void;
  updateEarlyWarning: (
    symbol: string,
    rawSeverity: EarlyWarningSeverity,
  ) => EarlyWarningSeverity;
}

const SEVERITY_RANK: Record<EarlyWarningSeverity, number> = {
  CLEAR: 0,
  WARNING_SOFT: 1,
  WARNING_HARD: 2,
  BLOCK: 3,
};

const CONFIRM_THRESHOLD: Record<EarlyWarningSeverity, number> = {
  CLEAR: 1,
  WARNING_SOFT: 2,
  WARNING_HARD: 2,
  BLOCK: 3,
};

const CLEAR_THRESHOLD: Record<EarlyWarningSeverity, number> = {
  CLEAR: 0,
  WARNING_SOFT: 3,
  WARNING_HARD: 3,
  BLOCK: 5,
};

function defaultSymbolState(): V41SymbolState {
  return {
    previousMode: 'INACTIVE',
    ewCurrentSeverity: 'CLEAR',
    ewConfirmCount: 0,
    ewClearCount: 0,
    ewLastChangedAt: 0,
  };
}

function applyEarlyWarningHysteresis(
  state: Pick<
    V41SymbolState,
    'ewCurrentSeverity' | 'ewConfirmCount' | 'ewClearCount' | 'ewLastChangedAt'
  >,
  rawSeverity: EarlyWarningSeverity,
): Pick<
  V41SymbolState,
  'ewCurrentSeverity' | 'ewConfirmCount' | 'ewClearCount' | 'ewLastChangedAt'
> & { returnedSeverity: EarlyWarningSeverity } {
  const current = state.ewCurrentSeverity;
  let confirmCount = state.ewConfirmCount;
  let clearCount = state.ewClearCount;
  let nextSeverity = current;
  let lastChangedAt = state.ewLastChangedAt;

  const rawRank = SEVERITY_RANK[rawSeverity];
  const currentRank = SEVERITY_RANK[current];

  if (rawSeverity === current) {
    confirmCount += 1;
    clearCount = 0;
    return {
      ewCurrentSeverity: nextSeverity,
      ewConfirmCount: confirmCount,
      ewClearCount: clearCount,
      ewLastChangedAt: lastChangedAt,
      returnedSeverity: current,
    };
  }

  if (rawRank > currentRank) {
    confirmCount += 1;
    clearCount = 0;
    if (confirmCount >= CONFIRM_THRESHOLD[rawSeverity]) {
      nextSeverity = rawSeverity;
      confirmCount = 0;
      lastChangedAt = Date.now();
      return {
        ewCurrentSeverity: nextSeverity,
        ewConfirmCount: confirmCount,
        ewClearCount: clearCount,
        ewLastChangedAt: lastChangedAt,
        returnedSeverity: rawSeverity,
      };
    }
    return {
      ewCurrentSeverity: nextSeverity,
      ewConfirmCount: confirmCount,
      ewClearCount: clearCount,
      ewLastChangedAt: lastChangedAt,
      returnedSeverity: current,
    };
  }

  // rawSeverity nhẹ hơn current — đang hồi phục
  if (rawSeverity === 'CLEAR') {
    if (current === 'CLEAR') {
      clearCount = 0;
      confirmCount = 0;
      return {
        ewCurrentSeverity: 'CLEAR',
        ewConfirmCount: 0,
        ewClearCount: 0,
        ewLastChangedAt: lastChangedAt,
        returnedSeverity: 'CLEAR',
      };
    }

    clearCount += 1;
    confirmCount = 0;
    const threshold = CLEAR_THRESHOLD[current];
    if (clearCount >= threshold) {
      nextSeverity = 'CLEAR';
      clearCount = 0;
      lastChangedAt = Date.now();
      return {
        ewCurrentSeverity: nextSeverity,
        ewConfirmCount: confirmCount,
        ewClearCount: clearCount,
        ewLastChangedAt: lastChangedAt,
        returnedSeverity: 'CLEAR',
      };
    }
    return {
      ewCurrentSeverity: nextSeverity,
      ewConfirmCount: confirmCount,
      ewClearCount: clearCount,
      ewLastChangedAt: lastChangedAt,
      returnedSeverity: current,
    };
  }

  // Hồi phục từng bậc (vd. BLOCK → WARNING_HARD)
  confirmCount += 1;
  clearCount = 0;
  if (confirmCount >= CONFIRM_THRESHOLD[rawSeverity]) {
    nextSeverity = rawSeverity;
    confirmCount = 0;
    lastChangedAt = Date.now();
    return {
      ewCurrentSeverity: nextSeverity,
      ewConfirmCount: confirmCount,
      ewClearCount: clearCount,
      ewLastChangedAt: lastChangedAt,
      returnedSeverity: rawSeverity,
    };
  }
  return {
    ewCurrentSeverity: nextSeverity,
    ewConfirmCount: confirmCount,
    ewClearCount: clearCount,
    ewLastChangedAt: lastChangedAt,
    returnedSeverity: current,
  };
}

export const useV41Store = create<V41StoreState>((set, get) => ({
  isScanning: false,
  symbolStates: {},
  setScanning: (isScanning) => set({ isScanning }),
  getSymbolState: (symbol) => get().symbolStates[symbol] ?? defaultSymbolState(),
  updateSymbolState: (
    symbol,
    visibilityMode,
    snapshot,
    earlyWarning,
    opportunity,
    reversalState,
  ) =>
    set((state) => {
      const prev = state.symbolStates[symbol] ?? defaultSymbolState();
      return {
        symbolStates: {
          ...state.symbolStates,
          [symbol]: {
            ...prev,
            previousMode: visibilityMode,
            lastSnapshot: snapshot,
            updatedAt: Date.now(),
            lastEarlyWarning: earlyWarning,
            lastOpportunity: opportunity,
            lastReversalState: reversalState,
          },
        },
      };
    }),
  updateEarlyWarning: (symbol, rawSeverity) => {
    const prev = get().symbolStates[symbol] ?? defaultSymbolState();
    const outcome = applyEarlyWarningHysteresis(prev, rawSeverity);
    set((state) => ({
      symbolStates: {
        ...state.symbolStates,
        [symbol]: {
          ...(state.symbolStates[symbol] ?? defaultSymbolState()),
          ewCurrentSeverity: outcome.ewCurrentSeverity,
          ewConfirmCount: outcome.ewConfirmCount,
          ewClearCount: outcome.ewClearCount,
          ewLastChangedAt: outcome.ewLastChangedAt,
        },
      },
    }));
    return outcome.returnedSeverity;
  },
}));
