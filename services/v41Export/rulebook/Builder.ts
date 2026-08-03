/**
 * V4.1 Rulebook Trace — Builder.
 * Prefer fields on SignalRowV41; re-call exported pure detectors only when
 * values are not materialized on the row. No network/scan.
 *
 * Threshold literals copied from engine source (some consts are module-private
 * and not exported) — cited in dataSourceDetail / report. Do not invent.
 */

import { computeConfidenceEngineResult } from '../../v41/confidenceEngine';
import { readConfidenceDecisionContext } from '../../v41/confidence/decisionContext';
import { V41_DECISION_CONFIG } from '../../v41/decision/decisionConfig';
import {
  computeDecisionEngineResult,
  isEligibleForDirection,
} from '../../v41/decisionEngine';
import {
  evaluateMarketContext,
  evaluateTrendReversalWithContext,
  type MarketContextDimensionResult,
  type TrendReversalWithContextResult,
} from '../../v41/marketContextFilter';
import {
  TREND_REVERSAL_ACTIVE_MIN_SIGNALS,
  TREND_REVERSAL_CONFIDENCE_MIN,
  TREND_REVERSAL_EXHAUSTION_MIN,
} from '../../v41/reversalDetector';
import {
  atrAtIndex,
  BREAKOUT_RETEST_MAX_BARS,
  computeDonchianRange,
  consolidationConfirmedAtBreakout,
  detectBreakoutAtIndex,
  findRetestBarIndex,
  scanBreakoutSetups,
  type BreakoutEvent,
  type BreakoutTradeLevels,
} from '../../v41/breakoutDetector';
import type { KlineV41 } from '../../v41/indicators';
import {
  buildRc3ViewModelFromRow,
  pickCurrentBreakoutSetup,
} from '../../v41/rc3/buildRc3ViewModel';
import type { V41Rc3SignalCardModel } from '../../v41/rc3/rc3ViewModelTypes';
import { resolveSymbolStrategy } from '../../v41/strategy/resolveSymbolStrategy';
import {
  calculatePreliminaryScores,
} from '../../v41/visibilityManager';
import {
  DEFAULT_VISIBILITY_CONFIG,
  type VisibilityMode,
} from '../../v41/types';
import { resolveV41ExportMeta } from '../types/V41ExportMeta';
import type { V41ExportScalar } from '../formatters/markdown';
import type {
  RulebookV41DecisionOutput,
  RulebookV41EvidenceItem,
  RulebookV41ExportInput,
  RulebookV41InputSnapshot,
  RulebookV41Rule,
  RulebookV41Status,
  RulebookV41Summary,
  RulebookV41Trace,
} from './Types';
import { RULEBOOK_V41_FILENAME_PREFIX } from './Types';

// --- Thresholds copied from engine modules (private consts) — cite, don't invent ---
/** reversalDetector.ts TREND_REVERSAL_VOLUME_MULTIPLIER */
const TH_VOLUME_RATIO = 1.2;
/** reversalDetector.ts TREND_REVERSAL_EXHAUSTION_MIN — import SSOT */
const TH_EXHAUSTION_MIN = TREND_REVERSAL_EXHAUSTION_MIN;
/** reversalDetector.ts TREND_REVERSAL_CONFIDENCE_MIN — import SSOT */
const TH_TR_CONFIDENCE_MIN = TREND_REVERSAL_CONFIDENCE_MIN;
/** Gate label — min signal count for ACTIVE (TREND_REVERSAL_ACTIVE_MIN_SIGNALS). */
const TH_TR_ACTIVE_MIN_SIGNALS = TREND_REVERSAL_ACTIVE_MIN_SIGNALS;
const TR_ACTIVE_GATES = `ACTIVE (cần ≥${TH_TR_ACTIVE_MIN_SIGNALS}/4 signals)`;
const TR_ACTIVE_GATES_STRUCTURE = `${TR_ACTIVE_GATES} — ẨN khỏi checklist UI`;
/** reversalDetector.ts STRUCTURE_SWING_LOOKBACK */
const TH_STRUCTURE_LOOKBACK = 50;
/** marketContextFilter.ts BTC_STRONG_THRESHOLD */
const TH_BTC_STRONG = 75;
/** marketContextFilter.ts FUNDING_EXTREME_THRESHOLD */
const TH_FUNDING_EXTREME = 0.0003;
/** marketContextFilter.ts OI_BUILDUP_PCT / OI_DECLINE_PCT */
const TH_OI_BUILDUP = 1.5;
const TH_OI_DECLINE = -1.5;
/** momentumEngine1H.ts — confirmed when score >= 2 */
const TH_MOMENTUM_CONFIRMED_MIN = 2;
/** earlyWarningEngine.ts — BLOCK when totalSignals >= 2 && volumeConfirmed */
const TH_EW_BLOCK_SIGNAL_MIN = 2;

function boolStatus(pass: boolean): RulebookV41Status {
  return pass ? 'PASS' : 'FAIL';
}

function dimStatus(dim: MarketContextDimensionResult | undefined, contextApplied: boolean): RulebookV41Status {
  if (!contextApplied || dim == null) return 'SKIPPED';
  if (dim.skipped) return 'SKIPPED';
  return boolStatus(dim.pass);
}

function buildEvidence(items: Array<[string, V41ExportScalar]>): RulebookV41EvidenceItem[] {
  return items.map(([label, value]) => ({ label, value }));
}

/**
 * Decision eligibility via exported isEligibleForDirection — no mirrored logic.
 * Caller must only invoke when decisionContext exists (else rule is SKIPPED, actual=null).
 */
function evaluateDecisionEligibility(
  ctx: NonNullable<ReturnType<typeof readConfidenceDecisionContext>>,
): { pass: boolean; evidence: RulebookV41EvidenceItem[]; reasonVi: string } {
  const config = V41_DECISION_CONFIG;
  const pass = isEligibleForDirection(ctx, config);

  return {
    pass,
    evidence: buildEvidence([
      ['isEligibleForDirection', pass],
      ['trendReversalConfirmed', ctx.trendReversalConfirmed],
      ['marketContextPass', ctx.marketContextPass],
      ['marketContextDenied', ctx.marketContextDenied],
      ['marketContextApplied', ctx.marketContextApplied],
      ['completenessMultiplier', ctx.completenessMultiplier],
      ['minCompletenessMultiplier', config.eligibility.minCompletenessMultiplier],
      ['trendSignalCount', ctx.trendSignalCount],
      ['requiredTrendSignalCount', config.eligibility.requiredTrendSignalCount],
      ['hardBlocks', ctx.hardBlocks.join('|') || '(none)'],
    ]),
    reasonVi: pass
      ? 'Đủ điều kiện eligibility — isEligibleForDirection(ctx, V41_DECISION_CONFIG)=true'
      : 'Không đủ eligibility — isEligibleForDirection(ctx, V41_DECISION_CONFIG)=false',
  };
}

function buildInputSnapshot(
  symbol: string,
  row: RulebookV41ExportInput['row'],
): RulebookV41InputSnapshot {
  const snap = row.snapshot;
  return {
    symbol,
    scanTimestamp: snap.scanTimestamp,
    fetchedAt: row.fetchedAt,
    trendStrength: snap.trendStrength,
    trendDirection: snap.trendDirection,
    trendExhaustion: snap.trendExhaustion,
    volumeDivergencePts: snap.volumeDivergencePts,
    reversalProbability: snap.reversalProbability,
    marketConfidence: snap.marketConfidence,
    marketState: snap.marketState,
    visibilityMode: row.visibilityMode ?? 'UNAVAILABLE',
    earlyWarningSeverity: row.earlyWarning?.severity ?? 'UNAVAILABLE',
    momentumConfirmedLong: row.momentum?.momentumConfirmedLong
      ?? row.opportunity?.momentumConfirmedLong
      ?? null,
    momentumConfirmedShort: row.momentum?.momentumConfirmedShort
      ?? row.opportunity?.momentumConfirmedShort
      ?? null,
    fundingRate: row.fundingRate ?? null,
    hasKlines1H: (row.klines1H?.length ?? 0) > 0,
    hasKlines4H: (row.klines4H?.length ?? 0) > 0,
    hasBtcKlines4H: (row.btcKlines4H?.length ?? 0) > 0,
    rowError: row.error ?? null,
  };
}

