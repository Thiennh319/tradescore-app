import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  BREAKOUT_PRODUCTION_MAX_HOLD_1H,
  BREAKOUT_PRODUCTION_PARAMS,
  buildProductionBreakoutScanParams,
} from '../breakoutProductionParams';
import {
  buildXrpBreakoutLossStreakNotifyBody,
  deliverXrpBreakoutLossStreakNotification,
  getXrpBreakoutConsecutiveLosses,
  isXrpBreakoutProductionSession,
  logXrpBreakoutSessionClosed,
  logXrpBreakoutSessionOpened,
  resetXrpBreakoutSafeguardStateForTests,
  setXrpBreakoutNotifyFnForTests,
  XRP_BREAKOUT_CONSECUTIVE_LOSS_ALERT,
  XRP_BREAKOUT_LOG_TAG,
  XRP_BREAKOUT_LOSS_STREAK_NOTIFY_TITLE,
} from '../xrpBreakoutProductionSafeguard';
import type { KlineV41 } from '../../indicators';
import * as localNotification from '../../../localNotification';

describe('breakoutProductionParams (NEAR default SSOT)', () => {
  it('matches XRP-1 / XRP-2 validated NEAR default + dedupe', () => {
    expect(BREAKOUT_PRODUCTION_PARAMS).toMatchObject({
      lookbackN: 20,
      consolidationMode: 'width',
      maxWidthPct: 5,
      confirmMode: 'retest',
      slMode: 'atr_break_level',
      atrMult: 1,
      requireStrongBreakout: false,
      retestMaxBars: 10,
      retestBandPct: 0.005,
      tp1Rr: 1.5,
      dedupeByBrokenLevel: true,
      maxHoldBarsForLevelDedupe: 80,
    });
    expect(BREAKOUT_PRODUCTION_MAX_HOLD_1H).toBe(80);
  });

  it('buildProductionBreakoutScanParams wires klines + SSOT', () => {
    const klines1H: KlineV41[] = [];
    const params = buildProductionBreakoutScanParams(klines1H);
    expect(params.klines1H).toBe(klines1H);
    expect(params.dedupeByBrokenLevel).toBe(true);
    expect(params.requireStrongBreakout).toBe(false);
  });
});

describe('xrpBreakoutProductionSafeguard', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetXrpBreakoutSafeguardStateForTests();
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    resetXrpBreakoutSafeguardStateForTests();
  });

  const baseSession = {
    id: 'v41-xrp-1',
    symbol: 'XRPUSDT',
    action: 'LONG' as const,
    entry: 0.5,
    stop: 0.49,
    tp: 0.515,
    pnl: null as number | null,
    triggerType: 'Breakout Confirmed' as const,
    openedAt: 1_700_000_000_000,
  };

  it('recognizes only XRP + Breakout Confirmed', () => {
    expect(isXrpBreakoutProductionSession(baseSession)).toBe(true);
    expect(
      isXrpBreakoutProductionSession({
        ...baseSession,
        symbol: 'NEARUSDT',
      }),
    ).toBe(false);
    expect(
      isXrpBreakoutProductionSession({
        ...baseSession,
        triggerType: 'Trend Reversal',
      }),
    ).toBe(false);
  });

  it('logs OPEN with dedicated tag', () => {
    logXrpBreakoutSessionOpened(baseSession);
    expect(infoSpy).toHaveBeenCalled();
    const [tag] = infoSpy.mock.calls[0]!;
    expect(tag).toBe(`${XRP_BREAKOUT_LOG_TAG} OPEN`);
  });

  it('alerts at ≥5 consecutive losses and resets on win', () => {
    const notify = vi.fn(async () => true);
    setXrpBreakoutNotifyFnForTests(notify);

    for (let i = 0; i < XRP_BREAKOUT_CONSECUTIVE_LOSS_ALERT; i++) {
      logXrpBreakoutSessionClosed({
        ...baseSession,
        id: `loss-${i}`,
        pnl: -1,
      });
    }
    expect(getXrpBreakoutConsecutiveLosses()).toBe(5);
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]![0])).toContain('ALERT consecutive_losses=5');

    logXrpBreakoutSessionClosed({
      ...baseSession,
      id: 'win-reset',
      pnl: 1.5,
    });
    expect(getXrpBreakoutConsecutiveLosses()).toBe(0);
  });

  it('is idempotent per session id', () => {
    logXrpBreakoutSessionClosed({ ...baseSession, id: 'same', pnl: -1 });
    logXrpBreakoutSessionClosed({ ...baseSession, id: 'same', pnl: -1 });
    expect(getXrpBreakoutConsecutiveLosses()).toBe(1);
  });

  it('calls presentLocalNotification path once at 5-loss streak with correct title/body', async () => {
    const notify = vi.fn(async () => true);
    setXrpBreakoutNotifyFnForTests(notify);

    for (let i = 0; i < 4; i++) {
      logXrpBreakoutSessionClosed({
        ...baseSession,
        id: `loss-pre-${i}`,
        pnl: -1,
      });
    }
    expect(notify).not.toHaveBeenCalled();

    logXrpBreakoutSessionClosed({
      ...baseSession,
      id: 'loss-5',
      pnl: -1,
    });

    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));

    const arg = notify.mock.calls[0]![0]!;
    expect(arg.title).toBe(XRP_BREAKOUT_LOSS_STREAK_NOTIFY_TITLE);
    expect(arg.body).toContain('Chuỗi thua liên tiếp: 5');
    expect(arg.body).toContain('Kiểm tra lại trước khi mở thêm lệnh XRP breakout');
    expect(arg.body).toContain('session loss-5');
    expect(arg.channelId).toBe(localNotification.POSITION_ADVISOR_CHANNEL_ID);
    expect(arg.data).toMatchObject({
      type: 'v41-xrp-breakout-loss-streak',
      symbol: 'XRPUSDT',
      consecutiveLosses: 5,
      sessionId: 'loss-5',
    });

    // Extra losses in same streak must not re-notify.
    logXrpBreakoutSessionClosed({
      ...baseSession,
      id: 'loss-6',
      pnl: -1,
    });
    await Promise.resolve();
    expect(notify).toHaveBeenCalledTimes(1);

    // console.warn still present (not replaced by notification).
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('ALERT'))).toBe(true);
  });

  it('deliverXrpBreakoutLossStreakNotification forwards to presentLocalNotification when no override', async () => {
    const spy = vi
      .spyOn(localNotification, 'presentLocalNotification')
      .mockResolvedValue(true);
    vi.spyOn(localNotification, 'isNativeNotificationSupported').mockReturnValue(true);

    const ok = await deliverXrpBreakoutLossStreakNotification({
      consecutiveLosses: 5,
      lastLossAtMs: 1_700_000_000_000,
      sessionId: 's-direct',
    });

    expect(ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toMatchObject({
      title: XRP_BREAKOUT_LOSS_STREAK_NOTIFY_TITLE,
      channelId: localNotification.POSITION_ADVISOR_CHANNEL_ID,
    });
    expect(spy.mock.calls[0]![0]!.body).toBe(
      buildXrpBreakoutLossStreakNotifyBody({
        consecutiveLosses: 5,
        lastLossAtMs: 1_700_000_000_000,
        sessionId: 's-direct',
      }),
    );

    spy.mockRestore();
  });
});
