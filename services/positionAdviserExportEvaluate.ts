/**
 * Task 2.2 — Position Adviser Trace export: match OPEN trade + call production
 * evaluate (V2 / V4 / V41). Does not modify evaluate engines.
 *
 * Selection mirrors alert runner / OpenPositionPnl / useJournalMarketSync:
 *   isV41JournalEntry → evaluatePositionV41
 *   else resolveScorerVersionForEntry === 'v4' → evaluatePositionV4
 *   else → evaluatePositionV2
 */

import type { AiTradeJournalEntry } from '../constants/aiJournal';
import type { ScorerVersion } from '../constants/scoring';
import type { SignalRow } from './signalBoardScan';
import {
  isV41JournalEntry,
  resolveScorerVersionForEntry,
} from '../hooks/useJournalMarketSync';
import {
  evaluatePositionV2,
  type PositionRecommendation,
  type RecommendationType,
} from './positionAdvisorV3';
import { computePositionMaxLossUSDT, evaluatePositionV4 } from './positionAdvisorV4';
import {
  evaluatePositionV41,
  type PositionAdvisorV41Action,
  type PositionAdvisorV41Result,
} from './v41/positionAdvisorV41';
import { NEUTRAL_PROTECTION } from './v41/protectionLayer';
import type { MarketIntelligenceSnapshot } from './v41/types';
import { scoringResultV3FromSignalRow } from './signalRowView';
import type {
  AdviserRecommendation,
  PositionAdviserTraceInput,
} from './aiExport/positionAdviserTrace/PositionAdviserTraceTypes';

/** Default leverage when journal has no leverage field — same as buildCloseAdvisorContext. */
const DEFAULT_LEVERAGE = 5;

export type PositionAdviserEvaluateKind = 'v41' | 'v4' | 'v2';

/**
 * Production evaluate selection — do not diverge from alert runner / OpenPositionPnl /
 * useJournalMarketSync.
 */
export function resolvePositionAdviserEvaluateKind(
  entry: AiTradeJournalEntry,
  storeScorerVersion: ScorerVersion,
): PositionAdviserEvaluateKind {
  if (isV41JournalEntry(entry)) return 'v41';
  const entryVersion = resolveScorerVersionForEntry(entry, storeScorerVersion);
  return entryVersion === 'v4' ? 'v4' : 'v2';
}

/**
 * Match OPEN trade to exported SignalRow direction.
 * APPROVED: symbol + direction; if multiple → newest timestamp; no cross-direction fallback.
 */
export function matchOpenTradeForSignalRow(
  openTrades: readonly AiTradeJournalEntry[] | undefined,
  symbol: string,
  direction: 'LONG' | 'SHORT',
): AiTradeJournalEntry | null {
  if (openTrades == null || openTrades.length === 0) return null;
  const matches = openTrades.filter(
    (t) => t.symbol === symbol && t.scoring.direction === direction,
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) =>
    cur.timestamp >= best.timestamp ? cur : best,
  );
}

function pnlFromPrices(
  entryPrice: number,
  currentPrice: number,
  direction: 'LONG' | 'SHORT',
  size: number,
  leverage: number,
): { pct: number; usdt: number } {
  const units = (size * leverage) / entryPrice;
  const priceDiff =
    direction === 'LONG' ? currentPrice - entryPrice : entryPrice - currentPrice;
  return {
    pct: (priceDiff / entryPrice) * 100 * leverage,
    usdt: priceDiff * units,
  };
}

