import { Platform } from 'react-native';
import {
  ensureAndroidChannels,
  getNativePermissionStatus,
  installNotificationHandler,
  isNativeNotificationSupported,
  presentLocalNotification,
  requestNativeNotificationPermission,
  SESSION_CHANNEL_ID,
} from './localNotification';
import { isSessionNotificationsEnabled, setSessionNotificationsEnabled } from './notificationPreferences';
import {
  registerBackgroundSessionTask,
} from '../tasks/backgroundSessionTask';
import {
  buildSessionCheckMessage,
  type SessionCheckSummary,
} from './sessionNotificationMessage';

export type { SessionCheckSummary, SessionCheckMessage } from './sessionNotificationMessage';
export { buildSessionCheckMessage } from './sessionNotificationMessage';

export type NotificationPermissionStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export { isSessionNotificationsEnabled, setSessionNotificationsEnabled } from './notificationPreferences';

export function isBrowserNotificationSupported(): boolean {
  return Platform.OS === 'web' && typeof globalThis.Notification !== 'undefined';
}

export function isNotificationSupported(): boolean {
  return isBrowserNotificationSupported() || isNativeNotificationSupported();
}

export function getBrowserPermissionStatus(): NotificationPermissionStatus {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return Notification.permission as NotificationPermissionStatus;
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (isBrowserNotificationSupported()) return getBrowserPermissionStatus();
  if (isNativeNotificationSupported()) return getNativePermissionStatus();
  return 'unsupported';
}

/** Xin quyền + bật chạy ngầm (native) + lưu preference. */
export async function enableSessionNotifications(): Promise<boolean> {
  if (isBrowserNotificationSupported()) {
    let permission = getBrowserPermissionStatus();
    if (permission === 'default') {
      permission = (await Notification.requestPermission()) as NotificationPermissionStatus;
    }
    const granted = permission === 'granted';
    await setSessionNotificationsEnabled(granted);
    return granted;
  }

  if (isNativeNotificationSupported()) {
    installNotificationHandler();
    await ensureAndroidChannels();
    const granted = await requestNativeNotificationPermission();
    await setSessionNotificationsEnabled(granted);
    await registerBackgroundSessionTask();
    return granted;
  }

  return false;
}

export async function disableSessionNotifications(): Promise<void> {
  await setSessionNotificationsEnabled(false);
}

/** Gửi thông báo phiên quét :02 (web hoặc native). */
export async function showSessionCheckNotification(
  summary: SessionCheckSummary,
  options?: { force?: boolean },
): Promise<boolean> {
  const force = options?.force === true;
  if (!force) {
    const enabled = await isSessionNotificationsEnabled();
    if (!enabled) return false;
  }

  const { title, body } = buildSessionCheckMessage(summary, force);

  if (isBrowserNotificationSupported()) {
    if (getBrowserPermissionStatus() !== 'granted') return false;
    try {
      const notification = new Notification(title, {
        body,
        tag: 'tradescore-session-check',
      });
      notification.onclick = () => {
        notification.close();
        if (typeof globalThis.focus === 'function') {
          globalThis.focus();
        }
      };
      return true;
    } catch {
      return false;
    }
  }

  if (isNativeNotificationSupported()) {
    if ((await getNativePermissionStatus()) !== 'granted') return false;
    return presentLocalNotification({
      title,
      body,
      channelId: SESSION_CHANNEL_ID,
      data: { type: 'session-check' },
    });
  }

  return false;
}

/** Đăng ký task quét nền mỗi phút (không phụ thuộc bật thông báo). */
export async function syncBackgroundSessionTaskRegistration(): Promise<void> {
  if (!isNativeNotificationSupported()) return;
  await registerBackgroundSessionTask();
}
