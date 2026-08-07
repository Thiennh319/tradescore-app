import { describe, expect, it, vi } from 'vitest';
import { createNeutralSnapshot } from '../marketIntelligenceLayer';
import { NEUTRAL_PROTECTION } from '../protectionLayer';
import {
  mapAdvisorReasonCode,
  toAdvisorUpdatedAtUtc,
} from '../rc3/adviserMetadata';
import {
  buildTradeSessionAdviserPatches,
  buildTradeSessionAdvisorViewModel,
  isV41SessionEntryFilled,
} from '../rc3/buildTradeSessionAdviser';
import type { V41TradeSession } from '../rc3/rc3ViewModelTypes';
import type { SignalRowV41 } from '../scanV41';

vi.mock('../positionAdvisorV41', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../positionAdvisorV41')>();
  return {
    ...actual,
    evaluatePositionV41: vi.fn(() => ({
      action: 'HOLD',
      label: 'Giữ lệnh — xu hướng còn mạnh',
      urgency: 'LOW',
      breakEvenSuggested: false,
      breakEvenPrice: null,
      trailingStopSuggested: false,
      trailingStopPrice: null,
      reason: 'trend still strong',
    })),
  };
});

import { evaluatePositionV41 } from '../positionAdvisorV41';

const mockEvaluate = vi.mocked(evaluatePositionV41);

function baseSession(overrides: Partial<V41TradeSession> = {}): V41TradeSession {
  const advisorUpdatedAt = toAdvisorUpdatedAtUtc(Date.now());
  return {
    id: 's1',
    symbol: 'BTCUSDT',
    displayName: 'BTC',
    action: 'LONG',
    status: 'Pending',
    entry: 65000,
    current: 65000,
    pnl: null,
    advisor: 'Waiting Fill',
    advisorActionCode: 'WAITING_FILL',
    advisorReason: 'Chờ khớp lệnh',
    advisorReasonCode: 'WAITING_FILL',
    advisorUpdatedAt,
    advisorSequence: 1,
    advisorHistory: [
      {
        sequence: 1,
        advisorActionCode: 'WAITING_FILL',
        advisor: 'Waiting Fill',
        advisorReason: 'Chờ khớp lệnh',
        advisorReasonCode: 'WAITING_FILL',
        advisorUpdatedAt,
      },
    ],
    stop: 64000,
    tp: 66000,
    tp2: 67000,
    tp3: 68000,
    openedAt: Date.now(),
    triggerType: 'Trend Reversal',
    ...overrides,
  };
}

function baseRow(overrides: Partial<SignalRowV41> = {}): SignalRowV41 {
  return {
    symbol: 'BTCUSDT',
    snapshot: createNeutralSnapshot(),
    visibilityMode: 'INACTIVE',
    protection: NEUTRAL_PROTECTION,
    markPrice: 65100,
    fetchedAt: Date.now(),
    ...overrides,
  };
}

describe('isV41SessionEntryFilled — limit touch', () => {
  it('LONG fills only when mark <= entry', () => {
    expect(isV41SessionEntryFilled('LONG', 64999, 65000)).toBe(true);
    expect(isV41SessionEntryFilled('LONG', 65000, 65000)).toBe(true);
    expect(isV41SessionEntryFilled('LONG', 65001, 65000)).toBe(false);
  });

  it('SHORT fills only when mark >= entry', () => {
    expect(isV41SessionEntryFilled('SHORT', 1.665, 1.665)).toBe(true);
    expect(isV41SessionEntryFilled('SHORT', 1.67, 1.665)).toBe(true);
    expect(isV41SessionEntryFilled('SHORT', 1.642, 1.665)).toBe(false);
  });
});

