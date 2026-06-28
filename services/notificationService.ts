import { Platform } from 'react-native';
import * as Device from 'expo-device';
import {
  ensureAndroidChannels,
  installNotificationHandler,
  isNativeNotificationSupported,
  POSITION_ADVISOR_CHANNEL_ID,
  presentLocalNotification,
  requestNativeNotificationPermission,
} from './localNotification';
import type { PositionRecommendation } from './positionAdvisorV3';

export type NotificationUrgency = PositionRecommendation['urgency'];

export interface PositionAlertPayload {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  recommendationLabel: string;
  urgency: NotificationUrgency;
  reasons: string[];
  currentPnlUSDT: number;
}

const URGENCY_EMOJI: Record<NotificationUrgency, string> = {
  CRITICAL: '🚨',
  HIGH: '⚠️',
  MEDIUM: '🔔',
  LOW: 'ℹ️',
};

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  if (!Device.isDevice) {
    console.warn('[notificationService] Notifications không hoạt động trên simulator/emulator');
    return false;
  }

  if (!isNativeNotificationSupported()) return false;

  installNotificationHandler();
  await ensureAndroidChannels();
  return requestNativeNotificationPermission();
}

export async function sendPositionAlert(payload: PositionAlertPayload): Promise<boolean> {
  if (!isNativeNotificationSupported()) return false;

  const emoji = URGENCY_EMOJI[payload.urgency] ?? '🔔';
  const pnlText =
    payload.currentPnlUSDT >= 0
      ? `+${payload.currentPnlUSDT.toFixed(2)}`
      : payload.currentPnlUSDT.toFixed(2);

  const title = `${emoji} ${payload.symbol} ${payload.direction} — ${payload.recommendationLabel}`;
  const body = `${payload.reasons[0] ?? ''} (PnL: ${pnlText} USDT)`.trim();

  return presentLocalNotification({
    title,
    body,
    channelId: POSITION_ADVISOR_CHANNEL_ID,
    data: {
      type: 'position-advisor',
      symbol: payload.symbol,
      urgency: payload.urgency,
    },
  });
}
