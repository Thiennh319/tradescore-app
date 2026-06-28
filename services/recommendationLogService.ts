import { storageGetItem, storageSetItem } from './storage';

export interface RecommendationLogEntry {
  id: string;
  tradeId: string;
  timestamp: number;
  type: string;
  label: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  triggeredBy: string;
  scoreSnapshot: {
    totalScore: number;
    groupScores: { A: number; B: number; C: number };
  };
  priceAtLog: number;
  pnlUSDTAtLog: number;
  trigger: 'URGENCY_CHANGE' | 'USER_INTERACTION' | 'PERIODIC';
}

const STORAGE_KEY = 'gd1_recommendation_log';
const MAX_ENTRIES_PER_TRADE = 20;

const lastUrgencyByTrade: Record<string, string> = {};

export function resetRecommendationLogMemory(): void {
  for (const key of Object.keys(lastUrgencyByTrade)) {
    delete lastUrgencyByTrade[key];
  }
}

async function readAllLogs(): Promise<RecommendationLogEntry[]> {
  const raw = await storageGetItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as RecommendationLogEntry[];
  } catch {
    return [];
  }
}

async function writeAllLogs(logs: RecommendationLogEntry[]): Promise<void> {
  await storageSetItem(STORAGE_KEY, JSON.stringify(logs));
}

function trimLogsByTrade(allLogs: RecommendationLogEntry[]): RecommendationLogEntry[] {
  const byTrade: Record<string, RecommendationLogEntry[]> = {};
  for (const log of allLogs) {
    if (!byTrade[log.tradeId]) byTrade[log.tradeId] = [];
    byTrade[log.tradeId].push(log);
  }

  const trimmed: RecommendationLogEntry[] = [];
  for (const tradeId of Object.keys(byTrade)) {
    const logs = byTrade[tradeId]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_ENTRIES_PER_TRADE);
    trimmed.push(...logs);
  }
  return trimmed;
}

export async function logRecommendationIfNeeded(
  entry: Omit<RecommendationLogEntry, 'id' | 'trigger'>,
  isUserInteraction = false,
): Promise<void> {
  const prevUrgency = lastUrgencyByTrade[entry.tradeId];
  const urgencyChanged = prevUrgency !== entry.urgency;

  if (!urgencyChanged && !isUserInteraction) {
    return;
  }

  lastUrgencyByTrade[entry.tradeId] = entry.urgency;

  const trigger: RecommendationLogEntry['trigger'] = isUserInteraction
    ? 'USER_INTERACTION'
    : 'URGENCY_CHANGE';

  const fullEntry: RecommendationLogEntry = {
    ...entry,
    id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    trigger,
  };

  try {
    const allLogs = await readAllLogs();
    allLogs.push(fullEntry);
    await writeAllLogs(trimLogsByTrade(allLogs));
  } catch (e) {
    console.error('Lỗi log recommendation:', e);
  }
}

export async function getRecommendationLogForTrade(
  tradeId: string,
): Promise<RecommendationLogEntry[]> {
  try {
    const allLogs = await readAllLogs();
    return allLogs
      .filter((l) => l.tradeId === tradeId)
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

export async function clearOldRecommendationLogs(olderThanDays = 30): Promise<void> {
  try {
    const allLogs = await readAllLogs();
    const cutoff = Date.now() - olderThanDays * 24 * 3_600_000;
    const filtered = allLogs.filter((l) => l.timestamp >= cutoff);
    await writeAllLogs(filtered);
  } catch (e) {
    console.error('Lỗi clear log cũ:', e);
  }
}