describe('Task 11 — Trade Session Position Adviser wire', () => {
  it('Pending → Waiting Fill and does not call evaluatePositionV41', () => {
    mockEvaluate.mockClear();
    const advice = buildTradeSessionAdvisorViewModel({
      session: baseSession({ status: 'Pending' }),
      row: baseRow(),
      updatedAt: 1,
    });
    expect(advice.state).toBe('Waiting Fill');
    expect(advice.advisorActionCode).toBe('WAITING_FILL');
    expect(advice.advisorReasonCode).toBe('WAITING_FILL');
    expect(advice.reason).toBe('Chờ khớp lệnh');
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('Running → calls evaluatePositionV41 and maps Hold', () => {
    mockEvaluate.mockClear();
    const advice = buildTradeSessionAdvisorViewModel({
      session: baseSession({ status: 'Running', advisorActionCode: 'HOLD' }),
      row: baseRow(),
      updatedAt: 2,
    });
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
    expect(advice.state).toBe('Hold');
    expect(advice.advisorActionCode).toBe('HOLD');
    expect(advice.advisorReasonCode).toBe('MOMENTUM_STRONG');
    expect(advice.reason).toContain('Giữ lệnh');
  });

  it('patches keep Pending/Waiting Fill when mark exists but has not touched entry', () => {
    mockEvaluate.mockClear();
    // LONG limit 65000 — mark 65100 chưa chạm (cần mark <= entry)
    const patches = buildTradeSessionAdviserPatches(
      [baseSession({ status: 'Pending', entry: 65000 })],
      [baseRow({ markPrice: 65100 })],
      100,
    );
    expect(patches).toHaveLength(1);
    expect(patches[0].status).toBe('Pending');
    expect(patches[0].advisor).toBe('Waiting Fill');
    expect(patches[0].advisorActionCode).toBe('WAITING_FILL');
    expect(patches[0].current).toBe(65100);
    expect(patches[0].pnl).toBeNull();
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('patches promote Pending→Running when mark touches entry then advise', () => {
    mockEvaluate.mockClear();
    // LONG: mark 64950 <= entry 65000 → filled
    const patches = buildTradeSessionAdviserPatches(
      [baseSession({ status: 'Pending', entry: 65000 })],
      [baseRow({ markPrice: 64950 })],
      100,
    );
    expect(patches).toHaveLength(1);
    expect(patches[0].status).toBe('Running');
    expect(patches[0].advisor).toBe('Hold');
    expect(patches[0].advisorActionCode).toBe('HOLD');
    expect(patches[0].current).toBe(64950);
    expect(patches[0].advisorUpdatedAt).toBe(toAdvisorUpdatedAtUtc(100));
    expect(mockEvaluate).toHaveBeenCalled();
  });

  it('NEAR SHORT breakout: stay Waiting Fill while mark is below entry (not yet touched)', () => {
    mockEvaluate.mockClear();
    const patches = buildTradeSessionAdviserPatches(
      [
        baseSession({
          symbol: 'NEARUSDT',
          displayName: 'NEAR',
          action: 'SHORT',
          status: 'Pending',
          entry: 1.665,
          current: 1.665,
          stop: 1.7,
          tp: 1.6,
          triggerType: 'Breakout Confirmed',
        }),
      ],
      [baseRow({ symbol: 'NEARUSDT', markPrice: 1.642 })],
      100,
    );
    expect(patches[0].status).toBe('Pending');
    expect(patches[0].advisor).toBe('Waiting Fill');
    expect(patches[0].pnl).toBeNull();
    expect(patches[0].current).toBe(1.642);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('NEAR SHORT breakout: promote Running only when mark >= entry', () => {
    mockEvaluate.mockClear();
    const patches = buildTradeSessionAdviserPatches(
      [
        baseSession({
          symbol: 'NEARUSDT',
          displayName: 'NEAR',
          action: 'SHORT',
          status: 'Pending',
          entry: 1.665,
          triggerType: 'Breakout Confirmed',
        }),
      ],
      [baseRow({ symbol: 'NEARUSDT', markPrice: 1.665 })],
      100,
    );
    expect(patches[0].status).toBe('Running');
    expect(patches[0].advisor).toBe('Hold');
    expect(mockEvaluate).toHaveBeenCalled();
  });

  it('does not import Decision / Planner / Trigger / Confidence', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const raw = readFileSync(
      join(__dirname, '../rc3/buildTradeSessionAdviser.ts'),
      'utf8',
    );
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(
      /computeDecision|planTradeExecution|computeConfidence|computeTrendReversal|from ['"].*binance/i,
    );
    expect(code).toMatch(/evaluatePositionV41/);
  });
});

describe('Task 11.1 — Adviser Journal metadata', () => {
  it('advisorUpdatedAt is ISO-8601 UTC', () => {
    const advice = buildTradeSessionAdvisorViewModel({
      session: baseSession({ status: 'Pending' }),
      row: baseRow(),
      updatedAt: Date.UTC(2026, 6, 14, 10, 45, 20),
    });
    const iso = toAdvisorUpdatedAtUtc(Date.UTC(2026, 6, 14, 10, 45, 20));
    expect(iso).toBe('2026-07-14T10:45:20.000Z');
    expect(toAdvisorUpdatedAtUtc(advice.updatedAt)).toBe(iso);
  });

  it('sequence increments only when advisorActionCode changes', () => {
    const session = baseSession({ status: 'Running', advisorActionCode: 'HOLD', advisorSequence: 2 });
    const holdPatch = buildTradeSessionAdviserPatches([session], [baseRow()], 200)[0];
    expect(holdPatch.advisorActionCode).toBe('HOLD');
    expect(holdPatch.advisorSequence).toBe(2);
    expect(holdPatch.historyAppend).toBeUndefined();

    mockEvaluate.mockReturnValueOnce({
      action: 'MOVE_SL_BE',
      label: 'Dời SL về hòa vốn',
      urgency: 'MEDIUM',
      breakEvenSuggested: true,
      breakEvenPrice: 65000,
      trailingStopSuggested: false,
      trailingStopPrice: null,
      reason: 'profit reached 50% toward tp1',
    });
    const movePatch = buildTradeSessionAdviserPatches([session], [baseRow()], 300)[0];
    expect(movePatch.advisorActionCode).toBe('MOVE_SL_BE');
    expect(movePatch.advisorSequence).toBe(3);
    expect(movePatch.historyAppend).toMatchObject({
      sequence: 3,
      advisorActionCode: 'MOVE_SL_BE',
      advisor: 'Move SL',
      advisorReasonCode: 'RR_1_REACHED',
    });
  });

  it('mapAdvisorReasonCode maps engine output without parsing UI text', () => {
    expect(
      mapAdvisorReasonCode({
        action: 'TRAILING_STOP',
        label: '',
        urgency: 'MEDIUM',
        breakEvenSuggested: false,
        breakEvenPrice: null,
        trailingStopSuggested: true,
        trailingStopPrice: 64800,
        reason: 'trailing stop active',
      }),
    ).toBe('TRAILING_STOP');

    expect(
      mapAdvisorReasonCode({
        action: 'CLOSE_NOW',
        label: '',
        urgency: 'HIGH',
        breakEvenSuggested: false,
        breakEvenPrice: null,
        trailingStopSuggested: false,
        trailingStopPrice: null,
        reason: 'exhaustion detected',
      }),
    ).toBe('EXHAUSTION');
  });

  it('positionAdvisorV41.ts is not modified by Task 11.1 wire', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const raw = readFileSync(join(__dirname, '../positionAdvisorV41.ts'), 'utf8');
    expect(raw).not.toMatch(/advisorActionCode|advisorReasonCode|advisorSequence/);
  });
});
