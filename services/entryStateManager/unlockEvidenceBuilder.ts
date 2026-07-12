/**
 * Unlock Evidence builder — passthrough from UnlockSignalSnapshot (Task 02.4.11).
 *
 * **No rule evaluation** — maps non-null hint strings to evidence rows only.
 *
 * @module entryStateManager/unlockEvidenceBuilder
 */

import type { TransitionSourceModule } from './transitionMetadata';
import { UNLOCK_EVIDENCE_KIND_DESCRIPTIONS } from './unlockEvidenceKinds';
import type { UnlockEvidenceKind } from './unlockEvidenceKinds';
import type { UnlockEvidence } from './unlockDetectionTypes';
import type { UnlockSignalSnapshot } from './unlockSignalAdapter';

const SOURCE_ENTRY_STATE_MANAGER: TransitionSourceModule = 'EntryStateManager';

const EVIDENCE_TIMESTAMP_PLACEHOLDER = '1970-01-01T00:00:00.000Z';

/** Hint slot → evidence kind — field map only, no logic. */
const UNLOCK_HINT_SLOT_MAP: readonly {
  kind: UnlockEvidenceKind;
  slot: keyof UnlockSignalSnapshot;
}[] = [
  { kind: 'UNLOCK_LOCK_ZONE_EXITED', slot: 'lockZoneExitedHint' },
  { kind: 'UNLOCK_PRICE_RECOVERED', slot: 'priceRecoveredHint' },
  { kind: 'UNLOCK_CONFIRMATION_RETURNED', slot: 'confirmationReturnedHint' },
  { kind: 'UNLOCK_RISK_NORMALIZED', slot: 'riskNormalizedHint' },
  { kind: 'UNLOCK_SIGNAL_STABLE', slot: 'signalStableHint' },
  { kind: 'UNLOCK_READY_FOR_WATCH', slot: 'readyForWatchHint' },
];

function evidenceRow(
  kind: UnlockEvidenceKind,
  rawValue: string,
  originRuleId: string | null,
  sourceModule: TransitionSourceModule,
  timestamp: string,
): UnlockEvidence {
  const description = UNLOCK_EVIDENCE_KIND_DESCRIPTIONS[kind];
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

function dedupeKey(row: UnlockEvidence): string {
  return `${row.kind}|${row.rawValue}|${row.originRuleId ?? ''}|${row.sourceModule}`;
}

/**
 * Build evidence from unlock signal snapshot — **passthrough only**.
 *
 * Non-null, non-empty hint strings become one evidence row each.
 */
export function buildUnlockEvidenceFromSignalSnapshot(
  snapshot: UnlockSignalSnapshot,
  timestamp?: string,
): UnlockEvidence[] {
  const ts = timestamp?.trim() || EVIDENCE_TIMESTAMP_PLACEHOLDER;
  const rows: UnlockEvidence[] = [];

  for (const { kind, slot } of UNLOCK_HINT_SLOT_MAP) {
    const hint = snapshot[slot];
    if (hint == null) continue;
    const trimmed = hint.trim();
    if (!trimmed) continue;
    rows.push(evidenceRow(kind, trimmed, null, SOURCE_ENTRY_STATE_MANAGER, ts));
  }

  return dedupeUnlockEvidence(rows);
}

/** Remove duplicate evidence rows (same kind + rawValue + originRuleId + sourceModule). */
export function dedupeUnlockEvidence(evidence: readonly UnlockEvidence[]): UnlockEvidence[] {
  const seen = new Set<string>();
  const out: UnlockEvidence[] = [];
  for (const row of evidence) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