function buildTrendContextRules(
  tr: TrendReversalWithContextResult | null,
  klines1HAvailable: boolean,
): RulebookV41Rule[] {
  if (!klines1HAvailable || tr == null) {
    const skip = (id: string, name: string, gates: string): RulebookV41Rule => ({
      id,
      name,
      stage: 'trend_reversal',
      status: 'SKIPPED',
      actual: null,
      threshold: null,
      sourceModule: 'services/v41/reversalDetector.ts',
      reasonVi: 'Thiếu klines1H trên SignalRowV41 — không gọi lại computeTrendReversal',
      gates,
      dataSource: 'pure_recall',
      dataSourceDetail: 'evaluateTrendReversalWithContext — skipped (no klines1H)',
    });
    return [
      skip('cvd_flip', 'CVD Flip', 'ACTIVE'),
      skip('volume_confirmation', 'Volume Confirmation', 'ACTIVE'),
      skip('trend_exhaustion_gate', 'Trend Exhaustion Gate', 'ACTIVE'),
      skip('structure_break', 'Structure Break', 'ACTIVE'),
      skip('trend_reversal_confidence', 'Trend Reversal Confidence', 'ACTIVE'),
    ];
  }

  const { signals, detail, state } = tr;
  const pattern =
    'BULL:(+,+,−) | BEAR:(−,−,+) — detectCvdFlip (không có ngưỡng magnitude)';

  return [
    {
      id: 'cvd_flip',
      name: 'CVD Flip',
      stage: 'trend_reversal',
      status: boolStatus(signals.cvdFlip),
      actual: signals.cvdFlip,
      threshold: pattern,
      sourceModule: 'services/v41/reversalDetector.ts',
      reasonVi: signals.cvdFlip
        ? 'CVD proxy 3 nến cuối khớp pattern đảo chiều'
        : 'CVD proxy 3 nến cuối không khớp pattern đảo chiều (hoặc NEUTRAL/<3 nến)',
      evidence: buildEvidence([
        ['cvdLast3[0]', detail.cvdLast3[0]],
        ['cvdLast3[1]', detail.cvdLast3[1]],
        ['cvdLast3[2]', detail.cvdLast3[2]],
      ]),
      gates: TR_ACTIVE_GATES,
      dataSource: 'pure_recall',
      dataSourceDetail:
        'evaluateTrendReversalWithContext → signals.cvdFlip / detail.cvdLast3 (detectCvdFlip)',
    },
    {
      id: 'volume_confirmation',
      name: 'Volume Confirmation',
      stage: 'trend_reversal',
      status: boolStatus(signals.volumeConfirmation),
      actual: detail.volumeRatio,
      threshold: TH_VOLUME_RATIO,
      unit: 'ratio vs MA20',
      sourceModule: 'services/v41/reversalDetector.ts',
      reasonVi: signals.volumeConfirmation
        ? `volumeRatio ${detail.volumeRatio} > ${TH_VOLUME_RATIO} (TREND_REVERSAL_VOLUME_MULTIPLIER)`
        : `volumeRatio ${detail.volumeRatio} ≤ ${TH_VOLUME_RATIO} hoặc thiếu nến cho MA20`,
      evidence: buildEvidence([
        ['volumeRatio', detail.volumeRatio],
        ['volumeConfirmation', signals.volumeConfirmation],
      ]),
      gates: TR_ACTIVE_GATES,
      dataSource: 'pure_recall',
      dataSourceDetail:
        'evaluateTrendReversalWithContext → signals.volumeConfirmation / detail.volumeRatio',
    },
    {
      id: 'trend_exhaustion_gate',
      name: 'Trend Exhaustion Gate',
      stage: 'trend_reversal',
      status: boolStatus(signals.trendExhaustion),
      actual: detail.trendExhaustion,
      threshold: TH_EXHAUSTION_MIN,
      unit: 'pts (1H Task-2)',
      sourceModule: 'services/v41/reversalDetector.ts',
      reasonVi: signals.trendExhaustion
        ? `trendExhaustion(1H) ${detail.trendExhaustion} ≥ ${TH_EXHAUSTION_MIN} (TREND_REVERSAL_EXHAUSTION_MIN)`
        : `trendExhaustion(1H) ${detail.trendExhaustion} < ${TH_EXHAUSTION_MIN}`,
      evidence: buildEvidence([
        ['trendExhaustion_1H', detail.trendExhaustion],
        ['note', 'KHÔNG dùng snapshot.trendExhaustion (4H MI)'],
      ]),
      gates: TR_ACTIVE_GATES,
      dataSource: 'pure_recall',
      dataSourceDetail:
        'evaluateTrendReversalWithContext → signals.trendExhaustion / detail.trendExhaustion (1H)',
    },
    {
      id: 'structure_break',
      name: 'Structure Break',
      stage: 'trend_reversal',
      status: boolStatus(signals.structureBreak),
      actual: detail.structureBreakType,
      threshold: `lookback=${TH_STRUCTURE_LOOKBACK}; BULL:HH→LH | BEAR:LL→HL`,
      sourceModule: 'services/v41/reversalDetector.ts',
      reasonVi: signals.structureBreak
        ? `Structure break xác nhận (${detail.structureBreakType})`
        : 'Chưa có structure break HH→LH / LL→HL — bắt buộc cho ACTIVE nhưng không hiện UI checklist',
      evidence: buildEvidence([
        ['structureBreakType', detail.structureBreakType],
        ['olderSwingPrice', detail.olderSwingPrice],
        ['newerSwingPrice', detail.newerSwingPrice],
        ['structureBreak', signals.structureBreak],
      ]),
      gates: TR_ACTIVE_GATES_STRUCTURE,
      dataSource: 'pure_recall',
      dataSourceDetail:
        'evaluateTrendReversalWithContext → signals.structureBreak / detectStructureBreak (PHẢI gọi lại — không có trên row)',
    },
    buildTrendReversalConfidenceRule(tr),
  ];
}

/**
 * Rule 05 — trend_reversal_confidence.
 * Continuous path (reversalScore defined): Reason phân biệt WATCH thật vs effectively-inactive.
 * Legacy path (flag OFF): format cũ + scoringMode=BINARY_LEGACY.
 */
function buildTrendReversalConfidenceRule(
  tr: TrendReversalWithContextResult,
): RulebookV41Rule {
  const { signals, detail, state } = tr;
  const continuous = tr.reversalScore !== undefined;
  const reversalScore = tr.reversalScore;
  const componentScores = tr.componentScores;
  const isEffectivelyInactive = tr.isEffectivelyInactive === true;

  const CONTINUOUS_EVAL_TABLE_NOTE =
    'Note: trend_reversal_confidence đang dùng continuous scoring (v1.0.8-shadow). State=WATCH có thể là WATCH thật hoặc effectively-inactive — xem Rule 05 Reason để phân biệt, không suy diễn chỉ từ bảng tổng hợp.';

  let reasonVi: string;
  if (continuous && reversalScore !== undefined) {
    if (isEffectivelyInactive) {
      reasonVi = `State=WATCH (score=${reversalScore} < 0.35 — coi như INACTIVE, không phải WATCH thật sự gần đạt ACTIVE)`;
    } else if (state === 'WATCH') {
      reasonVi = `State=WATCH (score=${reversalScore}, đang trong dải WATCH thật — gần ngưỡng ACTIVE 0.6 hơn)`;
    } else {
      reasonVi = `State=ACTIVE (score=${reversalScore} ≥ 0.6 — continuous scoring)`;
    }
  } else {
    reasonVi =
      state === 'ACTIVE'
        ? `≥${TH_TR_ACTIVE_MIN_SIGNALS}/4 signals + confidence ${detail.confidence} ≥ ${TH_TR_CONFIDENCE_MIN} → ACTIVE`
        : `State=${state}: cần ≥${TH_TR_ACTIVE_MIN_SIGNALS}/4 signals và confidence ≥ ${TH_TR_CONFIDENCE_MIN} (TREND_REVERSAL_CONFIDENCE_MIN)`;
  }

  const baseEvidence: Array<[string, V41ExportScalar]> = [
    ['state', state],
    ['confidence', detail.confidence],
    ['activeConditionCount', detail.activeConditionCount],
    ['cvdFlip', signals.cvdFlip],
    ['volumeConfirmation', signals.volumeConfirmation],
    ['trendExhaustion', signals.trendExhaustion],
    ['structureBreak', signals.structureBreak],
  ];

  const evidencePairs: Array<[string, V41ExportScalar]> = continuous
    ? [
        ...baseEvidence,
        ['reversalScore', reversalScore ?? null],
        [
          'componentScores.structureScore',
          componentScores?.structureScore ?? null,
        ],
        ['componentScores.cvdScore', componentScores?.cvdScore ?? null],
        [
          'componentScores.exhaustionScore',
          componentScores?.exhaustionScore ?? null,
        ],
        ['componentScores.volumeScore', componentScores?.volumeScore ?? null],
        ['isEffectivelyInactive', isEffectivelyInactive],
        ['scoringMode', 'CONTINUOUS'],
        // Note text for RULE EVALUATION TABLE (requires Formatter to print under table;
        // stored here so export still carries the wording while only Builder.ts is edited).
        ['evaluationTableNote', CONTINUOUS_EVAL_TABLE_NOTE],
      ]
    : [...baseEvidence, ['scoringMode', 'BINARY_LEGACY']];

  return {
    id: 'trend_reversal_confidence',
    name: 'Trend Reversal Confidence',
    stage: 'trend_reversal',
    status: state === 'ACTIVE' ? 'PASS' : 'WATCH',
    actual: detail.confidence,
    threshold: TH_TR_CONFIDENCE_MIN,
    unit: '%',
    sourceModule: 'services/v41/reversalDetector.ts',
    reasonVi,
    evidence: buildEvidence(evidencePairs),
    gates: 'ACTIVE',
    dataSource: 'pure_recall',
    dataSourceDetail: continuous
      ? 'evaluateTrendReversalWithContext → state / reversalScore / componentScores (continuous scoring)'
      : 'evaluateTrendReversalWithContext → state / detail.confidence (resolveTrendReversalState)',
  };
}

