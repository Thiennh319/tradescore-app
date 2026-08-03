/**
 * Task 12B.1 — Event Contract Foundation tests.
 */
import { describe, expect, it } from 'vitest';
import {
  TRADE_EVENT_PRODUCER_VERSION,
  TRADE_EVENT_SCHEMA_VERSION,
  TRADE_EVENT_SOURCES,
  TRADE_EVENT_TYPES,
  TRADE_EVENT_VERSION,
  TradeEventFactory,
  TradeEventFactoryError,
  createTradeEvent,
  isTerminalTradeEventType,
  isTradeEventType,
  isValidEventVersion,
  isValidProducerVersion,
  isValidSchemaVersion,
  validateTradeEvent,
  validateTradeEventBatch,
  type TradeCreatedPayload,
  type TradeEvent,
} from '../index';

const baseCreatedPayload: TradeCreatedPayload = {
  symbol: 'BTCUSDT',
  side: 'LONG',
  strategyVersion: 'V4_1',
  triggerCode: 'TREND_REVERSAL',
  decisionCode: 'LONG',
  confidence: 0.72,
  entry: 65000,
  stop: 64000,
  tp1: 66000,
  tp2: 67000,
};

describe('Task 12B.1 — Enums', () => {
  it('exports full lifecycle + control catalog', () => {
    expect(TRADE_EVENT_TYPES).toEqual([
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
    ]);
  });

  it('exports sources and type guards', () => {
    expect(TRADE_EVENT_SOURCES).toContain('APK');
    expect(TRADE_EVENT_SOURCES).toContain('Desktop');
    expect(TRADE_EVENT_SOURCES).toContain('Migration');
    expect(isTradeEventType('TRADE_CREATED')).toBe(true);
    expect(isTradeEventType('NOPE')).toBe(false);
    expect(isTerminalTradeEventType('TRADE_CLOSED')).toBe(true);
    expect(isTerminalTradeEventType('ADVISER_UPDATED')).toBe(false);
  });
});

describe('Task 12B.1 — Versions', () => {
  it('keeps eventVersion / schemaVersion / producerVersion independent', () => {
    expect(TRADE_EVENT_VERSION).toBe(1);
    expect(TRADE_EVENT_SCHEMA_VERSION).toBe('1.0.0');
    expect(TRADE_EVENT_PRODUCER_VERSION).toContain('event-contract');
    expect(isValidEventVersion(1)).toBe(true);
    expect(isValidEventVersion(0)).toBe(false);
    expect(isValidSchemaVersion('1.0.0')).toBe(true);
    expect(isValidSchemaVersion('1')).toBe(false);
    expect(isValidProducerVersion('apk-1')).toBe(true);
    expect(isValidProducerVersion('')).toBe(false);
  });
});

describe('Task 12B.1 — Factory', () => {
  it('creates TRADE_CREATED with required envelope fields', () => {
    const event = createTradeEvent({
      eventType: 'TRADE_CREATED',
      aggregateId: 'trade-1',
      source: 'APK',
      payload: baseCreatedPayload,
      metadata: { sequence: 1, featureSetVersion: 'fs-4.1.0', engineVersion: 'engine-4.1.0' },
      createdAtUtc: '2026-07-14T10:00:00.000Z',
    });

    expect(event.eventId).toMatch(/^tev_/);
    expect(event.eventVersion).toBe(TRADE_EVENT_VERSION);
    expect(event.schemaVersion).toBe(TRADE_EVENT_SCHEMA_VERSION);
    expect(event.producerVersion).toBe(TRADE_EVENT_PRODUCER_VERSION);
    expect(event.eventType).toBe('TRADE_CREATED');
    expect(event.aggregateId).toBe('trade-1');
    expect(event.aggregateType).toBe('TRADE');
    expect(event.source).toBe('APK');
    expect(event.createdAtUtc).toBe('2026-07-14T10:00:00.000Z');
    expect(event.payload.symbol).toBe('BTCUSDT');
    expect(event.metadata.sequence).toBe(1);
  });

  it('creates ADVISER_UPDATED and SYNC_ACK with correct aggregateType', () => {
    const adviser = TradeEventFactory.create({
      eventType: 'ADVISER_UPDATED',
      aggregateId: 'trade-1',
      source: 'APK',
      payload: {
        advisorActionCode: 'HOLD',
        advisorReasonCode: 'MOMENTUM_STRONG',
        advisorReasonLabel: 'Giữ lệnh',
      },
      createdAtUtc: '2026-07-14T10:01:00.000Z',
    });
    expect(adviser.aggregateType).toBe('TRADE');

    const ack = TradeEventFactory.create({
      eventType: 'SYNC_ACK',
      aggregateId: 'sync-bus',
      source: 'Desktop',
      payload: {
        ackEventId: adviser.eventId,
        tradeId: 'trade-1',
        appliedAtUtc: '2026-07-14T10:01:05.000Z',
      },
      createdAtUtc: '2026-07-14T10:01:05.000Z',
    });
    expect(ack.aggregateType).toBe('SYNC');
  });

  it('rejects missing required payload fields', () => {
    expect(() =>
      createTradeEvent({
        eventType: 'TRADE_CREATED',
        aggregateId: 'trade-1',
        source: 'APK',
        payload: {
          symbol: 'BTCUSDT',
        } as unknown as TradeCreatedPayload,
        createdAtUtc: '2026-07-14T10:00:00.000Z',
      }),
    ).toThrow(TradeEventFactoryError);
  });

  it('rejects invalid UTC', () => {
    expect(() =>
      createTradeEvent({
        eventType: 'HEARTBEAT',
        aggregateId: 'sync-bus',
        source: 'APK',
        payload: { sentAtUtc: '2026-07-14 10:00:00' },
        createdAtUtc: '2026-07-14T10:00:00.000Z',
      }),
    ).toThrow(/ISO-8601/);
  });

  it('rejects empty aggregateId', () => {
    expect(() =>
      createTradeEvent({
        eventType: 'SL_REACHED',
        aggregateId: '  ',
        source: 'APK',
        payload: { price: 64000 },
        createdAtUtc: '2026-07-14T10:00:00.000Z',
      }),
    ).toThrow(/aggregateId/);
  });
});

