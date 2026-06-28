import type { StrategySource } from '../constants/aiJournal';
import type { ScorerVersion, TradeDirection } from '../constants/scoring';
import type { SignalRow } from './signalBoardScan';
import { CVD_RECOVERING_SOFT_WARNING } from './indicators';
import type { DirectionalScoreV3 } from './scorerV3';
import {
  effectiveTradeDirection,
  resolveSignalRow,
  scoringResultV3FromSignalRow,
} from './signalRowView';

export const JOURNAL_SCORE_MAX = 15;

export interface JournalAdvisorSnapshotFields {
  recommendationLabel: string;
  score: number;
  marketState: string;
}

function scorerVersionForStrategy(
  strategySource: StrategySource | undefined,
  fallback: ScorerVersion | undefined,
): ScorerVersion {
  if (strategySource === 'V3') return 'v3';
  if (strategySource === 'V4' || strategySource === 'CVDX') return 'v4';
  return fallback ?? 'v4';
}

/** Prefix từ decision enum scorer — không đọc lại ngưỡng điểm. */
function strongPrefixFromDecision(decision: string): string {
  if (decision === 'SETUP_NGON' || decision === 'VAO_TU_TIN') return 'STRONG ';
  return '';
}

function hasRecoveringCvdWarning(side: DirectionalScoreV3): boolean {
  if (side.warnings.some((w) => w.includes(CVD_RECOVERING_SOFT_WARNING))) return true;
  return side.layers.some((l) => l.reason.includes(CVD_RECOVERING_SOFT_WARNING));
}

function recoveringPrefixFromSnapWarnings(
  snap: ReturnType<typeof resolveSignalRow>,
  direction: TradeDirection,
): boolean {
  const warnings =
    direction === 'LONG'
      ? [...(snap.longWarnings ?? []), ...(snap.scoringWarnings ?? [])]
      : [...(snap.shortWarnings ?? []), ...(snap.scoringWarnings ?? [])];
  return warnings.some((w) => w.includes(CVD_RECOVERING_SOFT_WARNING));
}

function recommendationPrefix(
  side: DirectionalScoreV3,
  strategySource: StrategySource | undefined,
): string {
  if (strategySource === 'CVDX' && side.direction === 'LONG' && hasRecoveringCvdWarning(side)) {
    return 'RECOVERING ';
  }
  return strongPrefixFromDecision(side.decision);
}

function formatRecommendationLabel(
  direction: TradeDirection,
  score: number,
  prefix: string,
): string {
  return `${prefix}${direction} ${score.toFixed(1)}/${JOURNAL_SCORE_MAX}`;
}

/**
 * Snapshot khuyến nghị lúc vào lệnh — chỉ đọc output V3/V4/CVDX có sẵn trên SignalRow.
 * Journal không tự suy luận LONG / STRONG LONG / RECOVERING LONG.
 */
export function resolveJournalAdvisorSnapshot(input: {
  row: SignalRow;
  strategySource?: StrategySource;
  scorerVersion?: ScorerVersion;
  direction?: TradeDirection;
}): JournalAdvisorSnapshotFields | null {
  const version = scorerVersionForStrategy(input.strategySource, input.scorerVersion);
  const direction = input.direction ?? effectiveTradeDirection(input.row, version);
  const scoring = scoringResultV3FromSignalRow(input.row, version);

  if (scoring) {
    const side = direction === 'LONG' ? scoring.long : scoring.short;
    const score = side.totalScore;
    const prefix = recommendationPrefix(side, input.strategySource);
    return {
      recommendationLabel: formatRecommendationLabel(direction, score, prefix),
      score,
      marketState: scoring.marketMode,
    };
  }

  const snap = resolveSignalRow(input.row, version);
  const score =
    snap.direction === direction
      ? snap.score
      : direction === 'LONG'
        ? snap.longScore
        : snap.shortScore;
  if (!Number.isFinite(score)) return null;

  let prefix = '';
  if (
    input.strategySource === 'CVDX' &&
    direction === 'LONG' &&
    recoveringPrefixFromSnapWarnings(snap, direction)
  ) {
    prefix = 'RECOVERING ';
  } else if (snap.direction === direction) {
    prefix = strongPrefixFromDecision(snap.decisionLabel);
  }

  return {
    recommendationLabel: formatRecommendationLabel(direction, score, prefix),
    score,
    marketState: snap.marketMode ?? 'RANGING',
  };
}
