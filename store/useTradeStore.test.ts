import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, HARD_BLOCK_RULES } from '../constants/scoring';
import {
  buildAutoRefreshLockKey,
  derivePsychology,
  getVietnamDateParts,
  resolveLossStreakLock,
  shouldTriggerAutoCheck,
  startAutoRefresh,
  type StoredTradeJournalEntry,
} from './useTradeStore';
import { buildTodayStatsFromJournal, lossStreakCooldownL10 } from '../services/scorerV3';

describe('getVietnamDateParts', () => {
  it('converts UTC to UTC+7', () => {
    const parts = getVietnamDateParts(new Date('2026-06-12T01:02:00.000Z'));
    expect(parts.hour).toBe(8);
    expect(parts.minute).toBe(2);
    expect(parts.ymd).toBe('2026-06-12');
  });
});

describe('shouldTriggerAutoCheck', () => {
  const settings = DEFAULT_SETTINGS;

  it('fires at minute 2 within golden hours', () => {
    expect(
      shouldTriggerAutoCheck(
        { year: 2026, month: 6, day: 12, hour: 10, minute: 2, ymd: '2026-06-12' },
        settings,
      ),
    ).toBe(true);
  });

  it('does not fire outside golden hours', () => {
    expect(
      shouldTriggerAutoCheck(
        { year: 2026, month: 6, day: 12, hour: 5, minute: 2, ymd: '2026-06-12' },
        settings,
      ),
    ).toBe(false);
    expect(
      shouldTriggerAutoCheck(
        { year: 2026, month: 6, day: 12, hour: 23, minute: 2, ymd: '2026-06-12' },
        settings,
      ),
    ).toBe(false);
  });

  it('does not fire on other minutes', () => {
    expect(
      shouldTriggerAutoCheck(
        { year: 2026, month: 6, day: 12, hour: 10, minute: 3, ymd: '2026-06-12' },
        settings,
      ),
    ).toBe(false);
  });
});

describe('startAutoRefresh', () => {
  it('runs fetch every minute', async () => {
    vi.useFakeTimers();

    const fetchAndAnalyze = vi.fn().mockResolvedValue(undefined);

    const store = {
      getState: () => ({
        settings: DEFAULT_SETTINGS,
        fetchAndAnalyze,
      }),
    };

    const cleanup = startAutoRefresh(store);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchAndAnalyze).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchAndAnalyze).toHaveBeenCalledTimes(2);

    cleanup();
    vi.useRealTimers();
  });
});

describe('buildAutoRefreshLockKey', () => {
  it('builds stable key per hour and trigger minute', () => {
    const parts = {
      year: 2026,
      month: 6,
      day: 12,
      hour: 14,
      minute: 2,
      ymd: '2026-06-12',
    };
    expect(buildAutoRefreshLockKey(parts, 2)).toBe('2026-06-12:14:m2');
  });
});

describe('derivePsychology', () => {
  function closedEntry(
    pnlPercent: number,
    closedAt: number,
    overrides?: Partial<StoredTradeJournalEntry>,
  ): StoredTradeJournalEntry {
    return {
      id: `tj_${closedAt}_${Math.random().toString(36).slice(2, 7)}`,
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrice: 100,
      entryTime: closedAt - 3_600_000,
      leverage: 5,
      size: 1,
      status: 'CLOSED',
      closedAt,
      realizedPnlPercent: pnlPercent,
      ...overrides,
    };
  }

  it('đếm consecutiveLosses từ lệnh CLOSED gần nhất, dừng khi gặp lệnh thắng', () => {
    const now = new Date('2026-06-12T05:00:00.000Z'); // 12h VN
    // 4 lệnh: thắng cũ → thua → thua → thua (gần nhất)
    const journal = [
      closedEntry(2, Date.parse('2026-06-12T01:00:00.000Z')),
      closedEntry(-1, Date.parse('2026-06-12T02:00:00.000Z')),
      closedEntry(-3, Date.parse('2026-06-12T03:00:00.000Z')),
      closedEntry(-2, Date.parse('2026-06-12T04:00:00.000Z')),
    ];
    const psy = derivePsychology(journal, DEFAULT_SETTINGS, now);
    expect(psy.consecutiveLosses).toBe(3);
  });

  it('dailyLossPercent chỉ cộng lệnh thua đóng trong cùng ngày VN', () => {
    const now = new Date('2026-06-12T05:00:00.000Z');
    const todayUtc = (h: number) => Date.parse(`2026-06-12T${String(h).padStart(2, '0')}:00:00.000Z`);
    const journal = [
      closedEntry(-2, todayUtc(1)), // hôm nay (VN)
      closedEntry(-3, todayUtc(2)), // hôm nay
      closedEntry(5, todayUtc(3)), // thắng — không tính
      closedEntry(-10, Date.parse('2026-06-11T05:00:00.000Z')), // hôm qua VN
    ];
    const psy = derivePsychology(journal, DEFAULT_SETTINGS, now);
    expect(psy.dailyLossPercent).toBeCloseTo(5, 5); // |-2| + |-3|
  });

  it('maxDailyLossPercent = (maxLossPerWeek/accountSize)*100/5', () => {
    const psy = derivePsychology([], DEFAULT_SETTINGS);
    const expected =
      (DEFAULT_SETTINGS.maxLossPerWeek / DEFAULT_SETTINGS.accountSize) * 100 / 5;
    expect(psy.maxDailyLossPercent).toBeCloseTo(Math.max(0.5, expected), 5);
  });
});

