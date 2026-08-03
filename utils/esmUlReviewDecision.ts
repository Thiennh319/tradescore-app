/**
 * UL Review decision object — SSOT for explanation panel (read-only).
 *
 * **Purpose:** Build per-trade decision reasoning from bridge snapshot + scan context.
 * **Must NOT:** Evaluate rules, score, or call pipeline.
 *
 * @module utils/esmUlReviewDecision
 */

import { SCORER_MAX_TOTAL_V2, type TradeDirection } from '../constants/scoring';
import { ACTION_POLICY } from '../services/entryStateManager/actionPolicy';
import { EntryActionType } from '../services/entryStateManager/actionTypes';
import type { ProductionEsmBridgeSnapshot } from '../services/productionEsmBridge/productionEsmBridgeTypes';
import type { ProductionEsmScanContext } from '../services/productionEsmBridge/signalRowScanContext';
import { resolveEsmUlReviewDisplay } from './esmUiDisplay';

const UL_REVIEW_ACTION_LABELS: Record<EntryActionType, string> = {
  [EntryActionType.NO_ACTION]: 'No Action',
  [EntryActionType.PREPARE_ENTRY]: 'Wait Confirmation',
  [EntryActionType.CONFIRM_ENTRY]: 'Wait Confirmation',
  [EntryActionType.OPEN_POSITION]: 'Hold Position',
  [EntryActionType.MONITOR_POSITION]: 'Hold Position',
  [EntryActionType.PREPARE_EXIT]: 'Close Position',
  [EntryActionType.CLOSE_POSITION]: 'Close Position',
  [EntryActionType.RESET_STATE]: 'No Action',
};

const FINAL_ACTION_BY_RECOMMENDATION: Record<string, string> = {
  'Hold Position': 'HOLD',
  'Close Position': 'CLOSE',
  'Wait Confirmation': 'WAIT',
  'Emergency Exit': 'CLOSE',
  'No Action': 'WAIT',
};

const FINAL_ACTION_BY_ENTRY_ACTION: Record<EntryActionType, string> = {
  [EntryActionType.NO_ACTION]: 'WAIT',
  [EntryActionType.PREPARE_ENTRY]: 'WAIT',
  [EntryActionType.CONFIRM_ENTRY]: 'WAIT',
  [EntryActionType.OPEN_POSITION]: 'HOLD',
  [EntryActionType.MONITOR_POSITION]: 'HOLD',
  [EntryActionType.PREPARE_EXIT]: 'CLOSE',
  [EntryActionType.CLOSE_POSITION]: 'CLOSE',
  [EntryActionType.RESET_STATE]: 'WAIT',
};

const GENERIC_POLICY_REASONS = new Set([
  'position opened',
  'exit signal',
  'entry signal confirmed',
  'conditions confirmed',
  'pipeline activated — awaiting setup',
  'cycle complete',
  'hard block cleared',
  'price left lock zone',
  'price entered lock zone',
  'hard block activated',
  'momentum weakened',
]);

const TECHNICAL_LINE_PATTERN =
  /pipeline|harness|rulebook|mapping|state\s*machine|scan\s*id|orchestrator|halted|transition|adapter|aggregator|dispatcher|executor|metadata|scaffold|placeholder/i;

export interface EsmUlReviewRejectedAlternative {
  readonly label: string;
  readonly reason: string;
}

export interface EsmUlReviewDecision {
  readonly recommendation: string;
  readonly finalAction: string;
  readonly confidence: number | null;
  readonly decisionScore: string | null;
  readonly supportingReasons: readonly string[];
  readonly warningFactors: readonly string[];
  readonly rejectedAlternatives: readonly EsmUlReviewRejectedAlternative[];
}

function shortenLine(value: string, maxLen = 88): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function isUserFriendlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (TECHNICAL_LINE_PATTERN.test(trimmed)) return false;
  if (trimmed.length > 120) return false;
  return true;
}

