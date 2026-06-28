import AsyncStorage from '@react-native-async-storage/async-storage';

const NATIVE_READ_RETRIES = 3;
const RETRY_DELAY_MS = 120;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function storageGetItem(key: string): Promise<string | null> {
  for (let i = 0; i < NATIVE_READ_RETRIES; i++) {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.warn(`[storage] getItem lỗi (${key}) lần ${i + 1}:`, error);
      if (i === NATIVE_READ_RETRIES - 1) return null;
      await sleep(RETRY_DELAY_MS * (i + 1));
    }
  }
  return null;
}

export async function storageSetItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    console.error(`[storage] setItem lỗi (${key}):`, error);
    throw error;
  }
}

export async function storageRemoveItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.warn(`[storage] removeItem lỗi (${key}):`, error);
  }
}
