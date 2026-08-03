/**
 * Task 15.7 — Entry Quality Engine public API.
 */

export { ENTRY_QUALITY_VERSION, ENTRY_QUALITY_PILLAR_WEIGHTS } from './EntryQualityTypes';
export type {
  EntryQualitySide,
  EntryQualityDecision,
  EntryQualityGrade,
  EntryQualityCheckStatus,
  EntryQualityPillarId,
  EntryQualityCheckId,
  EntryQualityDetection,
  EntryQualityMarketSnapshot,
  EntryQualityRuleBookView,
  EntryQualityEntryDecisionInput,
  EntryQualityCheck,
  EntryQualityPillarScore,
  EntryQualitySummary,
  EntryQualityReport,
} from './EntryQualityTypes';

export {
  ENTRY_QUALITY_RULES,
  entryQualityGradeFromScore,
  blendPillarScores,
  decideEntryQuality,
  entryQualityConfidence,
} from './EntryQualityRules';

export {
  formatEntryQualityGrade,
  formatEntryQualityDecision,
  formatEntryQualityScore,
} from './EntryQualityFormatter';

export {
  evaluateEntryChecks,
  buildPillarScores,
  collectDetections,
  resolveBlockers,
  historicalReliabilityFromDashboard,
  buildEntryQualityFromInputs,
} from './EntryQualityBuilder';

export {
  buildEntryQualityEvidence,
  formatEntryEvidenceLine,
} from './EntryExplainability';

export type {
  EntryQualityEvidence,
  EntryQualityEvidenceSource,
} from './EntryExplainabilityTypes';
export { ENTRY_QUALITY_EVIDENCE_MISSING } from './EntryExplainabilityTypes';

export { buildEntryQualityReport } from './EntryQualityEngine';