function buildMarketContextRules(
  tr: TrendReversalWithContextResult | null,
  row: RulebookV41ExportInput['row'],
): RulebookV41Rule[] {
  const contextApplied = tr?.marketContext?.applied === true;
  let dims = tr?.marketContext?.dimensions;

  // When TR not ACTIVE, production skips context. Still call evaluateMarketContext
  // for display of dimension would-be results; rule status stays SKIPPED if !applied.
  if (dims == null && tr != null) {
    const evaluated = evaluateMarketContext({
      trendDirection: row.snapshot.trendDirection,
      fundingRate: row.fundingRate,
      klines4H: (row.klines4H?.length ?? 0) > 0 ? row.klines4H : undefined,
      btcKlines4H: (row.btcKlines4H?.length ?? 0) > 0 ? row.btcKlines4H : undefined,
    });
    dims = evaluated.dimensions;
  }

  const mk = (
    id: string,
    name: string,
    dimKey: keyof NonNullable<typeof dims>,
    threshold: V41ExportScalar,
    thresholdNote: string,
  ): RulebookV41Rule => {
    const dim = dims?.[dimKey];
    const status = dimStatus(dim, contextApplied);
    const noRowDataDims = dimKey === 'oi' || dimKey === 'whale';
    const noRowDataNote = noRowDataDims
      ? ' không có data trên row (production scan không fetch OI/Whale)'
      : '';
    return {
      id,
      name,
      stage: 'market_context',
      status,
      actual: dim ? (dim.skipped ? `skipped:${dim.pass}` : dim.pass) : null,
      threshold,
      sourceModule: 'services/v41/marketContextFilter.ts',
      reasonVi: !contextApplied
        ? `Market Context không áp dụng (Trend Reversal ≠ ACTIVE). ${dim?.description ?? ''}${noRowDataNote}`.trim()
        : dim?.skipped
          ? `${dim.title} — ${dim.description}${noRowDataNote}`
          : dim
            ? `${dim.title} — ${dim.description}`
            : 'Không có dimension result',
      evidence: buildEvidence([
        ['contextApplied', contextApplied],
        ['preContextState', tr?.preContextState ?? null],
        ['trState', tr?.state ?? null],
        ['dim.pass', dim?.pass ?? null],
        ['dim.skipped', dim?.skipped ?? null],
        ['dim.title', dim?.title ?? null],
        ['thresholdNote', thresholdNote],
        ['fundingRate_row', row.fundingRate ?? null],
        ...(noRowDataDims
          ? ([['noDataOnRow', true]] as Array<[string, V41ExportScalar]>)
          : []),
      ]),
      gates: 'Giữ ACTIVE / downgrade WATCH khi fail',
      dataSource: 'pure_recall',
      dataSourceDetail: contextApplied
        ? `evaluateTrendReversalWithContext → marketContext.dimensions.${dimKey}`
        : `evaluateMarketContext (display) + status SKIPPED vì TR≠ACTIVE — dimensions.${dimKey}`,
    };
  };

  return [
    mk(
      'market_context_btc',
      'Market Context — BTC',
      'btc',
      TH_BTC_STRONG,
      `BTC_STRONG_THRESHOLD=${TH_BTC_STRONG}; strong band hoặc strength≥${TH_BTC_STRONG}`,
    ),
    mk(
      'market_context_funding',
      'Market Context — Funding',
      'funding',
      TH_FUNDING_EXTREME,
      `FUNDING_EXTREME_THRESHOLD=±${TH_FUNDING_EXTREME}`,
    ),
    mk(
      'market_context_oi',
      'Market Context — OI',
      'oi',
      `${TH_OI_BUILDUP}/${TH_OI_DECLINE}`,
      `OI_BUILDUP_PCT=${TH_OI_BUILDUP}; OI_DECLINE_PCT=${TH_OI_DECLINE} — production scan KHÔNG có oiDeltaPct → thường skipped`,
    ),
    mk(
      'market_context_whale',
      'Market Context — Whale',
      'whale',
      'whale.blocksReversal / signal enum',
      'Production scan KHÔNG fetch whale → thường skipped',
    ),
    mk(
      'market_context_volatility',
      'Market Context — Volatility',
      'volatility',
      'NORMAL pass; LOW/HIGH/EXTREME fail',
      'computeVolatilityRisk(klines4H) qua evaluateVolatilityMarketContext',
    ),
  ];
}

/** NEAR breakout — SKIPPED Market Context với Reason đúng bản chất (không nói TR≠ACTIVE). */
export const BREAKOUT_MC_REASON_VI =
  'N/A — NEAR dùng chiến lược breakout, không đánh giá Market Context (vốn chỉ áp dụng khi Trend Reversal ACTIVE)';
const BREAKOUT_MC_DETAIL =
  'module gốc marketContextFilter — không được gọi trên breakout path (resolveSymbolStrategy=breakout)';

function buildBreakoutSkippedMarketContextRules(): RulebookV41Rule[] {
  const mk = (
    id: string,
    name: string,
    threshold: V41ExportScalar,
  ): RulebookV41Rule => ({
    id,
    name,
    stage: 'market_context',
    status: 'SKIPPED',
    actual: null,
    threshold,
    // Same origin module as TR path (BTC/SOL/BNB) — logic tồn tại ở đây, NEAR không gọi.
    sourceModule: 'services/v41/marketContextFilter.ts',
    reasonVi: BREAKOUT_MC_REASON_VI,
    evidence: buildEvidence([
      ['strategy', 'breakout'],
      ['marketContextApplied', false],
      ['trPipeline', 'not_used'],
    ]),
    gates: 'Giữ ACTIVE / downgrade WATCH khi fail',
    dataSource: 'pure_recall',
    dataSourceDetail: BREAKOUT_MC_DETAIL,
  });

  return [
    mk('market_context_btc', 'Market Context — BTC', TH_BTC_STRONG),
    mk('market_context_funding', 'Market Context — Funding', TH_FUNDING_EXTREME),
    mk(
      'market_context_oi',
      'Market Context — OI',
      `${TH_OI_BUILDUP}/${TH_OI_DECLINE}`,
    ),
    mk(
      'market_context_whale',
      'Market Context — Whale',
      'whale.blocksReversal / signal enum',
    ),
    mk(
      'market_context_volatility',
      'Market Context — Volatility',
      'NORMAL pass; LOW/HIGH/EXTREME fail',
    ),
  ];
}

/** NEAR breakout — SKIPPED Decision TR-confidence với Reason đúng bản chất. */
export const BREAKOUT_DECISION_REASON_VI =
  'N/A — NEAR dùng breakout, không qua Decision Engine dựa trên TR confidence';
const BREAKOUT_DECISION_DETAIL =
  'module gốc decisionConfig/decisionEngine — không được gọi trên breakout path (resolveSymbolStrategy=breakout)';

/** Source Module khớp byte-stable với buildDecisionRules (TR path). */
const BREAKOUT_SKIPPED_DECISION_SOURCE: Record<string, string> = {
  decision_long_short:
    'services/v41/decision/decisionConfig.ts (thresholds.long/short)',
  decision_watch: 'services/v41/decision/decisionConfig.ts (thresholds.watch/long)',
  decision_ignore: 'services/v41/decision/decisionConfig.ts + decisionEngine ladder',
  decision_final_output: 'services/v41/decisionEngine.ts (evaluateDecision → state)',
  decision_eligibility: 'services/v41/decisionEngine.ts (isEligibleForDirection)',
};

