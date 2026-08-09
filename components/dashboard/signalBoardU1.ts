import type { TradeDirection } from '../../constants/scoring';

/**
 * U1 — chỉ nút hướng official (`suggestDirectionV4` → snap.direction) được enter;
 * khi AMBIGUOUS cả hai tắt. Task 3 architecture
 * (REPORT_TASK3_ARCHITECTURE_AMBIGUITY_2P5_UI_U1_2026-08-02.md).
 */
export function isU1DirectionButtonEnabled(opts: {
  side: TradeDirection;
  officialDirection: TradeDirection;
  isAmbiguous: boolean;
  directionReady: boolean;
}): boolean {
  if (opts.isAmbiguous) return false;
  if (opts.side !== opts.officialDirection) return false;
  return opts.directionReady;
}

/**
 * Badge "Sẵn sàng" / READY phải dùng cùng điều kiện với nút LONG/SHORT (và mũi tên tip).
 * Không dùng totalScore≥9 hay canEnter tổng hợp — tránh badge xanh trong khi nút xám.
 */
export function shouldShowReadyBadge(
  longBtnEnabled: boolean,
  shortBtnEnabled: boolean,
): boolean {
  return longBtnEnabled || shortBtnEnabled;
}
