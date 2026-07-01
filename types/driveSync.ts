// Cấu trúc wrapper cho mỗi file trên GitHub Gist

export type GistError =
  | 'AUTH_FAILED'
  | 'UPLOAD_FAILED'
  | 'DOWNLOAD_FAILED'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR';

export interface GistResult<T> {
  success: boolean;
  data?: T;
  error?: GistError;
  message?: string;
}

/** @deprecated dùng GistResult */
export type DriveResult<T> = GistResult<T>;

export interface GistFileWrapper<T> {
  version: '1.0.2';
  lastUpdated: string;
  deviceId: 'APK' | 'WEB';
  data: T;
}

/** @deprecated dùng GistFileWrapper */
export type DriveFileWrapper<T> = GistFileWrapper<T>;

export const GIST_FILE_NAMES = {
  journal: 'tradescore_journal.json',
  positions: 'tradescore_positions.json',
  capital: 'tradescore_capital.json',
  signalBoard: 'tradescore_signal_board.json',
} as const;

/** @deprecated dùng GIST_FILE_NAMES */
export const DRIVE_FILE_NAMES = GIST_FILE_NAMES;

export type GistFileName = (typeof GIST_FILE_NAMES)[keyof typeof GIST_FILE_NAMES];

/** @deprecated dùng GistFileName */
export type DriveFileName = GistFileName;

export type SyncActionType =
  | 'ORDER_PLACED'
  | 'ORDER_CLOSED'
  | 'POSITION_UPDATED'
  | 'CAPITAL_UPDATED'
  | 'JOURNAL_ENTRY_ADDED'
  | 'SIGNAL_BOARD_SCANNED';

export const SYNC_ACTION_FILE_MAP: Record<SyncActionType, GistFileName[]> = {
  ORDER_PLACED: [GIST_FILE_NAMES.positions, GIST_FILE_NAMES.journal],
  ORDER_CLOSED: [GIST_FILE_NAMES.positions, GIST_FILE_NAMES.journal],
  POSITION_UPDATED: [GIST_FILE_NAMES.positions],
  CAPITAL_UPDATED: [GIST_FILE_NAMES.capital],
  JOURNAL_ENTRY_ADDED: [GIST_FILE_NAMES.journal],
  SIGNAL_BOARD_SCANNED: [GIST_FILE_NAMES.signalBoard],
};

export interface SyncResult {
  success: boolean;
  filessynced: GistFileName[];
  filesFailed: GistFileName[];
  timestamp: string;
  error?: string;
}

export interface PullResult {
  success: boolean;
  journalMerged: number;
  positionsMerged: number;
  capitalUpdated: boolean;
  signalBoardUpdated?: boolean;
  timestamp: string;
  error?: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

export interface SyncState {
  status: SyncStatus;
  lastSyncTime: string | null;
  pendingSync: boolean;
}
