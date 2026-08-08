import { useV41Store } from '../store/useV41Store';
import { useUnifiedStore } from '../store/useUnifiedStore';
import {
  buildUnifiedSignal,
  compareUnifiedSignalPriority,
  type SignalRowWithDirSnapshots,
  type UnifiedSignalResult,
} from './unifiedSignalEngine';
import type { SignalRow } from './signalBoardScan';
import { loadPersistedSignalBoard } from './signalBoardPersist';
import { resolveSignalRow } from './signalRowView';
import { resolveSnapEntryBlocked } from './entryBlockedLabeling';
import { computeEntryQuality } from './v41/entryQualityEngine';
import { NEUTRAL_PROTECTION } from './v41/protectionLayer';
import type { SignalRowV41 } from './v41/scanV41';

const V4_MIN_SCORE = 9;

/**
 * V4 không có zustand store — SignalBoard nhận `rows` từ hook useSignalBoard
 * (React state). Sau mỗi lần quét, useSignalBoard ghi vào signal-board-cache
 * qua savePersistedSignalBoard — đây là nguồn đọc cho unified scan.
 */
async function loadV4Rows(): Promise<SignalRow[]> {
  const persisted = await loadPersistedSignalBoard();
  return persisted?.rows ?? [];
}

/** buildUnifiedSignal cần longSnapshot/shortSnapshot — enrich từ row.v4 snapshot. */
function enrichV4RowForUnified(row: SignalRow): SignalRowWithDirSnapshots {
  const snap = resolveSignalRow(row, 'v4');
  const ambiguous = snap.isAmbiguousDirection === true;
  const awaiting = snap.awaitingRescore === true;

  const longHardBlocked =
    (snap.longHardBlocks?.length ?? 0) > 0 ||
    (snap.direction === 'LONG' && resolveSnapEntryBlocked(snap));
  const shortHardBlocked =
    (snap.shortHardBlocks?.length ?? 0) > 0 ||
    (snap.direction === 'SHORT' && resolveSnapEntryBlocked(snap));
  const longGroupBlocked = (snap.longGroupBlocks?.length ?? 0) > 0;
  const shortGroupBlocked = (snap.shortGroupBlocks?.length ?? 0) > 0;

  const longCanEnter =
    snap.longScore >= V4_MIN_SCORE &&
    !ambiguous &&
    !longHardBlocked &&
    !longGroupBlocked &&
    !(awaiting && snap.direction === 'LONG');

  const shortCanEnter =
    snap.shortScore >= V4_MIN_SCORE &&
    !ambiguous &&
    !shortHardBlocked &&
    !shortGroupBlocked &&
    !(awaiting && snap.direction === 'SHORT');

  return {
    ...row,
    longScore: snap.longScore,
    shortScore: snap.shortScore,
    longSnapshot: { canEnter: longCanEnter },
    shortSnapshot: { canEnter: shortCanEnter },
  };
}

export function hasV41SnapshotData(symbols: string[]): boolean {
  const v41 = useV41Store.getState();
  return symbols.some((symbol) => v41.getSymbolState(symbol).lastSnapshot != null);
}

/** Ít nhất một nguồn V4 (cache) hoặc V4.1 (lastSnapshot) đã sẵn sàng. */
export async function hasUnifiedSourceData(symbols: string[]): Promise<boolean> {
  const v4Rows = await loadV4Rows();
  if (v4Rows.length > 0) return true;
  return hasV41SnapshotData(symbols);
}

function buildV41Row(symbol: string): SignalRowV41 | undefined {
  const v41State = useV41Store.getState().getSymbolState(symbol);
  const v41Snapshot = v41State.lastSnapshot;
  if (!v41Snapshot) return undefined;

  return {
    symbol,
    snapshot: v41Snapshot,
    visibilityMode: v41State.previousMode,
    opportunity: computeEntryQuality({
      snapshot: v41Snapshot,
      protection: NEUTRAL_PROTECTION,
    }),
    protection: NEUTRAL_PROTECTION,
    fetchedAt: v41State.updatedAt ?? Date.now(),
  };
}

function scanOneSymbol(symbol: string, v4Rows: SignalRow[]): UnifiedSignalResult {
  const rawV4Row = v4Rows.find((r) => r.symbol === symbol);
  const v4Row = rawV4Row ? enrichV4RowForUnified(rawV4Row) : undefined;
  const v41Row = buildV41Row(symbol);

  if (!v4Row && !v41Row) {
    return buildUnifiedSignal({ symbol });
  }

  return buildUnifiedSignal({ symbol, v4Row, v41Row });
}

/**
 * Merge V4 + V4.1 từ store hiện có — không fetch thêm.
 * V4 đọc từ signal-board-cache (cùng nguồn useSignalBoard persist).
 */
export async function scanUnified(symbols: string[]): Promise<UnifiedSignalResult[]> {
  useUnifiedStore.getState().setScanning(true);

  try {
    const v4Rows = await loadV4Rows();
    const results = symbols.map((symbol) => scanOneSymbol(symbol, v4Rows));
    results.sort((a, b) => compareUnifiedSignalPriority(b, a));
    useUnifiedStore.getState().setSignals(results);
    return results;
  } finally {
    useUnifiedStore.getState().setScanning(false);
  }
}
