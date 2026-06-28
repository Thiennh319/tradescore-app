import {
  recommendFromMatchedRules,
  type ActivePosition,
  type MatchedRuleResult,
  type PositionRecommendation,
  type RecommendationType,
  type RuleContext,
} from './positionAdvisorV3';

/** Rủi ro thị trường ngoài vị thế — không áp grace period. */
export const EXTERNAL_RISK_RULES = new Set([
  'HARD_BLOCK',
  'GROUP_BLOCK',
  'BTC_REVERSAL',
  'OPPOSITE_STRONG',
]);

/** Rule phụ thuộc thời gian giữ lệnh / tiến độ TP — áp grace period khi lệnh mới. */
export const POSITION_MATURITY_RULES = new Set([
  'CVD_DIVERGENCE',
  'FUNDING_REVERSAL',
  'SQUEEZE_RISK_ALERT',
  'TP_HIT',
  'SCORE_DROP_NEAR_TP1',
  'MOVE_SL_BE',
]);

const MATURITY_SUPPRESSED_ACTIONS = new Set<RecommendationType>([
  'CLOSE_NOW',
  'CLOSE_URGENT',
  'PARTIAL_TP1',
  'PARTIAL_TP2',
  'PARTIAL_CLOSE_30',
  'HOLD_MOVE_SL',
]);

export const GRACE_PERIOD_MS = 20 * 60 * 1000;
export const GRACE_ATR_MULTIPLIER = 0.5;

type ProcessedRule = MatchedRuleResult & {
  effectivePriority: number;
  graceSuppressed?: boolean;
};

export interface GracePeriodOptions {
  position: ActivePosition;
  currentPrice: number;
  /** ATR(14) thật từ Scorer khung 1H */
  atr1h?: number;
  now?: number;
}

function positionOpenTime(position: ActivePosition): number {
  return position.openTime ?? position.openedAt;
}

/** Fallback khi thiếu ATR từ Scorer — ước lượng từ khoảng cách SL (~2×ATR). */
export function estimatePositionAtr(position: ActivePosition): number {
  const slDistance = Math.abs(position.entryPrice - position.sl);
  if (slDistance > 0) return slDistance / 2;
  return position.entryPrice * 0.015;
}

/** Ưu tiên ATR 1H từ Scorer; fallback ước lượng SL kèm log cảnh báo. */
export function resolveGraceAtr(
  position: ActivePosition,
  atr1h?: number,
): { atr: number; atrFallbackUsed: boolean } {
  if (Number.isFinite(atr1h) && atr1h! > 0) {
    return { atr: atr1h!, atrFallbackUsed: false };
  }
  const estimated = estimatePositionAtr(position);
  console.warn('[gracePeriod] atr_fallback_used: true', {
    atr_fallback_used: true,
    estimatedAtr: estimated,
    entryPrice: position.entryPrice,
    sl: position.sl,
  });
  return { atr: estimated, atrFallbackUsed: true };
}

/**
 * Grace period: lệnh mới mở (<20 phút) VÀ giá chưa di chuyển ≥0.5×ATR.
 * Thoát grace nếu MỘT trong hai điều kiện không còn đúng (OR).
 */
export function isInGracePeriod(
  position: Pick<ActivePosition, 'entryPrice' | 'openedAt' | 'openTime'>,
  currentPrice: number,
  atr: number,
  now: number = Date.now(),
): boolean {
  const openTime = positionOpenTime(position as ActivePosition);
  if (now - openTime >= GRACE_PERIOD_MS) return false;
  if (!Number.isFinite(atr) || atr <= 0) {
    return true;
  }
  const priceMove = Math.abs(currentPrice - position.entryPrice);
  if (priceMove >= GRACE_ATR_MULTIPLIER * atr) return false;
  return true;
}

function applyGraceToRules(
  matchedRules: MatchedRuleResult[],
  inGrace: boolean,
): ProcessedRule[] {
  return matchedRules.map((rule) => {
    if (!inGrace || !POSITION_MATURITY_RULES.has(rule.ruleName)) {
      return { ...rule, effectivePriority: rule.priority };
    }
    if (MATURITY_SUPPRESSED_ACTIONS.has(rule.type)) {
      return { ...rule, effectivePriority: -1, graceSuppressed: true };
    }
    return { ...rule, effectivePriority: rule.priority };
  });
}

