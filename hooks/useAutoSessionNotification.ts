import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS } from '../constants/scoring';
import type { SignalRow } from '../hooks/useSignalBoard';
import {
  disableSessionNotifications,
  enableSessionNotifications,
  getNotificationPermissionStatus,
  isNotificationSupported,
  isSessionNotificationsEnabled,
  showSessionCheckNotification,
  type NotificationPermissionStatus,
} from '../services/sessionNotification';
import {
  buildAutoRefreshLockKey,
  getVietnamDateParts,
} from '../store/useTradeStore';

interface UseAutoSessionNotificationArgs {
  rows: SignalRow[];
  loading: boolean;
  lastScannedAt: number | null;
  autoTriggeredAt: number | null;
  openTradeCount: number;
}

interface UseAutoSessionNotificationResult {
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermissionStatus;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  refresh: () => Promise<void>;
  sendTest: () => Promise<boolean>;
}

/** Gửi thông báo một lần mỗi phiên :02 sau khi quét tự động xong (web + native). */
export function useAutoSessionNotification({
  rows,
  loading,
  lastScannedAt,
  autoTriggeredAt,
  openTradeCount,
}: UseAutoSessionNotificationArgs): UseAutoSessionNotificationResult {
  const notifiedKeyRef = useRef<string | null>(null);
  const [supported] = useState(isNotificationSupported);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionStatus>('unsupported');

  const refresh = useCallback(async () => {
    setEnabled(await isSessionNotificationsEnabled());
    setPermission(await getNotificationPermissionStatus());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    const ok = await enableSessionNotifications();
    await refresh();
    return ok;
  }, [refresh]);

  const disable = useCallback(async () => {
    await disableSessionNotifications();
    await refresh();
  }, [refresh]);

  const sendTest = useCallback(async () => {
    if (!supported) return false;

    let granted = (await getNotificationPermissionStatus()) === 'granted';
    if (!granted) {
      granted = await enable();
    }
    if (!granted) return false;

    const setups = rows
      .filter((r) => r.canEnter && !r.error)
      .map((r) => ({
        symbol: r.symbol,
        direction: r.direction,
        score: r.score,
      }));

    return showSessionCheckNotification(
      {
        time: new Date(),
        setups,
        openTradeCount,
      },
      { force: true },
    );
  }, [rows, openTradeCount, enable, supported]);

  useEffect(() => {
    if (loading || autoTriggeredAt == null || lastScannedAt == null) return;
    if (Math.abs(lastScannedAt - autoTriggeredAt) > 120_000) return;

    const key = buildAutoRefreshLockKey(
      getVietnamDateParts(new Date(autoTriggeredAt)),
      DEFAULT_SETTINGS.triggerMinute,
    );
    if (notifiedKeyRef.current === key) return;
    notifiedKeyRef.current = key;

    const setups = rows
      .filter((r) => r.canEnter && !r.error)
      .map((r) => ({
        symbol: r.symbol,
        direction: r.direction,
        score: r.score,
      }));

    void showSessionCheckNotification({
      time: new Date(lastScannedAt),
      setups,
      openTradeCount,
    });
  }, [loading, lastScannedAt, autoTriggeredAt, rows, openTradeCount]);

  return { supported, enabled, permission, enable, disable, refresh, sendTest };
}
