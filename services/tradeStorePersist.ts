import {
  DEFAULT_SETTINGS,
  type AnalysisTimeframe,
  type AppSettings,
  type PsychologyChecklistV2,
} from '../constants/scoring';
import {
  DEFAULT_PSYCHOLOGY_CHECKLIST,
  derivePsychology,
  toScoringPsychologyChecklist,
  type PsychologyChecklist,
  type StoredTradeJournalEntry,
} from '../store/useTradeStore';
import { LEGACY_STORAGE_KEYS as STORAGE_KEYS } from './appPersistence';
import { storageGetItem, storageSetItem } from './storage';

const BG_SESSION_LOCK = '@tradescore/v1/bg-session-notified';

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await storageGetItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  await storageSetItem(key, JSON.stringify(value));
}

export async function loadPersistedSettings(): Promise<AppSettings> {
  const settings = await readJson<Partial<AppSettings>>(STORAGE_KEYS.settings);
  return settings ? { ...DEFAULT_SETTINGS, ...settings } : { ...DEFAULT_SETTINGS };
}

export async function loadPersistedTimeframe(): Promise<AnalysisTimeframe> {
  const tf = await readJson<AnalysisTimeframe>(STORAGE_KEYS.timeframe);
  return tf ?? '1h';
}

export async function loadPersistedJournal(): Promise<StoredTradeJournalEntry[]> {
  return (await readJson<StoredTradeJournalEntry[]>(STORAGE_KEYS.journal)) ?? [];
}

export async function loadPersistedScoringPsychology(): Promise<PsychologyChecklistV2> {
  const [journal, settings, psychology] = await Promise.all([
    loadPersistedJournal(),
    loadPersistedSettings(),
    readJson<PsychologyChecklist>(STORAGE_KEYS.psychology),
  ]);
  return toScoringPsychologyChecklist(
    psychology ? { ...DEFAULT_PSYCHOLOGY_CHECKLIST, ...psychology } : DEFAULT_PSYCHOLOGY_CHECKLIST,
    journal,
    settings,
  );
}

export async function loadPersistedPsychologyContext(): Promise<{
  journal: StoredTradeJournalEntry[];
  settings: AppSettings;
  psychology: ReturnType<typeof derivePsychology>;
}> {
  const [journal, settings] = await Promise.all([loadPersistedJournal(), loadPersistedSettings()]);
  return {
    journal,
    settings,
    psychology: derivePsychology(journal, settings),
  };
}

export async function updatePersistedJournalEntry(
  id: string,
  patch: Partial<StoredTradeJournalEntry>,
): Promise<void> {
  const journal = await loadPersistedJournal();
  const next = journal.map((e) => (e.id === id ? { ...e, ...patch } : e));
  await writeJson(STORAGE_KEYS.journal, next);
}

export async function getBackgroundSessionLock(): Promise<string | null> {
  return storageGetItem(BG_SESSION_LOCK);
}

export async function setBackgroundSessionLock(key: string): Promise<void> {
  await storageSetItem(BG_SESSION_LOCK, key);
}
