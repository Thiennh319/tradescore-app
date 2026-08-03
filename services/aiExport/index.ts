/**
 * TASK 16.0 — AI Export Framework (Phase 1). Public entry point.
 *
 * Export layer only: engines are READ ONLY, the framework returns
 * Markdown strings and never writes files or touches the Store.
 */

export * from './types';
export type {
  TracePresentation,
  TracePresentationEvidence,
  TracePresentationLayer,
  TracePresentationMetadata,
} from './tracePresentationTypes';
export { UNAVAILABLE } from './formatters/markdown';
export { AI_EXPORT_VERSION, buildAiDocument, SECTION_DIVIDER } from './templates/aiDocumentTemplate';
export {
  AI_EXPORT_FILE_NAMES,
  buildAdvisorExport,
  buildAiExport,
  buildEntryExport,
  buildJournalExport,
  buildMarketSnapshotExportMd,
  buildReadmeExport,
  buildRuleExport,
  buildScoreExport,
  buildSignalDecisionExport,
  buildSummaryExport,
  buildTradePlanExport,
  buildUlAnalyticsExport,
} from './builders/domainBuilders';
export {
  buildRuleTrace,
  buildRuleTraceExport,
  formatRuleTrace,
  toRuleTracePresentation,
  type RuleTrace,
  type RuleTraceInput,
  type RuleTracePresentation,
  type RuleTraceRule,
} from './ruleTrace';
export {
  buildScoreTrace,
  buildScoreTraceExport,
  formatScoreTrace,
  toScoreTracePresentation,
  type ScoreTrace,
  type ScoreTraceComponent,
  type ScoreTraceInput,
  type ScoreTracePresentation,
} from './scoreTrace';
export {
  buildEntryTrace,
  buildEntryTraceExport,
  formatEntryTrace,
  type EntryTrace,
  type EntryTraceCheck,
  type EntryTraceInput,
} from './entryTrace';
export {
  buildPositionAdviserTrace,
  buildPositionAdviserTraceExport,
  formatPositionAdviserTrace,
  type PositionAdviserTrace,
  type PositionAdviserTraceInput,
} from './positionAdviserTrace';
export {
  buildTradePlanTrace,
  buildTradePlanTraceExport,
  formatTradePlanTrace,
  type TradePlanTrace,
  type TradePlanTraceInput,
} from './tradePlanTrace';
