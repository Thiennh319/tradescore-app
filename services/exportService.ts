import {
  LAYER_L5B_ID,
  type LayerResult,
  type ScorerVersion,
  type TradePlanV3,
} from '../constants/scoring';
import { FinalEntryStatus } from '../types/scoring';
import type { RuleAuditSnapshot } from '../types/ruleAuditSnapshot';
import { buildRuleAuditSnapshot } from './ruleAuditSnapshotBuilder';
import type { SignalRow, SignalRowScorerSnapshot } from './signalBoardScan';
import { getTradeScoreRuleBookText } from '../docs/tradeScoreRuleBook';
import { getTradeScoreAiAuditInstructionText, getTradeScoreAiAuditWorkflowText } from '../docs/tradeScoreAiAuditInstruction';
import { getTradeScoreMasterAuditPrompt } from '../docs/tradeScoreMasterAuditPrompt';
import { getTradeScoreAuditOutputTemplate } from '../docs/tradeScoreAuditOutputTemplate';
import {
  resolveFinalEntryStatus,
  resolveSignalRow,
  resolveTradePlanV3,
} from './signalRowView';
import { collectHardBlockReasons } from './tradePlanDisplay';

/** Một dòng export — toàn bộ field hiển thị trên Signal Board V3/V4. */
export interface SignalExportRow {
  timestamp: string;
  symbol: string;
  price: number;
  priceChange24h: number;

  scoreTotal: number;
  scoreLong: number;
  scoreShort: number;
  groupA: number;
  groupB: number;
  groupC: number;
  finalDecision: string;

  l1_ema: number;
  l1_note: string;
  l2_rsi: number;
  l2_note: string;
  l3_macd: number;
  l3_note: string;
  l4_bb: number;
  l4_note: string;
  l5_volume: number;
  l5_note: string;
  l6_funding: number;
  l6_note: string;
  l7_ls_ratio: number;
  l7_note: string;
  l8_btc: number;
  l8_note: string;
  l9_session: number;
  l9_note: string;
  l10_psychology: number;
  l10_note: string;

  l11_squeeze: number;
  l11_note: string;

  adx_1h: number;
  adx_4h: number;
  adx_avg: number;
  adx_regime: string;
  adx_severity: string;
  adx_tp_mult: number;
  adx_sl_mult: number;

  structure_sl_price: number;
  structure_sl_source: string;
  structure_swing_price: number;
  structure_candles_back: number;
  structure_distance_pct: number;

  vwap_price: number;
  vwap_zone: string;
  vwap_entry_quality: string;
  vwap_price_vs_vwap: number;
  vwap_bonus_applied: boolean;

  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr_tp1: number;
  rr_tp2: number;
  rr_tp3: number;
  market_mode: string;

  hard_blocks: string;
  block_reasons: string;

  final_entry_status: string;
  decision_band: string;
  direction_active: string;
  ambiguity_status: string;
  ambiguity_score_diff: string;
  l5_block_path: string;
  l5b_score: string;
  l5b_note: string;
  sl_quality: string;
  sl_atr_distance: string;
  sl_profile_v4: string;
  entry_quality: string;
  rr_after_structure: string;
  plan_expiry_tier: string;
  structure_lookback_config: string;
  l6_scoring_path: string;
  l10_hb_active: string;
  score_thresholds_source: string;
  rr_config_source: string;
  rr_config_path: string;

  /** Nội bộ TXT — không có trong CSV_COLUMNS */
  l5b_display_label: string;
}

const CSV_COLUMNS: (keyof SignalExportRow)[] = [
  'timestamp',
  'symbol',
  'price',
  'priceChange24h',
  'scoreTotal',
  'scoreLong',
  'scoreShort',
  'groupA',
  'groupB',
  'groupC',
  'finalDecision',
  'l1_ema',
  'l1_note',
  'l2_rsi',
  'l2_note',
  'l3_macd',
  'l3_note',
  'l4_bb',
  'l4_note',
  'l5_volume',
  'l5_note',
  'l6_funding',
  'l6_note',
  'l7_ls_ratio',
  'l7_note',
  'l8_btc',
  'l8_note',
  'l9_session',
  'l9_note',
  'l10_psychology',
  'l10_note',
  'l11_squeeze',
  'l11_note',
  'adx_1h',
  'adx_4h',
  'adx_avg',
  'adx_regime',
  'adx_severity',
  'adx_tp_mult',
  'adx_sl_mult',
  'structure_sl_price',
  'structure_sl_source',
  'structure_swing_price',
  'structure_candles_back',
  'structure_distance_pct',
  'vwap_price',
  'vwap_zone',
  'vwap_entry_quality',
  'vwap_price_vs_vwap',
  'vwap_bonus_applied',
  'entry',
  'sl',
  'tp1',
  'tp2',
  'tp3',
  'rr_tp1',
  'rr_tp2',
  'rr_tp3',
  'market_mode',
  'hard_blocks',
  'block_reasons',
  'final_entry_status',
  'decision_band',
  'direction_active',
  'ambiguity_status',
  'ambiguity_score_diff',
  'l5_block_path',
  'l5b_score',
  'l5b_note',
  'sl_quality',
  'sl_atr_distance',
  'sl_profile_v4',
  'entry_quality',
  'rr_after_structure',
  'plan_expiry_tier',
  'structure_lookback_config',
  'l6_scoring_path',
  'l10_hb_active',
  'score_thresholds_source',
  'rr_config_source',
  'rr_config_path',
];

const DEFAULT_SCORER: ScorerVersion = 'v4';

/** Clone scorer snapshot — freeze at audit export start (UL snapshot consistency). */
function cloneSignalRowScorerSnapshot(snap: SignalRowScorerSnapshot): SignalRowScorerSnapshot {
  return {
    ...snap,
    layers: snap.layers.map((layer) => ({ ...layer })),
    mandatoryViolations: [...snap.mandatoryViolations],
    groupBlocks: snap.groupBlocks ? [...snap.groupBlocks] : undefined,
    longLayers: snap.longLayers?.map((layer) => ({ ...layer })),
    shortLayers: snap.shortLayers?.map((layer) => ({ ...layer })),
    longGroupBlocks: snap.longGroupBlocks ? [...snap.longGroupBlocks] : undefined,
    shortGroupBlocks: snap.shortGroupBlocks ? [...snap.shortGroupBlocks] : undefined,
    longHardBlocks: snap.longHardBlocks ? [...snap.longHardBlocks] : undefined,
    shortHardBlocks: snap.shortHardBlocks ? [...snap.shortHardBlocks] : undefined,
    longBlockReasons: snap.longBlockReasons ? [...snap.longBlockReasons] : undefined,
    shortBlockReasons: snap.shortBlockReasons ? [...snap.shortBlockReasons] : undefined,
    longWarnings: snap.longWarnings ? [...snap.longWarnings] : undefined,
    shortWarnings: snap.shortWarnings ? [...snap.shortWarnings] : undefined,
    scoringWarnings: snap.scoringWarnings ? [...snap.scoringWarnings] : undefined,
  };
}

/**
 * Freeze row scorer snapshot at export start — Executive Summary and Actual Result
 * must read the same snap/plan (avoids top-level row vs v4/v3 drift).
 */
function freezeAuditExportRow(row: SignalRow, scorerVersion: ScorerVersion): SignalRow {
  const snap = cloneSignalRowScorerSnapshot(resolveSignalRow(row, scorerVersion));
  const plan = resolveTradePlanV3(row, scorerVersion);
  const finalStatus = resolveFinalEntryStatus(row, scorerVersion);
  const frozenPlan = plan != null ? { ...plan } : null;

  const frozen: SignalRow = {
    ...row,
    score: snap.score,
    longScore: snap.longScore,
    shortScore: snap.shortScore,
    direction: snap.direction,
    decisionLabel: snap.decisionLabel,
    decisionDisplay: snap.decisionDisplay,
    winrate: snap.winrate,
    canEnter: snap.canEnter,
    layers: snap.layers.map((layer) => ({ ...layer })),
    mandatoryViolations: [...snap.mandatoryViolations],
    hardBlocked: snap.hardBlocked,
    finalEntryStatus: finalStatus ?? snap.finalEntryStatus ?? row.finalEntryStatus,
    isAmbiguousDirection: snap.isAmbiguousDirection,
    ambiguousMessage: snap.ambiguousMessage,
    ruleAuditSnapshot: row.ruleAuditSnapshot
      ? structuredClone(row.ruleAuditSnapshot)
      : row.ruleAuditSnapshot,
    tradePlanV3: frozenPlan,
    tradePlansByScorer: frozenPlan
      ? { ...row.tradePlansByScorer, [scorerVersion]: frozenPlan }
      : row.tradePlansByScorer,
  };

  if (scorerVersion === 'v4') {
    frozen.v4 = snap;
  } else {
    frozen.v3 = snap;
  }

  return frozen;
}

function freezeAuditExportRows(
  rows: readonly SignalRow[],
  scorerVersion: ScorerVersion,
): SignalRow[] {
  return rows.map((row) => freezeAuditExportRow(row, scorerVersion));
}

function vnTimestamp(): string {
  return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function num(value: number | null | undefined, fallback = 0): number {
  return value != null && Number.isFinite(value) ? value : fallback;
}

function formatDecimal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return value.toFixed(4);
}

