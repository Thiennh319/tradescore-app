/**
 * Task 12B.3 — Trade Event Projector (Trading Intelligence View).
 *
 * Source of Truth: Trade Events only.
 * Output: AiTradeJournalEntry (existing schema — map only).
 *
 * Pure / deterministic / idempotent / replay-safe.
 * Không sửa Event · không side effect · không Engine/Binance/Planner/Decision.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import {
  AI_JOURNAL_APP_VERSION,
  type JournalDirection,
  type LayerScoreMap,
  type MarketSnapshot,
  type PositionAdvisorActionAtExit,
  type ScoringSnapshot,
  type StrategySource,
  type TradeOutcome,
  type TradeOutcomeStatus,
  type TradePlanSnapshot,
} from '../../constants/aiJournal';
import type { AdvisorActionCode, StrategyVersion, TradeEvent } from '../events';
import type { StoredTradeEvent } from '../eventStore';
import { reduceTradeEvent } from './tradeProjectionReducer';
import { createEmptyProjectionState } from './tradeProjectionState';
import type {
  ProjectOptions,
  ProjectResult,
  TradeProjectionState,
} from './tradeProjectorTypes';

const ZERO_LAYERS: LayerScoreMap = {
  l1: 0,
  l2: 0,
  l3: 0,
  l4: 0,
  l5: 0,
  l6: 0,
  l7: 0,
  l8: 0,
  l9: 0,
  l10: 0,
};

function mapStrategySource(version: StrategyVersion | null): StrategySource | undefined {
  if (!version) return undefined;
  switch (version) {
    case 'V3':
      return 'V3';
    case 'V4':
    case 'V4_1':
    case 'V5':
      return 'V4';
    case 'CVDX':
      return 'CVDX';
    case 'MANUAL':
      return 'MANUAL';
    default:
      return 'MANUAL';
  }
}

function mapAdvisorAtExit(
  code: AdvisorActionCode | null | undefined,
): PositionAdvisorActionAtExit | null {
  if (!code) return null;
  switch (code) {
    case 'HOLD':
      return 'HOLD_CONDITIONAL';
    case 'MOVE_SL_BE':
      return 'MOVE_SL_BE';
    case 'TRAILING_STOP':
      return 'MOVE_SL_TIGHTER';
    case 'PARTIAL_TP1':
      return 'PARTIAL_TP1';
    case 'PARTIAL_TP2':
      return 'PARTIAL_CLOSE_30';
    case 'CLOSE_NOW':
      return 'CLOSE_NOW';
    case 'WAITING_FILL':
      return 'NO_ACTIVE_ADVISOR';
    default:
      return 'NO_ACTIVE_ADVISOR';
  }
}

function outcomeStatus(state: TradeProjectionState): TradeOutcomeStatus {
  if (state.phase === 'CANCELLED') return 'CANCELLED';
  if (state.phase === 'CLOSED') {
    const pnl = state.exit.pnlUsdt ?? 0;
    if (pnl > 0) return 'WIN';
    if (pnl < 0) return 'LOSS';
    return 'BREAKEVEN';
  }
  if (
    state.phase === 'ORDER_SUBMITTED' &&
    state.position.orderType === 'LIMIT' &&
    state.position.filledAtUtc == null
  ) {
    return 'PENDING';
  }
  if (state.phase === 'CREATED' && state.position.orderType === 'LIMIT') {
    return 'PENDING';
  }
  if (state.phase === 'NONE') return 'PENDING';
  return 'OPEN';
}

function buildMarket(state: TradeProjectionState): MarketSnapshot {
  const entry = state.position.entryPrice ?? 0;
  return {
    entryPrice: entry,
    priceAtAnalysis: entry,
    slippage: 0,
    cvdValue: 0,
    cvdTrend: 'FLAT',
    volumeRatio: 1,
    btcChangePct: 0,
    fundingRate: 0,
    topTraderRatio: 1,
    oiChangePct: 0,
    sessionType: 'MEDIUM',
    hourVN: 0,
  };
}

function buildScoring(state: TradeProjectionState): ScoringSnapshot {
  const direction: JournalDirection =
    state.position.side === 'SHORT' ? 'SHORT' : 'LONG';
  const decision =
    state.machineCodes.decisionCode ??
    (direction === 'SHORT' ? 'SHORT' : 'LONG');
  return {
    totalScore: 0,
    direction,
    layerScores: { ...ZERO_LAYERS },
    mandatoryViolations: [],
    decision,
    score: state.ai.confidence ?? undefined,
    recommendationLabel: state.machineCodes.triggerCode
      ? `${decision}:${state.machineCodes.triggerCode}`
      : undefined,
  };
}

function buildPlan(state: TradeProjectionState): TradePlanSnapshot {
  const entry = state.position.entryPrice ?? 0;
  const stop = state.position.stop ?? entry;
  const tp1 = state.position.tp1 ?? entry;
  const tp2 = state.position.tp2 ?? tp1;
  const tp3 = state.position.tp3 ?? tp2;
  const size = state.position.size ?? 0;
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(tp1 - entry);
  const rr = risk > 0 ? reward / risk : 0;
  return {
    entryZoneType: 'EVENT_PROJECTED',
    entryZoneOptimal: entry,
    entryZoneRangeLow: entry,
    entryZoneRangeHigh: entry,
    slProposed: stop,
    slActual: stop,
    tp1Proposed: tp1,
    tp1Actual: tp1,
    tp2,
    tp3,
    rrProposed: rr,
    sizeProposed: size,
    sizeActual: size,
    isSafeSL: true,
    openReason: state.machineCodes.triggerCode
      ? `trigger:${state.machineCodes.triggerCode}`
      : undefined,
  };
}

function buildOutcome(state: TradeProjectionState): TradeOutcome {
  const status = outcomeStatus(state);
  const exitMs = state.exit.exitAtUtc
    ? Date.parse(state.exit.exitAtUtc)
    : undefined;
  const openMs = state.entrySnapshot.createdAtMs ?? undefined;
  let holding: number | undefined;
  if (
    exitMs != null &&
    openMs != null &&
    Number.isFinite(exitMs) &&
    Number.isFinite(openMs)
  ) {
    holding = Math.max(0, Math.round((exitMs - openMs) / 60_000));
  }

  return {
    status,
    exitPrice: state.exit.exitPrice ?? undefined,
    exitTimestamp: Number.isFinite(exitMs) ? exitMs : undefined,
    pnlUSDT: state.exit.pnlUsdt ?? undefined,
    pnlPct: state.exit.pnlPct ?? undefined,
    holdingTimeMinutes: holding,
    holdDurationMinutes: holding,
    exitReason: state.exit.exitReasonCode ?? undefined,
    closeReason: state.exit.exitReasonCode ?? undefined,
    limitOrderPrice: state.position.limitPrice ?? undefined,
    fillMarketPrice: state.position.filledAtUtc
      ? (state.position.entryPrice ?? undefined)
      : undefined,
    entryAdjusted: state.position.entryAdjusted ?? undefined,
    limitOrderPlacedAt:
      state.phase === 'ORDER_SUBMITTED' || state.position.limitPrice != null
        ? (state.entrySnapshot.createdAtMs ?? undefined)
        : undefined,
  };
}

function buildTags(state: TradeProjectionState): string[] {
  const tags: string[] = ['projected'];
  if (state.machineCodes.triggerCode) {
    tags.push(`triggerCode:${state.machineCodes.triggerCode}`);
  }
  if (state.machineCodes.decisionCode) {
    tags.push(`decisionCode:${state.machineCodes.decisionCode}`);
  }
  if (state.machineCodes.strategyVersion) {
    tags.push(`strategyVersion:${state.machineCodes.strategyVersion}`);
  }
  if (state.ai.confidence != null) {
    tags.push(`confidence:${state.ai.confidence}`);
  }
  if (state.audit.featureSetVersion) {
    tags.push(`featureSetVersion:${state.audit.featureSetVersion}`);
  }
  if (state.audit.engineVersion) {
    tags.push(`engineVersion:${state.audit.engineVersion}`);
  }
  for (const step of state.adviserTimeline) {
    tags.push(
      `adviser:${step.sequence}:${step.advisorActionCode}:${step.advisorReasonCode}`,
    );
  }
  tags.sort();
  return tags;
}

export function materializeAiTradeJournalEntry(
  state: TradeProjectionState,
): AiTradeJournalEntry | null {
  if (!state.identity.tradeId || !state.identity.symbol || state.phase === 'NONE') {
    return null;
  }

  return {
    id: state.identity.tradeId,
    timestamp: state.entrySnapshot.createdAtMs ?? 0,
    symbol: state.identity.symbol,
    accountSizeAtEntry: 0,
    market: buildMarket(state),
    scoring: buildScoring(state),
    plan: buildPlan(state),
    outcome: buildOutcome(state),
    tags: buildTags(state),
    version: AI_JOURNAL_APP_VERSION,
    strategySource: mapStrategySource(state.machineCodes.strategyVersion),
    partialCloses:
      state.partialCloses.length > 0
        ? state.partialCloses.map((p) => ({ ...p }))
        : undefined,
    positionAdvisorActionAtExit: mapAdvisorAtExit(
      state.exit.advisorActionCodeAtExit ??
        state.machineCodes.lastAdvisorActionCode,
    ),
  };
}

export function stableSerializeJournalEntry(entry: AiTradeJournalEntry): string {
  return JSON.stringify(entry);
}

/** Deterministic order for out-of-order input. */
export function sortTradeEventsForProjection(
  events: readonly TradeEvent[],
): TradeEvent[] {
  return [...events].sort((a, b) => {
    if (a.createdAtUtc !== b.createdAtUtc) {
      return a.createdAtUtc < b.createdAtUtc ? -1 : 1;
    }
    const seqA = a.metadata.sequence ?? 0;
    const seqB = b.metadata.sequence ?? 0;
    if (seqA !== seqB) return seqA - seqB;
    return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
  });
}

