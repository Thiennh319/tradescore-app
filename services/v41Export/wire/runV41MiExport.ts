/**
 * V4.1 MI export from scan rows — pure orchestration for UI header Export.
 * Isolated from aiExport / exportTraceReviewWire / SignalBoard.
 */

import type { SignalRowV41 } from '../../v41/scanV41';
import {
  exportV41MarketIntelligenceTrace,
  exportV41RulebookTrace,
} from './exportV41TraceReviewWire';

export type V41PanelExportKind =
  | 'marketIntelligence'
  | 'rulebook'
  | 'miRulebookPair'
  | 'visibilityEntry'
  | 'decisionConfidence'
  | 'rc3'
  | 'position';

export const V41_PANEL_EXPORT_OPTIONS: ReadonlyArray<{
  id: V41PanelExportKind;
  label: string;
  enabled: boolean;
}> = [
  { id: 'marketIntelligence', label: 'Market Intelligence', enabled: true },
  { id: 'rulebook', label: 'Rulebook', enabled: true },
  {
    id: 'miRulebookPair',
    label: 'MI + Rulebook (cùng snapshot)',
    enabled: true,
  },
  { id: 'visibilityEntry', label: 'Visibility + Entry (P1)', enabled: false },
  { id: 'decisionConfidence', label: 'Decision + Confidence (P2)', enabled: false },
  { id: 'rc3', label: 'RC3 Trace (P3)', enabled: false },
  { id: 'position', label: 'Position Trace (P4)', enabled: false },
];

export function v41PanelExportLabel(kind: V41PanelExportKind): string {
  return V41_PANEL_EXPORT_OPTIONS.find((o) => o.id === kind)?.label ?? kind;
}

export function resolveV41ExportRow(
  rows: readonly SignalRowV41[],
  symbol: string,
): SignalRowV41 | null {
  const hit = rows.find((row) => row.symbol === symbol);
  return hit ?? null;
}

export type RunV41MiExportResult =
  | { ok: true; filename: string }
  | { ok: false; message: string };

/**
 * Lookup row → wire Markdown → share/download.
 * Does not recompute MI engines.
 * Default share is loaded lazily so unit tests can inject a mock without expo-fs.
 */
export async function runV41MarketIntelligenceExport(
  rows: readonly SignalRowV41[],
  symbol: string,
  options?: { share?: (filename: string, markdown: string) => Promise<void> },
): Promise<RunV41MiExportResult> {
  if (rows.length === 0) {
    return { ok: false, message: 'Chưa có dữ liệu scan V4.1 để xuất.' };
  }
  const row = resolveV41ExportRow(rows, symbol);
  if (row == null) {
    return { ok: false, message: `Không tìm thấy ${symbol} trong dữ liệu scan.` };
  }
  const { filename, markdown } = exportV41MarketIntelligenceTrace(row);
  if (options?.share) {
    await options.share(filename, markdown);
  } else {
    const { shareV41TextFile } = await import('../../v41/exportShareV41');
    await shareV41TextFile(filename, markdown);
  }
  return { ok: true, filename };
}

export type RunV41RulebookExportResult = RunV41MiExportResult;

export type V41PairedMiRulebookMarkdown = {
  generatedAt: string;
  scanTimestamp: number;
  marketIntelligence: { filename: string; markdown: string };
  rulebook: { filename: string; markdown: string };
};

/**
 * Build MI + Rulebook từ **một** SignalRowV41 + một generatedAt.
 * Đảm bảo Scan Timestamp (từ snapshot) và Generated At khớp giữa 2 document.
 * Không re-scan / không query store.
 */
export function buildV41PairedMiRulebookMarkdown(
  row: SignalRowV41,
  options?: { generatedAt?: string },
): V41PairedMiRulebookMarkdown {
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const meta = { generatedAt, coin: row.symbol };
  const marketIntelligence = exportV41MarketIntelligenceTrace(row, { metadata: meta });
  const rulebook = exportV41RulebookTrace(row, { metadata: meta });
  return {
    generatedAt,
    scanTimestamp: row.snapshot.scanTimestamp,
    marketIntelligence,
    rulebook,
  };
}

/**
 * Lookup row → Rulebook Markdown → share/download.
 * Re-calls pure detectors via Builder (no network/scan).
 */
export async function runV41RulebookExport(
  rows: readonly SignalRowV41[],
  symbol: string,
  options?: { share?: (filename: string, markdown: string) => Promise<void> },
): Promise<RunV41RulebookExportResult> {
  if (rows.length === 0) {
    return { ok: false, message: 'Chưa có dữ liệu scan V4.1 để xuất.' };
  }
  const row = resolveV41ExportRow(rows, symbol);
  if (row == null) {
    return { ok: false, message: `Không tìm thấy ${symbol} trong dữ liệu scan.` };
  }
  const { filename, markdown } = exportV41RulebookTrace(row);
  if (options?.share) {
    await options.share(filename, markdown);
  } else {
    const { shareV41TextFile } = await import('../../v41/exportShareV41');
    await shareV41TextFile(filename, markdown);
  }
  return { ok: true, filename };
}

export type RunV41PairedExportResult =
  | { ok: true; filenames: [string, string]; generatedAt: string; scanTimestamp: number }
  | { ok: false; message: string };

/**
 * Một lần export: MI + Rulebook cùng frozen row / generatedAt / scanTimestamp.
 * Dùng khi cần audit pair nhất quán (tránh lệch scan nếu xuất riêng 2 lần).
 */
export async function runV41PairedMiRulebookExport(
  rows: readonly SignalRowV41[],
  symbol: string,
  options?: { share?: (filename: string, markdown: string) => Promise<void> },
): Promise<RunV41PairedExportResult> {
  if (rows.length === 0) {
    return { ok: false, message: 'Chưa có dữ liệu scan V4.1 để xuất.' };
  }
  const row = resolveV41ExportRow(rows, symbol);
  if (row == null) {
    return { ok: false, message: `Không tìm thấy ${symbol} trong dữ liệu scan.` };
  }

  const paired = buildV41PairedMiRulebookMarkdown(row);
  const share =
    options?.share ??
    (async (filename: string, markdown: string) => {
      const { shareV41TextFile } = await import('../../v41/exportShareV41');
      await shareV41TextFile(filename, markdown);
    });

  await share(paired.marketIntelligence.filename, paired.marketIntelligence.markdown);
  await share(paired.rulebook.filename, paired.rulebook.markdown);

  return {
    ok: true,
    filenames: [paired.marketIntelligence.filename, paired.rulebook.filename],
    generatedAt: paired.generatedAt,
    scanTimestamp: paired.scanTimestamp,
  };
}
