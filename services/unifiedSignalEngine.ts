/**
 * Unified signal — merge V4 scorer + V4.1 Market Intelligence.
 * Pure TypeScript; no React/RN.
 */

import type { TradeDirection, TradePlanV3 } from '../constants/scoring';
import type { SignalRow } from './signalBoardScan';
import { generateTradeSetupV41 } from './v41/tradeSetupGenerator';
import { NEUTRAL_PROTECTION } from './v41/protectionLayer';
import type { SignalRowV41 } from './v41/scanV41';
import type { MarketState } from './v41/types';

export type UnifiedSignalStrength = 'STRONG' | 'STRONG_V41' | 'RESCUE' | 'MEDIUM' | 'WATCH' | 'NONE';

export interface UnifiedSignalResult {
  symbol: string;
  direction: TradeDirection | 'NONE';
  strength: UnifiedSignalStrength;
  canEnter: boolean;
  entryPrice: number | null;
  slPrice: number | null;
  tp1Price: number | null;
  tp2Price: number | null;
  tp3Price: number | null;
  slDistancePct: number | null;
  tp1RR: number | null;
  tp2RR: number | null;
  tp3RR: number | null;
  v4Score: number | null;
  v4CanEnter: boolean;
  v4Direction: TradeDirection | 'NONE';
  v41EQ: number | null;
  v41CanEnter: boolean;
  v41Direction: TradeDirection | 'NONE';
  v41MarketState: string | null;
  strengthLabel: string;
  strengthColor: string;
  blockReasons: string[];
  priority: number;
}

export type SignalRowWithDirSnapshots = SignalRow & {
  longSnapshot?: { canEnter?: boolean };
  shortSnapshot?: { canEnter?: boolean };
};

export interface BuildUnifiedSignalParams {
  symbol: string;
  v4Row?: SignalRowWithDirSnapshots;
  v41Row?: SignalRowV41;
}

const V4_MIN_SCORE = 9.0;
const V41_MIN_CONFIDENCE = 70;
const V41_MIN_EQ = 85;

const STRONG_V41_MARKET_STATES: readonly MarketState[] = [
  'StrongUptrend',
  'HealthyUptrend',
  'StrongDowntrend',
  'WeakDowntrend',
];

type Direction = TradeDirection | 'NONE';

interface V41Context {
  hasData: boolean;
  v41CanEnter: boolean;
  v41RescueEligible: boolean;
  v41Direction: Direction;
  v41EQ: number | null;
  v41Confidence: number | null;
  v41MarketState: string | null;
  exhaustionType: string | null;
}

function emptyResult(symbol: string, overrides: Partial<UnifiedSignalResult> = {}): UnifiedSignalResult {
  return {
    symbol,
    direction: 'NONE',
    strength: 'NONE',
    canEnter: false,
    entryPrice: null,
    slPrice: null,
    tp1Price: null,
    tp2Price: null,
    tp3Price: null,
    slDistancePct: null,
    tp1RR: null,
    tp2RR: null,
    tp3RR: null,
    v4Score: null,
    v4CanEnter: false,
    v4Direction: 'NONE',
    v41EQ: null,
    v41CanEnter: false,
    v41Direction: 'NONE',
    v41MarketState: null,
    strengthLabel: '⚪ Chưa có setup',
    strengthColor: '#6B7280',
    blockReasons: [],
    priority: 0,
    ...overrides,
  };
}

function resolveV4Plan(row: SignalRow, direction: TradeDirection): TradePlanV3 | null {
  const v4 = row.tradePlansByScorer?.v4;
  if (v4?.direction === direction) return v4;
  const v3 = row.tradePlansByScorer?.v3;
  if (v3?.direction === direction) return v3;
  if (row.tradePlanV3?.direction === direction) return row.tradePlanV3;
  return null;
}

function resolveV4Signal(v4Row?: SignalRowWithDirSnapshots): {
  v4CanEnter: boolean;
  v4Direction: Direction;
  v4Score: number | null;
} {
  if (!v4Row) {
    return { v4CanEnter: false, v4Direction: 'NONE', v4Score: null };
  }

  if (v4Row.longSnapshot?.canEnter === true && v4Row.longScore >= V4_MIN_SCORE) {
    return { v4CanEnter: true, v4Direction: 'LONG', v4Score: v4Row.longScore };
  }

  if (v4Row.shortSnapshot?.canEnter === true && v4Row.shortScore >= V4_MIN_SCORE) {
    return { v4CanEnter: true, v4Direction: 'SHORT', v4Score: v4Row.shortScore };
  }

  return { v4CanEnter: false, v4Direction: 'NONE', v4Score: null };
}

