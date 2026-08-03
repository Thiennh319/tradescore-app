/**
 * Production → ESM Bridge — tests (UL-01 / UL-01.1).
 */

import { describe, expect, it, vi } from 'vitest';
import { FinalEntryStatus } from '../../types/scoring';
import * as entryStateManagerModule from '../entryStateManager';
import {
  DEFAULT_ENTRY_STATE_MANAGER_ENABLED,
  ORCHESTRATOR_DEFAULT_CURRENT_STATE,
  StateMachineEntryState,
} from '../entryStateManager';
import type { SignalRow } from '../signalBoardScan';
import {
  ProductionEsmBridge,
  runProductionEsmBridge,
  validateProductionEsmBridgeInput,
  validateProductionEsmBridgeSnapshot,
} from './productionEsmBridge';
import { PRODUCTION_ESM_BRIDGE_VERSION } from './productionEsmBridgeTypes';
import { mapSignalRowToWiringContext, ProductionEsmBridgeMapperError } from './signalRowMapper';
import { createEmptyTriggerSnapshot } from './triggerSnapshotFactory';

const SCAN_ID = 'production-ul01-btc-001';
const TIMESTAMP = '2026-07-12T12:00:00.000Z';

function buildMinimalSignalRow(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 100000,
    change24h: 1.2,
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
    v4: {
      score: 11,
      longScore: 11,
      shortScore: 6,
      direction: 'LONG',
      decisionLabel: 'VAO_TU_TIN',
      decisionDisplay: 'Vào tự tin',
      winrate: '62%',
      canEnter: true,
      layers: [],
      mandatoryViolations: [],
      hardBlocked: false,
      finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
    },
    ...overrides,
  };
}

