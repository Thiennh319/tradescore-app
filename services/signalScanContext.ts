import { AI_JOURNAL_STORAGE_KEYS, type AiTradeJournalEntry } from '../constants/aiJournal';
import type { AppSettings } from '../constants/scoring';
import {
  computeDailyLossUsdt,
  derivePsychology,
  type PsychologyChecklist,
  type StoredTradeJournalEntry,
} from '../store/useTradeStore';
import { persistGetJson } from './persistStorage';
import type { SignalScanContext } from './signalBoardScan';
import {
  loadPersistedJournal,
  loadPersistedPsychologyContext,
  loadPersistedSettings,
} from './tradeStorePersist';

/** Context V3 (chuỗi thua, lỗ ngày, journal gần đây) — phải giống nhau mọi nền tảng. */
export function buildSignalScanContext(input: {
  tradeJournal: StoredTradeJournalEntry[];
  aiTradeJournal: AiTradeJournalEntry[];
  settings: AppSettings;
}): SignalScanContext {
  const psychology = derivePsychology(input.tradeJournal, input.settings);
  return {
    consecutiveLosses: psychology.consecutiveLosses,
    consecutiveLossesIn24h: psychology.consecutiveLossesIn24h,
    lossStreakLocked: psychology.lossStreakLocked,
    lossStreakLockUntil: psychology.lossStreakLockUntil,
    dailyLossUSDT: computeDailyLossUsdt(input.tradeJournal),
    recentJournal: input.aiTradeJournal
      .slice(-30)
      .map((e) => ({ outcome: e.outcome })),
    currentCapital: input.settings.accountSize,
    initialCapital: input.settings.initialCapital,
  };
}

/** Đọc journal + AI journal từ storage — dùng foreground scan / notification. */
export async function loadPersistedSignalScanContext(): Promise<SignalScanContext> {
  const [journal, settings, aiJournal] = await Promise.all([
    loadPersistedJournal(),
    loadPersistedSettings(),
    persistGetJson<AiTradeJournalEntry[]>(AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL),
  ]);
  return buildSignalScanContext({
    tradeJournal: journal,
    aiTradeJournal: aiJournal ?? [],
    settings,
  });
}

/** Psychology + context đầy đủ cho quét nền. */
export async function loadPersistedScanInputs(): Promise<{
  scanContext: SignalScanContext;
  psychology: Awaited<ReturnType<typeof loadPersistedPsychologyContext>>['psychology'];
}> {
  const [{ journal, settings, psychology }, aiJournal] = await Promise.all([
    loadPersistedPsychologyContext(),
    persistGetJson<AiTradeJournalEntry[]>(AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL),
  ]);
  return {
    psychology,
    scanContext: buildSignalScanContext({
      tradeJournal: journal,
      aiTradeJournal: aiJournal ?? [],
      settings,
    }),
  };
}
