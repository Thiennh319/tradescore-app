import type { AnalysisTimeframe, AppSettings, AppTradeSymbol, TradeDirection } from '../constants/scoring';
import type { ScoringResultV4 } from '../services/scorerV4';
import type { ScoringResultV3 } from '../services/scorerV3';
import type { ScorerVersion } from '../constants/scoring';
import type {
  AnalysisSnapshot,
  PsychologyChecklist,
  StoredTradeJournalEntry,
  TradePlansByDirection,
} from '../store/useTradeStore';
import { storageGetItem, storageSetItem } from './storage';

/** Khóa lưu trữ phiên bản 5 — tương thích ngược. */
export const LEGACY_STORAGE_KEYS = {
  journal: '@tradescore/v5/trade-journal',
  settings: '@tradescore/v5/settings',
  psychology: '@tradescore/v5/psychology',
  symbol: '@tradescore/v5/selected-symbol',
  direction: '@tradescore/v5/selected-direction',
  timeframe: '@tradescore/v5/analysis-timeframe',
  scorerVersion: '@tradescore/v6/scorer-version',
} as const;

/** Khóa lưu trữ phiên bản 6 — snapshot phân tích + scoring. */
export const PERSIST_STORAGE_KEYS = {
  analysisBundle: '@tradescore/v6/analysis-bundle',
  savedAt: '@tradescore/v6/last-saved-at',
} as const;

export interface PersistedAnalysisBundle {
  analysisResults: AnalysisSnapshot | null;
  tradePlans: TradePlansByDirection;
  scoringResultV4?: ScoringResultV4 | null;
  scoringResultV3?: ScoringResultV3 | null;
  scorerVersion?: ScorerVersion;
  selectedDirection: TradeDirection;
  selectedSymbol: AppTradeSymbol;
  analysisTimeframe: AnalysisTimeframe;
  savedAt: number;
}

export interface HydratedAppData {
  journal: StoredTradeJournalEntry[];
  settings: Partial<AppSettings> | null;
  psychology: Partial<PsychologyChecklist> | null;
  symbol: AppTradeSymbol | null;
  direction: TradeDirection | null;
  timeframe: AnalysisTimeframe | null;
  scorerVersion: ScorerVersion | null;
  analysisBundle: PersistedAnalysisBundle | null;
  savedAt: number | null;
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await storageGetItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Đọc toàn bộ dữ liệu đã lưu (journal, lệnh OPEN/PENDING/CLOSED, prefs, phân tích). */
export async function loadPersistedAppData(): Promise<HydratedAppData> {
  const [
    journal,
    settings,
    psychology,
    symbol,
    direction,
    timeframe,
    scorerVersion,
    analysisBundle,
    savedAtRaw,
  ] = await Promise.all([
    readJson<StoredTradeJournalEntry[]>(LEGACY_STORAGE_KEYS.journal),
    readJson<Partial<AppSettings>>(LEGACY_STORAGE_KEYS.settings),
    readJson<Partial<PsychologyChecklist>>(LEGACY_STORAGE_KEYS.psychology),
    readJson<AppTradeSymbol>(LEGACY_STORAGE_KEYS.symbol),
    readJson<TradeDirection>(LEGACY_STORAGE_KEYS.direction),
    readJson<AnalysisTimeframe>(LEGACY_STORAGE_KEYS.timeframe),
    readJson<ScorerVersion>(LEGACY_STORAGE_KEYS.scorerVersion),
    readJson<PersistedAnalysisBundle>(PERSIST_STORAGE_KEYS.analysisBundle),
    storageGetItem(PERSIST_STORAGE_KEYS.savedAt),
  ]);

  const savedAt = savedAtRaw ? Number(savedAtRaw) : analysisBundle?.savedAt ?? null;

  return {
    journal: journal ?? [],
    settings,
    psychology,
    symbol,
    direction,
    timeframe,
    scorerVersion,
    analysisBundle,
    savedAt: Number.isFinite(savedAt) ? savedAt : null,
  };
}

export async function savePersistedAnalysisBundle(
  bundle: Omit<PersistedAnalysisBundle, 'savedAt'>,
): Promise<void> {
  const savedAt = Date.now();
  const payload: PersistedAnalysisBundle = { ...bundle, savedAt };
  await storageSetItem(PERSIST_STORAGE_KEYS.analysisBundle, JSON.stringify(payload));
  await storageSetItem(PERSIST_STORAGE_KEYS.savedAt, String(savedAt));
}

export function summarizeJournal(journal: StoredTradeJournalEntry[]) {
  return {
    open: journal.filter((e) => e.status === 'OPEN').length,
    pending: journal.filter((e) => e.status === 'PENDING').length,
    closed: journal.filter((e) => e.status === 'CLOSED').length,
    total: journal.length,
  };
}
