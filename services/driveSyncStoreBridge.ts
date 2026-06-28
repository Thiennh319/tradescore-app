export type DriveDeviceId = 'APK' | 'WEB';

export interface DriveSyncMeta {
  lastUpdated?: string;
  deviceId?: DriveDeviceId;
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
}

let bridge: DriveSyncStoreBridge | null = null;

export function registerDriveSyncStoreBridge(next: DriveSyncStoreBridge): void {
  bridge = next;
}

export function getDriveSyncStoreBridge(): DriveSyncStoreBridge | null {
  return bridge;
}

export function clearDriveSyncStoreBridge(): void {
  bridge = null;
}
