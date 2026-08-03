/**
 * Task 12B.3 — Trade Projector tests.
 */
import { describe, expect, it } from 'vitest';
import { createTradeEvent, type TradeEvent } from '../../events';
import {
  project,
  projectTradeState,
  projectWithState,
  reduceTradeEvent,
  createEmptyProjectionState,
  stableSerializeJournalEntry,
  TRADE_PROJECTION_SCHEMA_VERSION,
  TRADE_PROJECTION_VERSION,
} from '../index';

const AGG = 'trade-proj-1';
const CORR = 'corr-proj-1';

function ev<T extends TradeEvent['eventType']>(
  eventType: T,
  payload: Extract<TradeEvent, { eventType: T }>['payload'],
  opts: {
    eventId: string;
    createdAtUtc: string;
    sequence?: number;
    idempotencyKey?: string;
    causationId?: string;
  },
): TradeEvent {
  return createTradeEvent({
    eventType,
    aggregateId: AGG,
    source: 'APK',
    correlationId: CORR,
    causationId: opts.causationId ?? '',
    eventId: opts.eventId,
    idempotencyKey: opts.idempotencyKey ?? opts.eventId,
    createdAtUtc: opts.createdAtUtc,
    metadata: {
      sequence: opts.sequence,
      featureSetVersion: 'fs-4.1.0',
      engineVersion: 'engine-4.1.0',
    },
    payload,
  }) as TradeEvent;
}

function lifecycleEvents(): TradeEvent[] {
  return [
    ev(
      'TRADE_CREATED',
      {
        symbol: 'BTCUSDT',
        side: 'LONG',
        strategyVersion: 'V4_1',
        triggerCode: 'TREND_REVERSAL',
        decisionCode: 'LONG',
        confidence: 0.81,
        entry: 65000,
        stop: 64000,
        tp1: 66000,
        tp2: 67000,
      },
      { eventId: 'e1', createdAtUtc: '2026-07-14T10:00:00.000Z', sequence: 1 },
    ),
    ev(
      'ORDER_SUBMITTED',
      { orderType: 'LIMIT', side: 'LONG', limitPrice: 64900, size: 100 },
      {
        eventId: 'e2',
        createdAtUtc: '2026-07-14T10:00:01.000Z',
        sequence: 2,
        causationId: 'e1',
      },
    ),
    ev(
      'ORDER_FILLED',
      {
        fillPrice: 64950,
        entryAdjusted: true,
        filledAtUtc: '2026-07-14T10:00:05.000Z',
      },
      {
        eventId: 'e3',
        createdAtUtc: '2026-07-14T10:00:05.000Z',
        sequence: 3,
        causationId: 'e2',
      },
    ),
    ev(
      'POSITION_RUNNING',
      { entryPrice: 64950, stop: 64000, tp1: 66000 },
      {
        eventId: 'e4',
        createdAtUtc: '2026-07-14T10:00:06.000Z',
        sequence: 4,
        causationId: 'e3',
      },
    ),
    ev(
      'ADVISER_UPDATED',
      {
        advisorActionCode: 'HOLD',
        advisorReasonCode: 'MOMENTUM_STRONG',
        advisorReasonLabel: 'Giữ lệnh',
      },
      { eventId: 'e5', createdAtUtc: '2026-07-14T10:10:00.000Z', sequence: 5 },
    ),
    ev(
      'STOP_MOVED',
      { oldStop: 64000, newStop: 64950, advisorReasonCode: 'RR_1_REACHED' },
      { eventId: 'e6', createdAtUtc: '2026-07-14T10:20:00.000Z', sequence: 6 },
    ),
    ev(
      'ADVISER_UPDATED',
      {
        advisorActionCode: 'PARTIAL_TP1',
        advisorReasonCode: 'TP1_REACHED',
      },
      { eventId: 'e7', createdAtUtc: '2026-07-14T10:30:00.000Z', sequence: 7 },
    ),
    ev(
      'TP_REACHED',
      { tpLevelCode: 'TP1', price: 66000 },
      { eventId: 'e8', createdAtUtc: '2026-07-14T10:30:01.000Z', sequence: 8 },
    ),
    ev(
      'PARTIAL_EXIT',
      { percent: 30, price: 66000, reasonCode: 'PARTIAL_TP1', realizedPnlUsdt: 15 },
      { eventId: 'e9', createdAtUtc: '2026-07-14T10:30:02.000Z', sequence: 9 },
    ),
    ev(
      'ADVISER_UPDATED',
      {
        advisorActionCode: 'CLOSE_NOW',
        advisorReasonCode: 'EXHAUSTION',
      },
      { eventId: 'e10', createdAtUtc: '2026-07-14T11:00:00.000Z', sequence: 10 },
    ),
    ev(
      'TRADE_CLOSED',
      {
        exitReasonCode: 'MANUAL_CLOSE',
        exitPrice: 65800,
        pnlUsdt: 42,
        pnlPct: 2.1,
        advisorActionCodeAtExit: 'CLOSE_NOW',
      },
      { eventId: 'e11', createdAtUtc: '2026-07-14T11:00:05.000Z', sequence: 11 },
    ),
  ];
}