function isMomentumConfirmedForDirection(
  v41Row: SignalRowV41,
  direction: 'LONG' | 'SHORT',
): boolean {
  const momentum = v41Row.momentum;
  if (!momentum) return false;
  return direction === 'LONG'
    ? momentum.momentumConfirmedLong
    : momentum.momentumConfirmedShort;
}

/** V4.1 kích hoạt khi Confidence + EQ đạt ngưỡng và momentum confirmed theo hướng. */
function resolveV41Context(v41Row?: SignalRowV41): V41Context {
  if (!v41Row?.opportunity) {
    return {
      hasData: false,
      v41CanEnter: false,
      v41RescueEligible: false,
      v41Direction: 'NONE',
      v41EQ: null,
      v41Confidence: null,
      v41MarketState: null,
      exhaustionType: null,
    };
  }

  const { opportunity, snapshot } = v41Row;
  const confidence = snapshot.marketConfidence;
  const eq = opportunity.entryQuality;
  const dir = opportunity.opportunityDirection;
  const hasDirection = dir === 'LONG' || dir === 'SHORT';
  const momentumOk =
    hasDirection && isMomentumConfirmedForDirection(v41Row, dir);

  const v41CanEnter =
    hasDirection &&
    confidence >= V41_MIN_CONFIDENCE &&
    eq >= V41_MIN_EQ &&
    momentumOk;

  const exhaustion = v41Row.exhaustion;
  const v41RescueEligible =
    exhaustion?.exhaustionDetected === true &&
    hasDirection &&
    exhaustion.direction === dir &&
    confidence >= exhaustion.confThreshold &&
    eq >= exhaustion.eqThreshold &&
    momentumOk;

  return {
    hasData: true,
    v41CanEnter,
    v41RescueEligible,
    v41Direction: hasDirection ? dir : 'NONE',
    v41EQ: eq,
    v41Confidence: confidence,
    v41MarketState: snapshot.marketState,
    exhaustionType: exhaustion?.exhaustionType ?? null,
  };
}

function isStrongV41MarketState(state: string | null | undefined): state is MarketState {
  return (
    state != null &&
    (STRONG_V41_MARKET_STATES as readonly string[]).includes(state)
  );
}

function resolveStrength(
  v4CanEnter: boolean,
  v41: V41Context,
  direction: Direction,
): UnifiedSignalStrength {
  if (direction === 'NONE') return 'NONE';

  if (v4CanEnter && v41.v41CanEnter) return 'STRONG';
  if (v4CanEnter && !v41.v41CanEnter) return 'MEDIUM';

  if (!v4CanEnter && v41.v41CanEnter) {
    return isStrongV41MarketState(v41.v41MarketState) ? 'STRONG_V41' : 'WATCH';
  }

  if (!v4CanEnter && v41.v41RescueEligible) return 'RESCUE';

  if (!v4CanEnter && v41.hasData) return 'WATCH';

  return 'NONE';
}

function strengthMeta(
  strength: UnifiedSignalStrength,
  v41: V41Context,
): {
  strengthLabel: string;
  strengthColor: string;
} {
  switch (strength) {
    case 'STRONG':
      return { strengthLabel: '⭐ V4 + V4.1 đồng thuận', strengthColor: '#22C55E' };
    case 'STRONG_V41': {
      const conf = Math.round(v41.v41Confidence ?? 0);
      const eq = Math.round(v41.v41EQ ?? 0);
      const state = v41.v41MarketState ?? 'Unknown';
      return {
        strengthLabel: `🚀 V4.1 — ${state}\nConf ${conf} · EQ ${eq}`,
        strengthColor: '#22C55E',
      };
    }
    case 'RESCUE': {
      const type = v41.exhaustionType ?? 'Unknown';
      return {
        strengthLabel: `⚡ V4.1 Rescue — ${type}`,
        strengthColor: '#A855F7',
      };
    }
    case 'MEDIUM':
      return { strengthLabel: '🟡 V4 xác nhận', strengthColor: '#F59E0B' };
    case 'WATCH':
      return { strengthLabel: '🔵 Theo dõi thêm', strengthColor: '#3B82F6' };
    default:
      return { strengthLabel: '⚪ Chưa có setup', strengthColor: '#6B7280' };
  }
}

