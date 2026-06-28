import BackgroundService from 'react-native-background-actions';
import { SCAN_INTERVAL_MS } from '../constants/scanSchedule';
import { runPeriodicTradingWork } from './periodicTradingWork';

const TASK_NAME = 'TradeScorePeriodicScan';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function formatNotificationDesc(setupCount: number, rowCount: number): string {
  if (setupCount > 0) {
    return `Quét ${rowCount} cặp · ${setupCount} setup đủ điểm · cập nhật mỗi phút`;
  }
  return `Quét ${rowCount} cặp · cập nhật mỗi phút`;
}

async function periodicScanLoop(): Promise<void> {
  await new Promise<void>(async () => {
    while (BackgroundService.isRunning()) {
      try {
        const result = await runPeriodicTradingWork(new Date());
        if (result) {
          await BackgroundService.updateNotification({
            taskDesc: formatNotificationDesc(result.setupCount, result.rowCount),
          });
        }
      } catch (error) {
        console.warn('[foregroundScanService] tick failed:', error);
      }
      await sleep(SCAN_INTERVAL_MS);
    }
  });
}

/** Khởi động foreground service — giữ app quét mỗi phút khi app không bị kill. */
export async function startForegroundScanService(): Promise<void> {
  if (BackgroundService.isRunning()) return;

  await BackgroundService.start(periodicScanLoop, {
    taskName: TASK_NAME,
    taskTitle: 'TradeScore',
    taskDesc: 'Đang quét tín hiệu mỗi phút…',
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap',
    },
    color: '#F0B90B',
    foregroundServiceType: ['dataSync'],
  });
}

export async function stopForegroundScanService(): Promise<void> {
  if (!BackgroundService.isRunning()) return;
  await BackgroundService.stop();
}

export function isForegroundScanServiceRunning(): boolean {
  return BackgroundService.isRunning();
}
