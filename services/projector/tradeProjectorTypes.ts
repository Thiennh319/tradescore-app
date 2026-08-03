/**
 * Task 12B.3 — Projection state & materialize types.
 * State nội bộ Projector — output duy nhất vẫn là AiTradeJournalEntry.
 */

import type { AiTradeJournalEntry, PartialCloseRecord } from '../../constants/aiJournal';
import type {
  AdvisorActionCode,
  AdvisorReasonCode,
  DecisionCode,
  ExitReasonCode,
  OrderSideCode,
  OrderTypeCode,
  StrategyVersion,
  TriggerCode,
} from '../events';
import type {
  TradeProjectionSchemaVersion,
  TradeProjectionVersion,
} from './tradeProjectionVersion';

export type ProjectionLifecyclePhase =
  | 'NONE'
  | 'CREATED'
  | 'ORDER_SUBMITTED'
  | 'FILLED'
  | 'RUNNING'
  | 'CLOSED'
  | 'CANCELLED';

export type ProjectionAdviserStep = {
  sequence: number;
  eventId: string;
  atUtc: string;
  advisorActionCode: AdvisorActionCode;
  advisorReasonCode: AdvisorReasonCode;
  advisorReasonLabel?: string;
};

export type ProjectionMachineCodes = {
  triggerCode: TriggerCode | null;
  decisionCode: DecisionCode | null;
  strategyVersion: StrategyVersion | null;
  lastAdvisorActionCode: AdvisorActionCode | null;
  lastAdvisorReasonCode: AdvisorReasonCode | null;
};

export type ProjectionPositionState = {
  side: OrderSideCode | null;
  entryPrice: number | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  size: number | null;
  orderType: OrderTypeCode | null;
  limitPrice: number | null;
  entryAdjusted: boolean | null;
  filledAtUtc: string | null;
};

export type ProjectionExitState = {
  exitReasonCode: ExitReasonCode | null;
  exitPrice: number | null;
  exitAtUtc: string | null;
  pnlUsdt: number | null;
  pnlPct: number | null;
  advisorActionCodeAtExit: AdvisorActionCode | null;
  lastTpLevel: 'TP1' | 'TP2' | 'TP3' | null;
  slReachedPrice: number | null;
};

export type ProjectionAuditState = {
  appliedEventIds: string[];
  lastEventId: string | null;
  lastEventAtUtc: string | null;
  correlationId: string | null;
  featureSetVersion: string | null;
  engineVersion: string | null;
  confidenceVersion: string | null;
  plannerVersion: string | null;
  sealed: boolean;
};

export type ProjectionAiMeta = {
  projectionVersion: TradeProjectionVersion;
  projectionSchemaVersion: TradeProjectionSchemaVersion;
  confidence: number | null;
};

/** Internal fold state — Architecture Freeze blocks. */
export type TradeProjectionState = {
  identity: {
    tradeId: string | null;
    symbol: string | null;
    sessionId: string | null;
  };
  phase: ProjectionLifecyclePhase;
  entrySnapshot: {
    createdAtUtc: string | null;
    createdAtMs: number | null;
  };
  position: ProjectionPositionState;
  adviserTimeline: ProjectionAdviserStep[];
  partialCloses: PartialCloseRecord[];
  exit: ProjectionExitState;
  machineCodes: ProjectionMachineCodes;
  audit: ProjectionAuditState;
  ai: ProjectionAiMeta;
};

export type ProjectResult = {
  entry: AiTradeJournalEntry;
  state: TradeProjectionState;
};

export type ProjectOptions = {
  /** Khi true, bỏ qua event trùng eventId (default true). */
  skipDuplicates?: boolean;
  /**
   * Sort key trước reduce.
   * default: createdAtUtc ASC, rồi eventId ASC (deterministic out-of-order).
   */
  sort?: boolean;
};