function resolvePriority(
  strength: UnifiedSignalStrength,
  direction: Direction,
): number {
  if (strength === 'STRONG' && (direction === 'LONG' || direction === 'SHORT')) return 100;
  if (strength === 'RESCUE' && (direction === 'LONG' || direction === 'SHORT')) return 95;
  if (strength === 'STRONG_V41' && (direction === 'LONG' || direction === 'SHORT')) return 90;
  if (strength === 'MEDIUM' && direction === 'LONG') return 80;
  if (strength === 'MEDIUM' && direction === 'SHORT') return 75;
  if (strength === 'WATCH') return 40;
  return 0;
}

function mergePrices(
  direction: TradeDirection,
  v4Plan: TradePlanV3,
  v41Setup: ReturnType<typeof generateTradeSetupV41>,
): {
  entryPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
} {
  const v4Entry = v4Plan.recommendedEntry;
  const v4SL = v4Plan.stopLoss.price;
  const v4TP1 = v4Plan.tp1.price;
  const v4TP2 = v4Plan.tp2.price;
  const v4TP3 = v4Plan.tp3.price;

  const v41Entry = v41Setup.markPrice;
  const v41SL = v41Setup.smartSlPrice;
  const v41TP1 = v41Setup.tp1Price;
  const v41TP2 = v41Setup.tp2Price;
  const v41TP3 = v41Setup.tp3Price;

  if (direction === 'LONG') {
    return {
      entryPrice: Math.min(v4Entry, v41Entry),
      slPrice: Math.min(v4SL, v41SL),
      tp1Price: Math.min(v4TP1, v41TP1),
      tp2Price: Math.max(v4TP2, v41TP2),
      tp3Price: Math.max(v4TP3, v41TP3),
    };
  }

  return {
    entryPrice: Math.max(v4Entry, v41Entry),
    slPrice: Math.max(v4SL, v41SL),
    tp1Price: Math.max(v4TP1, v41TP1),
    tp2Price: Math.min(v4TP2, v41TP2),
    tp3Price: Math.min(v4TP3, v41TP3),
  };
}

function computeRiskReward(
  direction: TradeDirection,
  entryPrice: number,
  slPrice: number,
  tp1Price: number,
  tp2Price: number,
  tp3Price: number,
): {
  slDistancePct: number;
  tp1RR: number;
  tp2RR: number;
  tp3RR: number;
} {
  const risk = Math.abs(entryPrice - slPrice);
  if (risk <= 0 || entryPrice <= 0) {
    return { slDistancePct: 0, tp1RR: 0, tp2RR: 0, tp3RR: 0 };
  }

  const reward1 = Math.abs(tp1Price - entryPrice);
  const reward2 = Math.abs(tp2Price - entryPrice);
  const reward3 = Math.abs(tp3Price - entryPrice);

  return {
    slDistancePct: Math.round((risk / entryPrice) * 1000) / 10,
    tp1RR: Math.round((reward1 / risk) * 100) / 100,
    tp2RR: Math.round((reward2 / risk) * 100) / 100,
    tp3RR: Math.round((reward3 / risk) * 100) / 100,
  };
}

function collectV4BlockReasons(v4Row: SignalRow, direction: Direction): string[] {
  const reasons = new Set<string>();
  const longPlan = resolveV4Plan(v4Row, 'LONG');
  const shortPlan = resolveV4Plan(v4Row, 'SHORT');

  for (const plan of [longPlan, shortPlan]) {
    plan?.blockReasons?.forEach((reason) => reasons.add(reason));
  }

  if (direction === 'LONG' && longPlan?.blockReasons?.length) {
    return [...longPlan.blockReasons];
  }
  if (direction === 'SHORT' && shortPlan?.blockReasons?.length) {
    return [...shortPlan.blockReasons];
  }

  return [...reasons];
}

function collectV41ActivationBlockReasons(
  v41: V41Context,
  v41Row?: SignalRowV41,
): string[] {
  if (!v41.hasData) return [];

  const conf = Math.round(v41.v41Confidence ?? 0);
  const eq = Math.round(v41.v41EQ ?? 0);
  const confLow = conf < V41_MIN_CONFIDENCE;
  const eqLow = eq < V41_MIN_EQ;

  if (confLow && eqLow) {
    return [`V4.1: Conf ${conf} + EQ ${eq} — cần Conf ≥ ${V41_MIN_CONFIDENCE} và EQ ≥ ${V41_MIN_EQ}`];
  }
  if (confLow) {
    return [`V4.1: Confidence ${conf}/100 — cần ≥ ${V41_MIN_CONFIDENCE}`];
  }
  if (eqLow) {
    return [`V4.1: Entry Quality ${eq}/100 — cần ≥ ${V41_MIN_EQ}`];
  }

  const dir = v41.v41Direction;
  if (
    (dir === 'LONG' || dir === 'SHORT') &&
    v41Row != null &&
    !isMomentumConfirmedForDirection(v41Row, dir)
  ) {
    return ['V4.1: Momentum 1H chưa xác nhận'];
  }

  return [];
}

