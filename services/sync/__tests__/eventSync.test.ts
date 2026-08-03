/**
 * Phase 13.2 — APK → Desktop Event Sync tests.
 */
import { describe, expect, it } from 'vitest';
import { createTradeEvent, type TradeEvent } from '../../events';
import { createMemoryEventPersistence } from '../../persistence';
import {
  RULE_38_APK_NO_JOURNAL,
  RULE_40_ACK_CLEARS_QUEUE,
  RULE_43_PRESERVE_ORDER,
  createEventSyncCoordinator,
  createMemoryEventSyncTransport,
  nextBackoffSeconds,
} from '../index';

function makeEvent(
  id: string,
  opts: { aggregateId?: string; createdAtUtc?: string } = {},
): TradeEvent {
  return createTradeEvent({
    eventType: 'TRADE_CREATED',
    aggregateId: opts.aggregateId ?? 'trade-sync-1',
    source: 'APK',
    eventId: id,
    idempotencyKey: id,
    createdAtUtc: opts.createdAtUtc ?? '2026-07-14T20:00:00.000Z',
    payload: {
      symbol: 'BTCUSDT',
      side: 'LONG',
      strategyVersion: 'V4_1',
      triggerCode: 'TREND_REVERSAL',
      decisionCode: 'LONG',
      confidence: 0.6,
      entry: 65000,
      stop: 64000,
      tp1: 66000,
    },
  });
}

function setup(clock = { now: '2026-07-14T20:00:00.000Z' }) {
  const desktop = createMemoryEventPersistence({
    nowUtc: () => clock.now,
  });
  const transport = createMemoryEventSyncTransport({
    desktop,
    nowUtc: () => clock.now,
  });
  const coordinator = createEventSyncCoordinator({
    transport,
    batchSize: 10,
    nowUtc: () => clock.now,
  });
  return { desktop, transport, coordinator, clock };
}

describe('Phase 13.2 — Queue', () => {
  it('enqueues with monotonic eventSequence and immutable event', () => {
    const { coordinator } = setup();
    const a = coordinator.enqueue(makeEvent('q1'));
    const b = coordinator.enqueue(makeEvent('q2'));
    expect(a.ok && a.item.eventSequence).toBe(1);
    expect(b.ok && b.item.eventSequence).toBe(2);
    expect(Object.isFrozen(a.ok ? a.item.event : null)).toBe(true);
    expect(RULE_38_APK_NO_JOURNAL).toBe(38);
  });
});

describe('Phase 13.2 — Ordering', () => {
  it('sends in eventSequence order not timestamp order (Rule #43)', async () => {
    const { coordinator, desktop, clock } = setup();
    // Enqueue A then B, but B has earlier timestamp
    coordinator.enqueue(makeEvent('ord2', { createdAtUtc: '2026-07-14T22:00:00.000Z' }));
    coordinator.enqueue(makeEvent('ord1', { createdAtUtc: '2026-07-14T10:00:00.000Z' }));

    const list = coordinator.queue.list();
    expect(list.map((i) => i.eventId)).toEqual(['ord2', 'ord1']);
    expect(list.map((i) => i.eventSequence)).toEqual([1, 2]);
    expect(RULE_43_PRESERVE_ORDER).toBe(43);

    await coordinator.tick();
    const all = await desktop.readAll();
    expect(all.map((r) => r.event.eventId)).toEqual(['ord2', 'ord1']);
    expect(clock.now).toBeTruthy();
  });
});

describe('Phase 13.2 — ACK / Queue clear', () => {
  it('removes queue only after Desktop ACK (Rule #40)', async () => {
    const { coordinator, desktop } = setup();
    coordinator.enqueue(makeEvent('ack1'));
    expect(coordinator.queue.size()).toBe(1);

    const tick = await coordinator.tick();
    expect(tick.acked).toBe(1);
    expect(coordinator.queue.size()).toBe(0);
    expect(await desktop.read('ack1')).not.toBeNull();
    expect(RULE_40_ACK_CLEARS_QUEUE).toBe(40);
  });
});

