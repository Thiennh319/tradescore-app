/**
 * V3V4-SYNC-3b/3c/3e — Shared payload emptiness / “has real data” guards.
 * Dùng bởi APK empty-push guard và Web object-mirror (positions/capital).
 */

import { DEFAULT_INITIAL_CAPITAL } from '../constants/capitalManagement';
import { DRIVE_FILE_NAMES, type DriveFileName } from '../types/driveSync';

/** Khớp DEFAULT_SETTINGS.initialCapital / accountSize / lastMilestoneCapital (34). */
export const DEFAULT_CAPITAL_VALUE = DEFAULT_INITIAL_CAPITAL;

export type CapitalDrivePayload = {
  currentCapital?: number;
  initialCapital?: number;
  lastMilestoneCapital?: number;
  milestoneJournal?: unknown[];
};

export type PositionsDrivePayload = {
  currentOpenTrade?: unknown;
  openTrades?: unknown[];
  lockedPlan?: unknown;
};

function capitalNumberOrDefault(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_CAPITAL_VALUE;
}

/** Local/remote “rỗng/default”: không milestone và 3 số vốn đều = default 34 (hoặc thiếu field). */
export function isCapitalPayloadDefaultEmpty(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return true;
  const c = data as CapitalDrivePayload;
  const milestones = Array.isArray(c.milestoneJournal) ? c.milestoneJournal.length : 0;
  if (milestones > 0) return false;
  return (
    capitalNumberOrDefault(c.currentCapital) === DEFAULT_CAPITAL_VALUE &&
    capitalNumberOrDefault(c.initialCapital) === DEFAULT_CAPITAL_VALUE &&
    capitalNumberOrDefault(c.lastMilestoneCapital) === DEFAULT_CAPITAL_VALUE
  );
}

/** Remote “có data thật”: milestone ≥1 hoặc bất kỳ số vốn nào khác default 34. */
export function capitalRemoteHasMeaningfulData(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return false;
  const c = data as CapitalDrivePayload;
  if (Array.isArray(c.milestoneJournal) && c.milestoneJournal.length >= 1) return true;
  if (typeof c.currentCapital === 'number' && c.currentCapital !== DEFAULT_CAPITAL_VALUE) {
    return true;
  }
  if (typeof c.initialCapital === 'number' && c.initialCapital !== DEFAULT_CAPITAL_VALUE) {
    return true;
  }
  if (
    typeof c.lastMilestoneCapital === 'number' &&
    c.lastMilestoneCapital !== DEFAULT_CAPITAL_VALUE
  ) {
    return true;
  }
  return false;
}

export function isPositionsPayloadEmpty(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return true;
  const p = data as PositionsDrivePayload;
  const opens = Array.isArray(p.openTrades) ? p.openTrades.length : 0;
  return p.currentOpenTrade == null && opens === 0 && p.lockedPlan == null;
}

export function positionsPayloadHasData(data: unknown): boolean {
  return !isPositionsPayloadEmpty(data);
}

/**
 * Field-wise positions merge (V3V4-SYNC-3e):
 * remote null/undefined → giữ field local nếu local đang có data.
 * remote có giá trị → áp dụng remote (kể cả thay open trade khác).
 */
export function mergePositionsFieldsRemote(
  localOpen: unknown,
  localLocked: unknown,
  remote: PositionsDrivePayload | null | undefined,
): {
  nextOpen: unknown;
  nextLocked: unknown;
  protectedOpen: boolean;
  protectedLocked: boolean;
} {
  const r = remote ?? {};
  let protectedOpen = false;
  let protectedLocked = false;

  let nextOpen: unknown;
  if (r.currentOpenTrade != null) {
    nextOpen = r.currentOpenTrade;
  } else if (localOpen != null) {
    nextOpen = localOpen;
    protectedOpen = true;
  } else {
    nextOpen = null;
  }

  let nextLocked: unknown;
  if (r.lockedPlan != null) {
    nextLocked = r.lockedPlan;
  } else if (localLocked != null) {
    nextLocked = localLocked;
    protectedLocked = true;
  } else {
    nextLocked = null;
  }

  return { nextOpen, nextLocked, protectedOpen, protectedLocked };
}

/**
 * Ngưỡng (user-chốt V3V4-SYNC-3b/3c): chặn khi local rỗng/default mà remote có data thật.
 * Capital (3c): milestone ≥1 HOẶC current/initial/lastMilestone ≠ DEFAULT_INITIAL_CAPITAL (34).
 */
export function isLocalDrivePayloadEmpty(fileName: DriveFileName, data: unknown): boolean {
  switch (fileName) {
    case DRIVE_FILE_NAMES.journal:
    case DRIVE_FILE_NAMES.v41Sessions:
      return Array.isArray(data) && data.length === 0;
    case DRIVE_FILE_NAMES.positions:
      return isPositionsPayloadEmpty(data);
    case DRIVE_FILE_NAMES.capital:
      return isCapitalPayloadDefaultEmpty(data);
    default:
      return false;
  }
}

export function remoteDrivePayloadHasData(fileName: DriveFileName, data: unknown): boolean {
  switch (fileName) {
    case DRIVE_FILE_NAMES.journal:
    case DRIVE_FILE_NAMES.v41Sessions:
      return Array.isArray(data) && data.length >= 1;
    case DRIVE_FILE_NAMES.positions:
      return positionsPayloadHasData(data);
    case DRIVE_FILE_NAMES.capital:
      return capitalRemoteHasMeaningfulData(data);
    default:
      return false;
  }
}