describe('ProductionEsmBridge — UL-01', () => {
  describe('validateProductionEsmBridgeInput', () => {
    it('accepts valid input', () => {
      const result = validateProductionEsmBridgeInput({
        signalRow: buildMinimalSignalRow(),
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing scanId', () => {
      const result = validateProductionEsmBridgeInput({
        signalRow: buildMinimalSignalRow(),
        scanId: '',
        timestamp: TIMESTAMP,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('mapSignalRowToWiringContext', () => {
    it('maps SignalRow fields to wiring context', () => {
      const row = buildMinimalSignalRow();
      const mapped = mapSignalRowToWiringContext({
        signalRow: row,
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
      });

      expect(mapped.signalBoardScan.symbol).toBe('BTCUSDT');
      expect(mapped.signalBoardScan.price).toBe(100000);
      expect(mapped.signalBoardScan.direction).toBe('LONG');
      expect(mapped.signalBoardScan.canEnter).toBe(true);
      expect(mapped.marketSnapshot.symbol).toBe('BTCUSDT');
      expect(mapped.marketSnapshot.markPrice).toBe(100000);
      expect(mapped.scanId).toBe(SCAN_ID);
      expect(mapped.timestamp).toBe(TIMESTAMP);
      expect(mapped.triggerSnapshot).toEqual(createEmptyTriggerSnapshot());
      expect(mapped.entryStateManagerEnabled).toBe(DEFAULT_ENTRY_STATE_MANAGER_ENABLED);
    });

    it('defaults currentState to ORCHESTRATOR_DEFAULT_CURRENT_STATE — no FinalEntryStatus inference', () => {
      const mapped = mapSignalRowToWiringContext({
        signalRow: buildMinimalSignalRow({ finalEntryStatus: FinalEntryStatus.ENTRY_VALID }),
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
      });
      expect(mapped.currentState).toBe(ORCHESTRATOR_DEFAULT_CURRENT_STATE);
      expect(mapped.currentState).toBe(StateMachineEntryState.WATCH);
    });

    it('uses caller currentState when provided', () => {
      const mapped = mapSignalRowToWiringContext({
        signalRow: buildMinimalSignalRow(),
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
        currentState: StateMachineEntryState.LOCKED,
      });
      expect(mapped.currentState).toBe(StateMachineEntryState.LOCKED);
    });

    it('does not infer currentState from WAIT_ENTRY finalEntryStatus', () => {
      const mapped = mapSignalRowToWiringContext({
        signalRow: buildMinimalSignalRow({
          finalEntryStatus: FinalEntryStatus.WAIT_ENTRY,
          v4: {
            ...buildMinimalSignalRow().v4!,
            finalEntryStatus: FinalEntryStatus.WAIT_ENTRY,
          },
        }),
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
      });
      expect(mapped.currentState).toBe(ORCHESTRATOR_DEFAULT_CURRENT_STATE);
      expect(mapped.currentState).not.toBe(StateMachineEntryState.READY);
    });

    it('throws on invalid input', () => {
      expect(() =>
        mapSignalRowToWiringContext({
          signalRow: buildMinimalSignalRow(),
          scanId: '',
          timestamp: TIMESTAMP,
        }),
      ).toThrow(ProductionEsmBridgeMapperError);
    });

    it('does not mutate signalRow', () => {
      const row = buildMinimalSignalRow();
      const before = JSON.stringify(row);
      mapSignalRowToWiringContext({
        signalRow: row,
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
      });
      expect(JSON.stringify(row)).toBe(before);
    });
  });

  describe('runProductionEsmBridge — feature flag OFF (default)', () => {
    it('DEFAULT flag is false', () => {
      expect(DEFAULT_ENTRY_STATE_MANAGER_ENABLED).toBe(false);
      expect(ProductionEsmBridge.DEFAULT_ENTRY_STATE_MANAGER_ENABLED).toBe(false);
    });

    it('returns snapshot with null harnessResult and skips pipeline', () => {
      const spy = vi.spyOn(entryStateManagerModule, 'runEntryStateManagerPipeline');
      const snapshot = runProductionEsmBridge({
        signalRow: buildMinimalSignalRow(),
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
      });

      expect(snapshot.bridgeVersion).toBe(PRODUCTION_ESM_BRIDGE_VERSION);
      expect(snapshot.harnessResult).toBeNull();
      expect(snapshot.entryStateManagerEnabled).toBe(false);
      expect(snapshot.halted).toBe(false);
      expect(snapshot.message).toContain('off');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.results[0]?.value).toBeNull();
      spy.mockRestore();
    });

    it('validateProductionEsmBridgeSnapshot passes when flag off', () => {
      const input = {
        signalRow: buildMinimalSignalRow(),
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
      };
      const snapshot = runProductionEsmBridge(input);
      expect(validateProductionEsmBridgeSnapshot(snapshot, input).valid).toBe(true);
    });
  });

  describe('runProductionEsmBridge — feature flag ON', () => {
    it('returns harnessResult when enabled', () => {
      const snapshot = runProductionEsmBridge({
        signalRow: buildMinimalSignalRow(),
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
        entryStateManagerEnabled: true,
      });

      expect(snapshot.entryStateManagerEnabled).toBe(true);
      expect(snapshot.harnessResult).not.toBeNull();
      expect(snapshot.harnessResult?.context.scanId).toBe(SCAN_ID);
      expect(snapshot.harnessResult?.pipelineResult).toBeDefined();
      expect(snapshot.scanContext.decisionDisplay).toBe('Vào tự tin');
      expect(snapshot.scanContext.score).toBe(11);
    });

    it('deterministic — identical inputs produce identical halted flag', () => {
      const input = {
        signalRow: buildMinimalSignalRow(),
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
        entryStateManagerEnabled: true,
      };
      const first = runProductionEsmBridge(input);
      const second = runProductionEsmBridge(input);
      expect(first.halted).toBe(second.halted);
      expect(first.harnessResult?.pipelineResult.aggregateResult.triggerCount).toBe(
        second.harnessResult?.pipelineResult.aggregateResult.triggerCount,
      );
    });

    it('validateProductionEsmBridgeSnapshot passes when flag on', () => {
      const input = {
        signalRow: buildMinimalSignalRow(),
        scanId: SCAN_ID,
        timestamp: TIMESTAMP,
        entryStateManagerEnabled: true,
      };
      const snapshot = runProductionEsmBridge(input);
      expect(validateProductionEsmBridgeSnapshot(snapshot, input).valid).toBe(true);
    });
  });

  describe('namespace API', () => {
    it('ProductionEsmBridge exposes run + validate', () => {
      expect(ProductionEsmBridge.runProductionEsmBridge).toBe(runProductionEsmBridge);
      expect(ProductionEsmBridge.validateProductionEsmBridgeInput).toBe(
        validateProductionEsmBridgeInput,
      );
    });
  });
});
