/**
 * ESM UI display helpers — read-only hint + UL Review rendering (UL-03 / Journal).
 *
 * **Purpose:** Map `esmBridge.snapshotBySymbol[symbol]` to journal Recommendation + tooltips.
 *
 * **Must NOT:** Call pipeline, scoring, Position Adviser, Mapping, or RuleBook evaluation.
 *
 * @module utils/esmUiDisplay
 */

import type { ProductionEsmBridgeSnapshot } from '../services/productionEsmBridge/productionEsmBridgeTypes';
import { EntryActionType } from '../services/entryStateManager/actionTypes';
import { EntryState } from '../services/entryStateManager/stateMachineTypes';

/** RuleBook entry states only — no WAIT business state. */
export type EsmRuleBookHint = 'READY' | 'WATCH' | 'BLOCKED' | 'LOCKED';

export interface EsmHintDisplay {
  /** Badge next to PA recommendation — e.g. "ⓘ READY" or "ⓘ Theo dõi". */
  readonly hintBadge: string | null;
  /** RuleBook hint code when applicable — null for display-only observe text. */
  readonly hintCode: EsmRuleBookHint | null;
  readonly tooltipLines: readonly string[];
}

/** SSOT hint priority — highest wins, exactly one badge. */
export const ESM_HINT_PRIORITY: readonly EsmRuleBookHint[] = [
  'BLOCKED',
  'LOCKED',
  'WATCH',
  'READY',
];

const RULEBOOK_HINT_BADGE: Record<EsmRuleBookHint, string> = {
  READY: 'ⓘ READY',
  WATCH: 'ⓘ WATCH',
  BLOCKED: 'ⓘ BLOCKED',
  LOCKED: 'ⓘ LOCKED',
};

const OBSERVE_DISPLAY_BADGE = 'ⓘ Theo dõi';

const TECHNICAL_LINE_PATTERN =
  /pipeline|harness|rulebook|mapping|state\s*machine|scan\s*id|orchestrator|halted|transition|adapter|aggregator|dispatcher|executor|conflict|decision\s*engine|runtime|trigger\s*type|normalized|context\.|integration|passthrough|metadata|scaffold/i;

const LOCK_LINE_PATTERN = /lock|khoá|khóa|frozen|đóng băng/i;

const READY_STATES = new Set(['READY', 'ENTRY', 'ACTIVE']);
const WATCH_STATES = new Set(['WATCH']);
const BLOCKED_STATES = new Set(['BLOCKED']);
const LOCKED_STATES = new Set(['LOCKED']);
const OBSERVE_STATES = new Set(['IDLE', 'EXIT']);

function shortenLine(value: string, maxLen = 56): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function isUserFriendlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (TECHNICAL_LINE_PATTERN.test(trimmed)) return false;
  if (trimmed.length > 80) return false;
  return true;
}

function mapStateToHint(state: string | null | undefined): EsmRuleBookHint | 'OBSERVE' | null {
  if (!state) return null;
  const upper = state.toUpperCase();
  if (READY_STATES.has(upper)) return 'READY';
  if (WATCH_STATES.has(upper)) return 'WATCH';
  if (BLOCKED_STATES.has(upper)) return 'BLOCKED';
  if (LOCKED_STATES.has(upper)) return 'LOCKED';
  if (OBSERVE_STATES.has(upper)) return 'OBSERVE';
  return null;
}

