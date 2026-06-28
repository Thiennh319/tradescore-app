import type { AnalysisTimeframe } from '../constants/scoring';
import type { SignalRow } from './signalBoardScan';
import { storageGetItem, storageSetItem } from './storage';

const STORAGE_KEY = '@tradescore/v1/signal-board-cache';

export interface PersistedSignalBoard {
  timeframe: AnalysisTimeframe;
  rows: SignalRow[];
  scannedAt: number;
}

export async function savePersistedSignalBoard(
  timeframe: AnalysisTimeframe,
  rows: SignalRow[],
  scannedAt: number,
): Promise<void> {
  const payload: PersistedSignalBoard = { timeframe, rows, scannedAt };
  await storageSetItem(STORAGE_KEY, JSON.stringify(payload));
}

export async function loadPersistedSignalBoard(
  timeframe?: AnalysisTimeframe,
): Promise<PersistedSignalBoard | null> {
  const raw = await storageGetItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedSignalBoard;
    if (!parsed?.rows || !parsed.scannedAt) return null;
    if (timeframe != null && parsed.timeframe !== timeframe) return null;
    return parsed;
  } catch {
    return null;
  }
}
