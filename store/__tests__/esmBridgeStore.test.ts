/**
 * ESM Store Bridge — tests (UL-02 / UL-03.1).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../../types/scoring';
import { StateMachineEntryState } from '../../services/entryStateManager';
import {
  EsmStoreBridge,
  runProductionEsmBridge,
  writeEsmSnapshotToStore,
  PRODUCTION_ESM_BRIDGE_VERSION,
} from '../../services/productionEsmBridge';
import type { ProductionEsmBridgeSnapshot } from '../../services/productionEsmBridge/productionEsmBridgeTypes';
import type { SignalRow } from '../../services/signalBoardScan';
import {
  buildEsmBridgeStateFromSnapshot,
  copyProductionEsmBridgeSnapshot,
  mergeEsmSnapshotIntoBridgeState,
  validateStorableEsmSnapshot,
} from '../esmBridgeStoreUtils';
import { DEFAULT_ESM_BRIDGE_STATE, getEsmSnapshotForSymbol } from '../esmBridgeTypes';
import { useTradeStore } from '../useTradeStore';

const SCAN_ID = 'ul02-store-btc-001';
const TIMESTAMP = '2026-07-12T14:00:00.000Z';
const FIXED_NOW = 1_752_000_000_000;

function buildMinimalSignalRow(symbol = 'BTCUSDT'): SignalRow {
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

function buildFlagOffSnapshot(symbol = 'BTCUSDT'): ProductionEsmBridgeSnapshot {
  return runProductionEsmBridge({
    signalRow: buildMinimalSignalRow(symbol),
    scanId: SCAN_ID,
    timestamp: TIMESTAMP,
    entryStateManagerEnabled: false,
  });
}

function resetEsmBridgeStore() {
  useTradeStore.setState({ esmBridge: { ...DEFAULT_ESM_BRIDGE_STATE } });
}

describe('EsmBridgeStore — UL-02 / UL-03.1', () => {
  beforeEach(() => {
    resetEsmBridgeStore();
  });

  describe('validateStorableEsmSnapshot', () => {
    it('accepts null harness when flag off', () => {
      const snapshot = buildFlagOffSnapshot();
      expect(snapshot.harnessResult).toBeNull();
      expect(validateStorableEsmSnapshot(snapshot).valid).toBe(true);
    });
  });

  describe('mergeEsmSnapshotIntoBridgeState', () => {
    it('stores snapshot keyed by symbol', () => {
      const snapshot = buildFlagOffSnapshot('BTCUSDT');
      const state = mergeEsmSnapshotIntoBridgeState(DEFAULT_ESM_BRIDGE_STATE, snapshot, FIXED_NOW);

      expect(state.lastUpdatedBySymbol.BTCUSDT).toBe(FIXED_NOW);
      expect(state.snapshotBySymbol.BTCUSDT).toEqual(snapshot);
      expect(state.snapshotBySymbol.BTCUSDT).not.toBe(snapshot);
      expect(state.status).toBe('skipped');
    });

    it('retains multiple symbols without overwriting', () => {
      const btc = buildFlagOffSnapshot('BTCUSDT');
      const eth = runProductionEsmBridge({
        signalRow: buildMinimalSignalRow('ETHUSDT'),
        scanId: 'ul031-eth',
        timestamp: TIMESTAMP,
        entryStateManagerEnabled: false,
      });

      const first = mergeEsmSnapshotIntoBridgeState(DEFAULT_ESM_BRIDGE_STATE, btc, FIXED_NOW);
      const second = mergeEsmSnapshotIntoBridgeState(first, eth, FIXED_NOW + 1);

      expect(second.snapshotBySymbol.BTCUSDT?.scanId).toBe(btc.scanId);
      expect(second.snapshotBySymbol.ETHUSDT?.scanId).toBe('ul031-eth');
      expect(getEsmSnapshotForSymbol(second, 'BTCUSDT')).not.toBeNull();
      expect(getEsmSnapshotForSymbol(second, 'SOLUSDT')).toBeNull();
    });

    it('deterministic for fixed now', () => {
      const snapshot = buildFlagOffSnapshot();
      const first = buildEsmBridgeStateFromSnapshot(snapshot, FIXED_NOW);
      const second = buildEsmBridgeStateFromSnapshot(snapshot, FIXED_NOW);
      expect(first).toEqual(second);
    });
  });

  describe('copyProductionEsmBridgeSnapshot', () => {
    it('does not mutate source snapshot', () => {
      const snapshot = buildFlagOffSnapshot();
      const before = JSON.stringify(snapshot);
      const copy = copyProductionEsmBridgeSnapshot(snapshot);
      copy.message = 'mutated';
      expect(JSON.stringify(snapshot)).toBe(before);
    });
  });

  describe('useTradeStore.updateEsmSnapshot', () => {
    it('writes snapshot into esmBridge.snapshotBySymbol', () => {
      const snapshot = buildFlagOffSnapshot();
      useTradeStore.getState().updateEsmSnapshot(snapshot, { now: FIXED_NOW });

      const { esmBridge } = useTradeStore.getState();
      expect(esmBridge.snapshotBySymbol.BTCUSDT).toEqual(snapshot);
      expect(esmBridge.lastUpdatedBySymbol.BTCUSDT).toBe(FIXED_NOW);
      expect(esmBridge.enabled).toBe(false);
      expect(esmBridge.status).toBe('skipped');
    });

    it('merges per symbol on subsequent writes', () => {
      const btc = buildFlagOffSnapshot('BTCUSDT');
      const eth = runProductionEsmBridge({
        signalRow: buildMinimalSignalRow('ETHUSDT'),
        scanId: 'ul02-store-eth-002',
        timestamp: TIMESTAMP,
        entryStateManagerEnabled: false,
      });

      useTradeStore.getState().updateEsmSnapshot(btc, { now: FIXED_NOW });
      useTradeStore.getState().updateEsmSnapshot(eth, { now: FIXED_NOW + 1 });

      const { esmBridge } = useTradeStore.getState();
      expect(esmBridge.snapshotBySymbol.BTCUSDT?.scanId).toBe(SCAN_ID);
      expect(esmBridge.snapshotBySymbol.ETHUSDT?.scanId).toBe('ul02-store-eth-002');
      expect(esmBridge.lastUpdatedBySymbol.ETHUSDT).toBe(FIXED_NOW + 1);
    });

    it('store retains copy independent of input mutation after write', () => {
      const snapshot = buildFlagOffSnapshot();
      const originalMessage = snapshot.message;
      useTradeStore.getState().updateEsmSnapshot(snapshot, { now: FIXED_NOW });

      snapshot.message = 'changed-input';
      expect(useTradeStore.getState().esmBridge.snapshotBySymbol.BTCUSDT?.message).toBe(
        originalMessage,
      );
    });
  });

  describe('writeEsmSnapshotToStore', () => {
    it('delegates to store updateEsmSnapshot', () => {
      const snapshot = buildFlagOffSnapshot();
      writeEsmSnapshotToStore(snapshot, useTradeStore.getState(), { now: FIXED_NOW });

      expect(useTradeStore.getState().esmBridge.snapshotBySymbol.BTCUSDT?.scanId).toBe(SCAN_ID);
    });

    it('integration — runProductionEsmBridge then writeEsmSnapshotToStore', () => {
      const snapshot = runProductionEsmBridge({
        signalRow: buildMinimalSignalRow(),
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
        entryStateManagerEnabled: true,
      });

      writeEsmSnapshotToStore(snapshot, useTradeStore.getState(), { now: FIXED_NOW });

      const { esmBridge } = useTradeStore.getState();
      expect(esmBridge.enabled).toBe(true);
      expect(esmBridge.status).toBe('stored');
      expect(esmBridge.snapshotBySymbol.BTCUSDT?.bridgeVersion).toBe(PRODUCTION_ESM_BRIDGE_VERSION);
      expect(esmBridge.snapshotBySymbol.BTCUSDT?.harnessResult).not.toBeNull();
      expect(esmBridge.snapshotBySymbol.BTCUSDT?.mappedCurrentState).toBe(
        StateMachineEntryState.WATCH,
      );
    });
  });

  describe('namespace API', () => {
    it('EsmStoreBridge exposes write helpers', () => {
      expect(EsmStoreBridge.writeEsmSnapshotToStore).toBe(writeEsmSnapshotToStore);
      expect(EsmStoreBridge.ESM_STORE_BRIDGE_VERSION).toBe('UL-03.1');
    });
  });
});
