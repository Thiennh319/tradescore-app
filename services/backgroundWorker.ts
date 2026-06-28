import { runPeriodicTradingWork } from './periodicTradingWork';
import { getVietnamDateParts, buildAutoRefreshLockKey } from '../store/useTradeStore';
import { shouldTriggerBackgroundSessionCheck } from './backgroundSessionSchedule';

/** Chạy mỗi phút từ expo-background-task (fallback khi foreground service không chạy). */
export async function runBackgroundTradingWork(now = new Date()): Promise<void> {
  await runPeriodicTradingWork(now);
}

/** Kiểm tra nhanh trước khi đánh thức task nặng (nếu cần). */
export function shouldRunBackgroundWorkNow(
  now = new Date(),
  settings = { triggerMinute: 2, autoCheckStartHour: 6, autoCheckEndHour: 22 },
): boolean {
  const parts = getVietnamDateParts(now);
  return shouldTriggerBackgroundSessionCheck(parts, settings);
}

export { buildAutoRefreshLockKey, getVietnamDateParts };