function buildBreakoutSkippedDecisionRules(): RulebookV41Rule[] {
  const config = V41_DECISION_CONFIG;
  const thLong = config.thresholds.long;
  const thWatch = config.thresholds.watch;
  const thIgnoreFloor = config.thresholds.ignore;

  const skipped = (
    id: string,
    name: string,
    threshold: V41ExportScalar,
    gates: string,
  ): RulebookV41Rule => ({
    id,
    name,
    stage: 'decision',
    status: 'SKIPPED',
    actual: null,
    threshold,
    unit: id === 'decision_eligibility' ? undefined : '%',
    sourceModule: BREAKOUT_SKIPPED_DECISION_SOURCE[id]!,
    reasonVi: BREAKOUT_DECISION_REASON_VI,
    evidence: buildEvidence([
      ['strategy', 'breakout'],
      ['trConfidence', null],
      ['decisionContext', 'not_computed'],
    ]),
    gates,
    dataSource: 'pure_recall',
    dataSourceDetail: BREAKOUT_DECISION_DETAIL,
  });

  return [
    skipped(
      'decision_long_short',
      'Decision LONG/SHORT Threshold',
      `≥ ${thLong}`,
      'LONG | SHORT confidence band',
    ),
    skipped(
      'decision_watch',
      'Decision WATCH Threshold',
      `${thWatch} ≤ x < ${thLong}`,
      'WATCH confidence band',
    ),
    skipped(
      'decision_ignore',
      'Decision IGNORE Threshold',
      `< ${thWatch} (band IGNORE; config.ignore=${thIgnoreFloor} = isIgnoreCase floor)`,
      'IGNORE confidence band',
    ),
    {
      id: 'decision_final_output',
      name: 'Decision Final Output (engine)',
      stage: 'decision',
      status: 'SKIPPED',
      actual: null,
      threshold: null,
      sourceModule: BREAKOUT_SKIPPED_DECISION_SOURCE.decision_final_output!,
      reasonVi: BREAKOUT_DECISION_REASON_VI,
      evidence: buildEvidence([
        ['strategy', 'breakout'],
        ['engineDecision', 'not_from_tr'],
        ['note', 'RC3 decision comes from adaptBreakoutToRc3Card — see breakout_* rules'],
      ]),
      gates: 'Descriptive — matched tiers cho AI Review CRITICAL check',
      dataSource: 'pure_recall',
      dataSourceDetail: BREAKOUT_DECISION_DETAIL,
    },
    skipped(
      'decision_eligibility',
      'Decision Eligibility',
      `signals≥${config.eligibility.requiredTrendSignalCount}; completeness≥${config.eligibility.minCompletenessMultiplier}; context pass; TR confirmed; no blocks`,
      'LONG/SHORT eligibility',
    ),
  ];
}

function buildDecisionRules(
  decisionResult: ReturnType<typeof computeDecisionEngineResult> | null,
  ctx: ReturnType<typeof readConfidenceDecisionContext>,
): RulebookV41Rule[] {
  const config = V41_DECISION_CONFIG;
  const decision = (decisionResult?.state ?? 'UNAVAILABLE') as string;
  const confidence = decisionResult?.confidence ?? null;
  const canEvaluateEligibility = ctx != null;
  const eligibility = canEvaluateEligibility
    ? evaluateDecisionEligibility(ctx)
    : null;

  const thLong = config.thresholds.long;
  const thWatch = config.thresholds.watch;
  const thIgnoreFloor = config.thresholds.ignore;
  const hasConfidence =
    typeof confidence === 'number' && Number.isFinite(confidence);

  /** Method A — disjoint bands; independent of engine decision label. */
  const longShortStatus: RulebookV41Status = !hasConfidence
    ? 'SKIPPED'
    : confidence! >= thLong
      ? 'PASS'
      : 'FAIL';
  const watchStatus: RulebookV41Status = !hasConfidence
    ? 'SKIPPED'
    : confidence! >= thWatch && confidence! < thLong
      ? 'PASS'
      : 'FAIL';
  const ignoreStatus: RulebookV41Status = !hasConfidence
    ? 'SKIPPED'
    : confidence! < thWatch
      ? 'PASS'
      : 'FAIL';

  const ignoreReasonVi = !hasConfidence
    ? 'Thiếu confidence — không đánh giá band IGNORE'
    : confidence! < thIgnoreFloor
      ? 'Không đủ tín hiệu — dưới ngưỡng ignore gốc (25), gần như không có dữ liệu hỗ trợ hướng đi'
      : confidence! < thWatch
        ? 'Có tín hiệu yếu nhưng chưa đạt ngưỡng watch (45) — vùng chuyển tiếp, có thể đang manh nha xu hướng'
        : `actual=${confidence} ≥ ${thWatch} — ngoài band IGNORE [0, ${thWatch})`;

  return [
    {
      id: 'decision_long_short',
      name: 'Decision LONG/SHORT Threshold',
      stage: 'decision',
      status: longShortStatus,
      actual: confidence,
      threshold: `≥ ${thLong}`,
      unit: '%',
      sourceModule: 'services/v41/decision/decisionConfig.ts (thresholds.long/short)',
      reasonVi: !hasConfidence
        ? 'Thiếu confidence — không đánh giá band LONG/SHORT'
        : longShortStatus === 'PASS'
          ? `actual ${confidence} ≥ ${thLong} — band LONG/SHORT (partition A, độc lập decision output)`
          : `actual ${confidence} < ${thLong} — ngoài band LONG/SHORT`,
      evidence: buildEvidence([
        ['confidence', confidence],
        ['threshold_long_short', thLong],
        ['partition', `[${thLong}, 100]`],
        ['engineDecision_notUsedForStatus', decision],
        ['proposedDirection', ctx?.proposedDirection ?? null],
        ['eligible', eligibility?.pass ?? null],
      ]),
      gates: 'LONG | SHORT confidence band',
      dataSource: 'pure_recall',
      dataSourceDetail:
        'Status = actual≥thresholds.long (75) — Method A partition; không so decision label',
    },
    {
      id: 'decision_watch',
      name: 'Decision WATCH Threshold',
      stage: 'decision',
      status: watchStatus,
      actual: confidence,
      threshold: `${thWatch} ≤ x < ${thLong}`,
      unit: '%',
      sourceModule: 'services/v41/decision/decisionConfig.ts (thresholds.watch/long)',
      reasonVi: !hasConfidence
        ? 'Thiếu confidence — không đánh giá band WATCH'
        : watchStatus === 'PASS'
          ? `actual ${confidence} ∈ [${thWatch}, ${thLong}) — band WATCH (partition A)`
          : `actual ${confidence} ∉ [${thWatch}, ${thLong}) — ngoài band WATCH`,
      evidence: buildEvidence([
        ['confidence', confidence],
        ['threshold_watch_lo', thWatch],
        ['threshold_watch_hi_exclusive', thLong],
        ['partition', `[${thWatch}, ${thLong})`],
        ['engineDecision_notUsedForStatus', decision],
        ['hardBlocks', ctx?.hardBlocks.join('|') || '(none)'],
      ]),
      gates: 'WATCH confidence band',
      dataSource: 'pure_recall',
      dataSourceDetail:
        'Status = thresholds.watch ≤ actual < thresholds.long — Method A; chặn trên tránh chồng long',
    },
    {
      id: 'decision_ignore',
      name: 'Decision IGNORE Threshold',
      stage: 'decision',
      status: ignoreStatus,
      actual: confidence,
      threshold: `< ${thWatch} (band IGNORE; config.ignore=${thIgnoreFloor} = isIgnoreCase floor)`,
      unit: '%',
      sourceModule: 'services/v41/decision/decisionConfig.ts + decisionEngine ladder',
      reasonVi: ignoreReasonVi,
      evidence: buildEvidence([
        ['confidence', confidence],
        ['threshold_ignore_band_hi_exclusive', thWatch],
        ['threshold_ignore_config_floor', thIgnoreFloor],
        ['partition', `[0, ${thWatch})`],
        ['engineDecision_notUsedForStatus', decision],
        ['altTrendDirection', ctx?.altTrendDirection ?? null],
        ['trendSignalCount', ctx?.trendSignalCount ?? null],
        ['completenessMultiplier', ctx?.completenessMultiplier ?? null],
      ]),
      gates: 'IGNORE confidence band',
      dataSource: 'pure_recall',
      dataSourceDetail:
        'Status = actual < thresholds.watch (45) — Method A; config.ignore=25 chỉ phân nhánh reasonVi',
    },
    {
      id: 'decision_final_output',
      name: 'Decision Final Output (engine)',
      stage: 'decision',
      status: 'INFO',
      actual:
        decision === 'LONG' ||
        decision === 'SHORT' ||
        decision === 'WATCH' ||
        decision === 'IGNORE'
          ? decision
          : null,
      threshold: null,
      sourceModule: 'services/v41/decisionEngine.ts (evaluateDecision → state)',
      reasonVi:
        decision === 'UNAVAILABLE'
          ? 'Thiếu decisionResult — không có output engine'
          : `Engine decision cuối = ${decision} (mô tả only; không so threshold)`,
      evidence: buildEvidence([
        ['decision', decision],
        ['confidence', confidence],
      ]),
      gates: 'Descriptive — matchedTier cho AI Review CRITICAL check',
      dataSource: 'pure_recall',
      dataSourceDetail: 'computeDecisionEngineResult → state; Status luôn INFO',
    },
    {
      id: 'decision_eligibility',
      name: 'Decision Eligibility',
      stage: 'decision',
      status: !canEvaluateEligibility
        ? 'SKIPPED'
        : boolStatus(eligibility!.pass),
      actual: !canEvaluateEligibility ? null : eligibility!.pass,
      threshold: `signals≥${config.eligibility.requiredTrendSignalCount}; completeness≥${config.eligibility.minCompletenessMultiplier}; context pass; TR confirmed; no blocks`,
      sourceModule: 'services/v41/decisionEngine.ts (isEligibleForDirection)',
      reasonVi: !canEvaluateEligibility
        ? 'Thiếu decisionContext từ Confidence Engine — không gọi isEligibleForDirection'
        : eligibility!.reasonVi,
      evidence: !canEvaluateEligibility
        ? buildEvidence([['decisionContext', null]])
        : eligibility!.evidence,
      gates: 'LONG/SHORT eligibility',
      dataSource: 'pure_recall',
      dataSourceDetail: !canEvaluateEligibility
        ? 'SKIPPED — thiếu decisionContext (thường do thiếu klines1H); không gọi isEligibleForDirection'
        : 'isEligibleForDirection(readConfidenceDecisionContext(...), V41_DECISION_CONFIG)',
    },
  ];
}

