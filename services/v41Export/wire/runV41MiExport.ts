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
