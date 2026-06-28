import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
  pullFromDrive,
  onSyncStateChange,
  getSyncState,
  schedule12hSync,
  scheduleWebPullFromApk,
  stopScheduler,
  stopWebPullFromApk,
} from '../services/driveSyncService';
import type { SyncState } from '../types/driveSync';
import { useTradeStore } from '../store/useTradeStore';

export function useDriveSyncLifecycle(
  setSyncState: (state: SyncState) => void,
): void {
  const hydrated = useTradeStore((state) => state.hydrated);

  useEffect(() => {
    const unsubscribe = onSyncStateChange((newState) => {
      setSyncState(newState);
    });

    if (Platform.OS !== 'web') {
      schedule12hSync();
      console.log('[App] Drive sync scheduler started (APK upload)');

      return () => {
        unsubscribe();
        stopScheduler();
      };
    }

    if (!hydrated) {
      return () => {
        unsubscribe();
        stopScheduler();
        stopWebPullFromApk();
      };
    }

    const initWebMirror = async () => {
      console.log('[WebApp] Pulling from Drive (APK master)...');

      const result = await pullFromDrive();

      if (result.success) {
        console.log(
          '[WebApp] Mirror APK:',
          `journal Δ${result.journalMerged},`,
          `positions Δ${result.positionsMerged},`,
          `capital ${result.capitalUpdated ? 'updated' : 'unchanged'}`,
        );
      } else {
        console.warn('[WebApp] Pull failed:', result.error);
      }

      scheduleWebPullFromApk();
      console.log('[App] Web APK mirror pull scheduler started');
    };

    void initWebMirror();

    return () => {
      unsubscribe();
      stopScheduler();
      stopWebPullFromApk();
    };
  }, [setSyncState, hydrated]);
}

export function initialDriveSyncState(): SyncState {
  return getSyncState();
}
