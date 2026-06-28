export const PLAN_EXPIRY_CONFIG = {
  HIGH: { minScore: 13.0, expiryHours: 12 },
  MEDIUM: { minScore: 11.0, expiryHours: 8 },
  LOW: { minScore: 9.0, expiryHours: 4 },
} as const;

export type PlanExpiryTier = keyof typeof PLAN_EXPIRY_CONFIG;

export interface PlanExpiryResult {
  hours: number;
  tier: PlanExpiryTier;
}

export function calculatePlanExpiry(score: number): PlanExpiryResult {
  if (score >= PLAN_EXPIRY_CONFIG.HIGH.minScore) {
    return { hours: PLAN_EXPIRY_CONFIG.HIGH.expiryHours, tier: 'HIGH' };
  }
  if (score >= PLAN_EXPIRY_CONFIG.MEDIUM.minScore) {
    return { hours: PLAN_EXPIRY_CONFIG.MEDIUM.expiryHours, tier: 'MEDIUM' };
  }
  return { hours: PLAN_EXPIRY_CONFIG.LOW.expiryHours, tier: 'LOW' };
}

export function planExpiresAtMs(planCreatedAt: number, expiryHours: number): number {
  return planCreatedAt + expiryHours * 3_600_000;
}

export function buildPlanExpiryFields(score: number, planCreatedAt = Date.now()) {
  const { hours, tier } = calculatePlanExpiry(score);
  return {
    expiryHours: hours,
    expiryTier: tier,
    expiresAt: new Date(planExpiresAtMs(planCreatedAt, hours)).toISOString(),
  };
}

/** Chỉ gắn expiry khi plan hợp lệ (đủ điều kiện vào lệnh). */
export function resolvePlanExpiryOutput(
  score: number,
  isValid: boolean,
  planCreatedAt = Date.now(),
): ReturnType<typeof buildPlanExpiryFields> | Record<string, never> {
  if (!isValid) return {};
  return buildPlanExpiryFields(score, planCreatedAt);
}

export function isPlanExpired(expiresAtMs: number, now = Date.now()): boolean {
  return now >= expiresAtMs;
}

export function formatPlanExpiredMessage(hours: number): string {
  return `Lệnh chờ đã hết hạn sau ${hours}h`;
}

export function formatPendingAutoCancelLabel(
  countdown: string,
  score: number,
  expiryHours: number,
): string {
  return `Tự hủy sau: ${countdown} (Score ${score.toFixed(1)} → ${expiryHours}h plan)`;
}
