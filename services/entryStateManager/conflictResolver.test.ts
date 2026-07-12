/**
 * Conflict Resolver — detection + resolution tests (Task 02.5.3 / 02.5.4).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectConfirmation } from './confirmationDetectionEngine';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { detectNoise } from './noiseDetectionEngine';
import { detectRecovery } from './recoveryDetectionEngine';
import { detectUnlock } from './unlockDetectionEngine';
import { CONFLICT_RESOLUTION_POLICY } from './conflictResolutionPolicy';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import {
  ConflictResolver,
  detectPotentialConflicts,
  resolveConflictGroup,
  resolveConflicts,
  validateConflictResolverContext,
} from './conflictResolver';
import { ConflictResolutionMethod, ConflictResolutionStatus } from './conflictResolverTypes';
import type { ConflictGroupMemberPlaceholder, ConflictResolverContext } from './conflictResolverTypes';
import { aggregateTriggers } from './triggerAggregator';
import { resolvePriority } from './priorityResolver';
import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import { EntryTriggerKind } from './evaluationTypes';

const clearOutput = () => ({
  hardBlocks: [] as string[],
  groupBlocks: [] as string[],
  blockReasons: [] as string[],
  adxGateBlocked: false,
  tradePlanValid: true,
  decision: 'VAO_TU_TIN',
});

const baseSignalSnapshot = {
  direction: EsmDirection.LONG,
  canEnter: true,
  decision: 'VAO_TU_TIN',
  hardBlocks: [] as string[],
  tradePlanValid: true,
  entryScore: 9.0,
};

const baseMarketSnapshot = {
  symbol: 'BTCUSDT',
  markPrice: 100000,
  timestamp: '2026-07-11T00:00:00Z',
};

const hardBlockDetect = () =>
  detectHardBlock({
    normalizedRuleOutput: normalizeRuleOutput({
      ...clearOutput(),
      hardBlocks: ['L3 MACD vi phạm — score < 1'],
    }),
    currentEntryState: EntryState.BLOCKED,
    candidateTransitions: [],
    signalSnapshot: baseSignalSnapshot,
    marketSnapshot: baseMarketSnapshot,
  });

const confirmationDetect = () =>
  detectConfirmation({
    normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
    currentEntryState: EntryState.WATCH,
    candidateTransitions: [],
    signalSnapshot: baseSignalSnapshot,
    marketSnapshot: baseMarketSnapshot,
    confirmationSignalSnapshot: {
      emaConfirmedHint: 'EMA aligned',
      trendConfirmedHint: null,
      scoreConfirmedHint: null,
      tradePlanConfirmedHint: null,
      volumeConfirmedHint: null,
      directionConfirmedHint: null,
    },
  });

const noiseDetect = () =>
  detectNoise({
    normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
    currentEntryState: EntryState.READY,
    candidateTransitions: [],
    signalSnapshot: { ...baseSignalSnapshot, canEnter: false },
    marketSnapshot: baseMarketSnapshot,
    noiseSignalSnapshot: {
      macdNoiseHint: 'MACD flip',
      rsiNoiseHint: null,
      emaFlipHint: null,
      cvdFlipHint: null,
      volumeSpikeHint: null,
      scoreFluctuationHint: null,
      shortTermReversalHint: null,
    },
  });

const buildPriorityResult = (slots: Parameters<typeof aggregateTriggers>[0] = {}) => {
  const aggregateResult = aggregateTriggers(slots);
  return resolvePriority({ aggregateResult, scanId: slots.scanId });
};

const member = (
  kind: EntryTriggerKind,
  slotKey: ConflictGroupMemberPlaceholder['slotKey'],
): ConflictGroupMemberPlaceholder => ({
  slotKey,
  triggerId: TRIGGER_TYPE_CATALOG[kind].triggerId,
  triggerKind: kind,
  catalogPriority: TRIGGER_TYPE_CATALOG[kind].priority,
});

describe('ConflictResolver — detection (02.5.3)', () => {
  it('valid context passes validation', () => {
    const priorityResult = buildPriorityResult({
      hardBlockResult: hardBlockDetect(),
      confirmationResult: confirmationDetect(),
    });
    const context: ConflictResolverContext = {
      priorityResult,
      scanId: 'scan-conflict-001',
    };
    expect(validateConflictResolverContext(context).valid).toBe(true);
    const result = resolveConflicts(context);
    expect(result.halted).toBe(false);
    expect(result.conflictCount).toBeGreaterThan(0);
    expect(result.context.scanId).toBe('scan-conflict-001');
  });

  it('invalid context — missing priorityResult', () => {
    const context = {} as ConflictResolverContext;
    expect(validateConflictResolverContext(context).valid).toBe(false);
    const result = resolveConflicts(context);
    expect(result.halted).toBe(true);
    expect(result.conflictCount).toBe(0);
    expect(result.resolvedConflicts).toHaveLength(0);
  });

  it('empty priorityResult — no conflict groups', () => {
    const priorityResult = buildPriorityResult({});
    const result = resolveConflicts({ priorityResult });
    expect(result.conflictCount).toBe(0);
    expect(result.resolvedCount).toBe(0);
    expect(result.unresolvedCount).toBe(0);
    expect(result.message).toContain('nothing to resolve');
  });

  it('conflictGroups structure — groupId, members, reason', () => {
    const priorityResult = buildPriorityResult({
      recoveryResult: detectRecovery({
        normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
        currentEntryState: EntryState.BLOCKED,
        candidateTransitions: [],
        signalSnapshot: baseSignalSnapshot,
        marketSnapshot: baseMarketSnapshot,
        recoverySignalSnapshot: {
          blockClearedHint: 'blocks cleared',
          rulesNormalizedHint: null,
          tradePlanRecoveredHint: null,
          marketStableHint: null,
          signalReturnedHint: null,
          readyForWatchHint: null,
        },
      }),
      unlockResult: detectUnlock({
        normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
        currentEntryState: EntryState.LOCKED,
        candidateTransitions: [],
        signalSnapshot: baseSignalSnapshot,
        marketSnapshot: baseMarketSnapshot,
        unlockSignalSnapshot: {
          lockZoneExitedHint: 'exited lock zone',
          priceRecoveredHint: null,
          confirmationReturnedHint: null,
          riskNormalizedHint: null,
          signalStableHint: null,
          readyForWatchHint: null,
        },
      }),
    });
    const groups = detectPotentialConflicts(priorityResult);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0].reason).toContain('Potential conflict');
  });

  it('halted when priorityResult.halted=true', () => {
    const priorityResult = { ...buildPriorityResult({}), halted: true, message: 'forced halt' };
    expect(validateConflictResolverContext({ priorityResult }).valid).toBe(false);
    const result = resolveConflicts({ priorityResult });
    expect(result.halted).toBe(true);
    expect(result.resolvedConflicts).toHaveLength(0);
  });

  it('halted on wrong highestPriority metadata', () => {
    const priorityResult = {
      ...buildPriorityResult({ noiseResult: noiseDetect() }),
      highestPriority: 999,
    };
    expect(validateConflictResolverContext({ priorityResult }).valid).toBe(false);
  });

  it('passthrough priorityResult unchanged', () => {
    const priorityResult = buildPriorityResult({});
    const result = resolveConflicts({ priorityResult });
    expect(result.priorityResult).toBe(priorityResult);
  });
});

describe('ConflictResolver — resolution runtime (02.5.4)', () => {
  it('HardBlock wins Confirmation — CONFLICT-EDGE-001', () => {
    const result = resolveConflicts({
      priorityResult: buildPriorityResult({
        hardBlockResult: hardBlockDetect(),
        confirmationResult: confirmationDetect(),
      }),
    });
    const resolved = result.resolvedConflicts.find((r) => r.groupId === 'CONFLICT-EDGE-001');
    expect(resolved?.status).toBe(ConflictResolutionStatus.RESOLVED);
    expect(resolved?.winningTrigger?.triggerKind).toBe(EntryTriggerKind.HardBlock);
    expect(resolved?.suppressedTriggers).toHaveLength(1);
    expect(resolved?.suppressedTriggers[0].triggerKind).toBe(EntryTriggerKind.Confirmation);
    expect(resolved?.resolvedBy).toBe(ConflictResolutionMethod.CATALOG_PRIORITY);
  });

  it('HardBlock wins Noise — catalog priority', () => {
    const resolved = resolveConflictGroup({
      groupId: 'CONFLICT-TEST-HB-NOISE',
      members: [member(EntryTriggerKind.HardBlock, 'hardBlockResult'), member(EntryTriggerKind.Noise, 'noiseResult')],
      reason: 'Potential conflict only.',
    });
    expect(resolved.status).toBe(ConflictResolutionStatus.RESOLVED);
    expect(resolved.winningTrigger?.triggerKind).toBe(EntryTriggerKind.HardBlock);
    expect(resolved.suppressedTriggers[0].triggerKind).toBe(EntryTriggerKind.Noise);
  });

  it('Confirmation wins Noise — catalog priority', () => {
    const resolved = resolveConflictGroup({
      groupId: 'CONFLICT-TEST-CF-NOISE',
      members: [
        member(EntryTriggerKind.Confirmation, 'confirmationResult'),
        member(EntryTriggerKind.Noise, 'noiseResult'),
      ],
      reason: 'Potential conflict only.',
    });
    expect(resolved.status).toBe(ConflictResolutionStatus.RESOLVED);
    expect(resolved.winningTrigger?.triggerKind).toBe(EntryTriggerKind.Confirmation);
  });

  it('Recovery vs Unlock = UNRESOLVED — same catalog priority', () => {
    const result = resolveConflicts({
      priorityResult: buildPriorityResult({
        recoveryResult: detectRecovery({
          normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
          currentEntryState: EntryState.BLOCKED,
          candidateTransitions: [],
          signalSnapshot: baseSignalSnapshot,
          marketSnapshot: baseMarketSnapshot,
          recoverySignalSnapshot: {
            blockClearedHint: 'blocks cleared',
            rulesNormalizedHint: null,
            tradePlanRecoveredHint: null,
            marketStableHint: null,
            signalReturnedHint: null,
            readyForWatchHint: null,
          },
        }),
        unlockResult: detectUnlock({
          normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
          currentEntryState: EntryState.LOCKED,
          candidateTransitions: [],
          signalSnapshot: baseSignalSnapshot,
          marketSnapshot: baseMarketSnapshot,
          unlockSignalSnapshot: {
            lockZoneExitedHint: 'exited',
            priceRecoveredHint: null,
            confirmationReturnedHint: null,
            riskNormalizedHint: null,
            signalStableHint: null,
            readyForWatchHint: null,
          },
        }),
      }),
    });
    const samePriority = result.resolvedConflicts.find(
      (r) => r.groupId === 'CONFLICT-SAME-PRIORITY-70',
    );
    expect(samePriority?.status).toBe(ConflictResolutionStatus.UNRESOLVED);
    expect(samePriority?.winningTrigger).toBeNull();
    expect(samePriority?.suppressedTriggers).toHaveLength(0);
    expect(samePriority?.resolvedBy).toBe(ConflictResolutionMethod.SAME_PRIORITY);
    expect(result.unresolvedCount).toBeGreaterThanOrEqual(1);
  });

  it('Unlock wins Noise — CONFLICT-EDGE-002', () => {
    const result = resolveConflicts({
      priorityResult: buildPriorityResult({
        unlockResult: detectUnlock({
          normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
          currentEntryState: EntryState.LOCKED,
          candidateTransitions: [],
          signalSnapshot: baseSignalSnapshot,
          marketSnapshot: baseMarketSnapshot,
          unlockSignalSnapshot: {
            lockZoneExitedHint: 'exited',
            priceRecoveredHint: null,
            confirmationReturnedHint: null,
            riskNormalizedHint: null,
            signalStableHint: null,
            readyForWatchHint: null,
          },
        }),
        noiseResult: noiseDetect(),
      }),
    });
    const edge = result.resolvedConflicts.find((r) => r.groupId === 'CONFLICT-EDGE-002');
    expect(edge?.status).toBe(ConflictResolutionStatus.RESOLVED);
    expect(edge?.winningTrigger?.triggerKind).toBe(EntryTriggerKind.Unlock);
  });

  it('resolvedCount and unresolvedCount match resolvedConflicts', () => {
    const result = resolveConflicts({
      priorityResult: buildPriorityResult({
        hardBlockResult: hardBlockDetect(),
        confirmationResult: confirmationDetect(),
        recoveryResult: detectRecovery({
          normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
          currentEntryState: EntryState.BLOCKED,
          candidateTransitions: [],
          signalSnapshot: baseSignalSnapshot,
          marketSnapshot: baseMarketSnapshot,
          recoverySignalSnapshot: {
            blockClearedHint: 'blocks cleared',
            rulesNormalizedHint: null,
            tradePlanRecoveredHint: null,
            marketStableHint: null,
            signalReturnedHint: null,
            readyForWatchHint: null,
          },
        }),
        unlockResult: detectUnlock({
          normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
          currentEntryState: EntryState.LOCKED,
          candidateTransitions: [],
          signalSnapshot: baseSignalSnapshot,
          marketSnapshot: baseMarketSnapshot,
          unlockSignalSnapshot: {
            lockZoneExitedHint: 'exited',
            priceRecoveredHint: null,
            confirmationReturnedHint: null,
            riskNormalizedHint: null,
            signalStableHint: null,
            readyForWatchHint: null,
          },
        }),
      }),
    });
    expect(result.resolvedCount).toBe(
      result.resolvedConflicts.filter((r) => r.status === ConflictResolutionStatus.RESOLVED).length,
    );
    expect(result.unresolvedCount).toBe(
      result.resolvedConflicts.filter((r) => r.status === ConflictResolutionStatus.UNRESOLVED).length,
    );
    expect(result.resolvedCount + result.unresolvedCount).toBe(result.conflictCount);
  });

  it('CONFLICT_RESOLUTION_POLICY reads TRIGGER_TYPE_CATALOG — no hardcode', () => {
    expect(CONFLICT_RESOLUTION_POLICY.getPriorityForKind(EntryTriggerKind.HardBlock)).toBe(
      TRIGGER_TYPE_CATALOG[EntryTriggerKind.HardBlock].priority,
    );
    expect(CONFLICT_RESOLUTION_POLICY.getPriorityForKind(EntryTriggerKind.Noise)).toBe(
      TRIGGER_TYPE_CATALOG[EntryTriggerKind.Noise].priority,
    );
    expect(CONFLICT_RESOLUTION_POLICY.catalogSource).toBe('TRIGGER_TYPE_CATALOG');
  });

  it('deterministic output — identical input produces identical resolution', () => {
    const priorityResult = buildPriorityResult({
      hardBlockResult: hardBlockDetect(),
      noiseResult: noiseDetect(),
    });
    const a = resolveConflicts({ priorityResult });
    const b = resolveConflicts({ priorityResult });
    expect(a.resolvedConflicts).toEqual(b.resolvedConflicts);
    expect(a.resolvedCount).toBe(b.resolvedCount);
    expect(a.unresolvedCount).toBe(b.unresolvedCount);
  });

  it('ConflictResolver namespace exposes detect, resolveConflictGroup, resolve, validate', () => {
    expect(ConflictResolver.detectPotentialConflicts).toBe(detectPotentialConflicts);
    expect(ConflictResolver.resolveConflictGroup).toBe(resolveConflictGroup);
    expect(ConflictResolver.resolveConflicts).toBe(resolveConflicts);
    expect(ConflictResolver.validateConflictResolverContext).toBe(validateConflictResolverContext);
  });

  it('resolvedBy = CATALOG_PRIORITY when catalog priority picks a unique winner', () => {
    const members = [
      member(EntryTriggerKind.HardBlock, 'hardBlockResult'),
      member(EntryTriggerKind.Noise, 'noiseResult'),
    ];
    const policyOutcome = CONFLICT_RESOLUTION_POLICY.resolveByCatalogPriority(members);
    const resolved = resolveConflictGroup({
      groupId: 'CONFLICT-TEST-RESOLVED-BY',
      members,
      reason: 'Potential conflict only.',
    });
    expect(policyOutcome.resolvedBy).toBe(ConflictResolutionMethod.CATALOG_PRIORITY);
    expect(resolved.resolvedBy).toBe(ConflictResolutionMethod.CATALOG_PRIORITY);
    expect(resolved.winningTrigger).toEqual(policyOutcome.winningTrigger);
    expect(CONFLICT_RESOLUTION_POLICY.getWinningTrigger(members)?.triggerKind).toBe(
      EntryTriggerKind.HardBlock,
    );
  });

  it('resolvedBy = SAME_PRIORITY when catalog priority ties', () => {
    const members = [
      member(EntryTriggerKind.Recovery, 'recoveryResult'),
      member(EntryTriggerKind.Unlock, 'unlockResult'),
    ];
    const policyOutcome = CONFLICT_RESOLUTION_POLICY.resolveByCatalogPriority(members);
    const resolved = resolveConflictGroup({
      groupId: 'CONFLICT-SAME-PRIORITY-70',
      members,
      reason: 'Potential conflict only.',
    });
    expect(policyOutcome.resolvedBy).toBe(ConflictResolutionMethod.SAME_PRIORITY);
    expect(resolved.resolvedBy).toBe(ConflictResolutionMethod.SAME_PRIORITY);
    expect(resolved.status).toBe(ConflictResolutionStatus.UNRESOLVED);
    expect(CONFLICT_RESOLUTION_POLICY.getWinningTrigger(members)).toBeNull();
  });

  it('winner always matches CONFLICT_RESOLUTION_POLICY.getWinningTrigger', () => {
    const priorityResult = buildPriorityResult({
      hardBlockResult: hardBlockDetect(),
      confirmationResult: confirmationDetect(),
      unlockResult: detectUnlock({
        normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
        currentEntryState: EntryState.LOCKED,
        candidateTransitions: [],
        signalSnapshot: baseSignalSnapshot,
        marketSnapshot: baseMarketSnapshot,
        unlockSignalSnapshot: {
          lockZoneExitedHint: 'exited',
          priceRecoveredHint: null,
          confirmationReturnedHint: null,
          riskNormalizedHint: null,
          signalStableHint: null,
          readyForWatchHint: null,
        },
      }),
      noiseResult: noiseDetect(),
    });
    const result = resolveConflicts({ priorityResult });
    for (const group of result.conflictGroups) {
      const resolved = result.resolvedConflicts.find((row) => row.groupId === group.groupId);
      expect(resolved?.winningTrigger).toEqual(
        CONFLICT_RESOLUTION_POLICY.getWinningTrigger(group.members),
      );
    }
  });
});
