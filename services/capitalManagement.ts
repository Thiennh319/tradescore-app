import type { AppSettings } from '../constants/scoring';
import { DEFAULT_SETTINGS } from '../constants/scoring';
import {
  CAPITAL_RATIOS,
  DEFAULT_INITIAL_CAPITAL,
  type CapitalManagementState,
  type CapitalTier,
  type CapitalStatePersisted,
} from '../constants/capitalManagement';
import { syncOnAction } from './driveSyncService';

export { CAPITAL_RATIOS, RR_TARGETS } from '../constants/capitalManagement';
export type {
  CapitalTier,
  CapitalManagementState,
  CapitalStatePersisted,
} from '../constants/capitalManagement';

export type MilestoneUpgradePreview = {
  fromTierName: string;
  toTierName: string;
  previousTier: CapitalTier;
  newTier: CapitalTier;
  capitalAtUpgrade: number;
  journalNote: string;
};

export interface ProcessCapitalUpdateOptions {
  /** true = cập nhật lastMilestone ngay (hydrate / đã xác nhận) */
  confirmMilestone?: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Tier vốn từ vốn hiện tại và vốn gốc ban đầu. */
export function calculateCapitalTier(
  currentCapital: number,
  initialCapital: number = DEFAULT_INITIAL_CAPITAL,
): CapitalTier {
  const safeCurrent = Math.max(0, currentCapital);
  const safeInitial = initialCapital > 0 ? initialCapital : DEFAULT_INITIAL_CAPITAL;

  if (safeCurrent <= 0) {
    return emptyTier(safeInitial);
  }

  const growth = 1 + CAPITAL_RATIOS.milestoneGrowth;
  // Tính tier bằng vòng lặp so sánh trực tiếp số tiền (USDT), KHÔNG
  // dùng Math.log/Math.pow — tránh sai số floating-point tại đúng các
  // mốc ranh giới milestone (ví dụ 44.2, 57.46...). Mỗi vòng lặp so
  // sánh "vốn hiện tại đã vượt mốc tier kế tiếp chưa" bằng phép so
  // sánh số thực thông thường, an toàn hơn nghịch đảo qua logarit.
  // Giới hạn 100 vòng lặp đề phòng input accountSize bất thường lớn
  // (ví dụ lỗi nhập liệu hàng triệu USDT) gây lặp quá lâu.
  const MAX_TIER_ITERATIONS = 100;

  let tierNumber = 1;
  let baseCapital = round2(safeInitial);
  let nextMilestone = round2(baseCapital * growth);

  while (safeCurrent >= nextMilestone && tierNumber < MAX_TIER_ITERATIONS) {
    tierNumber += 1;
    baseCapital = nextMilestone;
    nextMilestone = round2(baseCapital * growth);
  }
  const sizePerTrade = round2(safeCurrent * CAPITAL_RATIOS.sizePercent);
  const notionalPerTrade = round2(sizePerTrade * CAPITAL_RATIOS.leverage);
  const maxLossPerTrade = round2(sizePerTrade * CAPITAL_RATIOS.maxLossPerTrade);
  const maxLossPerDay = round2(sizePerTrade * CAPITAL_RATIOS.maxLossPerDay);
  const slDistancePercent =
    notionalPerTrade > 0 ? maxLossPerTrade / notionalPerTrade : 0;

  return {
    tierName: `GD${tierNumber}`,
    baseCapital,
    nextMilestone,
    sizePerTrade,
    notionalPerTrade,
    maxLossPerTrade,
    maxLossPerDay,
    slDistancePercent,
  };
}

function emptyTier(initialCapital: number): CapitalTier {
  return {
    tierName: 'GD1',
    baseCapital: initialCapital,
    nextMilestone: round2(initialCapital * (1 + CAPITAL_RATIOS.milestoneGrowth)),
    sizePerTrade: 0,
    notionalPerTrade: 0,
    maxLossPerTrade: 0,
    maxLossPerDay: 0,
    slDistancePercent: 0,
  };
}

/** True khi vốn đạt ngưỡng +30% so với milestone trước. */
export function checkMilestoneUpgrade(
  currentCapital: number,
  lastMilestoneCapital: number,
): boolean {
  if (lastMilestoneCapital <= 0) return false;
  return currentCapital >= lastMilestoneCapital * (1 + CAPITAL_RATIOS.milestoneGrowth);
}

/** Đồng bộ size / maxLoss settings từ tier hiện tại. */
export function syncSettingsWithCapitalTier(
  settings: AppSettings,
  tier?: CapitalTier,
): AppSettings {
  const initialCapital =
    settings.initialCapital > 0 ? settings.initialCapital : DEFAULT_INITIAL_CAPITAL;
  const accountSize =
    settings.accountSize > 0 ? settings.accountSize : initialCapital;
  const capitalTier = tier ?? calculateCapitalTier(accountSize, initialCapital);
  const lastMilestoneCapital =
    settings.lastMilestoneCapital > 0
      ? settings.lastMilestoneCapital
      : initialCapital;

  return {
    ...settings,
    accountSize,
    initialCapital,
    lastMilestoneCapital,
    sizePerTrade: capitalTier.sizePerTrade,
    maxLossPerTrade: capitalTier.maxLossPerTrade,
    leverage: CAPITAL_RATIOS.leverage,
    maxLossPerWeek: round2(capitalTier.maxLossPerDay * 5),
    maxLossPerMonth: accountSize,
  };
}

export function buildCapitalManagementState(settings: AppSettings): CapitalManagementState {
  const initialCapital =
    settings.initialCapital > 0 ? settings.initialCapital : DEFAULT_INITIAL_CAPITAL;
  const currentCapital =
    settings.accountSize > 0 ? settings.accountSize : initialCapital;
  const lastMilestoneCapital =
    settings.lastMilestoneCapital > 0
      ? settings.lastMilestoneCapital
      : initialCapital;
  const currentTier = calculateCapitalTier(currentCapital, initialCapital);
  const pendingUpgrade = checkMilestoneUpgrade(currentCapital, lastMilestoneCapital);

  return {
    currentCapital,
    initialCapital,
    lastMilestoneCapital,
    currentTier,
    pendingUpgrade,
  };
}

/** % tiến độ từ milestone hiện tại đến milestone kế. */
export function computeMilestoneProgress(
  currentCapital: number,
  lastMilestoneCapital: number,
  nextMilestone: number,
): number {
  const span = nextMilestone - lastMilestoneCapital;
  if (span <= 0) return 100;
  const raw = ((currentCapital - lastMilestoneCapital) / span) * 100;
  return Math.min(100, Math.max(0, raw));
}

export function computeRemainingToMilestone(
  currentCapital: number,
  nextMilestone: number,
): number {
  return Math.max(0, round2(nextMilestone - currentCapital));
}

export function tpMovePercent(slDistancePercent: number, rrMultiplier: number): number {
  return round2(slDistancePercent * rrMultiplier * 100);
}

/** Parse input vốn — số dương, tối đa 2 chữ số thập phân. */
export function parseCapitalInput(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return round2(n);
}

export function formatCapitalUsd(value: number): string {
  return value.toFixed(2);
}

/**
 * Cập nhật vốn — áp dụng tier mới; milestone chờ modal trừ khi confirmMilestone.
 */
export function processAccountSizeUpdate(
  newAccountSize: number,
  settings: AppSettings,
  options: ProcessCapitalUpdateOptions = {},
): {
  settings: AppSettings;
  capitalManagement: CapitalManagementState;
  pendingUpgrade: boolean;
  milestoneUpgradePreview: MilestoneUpgradePreview | null;
} {
  const initialCapital =
    settings.initialCapital > 0 ? settings.initialCapital : DEFAULT_INITIAL_CAPITAL;
  const prevLastMilestone =
    settings.lastMilestoneCapital > 0
      ? settings.lastMilestoneCapital
      : initialCapital;

  const pendingUpgrade = checkMilestoneUpgrade(newAccountSize, prevLastMilestone);
  let lastMilestoneCapital = prevLastMilestone;
  let milestoneUpgradePreview: MilestoneUpgradePreview | null = null;

  const previousTier = calculateCapitalTier(prevLastMilestone, initialCapital);
  const newTier = calculateCapitalTier(newAccountSize, initialCapital);

  if (pendingUpgrade) {
    const journalNote =
      `milestone_upgrade: ${previousTier.tierName}→${newTier.tierName}, ` +
      `capital: ${formatCapitalUsd(newAccountSize)}`;
    milestoneUpgradePreview = {
      fromTierName: previousTier.tierName,
      toTierName: newTier.tierName,
      previousTier,
      newTier,
      capitalAtUpgrade: newAccountSize,
      journalNote,
    };
    if (options.confirmMilestone) {
      lastMilestoneCapital = newAccountSize;
      milestoneUpgradePreview = null;
    }
  }

  const nextSettings = syncSettingsWithCapitalTier(
    {
      ...settings,
      accountSize: Math.max(0, newAccountSize),
      initialCapital,
      lastMilestoneCapital,
    },
    newTier,
  );

  return {
    settings: nextSettings,
    capitalManagement: buildCapitalManagementState(nextSettings),
    pendingUpgrade: pendingUpgrade && !options.confirmMilestone,
    milestoneUpgradePreview,
  };
}

/** Sau khi user bấm "Bắt đầu GDx" trên modal milestone. */
export function confirmMilestoneUpgrade(settings: AppSettings): {
  settings: AppSettings;
  capitalManagement: CapitalManagementState;
  journalNote: string;
} {
  const initialCapital =
    settings.initialCapital > 0 ? settings.initialCapital : DEFAULT_INITIAL_CAPITAL;
  const capital = settings.accountSize;
  const previousTier = calculateCapitalTier(settings.lastMilestoneCapital, initialCapital);
  const newTier = calculateCapitalTier(capital, initialCapital);
  const journalNote =
    `milestone_upgrade: ${previousTier.tierName}→${newTier.tierName}, ` +
    `capital: ${formatCapitalUsd(capital)}`;

  const nextSettings = syncSettingsWithCapitalTier(
    {
      ...settings,
      lastMilestoneCapital: capital,
    },
    newTier,
  );

  return {
    settings: nextSettings,
    capitalManagement: buildCapitalManagementState(nextSettings),
    journalNote,
  };
}

export function capitalStateFromSettings(
  settings: AppSettings,
  milestoneJournal: string[] = [],
): CapitalStatePersisted {
  return {
    currentCapital: settings.accountSize,
    initialCapital: settings.initialCapital,
    lastMilestoneCapital: settings.lastMilestoneCapital,
    updatedAt: Date.now(),
    milestoneJournal,
  };
}

export function applyCapitalStateToSettings(
  settings: AppSettings,
  state: CapitalStatePersisted,
): AppSettings {
  return syncSettingsWithCapitalTier({
    ...settings,
    accountSize: state.currentCapital,
    initialCapital: state.initialCapital,
    lastMilestoneCapital: state.lastMilestoneCapital,
  });
}

export function defaultCapitalManagementState(): CapitalManagementState {
  return buildCapitalManagementState({ ...DEFAULT_SETTINGS });
}

/** Gọi sau khi vốn đã lưu thành công (từ store). */
export function notifyCapitalUpdatedAfterSave(): void {
  syncOnAction('CAPITAL_UPDATED').catch((err) => {
    console.warn('[Capital] Drive sync failed (non-critical):', err);
  });
}
