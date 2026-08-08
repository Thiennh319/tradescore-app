/**
 * V4.1 Task 10 — Wire Core → RC3 ViewModel.
 *
 * Gọi engine hiện có theo pipeline chuẩn.
 * KHÔNG sửa thuật toán engine. KHÔNG thêm API. Chỉ map output → ViewModel.
 *
 * Task 3: symbol strategy routing — NEAR → breakout adapter; others → TR unchanged.
 */

import { scanBreakoutSetups, type BreakoutTradeLevels } from '../breakoutDetector';
import { computeConfidenceEngineResult } from '../confidenceEngine';
import { computeDecisionEngineResult } from '../decisionEngine';
import type { KlineV41 } from '../indicators';
import { evaluateTrendReversalWithContext } from '../marketContextFilter';
import { computePositionAdviserExplainResult } from '../positionAdviserExplainV41';
import type { SignalRowV41 } from '../scanV41';
import { adaptBreakoutToRc3Card } from '../strategy/adaptBreakoutToRc3Card';
import { resolveSymbolStrategy } from '../strategy/resolveSymbolStrategy';
import {
  planTradeExecution,
  type TradeExecutionPlanPayload,
} from '../tradeExecutionPlannerV41';
import type { V41EngineResult } from '../foundation/engineResult';
import { computeVolatilityExplosion } from '../volatilityExplosionEngine';
import {
  TREND_REVERSAL_ACTIVE_MIN_SIGNALS,
  TREND_REVERSAL_CONFIDENCE_MIN,
} from '../reversalDetector';
import {
  V41_RC3_SYMBOLS,
  symbolDisplayName,
  type V41ChecklistItem,
  type V41DecisionUi,
  type V41Rc3SignalCardModel,
  type V41TradeLevelsUi,
  type V41TriggerType,
  type V41TrGateSummaryUi,
} from './rc3ViewModelTypes';

/** Confirm B research config (NEAR) — W_N20_X5, ATR SL×1.0, no strong-candle / no BTC filter. */
const BREAKOUT_LOOKBACK_N = 20;
const BREAKOUT_MAX_WIDTH_PCT = 5;
const BREAKOUT_ATR_MULT = 1.0;
/** After Confirm B active bar — keep signal actionable for research max-hold window (80×1H). */
const BREAKOUT_SIGNAL_MAX_AGE_BARS_1H = 80;
const MS_1H = 3_600_000;

/** Đúng 4 signal legacy TR gate — không dùng BTC Confirm / Market Context. */
const EMPTY_CHECKLIST: V41ChecklistItem[] = [
  { id: 'cvd_flip', label: 'CVD Flip', passed: false },
  { id: 'volume', label: 'Volume Confirm', passed: false },
  { id: 'structure', label: 'Structure Break', passed: false },
  { id: 'exhaustion', label: 'Exhaustion', passed: false },
];

function emptyGate(): V41TrGateSummaryUi {
  return {
    signalsPassed: 0,
    signalsRequired: TREND_REVERSAL_ACTIVE_MIN_SIGNALS,
    signalsTotal: 4,
    confidenceTr: null,
    confidenceMin: TREND_REVERSAL_CONFIDENCE_MIN,
    signalsMet: false,
    confidenceMet: false,
    activeEligible: false,
  };
}

function buildGateSummary(input: {
  checklist: V41ChecklistItem[];
  confidenceTr: number | null;
}): V41TrGateSummaryUi {
  const signalsPassed = input.checklist.filter((c) => c.passed).length;
  const signalsRequired = TREND_REVERSAL_ACTIVE_MIN_SIGNALS;
  const confidenceMin = TREND_REVERSAL_CONFIDENCE_MIN;
  const confidenceTr = input.confidenceTr;
  const signalsMet = signalsPassed >= signalsRequired;
  const confidenceMet =
    confidenceTr != null && Number.isFinite(confidenceTr) && confidenceTr >= confidenceMin;
  return {
    signalsPassed,
    signalsRequired,
    signalsTotal: input.checklist.length,
    confidenceTr,
    confidenceMin,
    signalsMet,
    confidenceMet,
    activeEligible: signalsMet && confidenceMet,
  };
}

function emptyCard(symbol: string): V41Rc3SignalCardModel {
  return {
    symbol,
    displayName: symbolDisplayName(symbol),
    triggerType: null,
    confidence: null,
    gate: emptyGate(),
    checklist: EMPTY_CHECKLIST.map((item) => ({ ...item })),
    levels: null,
    decision: 'WATCH',
    fetchedAt: null,
  };
}

