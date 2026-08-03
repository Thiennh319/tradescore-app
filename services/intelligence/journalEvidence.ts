/**
 * Task 14.1 / 14.1.1 — Evidence items (Rule #59 + #62).
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { parseProjectedTags } from './parseProjectedTags';
import type { JournalEvidenceItem, JournalOutcomeAnalysisResult, JournalRootCauseResult } from './types';

export function buildJournalEvidence(
  entry: AiTradeJournalEntry,
  outcome: JournalOutcomeAnalysisResult,
  rootCause: JournalRootCauseResult,
): JournalEvidenceItem[] {
  const meta = parseProjectedTags(entry);
  const items: JournalEvidenceItem[] = [];

  items.push({
    id: 'ev_status',
    claim: `Outcome status is ${entry.outcome.status}`,
    sourceField: 'outcome.status',
    value: entry.outcome.status,
    relatedTradeIds: [entry.id],
    sectionSource: 'Trade Summary',
  });

  if (outcome.pnlUsdt != null) {
    items.push({
      id: 'ev_pnl',
      claim: `PnL is ${outcome.pnlUsdt.toFixed(2)} USDT`,
      sourceField: 'outcome.pnlUSDT',
      value: String(outcome.pnlUsdt),
      relatedTradeIds: [entry.id],
      sectionSource: 'Trade Summary',
    });
  }

  if (meta.triggerCode) {
    items.push({
      id: 'ev_trigger',
      claim: `Trigger code ${meta.triggerCode}`,
      sourceField: 'tags.triggerCode',
      value: meta.triggerCode,
      relatedTradeIds: [entry.id],
      sectionSource: 'Decision Snapshot',
    });
  }

  items.push({
    id: 'ev_funding',
    claim: `Funding snapshot ${entry.market.fundingRate}`,
    sourceField: 'market.fundingRate',
    value: String(entry.market.fundingRate),
    relatedTradeIds: [entry.id],
    sectionSource: `Market Snapshot`,
  });

  items.push({
    id: 'ev_whale',
    claim: `Whale / topTraderRatio ${entry.market.topTraderRatio}`,
    sourceField: 'market.topTraderRatio',
    value: String(entry.market.topTraderRatio),
    relatedTradeIds: [entry.id],
    sectionSource: 'Market Snapshot',
  });

  items.push({
    id: 'ev_trend',
    claim: `CVD trend ${entry.market.cvdTrend}`,
    sourceField: 'market.cvdTrend',
    value: entry.market.cvdTrend,
    relatedTradeIds: [entry.id],
    sectionSource: 'Market Snapshot',
  });

  if (meta.adviserTimeline.length > 0) {
    const last = meta.adviserTimeline[meta.adviserTimeline.length - 1]!;
    items.push({
      id: 'ev_adviser_last',
      claim: `Last adviser ${last.advisorActionCode}/${last.advisorReasonCode}`,
      sourceField: 'tags.adviser',
      value: `${last.advisorActionCode}:${last.advisorReasonCode}`,
      relatedTradeIds: [entry.id],
      sectionSource: 'Advisor History',
    });
  }

  items.push({
    id: 'ev_root',
    claim: `Root cause [${rootCause.category}] ${rootCause.primary}`,
    sourceField: 'intelligence.rootCause',
    value: rootCause.primary,
    relatedTradeIds: [entry.id],
    sectionSource: 'Outcome · Market Snapshot',
  });

  items.push({
    id: 'ev_rr',
    claim: `Planned RR ${entry.plan.rrProposed}`,
    sourceField: 'plan.rrProposed',
    value: String(entry.plan.rrProposed),
    relatedTradeIds: [entry.id],
    sectionSource: 'Trade Summary',
  });

  return items;
}
