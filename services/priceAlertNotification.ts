import type { AppTradeSymbol } from '../constants/scoring';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';
import type { PriceLevelHit } from '../utils/priceLevelHit';
import {
  getNativePermissionStatus,
  isNativeNotificationSupported,
  presentLocalNotification,
  PRICE_ALERT_CHANNEL_ID,
} from './localNotification';
import { isSessionNotificationsEnabled } from './notificationPreferences';
import { getBrowserPermissionStatus, isBrowserNotificationSupported } from './sessionNotification';
import {
  buildPriceAlertMessage,
  type PriceAlertPayload,
} from './priceAlertNotificationMessage';

export type { PriceAlertPayload } from './priceAlertNotificationMessage';
export { buildPriceAlertMessage } from './priceAlertNotificationMessage';

async function canSendAlert(): Promise<boolean> {
  const enabled = await isSessionNotificationsEnabled();
  if (!enabled) return false;
  if (isBrowserNotificationSupported()) {
    return getBrowserPermissionStatus() === 'granted';
  }
  if (isNativeNotificationSupported()) {
    return (await getNativePermissionStatus()) === 'granted';
  }
  return false;
}

/** Gửi thông báo OS khi giá chạm SL/TP (web hoặc native). */
export async function showPriceAlertNotification(
  entry: StoredTradeJournalEntry,
  hit: PriceLevelHit,
  markPrice: number,
): Promise<boolean> {
  if (!(await canSendAlert())) return false;

  const payload: PriceAlertPayload = {
    symbol: entry.symbol as AppTradeSymbol,
    direction: entry.direction,
    kind: hit.kind,
    levelPrice: hit.levelPrice,
    markPrice,
  };

  const { title, body, tag } = buildPriceAlertMessage(payload);

  if (isBrowserNotificationSupported()) {
    try {
      const notification = new Notification(title, {
        body,
        tag: `${tag}-${entry.id}`,
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
    return presentLocalNotification({
      title,
      body,
      channelId: PRICE_ALERT_CHANNEL_ID,
      data: { type: 'price-alert', entryId: entry.id, kind: hit.kind },
    });
  }

  return false;
}
