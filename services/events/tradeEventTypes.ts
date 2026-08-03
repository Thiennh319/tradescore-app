/**
 * Task 12B.1 — Strongly typed Trade Event Contract.
 * Không `any`. Không nối Engine / Journal / UI.
 */

import type {
  AdvisorActionCode,
  AdvisorReasonCode,
  DecisionCode,
  ExitReasonCode,
  OrderSideCode,
  OrderTypeCode,
  PartialExitReasonCode,
  StrategyVersion,
  TpLevelCode,
  TradeAggregateType,
  TradeEventSource,
  TradeEventType,
  TriggerCode,
} from './tradeEventEnums';
import type { TradeEventSchemaVersion, TradeEventVersion } from './tradeEventVersion';

/** Aggregate gắn trade (và control events liên quan). */
export type TradeEventAggregate = {
  tradeId: string;
  symbol: string;
  strategyVersion: StrategyVersion;
  sessionId?: string;
};

/** Metadata chung — không trùng payload nghiệp vụ. */
export type TradeEventMetadata = {
  /** Monotonic per tradeId (Lifecycle sequence). */
  sequence?: number;
  deviceId?: string;
  /** @deprecated Prefer top-level `correlationId` (12B.2). Kept for compat. */
  correlationId?: string;
  /** ACK target (SYNC_ACK). */
  ackEventId?: string;
  /** Feature / engine stamps (12A.1) — không dump indicator. */
  featureSetVersion?: string;
  engineVersion?: string;
  confidenceVersion?: string;
  plannerVersion?: string;
};

// ─── Payloads (strongly typed, minimal, no duplicate blobs) ───

export type TradeCreatedPayload = {
  symbol: string;
  side: OrderSideCode;
  strategyVersion: StrategyVersion;
  triggerCode: TriggerCode;
  decisionCode: DecisionCode;
  confidence: number | null;
  entry: number;
  stop: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  sessionId?: string;
};

export type OrderSubmittedPayload = {
  orderType: OrderTypeCode;
  side: OrderSideCode;
  limitPrice?: number;
  size?: number;
};

export type OrderFilledPayload = {
  fillPrice: number;
  entryAdjusted: boolean;
  filledAtUtc: string;
};

export type PositionRunningPayload = {
  entryPrice: number;
  stop: number;
  tp1: number;
};

export type StopMovedPayload = {
  oldStop: number;
  newStop: number;
  advisorReasonCode?: AdvisorReasonCode;
};

export type PartialExitPayload = {
  percent: number;
  price: number;
  reasonCode: PartialExitReasonCode;
  realizedPnlUsdt?: number;
};

export type TpReachedPayload = {
  tpLevelCode: TpLevelCode;
  price: number;
};

export type SlReachedPayload = {
  price: number;
};

export type AdviserUpdatedPayload = {
  advisorActionCode: AdvisorActionCode;
  advisorReasonCode: AdvisorReasonCode;
  /** UI label only — AI không parse. */
  advisorReasonLabel?: string;
};

export type TradeClosedPayload = {
  exitReasonCode: ExitReasonCode;
  exitPrice: number;
  pnlUsdt: number;
  pnlPct: number;
  advisorActionCodeAtExit?: AdvisorActionCode;
};

export type TradeCancelledPayload = {
  exitReasonCode: ExitReasonCode;
};

export type SyncAckPayload = {
  ackEventId: string;
  tradeId: string;
  appliedAtUtc: string;
};

export type HeartbeatPayload = {
  sentAtUtc: string;
};

export type TradeEventPayloadByType = {
  TRADE_CREATED: TradeCreatedPayload;
  ORDER_SUBMITTED: OrderSubmittedPayload;
  ORDER_FILLED: OrderFilledPayload;
  POSITION_RUNNING: PositionRunningPayload;
  STOP_MOVED: StopMovedPayload;
  PARTIAL_EXIT: PartialExitPayload;
  TP_REACHED: TpReachedPayload;
  SL_REACHED: SlReachedPayload;
  ADVISER_UPDATED: AdviserUpdatedPayload;
  TRADE_CLOSED: TradeClosedPayload;
  TRADE_CANCELLED: TradeCancelledPayload;
  SYNC_ACK: SyncAckPayload;
  HEARTBEAT: HeartbeatPayload;
};

export type TradeEventPayload = TradeEventPayloadByType[TradeEventType];

/** Base envelope — mọi event (12B.1 + additive 12B.2 identity fields). */
export type TradeEventBase<T extends TradeEventType = TradeEventType> = {
  eventId: string;
  /** Groups related events in one flow. */
  correlationId: string;
  /** Parent event that caused this one (empty string if root). */
  causationId: string;
  /** Business idempotency key — store rejects duplicate (type+aggregate+key). */
  idempotencyKey: string;
  eventVersion: TradeEventVersion;
  schemaVersion: TradeEventSchemaVersion | string;
  eventType: T;
  aggregateId: string;
  aggregateType: TradeAggregateType;
  source: TradeEventSource;
  createdAtUtc: string;
  producerVersion: string;
  payload: TradeEventPayloadByType[T];
  metadata: TradeEventMetadata;
};

export type TradeCreatedEvent = TradeEventBase<'TRADE_CREATED'>;
export type OrderSubmittedEvent = TradeEventBase<'ORDER_SUBMITTED'>;
export type OrderFilledEvent = TradeEventBase<'ORDER_FILLED'>;
export type PositionRunningEvent = TradeEventBase<'POSITION_RUNNING'>;
export type StopMovedEvent = TradeEventBase<'STOP_MOVED'>;
export type PartialExitEvent = TradeEventBase<'PARTIAL_EXIT'>;
export type TpReachedEvent = TradeEventBase<'TP_REACHED'>;
export type SlReachedEvent = TradeEventBase<'SL_REACHED'>;
export type AdviserUpdatedEvent = TradeEventBase<'ADVISER_UPDATED'>;
export type TradeClosedEvent = TradeEventBase<'TRADE_CLOSED'>;
export type TradeCancelledEvent = TradeEventBase<'TRADE_CANCELLED'>;
export type SyncAckEvent = TradeEventBase<'SYNC_ACK'>;
export type HeartbeatEvent = TradeEventBase<'HEARTBEAT'>;

export type TradeEvent =
  | TradeCreatedEvent
  | OrderSubmittedEvent
  | OrderFilledEvent
  | PositionRunningEvent
  | StopMovedEvent
  | PartialExitEvent
  | TpReachedEvent
  | SlReachedEvent
  | AdviserUpdatedEvent
  | TradeClosedEvent
  | TradeCancelledEvent
  | SyncAckEvent
  | HeartbeatEvent;

/** Input factory — caller cung cấp identity + payload; envelope do factory điền. */
export type CreateTradeEventInput<T extends TradeEventType> = {
  eventType: T;
  aggregateId: string;
  aggregateType?: TradeAggregateType;
  source: TradeEventSource;
  payload: TradeEventPayloadByType[T];
  metadata?: TradeEventMetadata;
  eventId?: string;
  /** Defaults to eventId when omitted. */
  correlationId?: string;
  /** Defaults to '' (root). */
  causationId?: string;
  /** Defaults to eventId when omitted. */
  idempotencyKey?: string;
  createdAtUtc?: string;
  producerVersion?: string;
  eventVersion?: TradeEventVersion;
  schemaVersion?: string;
};
