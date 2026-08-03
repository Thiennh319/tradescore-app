/**
 * V4.1 Export wire — SignalRowV41 → Market Intelligence Markdown.
 * Copy-only. No engine recompute. Isolated from aiExport / aiReviewExport / exportTraceReviewWire.
 */

import type { SignalRowV41 } from '../../v41/scanV41';
import { buildMarketIntelligenceExport } from '../marketIntelligence/Export';
import { buildRulebookV41Export } from '../rulebook/Export';
import { RULEBOOK_V41_FILENAME_PREFIX } from '../rulebook/Types';
import type { V41ExportMetaInput } from '../types/V41ExportMeta';

export type V41TraceMarkdownResult = {
  filename: string;
  markdown: string;
};

export type ExportV41MarketIntelligenceTraceOptions = {
  /** Optional meta override (e.g. fixed generatedAt for tests). Copy-only. */
  metadata?: V41ExportMetaInput | null;
};

export type ExportV41RulebookTraceOptions = {
  /** Optional meta override (e.g. fixed generatedAt for tests). */
  metadata?: V41ExportMetaInput | null;
};

/** Sanitize symbol for filename segment (A–Z, 0–9 only). */
function symbolForFilename(symbol: string): string {
  const cleaned = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : 'UNKNOWN';
}

/**
 * Wire: SignalRowV41 → 01_MARKET_INTELLIGENCE Markdown.
 * Takes row.snapshot (+ row.symbol) only — no recompute of MI engines.
 */
export function exportV41MarketIntelligenceTrace(
  row: SignalRowV41,
  options?: ExportV41MarketIntelligenceTraceOptions,
): V41TraceMarkdownResult {
  const symbol = row.symbol;
  const filename = `01_MARKET_INTELLIGENCE_V41_${symbolForFilename(symbol)}.md`;
  const markdown = buildMarketIntelligenceExport({
    snapshot: row.snapshot,
    symbol,
    metadata: {
      coin: symbol,
      ...(options?.metadata ?? {}),
    },
  });
  return { filename, markdown };
}

/**
 * Wire: SignalRowV41 → 01_RULEBOOK_V41 Markdown.
 * Builder may re-call pure detectors from row fields (no network/scan).
 */
export function exportV41RulebookTrace(
  row: SignalRowV41,
  options?: ExportV41RulebookTraceOptions,
): V41TraceMarkdownResult {
  const symbol = row.symbol;
  const filename = `${RULEBOOK_V41_FILENAME_PREFIX}${symbolForFilename(symbol)}.md`;
  const markdown = buildRulebookV41Export({
    row,
    symbol,
    metadata: {
      coin: symbol,
      ...(options?.metadata ?? {}),
    },
  });
  return { filename, markdown };
}
