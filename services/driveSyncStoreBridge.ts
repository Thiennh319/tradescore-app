export type DriveDeviceId = 'APK' | 'WEB';

export interface DriveSyncMeta {
  lastUpdated?: string;
  deviceId?: DriveDeviceId;
  /**
   * APK empty-push guard (V3V4-SYNC-3b) — cho phép apply restore trên native
   * khi local rỗng nhưng Gist còn data.
   */
  restoreReason?: 'empty_push_guard';
}

export interface DriveSyncStoreBridge {
  getDeviceId: () => DriveDeviceId;
  getJournal: () => unknown[];
  getPositions: () => unknown;
  getCapital: () => unknown;
  /** Web mirror — thay journal bằng bản APK từ Drive */
  applyJournalMirrorFromApk: (remoteJournal: unknown[], meta?: DriveSyncMeta) => Promise<number>;
  /** Web mirror — áp positions / locked plan từ APK */
  applyPositionsMirrorFromApk: (remote: unknown, meta?: DriveSyncMeta) => Promise<number>;
  /** Web mirror — áp capital từ APK */
  applyCapitalMirrorFromApk: (remote: unknown, meta?: DriveSyncMeta) => Promise<boolean>;
  /** Optional — V4.1 Trade Sessions (APK master / Web mirror). */
  getV41Sessions?: () => unknown[];
  applyV41SessionsMirrorFromApk?: (
    remoteSessions: unknown[],
    meta?: DriveSyncMeta,
  ) => Promise<number>;
}

let bridge: DriveSyncStoreBridge | null = null;
/** Handlers registered before useTradeStore calls registerDriveSyncStoreBridge. */
let pendingPartial: Partial<DriveSyncStoreBridge> | null = null;

export function registerDriveSyncStoreBridge(next: DriveSyncStoreBridge): void {
  bridge = pendingPartial ? { ...next, ...pendingPartial } : next;
  pendingPartial = null;
}

/** Merge V41 (or other) handlers without replacing journal/positions/capital. */
export function mergeDriveSyncStoreBridge(partial: Partial<DriveSyncStoreBridge>): void {
  if (!bridge) {
    pendingPartial = { ...(pendingPartial ?? {}), ...partial };
    return;
  }
  bridge = { ...bridge, ...partial };
}

export function getDriveSyncStoreBridge(): DriveSyncStoreBridge | null {
  return bridge;
}

export function clearDriveSyncStoreBridge(): void {
  bridge = null;
  pendingPartial = null;
}
