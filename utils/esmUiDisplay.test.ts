/**
 * ESM UI display — tests (UL-03 / UL-03.1 / UL-03.2).
 */

import { describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../types/scoring';
import { StateMachineEntryState } from '../services/entryStateManager';
import { runProductionEsmBridge } from '../services/productionEsmBridge';
import type { SignalRow } from '../services/signalBoardScan';
import {
  ESM_HINT_PRIORITY,
  resolveEsmHintBadge,
  resolveEsmHintDisplay,
  resolveEsmRuleBookHint,
  resolveEsmTooltipLines,
  resolveHighestPriorityHint,
} from './esmUiDisplay';

const SCAN_ID = 'ul03-ui-btc-001';
const TIMESTAMP = '2026-07-12T14:00:00.000Z';

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

describe('resolveHighestPriorityHint — UL-03.2', () => {
  it('priority order is BLOCKED > LOCKED > WATCH > READY', () => {
    expect(ESM_HINT_PRIORITY).toEqual(['BLOCKED', 'LOCKED', 'WATCH', 'READY']);
  });

  it('picks BLOCKED when READY, WATCH, BLOCKED coexist', () => {
    expect(resolveHighestPriorityHint(['READY', 'WATCH', 'BLOCKED'])).toBe('BLOCKED');
  });

  it('picks LOCKED over WATCH and READY', () => {
    expect(resolveHighestPriorityHint(['READY', 'WATCH', 'LOCKED'])).toBe('LOCKED');
  });

  it('returns null when no valid candidates', () => {
    expect(resolveHighestPriorityHint([null, undefined])).toBeNull();
  });
});

describe('esmUiDisplay — UL-03.1 / UL-03.2', () => {
  it('maps READY state to ⓘ READY hint badge', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.READY,
    });

    expect(resolveEsmRuleBookHint(snapshot, 'BTCUSDT')).toBe('READY');
    expect(resolveEsmHintBadge(snapshot, 'BTCUSDT')).toBe('ⓘ READY');
  });

  it('maps WATCH state to ⓘ WATCH hint badge', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.WATCH,
    });

    expect(resolveEsmRuleBookHint(snapshot, 'BTCUSDT')).toBe('WATCH');
    expect(resolveEsmHintBadge(snapshot, 'BTCUSDT')).toBe('ⓘ WATCH');
  });

  it('maps IDLE to display-only Theo dõi — not WAIT business state', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.IDLE,
    });

    expect(resolveEsmRuleBookHint(snapshot, 'BTCUSDT')).toBeNull();
    expect(resolveEsmHintBadge(snapshot, 'BTCUSDT')).toBe('ⓘ Theo dõi');
  });

  it('returns null hint when symbol mismatches snapshot', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
    });

    expect(resolveEsmHintDisplay(snapshot, 'ETHUSDT').hintBadge).toBeNull();
  });

  it('returns null hint when ESM flag is off', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: false,
    });

    expect(resolveEsmHintBadge(snapshot, 'BTCUSDT')).toBeNull();
    expect(resolveEsmTooltipLines(snapshot, 'BTCUSDT').length).toBeLessThanOrEqual(4);
  });

  it('tooltip lines exclude technical pipeline text', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.BLOCKED,
    });

    const lines = resolveEsmTooltipLines(snapshot, 'BTCUSDT');
    expect(lines.length).toBeLessThanOrEqual(4);
    for (const line of lines) {
      expect(line.startsWith('• ')).toBe(true);
      expect(line.toLowerCase()).not.toMatch(/pipeline|harness|orchestrator/);
    }
  });

  it('hint display exposes single hintCode aligned with badge', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.BLOCKED,
    });

    const display = resolveEsmHintDisplay(snapshot, 'BTCUSDT');
    expect(display.hintCode).toBe('BLOCKED');
    expect(display.hintBadge).toBe('ⓘ BLOCKED');
  });
});
