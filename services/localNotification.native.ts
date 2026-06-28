import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const SESSION_CHANNEL_ID = 'tradescore-session';
export const PRICE_ALERT_CHANNEL_ID = 'tradescore-price-alert';
export const WHALE_RADAR_CHANNEL_ID = 'tradescore-whale-radar';
export const POSITION_ADVISOR_CHANNEL_ID = 'position-alerts';

let handlerInstalled = false;

export function installNotificationHandler(): void {
  if (handlerInstalled || Platform.OS === 'web') return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(SESSION_CHANNEL_ID, {
    name: 'Phiên quét :02',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 220, 120, 220],
    lightColor: '#F0B90B',
  });
  await Notifications.setNotificationChannelAsync(PRICE_ALERT_CHANNEL_ID, {
    name: 'Cảnh báo SL / TP',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 300, 200, 300],
    lightColor: '#F6465D',
  });
  await Notifications.setNotificationChannelAsync(WHALE_RADAR_CHANNEL_ID, {
    name: 'Radar Cá Mập / Spoofing',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 150, 400, 150, 400],
    lightColor: '#F0B90B',
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(POSITION_ADVISOR_CHANNEL_ID, {
    name: 'Cảnh báo lệnh đang mở',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#F6465D',
    sound: 'default',
  });
}

export type NativePermissionStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export function isNativeNotificationSupported(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

export async function getNativePermissionStatus(): Promise<NativePermissionStatus> {
  if (!isNativeNotificationSupported()) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'default';
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (!isNativeNotificationSupported()) return false;
  installNotificationHandler();
  await ensureAndroidChannels();
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  return status === 'granted';
}

export async function presentLocalNotification(options: {
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  if (!isNativeNotificationSupported()) return false;
  if ((await getNativePermissionStatus()) !== 'granted') return false;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        data: options.data ?? {},
        sound: true,
        ...(Platform.OS === 'android'
          ? { channelId: options.channelId ?? SESSION_CHANNEL_ID }
          : {}),
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}
