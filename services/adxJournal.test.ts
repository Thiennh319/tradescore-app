import { describe, expect, it } from 'vitest';
import type { AdxJournalSnapshot } from '../constants/aiJournal';
import {
  buildMarketSnapshot,
  buildScoringSnapshot,
  newAiJournalEntry,
} from './journalService';
import { migrateAiJournalEntry } from './phase1Migration';

const sampleAdxSnapshot: AdxJournalSnapshot = {
  adx1H: 40,
  adx4H: 38,
  adxAvg: 39,
  regime: 'TRENDING',
  regimeStrength: 'STRONG',
  bothChoppy: false,
  gateResult: 'BONUS',
  tpMultiplier: 1.2,
  slMultiplier: 0.9,
};

function minimalJournalInput(adxSnapshot?: AdxJournalSnapshot) {
  return {
    symbol: 'BTCUSDT',
    accountSizeAtEntry: 1000,
    market: buildMarketSnapshot({ entryPrice: 100, priceAtAnalysis: 100 }),
    scoring: buildScoringSnapshot({
      totalScore: 11,
      direction: 'LONG',
      layers: [],
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
    }),
    plan: {
      entryZoneOptimal: 100,
      entryZoneType: 'PULLBACK',
      stopLoss: 95,
      takeProfit1: 110,
      takeProfit2: 120,
      takeProfit3: 130,
      sizeActual: 50,
      sizeProposed: 50,
      riskRewardRatio: 2,
      openReason: null,
    },
    adxSnapshot,
  };
}

describe('adxJournal serialization', () => {
  it('entry có adxSnapshot → JSON shape đúng AdxJournalSnapshot', () => {
    const entry = newAiJournalEntry(minimalJournalInput(sampleAdxSnapshot));
    const json = JSON.parse(JSON.stringify(entry)) as typeof entry;

    expect(json.adxSnapshot).toEqual({
      adx1H: 40,
      adx4H: 38,
      adxAvg: 39,
      regime: 'TRENDING',
      regimeStrength: 'STRONG',
      bothChoppy: false,
      gateResult: 'BONUS',
      tpMultiplier: 1.2,
      slMultiplier: 0.9,
    });
    expect(Object.keys(json.adxSnapshot ?? {})).toEqual([
      'adx1H',
      'adx4H',
      'adxAvg',
      'regime',
      'regimeStrength',
      'bothChoppy',
      'gateResult',
      'tpMultiplier',
      'slMultiplier',
    ]);
  });

  it('entry cũ không có adxSnapshot → migrate không crash, field undefined', () => {
    const legacyRaw = {
      id: 'aj_legacy_1',
      timestamp: 1_700_000_000_000,
      symbol: 'NEARUSDT',
      accountSizeAtEntry: 500,
      market: {
        entryPrice: 5,
        priceAtAnalysis: 5,
        cvdTrend: 'UP',
      },
      scoring: {
        totalScore: 10,
        direction: 'LONG',
        decision: 'VAO_TU_TIN',
        layers: [],
        mandatoryViolations: [],
      },
      plan: {
        entryZoneOptimal: 5,
        stopLoss: 4.8,
        takeProfit1: 5.2,
        sizeActual: 20,
      },
      outcome: { status: 'OPEN' },
      tags: [],
      version: '1.0.0',
    };

    expect(() => migrateAiJournalEntry(legacyRaw)).not.toThrow();
    const migrated = migrateAiJournalEntry(legacyRaw);
    expect(migrated).not.toBeNull();
    expect(migrated!.adxSnapshot).toBeUndefined();
  });
});
