/**
 * Task 15.0.1 — Layer 5 Risk Analyzer.
 * Bands: 0–24 LOW | 25–49 MEDIUM | 50–74 HIGH | 75–100 CRITICAL.
 */

import type { ULCoreMetrics, ULRiskAnalysis, UlRiskLevel } from './types';

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Higher riskScore (0–100) = more risk.
 * Blend of drawdown pressure, weak WR/PF/recovery, low consistency.
 */
export function computeRiskScore(metrics: ULCoreMetrics): number {
  if (metrics.totalTrades === 0) return 0;

  let score = 0;

  const dd = metrics.maxDrawdown;
  const absPnl = Math.max(Math.abs(metrics.netPnl), 1);
  const ddRatio = dd / absPnl;
  score += clamp(ddRatio * 40, 0, 40);

  if (metrics.winRate < 35) score += 20;
  else if (metrics.winRate < 45) score += 12;
  else if (metrics.winRate < 55) score += 5;

  if (metrics.profitFactor < 0.8) score += 20;
  else if (metrics.profitFactor < 1.0) score += 14;
  else if (metrics.profitFactor < 1.3) score += 6;

  if (metrics.recoveryFactor != null) {
    if (metrics.recoveryFactor < 0) score += 12;
    else if (metrics.recoveryFactor < 0.5) score += 8;
    else if (metrics.recoveryFactor < 1) score += 4;
  }

  if (metrics.consistencyScore < 35) score += 10;
  else if (metrics.consistencyScore < 50) score += 5;

  if (metrics.maxDrawdown > 0) {
    const curRatio = metrics.currentDrawdown / metrics.maxDrawdown;
    if (curRatio > 0.8) score += 8;
    else if (curRatio > 0.5) score += 4;
  }

  return Math.round(clamp(score, 0, 100));
}

export function riskLevelFromScore(score: number): UlRiskLevel {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

function summarize(level: UlRiskLevel): string {
  switch (level) {
    case 'LOW':
      return 'Rủi ro thấp — hệ thống đang ổn định.';
    case 'MEDIUM':
      return 'Rủi ro trung bình — cần theo dõi drawdown và consistency.';
    case 'HIGH':
      return 'Rủi ro cao — nên giảm quy mô và siết điều kiện vào lệnh.';
    case 'CRITICAL':
      return 'Rủi ro nghiêm trọng — tạm dừng hoặc giảm mạnh exposure.';
    default:
      return 'Chưa đủ dữ liệu rủi ro.';
  }
}

export function analyzeRisk(metrics: ULCoreMetrics): ULRiskAnalysis {
  if (metrics.totalTrades === 0) {
    return {
      riskLevel: 'LOW',
      score: 0,
      factors: {
        drawdown: 0,
        winRate: 0,
        profitFactor: 0,
        recoveryFactor: null,
        consistency: 0,
      },
      summary: 'Chưa có lệnh đóng — rủi ro mặc định LOW.',
    };
  }

  const score = computeRiskScore(metrics);
  const riskLevel = riskLevelFromScore(score);
  return {
    riskLevel,
    score,
    factors: {
      drawdown: metrics.maxDrawdown,
      winRate: metrics.winRate,
      profitFactor: metrics.profitFactor,
      recoveryFactor: metrics.recoveryFactor,
      consistency: metrics.consistencyScore,
    },
    summary: summarize(riskLevel),
  };
}
