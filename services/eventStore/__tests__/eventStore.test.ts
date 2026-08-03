/**
 * Task 12B.2 — Event Store Foundation tests.
 */
import { describe, expect, it } from 'vitest';
import { createTradeEvent, type TradeCreatedPayload, type TradeEvent } from '../../events';
import {
  createEventStore,
  eventStorePersistenceStub,
  eventStoreSnapshotStub,
  EventStorePersistenceNotImplementedError,
  EventStoreSnapshotNotImplementedError,
} from '../index';

const createdPayload: TradeCreatedPayload = {
  symbol: 'BTCUSDT',
  side: 'LONG',
  strategyVersion: 'V4_1',
  triggerCode: 'TREND_REVERSAL',
  decisionCode: 'LONG',
  confidence: 0.8,
  entry: 65000,
  stop: 64000,
  tp1: 66000,
};

function makeCreated(
  overrides: Partial<{
    eventId: string;
    aggregateId: string;
    correlationId: string;
    causationId: string;
    idempotencyKey: string;
    createdAtUtc: string;
    sequence: number;
  }> = {},
): TradeEvent {
  return createTradeEvent({
    eventType: 'TRADE_CREATED',
    aggregateId: overrides.aggregateId ?? 'trade-1',
    source: 'APK',
    eventId: overrides.eventId,
    correlationId: overrides.correlationId,
    causationId: overrides.causationId,
    idempotencyKey: overrides.idempotencyKey,
    createdAtUtc: overrides.createdAtUtc ?? '2026-07-14T10:00:00.000Z',
    metadata: { sequence: overrides.sequence ?? 1 },
    payload: createdPayload,
  });
}

describe('Task 12B.2 — Append / Read', () => {
  it('appends and reads by eventId', () => {
    const store = createEventStore();
    const event = makeCreated({ eventId: 'tev_a1', idempotencyKey: 'create-1' });
    const result = store.append(event);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.stored.storeSequence).toBe(1);
    expect(result.stored.ackStatus).toBe('Pending');
    expect(result.stored.retryCount).toBe(0);

    const read = store.read('tev_a1');
    expect(read?.event.eventId).toBe('tev_a1');
    expect(read?.event.correlationId).toBeTruthy();
    expect(read?.event.idempotencyKey).toBe('create-1');
  });

  it('readAll preserves append order (sequence)', () => {
    const store = createEventStore();
    store.append(makeCreated({ eventId: 'tev_1', idempotencyKey: 'k1', createdAtUtc: '2026-07-14T10:00:01.000Z' }));
    store.append(
      createTradeEvent({
        eventType: 'ORDER_SUBMITTED',
        aggregateId: 'trade-1',
        source: 'APK',
        eventId: 'tev_2',
        correlationId: 'corr-1',
        causationId: 'tev_1',
        idempotencyKey: 'k2',
        createdAtUtc: '2026-07-14T10:00:02.000Z',
        payload: { orderType: 'LIMIT', side: 'LONG', limitPrice: 64900 },
      }),
    );
    const all = store.readAll();
    expect(all.map((r) => r.storeSequence)).toEqual([1, 2]);
    expect(all.map((r) => r.event.eventType)).toEqual([
      'TRADE_CREATED',
      'ORDER_SUBMITTED',
    ]);
  });
});

describe('Task 12B.2 — Aggregate / Correlation', () => {
  it('readAggregate returns events for one trade ordered by sequence', () => {
    const store = createEventStore();
    store.append(makeCreated({ eventId: 'tev_t1', aggregateId: 'trade-A', idempotencyKey: 'a1' }));
    store.append(makeCreated({ eventId: 'tev_t2', aggregateId: 'trade-B', idempotencyKey: 'b1' }));
    store.append(
      createTradeEvent({
        eventType: 'ADVISER_UPDATED',
        aggregateId: 'trade-A',
        source: 'APK',
        eventId: 'tev_t3',
        idempotencyKey: 'a2',
        createdAtUtc: '2026-07-14T10:01:00.000Z',
        payload: {
          advisorActionCode: 'HOLD',
          advisorReasonCode: 'MOMENTUM_STRONG',
        },
      }),
    );

    const rows = store.readAggregate('trade-A');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.event.eventId)).toEqual(['tev_t1', 'tev_t3']);
  });

  it('readByCorrelation groups a flow', () => {
    const store = createEventStore();
    const corr = 'corr-flow-9';
    store.append(
      makeCreated({
        eventId: 'tev_c1',
        correlationId: corr,
        idempotencyKey: 'c1',
      }),
    );
    store.append(
      createTradeEvent({
        eventType: 'ORDER_FILLED',
        aggregateId: 'trade-1',
        source: 'APK',
        eventId: 'tev_c2',
        correlationId: corr,
        causationId: 'tev_c1',
        idempotencyKey: 'c2',
        createdAtUtc: '2026-07-14T10:02:00.000Z',
        payload: {
          fillPrice: 65000,
          entryAdjusted: false,
          filledAtUtc: '2026-07-14T10:02:00.000Z',
        },
      }),
    );
    store.append(
      makeCreated({
        eventId: 'tev_other',
        aggregateId: 'trade-2',
        correlationId: 'other',
        idempotencyKey: 'o1',
      }),
    );

    const flow = store.readByCorrelation(corr);
    expect(flow).toHaveLength(2);
    expect(flow.every((r) => r.event.correlationId === corr)).toBe(true);
  });
});