function formatHoldingDuration(
  openedAtMs: number,
  exportedAtIso: string | undefined,
): string | undefined {
  if (!Number.isFinite(openedAtMs) || openedAtMs <= 0) return undefined;
  const endMs = exportedAtIso ? Date.parse(exportedAtIso) : NaN;
  const end = Number.isFinite(endMs) ? endMs : openedAtMs;
  const mins = Math.max(0, Math.floor((end - openedAtMs) / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function mapV3TypeToAdviserRec(type: RecommendationType): AdviserRecommendation {
  switch (type) {
    case 'HOLD':
      return 'HOLD';
    case 'HOLD_MOVE_SL':
      return 'MOVE SL';
    case 'PARTIAL_TP1':
    case 'PARTIAL_TP2':
    case 'PARTIAL_CLOSE_30':
      return 'SCALE OUT';
    case 'CLOSE_NOW':
    case 'CLOSE_URGENT':
    case 'CLOSE_REVERSE':
      return 'CLOSE';
    default:
      return 'HOLD';
  }
}

function mapV41ActionToAdviserRec(
  action: PositionAdvisorV41Action,
): AdviserRecommendation {
  switch (action) {
    case 'HOLD':
      return 'HOLD';
    case 'MOVE_SL_BE':
    case 'TRAILING_STOP':
      return 'MOVE SL';
    case 'PARTIAL_TP1':
    case 'PARTIAL_TP2':
      return 'SCALE OUT';
    case 'CLOSE_NOW':
      return 'CLOSE';
    default:
      return 'HOLD';
  }
}

function mapV3RecommendationToTrace(
  rec: PositionRecommendation,
  trade: AiTradeJournalEntry,
  currentPrice: number,
  pnl: { pct: number; usdt: number },
  exportedAt: string | undefined,
  adviserVersion: string,
): PositionAdviserTraceInput {
  const recommendation = mapV3TypeToAdviserRec(rec.type);
  const reasonText = rec.reasons.length > 0 ? rec.reasons.join('; ') : rec.label;
  const sl = trade.plan.slActual || trade.plan.slProposed;
  const tp1 = trade.plan.tp1Actual || trade.plan.tp1Proposed;
  const size = trade.plan.sizeActual || trade.plan.sizeProposed;

  const rules = [
    {
      id: rec.triggeredBy,
      name: rec.triggeredBy,
      triggered: true as const,
      priority: rec.urgency,
      reason: reasonText,
      evidence: rec.reasons.map((r) => ({ label: 'Reason', value: r })),
      hardExit:
        rec.type === 'CLOSE_NOW' ||
        rec.type === 'CLOSE_URGENT' ||
        rec.type === 'CLOSE_REVERSE',
    },
  ];

  const contributions =
    rec.thesisHealth?.components != null
      ? (
          Object.entries(rec.thesisHealth.components) as [
            string,
            number,
          ][]
        ).map(([name, contribution]) => ({
          name,
          contribution,
          reason: rec.thesisState?.state,
        }))
      : undefined;

  const scaleOutPct =
    rec.type === 'PARTIAL_CLOSE_30'
      ? 30
      : rec.type === 'PARTIAL_TP1' || rec.type === 'PARTIAL_TP2'
        ? undefined
        : undefined;

  return {
    metadata: {
      version: '1',
      tradeId: trade.id,
      positionId: trade.id,
      coin: trade.symbol,
      side: trade.scoring.direction,
      strategy: adviserVersion,
      openedTime: new Date(trade.timestamp).toISOString(),
      holdingDuration: formatHoldingDuration(trade.timestamp, exportedAt),
      adviserVersion,
    },
    positionSnapshot: {
      entryPrice: trade.market.entryPrice,
      currentPrice,
      pnlPct: pnl.pct,
      pnlUsdt: pnl.usdt,
      unrealizedProfit: pnl.usdt,
      stopLoss: sl,
      takeProfit: tp1,
      positionSize: size,
      holdingTime: formatHoldingDuration(trade.timestamp, exportedAt),
      currentAdviserState: rec.type,
      riskReward: trade.plan.rrProposed,
    },
    decision: {
      recommendation,
      reason: reasonText,
      summary: rec.label,
      confidence: rec.confidence,
      priority: rec.urgency,
    },
    decisionTree: [
      {
        stage: 'Position',
        result: 'OPEN',
        detail: `${trade.scoring.direction} ${trade.symbol}`,
      },
      {
        stage: 'Rule',
        result: rec.triggeredBy,
        detail: reasonText,
      },
      {
        stage: 'Recommendation',
        result: recommendation,
        detail: rec.label,
      },
    ],
    // No checklist array on PositionRecommendation — leave unset → UNAVAILABLE
    rules,
    positionAction: {
      currentAction: rec.type,
      suggestedAction: rec.label,
      reason: reasonText,
      risk: rec.urgency,
    },
    stopLossPlan: {
      currentStopLoss: sl,
      reason:
        rec.type === 'HOLD_MOVE_SL' || rec.triggeredBy === 'MOVE_SL_BE'
          ? reasonText
          : undefined,
      protectionType:
        rec.triggeredBy === 'MOVE_SL_BE' ? 'BREAK_EVEN' : undefined,
      breakEven: rec.triggeredBy === 'MOVE_SL_BE' ? true : undefined,
    },
    takeProfitPlan: {
      currentTakeProfit: tp1,
      scaleOutPct,
      reason:
        recommendation === 'SCALE OUT' || recommendation === 'CLOSE'
          ? reasonText
          : undefined,
    },
    riskReview: {
      ruleStatus: rec.urgency,
      currentRisk: rec.urgency,
    },
    contributions,
  };
}

function mapV41ResultToTrace(
  result: PositionAdvisorV41Result,
  trade: AiTradeJournalEntry,
  currentPrice: number,
  pnl: { pct: number; usdt: number },
  exportedAt: string | undefined,
): PositionAdviserTraceInput {
  const recommendation = mapV41ActionToAdviserRec(result.action);
  const sl = trade.plan.slActual || trade.plan.slProposed;
  const tp1 = trade.plan.tp1Actual || trade.plan.tp1Proposed;
  const size = trade.plan.sizeActual || trade.plan.sizeProposed;

  return {
    metadata: {
      version: '1',
      tradeId: trade.id,
      positionId: trade.id,
      coin: trade.symbol,
      side: trade.scoring.direction,
      strategy: 'v41',
      openedTime: new Date(trade.timestamp).toISOString(),
      holdingDuration: formatHoldingDuration(trade.timestamp, exportedAt),
      adviserVersion: 'v41',
    },
    positionSnapshot: {
      entryPrice: trade.market.entryPrice,
      currentPrice,
      pnlPct: pnl.pct,
      pnlUsdt: pnl.usdt,
      unrealizedProfit: pnl.usdt,
      stopLoss: sl,
      takeProfit: tp1,
      trailingStop: result.trailingStopPrice ?? undefined,
      breakEven: result.breakEvenSuggested,
      positionSize: size,
      holdingTime: formatHoldingDuration(trade.timestamp, exportedAt),
      currentAdviserState: result.action,
      riskReward: trade.plan.rrProposed,
    },
    decision: {
      recommendation,
      reason: result.reason || result.label,
      summary: result.label,
      // V41 result has no numeric confidence field
      confidence: undefined,
      priority: result.urgency,
    },
    decisionTree: [
      {
        stage: 'Position',
        result: 'OPEN',
        detail: `${trade.scoring.direction} ${trade.symbol}`,
      },
      {
        stage: 'Recommendation',
        result: recommendation,
        detail: result.label,
      },
    ],
    rules: [
      {
        id: result.action,
        name: result.action,
        triggered: true,
        priority: result.urgency,
        reason: result.reason || result.label,
        hardExit: result.action === 'CLOSE_NOW',
      },
    ],
    positionAction: {
      currentAction: result.action,
      suggestedAction: result.label,
      reason: result.reason || result.label,
      risk: result.urgency,
    },
    stopLossPlan: {
      currentStopLoss: sl,
      suggestedStopLoss: result.breakEvenPrice ?? result.trailingStopPrice ?? undefined,
      reason: result.reason || undefined,
      protectionType: result.breakEvenSuggested
        ? 'BREAK_EVEN'
        : result.trailingStopSuggested
          ? 'TRAILING'
          : undefined,
      breakEven: result.breakEvenSuggested,
      trailing: result.trailingStopSuggested,
    },
    takeProfitPlan: {
      currentTakeProfit: tp1,
      reason:
        result.action === 'PARTIAL_TP1' || result.action === 'PARTIAL_TP2'
          ? result.reason || result.label
          : undefined,
    },
    riskReview: {
      ruleStatus: result.urgency,
      currentRisk: result.urgency,
    },
  };
}

export type PositionAdviserExportEvaluateResult =
  | { ok: true; input: PositionAdviserTraceInput }
  | { ok: false; reason: 'no_open_position' | 'v41_snapshot_missing' | 'scores_unavailable' };

/**
 * Match + evaluate for Position Trace export.
 * On failure kinds: caller must emit UNAVAILABLE adviser fields (no Entry reuse).
 */
export function evaluateOpenPositionForTraceExport(args: {
  row: SignalRow;
  storeScorerVersion: ScorerVersion;
  openTrades: readonly AiTradeJournalEntry[] | undefined;
  /**
   * V41 MI snapshots keyed by SYMBOL (shared across directions for that symbol).
   * Market-intelligence snapshot is not direction-specific — intentional.
   */
  v41SnapshotBySymbol:
    | Readonly<Partial<Record<string, MarketIntelligenceSnapshot>>>
    | undefined;
  exportedAt: string | undefined;
  direction: 'LONG' | 'SHORT';
}): PositionAdviserExportEvaluateResult {
  const {
    row,
    storeScorerVersion,
    openTrades,
    v41SnapshotBySymbol,
    exportedAt,
    direction,
  } = args;

  const trade = matchOpenTradeForSignalRow(openTrades, row.symbol, direction);
  if (trade == null) {
    return { ok: false, reason: 'no_open_position' };
  }

  const kind = resolvePositionAdviserEvaluateKind(trade, storeScorerVersion);
  const currentPrice = row.price;
  if (currentPrice == null || !Number.isFinite(currentPrice)) {
    return { ok: false, reason: 'scores_unavailable' };
  }

  const size = trade.plan.sizeActual || trade.plan.sizeProposed || 0;
  const leverage = DEFAULT_LEVERAGE;
  const pnl = pnlFromPrices(
    trade.market.entryPrice,
    currentPrice,
    trade.scoring.direction,
    size,
    leverage,
  );

  if (kind === 'v41') {
    // APPROVED #3: V4.1 entry without snapshot → no match / UNAVAILABLE (no V4/V2 fallback).
    const snapshot = v41SnapshotBySymbol?.[trade.symbol];
    if (snapshot == null) {
      return { ok: false, reason: 'v41_snapshot_missing' };
    }
    const result = evaluatePositionV41({
      snapshot,
      protection: NEUTRAL_PROTECTION,
      openPosition: {
        entryPrice: trade.market.entryPrice,
        direction: trade.scoring.direction,
        size,
        leverage,
        sl: trade.plan.slActual || trade.plan.slProposed,
        tp1: trade.plan.tp1Actual || trade.plan.tp1Proposed,
        tp2: trade.plan.tp2,
        tp3: trade.plan.tp3,
        openedAt: trade.timestamp,
      },
      markPrice: currentPrice,
    });
    return {
      ok: true,
      input: mapV41ResultToTrace(result, trade, currentPrice, pnl, exportedAt),
    };
  }

  const entryScorerVersion = resolveScorerVersionForEntry(trade, storeScorerVersion);
  const advisorScoring = scoringResultV3FromSignalRow(row, entryScorerVersion);
  if (advisorScoring == null) {
    return { ok: false, reason: 'scores_unavailable' };
  }

  const ownScore =
    trade.scoring.direction === 'LONG' ? advisorScoring.long : advisorScoring.short;
  const oppositeScore =
    trade.scoring.direction === 'LONG' ? advisorScoring.short : advisorScoring.long;
  const sl = trade.plan.slActual || trade.plan.slProposed;

  const advisorInput = {
    position: {
      direction: trade.scoring.direction,
      entryPrice: trade.market.entryPrice,
      sl,
      tp1: trade.plan.tp1Actual || trade.plan.tp1Proposed,
      tp2: trade.plan.tp2,
      tp3: trade.plan.tp3,
      openedAt: trade.timestamp,
      openTime: trade.timestamp,
      currentPnlPct: pnl.pct,
      currentPnlUSDT: pnl.usdt,
      lastFundingState: trade.lastFundingState,
      lastSqueezeRiskLevel: trade.lastSqueezeRiskLevel,
      lastSqueezeRiskDirection: trade.lastSqueezeRiskDirection,
      maxLossUSDT: computePositionMaxLossUSDT(
        trade.market.entryPrice,
        sl,
        size,
        leverage,
      ),
    },
    currentPrice,
    ownDirectionScore: {
      totalScore: ownScore.totalScore,
      direction: trade.scoring.direction,
      groupScores: ownScore.groupScores,
      decision: ownScore.decision,
      hardBlocks: ownScore.hardBlocks,
      groupBlocks: ownScore.groupBlocks,
      warnings: ownScore.warnings,
      layers: ownScore.layers.map((l) => ({
        layerNumber: l.layerNumber,
        score: l.score,
        reason: l.reason,
      })),
    },
    oppositeDirectionScore: {
      totalScore: oppositeScore.totalScore,
      decision: oppositeScore.decision,
      hardBlocks: oppositeScore.hardBlocks,
    },
    marketMode: advisorScoring.marketMode,
    atr1h: row.atr1h ?? advisorScoring.atr1h,
  };

  const rec: PositionRecommendation =
    kind === 'v4'
      ? evaluatePositionV4({
          ...advisorInput,
          currentFundingState: row.l6Detail?.fundingState,
          currentSqueezeRisk: row.squeezeRisk ?? undefined,
          adxData: row.adxData,
        })
      : evaluatePositionV2(advisorInput);

  return {
    ok: true,
    input: mapV3RecommendationToTrace(
      rec,
      trade,
      currentPrice,
      pnl,
      exportedAt,
      kind,
    ),
  };
}
