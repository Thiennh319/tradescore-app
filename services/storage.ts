import AsyncStorage from '@react-native-async-storage/async-storage';

/** Fallback cho vitest / tooling — không retry. */
export async function storageGetItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function storageSetItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function storageRemoveItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
