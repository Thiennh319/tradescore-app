/**
 * Task 12B.1 — TradeEventFactory.
 * Sinh Event đúng chuẩn; thiếu field bắt buộc → throw.
 */

import {
  isTradeEventSource,
  isTradeEventType,
  type TradeEventType,
} from './tradeEventEnums';
import type {
  CreateTradeEventInput,
  TradeEvent,
  TradeEventBase,
  TradeEventMetadata,
  TradeEventPayloadByType,
} from './tradeEventTypes';
import {
  TRADE_EVENT_PRODUCER_VERSION,
  TRADE_EVENT_SCHEMA_VERSION,
  TRADE_EVENT_VERSION,
  type TradeEventVersion,
} from './tradeEventVersion';

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export class TradeEventFactoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TradeEventFactoryError';
    this.code = code;
  }
}

export function generateTradeEventId(): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `tev_${rand}`;
}

export function toCreatedAtUtc(date: Date = new Date()): string {
  return date.toISOString();
}

function assertNonEmptyString(field: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TradeEventFactoryError(
      'MISSING_REQUIRED',
      `Missing or empty required field: ${field}`,
    );
  }
}

function assertPayloadObject(payload: unknown): asserts payload is Record<string, unknown> {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TradeEventFactoryError('MISSING_PAYLOAD', 'payload is required and must be an object');
  }
}

function requirePayloadKeys(
  eventType: TradeEventType,
  payload: Record<string, unknown>,
  keys: readonly string[],
): void {
  for (const key of keys) {
    if (!(key in payload) || payload[key] === undefined) {
      throw new TradeEventFactoryError(
        'MISSING_PAYLOAD_FIELD',
        `${eventType} payload missing required field: ${key}`,
      );
    }
  }
}

const REQUIRED_PAYLOAD_KEYS: {
  [K in TradeEventType]: readonly (keyof TradeEventPayloadByType[K] & string)[];
} = {
  TRADE_CREATED: [
    'symbol',
    'side',
    'strategyVersion',
    'triggerCode',
    'decisionCode',
    'confidence',
    'entry',
    'stop',
    'tp1',
  ],
  ORDER_SUBMITTED: ['orderType', 'side'],
  ORDER_FILLED: ['fillPrice', 'entryAdjusted', 'filledAtUtc'],
  POSITION_RUNNING: ['entryPrice', 'stop', 'tp1'],
  STOP_MOVED: ['oldStop', 'newStop'],
  PARTIAL_EXIT: ['percent', 'price', 'reasonCode'],
  TP_REACHED: ['tpLevelCode', 'price'],
  SL_REACHED: ['price'],
  ADVISER_UPDATED: ['advisorActionCode', 'advisorReasonCode'],
  TRADE_CLOSED: ['exitReasonCode', 'exitPrice', 'pnlUsdt', 'pnlPct'],
  TRADE_CANCELLED: ['exitReasonCode'],
  SYNC_ACK: ['ackEventId', 'tradeId', 'appliedAtUtc'],
  HEARTBEAT: ['sentAtUtc'],
};

function assertUtc(field: string, value: string): void {
  if (!ISO_UTC_RE.test(value)) {
    throw new TradeEventFactoryError(
      'INVALID_UTC',
      `${field} must be ISO-8601 UTC (…Z), got: ${value}`,
    );
  }
}

function resolveAggregateType(
  eventType: TradeEventType,
  override: CreateTradeEventInput<TradeEventType>['aggregateType'],
): 'TRADE' | 'SYNC' {
  if (override) return override;
  if (eventType === 'SYNC_ACK' || eventType === 'HEARTBEAT') return 'SYNC';
  return 'TRADE';
}

/**
 * Tạo một Trade Event đúng contract.
 * Không ghi Event Store — chỉ trả về object.
 */
export function createTradeEvent<T extends TradeEventType>(
  input: CreateTradeEventInput<T>,
): TradeEventBase<T> {
  if (!isTradeEventType(input.eventType)) {
    throw new TradeEventFactoryError('INVALID_TYPE', `Invalid eventType: ${String(input.eventType)}`);
  }
  if (!isTradeEventSource(input.source)) {
    throw new TradeEventFactoryError('INVALID_SOURCE', `Invalid source: ${String(input.source)}`);
  }
  assertNonEmptyString('aggregateId', input.aggregateId);
  assertPayloadObject(input.payload);

  requirePayloadKeys(
    input.eventType,
    input.payload as Record<string, unknown>,
    REQUIRED_PAYLOAD_KEYS[input.eventType],
  );

  const createdAtUtc = input.createdAtUtc ?? toCreatedAtUtc();
  assertUtc('createdAtUtc', createdAtUtc);

  if (input.eventType === 'ORDER_FILLED') {
    assertUtc('payload.filledAtUtc', (input.payload as TradeEventPayloadByType['ORDER_FILLED']).filledAtUtc);
  }
  if (input.eventType === 'SYNC_ACK') {
    assertUtc('payload.appliedAtUtc', (input.payload as TradeEventPayloadByType['SYNC_ACK']).appliedAtUtc);
  }
  if (input.eventType === 'HEARTBEAT') {
    assertUtc('payload.sentAtUtc', (input.payload as TradeEventPayloadByType['HEARTBEAT']).sentAtUtc);
  }

  const eventVersion = (input.eventVersion ?? TRADE_EVENT_VERSION) as TradeEventVersion;
  if (eventVersion !== TRADE_EVENT_VERSION) {
    throw new TradeEventFactoryError(
      'INVALID_VERSION',
      `Unsupported eventVersion: ${eventVersion} (expected ${TRADE_EVENT_VERSION})`,
    );
  }

  const schemaVersion = input.schemaVersion ?? TRADE_EVENT_SCHEMA_VERSION;
  const producerVersion = input.producerVersion ?? TRADE_EVENT_PRODUCER_VERSION;
  assertNonEmptyString('producerVersion', producerVersion);

  const eventId = input.eventId ?? generateTradeEventId();
  assertNonEmptyString('eventId', eventId);

  const correlationId =
    (input.correlationId ?? input.metadata?.correlationId ?? eventId).trim();
  assertNonEmptyString('correlationId', correlationId);

  const causationId =
    input.causationId != null ? String(input.causationId).trim() : '';

  const idempotencyKey = (input.idempotencyKey ?? eventId).trim();
  assertNonEmptyString('idempotencyKey', idempotencyKey);

  const metadata: TradeEventMetadata = {
    ...(input.metadata ?? {}),
    correlationId: input.metadata?.correlationId ?? correlationId,
  };

  return {
    eventId,
    correlationId,
    causationId,
    idempotencyKey,
    eventVersion,
    schemaVersion,
    eventType: input.eventType,
    aggregateId: input.aggregateId.trim(),
    aggregateType: resolveAggregateType(input.eventType, input.aggregateType),
    source: input.source,
    createdAtUtc,
    producerVersion,
    payload: input.payload,
    metadata,
  };
}

/** Namespace API theo task. */
export const TradeEventFactory = {
  create: createTradeEvent,
  generateId: generateTradeEventId,
  nowUtc: toCreatedAtUtc,
  requiredPayloadKeys: REQUIRED_PAYLOAD_KEYS,
} as const;

export type { TradeEvent };
