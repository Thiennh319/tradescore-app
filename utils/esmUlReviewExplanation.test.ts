/**
 * UL Review explanation panel — tests.
 */

import { describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../types/scoring';
import type { LayerResult } from '../constants/scoring';
import { StateMachineEntryState } from '../services/entryStateManager';
import { runProductionEsmBridge } from '../services/productionEsmBridge';
import type { SignalRow } from '../services/signalBoardScan';
import { resolveEsmUlReviewDisplay } from './esmUiDisplay';
import { resolveEsmUlReviewExplanationPanel } from './esmUlReviewExplanation';

const SCAN_ID = 'ul-explain-btc-001';
const TIMESTAMP = '2026-07-13T14:48:15.000Z';

function buildLayer(name: string, reason: string, passed = true): LayerResult {
  return {
    layer: 'L1',
    name,
    score: passed ? 1.2 : 0,
    maxScore: 1.5,
    passed,
    isMandatory: false,
    isMandatoryViolation: false,
    reason,
  };
}

function buildMinimalSignalRow(
  symbol = 'BTCUSDT',
  overrides: Partial<SignalRow> = {},
): SignalRow {
  return {
    symbol,
    price: 63732,
    change24h: 0,
    trend: 'BEARISH',
    regimeConfidence: 0.84,
    score: 11,
    longScore: 6,
    shortScore: 11,
    direction: 'SHORT',
    decisionLabel: 'VAO_TU_TIN',
    decisionDisplay: 'Vào tự tin',
    winrate: '62%',
    canEnter: true,
    tradePlan: null,
    layers: [buildLayer('Trend', 'EMA stack bearish')],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
    v4: {
      score: 11,
      longScore: 6,
      shortScore: 11,
      direction: 'SHORT',
      decisionLabel: 'VAO_TU_TIN',
      decisionDisplay: 'Vào tự tin',
      winrate: '62%',
      canEnter: true,
      layers: [buildLayer('Trend', 'EMA stack bearish')],
      mandatoryViolations: [],
      hardBlocked: false,
      finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
      shortLayers: [buildLayer('Trend', 'EMA stack bearish')],
    },
    ...overrides,
  };
}

describe('resolveEsmUlReviewExplanationPanel', () => {
  it('returns panel aligned with UL Review label for ACTIVE OPEN trade', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.ACTIVE,
    });

    const review = resolveEsmUlReviewDisplay(snapshot, 'BTCUSDT');
    const panel = resolveEsmUlReviewExplanationPanel(snapshot, 'BTCUSDT', 'SHORT');

    expect(panel.hasContent).toBe(true);
    expect(panel.recommendation).toBe(review.label);
    if (review.label === 'Hold Position') {
      expect(panel.finalAction).toBe('HOLD');
      expect(panel.rejectedActions.some((a) => a.label === 'Close Position')).toBe(true);
    }
    expect(panel.updatedAt).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(panel.supportingReasons.some((r) => r.includes('Vào tự tin'))).toBe(true);
    expect(panel.supportingReasons.some((r) => r.includes('EMA stack bearish'))).toBe(true);
    expect(panel.supportingReasons.some((r) => r.includes('Entry conditions satisfied'))).toBe(
      false,
    );
    expect(panel.decisionScore).toBe('11 / 15');
    expect(panel.confidence).toBe(84);
    expect(panel.executiveSummary).not.toBeNull();
    expect(panel.executiveSummary?.whyReasons.length).toBeGreaterThan(0);
    expect(panel.executiveSummary?.advancedDiagnostics.length).toBeGreaterThan(0);
  });

  it('produces different explanations for different scan contexts', () => {
    const btcSnapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow('BTCUSDT', {
        decisionDisplay: 'Vào tự tin',
        shortScore: 11,
        v4: {
          score: 11,
          longScore: 6,
          shortScore: 11,
          direction: 'SHORT',
          decisionLabel: 'VAO_TU_TIN',
          decisionDisplay: 'Vào tự tin',
          winrate: '62%',
          canEnter: true,
          layers: [buildLayer('Trend', 'EMA stack bearish')],
          mandatoryViolations: [],
          hardBlocked: false,
          shortLayers: [buildLayer('Trend', 'EMA stack bearish')],
        },
      }),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.ACTIVE,
    });

    const ethSnapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow('ETHUSDT', {
        decisionDisplay: 'Chờ thêm',
        shortScore: 7,
        score: 7,
        v4: {
          score: 7,
          longScore: 9,
          shortScore: 7,
          direction: 'SHORT',
          decisionLabel: 'CHO_THEM',
          decisionDisplay: 'Chờ thêm',
          winrate: '54%',
          canEnter: false,
          layers: [buildLayer('Momentum', 'RSI neutral zone', false)],
          mandatoryViolations: [],
          hardBlocked: false,
          shortLayers: [buildLayer('Momentum', 'RSI neutral zone', false)],
          shortWarnings: ['ADX below threshold'],
        },
      }),
      scanId: `${SCAN_ID}-eth`,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.ACTIVE,
    });

    const btcPanel = resolveEsmUlReviewExplanationPanel(btcSnapshot, 'BTCUSDT', 'SHORT');
    const ethPanel = resolveEsmUlReviewExplanationPanel(ethSnapshot, 'ETHUSDT', 'SHORT');

    expect(btcPanel.supportingReasons).not.toEqual(ethPanel.supportingReasons);
    expect(btcPanel.supportingReasons.some((r) => r.includes('Vào tự tin'))).toBe(true);
    expect(ethPanel.supportingReasons.some((r) => r.includes('Chờ thêm'))).toBe(true);
    expect(ethPanel.warningFactors.some((w) => w.includes('ADX below threshold'))).toBe(true);
    expect(btcPanel.decisionScore).toBe('11 / 15');
    expect(ethPanel.decisionScore).toBe('7 / 15');
  });

  it('returns empty panel when symbol mismatches', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.ACTIVE,
    });

    const panel = resolveEsmUlReviewExplanationPanel(snapshot, 'ETHUSDT');
    expect(panel.hasContent).toBe(false);
  });

  it('returns empty panel when ESM disabled', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildMinimalSignalRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: false,
    });

    expect(resolveEsmUlReviewExplanationPanel(snapshot, 'BTCUSDT').hasContent).toBe(false);
  });
});
