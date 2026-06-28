import { describe, expect, it } from 'vitest';
import {
  migrateAiJournal,
  migrateAiJournalEntry,
  migrateTradeSnapshot,
} from './phase1Migration';
import { TRADE_SNAPSHOT_VERSION } from './tradeSnapshot';

describe('phase1Migration', () => {
  it('giữ entry cũ thiếu field — bổ sung default, không xóa', () => {
    const raw = {
      id: 'aj_old',
      timestamp: 1_700_000_000_000,
      symbol: 'BTCUSDT',
      outcome: { status: 'WIN', pnlUSDT: 12.5 },
      scoring: { totalScore: 10.5, direction: 'LONG', decision: 'VAO_TU_TIN' },
    };

    const entry = migrateAiJournalEntry(raw);
    expect(entry?.id).toBe('aj_old');
    expect(entry?.outcome.status).toBe('WIN');
    expect(entry?.outcome.pnlUSDT).toBe(12.5);
    expect(entry?.scoring.totalScore).toBe(10.5);
    expect(entry?.scoring.layerScores.l10).toBe(0);
    expect(entry?.plan.sizeActual).toBeGreaterThan(0);
    expect(entry?.fundingAtEntry).toBeNull();
    expect(entry?.fundingVelocityAtEntry).toBeNull();
    expect(entry?.fundingStateAtEntry).toBeNull();
    expect(entry?.fundingAtExit).toBeNull();
    expect(entry?.fundingStateAtExit).toBeNull();
    expect(entry?.squeezeRiskScoreAtEntry).toBeNull();
    expect(entry?.squeezeRiskLevelAtEntry).toBeNull();
    expect(entry?.squeezeRiskDirectionAtEntry).toBeNull();
    expect(entry?.squeezeRiskScoreAtExit).toBeNull();
    expect(entry?.squeezeRiskLevelAtExit).toBeNull();
    expect(entry?.squeezeRiskDirectionAtExit).toBeNull();
    expect(entry?.positionAdvisorActionAtExit).toBeUndefined();
    expect(entry?.followedAdvisorRecommendation).toBeUndefined();
    expect(entry?.scoringDecisionAtExit).toBeNull();
    expect(entry?.planHealthAtExit).toBeUndefined();
  });

  it('entry cũ có funding hợp lệ — giữ nguyên sau migrate', () => {
    const raw = {
      id: 'aj_v4',
      timestamp: 1_700_000_000_000,
      symbol: 'ETHUSDT',
      outcome: { status: 'WIN' },
      scoring: { totalScore: 10, direction: 'LONG', decision: 'VAO', scorerVersion: 'v4' },
      fundingAtEntry: -0.008,
      fundingVelocityAtEntry: -0.002,
      fundingStateAtEntry: 'SHORT_SQUEEZE_BUILDING',
      fundingAtExit: 0.003,
      fundingStateAtExit: 'NEUTRAL',
    };

    const entry = migrateAiJournalEntry(raw);
    expect(entry?.fundingAtEntry).toBeCloseTo(-0.008);
    expect(entry?.fundingVelocityAtEntry).toBeCloseTo(-0.002);
    expect(entry?.fundingStateAtEntry).toBe('SHORT_SQUEEZE_BUILDING');
    expect(entry?.fundingAtExit).toBeCloseTo(0.003);
    expect(entry?.fundingStateAtExit).toBe('NEUTRAL');
  });

  it('entry cũ funding invalid — coerce về null', () => {
    const entry = migrateAiJournalEntry({
      id: 'aj_bad',
      timestamp: 1,
      symbol: 'BTCUSDT',
      outcome: { status: 'LOSS' },
      scoring: { direction: 'LONG', totalScore: 8 },
      fundingAtEntry: 'not-a-number',
      fundingStateAtEntry: 'INVALID_STATE',
    });
    expect(entry?.fundingAtEntry).toBeNull();
    expect(entry?.fundingStateAtEntry).toBeNull();
  });

  it('migrate snapshot version cũ (thiếu lockedPlan) vẫn đọc được', () => {
    const legacy = {
      version: 0,
      savedAt: 1000,
      tradeJournal: [],
      aiTradeJournal: [
        {
          id: 'x1',
          timestamp: 1000,
          symbol: 'NEARUSDT',
          outcome: { status: 'OPEN' },
          scoring: { direction: 'LONG', totalScore: 9 },
        },
      ],
      dailyStats: [],
      accountHistory: [],
      skippedSetups: [],
      settings: {},
      psychologyChecklist: {},
    };

    const migrated = migrateTradeSnapshot(legacy);
    expect(migrated?.version).toBe(TRADE_SNAPSHOT_VERSION);
    expect(migrated?.aiTradeJournal).toHaveLength(1);
    expect(migrated?.lockedPlan).toBeNull();
  });

  it('không chấm lại — giữ decision và layer snapshot gốc', () => {
    const entries = migrateAiJournal([
      {
        id: 'h1',
        timestamp: 1,
        symbol: 'SOLUSDT',
        scoring: {
          totalScore: 11.2,
          direction: 'LONG',
          decision: 'SETUP_NGON',
          layerScores: { l1: 2, l2: 1, l3: 2, l4: 1, l5: 2, l6: 1, l7: 1, l8: 2, l9: 1, l10: 0 },
        },
        outcome: { status: 'LOSS' },
        version: '0.9.0',
      },
    ]);

    expect(entries[0]?.scoring.decision).toBe('SETUP_NGON');
    expect(entries[0]?.scoring.totalScore).toBe(11.2);
    expect(entries[0]?.scoring.layerScores.l1).toBe(2);
    expect(entries[0]?.version).toBe('0.9.0');
  });
});
