/**
 * ESM snapshot delta — tests (UL-04.1).
 */

import { describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../../types/scoring';
import { StateMachineEntryState } from '../../services/entryStateManager';
import { runProductionEsmBridge } from '../../services/productionEsmBridge';
import type { SignalRow } from '../../services/signalBoardScan';
import {
  areEsmSnapshotsMateriallyEqual,
  extractEsmSnapshotDeltaComparable,
} from '../esmSnapshotDelta';

const SCAN_ID = 'ul041-delta-btc';
const TIMESTAMP = '2026-07-12T15:00:00.000Z';

function buildRow(): SignalRow {
  return {
    symbol: 'BTCUSDT',
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

function buildSnapshot(scanSuffix = 'a') {
  return runProductionEsmBridge({
    signalRow: buildRow(),
    scanId: `${SCAN_ID}-${scanSuffix}`,
    timestamp: TIMESTAMP,
    entryStateManagerEnabled: true,
    currentState: StateMachineEntryState.READY,
  });
}

describe('esmSnapshotDelta — UL-04.1', () => {
  it('extracts hintCode, currentState, blockReasons, message', () => {
    const snapshot = buildSnapshot();
    const comparable = extractEsmSnapshotDeltaComparable(snapshot);
    expect(comparable.hintCode).toBe('READY');
    expect(comparable.currentState).toBeTruthy();
    expect(Array.isArray(comparable.blockReasons)).toBe(true);
    expect(typeof comparable.message).toBe('string');
  });

  it('materially equal when only scanId differs', () => {
    const first = buildSnapshot('a');
    const second = buildSnapshot('b');
    expect(areEsmSnapshotsMateriallyEqual(first, second)).toBe(true);
  });

  it('not equal when message differs', () => {
    const first = buildSnapshot();
    const second = { ...buildSnapshot(), message: 'different message' };
    expect(areEsmSnapshotsMateriallyEqual(first, second)).toBe(false);
  });
});
