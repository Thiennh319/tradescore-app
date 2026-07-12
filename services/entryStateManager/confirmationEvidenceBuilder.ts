/**
 * Confirmation Evidence builder — passthrough from ConfirmationSignalSnapshot (Task 02.4.7).
 *
 * **No rule evaluation** — maps non-null hint strings to evidence rows only.
 *
 * @module entryStateManager/confirmationEvidenceBuilder
 */

import type { TransitionSourceModule } from './transitionMetadata';
import { CONFIRMATION_EVIDENCE_KIND_DESCRIPTIONS } from './confirmationEvidenceKinds';
import type { ConfirmationEvidenceKind } from './confirmationEvidenceKinds';
import type { ConfirmationEvidence } from './confirmationDetectionTypes';
import type { ConfirmationSignalSnapshot } from './confirmationSignalAdapter';

const SOURCE_ENTRY_STATE_MANAGER: TransitionSourceModule = 'EntryStateManager';

const EVIDENCE_TIMESTAMP_PLACEHOLDER = '1970-01-01T00:00:00.000Z';

/** Hint slot → evidence kind — field map only, no logic. */
const CONFIRMATION_HINT_SLOT_MAP: readonly {
  kind: ConfirmationEvidenceKind;
  slot: keyof ConfirmationSignalSnapshot;
}[] = [
  { kind: 'EMA_CONFIRMED', slot: 'emaConfirmedHint' },
  { kind: 'TREND_CONFIRMED', slot: 'trendConfirmedHint' },
  { kind: 'SCORE_CONFIRMED', slot: 'scoreConfirmedHint' },
  { kind: 'TRADEPLAN_CONFIRMED', slot: 'tradePlanConfirmedHint' },
  { kind: 'VOLUME_CONFIRMED', slot: 'volumeConfirmedHint' },
  { kind: 'DIRECTION_CONFIRMED', slot: 'directionConfirmedHint' },
];

function evidenceRow(
  kind: ConfirmationEvidenceKind,
  rawValue: string,
  originRuleId: string | null,
  sourceModule: TransitionSourceModule,
  timestamp: string,
): ConfirmationEvidence {
  const description = CONFIRMATION_EVIDENCE_KIND_DESCRIPTIONS[kind];
  return {
    kind,
    description,
    rawValue,
    reason: rawValue,
    originRuleId,
    sourceModule,
    timestamp,
  };
}

function dedupeKey(row: ConfirmationEvidence): string {
  return `${row.kind}|${row.rawValue}|${row.originRuleId ?? ''}|${row.sourceModule}`;
}

/**
 * Build evidence from confirmation signal snapshot — **passthrough only**.
 *
 * Non-null, non-empty hint strings become one evidence row each.
 */
export function buildConfirmationEvidenceFromSignalSnapshot(
  snapshot: ConfirmationSignalSnapshot,
  timestamp?: string,
): ConfirmationEvidence[] {
  const ts = timestamp?.trim() || EVIDENCE_TIMESTAMP_PLACEHOLDER;
  const rows: ConfirmationEvidence[] = [];

  for (const { kind, slot } of CONFIRMATION_HINT_SLOT_MAP) {
    const hint = snapshot[slot];
    if (hint == null) continue;
    const trimmed = hint.trim();
    if (!trimmed) continue;
    rows.push(evidenceRow(kind, trimmed, null, SOURCE_ENTRY_STATE_MANAGER, ts));
  }

  return dedupeConfirmationEvidence(rows);
}

/** Remove duplicate evidence rows (same kind + rawValue + originRuleId + sourceModule). */
export function dedupeConfirmationEvidence(
  evidence: readonly ConfirmationEvidence[],
): ConfirmationEvidence[] {
  const seen = new Set<string>();
  const out: ConfirmationEvidence[] = [];
  for (const row of evidence) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