/** Matched confidence-band tier from engine final decision (LONG/SHORT share long_short). */
export type RulebookDecisionMatchedTier = 'long_short' | 'watch' | 'ignore';

export type RulebookDecisionTierReviewLevel = 'CRITICAL' | 'INFO' | 'SKIPPED';

/**
 * AI Review: CRITICAL if matchedTier rule not PASS, or another tier rule PASS.
 * Method A — only 3 tiers; SHORT → matchedTier=long_short.
 */
export function evaluateDecisionTierConsistency(
  rules: readonly RulebookV41Rule[],
): RulebookDecisionTierReviewLevel {
  const finalRule = rules.find((r) => r.id === 'decision_final_output');
  const decision = finalRule?.actual;
  if (decision == null || decision === '') return 'SKIPPED';

  let matchedTier: RulebookDecisionMatchedTier | null = null;
  if (decision === 'LONG' || decision === 'SHORT') matchedTier = 'long_short';
  else if (decision === 'WATCH') matchedTier = 'watch';
  else if (decision === 'IGNORE') matchedTier = 'ignore';
  else return 'SKIPPED';

  const byTier: Record<RulebookDecisionMatchedTier, RulebookV41Rule | undefined> = {
    long_short: rules.find((r) => r.id === 'decision_long_short'),
    watch: rules.find((r) => r.id === 'decision_watch'),
    ignore: rules.find((r) => r.id === 'decision_ignore'),
  };

  const matched = byTier[matchedTier];
  if (matched == null || matched.status !== 'PASS') return 'CRITICAL';

  for (const tier of Object.keys(byTier) as RulebookDecisionMatchedTier[]) {
    if (tier === matchedTier) continue;
    if (byTier[tier]?.status === 'PASS') return 'CRITICAL';
  }
  return 'INFO';
}

/** Build minimal decision-band rules for unit tests (no engine). */
export function buildDecisionBandRulesForTest(input: {
  actual: number;
  decisionFinal: 'LONG' | 'SHORT' | 'WATCH' | 'IGNORE';
}): RulebookV41Rule[] {
  const config = V41_DECISION_CONFIG;
  const thLong = config.thresholds.long;
  const thWatch = config.thresholds.watch;
  const thIgnoreFloor = config.thresholds.ignore;
  const confidence = input.actual;

  const longShortStatus: RulebookV41Status =
    confidence >= thLong ? 'PASS' : 'FAIL';
  const watchStatus: RulebookV41Status =
    confidence >= thWatch && confidence < thLong ? 'PASS' : 'FAIL';
  const ignoreStatus: RulebookV41Status = confidence < thWatch ? 'PASS' : 'FAIL';

  const ignoreReasonVi =
    confidence < thIgnoreFloor
      ? 'Không đủ tín hiệu — dưới ngưỡng ignore gốc (25), gần như không có dữ liệu hỗ trợ hướng đi'
      : confidence < thWatch
        ? 'Có tín hiệu yếu nhưng chưa đạt ngưỡng watch (45) — vùng chuyển tiếp, có thể đang manh nha xu hướng'
        : `actual=${confidence} ≥ ${thWatch} — ngoài band IGNORE [0, ${thWatch})`;

  return [
    {
      id: 'decision_long_short',
      name: 'Decision LONG/SHORT Threshold',
      stage: 'decision',
      status: longShortStatus,
      actual: confidence,
      threshold: `≥ ${thLong}`,
      dataSource: 'pure_recall',
      dataSourceDetail: 'test helper Method A',
      sourceModule: 'test',
      reasonVi: longShortStatus,
    },
    {
      id: 'decision_watch',
      name: 'Decision WATCH Threshold',
      stage: 'decision',
      status: watchStatus,
      actual: confidence,
      threshold: `${thWatch} ≤ x < ${thLong}`,
      dataSource: 'pure_recall',
      dataSourceDetail: 'test helper Method A',
      sourceModule: 'test',
      reasonVi: watchStatus,
    },
    {
      id: 'decision_ignore',
      name: 'Decision IGNORE Threshold',
      stage: 'decision',
      status: ignoreStatus,
      actual: confidence,
      threshold: `< ${thWatch}`,
      dataSource: 'pure_recall',
      dataSourceDetail: 'test helper Method A',
      sourceModule: 'test',
      reasonVi: ignoreReasonVi,
    },
    {
      id: 'decision_final_output',
      name: 'Decision Final Output (engine)',
      stage: 'decision',
      status: 'INFO',
      actual: input.decisionFinal,
      threshold: null,
      dataSource: 'pure_recall',
      dataSourceDetail: 'test helper',
      sourceModule: 'test',
      reasonVi: `Engine decision cuối = ${input.decisionFinal}`,
    },
  ];
}

function buildVisibilityRules(
  row: RulebookV41ExportInput['row'],
): RulebookV41Rule[] {
  const mi = row.snapshot;
  const config = DEFAULT_VISIBILITY_CONFIG;
  const { buyScorePreliminary, sellScorePreliminary } = calculatePreliminaryScores(mi);

  const showCondition =
    buyScorePreliminary >= config.showBuySellThreshold ||
    sellScorePreliminary >= config.showBuySellThreshold ||
    mi.reversalProbability >= config.showReversalThreshold ||
    mi.trendExhaustion >= config.showExhaustionThreshold;

  const hideCondition =
    buyScorePreliminary < config.hideBuySellThreshold &&
    sellScorePreliminary < config.hideBuySellThreshold &&
    mi.reversalProbability < config.hideReversalThreshold &&
    mi.trendExhaustion < config.hideExhaustionThreshold;

  const mode: VisibilityMode | 'UNAVAILABLE' = row.visibilityMode ?? 'UNAVAILABLE';

  return [
    {
      id: 'visibility_show',
      name: 'Visibility Show Gate',
      stage: 'visibility',
      status: boolStatus(showCondition),
      actual: showCondition,
      threshold: `prelim≥${config.showBuySellThreshold} OR reversal≥${config.showReversalThreshold} OR exhaustion≥${config.showExhaustionThreshold}`,
      sourceModule: 'services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG',
      reasonVi: showCondition
        ? `Điều kiện HIỆN tại thời điểm scan — visibilityMode hiện tại=${mode} (chỉ CONDITION; previousMode không có trên row)`
        : `Chưa đạt điều kiện HIỆN tại thời điểm scan — visibilityMode=${mode}`,
      evidence: buildEvidence([
        ['evalKind', 'CONDITION_AT_SCAN_TIME'],
        ['buyScorePreliminary', buyScorePreliminary],
        ['sellScorePreliminary', sellScorePreliminary],
        ['reversalProbability', mi.reversalProbability],
        ['trendExhaustion_4H_MI', mi.trendExhaustion],
        ['showBuySellThreshold', config.showBuySellThreshold],
        ['showReversalThreshold', config.showReversalThreshold],
        ['showExhaustionThreshold', config.showExhaustionThreshold],
        ['visibilityMode_row', mode],
        ['previousMode', 'UNAVAILABLE_on_row'],
        ['note', 'Đánh giá CONDITION thuần từ snapshot tại thời điểm scan — không gọi resolveVisibilityHysteresis'],
      ]),
      gates: 'INACTIVE → WATCH_MODE',
      dataSource: 'condition_from_snapshot',
      dataSourceDetail:
        'CONDITION at scan time: calculatePreliminaryScores(row.snapshot) + DEFAULT_VISIBILITY_CONFIG show thresholds (no previousMode)',
    },
    {
      id: 'visibility_hide',
      name: 'Visibility Hide Gate',
      stage: 'visibility',
      status: boolStatus(hideCondition),
      actual: hideCondition,
      threshold: `prelim<${config.hideBuySellThreshold} AND reversal<${config.hideReversalThreshold} AND exhaustion<${config.hideExhaustionThreshold}`,
      sourceModule: 'services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG',
      reasonVi: hideCondition
        ? `Điều kiện ẨN tại thời điểm scan — visibilityMode hiện tại=${mode}`
        : `Chưa đạt điều kiện ẨN tại thời điểm scan (hoặc vùng hysteresis) — visibilityMode=${mode}`,
      evidence: buildEvidence([
        ['evalKind', 'CONDITION_AT_SCAN_TIME'],
        ['buyScorePreliminary', buyScorePreliminary],
        ['sellScorePreliminary', sellScorePreliminary],
        ['reversalProbability', mi.reversalProbability],
        ['trendExhaustion_4H_MI', mi.trendExhaustion],
        ['hideBuySellThreshold', config.hideBuySellThreshold],
        ['hideReversalThreshold', config.hideReversalThreshold],
        ['hideExhaustionThreshold', config.hideExhaustionThreshold],
        ['visibilityMode_row', mode],
        ['previousMode', 'UNAVAILABLE_on_row'],
      ]),
      gates: '→ INACTIVE',
      dataSource: 'condition_from_snapshot',
      dataSourceDetail:
        'CONDITION at scan time: calculatePreliminaryScores(row.snapshot) + DEFAULT_VISIBILITY_CONFIG hide thresholds (no previousMode)',
    },
  ];
}

