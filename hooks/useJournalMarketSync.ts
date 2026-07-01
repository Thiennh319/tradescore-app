import { useMemo } from 'react';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import type { ScorerVersion } from '../constants/scoring';
import type { SignalRow } from './useSignalBoard';
import { buildCloseAdvisorContext } from '../services/positionAdvisorExitTracking';
import { computeTradePnl } from '../services/journalService';
import type { LockedTradePlan } from '../constants/aiJournal';
import type { ScoringResultV3 } from '../services/scorerV3';
import type { ScoringResultV4 } from '../services/scorerV4';
import type { FundingState } from '../constants/scoring';
import type { SqueezeRiskResult } from '../types/squeezeRisk';

export function buildMarkPricesFromSignalRows(rows: SignalRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (row.price != null && Number.isFinite(row.price)) {
      map[row.symbol] = row.price;
    }
  }
  return map;
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
  leverage?: number;
  scorerVersion: ScorerVersion;
  scoringResultV4: ScoringResultV4 | null;
  scoringResultV3: ScoringResultV3 | null;
  lockedPlan: LockedTradePlan | null;
}) {
  const {
    entries,
    signalRows,
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
    () => buildMarkPricesFromSignalRows(signalRows),
    [signalRows],
  );

  const unrealizedById = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const entry of entries) {
      if (entry.outcome.status !== 'OPEN') continue;
      const mark = markBySymbol[entry.symbol];
      map[entry.id] =
        mark != null ? computeTradePnl(entry, mark, leverage).pnlUSDT : null;
    }
    return map;
  }, [entries, markBySymbol, leverage]);

  const advisorLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of entries) {
      if (entry.outcome.status !== 'OPEN') continue;
      const mark = markBySymbol[entry.symbol];
      if (mark == null || !Number.isFinite(mark)) continue;

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
      map[entry.id] = ctx.recommendationLabel;
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

  return { markBySymbol, unrealizedById, advisorLabelById };
}
