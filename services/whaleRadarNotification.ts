import {
  getNativePermissionStatus,
  isNativeNotificationSupported,
  presentLocalNotification,
  WHALE_RADAR_CHANNEL_ID,
} from './localNotification';
import { isSessionNotificationsEnabled } from './notificationPreferences';
import {
  getBrowserPermissionStatus,
  isBrowserNotificationSupported,
} from './sessionNotification';
import { playWhalePlacedAlarm, playWhalePullAlarm } from './whaleRadarAlarm';
import { alertLockKey, type WhaleRadarEvent } from './whaleRadarDetect';
import { buildWhaleRadarMessage } from './whaleRadarNotificationMessage';
import { isWhaleRadarEnabled } from './whaleRadarPersist';

async function canSendWhaleAlert(): Promise<boolean> {
  if (!(await isWhaleRadarEnabled())) return false;
  const sessionOn = await isSessionNotificationsEnabled();
  if (!sessionOn) return false;

  if (isBrowserNotificationSupported()) {
    return getBrowserPermissionStatus() === 'granted';
  }
  if (isNativeNotificationSupported()) {
    return (await getNativePermissionStatus()) === 'granted';
  }
  return false;
}

/** Gộp trùng trong cùng một lần quét — không dùng cooldown để chặn sự kiện thật. */
function dedupeWhaleEvents(events: WhaleRadarEvent[]): WhaleRadarEvent[] {
  const seen = new Set<string>();
  const out: WhaleRadarEvent[] = [];
  for (const event of events) {
    const key = alertLockKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

/** Alarm trong app — luôn phát khi có sự kiện thay đổi (kể cả không có quyền OS). */
export function playWhaleEventAlarms(events: WhaleRadarEvent[]): void {
  const hasPull = events.some((e) => e.kind === 'WALL_PULLED');
  const hasPlaced = events.some((e) => e.kind === 'WALL_PLACED');
  if (hasPull) playWhalePullAlarm();
  else if (hasPlaced) playWhalePlacedAlarm();
}

/** Gửi alarm + thông báo OS — chỉ khi detectWhaleRadarEvents phát hiện thay đổi tường. */
export async function notifyWhaleRadarEvents(events: WhaleRadarEvent[]): Promise<number> {
  if (events.length === 0) return 0;

  const fresh = dedupeWhaleEvents(events);
  if (fresh.length === 0) return 0;

  playWhaleEventAlarms(fresh);

  if (!(await canSendWhaleAlert())) return 0;

  let sent = 0;
  for (const event of fresh) {
    const { title, body, tag, requireInteraction } = buildWhaleRadarMessage(event);
    let ok = false;

    if (isBrowserNotificationSupported()) {
      try {
        const notification = new Notification(title, {
          body,
          tag,
          requireInteraction,
        });
        notification.onclick = () => {
          notification.close();
          if (typeof globalThis.focus === 'function') {
            globalThis.focus();
          }
        };
        ok = true;
      } catch {
        ok = false;
      }
    } else if (isNativeNotificationSupported()) {
      ok = await presentLocalNotification({
        title,
        body,
        channelId: WHALE_RADAR_CHANNEL_ID,
        data: {
          type: 'whale-radar',
          symbol: event.symbol,
          kind: event.kind,
        },
      });
    }

    if (ok) sent += 1;
  }

  return sent;
}