function buildEarlyWarningRule(
  row: RulebookV41ExportInput['row'],
): RulebookV41Rule {
  const ew = row.earlyWarning;
  if (ew == null) {
    return {
      id: 'early_warning_block',
      name: 'Early Warning BLOCK',
      stage: 'early_warning',
      status: 'SKIPPED',
      actual: null,
      threshold: `severity===BLOCK (raw: signals≥${TH_EW_BLOCK_SIGNAL_MIN} && volumeConfirmed)`,
      sourceModule: 'services/v41/earlyWarningEngine.ts + scanV41 hysteresis',
      reasonVi: 'Không có earlyWarning trên SignalRowV41',
      gates: 'opportunityValid=false; force WATCH_MODE',
      dataSource: 'row_field',
      dataSourceDetail: 'row.earlyWarning missing',
    };
  }

  const isBlock = ew.severity === 'BLOCK';
  return {
    id: 'early_warning_block',
    name: 'Early Warning BLOCK',
    stage: 'early_warning',
    status: boolStatus(isBlock),
    actual: ew.severity,
    threshold: 'BLOCK',
    sourceModule: 'services/v41/earlyWarningEngine.ts + store hysteresis',
    reasonVi: isBlock
      ? `severity=BLOCK — ${ew.blockMessage || 'chặn entry / demote WATCH'}`
      : `severity=${ew.severity} — không BLOCK`,
    evidence: buildEvidence([
      ['severity', ew.severity],
      ['rawSeverity', ew.rawSeverity],
      ['signalCount', ew.signalCount],
      ['volumeConfirmed', ew.volumeConfirmed],
      ['signals30M', ew.signals30M.join('|') || '(none)'],
      ['signals1H', ew.signals1H.join('|') || '(none)'],
      ['warningMessage', ew.warningMessage || null],
      ['blockMessage', ew.blockMessage || null],
      [
        'rawBlockRule',
        `totalSignals≥${TH_EW_BLOCK_SIGNAL_MIN} && volumeConfirmed → BLOCK (earlyWarningEngine)`,
      ],
    ]),
    gates: 'BLOCK → opportunityValid=false; visibilityMode=WATCH',
    dataSource: 'row_field',
    dataSourceDetail:
      'row.earlyWarning.severity (hysteresis-stabilized); evidence từ EarlyWarningSnapshot fields',
  };
}

function buildMomentumRule(
  row: RulebookV41ExportInput['row'],
): RulebookV41Rule {
  const momentum = row.momentum;
  const fromOpp = row.opportunity;

  if (momentum == null && fromOpp == null) {
    return {
      id: 'momentum_confirmed',
      name: 'Momentum 1H Confirmed',
      stage: 'momentum',
      status: 'SKIPPED',
      actual: null,
      threshold: TH_MOMENTUM_CONFIRMED_MIN,
      unit: 'signals (0–2)',
      sourceModule: 'services/v41/momentumEngine1H.ts',
      reasonVi:
        'Không có row.momentum và không có opportunity.momentumConfirmed* — có thể do klines1H < 22 khi scan',
      gates: 'entryQuality.opportunityValid / entry ready',
      dataSource: 'row_field',
      dataSourceDetail: 'row.momentum / row.opportunity missing',
    };
  }

  const confLong =
    momentum?.momentumConfirmedLong ?? fromOpp?.momentumConfirmedLong ?? false;
  const confShort =
    momentum?.momentumConfirmedShort ?? fromOpp?.momentumConfirmedShort ?? false;
  const confirmed = confLong || confShort;
  const longScore = momentum?.momentumLong ?? null;
  const shortScore = momentum?.momentumShort ?? null;

  return {
    id: 'momentum_confirmed',
    name: 'Momentum 1H Confirmed',
    stage: 'momentum',
    status: boolStatus(confirmed),
    actual: confirmed
      ? confLong
        ? `LONG(${longScore})`
        : `SHORT(${shortScore})`
      : `LONG(${longScore})/SHORT(${shortScore})`,
    threshold: TH_MOMENTUM_CONFIRMED_MIN,
    unit: 'signals same side',
    sourceModule: 'services/v41/momentumEngine1H.ts',
    reasonVi: confirmed
      ? `Momentum confirmed — Long=${confLong} Short=${confShort}`
      : `Chưa confirmed — cần score ≥ ${TH_MOMENTUM_CONFIRMED_MIN} cùng phía`,
    evidence: buildEvidence([
      ['momentumConfirmedLong', confLong],
      ['momentumConfirmedShort', confShort],
      ['momentumLong', longScore],
      ['momentumShort', shortScore],
      ['signalsLong', momentum?.signalsLong.join('|') ?? null],
      ['signalsShort', momentum?.signalsShort.join('|') ?? null],
      ['source', momentum != null ? 'row.momentum' : 'row.opportunity'],
    ]),
    gates: 'opportunityValid / entry ready',
    dataSource: 'row_field',
    dataSourceDetail:
      momentum != null
        ? 'row.momentum.momentumConfirmedLong/Short'
        : 'row.opportunity.momentumConfirmedLong/Short',
  };
}

function summarize(
  rules: RulebookV41Rule[],
  decisionOutput: RulebookV41DecisionOutput,
  visibilityMode: VisibilityMode | 'UNAVAILABLE',
  trState: 'ACTIVE' | 'WATCH' | 'UNAVAILABLE',
  marketContextApplied: boolean | null,
  decisionBlockCodes: string[],
): RulebookV41Summary {
  const count = (s: RulebookV41Status) => rules.filter((r) => r.status === s).length;
  return {
    totalRules: rules.length,
    passed: count('PASS'),
    failed: count('FAIL'),
    watch: count('WATCH'),
    skipped: count('SKIPPED'),
    info: count('INFO'),
    decisionOutput,
    visibilityMode,
    trendReversalState: trState,
    marketContextApplied,
    decisionBlockCodes,
  };
}

function buildDecisionChain(
  input: RulebookV41InputSnapshot,
  tr: TrendReversalWithContextResult | null,
  decisionOutput: RulebookV41DecisionOutput,
  confidence: number | null,
): string[] {
  return [
    `MarketState=${input.marketState}`,
    `Visibility=${input.visibilityMode}`,
    `TrendReversal=${tr?.state ?? 'UNAVAILABLE'}(signals=${tr?.detail.activeConditionCount ?? 0}/4)`,
    `MarketContext=${tr?.marketContext?.applied ? (tr.marketContext.pass ? 'PASS' : 'FAIL') : 'NOT_APPLIED'}`,
    `Confidence=${confidence ?? 'UNAVAILABLE'}`,
    `Decision=${decisionOutput}`,
    `EarlyWarning=${input.earlyWarningSeverity}`,
    `MomentumLong=${input.momentumConfirmedLong}|Short=${input.momentumConfirmedShort}`,
  ];
}

/**
 * Mirror Confirm B wire params in buildRc3ViewModel (NEAR) — display-only recall.
 * Do not diverge from RC3 scan args without updating both sites.
 */
const RB_BREAKOUT_LOOKBACK_N = 20;
const RB_BREAKOUT_MAX_WIDTH_PCT = 5;
const RB_BREAKOUT_ATR_MULT = 1.0;

function unavailableEvidence(reason: string): string {
  return `UNAVAILABLE — ${reason}`;
}

function findKlineIndexByOpenTime(klines: KlineV41[], openTime: number): number {
  return klines.findIndex((k) => k.openTime === openTime);
}

/** Latest width-consolidation breakout still inside retest window without a touch. */
function findPendingRetestBreakout(
  klines1H: KlineV41[],
): { event: BreakoutEvent; barsSinceBreakout: number; barsRemainingForRetest: number } | null {
  const last = klines1H.length - 1;
  if (last < RB_BREAKOUT_LOOKBACK_N) return null;

  for (let i = last; i >= RB_BREAKOUT_LOOKBACK_N; i--) {
    const event = detectBreakoutAtIndex(klines1H, i, RB_BREAKOUT_LOOKBACK_N);
    if (event == null) continue;
    if (
      !consolidationConfirmedAtBreakout(klines1H, event, 'width', {
        maxWidthPct: RB_BREAKOUT_MAX_WIDTH_PCT,
      })
    ) {
      continue;
    }

    const barsSinceBreakout = last - event.breakoutIndex;
    if (barsSinceBreakout < 0 || barsSinceBreakout > BREAKOUT_RETEST_MAX_BARS) continue;

    const retestIdx = findRetestBarIndex(klines1H, event, BREAKOUT_RETEST_MAX_BARS);
    if (retestIdx != null) continue;

    return {
      event,
      barsSinceBreakout,
      barsRemainingForRetest: BREAKOUT_RETEST_MAX_BARS - barsSinceBreakout,
    };
  }
  return null;
}

