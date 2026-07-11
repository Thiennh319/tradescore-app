import type {
  LayerResult,
  ScorerVersion,
  TradeDecisionLabel,
  TradeDirection,
  TradePlanV3,
} from '../constants/scoring';
import type { SignalRow, SignalRowScorerSnapshot } from './signalBoardScan';
import type { DirectionalScoreV4, ScoringResultV4 } from './scorerV4';
import { emptyL6DetailV4, neutralSqueezeRiskResult } from './scorerV4';
import { scoringResultV4ToLegacyV3 } from './tradePlanV4';
import type { DirectionalScoreV3, ScoringResultV3 } from './scorerV3';
import type { DecisionTypeV2 } from '../constants/scoring';
import { FinalEntryStatus } from '../types/scoring';

function rowSnapshot(row: SignalRow, version: ScorerVersion): SignalRowScorerSnapshot {
  if (version === 'v4' && row.v4) return row.v4;
  if (version === 'v3' && row.v3) return row.v3;
  if (row.v4) return row.v4;
  if (row.v3) return row.v3;
  return {
    score: row.score,
    longScore: row.longScore,
    shortScore: row.shortScore,
    direction: row.direction,
    decisionLabel: row.decisionLabel,
    decisionDisplay: row.decisionDisplay,
    winrate: row.winrate,
    canEnter: row.canEnter,
    layers: row.layers,
    mandatoryViolations: row.mandatoryViolations,
    hardBlocked: row.hardBlocked,
    isAmbiguousDirection: row.isAmbiguousDirection,
    ambiguousMessage: row.ambiguousMessage,
  };
}

/** Lấy snapshot chấm điểm theo engine V3 hoặc V4. */
export function resolveSignalRow(
  row: SignalRow,
  version: ScorerVersion = 'v4',
): SignalRowScorerSnapshot {
  return rowSnapshot(row, version);
}

/** finalEntryStatus theo engine đang chọn. */
export function resolveFinalEntryStatus(
  row: SignalRow,
  version: ScorerVersion = 'v4',
): FinalEntryStatus | undefined {
  const snap = rowSnapshot(row, version);
  return snap.finalEntryStatus ?? row.finalEntryStatus;
}

/** Trade plan theo engine đang chọn. */
export function resolveTradePlanV3(
  row: SignalRow,
  version: ScorerVersion = 'v4',
): TradePlanV3 | null {
  const byScorer = row.tradePlansByScorer?.[version];
  if (byScorer != null) return byScorer;
  return version === 'v4' ? (row.tradePlanV3 ?? null) : null;
}

/** Hướng lệnh thực tế khi đặt từ setup. */
export function effectiveTradeDirection(
  row: SignalRow,
  version: ScorerVersion = 'v4',
): TradeDirection {
  return rowSnapshot(row, version).direction;
}

function layerNumberOf(layer: LayerResult): number {
  return layer.layer;
}

function inferDecisionFromScore(score: number): DecisionTypeV2 {
  if (score >= 11.5) return 'SETUP_NGON';
  if (score >= 11) return 'VAO_TU_TIN';
  if (score >= 9) return 'CO_THE_VAO';
  if (score >= 8) return 'CHO_THEM';
  return 'KHONG_VAO';
}

function sideDecision(snap: SignalRowScorerSnapshot, direction: TradeDirection): DecisionTypeV2 {
  if (snap.direction === direction && snap.decisionLabel) {
    return snap.decisionLabel as DecisionTypeV2;
  }
  const score = direction === 'LONG' ? snap.longScore : snap.shortScore;
  return inferDecisionFromScore(score);
}

/** Dựng DirectionalScoreV3 thuần từ snapshot V3 (không qua adapter V4). */
function directionalScoreV3FromSnapshot(
  snap: SignalRowScorerSnapshot,
  direction: TradeDirection,
): DirectionalScoreV3 {
  const isLong = direction === 'LONG';
  const layers = layersForDirection(snap, direction);
  const groupBlocks = isLong
    ? (snap.longGroupBlocks ?? (snap.direction === 'LONG' ? snap.groupBlocks : []) ?? [])
    : (snap.shortGroupBlocks ?? (snap.direction === 'SHORT' ? snap.groupBlocks : []) ?? []);
  const hardBlocks = isLong
    ? (snap.longHardBlocks ??
      (snap.direction === 'LONG'
        ? snap.mandatoryViolations.filter((b) => !groupBlocks.includes(b))
        : []))
    : (snap.shortHardBlocks ??
      (snap.direction === 'SHORT'
        ? snap.mandatoryViolations.filter((b) => !groupBlocks.includes(b))
        : []));
  const groupScores = isLong
    ? (snap.longGroupScores ?? snap.groupScores ?? { A: 0, B: 0, C: 0 })
    : (snap.shortGroupScores ?? snap.groupScores ?? { A: 0, B: 0, C: 0 });
  const sideWarnings = isLong ? (snap.longWarnings ?? []) : (snap.shortWarnings ?? []);
  const warnings = [...(snap.scoringWarnings ?? []), ...sideWarnings];
  const totalScore = isLong ? snap.longScore : snap.shortScore;
  const decision = sideDecision(snap, direction);

  return {
    direction,
    layers: layers.map((l) => ({
      layerNumber: layerNumberOf(l),
      score: l.score,
      maxScore: 2,
      reason: l.reason,
      group: 'A' as const,
    })),
    rawLayerScores: Object.fromEntries(layers.map((l) => [layerNumberOf(l), l.score])),
    groupScores,
    totalScore,
    hardBlocks,
    groupBlocks,
    warnings,
    decision,
    decisionLabel: snap.direction === direction ? snap.decisionDisplay : decision,
    decisionColor: '',
    winrate: snap.winrate,
  };
}

