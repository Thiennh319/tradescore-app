/** Tỷ lệ vốn cố định — quản lý vốn động (Dynamic Capital Management). */
export const CAPITAL_RATIOS = {
  sizePercent: 0.1765,
  maxLossPerTrade: 0.25,
  maxLossPerDay: 0.5,
  leverage: 5,
  milestoneGrowth: 0.3,
} as const;

/** R:R mục tiêu TP — tính từ slDistance vốn (không theo decision V3). */
export const RR_TARGETS = {
  tp1: 2.0,
  tp2: 3.0,
  tp3: 4.5,
} as const;

export const DEFAULT_INITIAL_CAPITAL = 34;

export type CapitalTier = {
  tierName: string;
  baseCapital: number;
  nextMilestone: number;
  sizePerTrade: number;
  notionalPerTrade: number;
  maxLossPerTrade: number;
  maxLossPerDay: number;
  slDistancePercent: number;
};

export type CapitalManagementState = {
  currentCapital: number;
  initialCapital: number;
  lastMilestoneCapital: number;
  currentTier: CapitalTier;
  pendingUpgrade: boolean;
};

/** Lưu persist — key `capital_state` */
export type CapitalStatePersisted = {
  currentCapital: number;
  initialCapital: number;
  lastMilestoneCapital: number;
  updatedAt: number;
  milestoneJournal?: string[];
};
