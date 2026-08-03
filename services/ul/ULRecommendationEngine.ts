/**
 * Task 15.0.1 — Layer 7 Recommendation Engine.
 * Priority: CRITICAL | HIGH | MEDIUM | LOW | INFO.
 * Empty trades → [].
 */

import type {
  ULCoinAnalysis,
  ULCoreMetrics,
  ULPatternAnalysis,
  ULRecommendation,
  ULRiskAnalysis,
} from './types';
import { UL_RECOMMENDATION_PRIORITY_RANK } from './types';
import { formatPct, formatRr } from './ULFormat';

export function buildRecommendations(input: {
  metrics: ULCoreMetrics;
  coins: ULCoinAnalysis;
  patterns: ULPatternAnalysis;
  risk: ULRiskAnalysis;
}): ULRecommendation[] {
  const { metrics, coins, patterns, risk } = input;
  if (metrics.totalTrades === 0) return [];

  const out: ULRecommendation[] = [];

  if (risk.riskLevel === 'CRITICAL' || risk.riskLevel === 'HIGH') {
    out.push({
      id: 'ul-rec-reduce-size',
      priority: risk.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      title: 'Giảm quy mô vị thế',
      description: 'Mức rủi ro hiện tại cao — giảm size để bảo vệ vốn.',
      reason: `riskLevel=${risk.riskLevel}; score=${risk.score}`,
      severity: risk.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'WARN',
      action: 'Reduce position size',
    });
  }

  if (metrics.averageRr != null && metrics.averageRr < 1.2 && metrics.totalTrades >= 5) {
    out.push({
      id: 'ul-rec-avoid-low-rr',
      priority: 'HIGH',
      title: 'Tránh setup RR thấp',
      description: 'RR trung bình đang thấp — chỉ vào lệnh khi RR đạt ngưỡng tối thiểu.',
      reason: `averageRr=${formatRr(metrics.averageRr)}`,
      severity: 'WARN',
      action: 'Avoid low RR setups',
    });
  }

  if (coins.bestCoin && coins.rows[0] && coins.rows[0].winRate >= 55) {
    out.push({
      id: 'ul-rec-focus-best-coin',
      priority: 'MEDIUM',
      title: `Ưu tiên ${coins.bestCoin}`,
      description: `${coins.bestCoin} đang dẫn đầu về hiệu suất — cân nhắc tập trung volume.`,
      reason: `bestCoin=${coins.bestCoin}; wr=${formatPct(coins.rows[0].winRate)}%`,
      severity: 'INFO',
      action: `Trade ${coins.bestCoin} only`,
    });
  }

  if (coins.worstCoin && coins.bestCoin && coins.worstCoin !== coins.bestCoin) {
    const worst = coins.rows[coins.rows.length - 1];
    if (worst && worst.trades >= 3 && worst.winRate < 40) {
      out.push({
        id: 'ul-rec-reduce-worst-coin',
        priority: 'MEDIUM',
        title: `Hạn chế ${coins.worstCoin}`,
        description: `${coins.worstCoin} đang kém hiệu quả — giảm tần suất hoặc bỏ qua.`,
        reason: `worstCoin=${coins.worstCoin}; wr=${formatPct(worst.winRate)}%`,
        severity: 'WARN',
        action: `Reduce ${coins.worstCoin} exposure`,
      });
    }
  }

  if (patterns.losingStreak >= 3) {
    out.push({
      id: 'ul-rec-revenge',
      priority: 'HIGH',
      title: 'Giảm revenge trading',
      description: 'Chuỗi thua gần đây kéo dài — nghỉ hoặc giảm size trước khi vào lệnh tiếp.',
      reason: `losingStreak=${patterns.losingStreak}`,
      severity: 'WARN',
      action: 'Reduce revenge trading',
    });
  }

  if (metrics.averageHoldingTime != null && metrics.averageHoldingTime < 15 && metrics.winRate < 50) {
    out.push({
      id: 'ul-rec-patience',
      priority: 'MEDIUM',
      title: 'Tăng kiên nhẫn giữ lệnh',
      description: 'Thời gian giữ lệnh ngắn kèm win rate thấp — tránh thoát sớm không theo plan.',
      reason: `avgHold=${Math.round(metrics.averageHoldingTime)}m; wr=${formatPct(metrics.winRate)}%`,
      severity: 'INFO',
      action: 'Increase patience',
    });
  }

  if (metrics.profitFactor < 1 && metrics.totalTrades >= 8) {
    out.push({
      id: 'ul-rec-pf',
      priority: 'HIGH',
      title: 'Siết điều kiện vào lệnh',
      description: 'Profit factor < 1 — hệ thống đang âm kỳ vọng; chỉ trade A+ setups.',
      reason: `profitFactor=${formatRr(metrics.profitFactor)}`,
      severity: 'WARN',
      action: 'Tighten entry filters',
    });
  }

  if (out.length === 0) {
    out.push({
      id: 'ul-rec-stable',
      priority: 'INFO',
      title: 'Hệ thống ổn định',
      description: 'Không có cảnh báo ưu tiên — tiếp tục kỷ luật theo plan.',
      reason: `wr=${formatPct(metrics.winRate)}; pf=${formatRr(metrics.profitFactor)}`,
      severity: 'INFO',
      action: 'Maintain discipline',
    });
  }

  out.sort((a, b) => {
    const d =
      UL_RECOMMENDATION_PRIORITY_RANK[a.priority] - UL_RECOMMENDATION_PRIORITY_RANK[b.priority];
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });

  return out.slice(0, 8);
}
