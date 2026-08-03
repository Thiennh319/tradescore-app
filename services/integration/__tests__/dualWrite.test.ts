/**
 * Task 12B.4 — Dual Write Integration tests.
 */
import { describe, expect, it } from 'vitest';
import { createTradeEvent, type TradeEvent } from '../../events';
import { createEventStore } from '../../eventStore';
import {
  projectFromStored,
  stableSerializeJournalEntry,
} from '../../projector';
import {
  DualWriteCoordinator,
  createInMemoryJournalViewWriter,
  createJournalEventPublisher,
} from '../index';

const AGG = 'trade-dw-1';
const CORR = 'corr-dw-1';

function ev<T extends TradeEvent['eventType']>(
  eventType: T,
  payload: Extract<TradeEvent, { eventType: T }>['payload'],
  opts: {
    eventId: string;
    createdAtUtc: string;
    sequence?: number;
    idempotencyKey?: string;
  },
): TradeEvent {
  return createTradeEvent({
    eventType,
    aggregateId: AGG,
    source: 'APK',
    correlationId: CORR,
    eventId: opts.eventId,
    idempotencyKey: opts.idempotencyKey ?? opts.eventId,
    createdAtUtc: opts.createdAtUtc,
    metadata: { sequence: opts.sequence },
    payload,
  }) as TradeEvent;
}

function createdEvent(): TradeEvent {
  return ev(
    'TRADE_CREATED',
    {
      symbol: 'BTCUSDT',
      side: 'LONG',
      strategyVersion: 'V4_1',
      triggerCode: 'TREND_REVERSAL',
      decisionCode: 'LONG',
      confidence: 0.7,
      entry: 65000,
      stop: 64000,
      tp1: 66000,
    },
    { eventId: 'dw_e1', createdAtUtc: '2026-07-14T12:00:00.000Z', sequence: 1 },
  );
}

function closedLifecycle(): TradeEvent[] {
  return [
    createdEvent(),
    ev(
      'ORDER_FILLED',
      {
        fillPrice: 65010,
        entryAdjusted: false,
        filledAtUtc: '2026-07-14T12:00:10.000Z',
      },
      { eventId: 'dw_e2', createdAtUtc: '2026-07-14T12:00:10.000Z', sequence: 2 },
    ),
    ev(
      'POSITION_RUNNING',
      { entryPrice: 65010, stop: 64000, tp1: 66000 },
      { eventId: 'dw_e3', createdAtUtc: '2026-07-14T12:00:11.000Z', sequence: 3 },
    ),
    ev(
      'ADVISER_UPDATED',
      {
        advisorActionCode: 'HOLD',
        advisorReasonCode: 'MOMENTUM_STRONG',
      },
      { eventId: 'dw_e4', createdAtUtc: '2026-07-14T12:10:00.000Z', sequence: 4 },
    ),
    ev(
      'TRADE_CLOSED',
      {
        exitReasonCode: 'TP1_HIT',
        exitPrice: 66000,
        pnlUsdt: 50,
        pnlPct: 3,
        advisorActionCodeAtExit: 'CLOSE_NOW',
      },
      { eventId: 'dw_e5', createdAtUtc: '2026-07-14T13:00:00.000Z', sequence: 5 },
    ),
  ];
}

function setup() {
  const store = createEventStore();
  const journal = createInMemoryJournalViewWriter();
  const mismatches: unknown[] = [];
  const coordinator = new DualWriteCoordinator(store, journal, {
    nowUtc: () => '2026-07-14T14:00:00.000Z',
    onMismatch: (m) => mismatches.push(m),
  });
  const publisher = createJournalEventPublisher(coordinator);
  return { store, journal, coordinator, publisher, mismatches };
}

describe('Task 12B.4 — Dual Write', () => {
  it('writes Event Store then Journal View', async () => {
    const { store, journal, publisher } = setup();
    const result = await publisher.publish({ event: createdEvent() });

    expect(result.status).toBe('OK');
    expect(store.read('dw_e1')).not.toBeNull();
    expect(result.journalEntry?.id).toBe(AGG);
    expect(await journal.getById(AGG)).not.toBeNull();
    expect(result.projectionMeta?.eventCount).toBe(1);
    expect(result.projectionMeta?.lastEventId).toBe('dw_e1');
    expect(result.projectionMeta?.projectedAtUtc).toBe('2026-07-14T14:00:00.000Z');
  });
});