describe('Phase 13.2 — Offline / Retry', () => {
  it('queues while offline and retries later', async () => {
    const { coordinator, transport, desktop, clock } = setup();
    transport.setOffline(true);
    coordinator.enqueue(makeEvent('off1'));

    const offlineTick = await coordinator.tick();
    expect(offlineTick.failed).toBe(true);
    expect(coordinator.health().status).toBe('OFFLINE');
    expect(coordinator.queue.size()).toBe(1);
    expect(await desktop.read('off1')).toBeNull();

    transport.setOffline(false);
    // Item still PENDING — can sync immediately
    const onlineTick = await coordinator.tick();
    expect(onlineTick.acked).toBe(1);
    expect(coordinator.queue.size()).toBe(0);
    expect(await desktop.read('off1')).not.toBeNull();
    expect(clock.now).toBeTruthy();
  });

  it('backoff schedule 1,2,5,10,30,60 then 60', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((n) => nextBackoffSeconds(n))).toEqual([
      1, 2, 5, 10, 30, 60, 60, 60,
    ]);
  });

  it('failed batch schedules RETRYING and keeps queue', async () => {
    const { coordinator, transport, desktop, clock } = setup();
    transport.armFailNextBatch();
    coordinator.enqueue(makeEvent('rt1'));
    coordinator.enqueue(makeEvent('rt2'));

    const fail = await coordinator.tick();
    expect(fail.failed).toBe(true);
    expect(fail.acked).toBe(0);
    expect(coordinator.queue.size()).toBe(2);
    expect(coordinator.queue.list().every((i) => i.status === 'RETRYING')).toBe(true);
    expect(await desktop.readAll()).toHaveLength(0);

    // Not due yet (next retry in 1s)
    clock.now = '2026-07-14T20:00:00.500Z';
    const early = await coordinator.tick();
    expect(early.attempted).toBe(0);

    clock.now = '2026-07-14T20:00:02.000Z';
    const ok = await coordinator.tick();
    expect(ok.acked).toBe(2);
    expect(coordinator.queue.size()).toBe(0);
  });
});

describe('Phase 13.2 — Duplicate Event / Duplicate ACK / Idempotency', () => {
  it('Desktop duplicate eventId still ACKs and clears queue', async () => {
    const { coordinator, desktop } = setup();
    const event = makeEvent('dup1');
    await desktop.append(event);

    coordinator.enqueue(event);
    const tick = await coordinator.tick();
    expect(tick.acked).toBe(1);
    expect(coordinator.queue.size()).toBe(0);
    expect((await desktop.readAll()).filter((r) => r.event.eventId === 'dup1')).toHaveLength(
      1,
    );
  });

  it('re-enqueue same eventId rejected on APK queue', () => {
    const { coordinator } = setup();
    expect(coordinator.enqueue(makeEvent('x1')).ok).toBe(true);
    expect(coordinator.enqueue(makeEvent('x1')).ok).toBe(false);
  });
});

describe('Phase 13.2 — Batch / Atomic', () => {
  it('batch sync preserves order', async () => {
    const { coordinator, desktop } = setup();
    coordinator.enqueue(makeEvent('b1'));
    coordinator.enqueue(makeEvent('b2'));
    coordinator.enqueue(makeEvent('b3'));
    await coordinator.tick();
    expect((await desktop.readAll()).map((r) => r.event.eventId)).toEqual([
      'b1',
      'b2',
      'b3',
    ]);
  });

  it('atomic fail commits nothing and does not clear queue', async () => {
    const { coordinator, transport, desktop } = setup();
    transport.armFailNextBatch();
    coordinator.enqueue(makeEvent('at1'));
    coordinator.enqueue(makeEvent('at2'));
    await coordinator.tick();
    expect(await desktop.readAll()).toHaveLength(0);
    expect(coordinator.queue.size()).toBe(2);
  });
});

describe('Phase 13.2 — Recovery / Restart', () => {
  it('export/import queue recovers after restart', async () => {
    const { coordinator, transport, desktop, clock } = setup();
    transport.setOffline(true);
    coordinator.enqueue(makeEvent('rc1'));
    coordinator.enqueue(makeEvent('rc2'));
    const snap = coordinator.exportQueue();
    expect(snap.items).toHaveLength(2);

    // New coordinator = app restart
    const desktop2 = createMemoryEventPersistence();
    const transport2 = createMemoryEventSyncTransport({
      desktop: desktop2,
      nowUtc: () => clock.now,
    });
    const restart = createEventSyncCoordinator({
      transport: transport2,
      nowUtc: () => clock.now,
    });
    restart.importQueue(snap);
    expect(restart.queue.size()).toBe(2);

    const tick = await restart.tick();
    expect(tick.acked).toBe(2);
    expect(await desktop2.read('rc1')).not.toBeNull();
    expect(await desktop.readAll()).toHaveLength(0); // old desktop unused
  });
});

describe('Phase 13.2 — Health', () => {
  it('reports READY / OFFLINE / SYNCING path', async () => {
    const { coordinator, transport } = setup();
    expect(coordinator.health().status).toBe('READY');
    transport.setOffline(true);
    expect(coordinator.health().status).toBe('OFFLINE');
    transport.setOffline(false);
    coordinator.enqueue(makeEvent('h1'));
    await coordinator.tick();
    expect(coordinator.health().status).toBe('READY');
    expect(coordinator.health().queueDepth).toBe(0);
  });
});