describe('Task 12B.1 — Validator', () => {
  it('accepts factory-built events', () => {
    const event: TradeEvent = createTradeEvent({
      eventType: 'ORDER_FILLED',
      aggregateId: 'trade-1',
      source: 'APK',
      payload: {
        fillPrice: 65010,
        entryAdjusted: true,
        filledAtUtc: '2026-07-14T10:02:00.000Z',
      },
      createdAtUtc: '2026-07-14T10:02:00.000Z',
    });
    const result = validateTradeEvent(event);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.eventType).toBe('ORDER_FILLED');
    }
  });

  it('flags invalid type', () => {
    const result = validateTradeEvent({
      eventId: 'tev_x',
      eventVersion: 1,
      schemaVersion: '1.0.0',
      eventType: 'NOT_A_TYPE',
      aggregateId: 't1',
      aggregateType: 'TRADE',
      source: 'APK',
      createdAtUtc: '2026-07-14T10:00:00.000Z',
      producerVersion: 'x',
      payload: {},
      metadata: {},
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'INVALID_TYPE')).toBe(true);
  });

  it('flags missing payload', () => {
    const result = validateTradeEvent({
      eventId: 'tev_x',
      eventVersion: 1,
      schemaVersion: '1.0.0',
      eventType: 'TRADE_CLOSED',
      aggregateId: 't1',
      aggregateType: 'TRADE',
      source: 'APK',
      createdAtUtc: '2026-07-14T10:00:00.000Z',
      producerVersion: 'x',
      payload: null,
      metadata: {},
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_PAYLOAD')).toBe(true);
  });

  it('flags missing / invalid utc', () => {
    const missing = validateTradeEvent({
      eventId: 'tev_x',
      eventVersion: 1,
      schemaVersion: '1.0.0',
      eventType: 'POSITION_RUNNING',
      aggregateId: 't1',
      aggregateType: 'TRADE',
      source: 'APK',
      producerVersion: 'x',
      payload: { entryPrice: 1, stop: 1, tp1: 1 },
      metadata: {},
    });
    expect(missing.ok).toBe(false);
    expect(missing.issues.some((i) => i.code === 'MISSING_UTC')).toBe(true);

    const invalid = validateTradeEvent({
      eventId: 'tev_x',
      eventVersion: 1,
      schemaVersion: '1.0.0',
      eventType: 'POSITION_RUNNING',
      aggregateId: 't1',
      aggregateType: 'TRADE',
      source: 'APK',
      createdAtUtc: 'not-utc',
      producerVersion: 'x',
      payload: { entryPrice: 1, stop: 1, tp1: 1 },
      metadata: {},
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.issues.some((i) => i.code === 'INVALID_UTC')).toBe(true);
  });

  it('flags invalid version', () => {
    const result = validateTradeEvent({
      eventId: 'tev_x',
      eventVersion: 99,
      schemaVersion: '9.9.9',
      eventType: 'TRADE_CANCELLED',
      aggregateId: 't1',
      aggregateType: 'TRADE',
      source: 'Migration',
      createdAtUtc: '2026-07-14T10:00:00.000Z',
      producerVersion: 'x',
      payload: { exitReasonCode: 'PLAN_EXPIRED' },
      metadata: {},
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'INVALID_VERSION')).toBe(true);
  });

  it('detects duplicate eventId in batch', () => {
    const a = createTradeEvent({
      eventId: 'tev_dup',
      eventType: 'TP_REACHED',
      aggregateId: 'trade-1',
      source: 'APK',
      payload: { tpLevelCode: 'TP1', price: 66000 },
      createdAtUtc: '2026-07-14T10:03:00.000Z',
    });
    const b = createTradeEvent({
      eventId: 'tev_dup',
      eventType: 'PARTIAL_EXIT',
      aggregateId: 'trade-1',
      source: 'APK',
      payload: { percent: 30, price: 66000, reasonCode: 'PARTIAL_TP1' },
      createdAtUtc: '2026-07-14T10:03:01.000Z',
    });
    const batch = validateTradeEventBatch([a, b]);
    expect(batch.ok).toBe(false);
    expect(batch.duplicateIds).toEqual(['tev_dup']);
    expect(batch.results.every((r) => !r.ok)).toBe(true);
  });
});

describe('Task 12B.1 — Types (runtime exhaustiveness smoke)', () => {
  it('builds every event type without any payload', () => {
    const stamps = {
      createdAtUtc: '2026-07-14T12:00:00.000Z',
      aggregateId: 'trade-all',
      source: 'APK' as const,
    };

    const events: TradeEvent[] = [
      createTradeEvent({ ...stamps, eventType: 'TRADE_CREATED', payload: baseCreatedPayload }),
      createTradeEvent({
        ...stamps,
        eventType: 'ORDER_SUBMITTED',
        payload: { orderType: 'LIMIT', side: 'LONG', limitPrice: 64900 },
      }),
      createTradeEvent({
        ...stamps,
        eventType: 'ORDER_FILLED',
        payload: {
          fillPrice: 64950,
          entryAdjusted: false,
          filledAtUtc: '2026-07-14T12:00:01.000Z',
        },
      }),
      createTradeEvent({
        ...stamps,
        eventType: 'POSITION_RUNNING',
        payload: { entryPrice: 64950, stop: 64000, tp1: 66000 },
      }),
      createTradeEvent({
        ...stamps,
        eventType: 'STOP_MOVED',
        payload: { oldStop: 64000, newStop: 64950, advisorReasonCode: 'RR_1_REACHED' },
      }),
      createTradeEvent({
        ...stamps,
        eventType: 'PARTIAL_EXIT',
        payload: { percent: 30, price: 66000, reasonCode: 'PARTIAL_TP1' },
      }),
      createTradeEvent({
        ...stamps,
        eventType: 'TP_REACHED',
        payload: { tpLevelCode: 'TP1', price: 66000 },
      }),
      createTradeEvent({
        ...stamps,
        eventType: 'SL_REACHED',
        payload: { price: 64000 },
      }),
      createTradeEvent({
        ...stamps,
        eventType: 'ADVISER_UPDATED',
        payload: {
          advisorActionCode: 'CLOSE_NOW',
          advisorReasonCode: 'EXHAUSTION',
        },
      }),
      createTradeEvent({
        ...stamps,
        eventType: 'TRADE_CLOSED',
        payload: {
          exitReasonCode: 'MANUAL_CLOSE',
          exitPrice: 65500,
          pnlUsdt: 12.5,
          pnlPct: 1.2,
          advisorActionCodeAtExit: 'CLOSE_NOW',
        },
      }),
      createTradeEvent({
        ...stamps,
        eventType: 'TRADE_CANCELLED',
        payload: { exitReasonCode: 'LIMIT_NOT_FILLED' },
      }),
      createTradeEvent({
        ...stamps,
        aggregateId: 'sync-bus',
        source: 'Desktop',
        eventType: 'SYNC_ACK',
        payload: {
          ackEventId: 'tev_x',
          tradeId: 'trade-all',
          appliedAtUtc: '2026-07-14T12:00:02.000Z',
        },
      }),
      createTradeEvent({
        ...stamps,
        aggregateId: 'sync-bus',
        eventType: 'HEARTBEAT',
        payload: { sentAtUtc: '2026-07-14T12:00:03.000Z' },
      }),
    ];

    expect(events).toHaveLength(TRADE_EVENT_TYPES.length);
    expect(events.every((e) => validateTradeEvent(e).ok)).toBe(true);
  });
});
