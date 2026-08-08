/**
 * Task 4 — Freeze TR path for BTC/SOL/BNB under deterministic fixture.
 * Same inputs as Task 3 snapshot script; fail if breakout wire regresses TR coins.
 *
 * Convention: hard expected JSON + toEqual (repo has no toMatchSnapshot usage).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createNeutralSnapshot } from '../../marketIntelligenceLayer';
import type { KlineV41 } from '../../indicators';
import { buildRc3ViewModelFromRow } from '../buildRc3ViewModel';
import type { SignalRowV41 } from '../../scanV41';
import type { V41Rc3SignalCardModel } from '../rc3ViewModelTypes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOLS = ['BTCUSDT', 'SOLUSDT', 'BNBUSDT'] as const;
const FETCHED_AT = 1_720_000_000_000;

function buildKline(overrides: Partial<KlineV41> = {}): KlineV41 {
  return {
    openTime: 0,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
    closeTime: 1,
    takerBuyVolume: 500,
    ...overrides,
  };
}

function buildFlatKlines(count: number): KlineV41[] {
  return Array.from({ length: count }, (_, index) =>
    buildKline({
      openTime: index * 3_600_000,
      closeTime: index * 3_600_000 + 3_599_999,
    }),
  );
}

function rowFor(symbol: string): SignalRowV41 {
  return {
    symbol,
    snapshot: {
      ...createNeutralSnapshot(),
      trendDirection: 'NEUTRAL',
    },
    visibilityMode: 'INACTIVE',
    markPrice: symbol === 'BTCUSDT' ? 65000 : symbol === 'SOLUSDT' ? 150 : 580,
    klines1H: buildFlatKlines(30),
    klines4H: buildFlatKlines(70),
    btcKlines4H: buildFlatKlines(70),
    fundingRate: 0.0001,
    fetchedAt: FETCHED_AT,
  };
}

const expectedPath = path.join(
  __dirname,
  'fixtures',
  'rc3TrSymbolsNeutralFlat.expected.json',
);
const expected: V41Rc3SignalCardModel[] = JSON.parse(
  readFileSync(expectedPath, 'utf8'),
);

describe('RC3 ViewModel TR regression — BTC/SOL/BNB', () => {
  it('matches frozen Task-3 fixture (byte-stable fields)', () => {
    const cards = SYMBOLS.map((symbol) => buildRc3ViewModelFromRow(rowFor(symbol)));
    expect(cards).toEqual(expected);
  });

  it('does not route BTC/SOL/BNB through breakout trigger', () => {
    for (const symbol of SYMBOLS) {
      const card = buildRc3ViewModelFromRow(rowFor(symbol));
      expect(card.triggerType).not.toBe('Breakout Confirmed');
      expect(card.checklist.map((c) => c.id)).toEqual([
        'cvd_flip',
        'volume',
        'structure',
        'exhaustion',
      ]);
    }
  });

  it('routes XRPUSDT through breakout checklist when allow-listed (V41-XRP-3)', () => {
    const card = buildRc3ViewModelFromRow(rowFor('XRPUSDT'));
    expect(card.checklist.map((c) => c.id)).toEqual([
      'consolidation',
      'breakout',
      'retest',
      'momentum',
    ]);
  });
});
