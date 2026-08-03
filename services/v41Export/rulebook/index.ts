/**
 * V4.1 Rulebook Trace — public barrel (P0 rulebook skeleton).
 * No wire/UI in this step.
 */

export type {
  RulebookV41Stage,
  RulebookV41Status,
  RulebookV41EvidenceItem,
  RulebookV41Rule,
  RulebookV41DecisionOutput,
  RulebookV41Summary,
  RulebookV41InputSnapshot,
  RulebookV41Trace,
  RulebookV41ExportInput,
} from './Types';
export { RULEBOOK_V41_FILENAME_PREFIX } from './Types';
export {
  buildRulebookV41Trace,
  evaluateDecisionTierConsistency,
  buildDecisionBandRulesForTest,
  BREAKOUT_MC_REASON_VI,
  BREAKOUT_DECISION_REASON_VI,
  type RulebookDecisionMatchedTier,
  type RulebookDecisionTierReviewLevel,
} from './Builder';
export { formatRulebookV41Trace } from './Formatter';
export {
  buildRulebookV41Export,
  buildRulebookV41TraceDocument,
} from './Export';