function collectV41MarketStateBlockReason(v41: V41Context): string | null {
  if (!v41.v41CanEnter || isStrongV41MarketState(v41.v41MarketState)) {
    return null;
  }
  return `V4.1: ${v41.v41MarketState ?? 'Unknown'} — cần Strong/HealthyUptrend`;
}

function collectV41BlockReasons(
  v41: V41Context,
  strength: UnifiedSignalStrength,
  v41Row?: SignalRowV41,
): string[] {
  if (!v41.hasData) return [];

  const reasons: string[] = [];

  if (!v41.v41CanEnter && !v41.v41RescueEligible) {
    reasons.push(...collectV41ActivationBlockReasons(v41, v41Row));
  }

  if (strength === 'WATCH' && v41.v41CanEnter) {
    const stateReason = collectV41MarketStateBlockReason(v41);
    if (stateReason) reasons.push(stateReason);
  }

  return reasons;
}

function tryGenerateV41Setup(
  v41Row: SignalRowV41,
  direction: TradeDirection,
  markPrice: number,
) {
  if (!v41Row.opportunity) return null;
  try {
    return generateTradeSetupV41({
      snapshot: v41Row.snapshot,
      opportunity: v41Row.opportunity,
      protection: v41Row.protection ?? NEUTRAL_PROTECTION,
      direction,
      markPrice,
      marginUsdt: 6,
      leverage: 5,
    });
  } catch {
    return null;
  }
}

function resolveMarkPrice(
  v41Row: SignalRowV41,
  v4Row?: SignalRowWithDirSnapshots,
  direction?: TradeDirection,
): number | null {
  if (v41Row.markPrice != null && Number.isFinite(v41Row.markPrice) && v41Row.markPrice > 0) {
    return v41Row.markPrice;
  }
  if (v4Row?.price != null && Number.isFinite(v4Row.price) && v4Row.price > 0) {
    return v4Row.price;
  }
  if (v4Row && direction && direction !== 'NONE') {
    const plan = resolveV4Plan(v4Row, direction);
    if (plan?.recommendedEntry != null && Number.isFinite(plan.recommendedEntry)) {
      return plan.recommendedEntry;
    }
  }
  return null;
}

function applyPlanPrices(
  direction: TradeDirection,
  entryPrice: number,
  slPrice: number,
  tp1Price: number,
  tp2Price: number,
  tp3Price: number,
): Pick<
  UnifiedSignalResult,
  'slDistancePct' | 'tp1RR' | 'tp2RR' | 'tp3RR'
> {
  const rr = computeRiskReward(direction, entryPrice, slPrice, tp1Price, tp2Price, tp3Price);
  return {
    slDistancePct: rr.slDistancePct,
    tp1RR: rr.tp1RR,
    tp2RR: rr.tp2RR,
    tp3RR: rr.tp3RR,
  };
}

