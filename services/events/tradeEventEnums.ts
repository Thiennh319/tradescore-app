/**
 * Task 12B.1 — Trade Event Contract enums.
 * Data-contract only. Không nối Engine / Journal / UI.
 */

/** Lifecycle + control events (Journal Architecture 12A.1). */
export const TRADE_EVENT_TYPES = [
  'TRADE_CREATED',
  'ORDER_SUBMITTED',
  'ORDER_FILLED',
  'POSITION_RUNNING',
  'STOP_MOVED',
  'PARTIAL_EXIT',
  'TP_REACHED',
  'SL_REACHED',
  'ADVISER_UPDATED',
  'TRADE_CLOSED',
  'TRADE_CANCELLED',
  'SYNC_ACK',
  'HEARTBEAT',
] as const;

export type TradeEventType = (typeof TRADE_EVENT_TYPES)[number];

export const TRADE_EVENT_SOURCES = [
  'APK',
  'Desktop',
  'Migration',
  'Replay',
  'Manual',
] as const;

export type TradeEventSource = (typeof TRADE_EVENT_SOURCES)[number];

export const TRADE_AGGREGATE_TYPES = ['TRADE', 'SYNC'] as const;

export type TradeAggregateType = (typeof TRADE_AGGREGATE_TYPES)[number];

export const STRATEGY_VERSIONS = [
  'V3',
  'V4',
  'V4_1',
  'V5',
  'CVDX',
  'MANUAL',
] as const;

export type StrategyVersion = (typeof STRATEGY_VERSIONS)[number];

export const TRIGGER_CODES = [
  'TREND_REVERSAL',
  'VOLATILITY_EXPLOSION',
  'FAKE_BREAKOUT',
  'NONE',
] as const;

export type TriggerCode = (typeof TRIGGER_CODES)[number];

export const DECISION_CODES = ['LONG', 'SHORT', 'WATCH', 'IGNORE'] as const;

export type DecisionCode = (typeof DECISION_CODES)[number];

export const ADVISOR_ACTION_CODES = [
  'WAITING_FILL',
  'HOLD',
  'MOVE_SL_BE',
  'TRAILING_STOP',
  'PARTIAL_TP1',
  'PARTIAL_TP2',
  'CLOSE_NOW',
] as const;

export type AdvisorActionCode = (typeof ADVISOR_ACTION_CODES)[number];

export const ADVISOR_REASON_CODES = [
  'WAITING_FILL',
  'RR_1_REACHED',
  'MOMENTUM_STRONG',
  'MOMENTUM_WEAK',
  'TRAILING_STOP',
  'PROTECTION_TRIGGER',
  'EXHAUSTION',
  'SUPPORT_BREAK',
  'RESISTANCE_REJECT',
  'TP1_REACHED',
  'TP2_REACHED',
  'REVERSAL_SIGNAL',
  'MARKET_OPPOSES',
  'SNAPSHOT_STALE',
  'HOLD_DEFAULT',
] as const;

export type AdvisorReasonCode = (typeof ADVISOR_REASON_CODES)[number];

export const ORDER_SIDE_CODES = ['LONG', 'SHORT'] as const;

export type OrderSideCode = (typeof ORDER_SIDE_CODES)[number];

export const ORDER_TYPE_CODES = ['MARKET', 'LIMIT'] as const;

export type OrderTypeCode = (typeof ORDER_TYPE_CODES)[number];

export const TP_LEVEL_CODES = ['TP1', 'TP2', 'TP3'] as const;

export type TpLevelCode = (typeof TP_LEVEL_CODES)[number];

export const EXIT_REASON_CODES = [
  'TP1_HIT',
  'TP2_HIT',
  'TP3_HIT',
  'SL_HIT',
  'MANUAL_CLOSE',
  'BE_CLOSE',
  'LIMIT_NOT_FILLED',
  'PLAN_EXPIRED',
  'PLAN_HEALTH_CANCEL',
] as const;

export type ExitReasonCode = (typeof EXIT_REASON_CODES)[number];

export const PARTIAL_EXIT_REASON_CODES = [
  'PARTIAL_TP1',
  'PARTIAL_TP2',
  'PARTIAL_CLOSE_30',
] as const;

export type PartialExitReasonCode = (typeof PARTIAL_EXIT_REASON_CODES)[number];

export function isTradeEventType(value: string): value is TradeEventType {
  return (TRADE_EVENT_TYPES as readonly string[]).includes(value);
}

export function isTradeEventSource(value: string): value is TradeEventSource {
  return (TRADE_EVENT_SOURCES as readonly string[]).includes(value);
}

export function isTerminalTradeEventType(type: TradeEventType): boolean {
  return type === 'TRADE_CLOSED' || type === 'TRADE_CANCELLED';
}
