/**
 * Recovery Evidence builder — passthrough from RecoverySignalSnapshot (Task 02.4.9).
 *
 * **No rule evaluation** — maps non-null hint strings to evidence rows only.
 *
 * @module entryStateManager/recoveryEvidenceBuilder
 */

import type { TransitionSourceModule } from './transitionMetadata';
import { RECOVERY_EVIDENCE_KIND_DESCRIPTIONS } from './recoveryEvidenceKinds';
import type { RecoveryEvidenceKind } from './recoveryEvidenceKinds';
import type { RecoveryEvidence } from './recoveryDetectionTypes';
import type { RecoverySignalSnapshot } from './recoverySignalAdapter';

const SOURCE_RULE_ENGINE: TransitionSourceModule = 'RuleEngine';

const EVIDENCE_TIMESTAMP_PLACEHOLDER = '1970-01-01T00:00:00.000Z';

/** Hint slot → evidence kind — field map only, no logic. */
const RECOVERY_HINT_SLOT_MAP: readonly {
  kind: RecoveryEvidenceKind;
  slot: keyof RecoverySignalSnapshot;
}[] = [
  { kind: 'RECOVERY_BLOCK_CLEARED', slot: 'blockClearedHint' },
  { kind: 'RECOVERY_RULES_NORMALIZED', slot: 'rulesNormalizedHint' },
  { kind: 'RECOVERY_TRADEPLAN_VALID', slot: 'tradePlanRecoveredHint' },
  { kind: 'RECOVERY_MARKET_STABLE', slot: 'marketStableHint' },
  { kind: 'RECOVERY_SIGNAL_RETURNED', slot: 'signalReturnedHint' },
  { kind: 'RECOVERY_READY_FOR_WATCH', slot: 'readyForWatchHint' },
];

function evidenceRow(
  kind: RecoveryEvidenceKind,
  rawValue: string,
  originRuleId: string | null,
  sourceModule: TransitionSourceModule,
  timestamp: string,
): RecoveryEvidence {
  const description = RECOVERY_EVIDENCE_KIND_DESCRIPTIONS[kind];
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

function dedupeKey(row: RecoveryEvidence): string {
  return `${row.kind}|${row.rawValue}|${row.originRuleId ?? ''}|${row.sourceModule}`;
}

/**
 * Build evidence from recovery signal snapshot — **passthrough only**.
 *
 * Non-null, non-empty hint strings become one evidence row each.
 */
export function buildRecoveryEvidenceFromSignalSnapshot(
  snapshot: RecoverySignalSnapshot,
  timestamp?: string,
): RecoveryEvidence[] {
  const ts = timestamp?.trim() || EVIDENCE_TIMESTAMP_PLACEHOLDER;
  const rows: RecoveryEvidence[] = [];

  for (const { kind, slot } of RECOVERY_HINT_SLOT_MAP) {
    const hint = snapshot[slot];
    if (hint == null) continue;
    const trimmed = hint.trim();
    if (!trimmed) continue;
    rows.push(evidenceRow(kind, trimmed, null, SOURCE_RULE_ENGINE, ts));
  }

  return dedupeRecoveryEvidence(rows);
}

/** Remove duplicate evidence rows (same kind + rawValue + originRuleId + sourceModule). */
export function dedupeRecoveryEvidence(evidence: readonly RecoveryEvidence[]): RecoveryEvidence[] {
  const seen = new Set<string>();
  const out: RecoveryEvidence[] = [];
  for (const row of evidence) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
