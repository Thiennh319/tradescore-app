/**
 * Task 15.7 — Entry Quality Engine orchestrator.
 * Entry quality only. Deterministic. Consume-only. No AI / UI / mutations.
 */

import type { ULDashboardData } from '../types';
import { buildEntryQualityFromInputs } from './EntryQualityBuilder';
import type {
  EntryQualityEntryDecisionInput,
  EntryQualityMarketSnapshot,
  EntryQualityReport,
  EntryQualityRuleBookView,
} from './EntryQualityTypes';
import { ENTRY_QUALITY_VERSION } from './EntryQualityTypes';

function emptyReport(headline: string): EntryQualityReport {
  return {
    version: ENTRY_QUALITY_VERSION,
    summary: {
      headline,
      checkCount: 0,
      passCount: 0,
      warnCount: 0,
      failCount: 0,
      blockerCount: 0,
      topDetection: null,
    },
    score: 0,
    grade: 'F',
    confidence: 0,
    decision: 'AVOID',
    strengths: [],
    weaknesses: [],
    passedChecks: [],
    failedChecks: [],
    blockedReasons: [],
    recommendations: [],
    pillars: [],
    checks: [],
    detections: [],
    evidence: [],
  };
}

/**
 * Primary API — market + entry decision + RuleBook view + optional dashboard.
 * Never throws. Does not mutate inputs. O(1) vs trade history.
 */
export function buildEntryQualityReport(
  marketSnapshot: EntryQualityMarketSnapshot | null | undefined,
  entryDecision: EntryQualityEntryDecisionInput | null | undefined,
  ruleBook: EntryQualityRuleBookView | null | undefined,
  dashboard?: ULDashboardData | null | undefined,
): EntryQualityReport {
  try {
    if (marketSnapshot == null && entryDecision == null && ruleBook == null) {
      return emptyReport('No entry quality inputs.');
    }
    return buildEntryQualityFromInputs(marketSnapshot, entryDecision, ruleBook, dashboard);
  } catch {
    return emptyReport('Entry quality evaluation failed safely.');
  }
}
