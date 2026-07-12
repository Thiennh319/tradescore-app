/**
 * Production ESM scan wiring — tests (UL-04.0 / UL-04.1).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as featureFlags from '../../config/featureFlags';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { FinalEntryStatus } from '../../types/scoring';
import type { SignalRow } from '../signalBoardScan';
import { useTradeStore } from '../../store/useTradeStore';
import { DEFAULT_ESM_BRIDGE_STATE } from '../../store/esmBridgeTypes';
import { wireProductionEsmAfterScan } from './productionEsmScanWiring';

const SCANNED_AT = 1_752_100_000_000;

function buildRow(symbol: string): SignalRow {
  return {
    symbol,
    price: 100000,
    change24h: 0,
    trend: 'BULLISH',
    regimeConfidence: 0.8,
    score: 11,
    longScore: 11,
    shortScore: 6,
    direction: 'LONG',
    decisionLabel: 'VAO_TU_TIN',
    decisionDisplay: 'Vào tự tin',
    winrate: '62%',
    canEnter: true,
    tradePlan: null,
    layers: [],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
  };
}

function openJournalEntry(symbol: string): AiTradeJournalEntry {
  return {
    id: `open-${symbol}`,
    timestamp: SCANNED_AT,
    symbol,
    accountSizeAtEntry: 1000,
    market: { entryPrice: 100000, markPrice: 100000, btcChange24h: 0 },
    scoring: {
      totalScore: 11,
      direction: 'LONG',
      layerScores: {},
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
    },
    plan: {
      entryZoneType: 'LIMIT',
      entryZoneOptimal: 100000,
      entryZoneRangeLow: 99000,
      entryZoneRangeHigh: 101000,
      slProposed: 98000,
      slActual: 98000,
      tp1Proposed: 105000,
      tp1Actual: 105000,
      tp2: 110000,
      tp3: 115000,
      rrProposed: 2,
      sizeProposed: 100,
      sizeActual: 100,
      isSafeSL: true,
    },
    outcome: { status: 'OPEN' },
    tags: [],
    version: '1',
  };
}

describe('wireProductionEsmAfterScan — UL-04.0 / UL-04.1', () => {
  beforeEach(() => {
    useTradeStore.setState({
      esmBridge: { ...DEFAULT_ESM_BRIDGE_STATE },
      aiTradeJournal: [],
      lockedPlan: null,
    });
    vi.restoreAllMocks();
  });

  it('flag OFF — no store write, no log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(featureFlags, 'isEntryStateManagerEnabled').mockReturnValue(false);

    wireProductionEsmAfterScan([buildRow('BTCUSDT')], SCANNED_AT, useTradeStore.getState());

    expect(useTradeStore.getState().esmBridge.snapshotBySymbol).toEqual({});
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('flag ON — only eligible symbols run bridge', () => {
    vi.spyOn(featureFlags, 'isEntryStateManagerEnabled').mockReturnValue(true);
    useTradeStore.setState({
      aiTradeJournal: [openJournalEntry('BTCUSDT')],
    });

    const benchmark = wireProductionEsmAfterScan(
      [buildRow('BTCUSDT'), buildRow('ETHUSDT')],
      SCANNED_AT,
      useTradeStore.getState(),
    );

    const { esmBridge } = useTradeStore.getState();
    expect(esmBridge.snapshotBySymbol.BTCUSDT?.symbol).toBe('BTCUSDT');
    expect(esmBridge.snapshotBySymbol.ETHUSDT).toBeUndefined();
    expect(benchmark.symbolsSkipped).toBe(1);
    expect(benchmark.bridgeRuns).toBe(1);
  });

  it('delta — identical snapshot does not update lastUpdated', () => {
    vi.spyOn(featureFlags, 'isEntryStateManagerEnabled').mockReturnValue(true);
    useTradeStore.setState({ aiTradeJournal: [openJournalEntry('BTCUSDT')] });

    wireProductionEsmAfterScan([buildRow('BTCUSDT')], SCANNED_AT, useTradeStore.getState());
    const firstUpdated = useTradeStore.getState().esmBridge.lastUpdatedBySymbol.BTCUSDT;

    wireProductionEsmAfterScan(
      [buildRow('BTCUSDT')],
      SCANNED_AT + 1,
      useTradeStore.getState(),
    );
    const secondUpdated = useTradeStore.getState().esmBridge.lastUpdatedBySymbol.BTCUSDT;

    expect(firstUpdated).toBe(SCANNED_AT);
    expect(secondUpdated).toBe(SCANNED_AT);
  });

  it('skips rows with error flag', () => {
    vi.spyOn(featureFlags, 'isEntryStateManagerEnabled').mockReturnValue(true);
    useTradeStore.setState({ aiTradeJournal: [openJournalEntry('BTCUSDT')] });
    const bad = { ...buildRow('BTCUSDT'), error: 'fetch failed' };

    wireProductionEsmAfterScan([bad], SCANNED_AT, useTradeStore.getState());

    expect(useTradeStore.getState().esmBridge.snapshotBySymbol.BTCUSDT).toBeUndefined();
  });

  it('returns benchmark stats', () => {
    vi.spyOn(featureFlags, 'isEntryStateManagerEnabled').mockReturnValue(true);
    useTradeStore.setState({ aiTradeJournal: [openJournalEntry('BTCUSDT')] });

    const benchmark = wireProductionEsmAfterScan(
      [buildRow('BTCUSDT')],
      SCANNED_AT,
      useTradeStore.getState(),
      { scanDurationMs: 120 },
    );

    expect(benchmark.scanMs).toBe(120);
    expect(benchmark.totalAddedMs).toBe(benchmark.bridgeMs + benchmark.storeMs);
  });
});
