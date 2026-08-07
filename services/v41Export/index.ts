/**
 * V4.1 Export public entry (P0: Market Intelligence Trace).
 * Isolated from services/aiExport and services/aiReviewExport.
 */

export { UNAVAILABLE, fmt, kv, table, type V41ExportScalar } from './formatters/markdown';
export {
  resolveV41ExportMeta,
  V41_EXPORT_DOC_VERSION,
  type V41ExportMeta,
  type V41ExportMetaInput,
} from './types/V41ExportMeta';
export { buildMarketIntelligenceTrace } from './marketIntelligence/Builder';
export { formatMarketIntelligenceTrace } from './marketIntelligence/Formatter';
export { buildMarketIntelligenceExport } from './marketIntelligence/Export';
export type {
  MarketIntelligenceExportInput,
  MarketIntelligenceTrace,
  MarketIntelligenceDetail,
  MarketIntelligenceSnapshot,
} from './marketIntelligence/Types';
export {
  exportV41MarketIntelligenceTrace,
  exportV41RulebookTrace,
  type ExportV41MarketIntelligenceTraceOptions,
  type ExportV41RulebookTraceOptions,
  type V41TraceMarkdownResult,
} from './wire/exportV41TraceReviewWire';
export {
  runV41MarketIntelligenceExport,
  runV41RulebookExport,
  runV41PairedMiRulebookExport,
  buildV41PairedMiRulebookMarkdown,
  resolveV41ExportRow,
  v41PanelExportLabel,
  V41_PANEL_EXPORT_OPTIONS,
  type V41PanelExportKind,
  type RunV41MiExportResult,
  type RunV41RulebookExportResult,
  type RunV41PairedExportResult,
  type V41PairedMiRulebookMarkdown,
} from './wire/runV41MiExport';
export {
  buildRulebookV41Export,
  buildRulebookV41Trace,
  buildRulebookV41TraceDocument,
  formatRulebookV41Trace,
  RULEBOOK_V41_FILENAME_PREFIX,
  evaluateDecisionTierConsistency,
  buildDecisionBandRulesForTest,
  type RulebookV41ExportInput,
  type RulebookV41Trace,
  type RulebookV41Rule,
  type RulebookV41Status,
  type RulebookV41Stage,
  type RulebookDecisionTierReviewLevel,
} from './rulebook';