function dedupeLines(lines: string[]): string[] {
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

function pushFriendly(raw: string[], line: string | undefined | null): void {
  if (!line || !isUserFriendlyLine(line)) return;
  raw.push(shortenLine(line));
}

/**
 * SSOT — pick exactly one RuleBook hint from multiple candidates.
 *
 * Priority: BLOCKED > LOCKED > WATCH > READY
 */
export function resolveHighestPriorityHint(
  candidates: readonly (EsmRuleBookHint | null | undefined)[],
): EsmRuleBookHint | null {
  const present = new Set(
    candidates.filter((c): c is EsmRuleBookHint => c != null),
  );
  for (const hint of ESM_HINT_PRIORITY) {
    if (present.has(hint)) return hint;
  }
  return null;
}

function collectSnapshotHintCandidates(
  snapshot: ProductionEsmBridgeSnapshot,
): EsmRuleBookHint[] {
  if (!snapshot.entryStateManagerEnabled || !snapshot.harnessResult) return [];

  const harness = snapshot.harnessResult;
  const sm = harness.pipelineResult.stateMachineResult;
  const candidates: EsmRuleBookHint[] = [];

  for (const state of [sm.currentState, sm.nextState, snapshot.mappedCurrentState]) {
    if (state == null) continue;
    const mapped = mapStateToHint(String(state));
    if (mapped && mapped !== 'OBSERVE') candidates.push(mapped);
  }

  const hardBlock = harness.context.triggerSnapshot.hardBlockResult;
  const ruleOutput = hardBlock?.context.normalizedRuleOutput;

  if (hardBlock?.detected) candidates.push('BLOCKED');
  if ((ruleOutput?.hardBlocks?.length ?? 0) > 0) candidates.push('BLOCKED');
  if (snapshot.halted) candidates.push('BLOCKED');
  if (ruleOutput?.adxGateBlocked) candidates.push('WATCH');
  if (ruleOutput?.tradePlanValid === false) candidates.push('WATCH');
  if ((ruleOutput?.groupBlocks?.length ?? 0) > 0) candidates.push('WATCH');

  const lockedState = [sm.currentState, sm.nextState, snapshot.mappedCurrentState].some(
    (s) => s != null && LOCKED_STATES.has(String(s).toUpperCase()),
  );
  if (lockedState) candidates.push('LOCKED');

  return candidates;
}

function resolveHintFromSnapshot(
  snapshot: ProductionEsmBridgeSnapshot | null | undefined,
  symbol: string,
): EsmRuleBookHint | null {
  if (!snapshot || snapshot.symbol !== symbol) return null;
  if (!snapshot.entryStateManagerEnabled || !snapshot.harnessResult) return null;
  return resolveHighestPriorityHint(collectSnapshotHintCandidates(snapshot));
}

function hasObserveDisplay(snapshot: ProductionEsmBridgeSnapshot): boolean {
  if (!snapshot.harnessResult) return false;
  const sm = snapshot.harnessResult.pipelineResult.stateMachineResult;
  for (const state of [sm.currentState, sm.nextState, snapshot.mappedCurrentState]) {
    if (state != null && mapStateToHint(String(state)) === 'OBSERVE') return true;
  }
  return false;
}

function collectFriendlyReasonsForHint(
  snapshot: ProductionEsmBridgeSnapshot,
  hint: EsmRuleBookHint,
): string[] {
  const raw: string[] = [];
  const harness = snapshot.harnessResult;
  if (!harness) return raw;

  const hardBlock = harness.context.triggerSnapshot.hardBlockResult;
  const ruleOutput = hardBlock?.context.normalizedRuleOutput;

  if (hint === 'BLOCKED') {
    for (const reason of ruleOutput?.blockReasons ?? []) pushFriendly(raw, reason);
    for (const block of ruleOutput?.hardBlocks ?? []) pushFriendly(raw, block);
    for (const block of ruleOutput?.groupBlocks ?? []) pushFriendly(raw, block);
    pushFriendly(raw, hardBlock?.reason);
    for (const ev of hardBlock?.evidence ?? []) pushFriendly(raw, ev.description);
  }

  if (hint === 'LOCKED') {
    for (const reason of ruleOutput?.blockReasons ?? []) {
      if (reason && LOCK_LINE_PATTERN.test(reason)) pushFriendly(raw, reason);
    }
    for (const ev of hardBlock?.evidence ?? []) {
      if (ev.description && LOCK_LINE_PATTERN.test(ev.description)) {
        pushFriendly(raw, ev.description);
      }
    }
    if (raw.length === 0) pushFriendly(raw, 'Giá trong vùng khoá lệnh');
  }

  if (hint === 'WATCH') {
    for (const block of ruleOutput?.groupBlocks ?? []) pushFriendly(raw, block);
    if (ruleOutput?.adxGateBlocked) pushFriendly(raw, 'ADX chưa đạt ngưỡng');
    if (ruleOutput?.tradePlanValid === false) pushFriendly(raw, 'Kế hoạch lệnh chưa sẵn');
    for (const reason of ruleOutput?.blockReasons ?? []) pushFriendly(raw, reason);
  }

  if (hint === 'READY') {
    if (ruleOutput?.tradePlanValid !== false) pushFriendly(raw, 'Entry hợp lệ');
    pushFriendly(raw, 'Điều kiện vào lệnh đạt yêu cầu');
    for (const ev of hardBlock?.evidence ?? []) {
      if (ev.description && !LOCK_LINE_PATTERN.test(ev.description)) {
        pushFriendly(raw, ev.description);
      }
    }
  }

  return dedupeLines(raw);
}

/**
 * RuleBook hint code from snapshot — null when unavailable or non-RuleBook state.
 */
export function resolveEsmRuleBookHint(
  snapshot: ProductionEsmBridgeSnapshot | null | undefined,
  symbol: string,
): EsmRuleBookHint | null {
  return resolveHintFromSnapshot(snapshot, symbol);
}

/**
 * Hint badge shown beside Position Adviser recommendation — exactly one badge.
 */
export function resolveEsmHintBadge(
  snapshot: ProductionEsmBridgeSnapshot | null | undefined,
  symbol: string,
): string | null {
  if (!snapshot || snapshot.symbol !== symbol) return null;
  if (!snapshot.entryStateManagerEnabled || !snapshot.harnessResult) return null;

  const hint = resolveHintFromSnapshot(snapshot, symbol);
  if (hint) return RULEBOOK_HINT_BADGE[hint];
  if (hasObserveDisplay(snapshot)) return OBSERVE_DISPLAY_BADGE;
  return null;
}

/**
 * Up to 4 short tooltip lines for the resolved hint only.
 */
export function resolveEsmTooltipLines(
  snapshot: ProductionEsmBridgeSnapshot | null | undefined,
  symbol: string,
): readonly string[] {
  if (!snapshot || snapshot.symbol !== symbol) return [];
  const hint = resolveHintFromSnapshot(snapshot, symbol);
  if (!hint) return [];

  return collectFriendlyReasonsForHint(snapshot, hint)
    .slice(0, 4)
    .map((line) => `• ${line}`);
}

/** Full hint bundle for one journal row. */
export function resolveEsmHintDisplay(
  snapshot: ProductionEsmBridgeSnapshot | null | undefined,
  symbol: string,
): EsmHintDisplay {
  const hintCode = resolveHintFromSnapshot(snapshot, symbol);
  return {
    hintBadge: resolveEsmHintBadge(snapshot, symbol),
    hintCode,
    tooltipLines: resolveEsmTooltipLines(snapshot, symbol),
  };
}

/** @deprecated UL-03 — use resolveEsmRuleBookHint */
export type EsmRecommendationCode = EsmRuleBookHint | 'N/A';

/** @deprecated UL-03 — use resolveEsmRuleBookHint */
export function resolveEsmRecommendationCode(
  snapshot: ProductionEsmBridgeSnapshot | null | undefined,
  symbol: string,
): EsmRecommendationCode | 'N/A' {
  return resolveEsmRuleBookHint(snapshot, symbol) ?? 'N/A';
}

/** @deprecated UL-03 — hints use RuleBook codes in badge */
export function resolveEsmRecommendationLabel(code: EsmRecommendationCode | 'N/A'): string {
  if (code === 'N/A') return '—';
  return code;
}

/** @deprecated UL-03 */
export function resolveEsmRecommendationColor(_code: EsmRecommendationCode | 'N/A'): string {
  return '#848E9C';
}

/** @deprecated UL-03 — use resolveEsmUlReviewDisplay */
export function resolveEsmRecommendationDisplay(
  snapshot: ProductionEsmBridgeSnapshot | null | undefined,
  symbol: string,
): { code: EsmRecommendationCode | 'N/A'; label: string; color: string; tooltipLines: readonly string[] } {
  const review = resolveEsmUlReviewDisplay(snapshot, symbol);
  return {
    code: resolveEsmRuleBookHint(snapshot, symbol) ?? 'N/A',
    label: review.label,
    color: '#848E9C',
    tooltipLines: review.tooltipLines,
  };
}

export type EsmUlReviewTone = 'hold' | 'close' | 'wait' | 'neutral';

export interface EsmUlReviewDisplay {
  readonly label: string;
  readonly tone: EsmUlReviewTone;
  readonly tooltipLines: readonly string[];
}

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

const UL_REVIEW_HINT_LABELS: Record<EsmRuleBookHint, string> = {
  READY: 'Hold Position',
  WATCH: 'Wait Confirmation',
  BLOCKED: 'Emergency Exit',
  LOCKED: 'Wait Confirmation',
};

const UL_REVIEW_STATE_LABELS: Partial<Record<EntryState, string>> = {
  [EntryState.ACTIVE]: 'Hold Position',
  [EntryState.EXIT]: 'Close Position',
  [EntryState.WATCH]: 'Wait Confirmation',
  [EntryState.BLOCKED]: 'Emergency Exit',
  [EntryState.LOCKED]: 'Wait Confirmation',
  [EntryState.READY]: 'Hold Position',
  [EntryState.ENTRY]: 'Wait Confirmation',
  [EntryState.IDLE]: 'No Action',
};

const UL_REVIEW_ACTION_PRIORITY: readonly EntryActionType[] = [
  EntryActionType.CLOSE_POSITION,
  EntryActionType.PREPARE_EXIT,
  EntryActionType.MONITOR_POSITION,
  EntryActionType.OPEN_POSITION,
  EntryActionType.CONFIRM_ENTRY,
  EntryActionType.PREPARE_ENTRY,
  EntryActionType.RESET_STATE,
  EntryActionType.NO_ACTION,
];

function resolveUlReviewTone(label: string): EsmUlReviewTone {
  const lower = label.toLowerCase();
  if (lower.includes('close') || lower.includes('emergency') || lower.includes('exit')) {
    return 'close';
  }
  if (lower.includes('wait') || lower.includes('confirmation')) return 'wait';
  if (lower.includes('hold') || lower.includes('monitor')) return 'hold';
  return 'neutral';
}

function resolvePrimaryUlReviewAction(
  snapshot: ProductionEsmBridgeSnapshot,
): EntryActionType | null {
  const actions = snapshot.harnessResult?.pipelineResult.actionEngineResult.actions ?? [];
  if (actions.length === 0) return null;

  for (const actionType of UL_REVIEW_ACTION_PRIORITY) {
    if (actions.some((action) => action.actionType === actionType)) {
      return actionType;
    }
  }
  return actions[0]?.actionType ?? null;
}

function resolveUlReviewStateLabel(snapshot: ProductionEsmBridgeSnapshot): string | null {
  const sm = snapshot.harnessResult?.pipelineResult.stateMachineResult;
  const state = sm?.nextState ?? sm?.currentState ?? snapshot.mappedCurrentState;
  if (state == null) return null;
  return UL_REVIEW_STATE_LABELS[state as EntryState] ?? null;
}

function collectUlReviewTooltipLines(
  snapshot: ProductionEsmBridgeSnapshot,
  symbol: string,
): readonly string[] {
  const hint = resolveHintFromSnapshot(snapshot, symbol);
  if (hint) {
    return resolveEsmTooltipLines(snapshot, symbol);
  }
  const action = snapshot.harnessResult?.pipelineResult.actionEngineResult.actions[0];
  if (action?.reason && isUserFriendlyLine(action.reason)) {
    return [`• ${shortenLine(action.reason)}`];
  }
  if (snapshot.message && isUserFriendlyLine(snapshot.message)) {
    return [`• ${shortenLine(snapshot.message)}`];
  }
  return [];
}

/**
 * Latest UL Review (ESM) label for journal Recommendation column — read-only snapshot.
 */
export function resolveEsmUlReviewDisplay(
  snapshot: ProductionEsmBridgeSnapshot | null | undefined,
  symbol: string,
): EsmUlReviewDisplay {
  if (!snapshot || snapshot.symbol !== symbol) {
    return { label: '—', tone: 'neutral', tooltipLines: [] };
  }
  if (!snapshot.entryStateManagerEnabled || !snapshot.harnessResult) {
    return { label: '—', tone: 'neutral', tooltipLines: [] };
  }

  const primaryAction = resolvePrimaryUlReviewAction(snapshot);
  if (primaryAction && primaryAction !== EntryActionType.NO_ACTION) {
    const label = UL_REVIEW_ACTION_LABELS[primaryAction];
    return {
      label,
      tone: resolveUlReviewTone(label),
      tooltipLines: collectUlReviewTooltipLines(snapshot, symbol),
    };
  }

  const stateLabel = resolveUlReviewStateLabel(snapshot);
  if (stateLabel) {
    return {
      label: stateLabel,
      tone: resolveUlReviewTone(stateLabel),
      tooltipLines: collectUlReviewTooltipLines(snapshot, symbol),
    };
  }

  const hint = resolveHintFromSnapshot(snapshot, symbol);
  if (hint) {
    const label = UL_REVIEW_HINT_LABELS[hint];
    return {
      label,
      tone: resolveUlReviewTone(label),
      tooltipLines: collectUlReviewTooltipLines(snapshot, symbol),
    };
  }

  if (hasObserveDisplay(snapshot)) {
    return {
      label: 'No Action',
      tone: 'neutral',
      tooltipLines: collectUlReviewTooltipLines(snapshot, symbol),
    };
  }

  return { label: '—', tone: 'neutral', tooltipLines: [] };
}
