import { storageGetItem, storageRemoveItem, storageSetItem } from './storage';

/** Đọc/ghi JSON qua lớp storage đa nền tảng (localStorage web, AsyncStorage native). */
export async function persistGetJson<T>(key: string): Promise<T | null> {
  const raw = await storageGetItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function persistSetJson(key: string, value: unknown): Promise<void> {
  await storageSetItem(key, JSON.stringify(value));
}

export async function persistRemoveItem(key: string): Promise<void> {
  await storageRemoveItem(key);
}
