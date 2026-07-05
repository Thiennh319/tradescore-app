import { create } from 'zustand';
import type { ReversalState } from '../services/v41/reversalDetector';
import type { TrendDirection } from '../services/v41/types';

const WATCH_TIMEOUT_MS = 15 * 60 * 1000;

export interface ReversalStore {
  states: Record<string, ReversalState>;
  getState: (symbol: string) => ReversalState;
  startWatching: (
    symbol: string,
    counterDirection: 'LONG' | 'SHORT',
    trendDirection: TrendDirection,
  ) => void;
  confirmRetest: (symbol: string, retestPrice: number) => void;
  expire: (symbol: string) => void;
  reset: (symbol: string) => void;
  resetAll: () => void;
  isWatching: (symbol: string) => boolean;
  isRetestConfirmed: (symbol: string) => boolean;
  isExpired: (symbol: string) => boolean;
}

function defaultReversalState(symbol = ''): ReversalState {
  return {
    phase: 'NONE',
    detectedAt: 0,
    retestPrice: null,
    counterDirection: null,
    expiresAt: null,
    symbol,
  };
}

export const useReversalStore = create<ReversalStore>((set, get) => ({
  states: {},

  getState: (symbol) => {
    const current = get().states[symbol] ?? defaultReversalState(symbol);

    if (
      current.phase === 'WATCHING' &&
      current.expiresAt != null &&
      Date.now() > current.expiresAt
    ) {
      get().expire(symbol);
      return get().states[symbol] ?? defaultReversalState(symbol);
    }

    return current;
  },

  startWatching: (symbol, counterDirection, _trendDirection) => {
    const now = Date.now();
    set((state) => ({
      states: {
        ...state.states,
        [symbol]: {
          phase: 'WATCHING',
          detectedAt: now,
          retestPrice: null,
          counterDirection,
          expiresAt: now + WATCH_TIMEOUT_MS,
          symbol,
        },
      },
    }));
  },

  confirmRetest: (symbol, retestPrice) => {
    set((state) => {
      const prev = state.states[symbol] ?? defaultReversalState(symbol);
      return {
        states: {
          ...state.states,
          [symbol]: {
            ...prev,
            phase: 'RETEST_CONFIRMED',
            retestPrice,
            symbol,
          },
        },
      };
    });
  },

  expire: (symbol) => {
    set((state) => {
      const prev = state.states[symbol] ?? defaultReversalState(symbol);
      return {
        states: {
          ...state.states,
          [symbol]: {
            ...prev,
            phase: 'EXPIRED',
            symbol,
          },
        },
      };
    });
  },

  reset: (symbol) => {
    set((state) => ({
      states: {
        ...state.states,
        [symbol]: defaultReversalState(symbol),
      },
    }));
  },

  resetAll: () => set({ states: {} }),

  isWatching: (symbol) => get().getState(symbol).phase === 'WATCHING',

  isRetestConfirmed: (symbol) =>
    get().getState(symbol).phase === 'RETEST_CONFIRMED',

  isExpired: (symbol) => get().getState(symbol).phase === 'EXPIRED',
}));
