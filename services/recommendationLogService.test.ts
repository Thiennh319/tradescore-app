import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOldRecommendationLogs,
  getRecommendationLogForTrade,
  logRecommendationIfNeeded,
  resetRecommendationLogMemory,
} from './recommendationLogService';

const storage = new Map<string, string>();

vi.mock('./storage', () => ({
  storageGetItem: (key: string) => Promise.resolve(storage.get(key) ?? null),
  storageSetItem: (key: string, value: string) => {
    storage.set(key, value);
    return Promise.resolve();
  },
}));

function baseEntry(tradeId: string, urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM') {
  return {
    tradeId,
    timestamp: Date.now(),
    type: 'HOLD',
    label: 'Tiếp tục giữ',
    urgency,
    confidence: 70,
    triggeredBy: 'HOLD_STRONG',
    scoreSnapshot: { totalScore: 9, groupScores: { A: 3, B: 3, C: 3 } },
    priceAtLog: 100,
    pnlUSDTAtLog: 1.2,
  };
}

describe('recommendationLogService', () => {
  beforeEach(() => {
    storage.clear();
    resetRecommendationLogMemory();
  });

  it('logs first entry when urgency >= MEDIUM', async () => {
    await logRecommendationIfNeeded(baseEntry('t1', 'MEDIUM'));
    const logs = await getRecommendationLogForTrade('t1');
    expect(logs).toHaveLength(1);
    expect(logs[0].trigger).toBe('URGENCY_CHANGE');
  });

  it('skips duplicate urgency on periodic scan', async () => {
    await logRecommendationIfNeeded(baseEntry('t1', 'HIGH'));
    await logRecommendationIfNeeded(baseEntry('t1', 'HIGH'));
    const logs = await getRecommendationLogForTrade('t1');
    expect(logs).toHaveLength(1);
  });

  it('logs when urgency increases', async () => {
    await logRecommendationIfNeeded(baseEntry('t1', 'MEDIUM'));
    await logRecommendationIfNeeded(baseEntry('t1', 'HIGH'));
    const logs = await getRecommendationLogForTrade('t1');
    expect(logs).toHaveLength(2);
  });

  it('logs user interaction even if urgency unchanged', async () => {
    await logRecommendationIfNeeded(baseEntry('t1', 'MEDIUM'));
    await logRecommendationIfNeeded(baseEntry('t1', 'MEDIUM'), true);
    const logs = await getRecommendationLogForTrade('t1');
    expect(logs).toHaveLength(2);
    expect(logs[1].trigger).toBe('USER_INTERACTION');
  });

  it('clears logs older than cutoff', async () => {
    const old = {
      ...baseEntry('t1'),
      id: 'rec_old',
      timestamp: Date.now() - 40 * 24 * 3_600_000,
      trigger: 'URGENCY_CHANGE' as const,
    };
    const recent = {
      ...baseEntry('t1'),
      id: 'rec_new',
      timestamp: Date.now(),
      trigger: 'URGENCY_CHANGE' as const,
    };
    storage.set('gd1_recommendation_log', JSON.stringify([old, recent]));

    await clearOldRecommendationLogs(30);
    const raw = storage.get('gd1_recommendation_log');
    const parsed = raw ? (JSON.parse(raw) as Array<{ id: string }>) : [];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('rec_new');
  });
});