function pickWinnerAfterGrace(
  processed: ProcessedRule[],
  ctx: RuleContext,
): MatchedRuleResult {
  const sorted = [...processed].sort((a, b) => b.effectivePriority - a.effectivePriority);
  const active = sorted.find((r) => r.effectivePriority >= 0);
  if (active) {
    const { effectivePriority: _ep, graceSuppressed: _gs, ...rule } = active;
    return rule;
  }
  return {
    matched: true,
    priority: 0,
    ruleName: 'FALLBACK',
    type: 'HOLD',
    label: 'Tiếp tục giữ',
    color: '#F0B90B',
    confidence: 50,
    reasons: [`Score ${ctx.ownDirectionScore.totalScore.toFixed(1)}/15 — theo dõi thêm`],
    urgency: 'LOW',
  };
}

function buildGraceRecommendation(
  processed: ProcessedRule[],
  winner: MatchedRuleResult,
  matchedRules: MatchedRuleResult[],
  ctx: RuleContext,
  now: number,
): PositionRecommendation {
  const suppressed = processed.filter((r) => r.graceSuppressed);
  const openTime = positionOpenTime(ctx.position);
  const minutesOpen = Math.max(0, Math.floor((now - openTime) / 60_000));
  const maturityWarning = suppressed[0]?.reasons[0];

  const base = recommendFromMatchedRules(
    [winner, ...matchedRules.filter((r) => r.ruleName !== winner.ruleName)],
    ctx,
  );

  const graceLabel = maturityWarning
    ? `Giữ lệnh (mới mở ${minutesOpen} phút) — ${maturityWarning}`
    : `Giữ lệnh (mới mở ${minutesOpen} phút)`;

  const reasons = [...winner.reasons.slice(0, 2)];
  for (const rule of suppressed.slice(0, 2)) {
    const note = rule.reasons[0];
    if (note && !reasons.includes(note)) {
      reasons.push(`(${rule.ruleName}) ${note}`);
    }
  }

  return {
    ...base,
    type: winner.type,
    label: graceLabel,
    color: winner.color,
    confidence: winner.confidence,
    urgency: winner.urgency,
    triggeredBy: winner.ruleName,
    reasons: reasons.slice(0, 5),
    matchedRuleCount: matchedRules.length,
    gracePeriodActive: true,
    graceMinutesOpen: minutesOpen,
    graceSuppressedRules: suppressed.map((r) => r.ruleName),
  };
}

/** Áp grace period lên kết quả rule matrix — dùng chung V3/V4 advisor. */
export function recommendWithGracePeriod(
  matchedRules: MatchedRuleResult[],
  ctx: RuleContext,
  options: GracePeriodOptions,
): PositionRecommendation {
  const now = options.now ?? Date.now();
  const { atr } = resolveGraceAtr(options.position, options.atr1h);
  const inGrace = isInGracePeriod(options.position, options.currentPrice, atr, now);

  if (!inGrace) {
    return recommendFromMatchedRules(matchedRules, ctx);
  }

  const processed = applyGraceToRules(matchedRules, true);
  const topRule = matchedRules[0];
  const maturityWouldWin =
    topRule != null &&
    POSITION_MATURITY_RULES.has(topRule.ruleName) &&
    MATURITY_SUPPRESSED_ACTIONS.has(topRule.type);

  if (!maturityWouldWin) {
    return recommendFromMatchedRules(matchedRules, ctx);
  }

  const winner = pickWinnerAfterGrace(processed, ctx);
  return buildGraceRecommendation(processed, winner, matchedRules, ctx, now);
}

/** Kiểm tra action thuộc nhóm HOLD (dùng trong test). */
export function isHoldFamilyAction(type: RecommendationType): boolean {
  return type === 'HOLD' || type === 'HOLD_MOVE_SL';
}

export function isCloseFamilyAction(type: RecommendationType): boolean {
  return (
    type === 'CLOSE_NOW' ||
    type === 'CLOSE_URGENT' ||
    type === 'CLOSE_REVERSE' ||
    type === 'PARTIAL_TP1' ||
    type === 'PARTIAL_TP2'
  );
}
