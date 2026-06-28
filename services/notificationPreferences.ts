import { storageGetItem, storageSetItem } from './storage';

const STORAGE_KEY = '@tradescore/v1/session-notifications';

export async function isSessionNotificationsEnabled(): Promise<boolean> {
  const raw = await storageGetItem(STORAGE_KEY);
  return raw === '1';
}

export async function setSessionNotificationsEnabled(enabled: boolean): Promise<void> {
  await storageSetItem(STORAGE_KEY, enabled ? '1' : '0');
}
