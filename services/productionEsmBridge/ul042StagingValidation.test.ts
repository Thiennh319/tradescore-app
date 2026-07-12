/**
 * UL-04.2 — Staging Validation harness (DEV/STAGING only).
 *
 * Simulates 30–50 scan rounds, snapshot isolation, exports, performance, regression.
 * Not a feature task — validation only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as featureFlags from '../../config/featureFlags';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { FinalEntryStatus } from '../../types/scoring';
import { DEFAULT_ESM_BRIDGE_STATE } from '../../store/esmBridgeTypes';
import { getEsmSnapshotForSymbol } from '../../store/esmBridgeTypes';
import { useTradeStore } from '../../store/useTradeStore';
import { exportTradeScoreAuditPackage } from '../exportService';
import { exportEntrySltpAuditPackage } from '../exportEntrySltpAuditPackage';
import { exportAiReviewReport } from '../exportAiReviewReport';
import type { SignalRow } from '../signalBoardScan';
import {
  resolveEsmHintBadge,
  resolveEsmHintDisplay,
} from '../../utils/esmUiDisplay';
import {
  buildArchitectureVersionMatrix,
  formatArchitectureVersionMatrix,
  formatFeatureFlagSummary,
  resolveRuntimeFeatureFlags,
} from '../../utils/architectureExportMetadata';
import { wireProductionEsmAfterScan } from './productionEsmScanWiring';

const SCAN_ROUNDS = 40;
const SCANNED_AT = 1_752_100_000_000;
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
const SIMULATED_SCAN_MS = 100;

function buildRow(symbol: string, score = 11): SignalRow {
  return {
    symbol,
    price: symbol === 'BTCUSDT' ? 100_000 : symbol === 'ETHUSDT' ? 3_500 : 180,
    change24h: 0.5,
    trend: 'BULLISH',
    regimeConfidence: 0.8,
    score,
    longScore: score,
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

function journalEntry(
  symbol: string,
  status: AiTradeJournalEntry['outcome']['status'],
  recommendationLabel = 'Giữ lệnh',
): AiTradeJournalEntry {
  return {
    id: `j-${symbol}-${status}`,
    timestamp: SCANNED_AT,
    symbol,
    accountSizeAtEntry: 1000,
    market: { entryPrice: 100, markPrice: 101, btcChange24h: 0 },
    scoring: {
      totalScore: 11,
      direction: 'LONG',
      layerScores: {},
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
      recommendationLabel,
    },
    plan: {
      entryZoneType: 'LIMIT',
      entryZoneOptimal: 100,
      entryZoneRangeLow: 99,
      entryZoneRangeHigh: 101,
      slProposed: 95,
      slActual: 95,
      tp1Proposed: 110,
      tp1Actual: 110,
      tp2: 120,
      tp3: 130,
      rrProposed: 2,
      sizeProposed: 100,
      sizeActual: 100,
      isSafeSL: true,
    },
    outcome: { status },
    tags: [],
    version: '1',
  };
}

function cloneRows(rows: readonly SignalRow[]): SignalRow[] {
  return rows.map((row) => ({ ...row, layers: [...row.layers], mandatoryViolations: [...row.mandatoryViolations] }));
}

function resetStore(): void {
  useTradeStore.setState({
    esmBridge: { ...DEFAULT_ESM_BRIDGE_STATE },
    aiTradeJournal: [
      journalEntry('BTCUSDT', 'OPEN', 'Giữ lệnh — PA primary'),
      journalEntry('ETHUSDT', 'PENDING', 'Chờ khớp'),
    ],
    lockedPlan: {
      symbol: 'SOLUSDT',
      direction: 'LONG',
      status: 'WAITING',
      expiresAt: SCANNED_AT + 3_600_000,
      lockedScore: 10,
      decisionLabel: 'VAO_TU_TIN',
    } as never,
  });
}

function runScanRound(scannedAt: number, rows: readonly SignalRow[]) {
  return wireProductionEsmAfterScan(rows, scannedAt, useTradeStore.getState(), {
    scanDurationMs: SIMULATED_SCAN_MS,
  });
}

describe('UL-04.2 — Staging Validation', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
    vi.spyOn(featureFlags, 'isEntryStateManagerEnabled').mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('PART 2 — Scan stability (40 rounds)', () => {
    it('completes 40 scan rounds without crash or exception', () => {
      const rows = SYMBOLS.map((s) => buildRow(s));
      const errors: unknown[] = [];
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      let totalBridgeRuns = 0;
      let totalStoreWrites = 0;

      for (let i = 0; i < SCAN_ROUNDS; i++) {
        try {
          const benchmark = runScanRound(SCANNED_AT + i, rows);
          totalBridgeRuns += benchmark.bridgeRuns;
          totalStoreWrites += benchmark.storeWrites;
        } catch (err) {
          errors.push(err);
        }
      }

      expect(errors).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(totalBridgeRuns).toBe(SCAN_ROUNDS * 3);
      expect(totalStoreWrites).toBeGreaterThan(0);
      expect(totalStoreWrites).toBeLessThanOrEqual(SCAN_ROUNDS * 3);
    });

    it('does not grow snapshot keys beyond eligible symbols (no leak)', () => {
      const rows = SYMBOLS.map((s) => buildRow(s));

      for (let i = 0; i < SCAN_ROUNDS + 10; i++) {
        runScanRound(SCANNED_AT + i, rows);
      }

      const keys = Object.keys(useTradeStore.getState().esmBridge.snapshotBySymbol);
      expect(keys.sort()).toEqual([...SYMBOLS].sort());
      expect(keys).not.toContain('XRPUSDT');
    });
  });

  describe('PART 3 — Journal / ESM display', () => {
    it('PA recommendation stays primary — ESM is hint badge only', () => {
      runScanRound(SCANNED_AT, SYMBOLS.map((s) => buildRow(s)));
      const esmBridge = useTradeStore.getState().esmBridge;
      const btcEntry = useTradeStore.getState().aiTradeJournal.find((e) => e.symbol === 'BTCUSDT')!;

      const paLabel = btcEntry.scoring.recommendationLabel ?? '—';
      expect(paLabel).toContain('PA primary');

      const hint = resolveEsmHintDisplay(
        getEsmSnapshotForSymbol(esmBridge, 'BTCUSDT'),
        'BTCUSDT',
      );
      expect(hint.hintBadge).toBeTruthy();
      expect(hint.hintBadge).not.toBe(paLabel);
      if (hint.tooltipLines.length > 0) {
        expect(hint.tooltipLines.join(' ')).not.toMatch(/pipeline|harness|scan\s*id/i);
      }
    });

    it('no cross-symbol hint bleed', () => {
      runScanRound(SCANNED_AT, SYMBOLS.map((s) => buildRow(s)));
      const esmBridge = useTradeStore.getState().esmBridge;

      for (const symbol of SYMBOLS) {
        const snapshot = getEsmSnapshotForSymbol(esmBridge, symbol);
        expect(snapshot?.symbol).toBe(symbol);

        for (const other of SYMBOLS) {
          if (other === symbol) continue;
          const wrongBadge = resolveEsmHintBadge(snapshot, other);
          expect(wrongBadge).toBeNull();
        }
      }
    });
  });

  describe('PART 4 — snapshotBySymbol', () => {
    it('BTC / ETH / SOL do not overwrite each other', () => {
      runScanRound(SCANNED_AT, SYMBOLS.map((s) => buildRow(s)));
      const { snapshotBySymbol } = useTradeStore.getState().esmBridge;

      expect(snapshotBySymbol.BTCUSDT?.symbol).toBe('BTCUSDT');
      expect(snapshotBySymbol.ETHUSDT?.symbol).toBe('ETHUSDT');
      expect(snapshotBySymbol.SOLUSDT?.symbol).toBe('SOLUSDT');

      const btcScanId = snapshotBySymbol.BTCUSDT?.scanId;
      runScanRound(SCANNED_AT + 1, [buildRow('ETHUSDT', 12)]);
      expect(useTradeStore.getState().esmBridge.snapshotBySymbol.BTCUSDT?.scanId).toBe(btcScanId);
    });

    it('delta update skips lastUpdated when material fields unchanged', () => {
      const rows = SYMBOLS.map((s) => buildRow(s));
      runScanRound(SCANNED_AT, rows);
      const first = { ...useTradeStore.getState().esmBridge.lastUpdatedBySymbol };

      runScanRound(SCANNED_AT + 1, rows);
      const second = useTradeStore.getState().esmBridge.lastUpdatedBySymbol;

      for (const symbol of SYMBOLS) {
        expect(second[symbol]).toBe(first[symbol]);
      }
    });
  });

  describe('PART 5 — Export validation', () => {
    it('Full Audit export succeeds with valid structure', () => {
      const rows = SYMBOLS.map((s) => buildRow(s));
      const output = exportTradeScoreAuditPackage(rows, 'v4');
      expect(output.length).toBeGreaterThan(500);
      expect(output).toContain('RULE BOOK');
      expect(output).toContain('EXECUTIVE SUMMARY');
      expect(output).toContain('BTCUSDT');
    });

    it('Entry / SL / TP Audit export succeeds', () => {
      const rows = SYMBOLS.map((s) => buildRow(s));
      const output = exportEntrySltpAuditPackage(rows, 'v4');
      expect(output).toContain('ENTRY/SL/TP RULE BOOK');
      expect(output).toContain('ACTUAL TRADE PLAN');
    });

    it('AI Review Report — markdown, version matrix, flags, runtime snapshot', () => {
      runScanRound(SCANNED_AT, SYMBOLS.map((s) => buildRow(s)));
      const state = useTradeStore.getState();
      const md = exportAiReviewReport({
        generatedAt: new Date(SCANNED_AT).toISOString(),
        scorerVersion: 'v4',
        signalRows: SYMBOLS.map((s) => buildRow(s)),
        esmBridge: state.esmBridge,
        journalEntries: state.aiTradeJournal,
        pendingOrders: state.aiTradeJournal.filter((e) => e.outcome.status === 'PENDING'),
        runningOrders: state.aiTradeJournal.filter((e) => e.outcome.status === 'OPEN'),
        closedTrades: [],
        accountHistory: [],
        advisorLabelById: { 'j-BTCUSDT-OPEN': 'Giữ — live PA' },
        testCount: 409,
      });

      expect(md.startsWith('# TradeScore AI Review')).toBe(true);
      expect(md).toContain('# Architecture Version Matrix');
      expect(md).toContain('# Feature Flags');
      expect(md).toContain('UI Layer');
      expect(md).toContain('ENTRY_STATE_MANAGER_ENABLED');
      expect(md).toContain('### BTCUSDT');
      expect(md).toContain('PA **Giữ — live PA**');
      expect(md).not.toContain('.zip');

      const matrix = buildArchitectureVersionMatrix(new Date(SCANNED_AT).toISOString());
      const matrixText = formatArchitectureVersionMatrix(matrix);
      expect(matrixText).toContain('TradeScore Version');
      expect(matrixText).toContain('Production Bridge');

      const flags = resolveRuntimeFeatureFlags({
        esmBridge: state.esmBridge,
        journalEntryCount: state.aiTradeJournal.length,
      });
      const flagText = formatFeatureFlagSummary(flags);
      expect(flagText).toContain('ENTRY_STATE_MANAGER_ENABLED');
      expect(flags.entryStateManagerEnabled).toBe(true);
    });
  });

  describe('PART 6 — Performance (Bridge OFF vs ON)', () => {
    it('bridge ON overhead within 10% of simulated scan time per round', () => {
      const rows = SYMBOLS.map((s) => buildRow(s));
      let offMs = 0;
      let onBridgeMs = 0;
      let onStoreMs = 0;

      vi.spyOn(featureFlags, 'isEntryStateManagerEnabled').mockReturnValue(false);
      const offStart = performance.now();
      for (let i = 0; i < SCAN_ROUNDS; i++) {
        runScanRound(SCANNED_AT + i, rows);
      }
      offMs = performance.now() - offStart;

      resetStore();
      vi.spyOn(featureFlags, 'isEntryStateManagerEnabled').mockReturnValue(true);

      for (let i = 0; i < SCAN_ROUNDS; i++) {
        const b = runScanRound(SCANNED_AT + i, rows);
        onBridgeMs += b.bridgeMs;
        onStoreMs += b.storeMs;
      }

      const simulatedScanTotal = SIMULATED_SCAN_MS * SCAN_ROUNDS;
      const totalAdded = onBridgeMs + onStoreMs;
      const overheadPct = (totalAdded / simulatedScanTotal) * 100;

      expect(offMs).toBeLessThan(simulatedScanTotal * 0.05);
      expect(overheadPct).toBeLessThan(10);
      expect(onBridgeMs).toBeGreaterThan(0);
    });
  });

  describe('PART 7 — Regression checklist', () => {
    it('scan rows unchanged after ESM wiring', () => {
      const rows = cloneRows(SYMBOLS.map((s) => buildRow(s)));
      const before = JSON.stringify(rows);

      runScanRound(SCANNED_AT, rows);

      expect(JSON.stringify(rows)).toBe(before);
    });

    it('journal entries unchanged after ESM wiring', () => {
      const before = JSON.stringify(useTradeStore.getState().aiTradeJournal);
      runScanRound(SCANNED_AT, SYMBOLS.map((s) => buildRow(s)));
      expect(JSON.stringify(useTradeStore.getState().aiTradeJournal)).toBe(before);
    });

    it('locked plan unchanged after ESM wiring', () => {
      const before = JSON.stringify(useTradeStore.getState().lockedPlan);
      runScanRound(SCANNED_AT, SYMBOLS.map((s) => buildRow(s)));
      expect(JSON.stringify(useTradeStore.getState().lockedPlan)).toBe(before);
    });
  });
});

describe('UL-04.2 — Production default', () => {
  it('FEATURE_FLAGS compile-time default remains OFF', () => {
    expect(featureFlags.FEATURE_FLAGS.ENTRY_STATE_MANAGER_ENABLED).toBe(false);
  });
});