describe('Task 12B.3 — Replay / Equality', () => {
  it('replay same events → identical AiTradeJournalEntry', () => {
    const events = lifecycleEvents();
    const a = project(events);
    const b = project(events);
    expect(a).not.toBeNull();
    expect(stableSerializeJournalEntry(a!)).toBe(stableSerializeJournalEntry(b!));
  });

  it('projection versions independent from event version', () => {
    expect(TRADE_PROJECTION_VERSION).toBe(1);
    expect(TRADE_PROJECTION_SCHEMA_VERSION).toBe('1.0.0');
    const state = projectTradeState(lifecycleEvents());
    expect(state.ai.projectionVersion).toBe(TRADE_PROJECTION_VERSION);
  });
});

describe('Task 12B.3 — Idempotent / Duplicate', () => {
  it('duplicate eventId does not double-apply', () => {
    const events = lifecycleEvents();
    const dup = events[4];
    const once = projectWithState(events)!;
    const twice = projectWithState([...events, dup])!;
    expect(twice.state.adviserTimeline).toHaveLength(
      once.state.adviserTimeline.length,
    );
    expect(stableSerializeJournalEntry(once.entry)).toBe(
      stableSerializeJournalEntry(twice.entry),
    );
  });

  it('reduce is idempotent for same event twice', () => {
    const created = lifecycleEvents()[0];
    let state = createEmptyProjectionState();
    state = reduceTradeEvent(state, created);
    const afterFirst = JSON.stringify(state);
    state = reduceTradeEvent(state, created);
    expect(JSON.stringify(state)).toBe(afterFirst);
  });
});

describe('Task 12B.3 — Out-of-order', () => {
  it('out-of-order input sorts deterministically to same projection', () => {
    const ordered = lifecycleEvents();
    const shuffled = [...ordered].reverse();
    const a = project(ordered)!;
    const b = project(shuffled)!;
    expect(stableSerializeJournalEntry(a)).toBe(stableSerializeJournalEntry(b));
  });
});

describe('Task 12B.3 — Closed / Cancelled', () => {
  it('projects closed trade WIN + exit codes', () => {
    const entry = project(lifecycleEvents())!;
    expect(entry.id).toBe(AGG);
    expect(entry.outcome.status).toBe('WIN');
    expect(entry.outcome.exitReason).toBe('MANUAL_CLOSE');
    expect(entry.outcome.pnlUSDT).toBe(42);
    expect(entry.plan.slActual).toBe(64950);
    expect(entry.partialCloses).toHaveLength(1);
    expect(entry.positionAdvisorActionAtExit).toBe('CLOSE_NOW');
  });

  it('projects cancelled trade', () => {
    const events: TradeEvent[] = [
      ev(
        'TRADE_CREATED',
        {
          symbol: 'ETHUSDT',
          side: 'SHORT',
          strategyVersion: 'V4',
          triggerCode: 'FAKE_BREAKOUT',
          decisionCode: 'SHORT',
          confidence: 0.5,
          entry: 3000,
          stop: 3100,
          tp1: 2800,
        },
        { eventId: 'c1', createdAtUtc: '2026-07-14T09:00:00.000Z', sequence: 1 },
      ),
      ev(
        'ORDER_SUBMITTED',
        { orderType: 'LIMIT', side: 'SHORT', limitPrice: 3010 },
        { eventId: 'c2', createdAtUtc: '2026-07-14T09:00:01.000Z', sequence: 2 },
      ),
      ev(
        'TRADE_CANCELLED',
        { exitReasonCode: 'LIMIT_NOT_FILLED' },
        { eventId: 'c3', createdAtUtc: '2026-07-14T09:30:00.000Z', sequence: 3 },
      ),
    ];
    // override aggregate for this test via creating with different AGG - wait, ev uses AGG constant
    const entry = project(events)!;
    expect(entry.outcome.status).toBe('CANCELLED');
    expect(entry.outcome.exitReason).toBe('LIMIT_NOT_FILLED');
  });

  it('ignores business events after seal', () => {
    const events = [
      ...lifecycleEvents(),
      ev(
        'STOP_MOVED',
        { oldStop: 1, newStop: 2 },
        { eventId: 'late', createdAtUtc: '2026-07-14T12:00:00.000Z', sequence: 99 },
      ),
    ];
    const entry = project(events)!;
    expect(entry.plan.slActual).toBe(64950);
  });
});

