/**
 * Task 14.1 / 14.1.1 — Journal Intelligence orchestrator.
 * Rules #57–#65 · READ only · TI View = AiTradeJournalEntry.
 * Metadata polish only — no Engine / Replay / AI narrative changes.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { AI_SUMMARY_VERSION, buildJournalAiSummary } from './journalAiSummary';
import { buildJournalEvidence } from './journalEvidence';
import { buildJournalOutcomeAnalysis } from './journalOutcomeAnalysis';
import { buildJournalRootCause } from './journalRootCause';
import { REPLAY_VERSION } from './journalReplayBuilder';
import {
  buildAdviserTimeline,
  buildEventTimeline,
} from './journalTimelineBuilder';
import { parseProjectedTags } from './parseProjectedTags';
import { deriveIntelligenceTradeTags } from './shared/tradeTags';
import { tradeOutcomeFingerprint } from './shared/fingerprint';
import type {
  IntelligenceSectionSource,
  IntelligenceTimelineEvent,
  JournalEntryIntelligence,
  JournalEvidenceItem,
} from './types';

export { deriveIntelligenceTradeTags } from './shared/tradeTags';

type CacheEntry = {
  fingerprint: string;
  intel: JournalEntryIntelligence;
};

/** Rule #65 — per-trade cache; invalidate when outcome fingerprint changes */
const intelligenceCache = new Map<string, CacheEntry>();

function buildChecklist(entry: AiTradeJournalEntry): { label: string; passed: boolean }[] {
  const violations = new Set(entry.scoring.mandatoryViolations ?? []);
  return [
    { label: 'Decision set', passed: Boolean(entry.scoring.decision) },
    { label: 'SL defined', passed: entry.plan.slActual > 0 },
    { label: 'TP1 defined', passed: entry.plan.tp1Actual > 0 },
    { label: 'No mandatory violations', passed: violations.size === 0 },
    { label: 'Safe SL', passed: entry.plan.isSafeSL },
  ];
}

/** Stable display id for Market Snapshot source (no Engine). */
function marketSnapshotSourceId(entryId: string): number {
  let h = 0;
  for (let i = 0; i < entryId.length; i++) {
    h = (h * 31 + entryId.charCodeAt(i)) >>> 0;
  }
  return (h % 9000) + 1;
}

/** Rule #62 — every intelligence section has a TI View source label. */
export function buildIntelligenceSectionSources(
  entry: AiTradeJournalEntry,
  eventTimeline: readonly IntelligenceTimelineEvent[],
  evidence: readonly JournalEvidenceItem[],
): IntelligenceSectionSource[] {
  const decisionEvt = eventTimeline.find((e) => e.kind === 'DECISION');
  const marketId = marketSnapshotSourceId(entry.id);
  const evidenceIds = evidence.map((e) => e.id).join(',') || '—';
  return [
    { section: 'tradeSummary', source: `TI View · ${entry.id}` },
    {
      section: 'decisionSnapshot',
      source: `Decision Event #${decisionEvt?.sequence ?? '?'}`,
    },
    { section: 'marketSnapshot', source: `Market Snapshot #${marketId}` },
    { section: 'advisorTimeline', source: 'Advisor History' },
    { section: 'eventTimeline', source: 'Event Sequence' },
    {
      section: 'replay',
      source: `Event Timeline · replayVersion=${REPLAY_VERSION}`,
    },
    { section: 'outcome', source: 'Trade Summary' },
    { section: 'rootCause', source: 'Outcome · Market Snapshot' },
    { section: 'evidence', source: 'TI View fields' },
    { section: 'aiSummary', source: `Evidence IDs · ${evidenceIds}` },
  ];
}