function isDecisionUi(state: string): state is V41DecisionUi {
  return state === 'LONG' || state === 'SHORT' || state === 'WATCH' || state === 'IGNORE';
}

function attachMarkMetrics(
  result: V41EngineResult,
  markPrice: number | undefined,
  structureStopPrice: number | null,
): V41EngineResult {
  return {
    ...result,
    metrics: {
      ...result.metrics,
      ...(markPrice != null && Number.isFinite(markPrice) && markPrice > 0
        ? { markPrice }
        : {}),
      ...(structureStopPrice != null && Number.isFinite(structureStopPrice)
        ? { structureStopPrice }
        : {}),
    },
  };
}

function levelsFromPlan(plan: TradeExecutionPlanPayload): V41TradeLevelsUi {
  return {
    entry: plan.entry.entryPrice,
    stop: plan.stopLoss.stopLoss,
    tp1: plan.takeProfit.tp1,
    tp2: plan.takeProfit.tp2,
    tp3: plan.takeProfit.tp3,
    rr: plan.riskSummary.rewardRisk,
  };
}

function resolveTriggerType(input: {
  trendActive: boolean;
  volMarketReady: boolean;
  decision: V41DecisionUi;
}): V41TriggerType | null {
  const { trendActive, volMarketReady, decision } = input;
  if (decision === 'LONG' || decision === 'SHORT' || trendActive) {
    return 'Trend Reversal';
  }
  if (volMarketReady) {
    return 'Volatility Explosion';
  }
  // Fake Breakout Engine chưa có — không suy bịa.
  return null;
}

function resolveStructureStop(
  trend: ReturnType<typeof evaluateTrendReversalWithContext>,
  decision: V41DecisionUi,
): number | null {
  if (decision === 'LONG') {
    return trend.detail.newerSwingPrice ?? trend.detail.olderSwingPrice;
  }
  if (decision === 'SHORT') {
    return trend.detail.newerSwingPrice ?? trend.detail.olderSwingPrice;
  }
  return null;
}

/**
 * Chọn setup "hiện tại" từ lịch sử Confirm B:
 * - Chỉ giữ setup còn trong cửa sổ 80×1H kể từ activeOpenTime (khớp max-hold research).
 * - Trong các setup còn fresh: lấy activeOpenTime mới nhất (retest vừa xác nhận gần nhất).
 * Lý do: scanBreakoutSetups emit mọi setup lịch sử; UI cần 1 tín hiệu actionable, không phải
 * setup cũ đã hết cửa sổ giữ lệnh.
 */
export function pickCurrentBreakoutSetup(
  setups: BreakoutTradeLevels[],
  klines1H: KlineV41[],
): BreakoutTradeLevels | null {
  if (setups.length === 0 || klines1H.length === 0) return null;
  const lastOpen = klines1H[klines1H.length - 1]!.openTime;
  if (!Number.isFinite(lastOpen)) return null;
  const maxAgeMs = BREAKOUT_SIGNAL_MAX_AGE_BARS_1H * MS_1H;

  let best: BreakoutTradeLevels | null = null;
  for (const setup of setups) {
    if (setup.activeOpenTime > lastOpen) continue;
    const age = lastOpen - setup.activeOpenTime;
    if (age < 0 || age > maxAgeMs) continue;
    if (best == null || setup.activeOpenTime > best.activeOpenTime) {
      best = setup;
    }
  }
  return best;
}

function buildBreakoutRc3Card(row: SignalRowV41): V41Rc3SignalCardModel {
  const klines1H: KlineV41[] = row.klines1H ?? [];
  const setups = scanBreakoutSetups({
    klines1H,
    lookbackN: BREAKOUT_LOOKBACK_N,
    consolidationMode: 'width',
    maxWidthPct: BREAKOUT_MAX_WIDTH_PCT,
    confirmMode: 'retest',
    slMode: 'atr_break_level',
    atrMult: BREAKOUT_ATR_MULT,
    requireStrongBreakout: false,
    /** Same-level multi-bar fan-out → one actionable setup (V41-SOL-4). */
    dedupeByBrokenLevel: true,
    maxHoldBarsForLevelDedupe: BREAKOUT_SIGNAL_MAX_AGE_BARS_1H,
  });
  const current = pickCurrentBreakoutSetup(setups, klines1H);
  return adaptBreakoutToRc3Card(current, row);
}