type BreakoutEvidenceBundle = {
  contextEvidence: RulebookV41EvidenceItem[];
  /** null → do not emit breakout_confirmed_active */
  confirmed: BreakoutTradeLevels | null;
  confirmedEvidence: RulebookV41EvidenceItem[] | null;
};

/**
 * Task 7b — split context vs confirmed-active evidence (NEAR only).
 * Pure recall of exported detector helpers; does not change detection behavior.
 */
function collectBreakoutEvidenceBundle(
  row: RulebookV41ExportInput['row'],
  card: V41Rc3SignalCardModel,
): BreakoutEvidenceBundle {
  const cardPairs: Array<[string, V41ExportScalar]> = [
    ['triggerType', card.triggerType],
    ['decision', card.decision],
    ['gate.activeEligible', card.gate.activeEligible],
  ];

  const klines1H: KlineV41[] = row.klines1H ?? [];
  if (klines1H.length === 0) {
    const noK = 'thiếu klines1H trên scan row';
    return {
      contextEvidence: buildEvidence([
        ...cardPairs,
        ['rangeHigh', unavailableEvidence(noK)],
        ['rangeLow', unavailableEvidence(noK)],
        ['widthPct', unavailableEvidence(noK)],
        ['breakoutDetected', unavailableEvidence(noK)],
        ['side', unavailableEvidence(noK)],
        ['awaitingRetest', unavailableEvidence(noK)],
        ['barsSinceBreakout', unavailableEvidence(noK)],
        ['maxRetestBars', BREAKOUT_RETEST_MAX_BARS],
        ['barsRemainingForRetest', unavailableEvidence(noK)],
      ]),
      confirmed: null,
      confirmedEvidence: null,
    };
  }

  const contextPairs: Array<[string, V41ExportScalar]> = [...cardPairs];
  const donchian = computeDonchianRange(klines1H, RB_BREAKOUT_LOOKBACK_N);
  if (donchian == null) {
    const why = `Donchian N=${RB_BREAKOUT_LOOKBACK_N} không tính được (cần ≥${RB_BREAKOUT_LOOKBACK_N} nến + rangeHigh>rangeLow>0)`;
    contextPairs.push(
      ['rangeHigh', unavailableEvidence(why)],
      ['rangeLow', unavailableEvidence(why)],
      ['widthPct', unavailableEvidence(why)],
    );
  } else {
    contextPairs.push(
      ['rangeHigh', donchian.rangeHigh],
      ['rangeLow', donchian.rangeLow],
      ['widthPct', Number(donchian.widthPct.toFixed(4))],
    );
  }

  const setups = scanBreakoutSetups({
    klines1H,
    lookbackN: RB_BREAKOUT_LOOKBACK_N,
    consolidationMode: 'width',
    maxWidthPct: RB_BREAKOUT_MAX_WIDTH_PCT,
    confirmMode: 'retest',
    slMode: 'atr_break_level',
    atrMult: RB_BREAKOUT_ATR_MULT,
    requireStrongBreakout: false,
  });
  const current: BreakoutTradeLevels | null = pickCurrentBreakoutSetup(setups, klines1H);
  const lastIdx = klines1H.length - 1;

  if (current != null) {
    const breakoutIdx = findKlineIndexByOpenTime(klines1H, current.breakoutOpenTime);
    const activeIdx = findKlineIndexByOpenTime(klines1H, current.activeOpenTime);
    const barsSinceBreakout =
      breakoutIdx >= 0
        ? lastIdx - breakoutIdx
        : unavailableEvidence('không khớp breakoutOpenTime trên klines1H');
    const atrValue =
      breakoutIdx >= 0
        ? atrAtIndex(klines1H, breakoutIdx) ??
          unavailableEvidence('ATR(14) chưa đủ dữ liệu tại nến breakout')
        : unavailableEvidence('không khớp breakoutOpenTime trên klines1H');

    contextPairs.push(
      ['breakoutDetected', true],
      ['side', current.side],
      ['awaitingRetest', false],
      ['barsSinceBreakout', barsSinceBreakout],
      ['maxRetestBars', BREAKOUT_RETEST_MAX_BARS],
      [
        'barsRemainingForRetest',
        unavailableEvidence('Confirm B đã active — không còn cửa sổ chờ retest'),
      ],
    );

    const confirmedEvidence = buildEvidence([
      ['side', current.side],
      ['confirmMode', current.confirmMode],
      ['setupRangeHigh', current.rangeHigh],
      ['setupRangeLow', current.rangeLow],
      ['atrValue', atrValue],
      ['entry', current.entry],
      ['sl', current.sl],
      ['tp1', current.tp1],
      ['slDistancePct', Number(current.slDistancePct.toFixed(4))],
      ['tp1RR', current.tp1RR],
      [
        'activeOpenTime',
        activeIdx >= 0 ? current.activeOpenTime : unavailableEvidence('không khớp activeOpenTime'),
      ],
      ['breakoutOpenTime', current.breakoutOpenTime],
    ]);

    return {
      contextEvidence: buildEvidence(contextPairs),
      confirmed: current,
      confirmedEvidence,
    };
  }

  const pending = findPendingRetestBreakout(klines1H);
  if (pending != null) {
    contextPairs.push(
      ['breakoutDetected', true],
      ['side', pending.event.side],
      ['awaitingRetest', true],
      ['barsSinceBreakout', pending.barsSinceBreakout],
      ['maxRetestBars', BREAKOUT_RETEST_MAX_BARS],
      ['barsRemainingForRetest', pending.barsRemainingForRetest],
      ['eventRangeHigh', pending.event.rangeHigh],
      ['eventRangeLow', pending.event.rangeLow],
      ['eventWidthPct', Number(pending.event.widthPct.toFixed(4))],
    );
    return {
      contextEvidence: buildEvidence(contextPairs),
      confirmed: null,
      confirmedEvidence: null,
    };
  }

  contextPairs.push(
    ['breakoutDetected', false],
    ['side', unavailableEvidence('chưa có breakout width-consolidation trong cửa sổ scan')],
    ['awaitingRetest', false],
    [
      'barsSinceBreakout',
      unavailableEvidence('không có breakout đang chờ retest / active setup'),
    ],
    ['maxRetestBars', BREAKOUT_RETEST_MAX_BARS],
    [
      'barsRemainingForRetest',
      unavailableEvidence('không có breakout đang chờ retest'),
    ],
  );

  return {
    contextEvidence: buildEvidence(contextPairs),
    confirmed: null,
    confirmedEvidence: null,
  };
}

function breakoutContextActual(bundle: BreakoutEvidenceBundle): V41ExportScalar {
  if (bundle.confirmed != null) return 'active_setup';
  const awaiting = bundle.contextEvidence.find((e) => e.label === 'awaitingRetest');
  if (awaiting?.value === true) return 'awaiting_retest';
  return 'no_active_setup';
}

