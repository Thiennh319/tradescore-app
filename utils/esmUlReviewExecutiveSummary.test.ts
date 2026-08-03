/**
 * UL Review Executive Summary — presentation tests.
 */

import { describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../types/scoring';
import type { LayerResult } from '../constants/scoring';
import { StateMachineEntryState } from '../services/entryStateManager';
import { runProductionEsmBridge } from '../services/productionEsmBridge';
import type { SignalRow } from '../services/signalBoardScan';
import { resolveEsmUlReviewExplanationPanel } from './esmUlReviewExplanation';

const SCAN_ID = 'ul-exec-btc-001';
const TIMESTAMP = '2026-07-13T14:48:15.000Z';

function buildLayer(
  name: string,
  reason: string,
  passed = true,
  layer: LayerResult['layer'] = 1,
): LayerResult {
  return {
    layer,
    name,
    score: passed ? 1.2 : 0,
    maxScore: 1.5,
    passed,
    isMandatory: false,
    isMandatoryViolation: false,
    reason,
  };
}

function buildRow(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 63732,
    change24h: 0,
    trend: 'BEARISH',
    regimeConfidence: 0.86,
    score: 11,
    longScore: 6,
    shortScore: 11,
    direction: 'SHORT',
    decisionLabel: 'VAO_TU_TIN',
    decisionDisplay: 'Vào tự tin',
    winrate: '62%',
    canEnter: true,
    tradePlan: null,
    layers: [buildLayer('L5a — CVD Strength', 'CVD bearish flow', true, 5)],
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
      layers: [buildLayer('L5a — CVD Strength', 'CVD bearish flow', true, 5)],
      mandatoryViolations: [],
      hardBlocked: false,
      shortLayers: [buildLayer('L5a — CVD Strength', 'CVD bearish flow', true, 5)],
    },
    ...overrides,
  };
}

describe('resolveEsmUlReviewExecutiveSummary (via panel)', () => {
  it('translates layer diagnostics into trader WHY copy', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.ACTIVE,
    });

    const panel = resolveEsmUlReviewExplanationPanel(snapshot, 'BTCUSDT', 'SHORT');
    const summary = panel.executiveSummary;

    expect(summary).not.toBeNull();
    expect(summary?.whyReasons.some((r) => /áp lực|setup|xu hướng|trend/i.test(r))).toBe(true);
    expect(summary?.whyReasons.some((r) => /L5a CVD/i.test(r))).toBe(false);
    expect(summary?.advancedDiagnostics.some((r) => /L5a|CVD/i.test(r))).toBe(true);
  });

  it('produces different summaries for HOLD vs CLOSE recommendations', () => {
    const holdSnapshot = runProductionEsmBridge({
      signalRow: buildRow(),
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.ACTIVE,
    });

    const closeSnapshot = runProductionEsmBridge({
      signalRow: buildRow({
        decisionDisplay: 'Không vào',
        hardBlocked: true,
        canEnter: false,
        layers: [buildLayer('EMA20 Slope', 'Trend broken', false)],
        v4: {
          score: 4,
          longScore: 4,
          shortScore: 9,
          direction: 'SHORT',
          decisionLabel: 'KHONG_VAO',
          decisionDisplay: 'Không vào',
          winrate: '50%',
          canEnter: false,
          layers: [buildLayer('EMA20 Slope', 'Trend broken', false)],
          mandatoryViolations: [],
          hardBlocked: true,
          shortLayers: [buildLayer('EMA20 Slope', 'Trend broken', false)],
        },
      }),
      scanId: `${SCAN_ID}-close`,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.ACTIVE,
    });

    const holdPanel = resolveEsmUlReviewExplanationPanel(holdSnapshot, 'BTCUSDT', 'SHORT');
    const closePanel = resolveEsmUlReviewExplanationPanel(closeSnapshot, 'BTCUSDT', 'SHORT');

    expect(holdPanel.executiveSummary?.decisionKind).toMatch(/HOLD/);
    expect(closePanel.executiveSummary?.decisionKind).toBe('EXIT');
    expect(holdPanel.executiveSummary?.nextAction).not.toBe(closePanel.executiveSummary?.nextAction);
  });

  it('maps WATCH pre-entry scan to WAIT executive summary', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildRow({
        decisionDisplay: 'Chờ thêm',
        canEnter: false,
        score: 7,
        shortScore: 7,
        layers: [buildLayer('Momentum', 'RSI neutral zone', false, 2)],
        v4: {
          score: 7,
          longScore: 9,
          shortScore: 7,
          direction: 'SHORT',
          decisionLabel: 'CHO_THEM',
          decisionDisplay: 'Chờ thêm',
          winrate: '54%',
          canEnter: false,
          layers: [buildLayer('Momentum', 'RSI neutral zone', false, 2)],
          mandatoryViolations: [],
          hardBlocked: false,
          shortLayers: [buildLayer('Momentum', 'RSI neutral zone', false, 2)],
        },
      }),
      scanId: `${SCAN_ID}-wait`,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.WATCH,
    });

    const panel = resolveEsmUlReviewExplanationPanel(snapshot, 'BTCUSDT', 'SHORT');
    expect(panel.executiveSummary?.decisionKind).toBe('WAIT');
    expect(panel.executiveSummary?.nextAction).toMatch(/xác nhận/i);
  });

  it('keeps raw layer lines in advanced diagnostics only', () => {
    const snapshot = runProductionEsmBridge({
      signalRow: buildRow({
        layers: [
          buildLayer('RSI 14', 'Overbought zone', true, 2),
          buildLayer('MACD Histogram', 'Weakening', false, 3),
        ],
        v4: {
          score: 11,
          longScore: 6,
          shortScore: 11,
          direction: 'SHORT',
          decisionLabel: 'VAO_TU_TIN',
          decisionDisplay: 'Vào tự tin',
          winrate: '62%',
          canEnter: true,
          layers: [
            buildLayer('RSI 14', 'Overbought zone', true, 2),
            buildLayer('MACD Histogram', 'Weakening', false, 3),
          ],
          mandatoryViolations: [],
          hardBlocked: false,
          shortLayers: [
            buildLayer('RSI 14', 'Overbought zone', true, 2),
            buildLayer('MACD Histogram', 'Weakening', false, 3),
          ],
        },
      }),
      scanId: `${SCAN_ID}-layers`,
      timestamp: TIMESTAMP,
      entryStateManagerEnabled: true,
      currentState: StateMachineEntryState.ACTIVE,
    });

    const panel = resolveEsmUlReviewExplanationPanel(snapshot, 'BTCUSDT', 'SHORT');
    const summary = panel.executiveSummary;

    expect(summary?.advancedDiagnostics.some((l) => l.includes('RSI 14'))).toBe(true);
    expect(summary?.advancedDiagnostics.some((l) => l.includes('MACD'))).toBe(true);
    expect(summary?.whyReasons.join(' ')).not.toMatch(/L2|L3/);
  });
});
