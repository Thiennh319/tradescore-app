import { shouldTriggerBackgroundSessionCheck, sessionLockKeyForParts } from './backgroundSessionSchedule';
import { Platform } from 'react-native';
import { buildSessionCheckMessage } from './sessionNotificationMessage';
import {
  getNativePermissionStatus,
  presentLocalNotification,
  SESSION_CHANNEL_ID,
} from './localNotification';
import { isSessionNotificationsEnabled } from './notificationPreferences';
import { fillPendingOrdersPersisted } from './periodicScanService';
import { runPriceLevelMonitor } from './priceLevelMonitor';
import { scanAllSignalRows } from './signalBoardScan';
import { wireProductionEsmAfterScan } from './productionEsmBridge/productionEsmScanWiring';
import { savePersistedSignalBoard } from './signalBoardPersist';
import {
  loadPersistedSignalScanContext,
} from './signalScanContext';
import {
  getBackgroundSessionLock,
  loadPersistedPsychologyContext,
  loadPersistedScoringPsychology,
  loadPersistedTimeframe,
  setBackgroundSessionLock,
} from './tradeStorePersist';
import {
  buildAutoRefreshLockKey,
  getVietnamDateParts,
  shouldTriggerAutoCheck,
  useTradeStore,
} from '../store/useTradeStore';
import { runWhaleRadarScanIfDue } from './whaleRadarScan';

export interface PeriodicWorkResult {
  scannedAt: number;
  setupCount: number;
  rowCount: number;
  timeframe: string;
}

async function runPriceLevelAlerts(): Promise<void> {
  try {
    await runPriceLevelMonitor({ offlineClose: true });
  } catch (error) {
    console.warn('[periodicTradingWork] price level monitor failed:', error);
  }
}

async function runSessionScanNotification(now: Date): Promise<boolean> {
  const enabled = await isSessionNotificationsEnabled();
  if (!enabled) return false;

  const { journal, settings } = await loadPersistedPsychologyContext();
  const parts = getVietnamDateParts(now);

  const inWindow = shouldTriggerBackgroundSessionCheck(parts, settings);
  const exactMinute = shouldTriggerAutoCheck(parts, settings);
  if (!inWindow && !exactMinute) return false;

  const lockKey = sessionLockKeyForParts(parts, settings.triggerMinute);
  const prevLock = await getBackgroundSessionLock();
  if (prevLock === lockKey) return false;

  const timeframe = await loadPersistedTimeframe();
  const [scoringPsychology, scanContext] = await Promise.all([
    loadPersistedScoringPsychology(),
    loadPersistedSignalScanContext(),
  ]);
  const rows = await scanAllSignalRows(timeframe, scoringPsychology, scanContext);
  const setups = rows
    .filter((r) => r.canEnter && !r.error)
    .map((r) => ({
      symbol: r.symbol,
      direction: r.direction,
      score: r.score,
    }));

  const openTradeCount = journal.filter((e) => e.status === 'OPEN').length;
  const { title, body } = buildSessionCheckMessage({ time: now, setups, openTradeCount });
  let sent = false;
  if ((await getNativePermissionStatus()) === 'granted') {
    sent = await presentLocalNotification({
      title,
      body,
      channelId: SESSION_CHANNEL_ID,
      data: { type: 'session-check' },
    });
  }

  if (sent) {
    await setBackgroundSessionLock(lockKey);
  }
  return sent;
}

/** Quét Signal Board và lưu cache — dùng cho foreground service + UI hydrate. */
export async function runSignalBoardScanPersist(now = new Date()): Promise<PeriodicWorkResult> {
  const timeframe = await loadPersistedTimeframe();
  const [scoringPsychology, scanContext] = await Promise.all([
    loadPersistedScoringPsychology(),
    loadPersistedSignalScanContext(),
  ]);
  const scanStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const rows = await scanAllSignalRows(timeframe, scoringPsychology, scanContext);
  const scanDurationMs =
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - scanStart;
  const scannedAt = now.getTime();
  wireProductionEsmAfterScan(rows, scannedAt, useTradeStore.getState(), { scanDurationMs });
  await savePersistedSignalBoard(timeframe, rows, scannedAt);

  if (Platform.OS !== 'web') {
    const { stageSignalBoardForSync, syncOnAction } = await import('./driveSyncService');
    stageSignalBoardForSync({ timeframe, rows, scannedAt });
    await syncOnAction('SIGNAL_BOARD_SCANNED');
  }

  const prices = new Map<string, number>();
  for (const row of rows) {
    if (row.price != null && Number.isFinite(row.price)) {
      prices.set(row.symbol, row.price);
    }
  }
  if (prices.size > 0) {
    const { fillPendingOrdersAtPrices } = await import('./pendingOrderFillService');
    await fillPendingOrdersAtPrices(prices);
  }

  const { runLockedPlanHealthCheck } = await import('./lockedPlanHealthWork');
  await runLockedPlanHealthCheck(rows);

  const setupCount = rows.filter((r) => r.canEnter && !r.error).length;
  return {
    scannedAt,
    setupCount,
    rowCount: rows.length,
    timeframe,
  };
}

/**
 * Chu kỳ 60s thống nhất: khớp lệnh chờ, cảnh báo giá, quét tín hiệu, thông báo phiên.
 */
export async function runPeriodicTradingWork(now = new Date()): Promise<PeriodicWorkResult | null> {
  await fillPendingOrdersPersisted();
  await runPriceLevelAlerts();

  try {
    const { useTradeStore } = await import('../store/useTradeStore');
    useTradeStore.getState().checkPlanExpiry();
    await useTradeStore.getState().checkPositionAdvisorAlerts();
  } catch (error) {
    console.warn('[periodicTradingWork] position advisor alerts failed:', error);
  }

  let scanResult: PeriodicWorkResult | null = null;
  try {
    scanResult = await runSignalBoardScanPersist(now);
  } catch (error) {
    console.warn('[periodicTradingWork] signal scan failed:', error);
  }

  await runSessionScanNotification(now);
  try {
    await runWhaleRadarScanIfDue(now.getTime());
  } catch (error) {
    console.warn('[periodicTradingWork] whale radar failed:', error);
  }
  return scanResult;
}

export { buildAutoRefreshLockKey, getVietnamDateParts };
