/**
 * Task 12B.5 — Flip Source of Truth tests.
 */
import { describe, expect, it } from 'vitest';
import { createTradeEvent, type TradeEvent } from '../../events';
import { createEventStore } from '../../eventStore';
import {
  projectFromStored,
  stableSerializeJournalEntry,
} from '../../projector';
import {
  DirectJournalWriteForbiddenError,
  RULE_29_PROJECTOR_TRANSLATE_ONLY,
  createFlippedTradingIntelligence,
  createInMemoryJournalViewWriter,
} from '../index';

const AGG = 'trade-flip-1';

function ev<T extends TradeEvent['eventType']>(
  eventType: T,
  payload: Extract<TradeEvent, { eventType: T }>['payload'],
  opts: { eventId: string; createdAtUtc: string; sequence?: number },
): TradeEvent {
  return createTradeEvent({
    eventType,
    aggregateId: AGG,
    source: 'APK',
    correlationId: 'corr-flip',
    eventId: opts.eventId,
    idempotencyKey: opts.eventId,
    createdAtUtc: opts.createdAtUtc,
    metadata: { sequence: opts.sequence },
    payload,
  }) as TradeEvent;
}

function closedLifecycle(): TradeEvent[] {
  return [
    ev(
      'TRADE_CREATED',
      {
        symbol: 'BTCUSDT',
        side: 'LONG',
        strategyVersion: 'V4_1',
        triggerCode: 'TREND_REVERSAL',
        decisionCode: 'LONG',
        confidence: 0.9,
        entry: 65000,
        stop: 64000,
        tp1: 66000,
      },
      { eventId: 'f1', createdAtUtc: '2026-07-14T15:00:00.000Z', sequence: 1 },
    ),
    ev(
      'ORDER_FILLED',
      {
        fillPrice: 65000,
        entryAdjusted: false,
        filledAtUtc: '2026-07-14T15:00:05.000Z',
      },
      { eventId: 'f2', createdAtUtc: '2026-07-14T15:00:05.000Z', sequence: 2 },
    ),
    ev(
      'POSITION_RUNNING',
      { entryPrice: 65000, stop: 64000, tp1: 66000 },
      { eventId: 'f3', createdAtUtc: '2026-07-14T15:00:06.000Z', sequence: 3 },
    ),
    ev(
      'TRADE_CLOSED',
      {
        exitReasonCode: 'TP1_HIT',
        exitPrice: 66000,
        pnlUsdt: 80,
        pnlPct: 4,
        advisorActionCodeAtExit: 'CLOSE_NOW',
      },
      { eventId: 'f4', createdAtUtc: '2026-07-14T16:00:00.000Z', sequence: 4 },
    ),
  ];
}

describe('Task 12B.5 — Flip', () => {
  it('commits only via Event Store → Projection (flipped flag)', async () => {
    const store = createEventStore();
    const journal = createInMemoryJournalViewWriter();
    const flip = createFlippedTradingIntelligence(store, {
      journalView: journal,
      nowUtc: () => '2026-07-14T17:00:00.000Z',
    });

    const result = await flip.commitEvent(closedLifecycle()[0]);
    expect(result.flipped).toBe(true);
    expect(result.status).toBe('OK');
    expect(store.size()).toBe(1);
    expect(flip.readJournal(AGG)?.symbol).toBe('BTCUSDT');
  });

  it('forbids direct Journal write path', () => {
    const flip = createFlippedTradingIntelligence(createEventStore());
    expect(() =>
      flip.forbidDirectJournalWrite({
        id: 'x',
      } as never),
    ).toThrow(DirectJournalWriteForbiddenError);
  });

  it('exports RULE #29 constant', () => {
    expect(RULE_29_PROJECTOR_TRANSLATE_ONLY).toBe(29);
  });
});

