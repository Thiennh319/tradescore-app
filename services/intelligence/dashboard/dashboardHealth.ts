/**
 * Task 14.4 — Health label mapping (presentation only — no scoring).
 */

import type { PerformanceGrade, PerformanceOverall } from '../performance';
import type {
  DashboardHealthLabel,
  DashboardRiskLevel,
  DashboardTradingStatus,
} from './dashboardTypes';

/** Grade → Health bucket (lookup table, not a calculation). */
export function mapGradeToHealth(grade: PerformanceGrade | string): DashboardHealthLabel {
  switch (grade) {
    case 'A':
      return 'Excellent';
    case 'B':
      return 'Good';
    case 'C':
      return 'Warning';
    case 'D':
    case 'F':
      return 'Critical';
    default:
      return 'Unknown';
  }
}

export function mapOverallToRisk(overall: PerformanceOverall): DashboardRiskLevel {
  switch (overall.overallGrade) {
    case 'A':
    case 'B':
      return 'Low';
    case 'C':
      return 'Medium';
    case 'D':
      return 'High';
    case 'F':
      return 'Critical';
    default:
      return 'Unknown';
  }
}

export function mapTradingStatus(overall: PerformanceOverall): DashboardTradingStatus {
  if (overall.overallGrade === 'NA') return 'UNKNOWN';
  if (overall.growthTrend === 'DOWN' || overall.overallGrade === 'F') return 'CAUTION';
  if (overall.overallScore == null) return 'IDLE';
  return 'ACTIVE';
}

export function resolveSystemHealth(overall: PerformanceOverall): DashboardHealthLabel {
  return mapGradeToHealth(overall.overallGrade);
}