describe('Task 12B.3 — Advisor Timeline / Machine Codes', () => {
  it('builds adviser timeline in projection state', () => {
    const result = projectWithState(lifecycleEvents())!;
    expect(result.state.adviserTimeline).toHaveLength(3);
    expect(result.state.adviserTimeline.map((s) => s.advisorActionCode)).toEqual([
      'HOLD',
      'PARTIAL_TP1',
      'CLOSE_NOW',
    ]);
  });

  it('encodes machine codes into journal tags without schema change', () => {
    const entry = project(lifecycleEvents())!;
    expect(entry.tags).toContain('triggerCode:TREND_REVERSAL');
    expect(entry.tags).toContain('decisionCode:LONG');
    expect(entry.tags).toContain('strategyVersion:V4_1');
    expect(entry.tags.some((t) => t.startsWith('adviser:1:HOLD:'))).toBe(true);
    expect(entry.scoring.decision).toBe('LONG');
    expect(entry.strategySource).toBe('V4');
  });

  it('ignores SYNC_ACK and HEARTBEAT', () => {
    const base = lifecycleEvents().slice(0, 4);
    const withNoise: TradeEvent[] = [
      ...base,
      createTradeEvent({
        eventType: 'HEARTBEAT',
        aggregateId: 'sync',
        source: 'APK',
        eventId: 'hb1',
        createdAtUtc: '2026-07-14T10:00:07.000Z',
        payload: { sentAtUtc: '2026-07-14T10:00:07.000Z' },
      }),
      createTradeEvent({
        eventType: 'SYNC_ACK',
        aggregateId: 'sync',
        source: 'Desktop',
        eventId: 'ack1',
        createdAtUtc: '2026-07-14T10:00:08.000Z',
        payload: {
          ackEventId: 'e4',
          tradeId: AGG,
          appliedAtUtc: '2026-07-14T10:00:08.000Z',
        },
      }),
    ];
    expect(stableSerializeJournalEntry(project(base)!)).toBe(
      stableSerializeJournalEntry(project(withNoise)!),
    );
  });
});

describe('Task 12B.3 — Guardrails', () => {
  it('returns null without TRADE_CREATED', () => {
    expect(project([])).toBeNull();
    const hb = createTradeEvent({
      eventType: 'HEARTBEAT',
      aggregateId: 'sync',
      source: 'APK',
      eventId: 'hb-only',
      createdAtUtc: '2026-07-14T10:00:00.000Z',
      payload: { sentAtUtc: '2026-07-14T10:00:00.000Z' },
    });
    expect(project([hb])).toBeNull();
  });

  it('does not import engine / journal write paths', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '..');
    const files = [
      'tradeProjector.ts',
      'tradeProjectionReducer.ts',
      'tradeProjectionState.ts',
    ];
    for (const f of files) {
      const raw = readFileSync(join(dir, f), 'utf8');
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(
        /from ['"].*positionAdvisorV41|from ['"].*planTrade|computeDecision|from ['"].*binance/i,
      );
      expect(code).not.toMatch(/useTradeStore|addTradeEntry/);
    }
  });
});
