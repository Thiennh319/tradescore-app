/**
 * Noise Evidence builder — passthrough from NoiseSignalSnapshot (Task 02.4.5).
 *
 * **No rule evaluation** — maps non-null hint strings to evidence rows only.
 *
 * @module entryStateManager/noiseEvidenceBuilder
 */

import type { TransitionSourceModule } from './transitionMetadata';
import { NOISE_EVIDENCE_KIND_DESCRIPTIONS } from './noiseEvidenceKinds';
import type { NoiseEvidenceKind } from './noiseEvidenceKinds';
import type { NoiseEvidence } from './noiseDetectionTypes';
import type { NoiseSignalSnapshot } from './noiseSignalAdapter';

const SOURCE_CVD_FILTER: TransitionSourceModule = 'CVDFilter';

const EVIDENCE_TIMESTAMP_PLACEHOLDER = '1970-01-01T00:00:00.000Z';

/** Hint slot → evidence kind — field map only, no logic. */
const NOISE_HINT_SLOT_MAP: readonly {
  kind: NoiseEvidenceKind;
  slot: keyof NoiseSignalSnapshot;
}[] = [
  { kind: 'MACD_NOISE', slot: 'macdNoiseHint' },
  { kind: 'RSI_NOISE', slot: 'rsiNoiseHint' },
  { kind: 'EMA_NOISE', slot: 'emaFlipHint' },
  { kind: 'CVD_NOISE', slot: 'cvdFlipHint' },
  { kind: 'VOLUME_SPIKE', slot: 'volumeSpikeHint' },
  { kind: 'SCORE_FLUCTUATION', slot: 'scoreFluctuationHint' },
  { kind: 'SHORT_TERM_REVERSAL', slot: 'shortTermReversalHint' },
];

function evidenceRow(
  kind: NoiseEvidenceKind,
  rawValue: string,
  originRuleId: string | null,
  sourceModule: TransitionSourceModule,
  timestamp: string,
): NoiseEvidence {
  const description = NOISE_EVIDENCE_KIND_DESCRIPTIONS[kind];
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

function dedupeKey(row: NoiseEvidence): string {
  return `${row.kind}|${row.rawValue}|${row.originRuleId ?? ''}|${row.sourceModule}`;
}

/**
 * Build evidence from noise signal snapshot — **passthrough only**.
 *
 * Non-null, non-empty hint strings become one evidence row each.
 */
export function buildNoiseEvidenceFromSignalSnapshot(
  snapshot: NoiseSignalSnapshot,
  timestamp?: string,
): NoiseEvidence[] {
  const ts = timestamp?.trim() || EVIDENCE_TIMESTAMP_PLACEHOLDER;
  const rows: NoiseEvidence[] = [];

  for (const { kind, slot } of NOISE_HINT_SLOT_MAP) {
    const hint = snapshot[slot];
    if (hint == null) continue;
    const trimmed = hint.trim();
    if (!trimmed) continue;
    rows.push(evidenceRow(kind, trimmed, null, SOURCE_CVD_FILTER, ts));
  }

  return dedupeNoiseEvidence(rows);
}

/** Remove duplicate evidence rows (same kind + rawValue + originRuleId + sourceModule). */
export function dedupeNoiseEvidence(evidence: readonly NoiseEvidence[]): NoiseEvidence[] {
  const seen = new Set<string>();
  const out: NoiseEvidence[] = [];
  for (const row of evidence) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
