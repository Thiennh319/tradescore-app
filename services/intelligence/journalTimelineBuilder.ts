/**
 * Task 14.1 — Event + Adviser timeline from TI View (sequence order).
 * Rule #58 — Replay đọc timeline này, không Engine.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { isClosedOutcome } from '../journalService';
import { actionCodeToLabel } from './shared/actionLabels';
import { parseProjectedTags } from './parseProjectedTags';
import type { IntelligenceAdviserStep, IntelligenceTimelineEvent } from './types';

export { actionCodeToLabel };

export function buildAdviserTimeline(
  entry: AiTradeJournalEntry,
): IntelligenceAdviserStep[] {
  const meta = parseProjectedTags(entry);
  return meta.adviserTimeline.map((s) => ({
    ...s,
    actionLabel: actionCodeToLabel(s.advisorActionCode),
    atMs: null,
  }));
}

/**
 * Event Timeline — ordered by sequence (không sort timestamp).
 */
export function buildEventTimeline(
  entry: AiTradeJournalEntry,
): IntelligenceTimelineEvent[] {
  const events: IntelligenceTimelineEvent[] = [];
  let seq = 1;

  events.push({
    sequence: seq++,
    kind: 'SIGNAL_CREATED',
    label: 'Signal Created',
    atMs: entry.timestamp,
  });
  events.push({
    sequence: seq++,
    kind: 'DECISION',
    label: `Decision ${entry.scoring.decision}`,
    atMs: entry.timestamp,
  });
  events.push({
    sequence: seq++,
    kind: 'PLANNER',
    label: `Planner SL=${entry.plan.slActual} TP1=${entry.plan.tp1Actual}`,
    atMs: entry.timestamp,
  });

  if (entry.outcome.limitOrderPlacedAt != null) {
    events.push({
      sequence: seq++,
      kind: 'ORDER_CREATED',
      label: 'Order Created',
      atMs: entry.outcome.limitOrderPlacedAt,
    });
    events.push({
      sequence: seq++,
      kind: 'PENDING',
      label: 'Pending Fill',
      atMs: entry.outcome.limitOrderPlacedAt,
    });
  } else {
    events.push({
      sequence: seq++,
      kind: 'ORDER_CREATED',
      label: 'Order Created (market)',
      atMs: entry.timestamp,
    });
  }

  if (entry.outcome.status !== 'PENDING' && entry.outcome.status !== 'CANCELLED') {
    events.push({
      sequence: seq++,
      kind: 'RUNNING',
      label: 'Running',
      atMs: entry.timestamp,
    });
  }

  for (const p of entry.partialCloses ?? []) {
    const level =
      p.partialCloseReason === 'PARTIAL_TP1'
        ? 'TP1'
        : p.partialCloseReason === 'PARTIAL_TP2'
          ? 'TP2'
          : 'SCALE';
    events.push({
      sequence: seq++,
      kind: level,
      label: `${level} partial ${p.partialClosePercent}%`,
      atMs: p.partialCloseTime,
    });
  }

  const reason = entry.outcome.exitReason;
  if (reason === 'TP1_HIT') {
    events.push({ sequence: seq++, kind: 'TP1', label: 'TP1 Hit', atMs: entry.outcome.exitTimestamp ?? null });
  } else if (reason === 'TP2_HIT') {
    events.push({ sequence: seq++, kind: 'TP2', label: 'TP2 Hit', atMs: entry.outcome.exitTimestamp ?? null });
  } else if (reason === 'TP3_HIT') {
    events.push({ sequence: seq++, kind: 'TP3', label: 'TP3 Hit', atMs: entry.outcome.exitTimestamp ?? null });
  } else if (reason === 'SL_HIT') {
    events.push({ sequence: seq++, kind: 'SL', label: 'SL Hit', atMs: entry.outcome.exitTimestamp ?? null });
  }

  for (const step of buildAdviserTimeline(entry)) {
    events.push({
      sequence: seq++,
      kind: 'ADVISER',
      label: `${step.actionLabel} (${step.advisorReasonCode})`,
      atMs: step.atMs,
    });
  }

  if (isClosedOutcome(entry.outcome.status) || entry.outcome.status === 'CANCELLED') {
    events.push({
      sequence: seq++,
      kind: 'CLOSE',
      label: entry.outcome.status === 'CANCELLED' ? 'Cancelled' : 'Close',
      atMs: entry.outcome.exitTimestamp ?? null,
    });
  }

  return events;
}