describe('Task 12B.4 — Event First', () => {
  it('does not write Journal when Event Store rejects invalid event', async () => {
    const { store, journal, coordinator } = setup();
    const bad = {
      ...createdEvent(),
      eventType: 'NOT_REAL' as never,
    };

    const result = await coordinator.writeEvent(bad as TradeEvent);
    expect(result.status).toBe('EVENT_STORE_REJECTED');
    expect(store.size()).toBe(0);
    expect(journal.all()).toHaveLength(0);
  });

  it('appends to Event Store before Journal upsert', async () => {
    const store = createEventStore();
    const order: string[] = [];
    const journal = {
      async upsert() {
        order.push('journal');
        // Event must already be in store
        expect(store.size()).toBeGreaterThan(0);
      },
      async getById(id: string) {
        return projectFromStored(store.readAggregate(id));
      },
    };
    const coordinator = new DualWriteCoordinator(store, journal, {
      nowUtc: () => '2026-07-14T14:00:00.000Z',
    });

    const originalAppend = store.append.bind(store);
    store.append = (event) => {
      order.push('store');
      return originalAppend(event);
    };

    await coordinator.writeEvent(createdEvent());
    expect(order).toEqual(['store', 'journal']);
  });
});

describe('Task 12B.4 — Journal Failure', () => {
  it('keeps Event Store when Journal write fails', async () => {
    const { store, journal, coordinator } = setup();
    journal.failNextUpsert('disk full');

    const result = await coordinator.writeEvent(createdEvent());
    expect(result.status).toBe('JOURNAL_WRITE_FAILED');
    expect(result.journalError).toContain('disk full');
    expect(store.read('dw_e1')).not.toBeNull();
    expect(store.size()).toBe(1);
    expect(journal.all()).toHaveLength(0);
  });
});

describe('Task 12B.4 — Projection Equality', () => {
  it('Project(Event Store) equals Journal after dual write', async () => {
    const { store, journal, publisher, mismatches } = setup();
    await publisher.publishAll(closedLifecycle());

    const projected = projectFromStored(store.readAggregate(AGG))!;
    const fromJournal = await journal.getById(AGG);
    expect(fromJournal).not.toBeNull();
    expect(stableSerializeJournalEntry(projected)).toBe(
      stableSerializeJournalEntry(fromJournal!),
    );
    expect(mismatches).toHaveLength(0);
  });
});

describe('Task 12B.4 — Duplicate Event', () => {
  it('duplicate idempotency does not double-append; journal stays consistent', async () => {
    const { store, journal, coordinator } = setup();
    const event = createdEvent();

    const first = await coordinator.writeEvent(event);
    expect(first.status).toBe('OK');
    expect(store.size()).toBe(1);

    const second = await coordinator.writeEvent(event);
    expect(second.status).toBe('DUPLICATE_APPLIED');
    expect(store.size()).toBe(1);

    const journalEntry = await journal.getById(AGG);
    expect(
      stableSerializeJournalEntry(projectFromStored(store.readAggregate(AGG))!),
    ).toBe(stableSerializeJournalEntry(journalEntry!));
  });
});

describe('Task 12B.4 — Closed Trade', () => {
  it('closed lifecycle lands WIN in Journal via Dual Write', async () => {
    const { journal, publisher, coordinator } = setup();
    const results = await publisher.publishAll(closedLifecycle());
    expect(results.every((r) => r.status === 'OK' || r.status === 'DUPLICATE_APPLIED')).toBe(
      true,
    );

    const entry = await journal.getById(AGG);
    expect(entry?.outcome.status).toBe('WIN');
    expect(entry?.outcome.exitReason).toBe('TP1_HIT');
    expect(entry?.tags).toContain('triggerCode:TREND_REVERSAL');

    const meta = coordinator.getProjectionMeta(AGG);
    expect(meta?.eventCount).toBe(5);
    expect(meta?.lastEventId).toBe('dw_e5');
    expect(meta?.lastSequence).toBe(5);
  });
});

describe('Task 12B.4 — Replay Equality', () => {
  it('re-sync from Event Store rebuilds identical Journal', async () => {
    const { store, journal, publisher, coordinator } = setup();
    await publisher.publishAll(closedLifecycle());
    const before = stableSerializeJournalEntry((await journal.getById(AGG))!);

    journal.clear();
    expect(await journal.getById(AGG)).toBeNull();

    // Event Store still full — replay sync
    const sync = await coordinator.syncAggregate(AGG, 'dw_e5');
    expect(sync.status).toBe('OK');
    expect(stableSerializeJournalEntry((await journal.getById(AGG))!)).toBe(before);

    const projected = projectFromStored(store.readAggregate(AGG))!;
    expect(stableSerializeJournalEntry(projected)).toBe(before);
  });
});