/**
 * Fold events → projection state (pure).
 */
export function projectTradeState(
  events: readonly TradeEvent[],
  options: ProjectOptions = {},
): TradeProjectionState {
  const sort = options.sort !== false;
  const ordered = sort ? sortTradeEventsForProjection(events) : [...events];
  let state = createEmptyProjectionState();
  for (const event of ordered) {
    state = reduceTradeEvent(state, event);
  }
  return state;
}

/**
 * project(events[]) → AiTradeJournalEntry
 * Replay cùng events → cùng kết quả.
 */
export function project(
  events: readonly TradeEvent[],
  options?: ProjectOptions,
): AiTradeJournalEntry | null {
  const state = projectTradeState(events, options);
  return materializeAiTradeJournalEntry(state);
}

/** Convenience: unwrap StoredTradeEvent từ Event Store. */
export function projectFromStored(
  stored: readonly StoredTradeEvent[],
  options?: ProjectOptions,
): AiTradeJournalEntry | null {
  const bySeq = [...stored].sort((a, b) => a.storeSequence - b.storeSequence);
  return project(
    bySeq.map((s) => s.event),
    { ...options, sort: options?.sort ?? false },
  );
}

export function projectWithState(
  events: readonly TradeEvent[],
  options?: ProjectOptions,
): ProjectResult | null {
  const state = projectTradeState(events, options);
  const entry = materializeAiTradeJournalEntry(state);
  if (!entry) return null;
  return { entry, state };
}
