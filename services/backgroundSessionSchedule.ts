import type { AppSettings } from '../constants/scoring';
import type { VietnamDateParts } from '../store/useTradeStore';
import { buildAutoRefreshLockKey } from '../store/useTradeStore';

/** Cửa sổ 15 phút sau :02 — khớp chu kỳ background task tối thiểu trên Android. */
export function shouldTriggerBackgroundSessionCheck(
  parts: VietnamDateParts,
  settings: Pick<AppSettings, 'triggerMinute' | 'autoCheckStartHour' | 'autoCheckEndHour'>,
  windowMinutes = 15,
): boolean {
  return (
    parts.hour >= settings.autoCheckStartHour &&
    parts.hour <= settings.autoCheckEndHour &&
    parts.minute >= settings.triggerMinute &&
    parts.minute < settings.triggerMinute + windowMinutes
  );
}

export function sessionLockKeyForParts(
  parts: VietnamDateParts,
  triggerMinute: number,
): string {
  return buildAutoRefreshLockKey(parts, triggerMinute);
}
