import type { TradeFullSnapshot } from './tradeSnapshot';
import { isWebPlatform } from '../utils/isWebPlatform';

const DB_NAME = 'tradescore-persist-v1';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'backup-file';

type FileSystemFileHandle = {
  kind: 'file';
  getFile: () => Promise<File>;
  createWritable: () => Promise<FileSystemWritableFileStream>;
};

type FileSystemWritableFileStream = {
  write: (data: Blob | string) => Promise<void>;
  close: () => Promise<void>;
};

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
};

type WindowWithFilePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: {
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
    multiple?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
};

let activeHandle: FileSystemFileHandle | null = null;

function isWeb(): boolean {
  return isWebPlatform();
}

function filePickerWindow(): WindowWithFilePicker | null {
  if (!isWeb() || typeof window === 'undefined') return null;
  return window as WindowWithFilePicker;
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function storeHandle(handle: FileSystemFileHandle): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

async function loadStoredHandle(): Promise<FileSystemFileHandle | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openHandleDb();
    const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

const JSON_FILE_TYPES = [
  { description: 'TradeScore backup', accept: { 'application/json': ['.json'] } },
];

/** Khôi phục quyền file đã chọn trước đó (Chrome giữ handle trong IndexedDB). */
export async function restoreBackupFileHandle(): Promise<boolean> {
  const handle = await loadStoredHandle();
  if (!handle) return false;
  activeHandle = handle;
  return true;
}

export function hasActiveBackupFile(): boolean {
  return activeHandle != null;
}

/** Chọn hoặc tạo file JSON — ghi tự động mỗi lần lưu (đồng bộ qua mọi port). */
export async function pickBackupFile(): Promise<boolean> {
  const win = filePickerWindow();
  if (!win?.showSaveFilePicker) return false;
  try {
    const handle = await win.showSaveFilePicker({
      suggestedName: 'TradeScore-backup.json',
      types: JSON_FILE_TYPES,
    });
    activeHandle = handle;
    await storeHandle(handle);
    return true;
  } catch {
    return false;
  }
}

/** Mở file backup có sẵn để đọc/ghi. */
export async function openExistingBackupFile(): Promise<boolean> {
  const win = filePickerWindow();
  if (!win?.showOpenFilePicker) return false;
  try {
    const [handle] = await win.showOpenFilePicker({
      types: JSON_FILE_TYPES,
      multiple: false,
    });
    activeHandle = handle;
    await storeHandle(handle);
    return true;
  } catch {
    return false;
  }
}

export async function writeBackupFile(snapshot: TradeFullSnapshot): Promise<void> {
  if (!activeHandle) return;
  try {
    const writable = await activeHandle.createWritable();
    await writable.write(JSON.stringify(snapshot, null, 2));
    await writable.close();
  } catch {
    activeHandle = null;
  }
}

export async function readBackupFile(): Promise<TradeFullSnapshot | null> {
  const handle = activeHandle ?? (await loadStoredHandle());
  if (!handle) return null;
  activeHandle = handle;
  try {
    const file = await handle.getFile();
    const text = await file.text();
    return JSON.parse(text) as TradeFullSnapshot;
  } catch {
    return null;
  }
}

export function isFileBackupSupported(): boolean {
  const win = filePickerWindow();
  return Boolean(win?.showSaveFilePicker && win?.showOpenFilePicker);
}
