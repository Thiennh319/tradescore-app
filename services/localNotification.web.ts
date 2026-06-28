export const SESSION_CHANNEL_ID = 'tradescore-session';
export const PRICE_ALERT_CHANNEL_ID = 'tradescore-price-alert';
export const WHALE_RADAR_CHANNEL_ID = 'tradescore-whale-radar';
export const POSITION_ADVISOR_CHANNEL_ID = 'position-alerts';

export type NativePermissionStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export function installNotificationHandler(): void {}

export async function ensureAndroidChannels(): Promise<void> {}

export function isNativeNotificationSupported(): boolean {
  return false;
}

export async function getNativePermissionStatus(): Promise<NativePermissionStatus> {
  return 'unsupported';
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
  return false;
}

export async function presentLocalNotification(_options: {
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  return false;
}
