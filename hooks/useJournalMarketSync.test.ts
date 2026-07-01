import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { migrateAiJournalEntry } from '../services/phase1Migration';
import {
  buildMarkPricesFromSignalRows,
  resolveScorerVersionForEntry,
} from '../hooks/useJournalMarketSync';
import type { SignalRow } from '../hooks/useSignalBoard';

function openEntry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  const base = migrateAiJournalEntry({
    id: 't-open',
    timestamp: Date.now(),
    symbol: 'SOLUSDT',
    outcome: { status: 'OPEN' },
    scoring: {
      totalScore: 11,
      direction: 'SHORT',
      decision: 'VAO_TU_TIN',
      scorerVersion: 'v4',
    },
    market: { entryPrice: 71.19, priceAtAnalysis: 71.19 },
    plan: {
      slProposed: 72,
      slActual: 72,
      sizeProposed: 6,
      sizeActual: 6,
      tp1Proposed: 70,
      tp1Actual: 70,
    },
    strategySource: 'V4',
  });
  if (!base) throw new Error('migrate failed');
  return { ...base, ...overrides };
}

function signalRow(symbol: string, price: number): SignalRow {
  return {
    symbol,
    direction: 'SHORT',
    score: 11,
    price,
    decision: 'VAO_TU_TIN',
    atr1h: 1.2,
    layers: [],
    groupScores: { A: 4, B: 4, C: 3 },
    marketMode: 'TREND',
    hardBlocks: [],
    warnings: [],
    long: { totalScore: 5, decision: 'BO_QUA', hardBlocks: [], groupBlocks: [], warnings: [], layers: [], groupScores: { A: 0, B: 0, C: 0 } },
    short: { totalScore: 11, decision: 'VAO_TU_TIN', hardBlocks: [], groupBlocks: [], warnings: [], layers: [], groupScores: { A: 4, B: 4, C: 3 } },
  } as SignalRow;
}

describe('useJournalMarketSync helpers', () => {
  it('buildMarkPricesFromSignalRows uses live row.price not entry price', () => {
    const rows = [signalRow('SOLUSDT', 68.42), signalRow('BTCUSDT', 60100)];
    const map = buildMarkPricesFromSignalRows(rows);
    expect(map.SOLUSDT).toBe(68.42);
    expect(map.BTCUSDT).toBe(60100);
    expect(map.SOLUSDT).not.toBe(71.19);
  });

  it('resolveScorerVersionForEntry prefers entry strategy source', () => {
    const v3 = openEntry({ strategySource: 'V3', scoring: { ...openEntry().scoring, scorerVersion: undefined } });
    const v4 = openEntry({ strategySource: 'CVDX' });
    expect(resolveScorerVersionForEntry(v3, 'v4')).toBe('v3');
    expect(resolveScorerVersionForEntry(v4, 'v3')).toBe('v4');
  });
});
