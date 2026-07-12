/**
 * Production ESM scan wiring — post-scan bridge → store (UL-04.0 / UL-04.1).
 *
 * **Purpose:** Wire Production Scan → Production Bridge → Store after scan completes.
 * **Does NOT** modify scan logic, scores, recommendations, or trading decisions.
 *
 * @module productionEsmBridge/productionEsmScanWiring
 */

import type { LockedTradePlan } from '../../constants/aiJournal';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { isEntryStateManagerEnabled } from '../../config/featureFlags';
import type { SignalRow } from '../signalBoardScan';
import { resolveEsmRuleBookHint } from '../../utils/esmUiDisplay';
import type { EsmBridgeState } from '../../store/esmBridgeTypes';
import { runProductionEsmBridge } from './productionEsmBridge';
import type { ProductionEsmBridgeSnapshot } from './productionEsmBridgeTypes';
import {
  writeEsmSnapshotToStoreIfChanged,
  type EsmSnapshotStoreWriter,
} from './esmStoreBridge';
import { resolveEligibleEsmSymbols } from './productionEsmSymbolFilter';

export const PRODUCTION_ESM_SCAN_WIRING_VERSION = 'UL-04.1' as const;

declare const __DEV__: boolean | undefined;

export interface EsmScanWiringStoreContext extends EsmSnapshotStoreWriter {
  esmBridge: EsmBridgeState;
  getVisibleAiJournal: () => AiTradeJournalEntry[];
  lockedPlan: LockedTradePlan | null;
}

export interface EsmScanWiringTiming {
  readonly scanDurationMs?: number;
}

export interface EsmScanWiringBenchmark {
  readonly scanMs: number;
  readonly bridgeMs: number;
  readonly storeMs: number;
  readonly totalAddedMs: number;
  readonly bridgeRuns: number;
  readonly storeWrites: number;
  readonly symbolsSkipped: number;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function formatCoinLabel(symbol: string): string {
  return symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
}

function logEsmBridgeDev(snapshot: ProductionEsmBridgeSnapshot): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  const coin = formatCoinLabel(snapshot.symbol);
  const hint = resolveEsmRuleBookHint(snapshot, snapshot.symbol) ?? '—';
  console.log('[ESM]');
  console.log('Bridge completed');
  console.log(coin);
  console.log(hint);
}

function logEsmBenchmarkDev(benchmark: EsmScanWiringBenchmark): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  console.log('[ESM]');
  console.log(`Scan Time: ${benchmark.scanMs.toFixed(1)}ms`);
  console.log(`Bridge Time: ${benchmark.bridgeMs.toFixed(1)}ms`);
  console.log(`Store Update Time: ${benchmark.storeMs.toFixed(1)}ms`);
  console.log(`Total Added Time: ${benchmark.totalAddedMs.toFixed(1)}ms`);
}

function buildSymbolFilterInput(
  store: EsmScanWiringStoreContext,
  rows: readonly SignalRow[],
): {
  journalEntries: readonly AiTradeJournalEntry[];
  lockedPlan: LockedTradePlan | null;
  activeScanSymbols: readonly string[];
} {
  return {
    journalEntries: store.getVisibleAiJournal(),
    lockedPlan: store.lockedPlan,
    activeScanSymbols: rows.map((row) => row.symbol).filter(Boolean),
  };
}

/**
 * Runs Production → ESM bridge for eligible scan rows and writes to store.
 *
 * No-op when {@link isEntryStateManagerEnabled} is false — silent, no throw.
 * Must run **after** scan completes — sequential, not parallel with scan.
 */
export function wireProductionEsmAfterScan(
  rows: readonly SignalRow[],
  scannedAt: number,
  store: EsmScanWiringStoreContext,
  timing: EsmScanWiringTiming = {},
): EsmScanWiringBenchmark {
  const emptyBenchmark: EsmScanWiringBenchmark = {
    scanMs: timing.scanDurationMs ?? 0,
    bridgeMs: 0,
    storeMs: 0,
    totalAddedMs: 0,
    bridgeRuns: 0,
    storeWrites: 0,
    symbolsSkipped: 0,
  };

  if (!isEntryStateManagerEnabled()) return emptyBenchmark;

  const filterInput = buildSymbolFilterInput(store, rows);
  const eligible = resolveEligibleEsmSymbols(filterInput);
  const timestamp = new Date(scannedAt).toISOString();
  const baseScanId = `ul04-${scannedAt}`;

  let bridgeMs = 0;
  let storeMs = 0;
  let bridgeRuns = 0;
  let storeWrites = 0;
  let symbolsSkipped = 0;

  for (const row of rows) {
    if (!row?.symbol || row.error) continue;

    if (!eligible.has(row.symbol)) {
      symbolsSkipped += 1;
      continue;
    }

    const bridgeStart = nowMs();
    try {
      const snapshot = runProductionEsmBridge({
        signalRow: row,
        scanId: `${baseScanId}-${row.symbol}`,
        timestamp,
        entryStateManagerEnabled: true,
      });
      bridgeMs += nowMs() - bridgeStart;
      bridgeRuns += 1;

      const storeStart = nowMs();
      const written = writeEsmSnapshotToStoreIfChanged(snapshot, store, {
        now: scannedAt,
        skipIfUnchanged: true,
      });
      storeMs += nowMs() - storeStart;

      if (written) {
        storeWrites += 1;
        logEsmBridgeDev(snapshot);
      }
    } catch {
      bridgeMs += nowMs() - bridgeStart;
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[ESM]');
        console.log('Bridge skipped');
        console.log(formatCoinLabel(row.symbol));
      }
    }
  }

  const benchmark: EsmScanWiringBenchmark = {
    scanMs: timing.scanDurationMs ?? 0,
    bridgeMs,
    storeMs,
    totalAddedMs: bridgeMs + storeMs,
    bridgeRuns,
    storeWrites,
    symbolsSkipped,
  };

  logEsmBenchmarkDev(benchmark);
  return benchmark;
}

/** Namespace for scan wiring discoverability. */
export const ProductionEsmScanWiring = {
  PRODUCTION_ESM_SCAN_WIRING_VERSION,
  wireProductionEsmAfterScan,
} as const;