function layerFields(
  layers: LayerResult[],
  layerId: number,
): { score: number; note: string } {
  const hit = layers.find((l) => l.layer === layerId);
  return {
    score: hit?.score ?? 0,
    note: hit?.reason ?? '',
  };
}

function mapFinalDecision(status: FinalEntryStatus | undefined): string {
  if (status === FinalEntryStatus.ENTRY_VALID) return 'VÀO';
  if (status === FinalEntryStatus.WAIT_ENTRY) return 'CHỜ';
  return 'KHÔNG VÀO';
}

function joinUnique(parts: string[]): string {
  return [...new Set(parts.filter(Boolean))].join('|');
}

function formatOptionalNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '';
  return value.toFixed(digits);
}

function resolveFinalEntryStatusExport(
  snap: SignalRowScorerSnapshot,
  finalStatus: FinalEntryStatus,
): string {
  if (snap.isAmbiguousDirection === true) return 'AMBIGUOUS_DIRECTION';
  return snap.finalEntryStatus ?? finalStatus;
}

function resolveSnapWarnings(snap: SignalRowScorerSnapshot): string[] {
  const sideWarnings =
    snap.direction === 'LONG'
      ? (snap.longWarnings ?? [])
      : (snap.shortWarnings ?? []);
  return [...(snap.scoringWarnings ?? []), ...sideWarnings];
}

function resolveL5BlockPath(
  hardBlocks: string,
  blockReasons: string,
  warnings: string[],
): string {
  if (hardBlocks.includes('CVD')) return 'HARD';
  if (blockReasons.includes('L5a CVD chưa đủ')) return 'SCORE';
  if (
    warnings.some(
      (w) =>
        w.includes('CVD phân kỳ') ||
        w.includes('bull trap') ||
        w.includes('bear trap'),
    )
  ) {
    return 'SOFT';
  }
  return 'NONE';
}

function findLayerById(layers: LayerResult[], layerId: number): LayerResult | undefined {
  return layers.find((l) => l.layer === layerId);
}

function resolveL5bFields(
  scorerVersion: ScorerVersion,
  layers: LayerResult[],
): { score: string; note: string } {
  if (scorerVersion !== 'v4') return { score: '', note: '' };
  const l5b = findLayerById(layers, LAYER_L5B_ID);
  return {
    score: l5b != null ? formatOptionalNumber(l5b.score, 4) : '',
    note: l5b?.reason ?? '',
  };
}

type TradePlanV3SlProfileFields = TradePlanV3 & {
  slProfile?: string;
  slMultiplierProfile?: string;
  slMultiplierResult?: { profile?: string };
};

function resolveSlProfileV4(
  plan: TradePlanV3 | null,
  scorerVersion: ScorerVersion,
): string {
  if (scorerVersion !== 'v4' || plan == null) return '';
  const ext = plan as TradePlanV3SlProfileFields;
  return (
    ext.slProfile ??
    ext.slMultiplierProfile ??
    ext.slMultiplierResult?.profile ??
    ''
  );
}

function resolveStructureLookbackConfig(row: SignalRow): string {
  const adxAvg = row.adxData?.adxAvg ?? 0;
  if (!Number.isFinite(adxAvg) || adxAvg <= 0) return '20';
  if (adxAvg >= 35) return '40';
  if (adxAvg >= 25) return '30';
  return '20';
}

function resolveL6ScoringPath(
  scorerVersion: ScorerVersion,
  row: SignalRow,
  layers: LayerResult[],
  l6Note: string,
): string {
  if (scorerVersion === 'v3') return 'V3_TIER';
  if (row.l6Detail?.isFallback === true) return 'V4_LEGACY';
  if (row.l6Detail?.isFallback === false) return 'V4_STATE';
  const l6Layer = findLayerById(layers, 6);
  if (l6Layer == null) {
    return l6Note.includes('(fallback)') ? 'V4_LEGACY' : 'V4_STATE';
  }
  // Display layers normalize maxScore → LAYER_MAX_POINTS; use l6Detail or note fallback.
  void l6Layer;
  return l6Note.includes('(fallback)') ? 'V4_LEGACY' : 'V4_STATE';
}

function shouldShowAuditSection(row: SignalExportRow): boolean {
  const dynamicValues = [
    row.final_entry_status,
    row.decision_band,
    row.direction_active,
    row.ambiguity_score_diff,
    row.l5b_score,
    row.l5b_note,
    row.sl_quality,
    row.sl_atr_distance,
    row.sl_profile_v4,
    row.entry_quality,
    row.rr_after_structure,
    row.plan_expiry_tier,
    row.l6_scoring_path,
  ];
  const allDynamicEmpty = dynamicValues.every((v) => v === '');
  const onlyClearAndNone =
    row.ambiguity_status === 'CLEAR' &&
    row.l5_block_path === 'NONE' &&
    allDynamicEmpty;
  return !onlyClearAndNone;
}

function formatAuditSection(row: SignalExportRow): string[] {
  if (!shouldShowAuditSection(row)) return [];

  return [
    '════════════════════════════════',
    'AUDIT FIELDS',
    '════════════════════════════════',
    `finalEntryStatus: ${row.final_entry_status}`,
    `decisionBand:     ${row.decision_band}`,
    `direction:        ${row.direction_active}`,
    `ambiguity:        ${row.ambiguity_status}`,
    `           (diff: ${row.ambiguity_score_diff}đ)`,
    `l5Block:          ${row.l5_block_path}`,
    `l6Path:           ${row.l6_scoring_path}`,
    `slQuality:        ${row.sl_quality}`,
    `           (${row.sl_atr_distance}×ATR)`,
    `slProfile V4:     ${row.sl_profile_v4}`,
    `entryQuality:     ${row.entry_quality}`,
    `rrAfterStructure: ${row.rr_after_structure}`,
    `l5b (V4, thuộc Group B): ${row.l5b_score} — ${row.l5b_note}`,
    `planExpiry:       ${row.plan_expiry_tier}`,
    `structureLookback:${row.structure_lookback_config} nến`,
    `l10HbActive:      ${row.l10_hb_active}`,
    `scoreThresholds:  ${row.score_thresholds_source}`,
    `rrConfigSource:   ${row.rr_config_source}`,
    `rrConfigPath:     ${row.rr_config_path}`,
    '════════════════════════════════',
  ];
}

function resolveRrConfigPath(
  row: SignalRow,
  plan: TradePlanV3 | null,
): 'baseplan' | 'vwap_recalc' {
  if (!plan) return 'baseplan';
  const quality = row.vwapSignal?.quality;
  if (quality !== 'IDEAL' && quality !== 'GOOD') return 'baseplan';
  const entryNote = (plan as TradePlanV3 & { entryNote?: string }).entryNote;
  if (entryNote?.includes('VWAP')) return 'vwap_recalc';
  return 'baseplan';
}

