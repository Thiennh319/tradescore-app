/**
 * Task 15.5 — Trading Psychology Engine public API.
 */

export {
  TRADING_PSYCHOLOGY_VERSION,
  TRADING_PSYCHOLOGY_SEVERITY_RANK,
  TRADING_PSYCHOLOGY_TRAIT_IDS,
} from './TradingPsychologyTypes';
export type {
  TradingPsychologyTraitId,
  TradingPsychologyType,
  TradingPsychologySeverity,
  TradingPsychologyGrade,
  TradingPsychologyFinding,
  TradingPsychologyTrait,
  TradingPsychologySummary,
  TradingPsychologyReport,
} from './TradingPsychologyTypes';

export {
  PSYCHOLOGY_RULES,
  DETECTION_BY_INSIGHT_ID,
  psychologyGradeFromScore,
  clampTraitScore,
} from './TradingPsychologyRules';
export {
  formatPsychologyGrade,
  formatPsychologySeverity,
  clampPsychologyConfidence,
} from './TradingPsychologyFormatter';
export {
  collectPsychologyFindings,
  buildTraitScores,
  bucketFindings,
} from './TradingPsychologyBuilder';
export { buildTradingPsychologyReport } from './TradingPsychologyEngine';