describe('resolveLossStreakLock', () => {
  function closedEntry(
    pnlPercent: number,
    closedAt: number,
  ): StoredTradeJournalEntry {
    return {
      id: `tj_${closedAt}`,
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrice: 100,
      entryTime: closedAt - 3_600_000,
      leverage: 5,
      size: 1,
      status: 'CLOSED',
      closedAt,
      realizedPnlPercent: pnlPercent,
    };
  }

  it('2 thua trong 24h — không khóa', () => {
    const now = new Date('2026-06-12T10:00:00.000Z');
    const journal = [
      closedEntry(-1, Date.parse('2026-06-12T09:30:00.000Z')),
      closedEntry(-2, Date.parse('2026-06-12T09:00:00.000Z')),
    ];
    const lock = resolveLossStreakLock(journal, now);
    expect(lock.consecutiveLossesIn24h).toBe(2);
    expect(lock.lossStreakLocked).toBe(false);
    expect(lock.lossStreakLockUntil).toBeNull();
  });

  it('3 thua liên tiếp trong 24h — khóa 180 phút từ lệnh thua gần nhất', () => {
    const lastLossAt = Date.parse('2026-06-12T09:30:00.000Z');
    const now = new Date(lastLossAt + 30 * 60_000);
    const journal = [
      closedEntry(-1, lastLossAt),
      closedEntry(-2, Date.parse('2026-06-12T09:00:00.000Z')),
      closedEntry(-3, Date.parse('2026-06-12T08:30:00.000Z')),
    ];
    const lock = resolveLossStreakLock(journal, now);
    expect(lock.consecutiveLossesIn24h).toBe(3);
    expect(lock.lossStreakLocked).toBe(true);
    expect(lock.lossStreakLockUntil).toBe(
      lastLossAt + HARD_BLOCK_RULES.LOSS_STREAK_LOCK_MINUTES * 60_000,
    );
  });

  it('sau 180 phút — tự mở khóa dù journal vẫn 3 thua', () => {
    const lastLossAt = Date.parse('2026-06-12T09:30:00.000Z');
    const now = new Date(
      lastLossAt + HARD_BLOCK_RULES.LOSS_STREAK_LOCK_MINUTES * 60_000 + 1,
    );
    const journal = [
      closedEntry(-1, lastLossAt),
      closedEntry(-2, Date.parse('2026-06-12T09:00:00.000Z')),
      closedEntry(-3, Date.parse('2026-06-12T08:30:00.000Z')),
    ];
    const lock = resolveLossStreakLock(journal, now);
    expect(lock.consecutiveLossesIn24h).toBe(3);
    expect(lock.lossStreakLocked).toBe(false);
  });

  it('thua cũ hơn 24h không tính vào chuỗi 24h', () => {
    const now = new Date('2026-06-12T10:00:00.000Z');
    const journal = [
      closedEntry(-1, Date.parse('2026-06-12T09:00:00.000Z')),
      closedEntry(-2, Date.parse('2026-06-12T08:00:00.000Z')),
      closedEntry(-5, Date.parse('2026-06-11T08:00:00.000Z')),
    ];
    const lock = resolveLossStreakLock(journal, now);
    expect(lock.consecutiveLossesIn24h).toBe(2);
    expect(lock.lossStreakLocked).toBe(false);
  });

  it('L10 hard block chỉ khi đang trong cooldown', () => {
    const lastLossAt = Date.parse('2026-06-12T09:30:00.000Z');
    const lockedStats = buildTodayStatsFromJournal(3, 0, {
      consecutiveLossesIn24h: 3,
      lossStreakLocked: true,
      lossStreakLockUntil: lastLossAt + HARD_BLOCK_RULES.LOSS_STREAK_LOCK_MINUTES * 60_000,
    });
    const unlockedStats = buildTodayStatsFromJournal(3, 0, {
      consecutiveLossesIn24h: 3,
      lossStreakLocked: false,
      lossStreakLockUntil: lastLossAt + HARD_BLOCK_RULES.LOSS_STREAK_LOCK_MINUTES * 60_000,
    });
    const midCooldown = lastLossAt + 60 * 60_000;
    expect(lossStreakCooldownL10(lockedStats, midCooldown)).not.toBeNull();
    expect(lossStreakCooldownL10(unlockedStats, midCooldown)).toBeNull();
  });
});