/** Thu thập một dòng export từ SignalRow (engine V4 mặc định — khớp tab V3/V4). */
export function buildExportRow(
  row: SignalRow,
  scorerVersion: ScorerVersion = DEFAULT_SCORER,
): SignalExportRow {
  const snap = resolveSignalRow(row, scorerVersion);
  const plan = resolveTradePlanV3(row, scorerVersion);
  const finalStatus =
    resolveFinalEntryStatus(row, scorerVersion) ?? FinalEntryStatus.SCORE_BLOCKED;

  const hardBlockReasons = collectHardBlockReasons({
    direction: snap.direction,
    mandatoryViolations: snap.mandatoryViolations,
    groupBlocks: snap.groupBlocks,
    longHardBlocks: snap.longHardBlocks,
    shortHardBlocks: snap.shortHardBlocks,
    hardBlocked: snap.hardBlocked,
  });

  const planBlockReasons = plan?.blockReasons ?? [];
  const groupBlockReasons = snap.groupBlocks ?? [];
  const scoreBlockReasons =
    snap.direction === 'LONG'
      ? (snap.longBlockReasons ?? [])
      : (snap.shortBlockReasons ?? []);

  const layers = snap.layers;
  const l1 = layerFields(layers, 1);
  const l2 = layerFields(layers, 2);
  const l3 = layerFields(layers, 3);
  const l4 = layerFields(layers, 4);
  const l5 = layerFields(layers, 5);
  const l6 = layerFields(layers, 6);
  const l7 = layerFields(layers, 7);
  const l8 = layerFields(layers, 8);
  const l9 = layerFields(layers, 9);
  const l10 = layerFields(layers, 10);

  const squeeze = row.squeezeRisk;
  const l11Score = num(squeeze?.score);
  const l11Note =
    squeeze?.reasons?.length
      ? squeeze.reasons.join('; ')
      : row.squeezeWarning ?? '';

  const adxData = row.adxData;
  const adxGate = row.adxGate;
  const structure = row.structureSL;
  const vwap = row.vwapData;
  const vwapSignal = row.vwapSignal;
  const vwapBonus = row.vwapBonus;

  const groups = snap.groupScores ?? { A: 0, B: 0, C: 0 };

  const hardBlocksJoined = joinUnique(hardBlockReasons);
  const blockReasonsJoined = joinUnique([
    ...planBlockReasons,
    ...groupBlockReasons,
    ...scoreBlockReasons,
  ]);
  const snapWarnings = resolveSnapWarnings(snap);
  const l5b = resolveL5bFields(scorerVersion, layers);
  const l5bDisplayLabel = scorerVersion === 'v4' ? 'L5a CVD' : 'L5 Volume';

  return {
    timestamp: vnTimestamp(),
    symbol: row.symbol,
    price: num(row.price),
    priceChange24h: num(row.change24h),

    scoreTotal: num(snap.score),
    scoreLong: num(snap.longScore),
    scoreShort: num(snap.shortScore),
    groupA: num(groups.A),
    groupB: num(groups.B),
    groupC: num(groups.C),
    finalDecision: mapFinalDecision(finalStatus),

    l1_ema: l1.score,
    l1_note: l1.note,
    l2_rsi: l2.score,
    l2_note: l2.note,
    l3_macd: l3.score,
    l3_note: l3.note,
    l4_bb: l4.score,
    l4_note: l4.note,
    l5_volume: l5.score,
    l5_note: l5.note,
    l6_funding: l6.score,
    l6_note: l6.note,
    l7_ls_ratio: l7.score,
    l7_note: l7.note,
    l8_btc: l8.score,
    l8_note: l8.note,
    l9_session: l9.score,
    l9_note: l9.note,
    l10_psychology: l10.score,
    l10_note: l10.note,

    l11_squeeze: l11Score,
    l11_note: l11Note,

    adx_1h: num(adxData?.adx1H),
    adx_4h: num(adxData?.adx4H),
    adx_avg: num(adxData?.adxAvg),
    adx_regime: adxGate?.regime ?? adxData?.regime ?? '',
    adx_severity: adxGate?.severity ?? '',
    adx_tp_mult: num(adxGate?.tpMultiplier, 1),
    adx_sl_mult: num(adxGate?.slMultiplier, 1),

    structure_sl_price: num(structure?.slPrice),
    structure_sl_source: structure?.slSource ?? '',
    structure_swing_price: num(structure?.swingPrice),
    structure_candles_back: num(structure?.candlesBack),
    structure_distance_pct: num(structure?.distanceFromEntry),

    vwap_price: num(vwap?.vwap),
    vwap_zone: vwap?.zone ?? '',
    vwap_entry_quality: vwapSignal?.quality ?? '',
    vwap_price_vs_vwap: num(vwap?.priceVsVwap),
    vwap_bonus_applied: vwapBonus?.applied === true,

    entry: num(plan?.recommendedEntry),
    sl: num(plan?.stopLoss.price),
    tp1: num(plan?.tp1.price),
    tp2: num(plan?.tp2.price),
    tp3: num(plan?.tp3.price),
    rr_tp1: num(plan?.tp1.rrRatio),
    rr_tp2: num(plan?.tp2.rrRatio),
    rr_tp3: num(plan?.tp3.rrRatio),
    market_mode: plan?.marketMode ?? snap.marketMode ?? '',

    hard_blocks: hardBlocksJoined,
    block_reasons: blockReasonsJoined,

    final_entry_status: resolveFinalEntryStatusExport(snap, finalStatus),
    decision_band: snap.decisionLabel ?? plan?.decision ?? '',
    direction_active: snap.direction ?? '',
    ambiguity_status: snap.isAmbiguousDirection === true ? 'AMBIGUOUS' : 'CLEAR',
    ambiguity_score_diff: formatOptionalNumber(
      Math.abs((snap.longScore ?? 0) - (snap.shortScore ?? 0)),
      2,
    ),
    l5_block_path: resolveL5BlockPath(hardBlocksJoined, blockReasonsJoined, snapWarnings),
    l5b_score: l5b.score,
    l5b_note: l5b.note,
    sl_quality: plan?.stopLoss?.quality ?? '',
    sl_atr_distance: formatOptionalNumber(plan?.stopLoss?.atrDistance, 2),
    sl_profile_v4: resolveSlProfileV4(plan, scorerVersion),
    entry_quality: plan?.entryZone?.quality ?? '',
    rr_after_structure: formatOptionalNumber(plan?.primaryRR, 4),
    plan_expiry_tier: plan?.expiryTier ?? '',
    structure_lookback_config: resolveStructureLookbackConfig(row),
    l6_scoring_path: resolveL6ScoringPath(scorerVersion, row, layers, l6.note),
    l10_hb_active: 'false',
    score_thresholds_source: 'literal',
    rr_config_source: 'fixed_RR_TARGETS',
    rr_config_path: resolveRrConfigPath(row, plan),
    l5b_display_label: l5bDisplayLabel,
  };
}

