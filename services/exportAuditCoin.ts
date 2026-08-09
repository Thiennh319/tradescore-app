/**
 * Audit Export — Coin selection helpers (SignalBoard Export Trace toolbar).
 * Pure: no RN / no I/O. Used by UI + unit tests.
 */
import { COLORS, TRADE_SYMBOLS, type AppTradeSymbol } from '../constants/scoring';
import type { SignalRow } from './signalBoardScan';

/** 'ALL' = export every TRADE_SYMBOLS entry; else one futures symbol. */
export type AuditExportCoinSelection = 'ALL' | AppTradeSymbol;

export const AUDIT_EXPORT_COIN_DOT_ALL = COLORS.textSecondary; // #848E9C — mockup --text2

/** Brand dots — must match docs/ui-mockups/export-coin-dropdown/mockup.html */
export const AUDIT_EXPORT_COIN_BRAND: Record<AppTradeSymbol, string> = {
  BTCUSDT: '#F7931A',
  NEARUSDT: '#00C08B',
  SOLUSDT: '#9945FF',
  BNBUSDT: '#F0B90B',
  XRPUSDT: '#23292F',
  ETHUSDT: '#627EEA',
  LINKUSDT: '#2A5ADA',
  AVAXUSDT: '#E84142',
};

export type AuditExportCoinOption = {
  id: AuditExportCoinSelection;
  label: string;
  color: string;
  /** Tree child under "Tất cả coin" */
  treeChild: boolean;
};

export const AUDIT_EXPORT_COIN_OPTIONS: readonly AuditExportCoinOption[] = [
  { id: 'ALL', label: 'Tất cả coin', color: AUDIT_EXPORT_COIN_DOT_ALL, treeChild: false },
  { id: 'BTCUSDT', label: 'BTC', color: AUDIT_EXPORT_COIN_BRAND.BTCUSDT, treeChild: true },
  { id: 'NEARUSDT', label: 'NEAR', color: AUDIT_EXPORT_COIN_BRAND.NEARUSDT, treeChild: true },
  { id: 'SOLUSDT', label: 'SOL', color: AUDIT_EXPORT_COIN_BRAND.SOLUSDT, treeChild: true },
  { id: 'BNBUSDT', label: 'BNB', color: AUDIT_EXPORT_COIN_BRAND.BNBUSDT, treeChild: true },
  { id: 'XRPUSDT', label: 'XRP', color: AUDIT_EXPORT_COIN_BRAND.XRPUSDT, treeChild: true },
  { id: 'ETHUSDT', label: 'ETH', color: AUDIT_EXPORT_COIN_BRAND.ETHUSDT, treeChild: true },
  { id: 'LINKUSDT', label: 'LINK', color: AUDIT_EXPORT_COIN_BRAND.LINKUSDT, treeChild: true },
  { id: 'AVAXUSDT', label: 'AVAX', color: AUDIT_EXPORT_COIN_BRAND.AVAXUSDT, treeChild: true },
];

export function auditExportCoinLabel(selection: AuditExportCoinSelection): string {
  const hit = AUDIT_EXPORT_COIN_OPTIONS.find((o) => o.id === selection);
  return hit?.label ?? selection;
}

export function auditExportCoinDotColor(selection: AuditExportCoinSelection): string {
  const hit = AUDIT_EXPORT_COIN_OPTIONS.find((o) => o.id === selection);
  return hit?.color ?? AUDIT_EXPORT_COIN_DOT_ALL;
}

/** Coins to pass as `context.coin` for one Export press. */
export function resolveExportCoins(
  selection: AuditExportCoinSelection,
): readonly AppTradeSymbol[] {
  if (selection === 'ALL') return TRADE_SYMBOLS;
  return [selection];
}

/** `01_RULEBOOK.md` + NEARUSDT → `01_RULEBOOK_NEARUSDT.md` */
export function exportFilenameForCoin(baseFilename: string, coin: string): string {
  const dot = baseFilename.lastIndexOf('.');
  if (dot <= 0) return `${baseFilename}_${coin}`;
  return `${baseFilename.slice(0, dot)}_${coin}${baseFilename.slice(dot)}`;
}

export type ExportCoinGate = {
  disabled: boolean;
  reason: string | null;
};

/**
 * Disable Export when the selected coin(s) cannot be exported from frozen rows.
 * - loading / empty board
 * - single coin: missing row or row.error
 * - ALL: no healthy row among TRADE_SYMBOLS
 */
export function resolveExportCoinGate(
  selection: AuditExportCoinSelection,
  rows: readonly SignalRow[],
  loading: boolean,
): ExportCoinGate {
  if (loading) {
    return { disabled: true, reason: 'Đang quét tín hiệu — chờ scan xong rồi Export.' };
  }
  if (rows.length === 0) {
    return { disabled: true, reason: 'Chưa có dữ liệu scan — bấm Quét trước.' };
  }

  if (selection !== 'ALL') {
    const row = rows.find((r) => r.symbol === selection);
    if (row == null) {
      return {
        disabled: true,
        reason: `${auditExportCoinLabel(selection)} chưa có trong kết quả scan.`,
      };
    }
    if (row.error) {
      return {
        disabled: true,
        reason: `${auditExportCoinLabel(selection)} lỗi scan: ${row.error}`,
      };
    }
    return { disabled: false, reason: null };
  }

  const healthy = TRADE_SYMBOLS.filter((sym) => {
    const row = rows.find((r) => r.symbol === sym);
    return row != null && !row.error;
  });
  if (healthy.length === 0) {
    return {
      disabled: true,
      reason: 'Không có coin nào sẵn sàng export (thiếu scan hoặc toàn lỗi).',
    };
  }
  return { disabled: false, reason: null };
}

/** Healthy subset when exporting "Tất cả coin" (skip errored / missing). */
export function resolveHealthyExportCoins(
  selection: AuditExportCoinSelection,
  rows: readonly SignalRow[],
): AppTradeSymbol[] {
  return resolveExportCoins(selection).filter((sym) => {
    const row = rows.find((r) => r.symbol === sym);
    return row != null && !row.error;
  });
}