function dedupeLines(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function pushFriendly(target: string[], line: string | null | undefined): void {
  if (!line || !isUserFriendlyLine(line)) return;
  target.push(shortenLine(line));
}

function isGenericPolicyReason(reason: string): boolean {
  const lower = reason.trim().toLowerCase();
  if (!lower) return true;
  if (GENERIC_POLICY_REASONS.has(lower)) return true;
  if (lower.startsWith('action placeholder for')) return true;
  if (lower.startsWith('not triggered:')) return true;
  if (lower.startsWith('transition not selected:')) return true;
  return false;
}

function resolveDirectionalScore(
  scan: ProductionEsmScanContext | undefined,
  direction: TradeDirection | null,
): number | null {
  if (!scan) return null;
  const score =
    direction === 'SHORT'
      ? scan.shortScore
      : direction === 'LONG'
        ? scan.longScore
        : scan.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return score;
}

function resolveDecisionScore(
  scan: ProductionEsmScanContext | undefined,
  direction: TradeDirection | null,
): string | null {
  const score = resolveDirectionalScore(scan, direction);
  if (score == null) return null;
  const rounded = Math.round(score * 10) / 10;
  return `${rounded} / ${SCORER_MAX_TOTAL_V2}`;
}

function resolveConfidence(
  scan: ProductionEsmScanContext | undefined,
  snapshot: ProductionEsmBridgeSnapshot,
): number | null {
  if (scan && typeof scan.regimeConfidence === 'number' && Number.isFinite(scan.regimeConfidence)) {
    const pct =
      scan.regimeConfidence <= 1
        ? Math.round(scan.regimeConfidence * 100)
        : Math.round(scan.regimeConfidence);
    if (pct >= 0 && pct <= 100) return pct;
  }

  const priority =
    snapshot.harnessResult?.pipelineResult.priorityResult.highestPriority;
  if (typeof priority === 'number' && priority > 0 && priority <= 100) {
    return Math.round(priority);
  }

  return null;
}

function collectScanSupportingReasons(scan: ProductionEsmScanContext): string[] {
  const raw: string[] = [];

  pushFriendly(raw, scan.decisionDisplay);

  for (const layer of scan.layers) {
    if (!layer.passed) continue;
    if (layer.reason) {
      pushFriendly(raw, `${layer.name}: ${layer.reason}`);
    } else if (layer.score > 0) {
      pushFriendly(raw, `${layer.name} passed (${layer.score}/${layer.maxScore})`);
    }
  }

  if (scan.winrate) {
    pushFriendly(raw, `Winrate ${scan.winrate}`);
  }

  if (scan.finalEntryStatus) {
    pushFriendly(raw, `Entry status: ${scan.finalEntryStatus}`);
  }

  return dedupeLines(raw);
}

function collectScanWarningFactors(scan: ProductionEsmScanContext): string[] {
  const raw: string[] = [];

  for (const violation of scan.mandatoryViolations) {
    pushFriendly(raw, violation);
  }

  for (const layer of scan.layers) {
    if (layer.isMandatoryViolation) {
      pushFriendly(raw, layer.reason || `${layer.name} mandatory violation`);
    } else if (!layer.passed && layer.reason) {
      pushFriendly(raw, `${layer.name}: ${layer.reason}`);
    }
  }

  for (const block of scan.hardBlocks) pushFriendly(raw, block);
  for (const block of scan.groupBlocks) pushFriendly(raw, block);
  for (const reason of scan.blockReasons) pushFriendly(raw, reason);
  for (const warning of scan.warnings) pushFriendly(raw, warning);
  for (const warning of scan.scoringWarnings) pushFriendly(raw, warning);

  pushFriendly(raw, scan.squeezeWarning);
  pushFriendly(raw, scan.adxBlockReason);
  pushFriendly(raw, scan.ambiguousMessage);

  if (scan.hardBlocked) {
    pushFriendly(raw, 'Hard block active on scan');
  }

  return dedupeLines(raw);
}

function collectHarnessSupportingReasons(snapshot: ProductionEsmBridgeSnapshot): string[] {
  const raw: string[] = [];
  const harness = snapshot.harnessResult;
  if (!harness) return raw;

  const primaryAction = harness.pipelineResult.actionEngineResult.actions[0];
  if (primaryAction?.reason && !isGenericPolicyReason(primaryAction.reason)) {
    pushFriendly(raw, primaryAction.reason);
  }

  const trigger = harness.context.triggerSnapshot;
  for (const ev of trigger.recoveryResult?.evidence ?? []) {
    pushFriendly(raw, ev.description || ev.reason);
  }
  for (const ev of trigger.confirmationResult?.evidence ?? []) {
    pushFriendly(raw, ev.description || ev.reason);
  }

  const sm = harness.pipelineResult.stateMachineResult;
  if (sm.transitionPerformed) {
    const performed = sm.availableTransitions.find(
      (t) => t.toState === sm.nextState,
    );
    if (performed?.reason && !isGenericPolicyReason(performed.reason)) {
      pushFriendly(raw, performed.reason);
    }
  }

  return dedupeLines(raw);
}

function collectHarnessWarningFactors(snapshot: ProductionEsmBridgeSnapshot): string[] {
  const raw: string[] = [];
  const harness = snapshot.harnessResult;
  if (!harness) return raw;

  const trigger = harness.context.triggerSnapshot;
  for (const ev of trigger.noiseResult?.evidence ?? []) {
    pushFriendly(raw, ev.description || ev.reason);
  }

  const ruleOutput = trigger.hardBlockResult?.context.normalizedRuleOutput;
  for (const block of ruleOutput?.groupBlocks ?? []) pushFriendly(raw, block);
  for (const block of ruleOutput?.hardBlocks ?? []) pushFriendly(raw, block);
  for (const reason of ruleOutput?.blockReasons ?? []) pushFriendly(raw, reason);
  if (ruleOutput?.adxGateBlocked) pushFriendly(raw, 'ADX gate not met');
  if (ruleOutput?.tradePlanValid === false) pushFriendly(raw, 'Trade plan not valid');

  for (const conflict of harness.pipelineResult.conflictResult.resolvedConflicts) {
    if (conflict.reason) pushFriendly(raw, conflict.reason);
  }

  if (snapshot.halted && snapshot.message) {
    pushFriendly(raw, snapshot.message);
  }

  return dedupeLines(raw);
}

function buildRejectedReason(
  rejectedFinalAction: string,
  chosenFinalAction: string,
  scan: ProductionEsmScanContext | undefined,
  transitionReason: string | null,
  actionReason: string | null,
  warningFactors: readonly string[],
): string {
  if (actionReason && !isGenericPolicyReason(actionReason)) {
    return shortenLine(actionReason);
  }

  const parts: string[] = [];

  if (rejectedFinalAction === 'CLOSE' && chosenFinalAction === 'HOLD') {
    if (scan) {
      parts.push(`No exit trigger — ${scan.decisionDisplay}`);
      const topLayer = scan.layers.find((layer) => layer.passed && layer.reason);
      if (topLayer) {
        parts.push(`${topLayer.name}: ${topLayer.reason}`);
      } else {
        const score = resolveDirectionalScore(scan, scan.direction);
        if (score != null) {
          parts.push(`Score ${score}/${SCORER_MAX_TOTAL_V2} supports holding`);
        }
      }
    }
  }

  if (rejectedFinalAction === 'HOLD' && chosenFinalAction === 'CLOSE') {
    if (warningFactors.length > 0) {
      parts.push(`Not viable — ${warningFactors[0]}`);
    } else if (scan) {
      parts.push(`Exit preferred over ${scan.decisionDisplay}`);
    }
  }

  if (rejectedFinalAction === 'WAIT' && chosenFinalAction === 'HOLD') {
    if (scan?.canEnter) {
      parts.push('Entry confirmation already satisfied');
    }
    if (scan?.decisionDisplay) {
      parts.push(scan.decisionDisplay);
    }
  }

  if (rejectedFinalAction === 'HOLD' && chosenFinalAction === 'WAIT') {
    if (scan && !scan.canEnter) {
      parts.push('Entry conditions not met on latest scan');
    }
    if (warningFactors.length > 0) {
      parts.push(warningFactors[0]);
    }
  }

  if (parts.length === 0 && transitionReason) {
    if (isGenericPolicyReason(transitionReason) && scan) {
      parts.push(
        `${transitionReason} — scan: ${scan.decisionDisplay}, score ${scan.score}/${SCORER_MAX_TOTAL_V2}`,
      );
    } else {
      parts.push(transitionReason);
    }
  }

  if (parts.length === 0) {
    return 'Not selected for current scan context';
  }

  return shortenLine(parts.join(' — '));
}

function collectRejectedAlternatives(
  snapshot: ProductionEsmBridgeSnapshot,
  recommendation: string,
  chosenFinalAction: string,
  scan: ProductionEsmScanContext | undefined,
  warningFactors: readonly string[],
): EsmUlReviewRejectedAlternative[] {
  const rejected: EsmUlReviewRejectedAlternative[] = [];
  const seen = new Set<string>();

  const pushRejected = (
    label: string,
    rejectedFinalAction: string,
    transitionReason: string | null,
    actionReason: string | null,
  ) => {
    if (!label || label === recommendation || label === 'No Action') return;
    const reason = buildRejectedReason(
      rejectedFinalAction,
      chosenFinalAction,
      scan,
      transitionReason,
      actionReason,
      warningFactors,
    );
    const key = `${label}|${reason}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rejected.push({ label, reason });
  };

  const harness = snapshot.harnessResult;
  if (!harness) return rejected;

  for (const conflict of harness.pipelineResult.conflictResult.resolvedConflicts) {
    for (const suppressed of conflict.suppressedTriggers) {
      const label = `${suppressed.triggerKind} (${suppressed.triggerId})`;
      pushRejected(label, 'WAIT', conflict.reason, null);
    }
  }

  const sm = harness.pipelineResult.stateMachineResult;
  const performedTo = sm.transitionPerformed ? sm.nextState : null;

  for (const transition of sm.availableTransitions) {
    if (transition.toState === performedTo) continue;
    const metadata = ACTION_POLICY.getActionMetadata(
      transition.fromState,
      transition.toState,
    );
    if (!metadata) continue;
    const label = UL_REVIEW_ACTION_LABELS[metadata.actionType];
    const rejectedFinalAction = FINAL_ACTION_BY_ENTRY_ACTION[metadata.actionType];
    pushRejected(label, rejectedFinalAction, transition.reason, null);
  }

  const actions = harness.pipelineResult.actionEngineResult.actions;
  const primaryId = actions[0]?.actionId;
  for (const action of actions) {
    if (action.actionId === primaryId) continue;
    const label = UL_REVIEW_ACTION_LABELS[action.actionType];
    const rejectedFinalAction = FINAL_ACTION_BY_ENTRY_ACTION[action.actionType];
    pushRejected(label, rejectedFinalAction, null, action.reason);
  }

  return rejected.slice(0, 5);
}

/**
 * Build UL Review decision object from bridge snapshot — read-only, per-trade.
 */
export function resolveEsmUlReviewDecision(
  snapshot: ProductionEsmBridgeSnapshot | null | undefined,
  symbol: string,
  tradeDirection?: TradeDirection,
): EsmUlReviewDecision | null {
  if (!snapshot || snapshot.symbol !== symbol) return null;
  if (!snapshot.entryStateManagerEnabled || !snapshot.harnessResult) return null;

  const review = resolveEsmUlReviewDisplay(snapshot, symbol);
  if (review.label === '—') return null;

  const scan = snapshot.scanContext;
  const direction = tradeDirection ?? scan?.direction ?? null;

  const scanSupporting = scan ? collectScanSupportingReasons(scan) : [];
  const harnessSupporting = collectHarnessSupportingReasons(snapshot);
  const supportingReasons = dedupeLines([...scanSupporting, ...harnessSupporting]).slice(0, 8);

  const scanWarnings = scan ? collectScanWarningFactors(scan) : [];
  const harnessWarnings = collectHarnessWarningFactors(snapshot);
  const warningFactors = dedupeLines([...scanWarnings, ...harnessWarnings]).slice(0, 6);

  const finalAction =
    FINAL_ACTION_BY_RECOMMENDATION[review.label] ?? review.label.toUpperCase();

  return {
    recommendation: review.label,
    finalAction,
    confidence: resolveConfidence(scan, snapshot),
    decisionScore: resolveDecisionScore(scan, direction),
    supportingReasons,
    warningFactors,
    rejectedAlternatives: collectRejectedAlternatives(
      snapshot,
      review.label,
      finalAction,
      scan,
      warningFactors,
    ),
  };
}
