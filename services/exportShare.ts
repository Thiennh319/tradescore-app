import { Platform, Share } from 'react-native';
import type { AiTradeJournalEntry, DailySessionStats, WeeklyStats } from '../constants/aiJournal';
import {
  downloadTextFile,
  exportJournalJson,
  exportJournalToCSV,
  exportSkippedSetupsToCSV,
  generateTextReport,
} from './exportService';
import { getVietnamDateParts } from '../store/useTradeStore';

async function writeAndShareFile(
  filename: string,
  content: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    const mime = filename.endsWith('.csv') ? 'text/csv' : filename.endsWith('.json') ? 'application/json' : 'text/plain';
    downloadTextFile(filename, content, mime);
    return;
  }

  try {
    const FileSystem = await import('expo-file-system/legacy');
    const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!base) throw new Error('no directory');
    const path = `${base}${filename}`;
    await FileSystem.writeAsStringAsync(path, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await Share.share({
      url: path,
      title: filename,
      message: Platform.OS === 'android' ? content.slice(0, 8000) : undefined,
    });
  } catch {
    await Share.share({ message: content, title: filename });
  }
}

export async function shareJournalCsv(
  entries: AiTradeJournalEntry[],
  accountHistory: import('../constants/aiJournal').AccountHistoryPoint[] = [],
): Promise<void> {
  const csv = await exportJournalToCSV(entries, accountHistory);
  const ymd = getVietnamDateParts().ymd;
  await writeAndShareFile(`tradescore-journal-${ymd}.csv`, csv);
}

export async function shareSkippedSetupsCsv(
  entries: import('../constants/scoring').SkippedSetupEntry[],
): Promise<void> {
  const csv = exportSkippedSetupsToCSV(entries);
  const ymd = getVietnamDateParts().ymd;
  await writeAndShareFile(`tradescore-skipped-setups-${ymd}.csv`, csv);
}

export async function exportJournalToJSON(
  entries: AiTradeJournalEntry[],
  dailyStats: DailySessionStats[] = [],
): Promise<void> {
  const json = exportJournalJson(entries, dailyStats);
  const ymd = getVietnamDateParts().ymd;
  await writeAndShareFile(`tradescore-journal-${ymd}.json`, json);
}

export async function shareWeeklyReport(
  stats: WeeklyStats,
  insights: string[],
): Promise<void> {
  const text = generateTextReport(stats, insights);
  if (Platform.OS === 'web') {
    downloadTextFile(`tradescore-report-${stats.to}.txt`, text, 'text/plain');
    return;
  }
  await Share.share({ message: text, title: 'TradeScore Weekly Report' });
}
