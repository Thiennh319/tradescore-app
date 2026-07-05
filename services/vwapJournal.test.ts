import { describe, expect, it } from 'vitest';
import type { VWAPSnapshot } from '../constants/aiJournal';
import type { SignalRow } from './signalBoardScan';
import {
  buildMarketSnapshot,
  buildScoringSnapshot,
  buildSnapshotsFromSignalRow,
  buildVWAPSnapshot,
  newAiJournalEntry,
} from './journalService';
import { migrateAiJournalEntry } from './phase1Migration';
import type { VWAPResult } from './vwapService';

const vwapData: VWAPResult = {
  vwap: 100.5,
  upperBand1: 101.2,
  upperBand2: 102.0,
  lowerBand1: 99.8,
  lowerBand2: 99.0,
  priceVsVwap: 0.12,
  zone: 'NEAR_VWAP',
  isNearVwap: true,
  isPullingBackToVwap: false,
  sessionStart: Date.UTC(2026, 6, 3),
  candleCount: 12,
};

function signalRowWithVwap(
  overrides: Partial<SignalRow> = {},
): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 100.6,
    change24h: 1.2,
    trend: 'UP',
    regimeConfidence: 0.8,
    score: 10.5,
    longScore: 10.5,
    shortScore: 8,
    direction: 'LONG',
    decisionLabel: 'VAO_TU_TIN',
    decisionDisplay: 'VÀO TỰ TIN',
    winrate: '~70%',
    canEnter: true,
    tradePlan: null,
    layers: [],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    vwapData,
    vwapSignal: {
      quality: 'IDEAL',
      suggestedEntry: 100.5,
      entryReason: 'Entry tại VWAP — vùng giá công bằng',
    },
    vwapBonus: {
      bonusRaw: 0.5,
      reason: 'VWAP gần giá — bonus L5 +0.5',
      applied: true,
    },
    ...overrides,
  };
}

function minimalJournalInput(vwapSnapshot?: VWAPSnapshot) {
  return {
    symbol: 'BTCUSDT',
    accountSizeAtEntry: 1000,
    market: buildMarketSnapshot({ entryPrice: 100.6, priceAtAnalysis: 100.6 }),
    scoring: buildScoringSnapshot({
      totalScore: 10.5,
      direction: 'LONG',
      layers: [],
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
    }),
    plan: {
      entryZoneOptimal: 100.6,
      entryZoneType: 'PULLBACK',
      stopLoss: 98,
      takeProfit1: 105,
      takeProfit2: 110,
      takeProfit3: 115,
      sizeActual: 50,
      sizeProposed: 50,
      riskRewardRatio: 2,
      openReason: null,
    },
    vwapSnapshot,
  };
}

describe('buildVWAPSnapshot', () => {
  it('IDEAL → shape đúng', () => {
    const snapshot = buildVWAPSnapshot(signalRowWithVwap());
    expect(snapshot).toEqual({
      vwap: 100.5,
      upperBand1: 101.2,
      upperBand2: 102.0,
      lowerBand1: 99.8,
      lowerBand2: 99.0,
      priceVsVwap: 0.12,
      zone: 'NEAR_VWAP',
      isNearVwap: true,
      entryQuality: 'IDEAL',
      bonusApplied: true,
      bonusRaw: 0.5,
    });
  });

  it('với bonus → bonusApplied: true', () => {
    const snapshot = buildVWAPSnapshot(signalRowWithVwap());
    expect(snapshot?.bonusApplied).toBe(true);
    expect(snapshot?.bonusRaw).toBe(0.5);
  });

  it('vwapData null → undefined', () => {
    expect(buildVWAPSnapshot(signalRowWithVwap({ vwapData: undefined }))).toBeUndefined();
  });
});

describe('vwap journal serialization', () => {
  it('entry có vwapSnapshot → JSON giữ shape', () => {
    const snapshot = buildVWAPSnapshot(signalRowWithVwap())!;
    const entry = newAiJournalEntry(minimalJournalInput(snapshot));
    const json = JSON.parse(JSON.stringify(entry)) as typeof entry;

    expect(json.vwapSnapshot).toEqual(snapshot);
    expect(Object.keys(json.vwapSnapshot ?? {})).toEqual([
      'vwap',
      'upperBand1',
      'upperBand2',
      'lowerBand1',
      'lowerBand2',
      'priceVsVwap',
      'zone',
      'isNearVwap',
      'entryQuality',
      'bonusApplied',
      'bonusRaw',
    ]);
  });

  it('entry cũ không có vwapSnapshot → migrate không crash', () => {
    const legacyRaw = {
      id: 'aj_legacy_vwap_1',
      timestamp: 1_700_000_000_000,
      symbol: 'ETHUSDT',
      accountSizeAtEntry: 500,
      market: {
        entryPrice: 3000,
        priceAtAnalysis: 3000,
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
        entryZoneOptimal: 3000,
        stopLoss: 2950,
        takeProfit1: 3100,
        sizeActual: 20,
      },
      outcome: { status: 'OPEN' },
      tags: [],
      version: '1.0.0',
    };

    expect(() => migrateAiJournalEntry(legacyRaw)).not.toThrow();
    const migrated = migrateAiJournalEntry(legacyRaw);
    expect(migrated).not.toBeNull();
    expect(migrated!.vwapSnapshot).toBeUndefined();
  });

  it('buildSnapshotsFromSignalRow ghi vwapSnapshot từ row', () => {
    const snapshots = buildSnapshotsFromSignalRow({
      row: signalRowWithVwap(),
      entryPrice: 100.6,
      sizeActual: 50,
    });
    expect(snapshots.vwapSnapshot?.entryQuality).toBe('IDEAL');
    expect(snapshots.vwapSnapshot?.zone).toBe('NEAR_VWAP');
  });
});