function buildJournalEntryIntelligenceUncached(
  entry: AiTradeJournalEntry,
): JournalEntryIntelligence {
  const meta = parseProjectedTags(entry);
  const checklist = buildChecklist(entry);
  const eventTimeline = buildEventTimeline(entry);
  const adviserTimeline = buildAdviserTimeline(entry);
  const outcome = buildJournalOutcomeAnalysis(entry);
  const rootCause = buildJournalRootCause(entry);
  const evidence = buildJournalEvidence(entry, outcome, rootCause);
  const tradeTags = deriveIntelligenceTradeTags(entry);
  const aiSummary = buildJournalAiSummary(entry, outcome, rootCause, evidence, tradeTags);
  const sectionSources = buildIntelligenceSectionSources(entry, eventTimeline, evidence);

  return {
    tradeId: entry.id,
    triggerCode: meta.triggerCode,
    decisionCode: meta.decisionCode,
    strategyVersion: meta.strategyVersion,
    confidence: meta.confidence,
    featureSetVersion: meta.featureSetVersion,
    engineVersion: meta.engineVersion,
    projectionVersion: meta.projectionVersion,
    isProjected: meta.isProjected,
    tradeSummary: {
      coin: entry.symbol.replace(/USDT$/i, ''),
      strategy: meta.strategyVersion,
      direction: entry.scoring.direction,
      pnlUsdt: entry.outcome.pnlUSDT ?? null,
      rr: Number.isFinite(entry.plan.rrProposed) ? entry.plan.rrProposed : null,
      holdingTimeMinutes:
        entry.outcome.holdingTimeMinutes ?? entry.outcome.holdDurationMinutes ?? null,
      status: entry.outcome.status,
    },
    decisionSnapshot: {
      decision: entry.scoring.decision,
      confidence: meta.confidence,
      trigger: meta.triggerCode,
      checklist,
      entryReason: entry.plan.openReason ?? null,
    },
    marketSnapshot: {
      trend: entry.market.cvdTrend,
      funding: entry.market.fundingRate,
      whale: entry.market.topTraderRatio,
      btcContext: entry.market.btcChangePct,
      volatility: entry.market.slippage,
      marketStructure: entry.structureSLSnapshot?.slSource ?? 'NONE',
      liquidity: `volRatio=${entry.market.volumeRatio}`,
      session: entry.market.sessionType,
    },
    adviserTimeline,
    eventTimeline,
    confidenceSnapshot: {
      confidence: meta.confidence,
      score: entry.scoring.score ?? null,
    },
    triggerSnapshot: {
      triggerCode: meta.triggerCode,
      openReason: entry.plan.openReason ?? null,
    },
    checklistSnapshot: checklist,
    outcome,
    rootCause,
    evidence,
    aiSummary,
    sectionSources,
    tradeTags,
    outcomeAnalysis: outcome.summary,
    replayReady: eventTimeline.length >= 2,
    replayVersion: REPLAY_VERSION,
    summaryVersion: AI_SUMMARY_VERSION,
  };
}

/**
 * Build full Journal Intelligence for one TI View entry.
 * Rule #65 — reuse cache when outcome fingerprint unchanged.
 */
export function buildJournalEntryIntelligence(
  entry: AiTradeJournalEntry,
): JournalEntryIntelligence {
  const fingerprint = tradeOutcomeFingerprint(entry);
  const hit = intelligenceCache.get(entry.id);
  if (hit && hit.fingerprint === fingerprint) {
    return hit.intel;
  }
  const intel = buildJournalEntryIntelligenceUncached(entry);
  intelligenceCache.set(entry.id, {
    fingerprint,
    intel,
  });
  return intel;
}

/** Rule #65 — clear one trade or entire cache (tests / invalidation). */
export function clearJournalIntelligenceCache(tradeId?: string): void {
  if (tradeId) intelligenceCache.delete(tradeId);
  else intelligenceCache.clear();
}

/** Test/helper: whether trade is currently cached. */
export function isJournalIntelligenceCached(tradeId: string): boolean {
  return intelligenceCache.has(tradeId);
}
