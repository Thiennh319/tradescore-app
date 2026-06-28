// Cấu trúc wrapper cho mỗi file trên Drive

export interface DriveFileWrapper<T> {
  version: '1.0.2';
  lastUpdated: string; // ISO timestamp
  deviceId: 'APK' | 'WEB';
  data: T;
}

// 3 file JSON sẽ tồn tại trên Drive

export const DRIVE_FILE_NAMES = {
  journal: 'tradescore_journal.json',
  positions: 'tradescore_positions.json',
  capital: 'tradescore_capital.json',
} as const;

export type DriveFileName = (typeof DRIVE_FILE_NAMES)[keyof typeof DRIVE_FILE_NAMES];

// Action types kích hoạt sync

export type SyncActionType =
  | 'ORDER_PLACED'
  | 'ORDER_CLOSED'
  | 'POSITION_UPDATED'
  | 'CAPITAL_UPDATED'
  | 'JOURNAL_ENTRY_ADDED';

// Mapping action → file cần sync

export const SYNC_ACTION_FILE_MAP: Record<SyncActionType, DriveFileName[]> = {
  ORDER_PLACED: [DRIVE_FILE_NAMES.positions, DRIVE_FILE_NAMES.journal],
  ORDER_CLOSED: [DRIVE_FILE_NAMES.positions, DRIVE_FILE_NAMES.journal],
  POSITION_UPDATED: [DRIVE_FILE_NAMES.positions],
  CAPITAL_UPDATED: [DRIVE_FILE_NAMES.capital],
  JOURNAL_ENTRY_ADDED: [DRIVE_FILE_NAMES.journal],
};

// Kết quả sau khi sync

export interface SyncResult {
  success: boolean;
  filessynced: DriveFileName[];
  filesFailed: DriveFileName[];
  timestamp: string;
  error?: string;
}

// Kết quả sau khi pull từ Drive về

export interface PullResult {
  success: boolean;
  journalMerged: number; // số entries đã merge
  positionsMerged: number;
  capitalUpdated: boolean;
  timestamp: string;
  error?: string;
}

// Trạng thái sync hiển thị trên UI

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

export interface SyncState {
  status: SyncStatus;
  lastSyncTime: string | null; // ISO timestamp
  pendingSync: boolean;
}