function scoringResultV3NativeFromSnapshot(
  snap: SignalRowScorerSnapshot,
  atr1h = 0,
): ScoringResultV3 {
  return {
    long: directionalScoreV3FromSnapshot(snap, 'LONG'),
    short: directionalScoreV3FromSnapshot(snap, 'SHORT'),
    marketMode: snap.marketMode ?? 'RANGING',
    warnings: snap.scoringWarnings ?? [],
    atr1h,
  };
}

function layersForDirection(
  snap: SignalRowScorerSnapshot,
  direction: TradeDirection,
): LayerResult[] {
  if (direction === 'LONG' && snap.longLayers?.length) return snap.longLayers;
  if (direction === 'SHORT' && snap.shortLayers?.length) return snap.shortLayers;
  if (snap.direction === direction) return snap.layers;
  return [];
}

function directionalScoreFromSnapshot(
  snap: SignalRowScorerSnapshot,
  direction: TradeDirection,
): DirectionalScoreV4 {
  const isLong = direction === 'LONG';
  const layers = layersForDirection(snap, direction);
  const groupBlocks = isLong
    ? (snap.longGroupBlocks ?? (snap.direction === 'LONG' ? snap.groupBlocks : []) ?? [])
    : (snap.shortGroupBlocks ?? (snap.direction === 'SHORT' ? snap.groupBlocks : []) ?? []);
  const hardBlocks = isLong
    ? (snap.longHardBlocks ??
      (snap.direction === 'LONG'
        ? snap.mandatoryViolations.filter((b) => !groupBlocks.includes(b))
        : []))
    : (snap.shortHardBlocks ??
      (snap.direction === 'SHORT'
        ? snap.mandatoryViolations.filter((b) => !groupBlocks.includes(b))
        : []));
  const groupScores = isLong
    ? (snap.longGroupScores ?? snap.groupScores ?? { A: 0, B: 0, C: 0 })
    : (snap.shortGroupScores ?? snap.groupScores ?? { A: 0, B: 0, C: 0 });
  const sideWarnings = isLong ? (snap.longWarnings ?? []) : (snap.shortWarnings ?? []);
  const warnings = [...(snap.scoringWarnings ?? []), ...sideWarnings];
  const referenceTotalScore = isLong ? snap.longScore : snap.shortScore;
  const awaitingRescore = snap.awaitingRescore ?? false;
  const blockReasons = isLong
    ? (snap.longBlockReasons ?? [])
    : (snap.shortBlockReasons ?? []);

  return {
    direction,
    layers: layers.map((l) => ({
      layerNumber: layerNumberOf(l),
      score: l.score,
      maxScore: 2,
      reason: l.reason,
      group: 'A' as const,
    })),
    rawLayerScores: Object.fromEntries(layers.map((l) => [layerNumberOf(l), l.score])),
    groupScores,
    referenceTotalScore,
    officialTotalScore: awaitingRescore ? null : referenceTotalScore,
    hardBlocks,
    blockReasons,
    groupBlocks,
    warnings,
    decision: snap.decisionLabel as DirectionalScoreV4['decision'],
    decisionLabel: snap.decisionDisplay,
    decisionColor: '',
    winrate: snap.winrate,
    awaitingRescore,
  };
}

/** Dựng ScoringResultV4 từ snapshot scan. */
export function scoringResultV4FromSignalRow(
  row: SignalRow,
  version: ScorerVersion = 'v4',
): ScoringResultV4 | null {
  const snap = rowSnapshot(row, version);
  if (!snap.groupScores) return null;
  const long = directionalScoreFromSnapshot(snap, 'LONG');
  const short = directionalScoreFromSnapshot(snap, 'SHORT');
  return {
    long,
    short,
    marketMode: snap.marketMode ?? 'RANGING',
    warnings: snap.scoringWarnings ?? [],
    atr1h: row.atr1h ?? 0,
    l6Detail: emptyL6DetailV4(row.fundingRate ?? 0),
    squeezeRisk: row.squeezeRisk ?? neutralSqueezeRiskResult(),
  };
}

/** Scoring V3 cho position advisor — V3 native hoặc V4 qua adapter. */
export function scoringResultV3FromSignalRow(
  row: SignalRow,
  version: ScorerVersion = 'v4',
): ScoringResultV3 | null {
  const snap = rowSnapshot(row, version);
  if (snap.longGroupScores == null && snap.groupScores == null) return null;

  if (version === 'v3') {
    return scoringResultV3NativeFromSnapshot(snap, row.atr1h ?? 0);
  }

  const v4 = scoringResultV4FromSignalRow(row, 'v4');
  if (v4) return scoringResultV4ToLegacyV3(v4);
  return null;
}