/** NEAR (breakout strategy) — export Confirm B levels; không emit checklist TR. */
function buildBreakoutStrategyRules(
  card: V41Rc3SignalCardModel,
  row: RulebookV41ExportInput['row'],
): RulebookV41Rule[] {
  const levels = card.levels;
  const hasSetup = levels != null && (card.decision === 'LONG' || card.decision === 'SHORT');
  const bundle = collectBreakoutEvidenceBundle(row, card);

  const strategyRule: RulebookV41Rule = {
    id: 'breakout_strategy',
    name: 'Symbol Strategy',
    stage: 'breakout',
    status: 'INFO',
    actual: 'breakout_confirm_b',
    threshold: 'N/A — breakout strategy',
    sourceModule: 'services/v41/strategy/resolveSymbolStrategy.ts',
    reasonVi:
      'NEAR dùng Confirm B + ATR SL — không đánh giá checklist Trend Reversal (CVD/Volume/Structure/Exhaustion)',
    gates: 'RC3 Breakout Confirmed',
    dataSource: 'pure_recall',
    dataSourceDetail: "resolveSymbolStrategy(symbol) === 'breakout'",
  };

  /** Task 7b — luôn emit: bối cảnh Donchian / breakout / retest window (không phải gate). */
  const contextRule: RulebookV41Rule = {
    id: 'breakout_context',
    name: 'Breakout Market Context',
    stage: 'breakout',
    status: 'INFO',
    actual: breakoutContextActual(bundle),
    threshold: 'N/A — mô tả bối cảnh',
    sourceModule: 'services/v41/breakoutDetector.ts',
    reasonVi:
      'Mô tả Donchian N=20 + trạng thái breakout/retest tại thời điểm scan — không phải điều kiện PASS/FAIL',
    evidence: bundle.contextEvidence,
    gates: 'Descriptive context only',
    dataSource: 'pure_recall',
    dataSourceDetail:
      'computeDonchianRange / detectBreakoutAtIndex / findRetestBarIndex (read-only; khớp RC3 wire params)',
  };

  const rules: RulebookV41Rule[] = [strategyRule, contextRule];

  /** Task 7b — chỉ emit khi có Confirm B active. */
  if (hasSetup && levels != null && bundle.confirmed != null && bundle.confirmedEvidence != null) {
    rules.push({
      id: 'breakout_confirmed_active',
      name: 'Confirm B Active Setup',
      stage: 'breakout',
      status: 'PASS',
      actual: 'CONFIRMED',
      threshold: 'Confirm B retest + ATR×1.0 within 80×1H',
      sourceModule: 'services/v41/rc3/buildRc3ViewModel.ts',
      reasonVi: `Confirm B active (${card.decision}) — levels từ scanBreakoutSetups → pickCurrentBreakoutSetup`,
      evidence: bundle.confirmedEvidence,
      gates: 'LONG | SHORT',
      dataSource: 'pure_recall',
      dataSourceDetail:
        'scanBreakoutSetups + pickCurrentBreakoutSetup + atrAtIndex (read-only; khớp RC3 wire)',
    });

    rules.push(
      {
        id: 'breakout_side',
        name: 'Breakout Side',
        stage: 'breakout',
        status: 'PASS',
        actual: card.decision,
        threshold: 'LONG | SHORT from Confirm B',
        sourceModule: 'services/v41/breakoutDetector.ts',
        reasonVi: `Setup Confirm B ${card.decision} — mapped từ BreakoutTradeLevels.side`,
        evidence: buildEvidence([
          ['decision', card.decision],
          ['triggerType', card.triggerType],
        ]),
        gates: 'LONG | SHORT',
        dataSource: 'pure_recall',
        dataSourceDetail: 'buildRc3ViewModelFromRow → BreakoutTradeLevels.side',
      },
      {
        id: 'breakout_entry',
        name: 'Breakout Entry',
        stage: 'breakout',
        status: 'INFO',
        actual: levels.entry,
        threshold: 'active close @ Confirm B',
        sourceModule: 'services/v41/breakoutDetector.ts',
        reasonVi: `Entry=${levels.entry}`,
        evidence: buildEvidence([['entry', levels.entry]]),
        gates: 'Trade levels',
        dataSource: 'pure_recall',
        dataSourceDetail: 'BreakoutTradeLevels.entry',
      },
      {
        id: 'breakout_sl',
        name: 'Breakout Stop',
        stage: 'breakout',
        status: 'INFO',
        actual: levels.stop,
        threshold: 'breakout level ∓ ATR(14)×1.0',
        sourceModule: 'services/v41/breakoutDetector.ts',
        reasonVi: `SL=${levels.stop}`,
        evidence: buildEvidence([['stop', levels.stop]]),
        gates: 'Trade levels',
        dataSource: 'pure_recall',
        dataSourceDetail: 'BreakoutTradeLevels.sl',
      },
      {
        id: 'breakout_tp1',
        name: 'Breakout TP1',
        stage: 'breakout',
        status: 'INFO',
        actual: levels.tp1,
        threshold: '1.5R (TP1 only)',
        sourceModule: 'services/v41/breakoutDetector.ts',
        reasonVi: `TP1=${levels.tp1} (tp2/tp3 mirror — UI note TP1 only · 1.5R)`,
        evidence: buildEvidence([
          ['tp1', levels.tp1],
          ['tp2_mirrored', levels.tp2],
          ['tp3_mirrored', levels.tp3],
          ['rr', levels.rr],
        ]),
        gates: 'Trade levels',
        dataSource: 'pure_recall',
        dataSourceDetail: 'BreakoutTradeLevels.tp1 / tp1RR',
      },
    );
  }

  return rules;
}

function buildBreakoutDecisionChain(
  input: RulebookV41InputSnapshot,
  card: V41Rc3SignalCardModel,
  decisionOutput: RulebookV41DecisionOutput,
): string[] {
  return [
    `MarketState=${input.marketState}`,
    `Visibility=${input.visibilityMode}`,
    `Strategy=breakout_confirm_b (N/A — not Trend Reversal checklist)`,
    `BreakoutTrigger=${card.triggerType ?? 'null'}`,
    `BreakoutGateActive=${card.gate.activeEligible}`,
    `Levels=${
      card.levels != null
        ? `entry=${card.levels.entry};sl=${card.levels.stop};tp1=${card.levels.tp1};rr=${card.levels.rr}`
        : 'none'
    }`,
    `Decision=${decisionOutput}`,
    `EarlyWarning=${input.earlyWarningSeverity}`,
    `MomentumLong=${input.momentumConfirmedLong}|Short=${input.momentumConfirmedShort}`,
  ];
}

/** Build Rulebook V4.1 trace from a frozen SignalRowV41. */
export function buildRulebookV41Trace(input: RulebookV41ExportInput): RulebookV41Trace {
  const row = input.row;
  const symbol =
    input.symbol != null && String(input.symbol).trim() !== ''
      ? String(input.symbol)
      : row.symbol;
  const filename = `${RULEBOOK_V41_FILENAME_PREFIX}${symbol.replace(/[^A-Za-z0-9]/g, '') || 'UNKNOWN'}.md`;
  const inputSnapshot = buildInputSnapshot(symbol, row);

  if (resolveSymbolStrategy(symbol) === 'breakout') {
    const card = buildRc3ViewModelFromRow(row);
    const decisionOutput: RulebookV41DecisionOutput =
      card.decision === 'LONG' ||
      card.decision === 'SHORT' ||
      card.decision === 'WATCH' ||
      card.decision === 'IGNORE'
        ? card.decision
        : 'UNAVAILABLE';

    const rules: RulebookV41Rule[] = [
      ...buildBreakoutStrategyRules(card, row),
      ...buildBreakoutSkippedMarketContextRules(),
      ...buildBreakoutSkippedDecisionRules(),
      ...buildVisibilityRules(row),
      buildEarlyWarningRule(row),
      buildMomentumRule(row),
    ];

    const summary = summarize(
      rules,
      decisionOutput,
      inputSnapshot.visibilityMode,
      'UNAVAILABLE',
      null,
      [],
    );

    return {
      metadata: resolveV41ExportMeta({
        ...input.metadata,
        coin: input.metadata?.coin ?? symbol,
      }),
      symbol,
      filename,
      input: inputSnapshot,
      rules,
      summary,
      decisionChain: buildBreakoutDecisionChain(inputSnapshot, card, decisionOutput),
    };
  }

  const klines1H = row.klines1H ?? [];
  const klines1HAvailable = klines1H.length > 0;
  const trendDirection = row.snapshot.trendDirection;

  let tr: TrendReversalWithContextResult | null = null;
  let decisionResult: ReturnType<typeof computeDecisionEngineResult> | null = null;
  let ctx: ReturnType<typeof readConfidenceDecisionContext> = null;

  if (!row.error && klines1HAvailable) {
    tr = evaluateTrendReversalWithContext(
      { klines1H, trendDirection, symbol },
      {
        fundingRate: row.fundingRate,
        klines4H: (row.klines4H?.length ?? 0) > 0 ? row.klines4H : undefined,
        btcKlines4H: (row.btcKlines4H?.length ?? 0) > 0 ? row.btcKlines4H : undefined,
      },
    );
    const confidenceResult = computeConfidenceEngineResult(tr);
    decisionResult = computeDecisionEngineResult(confidenceResult);
    ctx = readConfidenceDecisionContext(confidenceResult);
  } else if (!row.error && !klines1HAvailable) {
    // No 1H klines — cannot re-call TR pipeline; decision unavailable.
    tr = null;
  }

  const rules: RulebookV41Rule[] = [
    ...buildTrendContextRules(tr, klines1HAvailable),
    ...buildMarketContextRules(tr, row),
    ...buildDecisionRules(decisionResult, ctx),
    ...buildVisibilityRules(row),
    buildEarlyWarningRule(row),
    buildMomentumRule(row),
  ];

  const decisionOutput: RulebookV41DecisionOutput =
    decisionResult?.state === 'LONG' ||
    decisionResult?.state === 'SHORT' ||
    decisionResult?.state === 'WATCH' ||
    decisionResult?.state === 'IGNORE'
      ? decisionResult.state
      : 'UNAVAILABLE';

  const trState: 'ACTIVE' | 'WATCH' | 'UNAVAILABLE' =
    tr?.state === 'ACTIVE' || tr?.state === 'WATCH' ? tr.state : 'UNAVAILABLE';

  const summary = summarize(
    rules,
    decisionOutput,
    inputSnapshot.visibilityMode,
    trState,
    tr?.marketContext?.applied ?? null,
    ctx?.hardBlocks ? [...ctx.hardBlocks] : [],
  );

  return {
    metadata: resolveV41ExportMeta({
      ...input.metadata,
      coin: input.metadata?.coin ?? symbol,
    }),
    symbol,
    filename,
    input: inputSnapshot,
    rules,
    summary,
    decisionChain: buildDecisionChain(
      inputSnapshot,
      tr,
      decisionOutput,
      decisionResult?.confidence ?? null,
    ),
  };
}
