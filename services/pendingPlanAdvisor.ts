import type { PlanHealth } from '../types/tradePlan';

export const PLAN_HEALTH_CRITICAL_PRIORITY = 72;

export interface PendingPlanAdvisorResult {
  shouldAutoCancel: boolean;
  ruleName: string | null;
  priority: number | null;
  message: string | null;
}

/** Position-advisor style rule cho lệnh chờ — chỉ hủy khi multi-confirmation. */
export function evaluatePendingPlanAdvisor(planHealth: PlanHealth): PendingPlanAdvisorResult {
  if (!planHealth.autoCancel) {
    return {
      shouldAutoCancel: false,
      ruleName: null,
      priority: null,
      message: null,
    };
  }

  return {
    shouldAutoCancel: true,
    ruleName: 'PLAN_HEALTH_CRITICAL',
    priority: PLAN_HEALTH_CRITICAL_PRIORITY,
    message:
      '⚠️ Hủy lệnh: Squeeze + CVD + Funding cùng xác nhận ngược hướng',
  };
}
