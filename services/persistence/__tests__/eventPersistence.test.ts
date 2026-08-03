/**
 * Phase 13.1 — Event Persistence Foundation tests.
 */
import { describe, expect, it } from 'vitest';
import { createTradeEvent, type TradeEvent } from '../../events';
import {
  createFileEventPersistenceStub,
  createMemoryEventPersistence,
  createSqliteEventPersistenceStub,
  FileEventPersistenceNotImplementedError,
  MemoryEventPersistence,
  SqliteEventPersistenceNotImplementedError,
} from '../index';

function makeEvent(
  overrides: Partial<{
    eventId: string;
    aggregateId: string;
    idempotencyKey: string;
    createdAtUtc: string;
  }> = {},
): TradeEvent {
  return createTradeEvent({
    eventType: 'TRADE_CREATED',
    aggregateId: overrides.aggregateId ?? 'trade-p1',
    source: 'APK',
    eventId: overrides.eventId ?? `pev_${Math.random().toString(36).slice(2, 10)}`,
    idempotencyKey: overrides.idempotencyKey,
    createdAtUtc: overrides.createdAtUtc ?? '2026-07-14T18:00:00.000Z',
    payload: {
      symbol: 'BTCUSDT',
      side: 'LONG',
      strategyVersion: 'V4_1',
      triggerCode: 'TREND_REVERSAL',
      decisionCode: 'LONG',
      confidence: 0.5,
      entry: 65000,
      stop: 64000,
      tp1: 66000,
    },
  });
}

describe('Phase 13.1 — Append / Read', () => {
  it('appends and reads by eventId', async () => {
    const db = createMemoryEventPersistence();
    const event = makeEvent({ eventId: 'pev_1', idempotencyKey: 'k1' });
    const result = await db.append(event);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.stored.ackStatus).toBe('Pending');
    expect(result.stored.storeSequence).toBe(1);

    const read = await db.read('pev_1');
    expect(read?.event.eventId).toBe('pev_1');
    expect(Object.isFrozen(read?.event)).toBe(true);
  });

  it('rejects duplicate eventId and idempotency', async () => {
    const db = createMemoryEventPersistence();
    await db.append(makeEvent({ eventId: 'dup', idempotencyKey: 'same' }));

    const byId = await db.append(makeEvent({ eventId: 'dup', idempotencyKey: 'other' }));
    expect(byId.ok).toBe(false);
    if (!byId.ok) expect(byId.code).toBe('DUPLICATE_EVENT_ID');

    const byIdem = await db.append(
      makeEvent({ eventId: 'other', aggregateId: 'trade-p1', idempotencyKey: 'same' }),
    );
    expect(byIdem.ok).toBe(false);
    if (!byIdem.ok) expect(byIdem.code).toBe('DUPLICATE_IDEMPOTENCY');
  });
});

describe('Phase 13.1 — Batch', () => {
  it('appendBatch reduces to sequential appends', async () => {
    const db = createMemoryEventPersistence();
    const events = [
      makeEvent({ eventId: 'b1', idempotencyKey: 'b1', createdAtUtc: '2026-07-14T18:00:01.000Z' }),
      makeEvent({ eventId: 'b2', idempotencyKey: 'b2', createdAtUtc: '2026-07-14T18:00:02.000Z' }),
      makeEvent({ eventId: 'b3', idempotencyKey: 'b3', createdAtUtc: '2026-07-14T18:00:03.000Z' }),
    ];
    const results = await db.appendBatch(events);
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await db.readAll()).map((r) => r.storeSequence)).toEqual([1, 2, 3]);
  });
});

describe('Phase 13.1 — Aggregate', () => {
  it('readAggregate returns ordered events for one trade', async () => {
    const db = createMemoryEventPersistence();
    await db.append(makeEvent({ eventId: 'a1', aggregateId: 'T-A', idempotencyKey: 'a1' }));
    await db.append(makeEvent({ eventId: 'b1', aggregateId: 'T-B', idempotencyKey: 'b1' }));
    await db.append(
      createTradeEvent({
        eventType: 'ADVISER_UPDATED',
        aggregateId: 'T-A',
        source: 'APK',
        eventId: 'a2',
        idempotencyKey: 'a2',
        createdAtUtc: '2026-07-14T18:01:00.000Z',
        payload: {
          advisorActionCode: 'HOLD',
          advisorReasonCode: 'MOMENTUM_STRONG',
        },
      }),
    );

    const rows = await db.readAggregate('T-A');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.event.eventId)).toEqual(['a1', 'a2']);
  });
});

describe('Phase 13.1 — ACK', () => {
  it('ack updates metadata only (not event body)', async () => {
    const db = createMemoryEventPersistence({
      nowUtc: () => '2026-07-14T19:00:00.000Z',
    });
    await db.append(makeEvent({ eventId: 'ack1', idempotencyKey: 'ack1' }));
    const before = await db.read('ack1');

    const acked = await db.ack('ack1', { status: 'Acknowledged' });
    expect(acked.ok).toBe(true);
    if (!acked.ok) return;
    expect(acked.stored.ackStatus).toBe('Acknowledged');
    expect(acked.stored.acknowledgedAtUtc).toBe('2026-07-14T19:00:00.000Z');
    expect(acked.stored.event).toEqual(before?.event);

    const failed = await db.ack('ack1', { status: 'Failed', incrementRetry: true });
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.stored.retryCount).toBe(1);
    expect(failed.stored.ackStatus).toBe('Failed');
  });
});

describe('Phase 13.1 — Health / Flush', () => {
  it('health returns READY for memory', async () => {
    const db = createMemoryEventPersistence();
    await db.append(makeEvent({ eventId: 'h1', idempotencyKey: 'h1' }));
    const health = await db.health();
    expect(health.status).toBe('READY');
    expect(health.backend).toBe('MEMORY');
  });

  it('health READONLY blocks append', async () => {
    const db = new MemoryEventPersistence({ readOnly: true });
    const health = await db.health();
    expect(health.status).toBe('READONLY');

    const result = await db.append(makeEvent({ eventId: 'ro1' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('READONLY');
  });

  it('flush reports pending write count', async () => {
    const db = createMemoryEventPersistence();
    await db.appendBatch([
      makeEvent({ eventId: 'f1', idempotencyKey: 'f1' }),
      makeEvent({ eventId: 'f2', idempotencyKey: 'f2' }),
    ]);
    const flush1 = await db.flush();
    expect(flush1.ok).toBe(true);
    expect(flush1.flushedCount).toBe(2);

    const flush2 = await db.flush();
    expect(flush2.flushedCount).toBe(0);
  });
});

describe('Phase 13.1 — Stubs', () => {
  it('sqlite stub throws on write, health ERROR', async () => {
    const db = createSqliteEventPersistenceStub();
    await expect(db.append(makeEvent({ eventId: 's1' }))).rejects.toBeInstanceOf(
      SqliteEventPersistenceNotImplementedError,
    );
    const health = await db.health();
    expect(health.status).toBe('ERROR');
    expect(health.backend).toBe('SQLITE');
  });

  it('file stub throws on write, health ERROR', async () => {
    const db = createFileEventPersistenceStub();
    await expect(db.appendBatch([makeEvent({ eventId: 'file1' })])).rejects.toBeInstanceOf(
      FileEventPersistenceNotImplementedError,
    );
    const health = await db.health();
    expect(health.status).toBe('ERROR');
    expect(health.backend).toBe('FILE');
  });
});