describe('Task 12B.2 — Duplicate / Idempotency', () => {
  it('rejects duplicate eventId', () => {
    const store = createEventStore();
    expect(store.append(makeCreated({ eventId: 'tev_dup', idempotencyKey: 'i1' })).ok).toBe(
      true,
    );
    const again = store.append(
      makeCreated({ eventId: 'tev_dup', idempotencyKey: 'i2' }),
    );
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.code).toBe('DUPLICATE_EVENT_ID');
    }
  });

  it('rejects duplicate (eventType + aggregateId + idempotencyKey)', () => {
    const store = createEventStore();
    expect(
      store.append(
        makeCreated({
          eventId: 'tev_1',
          aggregateId: 'trade-1',
          idempotencyKey: 'same-key',
        }),
      ).ok,
    ).toBe(true);

    const dup = store.append(
      makeCreated({
        eventId: 'tev_2',
        aggregateId: 'trade-1',
        idempotencyKey: 'same-key',
      }),
    );
    expect(dup.ok).toBe(false);
    if (!dup.ok) {
      expect(dup.code).toBe('DUPLICATE_IDEMPOTENCY');
      expect(dup.existingEventId).toBe('tev_1');
    }
    expect(store.size()).toBe(1);
  });
});

describe('Task 12B.2 — ACK / Retry metadata', () => {
  it('acknowledge sets Acknowledged without rewriting event payload', () => {
    const store = createEventStore();
    store.append(makeCreated({ eventId: 'tev_ack', idempotencyKey: 'ack-1' }));
    const before = store.read('tev_ack');
    const ack = store.acknowledge('tev_ack', 'Acknowledged');
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;

    expect(ack.stored.ackStatus).toBe('Acknowledged');
    expect(ack.stored.acknowledgedAtUtc).toMatch(/Z$/);
    expect(ack.stored.event.payload).toEqual(before?.event.payload);
    expect(ack.stored.event.eventId).toBe('tev_ack');
  });

  it('Failed + incrementRetry updates retryCount only', () => {
    const store = createEventStore();
    store.append(makeCreated({ eventId: 'tev_retry', idempotencyKey: 'r1' }));
    store.acknowledge('tev_retry', 'Failed', { incrementRetry: true });
    store.acknowledge('tev_retry', 'Failed', { incrementRetry: true });
    const row = store.read('tev_retry');
    expect(row?.ackStatus).toBe('Failed');
    expect(row?.retryCount).toBe(2);
  });

  it('acknowledge missing event returns NOT_FOUND', () => {
    const store = createEventStore();
    const result = store.acknowledge('missing');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });
});

describe('Task 12B.2 — Immutable', () => {
  it('mutating returned event does not change store', () => {
    const store = createEventStore();
    store.append(makeCreated({ eventId: 'tev_imm', idempotencyKey: 'imm-1' }));
    const read = store.read('tev_imm');
    expect(read).not.toBeNull();
    if (!read) return;

    expect(() => {
      (read.event as { symbol?: string }).eventId = 'hacked';
    }).toThrow();

    const again = store.read('tev_imm');
    expect(again?.event.eventId).toBe('tev_imm');
  });

  it('does not support update/delete APIs on IEventStore', () => {
    const store = createEventStore();
    expect('update' in store).toBe(false);
    expect('delete' in store).toBe(false);
    expect('rewrite' in store).toBe(false);
  });
});

describe('Task 12B.2 — Stubs', () => {
  it('snapshot stub throws', async () => {
    await expect(eventStoreSnapshotStub.saveSnapshot({
      aggregateId: 't1',
      lastStoreSequence: 1,
      takenAtUtc: '2026-07-14T10:00:00.000Z',
      state: {},
    })).rejects.toBeInstanceOf(EventStoreSnapshotNotImplementedError);
  });

  it('persistence stub throws', async () => {
    await expect(
      eventStorePersistenceStub.append({
        storeSequence: 1,
        event: makeCreated({ eventId: 'tev_p' }),
        ackStatus: 'Pending',
        retryCount: 0,
      }),
    ).rejects.toBeInstanceOf(EventStorePersistenceNotImplementedError);
  });
});