function escapeCsvValue(_key: keyof SignalExportRow, value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return formatDecimal(value);
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Format nhiều dòng thành CSV (header + data, separator `,`). */
export function formatAsCSV(rows: SignalExportRow[]): string {
  const lines: string[] = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    const cells = CSV_COLUMNS.map((col) => escapeCsvValue(col, row[col]));
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}

function txtNum(value: number): string {
  return formatDecimal(value);
}

function formatGroupScoreLegendBlock(row: SignalExportRow): string[] {
  const groupBLabel =
    row.l5b_score !== ''
      ? 'Group B (Dòng tiền, L5a+L5b+L6+L7)'
      : 'Group B (Dòng tiền, L5+L6+L7)';
  return [
    'NHÓM ĐIỂM (Group Score — dùng để tính Tổng /15đ, KHÔNG phải cộng dồn 10 lớp trên):',
    `  Group A (Xu hướng, L1-L4):       ${txtNum(row.groupA)}/5`,
    `  ${groupBLabel}: ${txtNum(row.groupB)}/5`,
    `  Group C (Bối cảnh, L8-L10):      ${txtNum(row.groupC)}/5`,
  ];
}

function formatCoinBlock(row: SignalExportRow): string {
  const changeSign = row.priceChange24h >= 0 ? '+' : '';
  const hardBlocksLine =
    row.hard_blocks.length > 0 ? row.hard_blocks.replace(/\|/g, ' | ') : 'Không có';

  return [
    '════════════════════════════',
    `${row.symbol} — ${txtNum(row.price)} (${changeSign}${txtNum(row.priceChange24h)}%)`,
    `Thời điểm: ${row.timestamp}`,
    '════════════════════════════',
    '',
    'ĐIỂM SỐ:',
    `  Tổng: ${txtNum(row.scoreTotal)}/15 → ${row.finalDecision}`,
    `  Long: ${txtNum(row.scoreLong)} | Short: ${txtNum(row.scoreShort)}`,
    `  Group A: ${txtNum(row.groupA)}/5 | B: ${txtNum(row.groupB)}/5 | C: ${txtNum(row.groupC)}/5`,
    '',
    '10 LỚP CHẤM ĐIỂM:',
    `  L1 EMA:       ${txtNum(row.l1_ema)}đ — ${row.l1_note}`,
    `  L2 RSI:       ${txtNum(row.l2_rsi)}đ — ${row.l2_note}`,
    `  L3 MACD:      ${txtNum(row.l3_macd)}đ — ${row.l3_note}`,
    `  L4 BB:        ${txtNum(row.l4_bb)}đ — ${row.l4_note}`,
    `  ${row.l5b_display_label}:    ${txtNum(row.l5_volume)}đ — ${row.l5_note}`,
    `  L6 Funding:   ${txtNum(row.l6_funding)}đ — ${row.l6_note}`,
    `  L7 L/S Ratio: ${txtNum(row.l7_ls_ratio)}đ — ${row.l7_note}`,
    `  L8 BTC:       ${txtNum(row.l8_btc)}đ — ${row.l8_note}`,
    `  L9 Phiên:     ${txtNum(row.l9_session)}đ — ${row.l9_note}`,
    `  L10 Tâm lý:   ${txtNum(row.l10_psychology)}đ — ${row.l10_note}`,
    `  L11 Squeeze:  ${txtNum(row.l11_squeeze)}/10 — ${row.l11_note}`,
    '',
    ...formatGroupScoreLegendBlock(row),
    '',
    'ADX GATE:',
    `  ADX 1H: ${txtNum(row.adx_1h)} | 4H: ${txtNum(row.adx_4h)} | TB: ${txtNum(row.adx_avg)}`,
    `  Regime: ${row.adx_regime || '—'} | Severity: ${row.adx_severity || '—'}`,
    `  TP mult: ×${txtNum(row.adx_tp_mult)} | SL mult: ×${txtNum(row.adx_sl_mult)}`,
    '',
    'STRUCTURE SL:',
    `  Source: ${row.structure_sl_source || '—'}`,
    `  Swing: ${txtNum(row.structure_swing_price)} (${row.structure_candles_back} nến trước)`,
    `  SL áp dụng: ${txtNum(row.structure_sl_price)} (${txtNum(row.structure_distance_pct)}%)`,
    '',
    'VWAP:',
    `  VWAP: ${txtNum(row.vwap_price)}`,
    `  Zone: ${row.vwap_zone || '—'}`,
    `  Entry quality: ${row.vwap_entry_quality || '—'}`,
    `  Giá vs VWAP: ${txtNum(row.vwap_price_vs_vwap)}%`,
    `  Bonus L5: ${row.vwap_bonus_applied ? 'yes' : 'no'}`,
    '',
    'KẾ HOẠCH:',
    `  Entry: ${txtNum(row.entry)}`,
    `  SL:    ${txtNum(row.sl)}`,
    `  TP1:   ${txtNum(row.tp1)} (R:R ${txtNum(row.rr_tp1)}×)`,
    `  TP2:   ${txtNum(row.tp2)} (R:R ${txtNum(row.rr_tp2)}×)`,
    `  TP3:   ${txtNum(row.tp3)} (R:R ${txtNum(row.rr_tp3)}×)`,
    '',
    `HARD BLOCKS: ${hardBlocksLine}`,
    row.block_reasons ? `BLOCK REASONS: ${row.block_reasons.replace(/\|/g, ' | ')}` : '',
    ...formatAuditSection(row),
    '────────────────────────────',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Format nhiều dòng thành TXT dễ đọc. */
export function formatAsTXT(rows: SignalExportRow[]): string {
  return rows.map(formatCoinBlock).join('\n\n');
}

/** Export toàn bộ coins — map rows → buildExportRow → CSV hoặc TXT. */
export function exportSignalData(
  rows: SignalRow[],
  format: 'csv' | 'txt',
  scorerVersion: ScorerVersion = DEFAULT_SCORER,
): string {
  const exportRows = rows.map((row) => buildExportRow(row, scorerVersion));
  return format === 'csv' ? formatAsCSV(exportRows) : formatAsTXT(exportRows);
}

// ─────────────────────────────────────────────────────────────────────────────
// RuleAuditSnapshot — RAW EVIDENCE CSV (Task 09A)
// ─────────────────────────────────────────────────────────────────────────────

const RULE_AUDIT_EVIDENCE_VERSION = '1.0.0';
const RULE_AUDIT_SNAPSHOT_VERSION = '1.0.0';
const RULE_AUDIT_RULE_VERSION = 'TradeScore V4';

/** Cột snapshot — thứ tự cố định, khớp RuleAuditSnapshot schema (dot path). */
const RULE_AUDIT_SNAPSHOT_CSV_COLUMNS = [
  'ema.h1.ema20',
  'ema.h1.ema50',
  'ema.h1.ema200',
  'ema.h1.slope20',
  'ema.h1.slope50',
  'ema.h1.priceVsEma20Pct',
  'ema.h1.priceVsEma50Pct',
  'ema.h1.priceAboveEma20',
  'ema.h1.priceAboveEma50',
  'ema.h4.ema20',
  'ema.h4.ema50',
  'ema.h4.ema200',
  'ema.h4.slope20',
  'ema.h4.slope50',
  'ema.h4.priceVsEma20Pct',
  'ema.h4.priceVsEma50Pct',
  'ema.h4.priceAboveEma20',
  'ema.h4.priceAboveEma50',
  'ema.alignment',
  'ema.pullback',
  'rsi.rsi1h',
  'rsi.rsi4h',
  'rsi.divergence1h',
  'rsi.divergence4h',
  'macd.h1.macd',
  'macd.h1.signal',
  'macd.h1.histogram',
  'macd.h1.isTurningUp',
  'macd.h1.isTurningDown',
  'macd.h1.crossedZeroRecentlyUp',
  'macd.h1.crossedZeroRecentlyDown',
  'macd.h4.macd',
  'macd.h4.signal',
  'macd.h4.histogram',
  'macd.h4.isTurningUp',
  'macd.h4.isTurningDown',
  'macd.h4.crossedZeroRecentlyUp',
  'macd.h4.crossedZeroRecentlyDown',
  'bollinger.h1.percentB',
  'bollinger.h1.bandwidth',
  'bollinger.h1.bandwidthSlope',
  'bollinger.h1.marketMode',
  'bollinger.h1.upper',
  'bollinger.h1.middle',
  'bollinger.h1.lower',
  'bollinger.h4.percentB',
  'bollinger.h4.bandwidth',
  'bollinger.h4.bandwidthSlope',
  'bollinger.h4.marketMode',
  'bollinger.h4.upper',
  'bollinger.h4.middle',
  'bollinger.h4.lower',
  'volume.volumeRatio1h',
  'volume.volumeRatio4h',
  'volume.lastVolume',
  'volume.avgVolume1h',
  'cvd.value',
  'cvd.trend',
  'cvd.slope',
  'cvd.divergence',
  'cvd.divergenceType',
  'cvd.supportive',
  'cvd.cvdMomentum24h',
  'cvd.reason',
  'oi.current',
  'oi.previous',
  'oi.delta',
  'oi.change1hPct',
  'oi.change4hPct',
  'funding.ratePct',
  'funding.avg8',
  'funding.avg16',
  'funding.velocity',
  'funding.acceleration',
  'funding.state',
  'longShortRatio.topRatio',
  'longShortRatio.globalRatio',
  'longShortRatio.topHistory',
  'btcContext.change24hPct',
  'btcContext.change1hPct',
  'btcContext.trend',
  'btcContext.regimeConfidence',
  'adx.adx1h',
  'adx.adx4h',
  'adx.adxAvg',
  'adx.regime',
  'adx.regimeStrength',
  'adx.isChoppy1h',
  'adx.isChoppy4h',
  'adx.bothChoppy',
  'adx.gateAllowed',
  'adx.gateBlock',
  'adx.gateSeverity',
  'adx.gateTpMultiplier',
  'adx.gateSlMultiplier',
  'adx.gateMessage',
  'vwap.vwap',
  'vwap.upperBand1',
  'vwap.lowerBand1',
  'vwap.upperBand2',
  'vwap.lowerBand2',
  'vwap.priceVsVwap',
  'vwap.zone',
  'vwap.isNearVwap',
  'vwap.isPullingBackToVwap',
  'vwap.sessionStart',
  'vwap.candleCount',
  'vwap.entryQuality',
  'vwap.suggestedEntry',
  'vwap.entryReason',
  'atr.atr1h',
  'atr.atr1hPct',
  'structure.swingPrice',
  'structure.swingTime',
  'structure.slPrice',
  'structure.slSource',
  'structure.bufferPct',
  'structure.distanceFromEntry',
  'structure.candlesBack',
  'structure.lookbackCandles',
] as const;

const RULE_AUDIT_EVIDENCE_METADATA_COLUMNS = [
  'evidence_version',
  'snapshot_version',
  'rule_version',
  'export_timestamp',
] as const;

export const RULE_AUDIT_EVIDENCE_CSV_COLUMNS = [
  'symbol',
  ...RULE_AUDIT_SNAPSHOT_CSV_COLUMNS,
  ...RULE_AUDIT_EVIDENCE_METADATA_COLUMNS,
] as const;

export type RuleAuditEvidenceCsvColumn = (typeof RULE_AUDIT_EVIDENCE_CSV_COLUMNS)[number];

export type RuleAuditEvidenceExportRow = Record<RuleAuditEvidenceCsvColumn, string>;

function readRuleAuditSnapshotPath(snapshot: RuleAuditSnapshot, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = snapshot;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function formatRuleAuditEvidenceCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeRuleAuditEvidenceCsvCell(text: string): string {
  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Một dòng RAW EVIDENCE từ row.ruleAuditSnapshot — không beautify. */
export function buildRuleAuditEvidenceExportRow(
  row: SignalRow,
  exportTimestamp: string = new Date().toISOString(),
): RuleAuditEvidenceExportRow {
  const snapshot = row.ruleAuditSnapshot;
  const out = {} as RuleAuditEvidenceExportRow;

  out.symbol = row.symbol;

  for (const col of RULE_AUDIT_SNAPSHOT_CSV_COLUMNS) {
    const raw =
      snapshot != null ? readRuleAuditSnapshotPath(snapshot, col) : undefined;
    out[col] = formatRuleAuditEvidenceCell(raw);
  }

  out.evidence_version = RULE_AUDIT_EVIDENCE_VERSION;
  out.snapshot_version = RULE_AUDIT_SNAPSHOT_VERSION;
  out.rule_version = RULE_AUDIT_RULE_VERSION;
  out.export_timestamp = exportTimestamp;

  return out;
}

/** Format RAW EVIDENCE CSV — header cố định, 1:1 RuleAuditSnapshot leaf fields. */
export function formatRuleAuditEvidenceCSV(
  rows: RuleAuditEvidenceExportRow[],
): string {
  const lines: string[] = [RULE_AUDIT_EVIDENCE_CSV_COLUMNS.join(',')];
  for (const row of rows) {
    const cells = RULE_AUDIT_EVIDENCE_CSV_COLUMNS.map((col) =>
      escapeRuleAuditEvidenceCsvCell(row[col] ?? ''),
    );
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}

/** Export RAW EVIDENCE CSV cho danh sách SignalRow. */
export function exportRuleAuditEvidenceCSV(rows: SignalRow[]): string {
  const exportTimestamp = new Date().toISOString();
  const exportRows = rows.map((row) =>
    buildRuleAuditEvidenceExportRow(row, exportTimestamp),
  );
  return formatRuleAuditEvidenceCSV(exportRows);
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Coverage — self validation (Task 09A.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface EvidenceCoverageReport {
  snapshotLeafFieldCount: number;
  csvEvidenceFieldCount: number;
  coveragePct: number;
  missingFieldCount: number;
  extraFieldCount: number;
  missingFields: string[];
  extraFields: string[];
  pass: boolean;
  reportText: string;
}

function collectSnapshotLeafPaths(value: unknown, prefix = ''): string[] {
  if (value == null || typeof value !== 'object') {
    return prefix ? [prefix] : [];
  }
  if (Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  const paths: string[] = [];
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const child = obj[key];
    if (child != null && typeof child === 'object' && !Array.isArray(child)) {
      paths.push(...collectSnapshotLeafPaths(child, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

function collectRuleAuditSnapshotLeafPaths(
  snapshot: RuleAuditSnapshot = buildRuleAuditSnapshot(),
): string[] {
  return collectSnapshotLeafPaths(snapshot).sort();
}

function collectCsvEvidenceFieldPaths(): string[] {
  return [...RULE_AUDIT_SNAPSHOT_CSV_COLUMNS];
}

function formatCoveragePct(matched: number, total: number): number {
  if (total <= 0) return total === 0 && matched === 0 ? 100 : 0;
  return Math.round((matched / total) * 1000) / 10;
}

function formatEvidenceCoverageReportText(report: EvidenceCoverageReport): string {
  const lines = [
    '====================================',
    'Evidence Coverage Report',
    '====================================',
    '',
    `Snapshot leaf fields : ${report.snapshotLeafFieldCount}`,
    `CSV evidence fields  : ${report.csvEvidenceFieldCount}`,
    `Coverage             : ${report.coveragePct}%`,
    `Missing fields       : ${report.missingFieldCount}`,
  ];

  if (report.extraFieldCount > 0) {
    lines.push(`Extra CSV fields     : ${report.extraFieldCount}`);
  }

  lines.push('');

  if (report.missingFields.length > 0) {
    lines.push('Thiếu');
    for (const field of report.missingFields) {
      lines.push(field);
    }
    lines.push('');
  }

  if (report.extraFields.length > 0) {
    lines.push('Thừa (CSV không có trong snapshot)');
    for (const field of report.extraFields) {
      lines.push(field);
    }
    lines.push('');
  }

  lines.push(report.pass ? 'PASS' : 'FAIL');
  lines.push('====================================');
  return lines.join('\n');
}

/**
 * So sánh leaf field RuleAuditSnapshot vs cột evidence CSV.
 * Không throw — chỉ trả report nội bộ.
 */
export function validateEvidenceCoverage(): EvidenceCoverageReport {
  const snapshotPaths = collectRuleAuditSnapshotLeafPaths();
  const csvPaths = collectCsvEvidenceFieldPaths();

  const snapshotSet = new Set(snapshotPaths);
  const csvSet = new Set(csvPaths);

  const missingFields = snapshotPaths.filter((path) => !csvSet.has(path));
  const extraFields = csvPaths.filter((path) => !snapshotSet.has(path));

  const snapshotLeafFieldCount = snapshotPaths.length;
  const csvEvidenceFieldCount = csvPaths.length;
  const matchedCount = snapshotPaths.filter((path) => csvSet.has(path)).length;
  const coveragePct = formatCoveragePct(matchedCount, snapshotLeafFieldCount);
  const pass =
    missingFields.length === 0 &&
    extraFields.length === 0 &&
    snapshotLeafFieldCount === csvEvidenceFieldCount;

  const report: EvidenceCoverageReport = {
    snapshotLeafFieldCount,
    csvEvidenceFieldCount,
    coveragePct,
    missingFieldCount: missingFields.length,
    extraFieldCount: extraFields.length,
    missingFields,
    extraFields,
    pass,
    reportText: '',
  };
  report.reportText = formatEvidenceCoverageReportText(report);
  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Human Friendly Evidence Report — TXT (Task 10)
// ─────────────────────────────────────────────────────────────────────────────

const HUMAN_EVIDENCE_COIN_BORDER = '========================================================';
const HUMAN_EVIDENCE_SECTION_BORDER = '--------------------------------------------------------';

const HUMAN_EVIDENCE_MARKET_GROUPS: { title: string; prefixes: string[] }[] = [
  { title: 'EMA', prefixes: ['ema'] },
  { title: 'RSI', prefixes: ['rsi'] },
  { title: 'MACD', prefixes: ['macd'] },
  { title: 'BOLLINGER', prefixes: ['bollinger'] },
  { title: 'VOLUME', prefixes: ['volume'] },
  { title: 'CVD', prefixes: ['cvd'] },
  { title: 'DERIVATIVES', prefixes: ['oi', 'funding', 'longShortRatio'] },
  { title: 'BTC CONTEXT', prefixes: ['btcContext'] },
  { title: 'ADX', prefixes: ['adx'] },
  { title: 'ATR', prefixes: ['atr'] },
  { title: 'VWAP', prefixes: ['vwap'] },
  { title: 'STRUCTURE', prefixes: ['structure'] },
];

function humanEvidenceFieldLabel(columnPath: string): string {
  const dot = columnPath.indexOf('.');
  return dot >= 0 ? columnPath.slice(dot + 1) : columnPath;
}

function humanEvidenceMarketGroupLines(
  snapshot: RuleAuditSnapshot | undefined,
  prefixes: string[],
): string[] {
  const lines: string[] = [];
  if (snapshot == null) {
    lines.push('(no snapshot)');
    return lines;
  }

  for (const col of RULE_AUDIT_SNAPSHOT_CSV_COLUMNS) {
    const root = col.split('.')[0];
    if (!prefixes.includes(root)) continue;
    const label = humanEvidenceFieldLabel(col);
    const value = readRuleAuditSnapshotPath(snapshot, col);
    lines.push(`${label}: ${formatRuleAuditEvidenceCell(value)}`);
  }

  if (lines.length === 0) {
    lines.push('(no data)');
  }
  return lines;
}

function humanEvidenceLayerSummaryLines(snap: SignalRowScorerSnapshot): string[] {
  if (snap.layers.length === 0) return ['(no layers)'];
  return snap.layers.map((layer) => {
    const layerId = layer.layer;
    const name = layer.name ?? `L${layerId}`;
    return `${name}: ${formatRuleAuditEvidenceCell(layer.score)} — ${layer.reason}`;
  });
}

function formatExecutiveSummaryCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.filter((part) => part != null && part !== '').join(', ');
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value;
  return String(value);
}

function humanEvidenceExecutiveSummaryLines(
  row: SignalRow,
  snap: SignalRowScorerSnapshot,
  plan: TradePlanV3 | null,
  finalStatus: FinalEntryStatus | undefined,
  snapshot: RuleAuditSnapshot | undefined,
): string[] {
  const decisionBand = snap.decisionLabel ?? plan?.decision ?? '';
  const hardBlockReasons = collectHardBlockReasons({
    direction: snap.direction,
    mandatoryViolations: snap.mandatoryViolations,
    groupBlocks: snap.groupBlocks,
    longHardBlocks: snap.longHardBlocks,
    shortHardBlocks: snap.shortHardBlocks,
    hardBlocked: snap.hardBlocked,
  });
  const scoreBlockReasons = [
    ...(plan?.blockReasons ?? []),
    ...(snap.groupBlocks ?? []),
    ...(snap.direction === 'LONG'
      ? (snap.longBlockReasons ?? [])
      : (snap.shortBlockReasons ?? [])),
  ];

  return [
    HUMAN_EVIDENCE_COIN_BORDER,
    'EXECUTIVE SUMMARY',
    HUMAN_EVIDENCE_COIN_BORDER,
    '',
    `Recommendation : ${formatExecutiveSummaryCell(decisionBand)}`,
    `Final Status   : ${formatExecutiveSummaryCell(
      finalStatus ?? row.finalEntryStatus ?? '',
    )}`,
    `Direction      : ${formatExecutiveSummaryCell(snap.direction)}`,
    `Decision Band  : ${formatExecutiveSummaryCell(decisionBand)}`,
    `Long Score     : ${formatExecutiveSummaryCell(snap.longScore)}`,
    `Short Score    : ${formatExecutiveSummaryCell(snap.shortScore)}`,
    `Final Score    : ${formatExecutiveSummaryCell(snap.score)}`,
    '',
    HUMAN_EVIDENCE_SECTION_BORDER,
    '',
    `Entry          : ${formatExecutiveSummaryCell(plan?.recommendedEntry)}`,
    `Stop Loss      : ${formatExecutiveSummaryCell(plan?.stopLoss?.price)}`,
    `Take Profit 1  : ${formatExecutiveSummaryCell(plan?.tp1?.price)}`,
    `Take Profit 2  : ${formatExecutiveSummaryCell(plan?.tp2?.price)}`,
    `Take Profit 3  : ${formatExecutiveSummaryCell(plan?.tp3?.price)}`,
    `Primary RR     : ${formatExecutiveSummaryCell(plan?.primaryRR)}`,
    '',
    HUMAN_EVIDENCE_SECTION_BORDER,
    '',
    `Entry Quality  : ${formatExecutiveSummaryCell(
      plan?.entryZone?.quality ?? snapshot?.vwap.entryQuality,
    )}`,
    `SL Quality     : ${formatExecutiveSummaryCell(plan?.stopLoss?.quality)}`,
    `Plan Expiry    : ${formatExecutiveSummaryCell(plan?.expiryTier)}`,
    '',
    HUMAN_EVIDENCE_SECTION_BORDER,
    '',
    `Hard Block     : ${formatExecutiveSummaryCell(hardBlockReasons)}`,
    `Score Block    : ${formatExecutiveSummaryCell(scoreBlockReasons)}`,
    '',
  ];
}

function formatHumanEvidenceCoinBlock(
  row: SignalRow,
  exportTimestamp: string,
  scorerVersion: ScorerVersion = DEFAULT_SCORER,
): string {
  const snapshot = row.ruleAuditSnapshot;
  const snap = resolveSignalRow(row, scorerVersion);
  const plan = resolveTradePlanV3(row, scorerVersion);
  const finalStatus = resolveFinalEntryStatus(row, scorerVersion);

  const lines: string[] = [
    HUMAN_EVIDENCE_COIN_BORDER,
    row.symbol,
    HUMAN_EVIDENCE_COIN_BORDER,
    '',
    ...humanEvidenceExecutiveSummaryLines(
      row,
      snap,
      plan,
      finalStatus,
      snapshot,
    ),
    'MARKET',
    '',
  ];

  for (const group of HUMAN_EVIDENCE_MARKET_GROUPS) {
    lines.push(group.title);
    lines.push(...humanEvidenceMarketGroupLines(snapshot, group.prefixes));
    lines.push('');
  }

  lines.push(
    HUMAN_EVIDENCE_SECTION_BORDER,
    '',
    'RULE',
    '',
    `Decision: ${formatRuleAuditEvidenceCell(snap.decisionDisplay)}`,
    `Decision Band: ${formatRuleAuditEvidenceCell(snap.decisionLabel)}`,
    `Entry Status: ${formatRuleAuditEvidenceCell(finalStatus ?? row.finalEntryStatus ?? '')}`,
    `Direction: ${formatRuleAuditEvidenceCell(snap.direction)}`,
    `Score: ${formatRuleAuditEvidenceCell(snap.score)}`,
    'Layer Summary:',
    ...humanEvidenceLayerSummaryLines(snap).map((line) => `  ${line}`),
    '',
    HUMAN_EVIDENCE_SECTION_BORDER,
    '',
    'TRADE',
    '',
    `Entry Quality: ${formatRuleAuditEvidenceCell(
      plan?.entryZone?.quality ?? snapshot?.vwap.entryQuality ?? '',
    )}`,
    `SL Quality: ${formatRuleAuditEvidenceCell(plan?.stopLoss?.quality ?? '')}`,
    `ATR Distance: ${formatRuleAuditEvidenceCell(plan?.stopLoss?.atrDistance ?? '')}`,
    `Structure Lookback: ${formatRuleAuditEvidenceCell(
      snapshot?.structure.lookbackCandles ?? '',
    )}`,
    '',
    HUMAN_EVIDENCE_SECTION_BORDER,
    '',
    'METADATA',
    '',
    `Rule Version: ${RULE_AUDIT_RULE_VERSION}`,
    `Snapshot Version: ${RULE_AUDIT_SNAPSHOT_VERSION}`,
    `Evidence Version: ${RULE_AUDIT_EVIDENCE_VERSION}`,
    `Export Time: ${exportTimestamp}`,
    '',
    HUMAN_EVIDENCE_COIN_BORDER,
  );

  return lines.join('\n');
}

/** Một coin — Human Friendly Evidence Report (.txt). */
export function formatRuleAuditHumanEvidenceCoinBlock(
  row: SignalRow,
  exportTimestamp: string = new Date().toISOString(),
  scorerVersion: ScorerVersion = DEFAULT_SCORER,
): string {
  return formatHumanEvidenceCoinBlock(row, exportTimestamp, scorerVersion);
}

/** Nhiều coin — Human Friendly Evidence Report (.txt). */
export function formatRuleAuditHumanEvidenceTXT(
  rows: SignalRow[],
  exportTimestamp: string = new Date().toISOString(),
  scorerVersion: ScorerVersion = DEFAULT_SCORER,
): string {
  return rows
    .map((row) => formatHumanEvidenceCoinBlock(row, exportTimestamp, scorerVersion))
    .join('\n\n');
}

/** Export Human Friendly Evidence Report (.txt) — delegates to One-File Audit Package (GĐ3). */
export function exportRuleAuditHumanEvidenceTXT(
  rows: SignalRow[],
  scorerVersion: ScorerVersion = DEFAULT_SCORER,
): string {
  return exportTradeScoreAuditPackage(rows, scorerVersion);
}

// ─────────────────────────────────────────────────────────────────────────────
// TradeScore Audit Package — GĐ3 One-File (Task 03)
// ─────────────────────────────────────────────────────────────────────────────

const AUDIT_PACKAGE_SECTION_BORDER = '='.repeat(80);

function formatAuditPackageSection(
  sectionNumber: number,
  title: string,
  body: string,
): string {
  return [
    AUDIT_PACKAGE_SECTION_BORDER,
    `SECTION ${sectionNumber}`,
    title,
    AUDIT_PACKAGE_SECTION_BORDER,
    '',
    body.trimEnd(),
    '',
  ].join('\n');
}

function formatTradeScoreAuditPackageHeader(generatedTime: string): string {
  return [
    AUDIT_PACKAGE_SECTION_BORDER,
    'TRADE SCORE AUDIT PACKAGE',
    AUDIT_PACKAGE_SECTION_BORDER,
    '',
    'Package Version',
    '',
    EVIDENCE_PACKAGE_VERSION,
    '',
    'Rule Version',
    '',
    RULE_AUDIT_RULE_VERSION,
    '',
    'Snapshot Version',
    '',
    RULE_AUDIT_SNAPSHOT_VERSION,
    '',
    'Evidence Version',
    '',
    EVIDENCE_PACKAGE_VERSION,
    '',
    'Generated Time',
    '',
    generatedTime,
    '',
  ].join('\n');
}

function splitHumanEvidenceBlocks(evidenceTxt: string): string[] {
  const coinBorder = HUMAN_EVIDENCE_COIN_BORDER;
  return evidenceTxt
    .split(new RegExp(`(?=${coinBorder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`))
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

function partitionHumanEvidenceTxtForAuditPackage(evidenceTxt: string): {
  executiveSummary: string;
  marketEvidence: string;
  ruleDecision: string;
  tradePlan: string;
} {
  const executiveParts: string[] = [];
  const marketParts: string[] = [];
  const ruleParts: string[] = [];
  const tradeParts: string[] = [];

  for (const block of splitHumanEvidenceBlocks(evidenceTxt)) {
    const marketIdx = block.indexOf('\nMARKET\n');
    const ruleIdx = block.indexOf('\nRULE\n');
    const tradeIdx = block.indexOf('\nTRADE\n');

    if (marketIdx === -1) {
      executiveParts.push(block);
      continue;
    }

    executiveParts.push(block.slice(0, marketIdx).trimEnd());

    if (ruleIdx === -1) {
      marketParts.push(block.slice(marketIdx + 1).trimStart());
      continue;
    }

    marketParts.push(block.slice(marketIdx + 1, ruleIdx).trim());

    if (tradeIdx === -1) {
      ruleParts.push(block.slice(ruleIdx + 1).trim());
      continue;
    }

    ruleParts.push(block.slice(ruleIdx + 1, tradeIdx).trim());
    tradeParts.push(block.slice(tradeIdx + 1).trim());
  }

  return {
    executiveSummary: executiveParts.join('\n\n'),
    marketEvidence: marketParts.join('\n\n'),
    ruleDecision: ruleParts.join('\n\n'),
    tradePlan: tradeParts.join('\n\n'),
  };
}

/** One-File AI Audit Package — upload duy nhất cho GPT / Claude / Gemini. */
export function exportTradeScoreAuditPackage(
  rows: SignalRow[],
  scorerVersion: ScorerVersion = DEFAULT_SCORER,
): string {
  const generatedTime = new Date().toISOString();
  const frozenRows = freezeAuditExportRows(rows, scorerVersion);
  const evidenceTxt = formatRuleAuditHumanEvidenceTXT(
    frozenRows,
    generatedTime,
    scorerVersion,
  );
  const { executiveSummary, marketEvidence, ruleDecision, tradePlan } =
    partitionHumanEvidenceTxtForAuditPackage(evidenceTxt);

  return [
    formatTradeScoreAuditPackageHeader(generatedTime),
    formatAuditPackageSection(1, 'RULE BOOK', getTradeScoreRuleBookText()),
    formatAuditPackageSection(
      2,
      'AI AUDIT INSTRUCTION',
      getTradeScoreAiAuditInstructionText(),
    ),
    formatAuditPackageSection(3, 'AI AUDIT WORKFLOW', getTradeScoreAiAuditWorkflowText()),
    formatAuditPackageSection(4, 'MASTER AUDIT PROMPT', getTradeScoreMasterAuditPrompt()),
    formatAuditPackageSection(5, 'AI OUTPUT TEMPLATE', getTradeScoreAuditOutputTemplate()),
    formatAuditPackageSection(6, 'EXECUTIVE SUMMARY', executiveSummary),
    formatAuditPackageSection(7, 'MARKET EVIDENCE', marketEvidence),
    formatAuditPackageSection(8, 'RULE DECISION', ruleDecision),
    formatAuditPackageSection(9, 'TRADE PLAN', tradePlan),
    formatAuditPackageSection(10, 'ACTUAL RESULT', exportSignalData(frozenRows, 'txt', scorerVersion)),
    formatAuditPackageSection(11, 'BASELINE', buildEvidenceBaselineReport().reportText),
  ].join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Acceptance Test — GĐ1 (Task 11)
// ─────────────────────────────────────────────────────────────────────────────

const ACCEPTANCE_REPORT_BORDER = '=========================================================';

const ACCEPTANCE_AI_CHECKLIST: { label: string; prefixes: string[] }[] = [
  { label: 'Market Evidence đầy đủ', prefixes: ['btcContext'] },
  { label: 'Indicator Evidence đầy đủ', prefixes: ['ema', 'rsi', 'macd', 'bollinger'] },
  { label: 'Volume Evidence đầy đủ', prefixes: ['volume', 'cvd'] },
  { label: 'Derivatives đầy đủ', prefixes: ['oi', 'funding', 'longShortRatio'] },
  { label: 'BTC Context đầy đủ', prefixes: ['btcContext'] },
  { label: 'ADX đầy đủ', prefixes: ['adx'] },
  { label: 'ATR đầy đủ', prefixes: ['atr'] },
  { label: 'VWAP đầy đủ', prefixes: ['vwap'] },
  { label: 'Structure đầy đủ', prefixes: ['structure'] },
];

export interface EvidenceAcceptanceChecklistItem {
  label: string;
  pass: boolean;
}

export interface EvidenceAcceptanceReport {
  snapshotFieldCount: number;
  csvFieldCount: number;
  coveragePct: number;
  csvExportPass: boolean;
  txtExportPass: boolean;
  executiveSummaryPass: boolean;
  metadataPass: boolean;
  tradeContextPass: boolean;
  decisionContextPass: boolean;
  indicatorContextPass: boolean;
  riskContextPass: boolean;
  ruleDocumentPass: boolean;
  aiAuditReadinessPass: boolean;
  acceptanceReady: boolean;
  checklist: EvidenceAcceptanceChecklistItem[];
  reportText: string;
}

function acceptanceCsvPrefixesPresent(prefixes: string[]): boolean {
  const roots = new Set(
    RULE_AUDIT_SNAPSHOT_CSV_COLUMNS.map((col) => col.split('.')[0]),
  );
  return prefixes.every((prefix) => roots.has(prefix));
}

function buildEvidenceAcceptanceProbeRow(): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 1,
    change24h: 0,
    trend: 'UP',
    regimeConfidence: 0,
    score: 10,
    longScore: 10,
    shortScore: 8,
    direction: 'LONG',
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'CÓ THỂ VÀO',
    winrate: '50%',
    canEnter: true,
    tradePlan: null,
    layers: [
      {
        layer: 1,
        name: 'L1 EMA',
        score: 1.5,
        maxScore: 2,
        passed: true,
        isMandatory: false,
        isMandatoryViolation: false,
        reason: 'EMA alignment',
      },
    ],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    ruleAuditSnapshot: buildRuleAuditSnapshot(),
    tradePlanV3: {
      symbol: 'BTCUSDT',
      direction: 'LONG',
      recommendedEntry: 100,
      entryZone: { quality: 'GOOD' },
      stopLoss: { price: 95, quality: 'STRUCTURE', atrDistance: 2 },
      tp1: { price: 110, rrRatio: 2 },
      tp2: { price: 120, rrRatio: 3 },
      tp3: { price: 130, rrRatio: 4 },
      primaryRR: 2,
      expiryTier: 'MEDIUM',
      decision: 'CO_THE_VAO',
    } as TradePlanV3,
  };
}

function validateCsvExportAcceptance(row: SignalRow): boolean {
  const csv = exportRuleAuditEvidenceCSV([row]);
  const lines = csv.split('\n').filter((line) => line.length > 0);
  if (lines.length < 2) return false;
  if (lines[0] !== RULE_AUDIT_EVIDENCE_CSV_COLUMNS.join(',')) return false;

  const exportRow = buildRuleAuditEvidenceExportRow(row);
  return RULE_AUDIT_EVIDENCE_METADATA_COLUMNS.every(
    (col) => (exportRow[col] ?? '').length > 0,
  );
}

function validateTxtExportAcceptance(row: SignalRow): boolean {
  const txt = formatRuleAuditHumanEvidenceTXT([row]);
  const requiredSections = [
    'MARKET',
    'RULE',
    'TRADE',
    'METADATA',
    'EMA',
    'RSI',
    'MACD',
    'BOLLINGER',
    'VOLUME',
    'CVD',
    'DERIVATIVES',
    'BTC CONTEXT',
    'ADX',
    'ATR',
    'VWAP',
    'STRUCTURE',
  ];
  return requiredSections.every((section) => txt.includes(section));
}

/** Audit package — Executive Summary and Actual Result must share frozen snapshot. */
function validateAuditPackageExecutiveActualConsistency(
  rows: SignalRow[],
  scorerVersion: ScorerVersion = DEFAULT_SCORER,
): boolean {
  return rows.every((row) => {
    const frozen = freezeAuditExportRow(row, scorerVersion);
    const snap = resolveSignalRow(frozen, scorerVersion);
    const plan = resolveTradePlanV3(frozen, scorerVersion);
    const exportRow = buildExportRow(frozen, scorerVersion);
    const decisionBand = snap.decisionLabel ?? plan?.decision ?? '';
    return (
      String(snap.score) === String(exportRow.scoreTotal) &&
      decisionBand === exportRow.decision_band
    );
  });
}

function buildAuditSnapshotDriftProbeRow(): SignalRow {
  const v4Snap: SignalRowScorerSnapshot = {
    score: 10,
    longScore: 10,
    shortScore: 6,
    direction: 'LONG',
    decisionLabel: 'VAO_TU_TIN',
    decisionDisplay: 'VÀO TỰ TIN',
    winrate: '62%',
    canEnter: true,
    layers: [],
    mandatoryViolations: [],
    hardBlocked: false,
    finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
  };
  return {
    ...buildEvidenceAcceptanceProbeRow(),
    score: 9.17,
    longScore: 9.17,
    shortScore: 6,
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'CÓ THỂ VÀO',
    v4: v4Snap,
  };
}

function validateAuditPackageSnapshotFreezeAcceptance(): boolean {
  const driftRow = buildAuditSnapshotDriftProbeRow();
  const frozen = freezeAuditExportRow(driftRow, 'v4');
  const snap = resolveSignalRow(frozen, 'v4');
  const exportRow = buildExportRow(frozen, 'v4');
  return (
    snap.score === 10 &&
    snap.decisionLabel === 'VAO_TU_TIN' &&
    exportRow.scoreTotal === 10 &&
    exportRow.decision_band === 'VAO_TU_TIN'
  );
}

function validateExecutiveSummaryAcceptance(row: SignalRow): boolean {
  const txt = formatRuleAuditHumanEvidenceTXT([row]);
  const requiredLines = [
    'EXECUTIVE SUMMARY',
    'Recommendation :',
    'Final Status   :',
    'Direction      :',
    'Decision Band  :',
    'Long Score     :',
    'Short Score    :',
    'Final Score    :',
    'Entry          :',
    'Stop Loss      :',
    'Hard Block     :',
    'Score Block    :',
  ];
  return requiredLines.every((line) => txt.includes(line));
}

function validateMetadataAcceptance(row: SignalRow): boolean {
  const exportRow = buildRuleAuditEvidenceExportRow(row);
  const csvMetaOk = RULE_AUDIT_EVIDENCE_METADATA_COLUMNS.every(
    (col) => (exportRow[col] ?? '').length > 0,
  );
  const txt = formatRuleAuditHumanEvidenceTXT([row]);
  const txtMetaOk =
    txt.includes(`Rule Version: ${RULE_AUDIT_RULE_VERSION}`) &&
    txt.includes(`Snapshot Version: ${RULE_AUDIT_SNAPSHOT_VERSION}`) &&
    txt.includes(`Evidence Version: ${RULE_AUDIT_EVIDENCE_VERSION}`) &&
    txt.includes('Export Time:');
  return csvMetaOk && txtMetaOk;
}

function validateTradeContextAcceptance(): boolean {
  return (
    acceptanceCsvPrefixesPresent(['atr', 'vwap', 'structure']) &&
    HUMAN_EVIDENCE_MARKET_GROUPS.some((g) => g.title === 'ATR') &&
    HUMAN_EVIDENCE_MARKET_GROUPS.some((g) => g.title === 'VWAP') &&
    HUMAN_EVIDENCE_MARKET_GROUPS.some((g) => g.title === 'STRUCTURE')
  );
}

function validateDecisionContextAcceptance(row: SignalRow): boolean {
  const txt = formatRuleAuditHumanEvidenceTXT([row]);
  return (
    txt.includes('RULE') &&
    txt.includes('Decision:') &&
    txt.includes('Decision Band:') &&
    txt.includes('Entry Status:') &&
    txt.includes('Direction:') &&
    txt.includes('Score:') &&
    txt.includes('Layer Summary:')
  );
}

function validateIndicatorContextAcceptance(): boolean {
  return acceptanceCsvPrefixesPresent(['ema', 'rsi', 'macd', 'bollinger']);
}

function validateRiskContextAcceptance(): boolean {
  return acceptanceCsvPrefixesPresent(['adx', 'cvd', 'funding']);
}

function validateRuleDocumentAcceptance(): boolean {
  return RULE_AUDIT_RULE_VERSION.length > 0;
}

function buildEvidenceAcceptanceChecklist(
  coveragePass: boolean,
  decisionContextPass: boolean,
  tradeContextPass: boolean,
  metadataPass: boolean,
  executiveSummaryPass: boolean,
): EvidenceAcceptanceChecklistItem[] {
  const items: EvidenceAcceptanceChecklistItem[] = ACCEPTANCE_AI_CHECKLIST.map(
    (item) => ({
      label: item.label,
      pass: coveragePass && acceptanceCsvPrefixesPresent(item.prefixes),
    }),
  );

  items.push({
    label: 'Rule Decision đầy đủ',
    pass: decisionContextPass && executiveSummaryPass,
  });
  items.push({
    label: 'Trade Decision đầy đủ',
    pass: tradeContextPass && executiveSummaryPass,
  });
  items.push({
    label: 'Metadata đầy đủ',
    pass: metadataPass,
  });

  return items;
}

function formatEvidenceAcceptanceReportText(report: EvidenceAcceptanceReport): string {
  const passFail = (ok: boolean): string => (ok ? 'PASS' : 'FAIL');
  const checklistLines = report.checklist.map((item) => {
    const mark = item.pass ? '☑' : '□';
    return `${mark} ${item.label}`;
  });

  return [
    ACCEPTANCE_REPORT_BORDER,
    '',
    'Evidence Acceptance Report',
    '',
    ACCEPTANCE_REPORT_BORDER,
    '',
    `Snapshot Fields`,
    '',
    String(report.snapshotFieldCount),
    '',
    `CSV Fields`,
    '',
    String(report.csvFieldCount),
    '',
    `Coverage`,
    '',
    `${report.coveragePct}%`,
    '',
    `CSV Export`,
    '',
    passFail(report.csvExportPass),
    '',
    `TXT Export`,
    '',
    passFail(report.txtExportPass),
    '',
    `Executive Summary`,
    '',
    passFail(report.executiveSummaryPass),
    '',
    `Metadata`,
    '',
    passFail(report.metadataPass),
    '',
    ACCEPTANCE_REPORT_BORDER,
    '',
    `Trade Context`,
    '',
    passFail(report.tradeContextPass),
    '',
    `Decision Context`,
    '',
    passFail(report.decisionContextPass),
    '',
    `Indicator Context`,
    '',
    passFail(report.indicatorContextPass),
    '',
    `Risk Context`,
    '',
    passFail(report.riskContextPass),
    '',
    ACCEPTANCE_REPORT_BORDER,
    '',
    `AI Audit Readiness`,
    '',
    passFail(report.aiAuditReadinessPass),
    '',
    ACCEPTANCE_REPORT_BORDER,
    '',
    'Acceptance',
    '',
    report.acceptanceReady ? 'READY FOR AI AUDIT' : 'NOT READY',
    '',
    ACCEPTANCE_REPORT_BORDER,
    '',
    'AI AUDIT READINESS',
    '',
    ...checklistLines,
    '',
    ACCEPTANCE_REPORT_BORDER,
  ].join('\n');
}

/**
 * Acceptance Test — Evidence Package (CSV + TXT + Rule Document metadata).
 * Không đánh giá Rule đúng/sai — chỉ xác nhận đủ dữ liệu audit.
 */
export function buildEvidenceAcceptanceReport(): EvidenceAcceptanceReport {
  const coverage = validateEvidenceCoverage();
  const probeRow = buildEvidenceAcceptanceProbeRow();

  const csvExportPass = validateCsvExportAcceptance(probeRow);
  const txtExportPass = validateTxtExportAcceptance(probeRow);
  const executiveSummaryPass =
    validateExecutiveSummaryAcceptance(probeRow) &&
    validateAuditPackageExecutiveActualConsistency([probeRow], 'v4') &&
    validateAuditPackageSnapshotFreezeAcceptance();
  const metadataPass = validateMetadataAcceptance(probeRow);
  const tradeContextPass = validateTradeContextAcceptance();
  const decisionContextPass = validateDecisionContextAcceptance(probeRow);
  const indicatorContextPass = validateIndicatorContextAcceptance();
  const riskContextPass = validateRiskContextAcceptance();
  const ruleDocumentPass = validateRuleDocumentAcceptance();

  const checklist = buildEvidenceAcceptanceChecklist(
    coverage.pass,
    decisionContextPass,
    tradeContextPass,
    metadataPass,
    executiveSummaryPass,
  );
  const checklistPass = checklist.every((item) => item.pass);

  const exportChecksPass =
    csvExportPass &&
    txtExportPass &&
    executiveSummaryPass &&
    metadataPass &&
    ruleDocumentPass;

  const contextChecksPass =
    tradeContextPass &&
    decisionContextPass &&
    indicatorContextPass &&
    riskContextPass;

  const aiAuditReadinessPass =
    coverage.pass && checklistPass && exportChecksPass && contextChecksPass;

  const acceptanceReady = coverage.coveragePct === 100 && aiAuditReadinessPass;

  const report: EvidenceAcceptanceReport = {
    snapshotFieldCount: coverage.snapshotLeafFieldCount,
    csvFieldCount: coverage.csvEvidenceFieldCount,
    coveragePct: coverage.coveragePct,
    csvExportPass,
    txtExportPass,
    executiveSummaryPass,
    metadataPass,
    tradeContextPass,
    decisionContextPass,
    indicatorContextPass,
    riskContextPass,
    ruleDocumentPass,
    aiAuditReadinessPass,
    acceptanceReady,
    checklist,
    reportText: '',
  };
  report.reportText = formatEvidenceAcceptanceReportText(report);
  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Baseline — GĐ1 Freeze (Task 12)
// ─────────────────────────────────────────────────────────────────────────────

export const EVIDENCE_PACKAGE_VERSION = '1.0';
export const BASELINE_STATUS = 'FROZEN';

export interface EvidenceBaselineReport {
  evidencePackageVersion: string;
  snapshotVersion: string;
  ruleVersion: string;
  csvColumnCount: number;
  snapshotFieldCount: number;
  coveragePct: number;
  acceptanceReady: boolean;
  baselineFrozen: boolean;
  generatedAt: string;
  reportText: string;
}

function formatEvidenceBaselineReportText(report: EvidenceBaselineReport): string {
  const acceptanceLabel = report.acceptanceReady ? 'READY FOR AI AUDIT' : 'NOT READY';

  return [
    '====================================',
    'TradeScore Evidence Baseline',
    '====================================',
    '',
    'Evidence Package',
    '',
    report.evidencePackageVersion,
    '',
    'Snapshot Version',
    '',
    report.snapshotVersion,
    '',
    'Rule Version',
    '',
    report.ruleVersion,
    '',
    'CSV Columns',
    '',
    String(report.csvColumnCount),
    '',
    'Snapshot Fields',
    '',
    String(report.snapshotFieldCount),
    '',
    'Coverage',
    '',
    `${report.coveragePct}%`,
    '',
    'Acceptance',
    '',
    acceptanceLabel,
    '',
    'Baseline',
    '',
    report.baselineFrozen ? BASELINE_STATUS : 'NOT FROZEN',
    '',
    'Generated',
    '',
    report.generatedAt,
    '',
    '====================================',
    'Evidence Contract',
    '',
    'LOCKED',
    '',
    'CSV Contract',
    '',
    'LOCKED',
    '',
    'TXT Contract',
    '',
    'LOCKED',
    '',
    'Snapshot Contract',
    '',
    'LOCKED',
    '',
    '====================================',
    'READY FOR GĐ2',
    '',
    '====================================',
  ].join('\n');
}

/**
 * Baseline GĐ1 — freeze Evidence Package contract.
 * Không sửa CSV/TXT/Snapshot — chỉ xác nhận và ghi nhận trạng thái FROZEN.
 */
export function buildEvidenceBaselineReport(): EvidenceBaselineReport {
  const generatedAt = new Date().toISOString();
  const coverage = validateEvidenceCoverage();
  const acceptance = buildEvidenceAcceptanceReport();

  const baselineFrozen =
    BASELINE_STATUS === 'FROZEN' &&
    acceptance.acceptanceReady &&
    coverage.coveragePct === 100;

  const report: EvidenceBaselineReport = {
    evidencePackageVersion: EVIDENCE_PACKAGE_VERSION,
    snapshotVersion: RULE_AUDIT_SNAPSHOT_VERSION,
    ruleVersion: RULE_AUDIT_RULE_VERSION,
    csvColumnCount: RULE_AUDIT_EVIDENCE_CSV_COLUMNS.length,
    snapshotFieldCount: coverage.snapshotLeafFieldCount,
    coveragePct: coverage.coveragePct,
    acceptanceReady: acceptance.acceptanceReady,
    baselineFrozen,
    generatedAt,
    reportText: '',
  };
  report.reportText = formatEvidenceBaselineReportText(report);
  return report;
}
