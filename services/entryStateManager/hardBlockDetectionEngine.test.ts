/**
 * HardBlock Detection Engine — runtime passthrough tests (Task 02.4.3).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { TransitionAuditLabel } from './transitionMetadata';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { buildHardBlockEvidenceFromRuleOutput, dedupeHardBlockEvidence } from './hardBlockEvidenceBuilder';
import {
  HardBlockDetectionEngine,
  detectHardBlock,
  validateHardBlockDetectionContext,
  validateHardBlockDetectionResult,
} from './hardBlockDetectionEngine';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type { HardBlockDetectionContext } from './hardBlockDetectionTypes';

const clearOutput = (): NormalizedRuleOutput => ({
  hardBlocks: [],
  groupBlocks: [],
  blockReasons: [],
  adxGateBlocked: false,
  tradePlanValid: true,
  decision: 'VAO_TU_TIN',
});

const buildContext = (output: NormalizedRuleOutput): HardBlockDetectionContext => ({
  normalizedRuleOutput: output,
  currentEntryState: EntryState.READY,
  candidateTransitions: [],
  signalSnapshot: {
    direction: EsmDirection.LONG,
    canEnter: true,
    decision: output.decision,
    hardBlocks: [...output.hardBlocks],
    tradePlanValid: output.tradePlanValid,
    entryScore: 9.2,
  },
  marketSnapshot: {
    symbol: 'BTCUSDT',
    markPrice: 100000,
    timestamp: '2026-07-11T00:00:00Z',
  },
});

describe('HardBlockDetectionEngine — runtime passthrough', () => {
  it('hardBlocks[] → detected=true with RULE_ENGINE evidence', () => {
    const output = normalizeRuleOutput({
      ...clearOutput(),
      hardBlocks: ['L3 MACD vi phạm — score < 1'],
    });
    const result = detectHardBlock(buildContext(output));
    expect(result.detected).toBe(true);
    expect(result.evidenceCount).toBe(1);
    expect(result.evidence[0].kind).toBe('RULE_ENGINE_RETURNED_BLOCK');
    expect(result.evidence[0].originRuleId).toBe('HB-HIGH-05');
    expect(validateHardBlockDetectionResult(result).valid).toBe(true);
  });

  it('groupBlocks[] → detected=true with GROUP_BLOCK evidence', () => {
    const output = normalizeRuleOutput({
      ...clearOutput(),
      groupBlocks: ['Nhóm A (Xu hướng) 1.0/5đ < 2.5đ'],
    });
    const result = detectHardBlock(buildContext(output));
    expect(result.detected).toBe(true);
    expect(result.evidence.some((e) => e.kind === 'GROUP_BLOCK_ACTIVE')).toBe(true);
    expect(result.evidence[0].originRuleId).toBe('HB-MED-01');
  });

  it('adxGateBlocked=true → ADX evidence', () => {
    const output = normalizeRuleOutput({ ...clearOutput(), adxGateBlocked: true });
    const result = detectHardBlock(buildContext(output));
    expect(result.detected).toBe(true);
    expect(result.evidence[0].kind).toBe('ADX_BELOW_THRESHOLD');
    expect(result.evidence[0].originRuleId).toBe('HB-CRIT-01');
  });

  it('tradePlanValid=false → TRADE_PLAN evidence with null originRuleId', () => {
    const output = normalizeRuleOutput({ ...clearOutput(), tradePlanValid: false });
    const result = detectHardBlock(buildContext(output));
    expect(result.detected).toBe(true);
    expect(result.evidence[0].kind).toBe('TRADE_PLAN_INVALID');
    expect(result.evidence[0].originRuleId).toBeNull();
  });

  it('blockReasons[] → BLOCK_REASONS evidence', () => {
    const output = normalizeRuleOutput({
      ...clearOutput(),
      blockReasons: ['L5a CVD chưa đủ 1đ — momentum yếu'],
    });
    const result = detectHardBlock(buildContext(output));
    expect(result.detected).toBe(true);
    expect(result.evidence[0].kind).toBe('BLOCK_REASONS_PRESENT');
    expect(result.evidence[0].originRuleId).toBe('HB-LOW-01');
  });

  it('multiple evidence sources at once', () => {
    const output = normalizeRuleOutput({
      ...clearOutput(),
      hardBlocks: ['L3 MACD vi phạm — x'],
      groupBlocks: ['Nhóm B (Dòng tiền) 1.0/5đ < 2.0đ'],
      adxGateBlocked: true,
      tradePlanValid: false,
      blockReasons: ['L5a CVD chưa đủ 1đ — y'],
    });
    const result = detectHardBlock(buildContext(output));
    expect(result.detected).toBe(true);
    expect(result.evidenceCount).toBe(5);
    expect(result.priority).toBe(100);
    expect(result.auditLabel).toBe(TransitionAuditLabel.ENTRY_BLOCK);
    expect(result.triggerId).toBe('ESM-TRIG-HardBlock');
    expect(result.sourceModule).toBe('RuleEngine');
    expect(validateHardBlockDetectionResult(result).valid).toBe(true);
  });

  it('no evidence → detected=false', () => {
    const result = detectHardBlock(buildContext(clearOutput()));
    expect(result.detected).toBe(false);
    expect(result.evidenceCount).toBe(0);
    expect(result.evidence).toHaveLength(0);
    expect(validateHardBlockDetectionResult(result).valid).toBe(true);
  });

  it('dedupe removes duplicate evidence rows', () => {
    const duplicate = evidenceRow('RULE_ENGINE_RETURNED_BLOCK', 'dup', 'HB-HIGH-05');
    const deduped = dedupeHardBlockEvidence([duplicate, duplicate]);
    expect(deduped).toHaveLength(1);

    const built = buildHardBlockEvidenceFromRuleOutput(
      normalizeRuleOutput({
        ...clearOutput(),
        hardBlocks: ['L3 MACD vi phạm — a', 'L3 MACD vi phạm — a'],
      }),
    );
    expect(built).toHaveLength(1);
  });

  it('halts when normalized rule output missing', () => {
    const ctx = { ...buildContext(clearOutput()), normalizedRuleOutput: undefined as never };
    const result = detectHardBlock(ctx);
    expect(result.halted).toBe(true);
    expect(result.detected).toBe(false);
  });

  it('validates context structure', () => {
    const v = validateHardBlockDetectionContext(buildContext(clearOutput()));
    expect(v.valid).toBe(true);
  });
});

function evidenceRow(
  kind: 'RULE_ENGINE_RETURNED_BLOCK',
  rawValue: string,
  originRuleId: string,
) {
  return {
    kind,
    description: 'test',
    rawValue,
    originRuleId,
    sourceModule: 'RuleEngine' as const,
    timestamp: '2026-07-11T00:00:00Z',
  };
}
