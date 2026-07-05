import { describe, expect, it } from 'vitest';
import type { StructureSLSnapshot } from '../constants/aiJournal';
import type { StructureSLResult } from './structureSL';
import {
  buildMarketSnapshot,
  buildScoringSnapshot,
  buildStructureSLSnapshot,
  newAiJournalEntry,
} from './journalService';
import { migrateAiJournalEntry } from './phase1Migration';

const structureResult: StructureSLResult = {
  swingPrice: 95,
  swingTime: 1_700_000_000_000,
  slPrice: 94.715,
  slSource: 'STRUCTURE',
  bufferPct: 0.3,
  distanceFromEntry: 5.285,
  candlesBack: 6,
};

const fallbackResult: StructureSLResult = {
  swingPrice: 0,
  swingTime: 0,
  slPrice: 88,
  slSource: 'ATR_FALLBACK',
  bufferPct: 0.3,
  distanceFromEntry: 12,
  candlesBack: 0,
};

function minimalJournalInput(structureSLSnapshot?: StructureSLSnapshot) {
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
    structureSLSnapshot,
  };
}

describe('buildStructureSLSnapshot', () => {
  it('STRUCTURE result → đúng shape', () => {
    const snapshot = buildStructureSLSnapshot(structureResult);
    expect(snapshot).toEqual({
      swingPrice: 95,
      swingTime: 1_700_000_000_000,
      slPrice: 94.715,
      slSource: 'STRUCTURE',
      bufferPct: 0.3,
      distanceFromEntry: 5.285,
      candlesBack: 6,
    });
  });

  it('ATR_FALLBACK result → đúng shape', () => {
    const snapshot = buildStructureSLSnapshot(fallbackResult);
    expect(snapshot).toEqual({
      swingPrice: 0,
      swingTime: 0,
      slPrice: 88,
      slSource: 'ATR_FALLBACK',
      bufferPct: 0.3,
      distanceFromEntry: 12,
      candlesBack: 0,
    });
  });

  it('undefined → return undefined', () => {
    expect(buildStructureSLSnapshot(undefined)).toBeUndefined();
  });
});

describe('structureSL journal serialization', () => {
  it('entry có structureSLSnapshot → JSON giữ shape', () => {
    const snapshot = buildStructureSLSnapshot(structureResult)!;
    const entry = newAiJournalEntry(minimalJournalInput(snapshot));
    const json = JSON.parse(JSON.stringify(entry)) as typeof entry;

    expect(json.structureSLSnapshot).toEqual(snapshot);
    expect(Object.keys(json.structureSLSnapshot ?? {})).toEqual([
      'swingPrice',
      'swingTime',
      'slPrice',
      'slSource',
      'bufferPct',
      'distanceFromEntry',
      'candlesBack',
    ]);
  });

  it('entry cũ không có structureSLSnapshot → migrate không crash', () => {
    const legacyRaw = {
      id: 'aj_legacy_struct_1',
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
    expect(migrated!.structureSLSnapshot).toBeUndefined();
  });
});
