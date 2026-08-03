/**
 * Task 14.1 — Outcome Analysis (reproducible, no AI).
 * Rule #60.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { isClosedOutcome } from '../journalService';
import { parseProjectedTags } from './parseProjectedTags';
import type { JournalOutcomeAnalysisResult } from './types';

function clamp01to100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function buildJournalOutcomeAnalysis(
  entry: AiTradeJournalEntry,
): JournalOutcomeAnalysisResult {
  const closed = isClosedOutcome(entry.outcome.status);
  const success = closed ? entry.outcome.status === 'WIN' : null;
  const failure = closed
    ? entry.outcome.status === 'LOSS' || entry.outcome.status === 'CANCELLED'
    : null;
  const pnl = entry.outcome.pnlUSDT ?? null;
  const rr = Number.isFinite(entry.plan.rrProposed) ? entry.plan.rrProposed : null;

  const slip = Math.abs(entry.market.slippage);
  const executionQuality = clamp01to100(100 - Math.min(100, slip * 200));

  const riskQuality = entry.plan.isSafeSL
    ? clamp01to100(70 + Math.min(30, (rr ?? 0) * 10))
    : clamp01to100(40);

  const violations = entry.scoring.mandatoryViolations?.length ?? 0;
  const disciplineScore = clamp01to100(100 - violations * 25);

  const meta = parseProjectedTags(entry);
  let advisorAccuracy: number | null = null;
  if (meta.adviserTimeline.length > 0 && closed) {
    const last = meta.adviserTimeline[meta.adviserTimeline.length - 1]!;
    const aligned =
      (success && (last.advisorActionCode === 'CLOSE_NOW' || last.advisorActionCode.includes('PARTIAL'))) ||
      (failure && last.advisorActionCode === 'HOLD');
    // Simple reproducible score: followed CLOSE on win or HOLD on loss = lower
    if (success && last.advisorActionCode === 'CLOSE_NOW') advisorAccuracy = 80;
    else if (success) advisorAccuracy = 65;
    else if (failure && last.advisorActionCode === 'HOLD') advisorAccuracy = 35;
    else if (failure) advisorAccuracy = 55;
    else advisorAccuracy = 50;
    void aligned;
  }

  const summary = [
    `status=${entry.outcome.status}`,
    pnl != null ? `pnl=${pnl.toFixed(2)}U` : null,
    rr != null ? `rr=${rr.toFixed(2)}` : null,
    `execQ=${executionQuality}`,
    `riskQ=${riskQuality}`,
    `discipline=${disciplineScore}`,
    advisorAccuracy != null ? `advisorAcc=${advisorAccuracy}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    success,
    failure,
    pnlUsdt: pnl,
    rr,
    executionQuality,
    riskQuality,
    disciplineScore,
    advisorAccuracy,
    summary,
  };
}
