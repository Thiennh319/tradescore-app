export type PlanHealthStatus = 'STRONG' | 'NORMAL' | 'WEAK' | 'CRITICAL';

export interface PlanHealth {
  status: PlanHealthStatus;
  /** 100 = khỏe, 0 = hủy */
  score: number;
  penalties: {
    reason: string;
    value: number;
  }[];
  autoCancel: boolean;
}
