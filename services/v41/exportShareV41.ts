import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { SignalRowV41 } from './scanV41';
import { exportSignalDataV41, type V41SymbolQuote } from './exportServiceV41';

function downloadTextFileWeb(filename: string, content: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function saveAndShareNativeFile(
  filename: string,
  content: string,
  mimeType: string,
): Promise<void> {
  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDir) throw new Error('Không có thư mục lưu file');
  const fileUri = `${baseDir}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: filename });
    return;
  }
  throw new Error('Sharing không khả dụng');
}

export interface ExportV41SignalReportResult {
  filenameTxt: string;
  filenameCsv: string;
  coinCount: number;
}

/** Xuất báo cáo V4.1 — web download hoặc native share (txt + csv). */
export async function exportV41SignalReport(
  rows: SignalRowV41[],
  quotes: Record<string, V41SymbolQuote>,
): Promise<ExportV41SignalReportResult> {
  if (rows.length === 0) {
    throw new Error('Không có dữ liệu để xuất');
  }

  const txtContent = exportSignalDataV41(rows, quotes, 'txt');
  const csvContent = exportSignalDataV41(rows, quotes, 'csv');
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filenameTxt = `tradescore-v41-signal-${timestamp}.txt`;
  const filenameCsv = `tradescore-v41-signal-${timestamp}.csv`;

  if (Platform.OS === 'web') {
    downloadTextFileWeb(filenameTxt, txtContent, 'text/plain;charset=utf-8');
    downloadTextFileWeb(filenameCsv, csvContent, 'text/csv;charset=utf-8');
  } else {
    await saveAndShareNativeFile(filenameTxt, txtContent, 'text/plain');
    await saveAndShareNativeFile(filenameCsv, csvContent, 'text/csv');
  }

  return { filenameTxt, filenameCsv, coinCount: rows.length };
}
