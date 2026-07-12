/**
 * HardBlock Evidence builder — passthrough from NormalizedRuleOutput (Task 02.4.3).
 *
 * **No rule evaluation** — only maps existing arrays/flags to evidence rows.
 *
 * @module entryStateManager/hardBlockEvidenceBuilder
 */

import type { TransitionSourceModule } from './transitionMetadata';
import {
  HARDBLOCK_FLAG_ORIGIN_IDS,
  resolveHardBlockOriginRuleId,
} from './hardBlockOriginRuleId';
import type { HardBlockEvidence, HardBlockEvidenceKind } from './hardBlockDetectionTypes';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';

const SOURCE_RULE_ENGINE: TransitionSourceModule = 'RuleEngine';

const EVIDENCE_TIMESTAMP_PLACEHOLDER = '1970-01-01T00:00:00.000Z';

function evidenceRow(
  kind: HardBlockEvidenceKind,
  description: string,
  rawValue: string,
  originRuleId: string | null,
  sourceModule: TransitionSourceModule,
  timestamp: string,
): HardBlockEvidence {
  return { kind, description, rawValue, originRuleId, sourceModule, timestamp };
}

function dedupeKey(row: HardBlockEvidence): string {
  return `${row.kind}|${row.rawValue}|${row.originRuleId ?? ''}|${row.sourceModule}`;
}

/**
 * Build evidence rows from normalized rule output — **passthrough only**.
 */
export function buildHardBlockEvidenceFromRuleOutput(
  output: NormalizedRuleOutput,
  timestamp?: string,
): HardBlockEvidence[] {
  const ts = timestamp?.trim() || EVIDENCE_TIMESTAMP_PLACEHOLDER;
  const rows: HardBlockEvidence[] = [];

  for (const block of output.hardBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    rows.push(
      evidenceRow(
        'RULE_ENGINE_RETURNED_BLOCK',
        'Rule Engine returned hard block',
        trimmed,
        resolveHardBlockOriginRuleId(trimmed),
        SOURCE_RULE_ENGINE,
        ts,
      ),
    );
  }

  for (const group of output.groupBlocks) {
    const trimmed = group.trim();
    if (!trimmed) continue;
    rows.push(
      evidenceRow(
        'GROUP_BLOCK_ACTIVE',
        'Group block active',
        trimmed,
        resolveHardBlockOriginRuleId(trimmed) ?? HARDBLOCK_FLAG_ORIGIN_IDS.groupBlock,
        SOURCE_RULE_ENGINE,
        ts,
      ),
    );
  }

  if (output.adxGateBlocked) {
    rows.push(
      evidenceRow(
        'ADX_BELOW_THRESHOLD',
        'ADX gate blocked — market CHOPPY',
        'adxGateBlocked=true',
        HARDBLOCK_FLAG_ORIGIN_IDS.adxGateBlocked,
        SOURCE_RULE_ENGINE,
        ts,
      ),
    );
  }

  if (!output.tradePlanValid) {
    rows.push(
      evidenceRow(
        'TRADE_PLAN_INVALID',
        'Trade plan invalid',
        'tradePlanValid=false',
        null,
        SOURCE_RULE_ENGINE,
        ts,
      ),
    );
  }

  for (const reason of output.blockReasons) {
    const trimmed = reason.trim();
    if (!trimmed) continue;
    rows.push(
      evidenceRow(
        'BLOCK_REASONS_PRESENT',
        'Block reasons present',
        trimmed,
        resolveHardBlockOriginRuleId(trimmed) ?? HARDBLOCK_FLAG_ORIGIN_IDS.blockReasonL5a,
        SOURCE_RULE_ENGINE,
        ts,
      ),
    );
  }

  return dedupeHardBlockEvidence(rows);
}

/** Remove duplicate evidence rows (same kind + rawValue + originRuleId + sourceModule). */
export function dedupeHardBlockEvidence(
  evidence: readonly HardBlockEvidence[],
): HardBlockEvidence[] {
  const seen = new Set<string>();
  const out: HardBlockEvidence[] = [];
  for (const row of evidence) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