export function buildUnifiedSignal(params: BuildUnifiedSignalParams): UnifiedSignalResult {
  const { symbol, v4Row, v41Row } = params;

  const v4 = resolveV4Signal(v4Row);
  const v41 = resolveV41Context(v41Row);

  const blockReasons: string[] = [];

  if (
    v4.v4Direction !== 'NONE' &&
    v41.v41Direction !== 'NONE' &&
    v4.v4Direction !== v41.v41Direction
  ) {
    return emptyResult(symbol, {
      v4Score: v4.v4Score,
      v4CanEnter: v4.v4CanEnter,
      v4Direction: v4.v4Direction,
      v41EQ: v41.v41EQ,
      v41CanEnter: v41.v41CanEnter,
      v41Direction: v41.v41Direction,
      v41MarketState: v41.v41MarketState,
      blockReasons: ['V4 và V4.1 xung đột hướng'],
    });
  }

  const direction: Direction =
    v4.v4Direction !== 'NONE'
      ? v4.v4Direction
      : v41.v41Direction !== 'NONE'
        ? v41.v41Direction
        : 'NONE';

  const strength = resolveStrength(v4.v4CanEnter, v41, direction);
  const { strengthLabel, strengthColor } = strengthMeta(strength, v41);
  const canEnter =
    strength === 'STRONG' ||
    strength === 'MEDIUM' ||
    strength === 'STRONG_V41' ||
    strength === 'RESCUE';
  const priority = resolvePriority(strength, direction);

  if (!v4.v4CanEnter && v4Row) {
    blockReasons.push(...collectV4BlockReasons(v4Row, direction));
  }

  if (
    (!v41.v41CanEnter && !v41.v41RescueEligible) ||
    strength === 'WATCH' ||
    strength === 'MEDIUM'
  ) {
    blockReasons.push(...collectV41BlockReasons(v41, strength, v41Row));
  }

  let entryPrice: number | null = null;
  let slPrice: number | null = null;
  let tp1Price: number | null = null;
  let tp2Price: number | null = null;
  let tp3Price: number | null = null;
  let slDistancePct: number | null = null;
  let tp1RR: number | null = null;
  let tp2RR: number | null = null;
  let tp3RR: number | null = null;

  if (canEnter && direction !== 'NONE' && v4Row && (strength === 'STRONG' || strength === 'MEDIUM')) {
    const v4Plan = resolveV4Plan(v4Row, direction);
    if (v4Plan) {
      if (strength === 'MEDIUM') {
        entryPrice = v4Plan.recommendedEntry;
        slPrice = v4Plan.stopLoss.price;
        tp1Price = v4Plan.tp1.price;
        tp2Price = v4Plan.tp2.price;
        tp3Price = v4Plan.tp3.price;
      } else if (strength === 'STRONG' && v41Row) {
        const markPrice = resolveMarkPrice(v41Row, v4Row, direction) ?? v4Plan.recommendedEntry;
        const v41Setup = tryGenerateV41Setup(v41Row, direction, markPrice);
        if (v41Setup) {
          const merged = mergePrices(direction, v4Plan, v41Setup);
          entryPrice = merged.entryPrice;
          slPrice = merged.slPrice;
          tp1Price = merged.tp1Price;
          tp2Price = merged.tp2Price;
          tp3Price = merged.tp3Price;
        } else {
          entryPrice = v4Plan.recommendedEntry;
          slPrice = v4Plan.stopLoss.price;
          tp1Price = v4Plan.tp1.price;
          tp2Price = v4Plan.tp2.price;
          tp3Price = v4Plan.tp3.price;
        }
      }

      if (
        entryPrice != null &&
        slPrice != null &&
        tp1Price != null &&
        tp2Price != null &&
        tp3Price != null
      ) {
        const rr = applyPlanPrices(direction, entryPrice, slPrice, tp1Price, tp2Price, tp3Price);
        slDistancePct = rr.slDistancePct;
        tp1RR = rr.tp1RR;
        tp2RR = rr.tp2RR;
        tp3RR = rr.tp3RR;
      }
    }
  } else if (
    canEnter &&
    direction !== 'NONE' &&
    (strength === 'STRONG_V41' || strength === 'RESCUE') &&
    v41Row
  ) {
    const markPrice = resolveMarkPrice(v41Row, v4Row, direction);
    if (markPrice != null) {
      const v41Setup = tryGenerateV41Setup(v41Row, direction, markPrice);
      if (v41Setup) {
        entryPrice = v41Setup.markPrice;
        slPrice = v41Setup.smartSlPrice;
        tp1Price = v41Setup.tp1Price;
        tp2Price = v41Setup.tp2Price;
        tp3Price = v41Setup.tp3Price;

        const rr = applyPlanPrices(direction, entryPrice, slPrice, tp1Price, tp2Price, tp3Price);
        slDistancePct = rr.slDistancePct;
        tp1RR = rr.tp1RR;
        tp2RR = rr.tp2RR;
        tp3RR = rr.tp3RR;
      }
    }
  }

  return {
    symbol,
    direction,
    strength,
    canEnter,
    entryPrice,
    slPrice,
    tp1Price,
    tp2Price,
    tp3Price,
    slDistancePct,
    tp1RR,
    tp2RR,
    tp3RR,
    v4Score: v4.v4Score,
    v4CanEnter: v4.v4CanEnter,
    v4Direction: v4.v4Direction,
    v41EQ: v41.v41EQ,
    v41CanEnter: v41.v41CanEnter,
    v41Direction: v41.v41Direction,
    v41MarketState: v41.v41MarketState,
    strengthLabel,
    strengthColor,
    blockReasons: [...new Set(blockReasons)],
    priority,
  };
}

export function compareUnifiedSignalPriority(a: UnifiedSignalResult, b: UnifiedSignalResult): number {
  return a.priority - b.priority;
}