describe('Task 12B.5 — Projection Read', () => {
  it('reads Journal View from projection cache after commit', async () => {
    const store = createEventStore();
    const flip = createFlippedTradingIntelligence(store);
    await flip.commitEvent(closedLifecycle()[0]);

    const first = flip.reader.read(AGG);
    expect(first.source).toBe('cache');
    expect(first.entry?.id).toBe(AGG);

    flip.cache.clear();
    const second = flip.reader.read(AGG);
    expect(second.source).toBe('event_store');
    expect(second.entry?.id).toBe(AGG);
  });
});

describe('Task 12B.5 — Replay / Equality / Closed Trade', () => {
  it('closed trade Journal equals Project(Event Store)', async () => {
    const store = createEventStore();
    const journal = createInMemoryJournalViewWriter();
    const flip = createFlippedTradingIntelligence(store, { journalView: journal });

    for (const event of closedLifecycle()) {
      await flip.commitEvent(event);
    }

    const view = flip.readJournal(AGG)!;
    const projected = projectFromStored(store.readAggregate(AGG))!;
    expect(view.outcome.status).toBe('WIN');
    expect(stableSerializeJournalEntry(view)).toBe(
      stableSerializeJournalEntry(projected),
    );
    expect(flip.assertEquality(AGG)).toBe(true);
    expect(await journal.getById(AGG)).not.toBeNull();
  });

  it('replay same events keeps equality', async () => {
    const store = createEventStore();
    const flip = createFlippedTradingIntelligence(store);
    for (const event of closedLifecycle()) {
      await flip.commitEvent(event);
    }
    const a = stableSerializeJournalEntry(flip.readJournal(AGG)!);
    for (const event of closedLifecycle()) {
      await flip.commitEvent(event); // duplicates
    }
    const b = stableSerializeJournalEntry(flip.readJournal(AGG)!);
    expect(a).toBe(b);
    expect(store.size()).toBe(4);
  });
});

describe('Task 12B.5 — Cache Rebuild', () => {
  it('clears cache and rebuilds from Event Store', async () => {
    const store = createEventStore();
    const flip = createFlippedTradingIntelligence(store);
    for (const event of closedLifecycle()) {
      await flip.commitEvent(event);
    }
    expect(flip.cache.stats().size).toBe(1);
    flip.cache.clear();
    expect(flip.cache.stats().size).toBe(0);

    const n = flip.rebuildCache();
    expect(n).toBe(1);
    expect(flip.cache.stats().size).toBe(1);
    expect(flip.assertEquality(AGG)).toBe(true);
  });
});

describe('Task 12B.5 — Recovery', () => {
  it('recovers Journal View from Event Store after journal wipe', async () => {
    const store = createEventStore();
    const journal = createInMemoryJournalViewWriter();
    const flip = createFlippedTradingIntelligence(store, { journalView: journal });

    for (const event of closedLifecycle()) {
      await flip.commitEvent(event);
    }
    const before = stableSerializeJournalEntry((await journal.getById(AGG))!);

    journal.clear();
    flip.cache.clear();
    expect(await journal.getById(AGG)).toBeNull();

    const recovery = await flip.recoverJournalView();
    expect(recovery.rebuiltCount).toBe(1);
    expect(recovery.journalSynced).toBe(1);
    expect(stableSerializeJournalEntry((await journal.getById(AGG))!)).toBe(before);
  });
});

describe('Task 12B.5 — Restart', () => {
  it('simulateRestart rebuilds cache while Event Store intact', async () => {
    const store = createEventStore();
    const flip = createFlippedTradingIntelligence(store);
    for (const event of closedLifecycle()) {
      await flip.commitEvent(event);
    }
    const before = stableSerializeJournalEntry(flip.readJournal(AGG)!);
    expect(store.size()).toBe(4);

    const rebuilt = flip.simulateRestart();
    expect(rebuilt).toBe(1);
    expect(store.size()).toBe(4);
    expect(stableSerializeJournalEntry(flip.readJournal(AGG)!)).toBe(before);
  });
});
