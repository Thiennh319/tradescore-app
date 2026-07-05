import { create } from 'zustand';
import type { UnifiedSignalResult } from '../services/unifiedSignalEngine';

export interface UnifiedStore {
  signals: UnifiedSignalResult[];
  isScanning: boolean;
  lastScanAt: number;
  setSignals: (signals: UnifiedSignalResult[]) => void;
  setScanning: (val: boolean) => void;
  reset: () => void;
}

export const useUnifiedStore = create<UnifiedStore>((set) => ({
  signals: [],
  isScanning: false,
  lastScanAt: 0,
  setSignals: (signals) => set({ signals, lastScanAt: Date.now() }),
  setScanning: (isScanning) => set({ isScanning }),
  reset: () => set({ signals: [], isScanning: false, lastScanAt: 0 }),
}));
