import { useMemo } from 'react';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import type { ScorerVersion } from '../constants/scoring';
import type { SignalRow } from './useSignalBoard';
import type { SignalRowV41 } from '../services/v41/scanV41';
import { buildCloseAdvisorContext } from '../services/positionAdvisorExitTracking';
import {
  buildJournalOpenPnlBreakdown,
  enrichAdvisorLabelWithPartial,
  type JournalPnlBreakdown,
} from '../services/journalService';
import type { LockedTradePlan } from '../constants/aiJournal';
import type { ScoringResultV3 } from '../services/scorerV3';
import type { ScoringResultV4 } from '../services/scorerV4';
import type { FundingState } from '../constants/scoring';
import type { SqueezeRiskResult } from '../types/squeezeRisk';
import { evaluatePositionV41 } from '../services/v41/positionAdvisorV41';
import { NEUTRAL_PROTECTION } from '../services/v41/protectionLayer';
import { useV41Store } from '../store/useV41Store';

export function isV41JournalEntry(entry: AiTradeJournalEntry): boolean {
  const scorerVersion = entry.scoring.scorerVersion as string | undefined;
  return scorerVersion === 'v41' || entry.tags?.includes('v41');
}

function buildV41OpenPositionFromJournal(
  entry: AiTradeJournalEntry,
  leverage: number,
) {
  return {
    entryPrice: entry.market.entryPrice,
    direction: entry.scoring.direction,
    size: entry.plan.sizeActual,
    leverage: leverage,
    sl: entry.plan.slActual,
    tp1: entry.plan.tp1Actual,
    tp2: entry.plan.tp2,
    tp3: entry.plan.tp3,
    openedAt: entry.timestamp,
  };
}

export function buildMarkPricesFromSignalRows(rows: SignalRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (row.price != null && Number.isFinite(row.price)) {
      map[row.symbol] = row.price;
    }
  }
  return map;
}

/** Gộp giá mark từ Signal Board (V3/V4) và scan V4.1 — ưu tiên giá mới hơn. */
export function mergeMarkPrices(
  signalRows: SignalRow[],
  v41Rows: SignalRowV41[] = [],
): Record<string, number> {
  const map = buildMarkPricesFromSignalRows(signalRows);
  for (const row of v41Rows) {
    if (row.markPrice != null && Number.isFinite(row.markPrice)) {
      map[row.symbol] = row.markPrice;
    }
  }
  return map;
}

/** Giá thị trường cho cột Current/Exit — không dùng entry/limit. */
export function resolveJournalMarketPrice(
  entry: AiTradeJournalEntry,
  markBySymbol: Record<string, number>,
): number | undefined {
  const live = markBySymbol[entry.symbol];
  if (live != null && Number.isFinite(live)) return live;
  const atAnalysis = entry.market.priceAtAnalysis;
  if (atAnalysis > 0 && Number.isFinite(atAnalysis)) return atAnalysis;
  return undefined;
}

export function resolveScorerVersionForEntry(
  entry: AiTradeJournalEntry,
  storeVersion: ScorerVersion,
): ScorerVersion {
  if (entry.scoring.scorerVersion === 'v3' || entry.scoring.scorerVersion === 'v4') {
    return entry.scoring.scorerVersion;
  }
  if (entry.strategySource === 'V3') return 'v3';
  if (entry.strategySource === 'V4' || entry.strategySource === 'CVDX') return 'v4';
  return storeVersion;
}

export function useJournalMarketSync(input: {
  entries: AiTradeJournalEntry[];
  signalRows: SignalRow[];
  v41Rows?: SignalRowV41[];
  leverage?: number;
  scorerVersion: ScorerVersion;
  scoringResultV4: ScoringResultV4 | null;
  scoringResultV3: ScoringResultV3 | null;
  lockedPlan: LockedTradePlan | null;
}) {
  const {
    entries,
    signalRows,
    v41Rows = [],
    leverage = 5,
    scorerVersion,
    scoringResultV4,
    scoringResultV3,
    lockedPlan,
  } = input;

  const rowsBySymbol = useMemo(() => {
    const map = new Map<string, SignalRow>();
    for (const row of signalRows) {
      map.set(row.symbol, row);
    }
    return map;
  }, [signalRows]);

  const markBySymbol = useMemo(
    () => mergeMarkPrices(signalRows, v41Rows),
    [signalRows, v41Rows],
  );

  const pnlBreakdownById = useMemo(() => {
    const map: Record<string, JournalPnlBreakdown> = {};
    for (const entry of entries) {
      if (entry.outcome.status !== 'OPEN') continue;
      const mark = resolveJournalMarketPrice(entry, markBySymbol);
      map[entry.id] = buildJournalOpenPnlBreakdown(entry, mark, leverage);
    }
    return map;
  }, [entries, markBySymbol, leverage]);

  const unrealizedById = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const [id, breakdown] of Object.entries(pnlBreakdownById)) {
      map[id] = breakdown.unrealizedPnl;
    }
    return map;
  }, [pnlBreakdownById]);

  const advisorLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of entries) {
      if (entry.outcome.status !== 'OPEN') continue;
      const mark = resolveJournalMarketPrice(entry, markBySymbol);
      if (mark == null || !Number.isFinite(mark)) continue;

      if (isV41JournalEntry(entry)) {
        const lastSnapshot = useV41Store.getState().getSymbolState(entry.symbol).lastSnapshot;
        if (lastSnapshot) {
          const result = evaluatePositionV41({
            snapshot: lastSnapshot,
            protection: NEUTRAL_PROTECTION,
            openPosition: buildV41OpenPositionFromJournal(entry, leverage),
            markPrice: mark,
          });
          map[entry.id] = enrichAdvisorLabelWithPartial(entry, result.label);
        } else {
          map[entry.id] = 'V4.1 — đang theo dõi';
        }
        continue;
      }

      const signalRow = rowsBySymbol.get(entry.symbol) ?? null;
      const entryScorerVersion = resolveScorerVersionForEntry(entry, scorerVersion);

      let currentFundingState: FundingState | undefined;
      let currentSqueezeRisk: SqueezeRiskResult | null | undefined;
      if (entryScorerVersion === 'v4') {
        currentFundingState =
          signalRow?.l6Detail?.fundingState ??
          (entry.symbol === signalRow?.symbol ? scoringResultV4?.l6Detail?.fundingState : undefined);
        currentSqueezeRisk =
          signalRow?.squeezeRisk ??
          (entry.symbol === signalRow?.symbol ? scoringResultV4?.squeezeRisk ?? null : null);
      }

      const ctx = buildCloseAdvisorContext({
        entry,
        markPrice: mark,
        scorerVersion: entryScorerVersion,
        signalRow,
        scoringResultV4: entryScorerVersion === 'v4' ? scoringResultV4 : null,
        scoringResultV3: entryScorerVersion === 'v3' ? scoringResultV3 : null,
        lockedPlan,
        currentFundingState,
        currentSqueezeRisk,
      });
      map[entry.id] = enrichAdvisorLabelWithPartial(entry, ctx.recommendationLabel);
    }
    return map;
  }, [
    entries,
    markBySymbol,
    rowsBySymbol,
    scorerVersion,
    scoringResultV4,
    scoringResultV3,
    lockedPlan,
  ]);

  return { markBySymbol, unrealizedById, pnlBreakdownById, advisorLabelById };
}