/**
 * Wire một symbol: scan row → Core pipeline → RC3 ViewModel.
 */
export function buildRc3ViewModelFromRow(row: SignalRowV41): V41Rc3SignalCardModel {
  const symbol = row.symbol;
  const base = emptyCard(symbol);

  if (resolveSymbolStrategy(symbol) === 'breakout') {
    return buildBreakoutRc3Card(row);
  }

  if (row.error) {
    return { ...base, decision: 'IGNORE', fetchedAt: row.fetchedAt ?? null };
  }

  const klines1H: KlineV41[] = row.klines1H ?? [];
  const klines4H: KlineV41[] = row.klines4H ?? [];
  const btcKlines4H: KlineV41[] = row.btcKlines4H ?? [];
  const trendDirection = row.snapshot.trendDirection;

  const trendWithContext = evaluateTrendReversalWithContext(
    { klines1H, trendDirection, symbol },
    {
      fundingRate: row.fundingRate,
      klines4H: klines4H.length > 0 ? klines4H : undefined,
      btcKlines4H: btcKlines4H.length > 0 ? btcKlines4H : undefined,
    },
  );

  const checklist: V41ChecklistItem[] = [
    {
      id: 'cvd_flip',
      label: 'CVD Flip',
      passed: trendWithContext.signals.cvdFlip,
    },
    {
      id: 'volume',
      label: 'Volume Confirm',
      passed: trendWithContext.signals.volumeConfirmation,
    },
    {
      id: 'structure',
      label: 'Structure Break',
      passed: trendWithContext.signals.structureBreak,
    },
    {
      id: 'exhaustion',
      label: 'Exhaustion',
      passed: trendWithContext.signals.trendExhaustion,
    },
  ];

  const confidenceTr = Number.isFinite(trendWithContext.detail.confidence)
    ? trendWithContext.detail.confidence
    : null;
  const gate = buildGateSummary({ checklist, confidenceTr });

  let volMarketReady = false;
  if (klines4H.length >= 30) {
    try {
      const vol = computeVolatilityExplosion({
        klines4H,
        fundingRate: row.fundingRate,
        btcContext: undefined,
      });
      volMarketReady = vol.state === 'Market Ready';
    } catch {
      volMarketReady = false;
    }
  }

  const confidenceResult = computeConfidenceEngineResult(trendWithContext);
  const decisionResult = computeDecisionEngineResult(confidenceResult);
  const decision: V41DecisionUi = isDecisionUi(decisionResult.state)
    ? decisionResult.state
    : 'WATCH';

  const structureStop = resolveStructureStop(trendWithContext, decision);
  const decisionForPlan = attachMarkMetrics(
    decisionResult,
    row.markPrice,
    structureStop,
  );
  const adviserResult = computePositionAdviserExplainResult(decisionForPlan);
  const adviserForPlan = attachMarkMetrics(
    adviserResult,
    row.markPrice,
    structureStop,
  );

  let levels: V41TradeLevelsUi | null = null;
  if (decision === 'LONG' || decision === 'SHORT') {
    const plan = planTradeExecution({
      decisionResult: decisionForPlan,
      adviserResult: adviserForPlan,
    });
    if (plan != null && !('watchMessage' in plan)) {
      levels = levelsFromPlan(plan);
    }
  }

  return {
    symbol,
    displayName: symbolDisplayName(symbol),
    triggerType: resolveTriggerType({
      trendActive: trendWithContext.state === 'ACTIVE',
      volMarketReady,
      decision,
    }),
    confidence: Number.isFinite(decisionResult.confidence)
      ? decisionResult.confidence
      : null,
    gate,
    checklist,
    levels,
    decision,
    fetchedAt: row.fetchedAt ?? null,
  };
}

/** Wire batch scan rows → ViewModel theo thứ tự RC3. */
export function buildRc3ViewModelsFromScan(
  rows: SignalRowV41[],
  symbols: readonly string[] = V41_RC3_SYMBOLS,
): V41Rc3SignalCardModel[] {
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]));
  return symbols.map((symbol) => {
    const row = bySymbol.get(symbol);
    if (!row) return emptyCard(symbol);
    return buildRc3ViewModelFromRow(row);
  });
}
