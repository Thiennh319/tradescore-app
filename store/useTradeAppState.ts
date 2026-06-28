import { create } from 'zustand';

/**
 * Global application trading enable/disable gate.
 * true  → app behaves as today (default).
 * false → entire trading application disabled (consumers wire in later tasks).
 */
interface TradeAppState {
  tradeAppEnabled: boolean;
  enableTradeApp: () => void;
  disableTradeApp: () => void;
}

export const useTradeAppState = create<TradeAppState>((set) => ({
  tradeAppEnabled: true,
  enableTradeApp: () => set({ tradeAppEnabled: true }),
  disableTradeApp: () => set({ tradeAppEnabled: false }),
}));

/**
 * Re-enable UI interaction only — does not clear cache, journal, forms, or restart services.
 */
export function enableTradeApp(): void {
  useTradeAppState.getState().enableTradeApp();
}

/** Disable trading application globally. */
export function disableTradeApp(): void {
  useTradeAppState.getState().disableTradeApp();
}
