/**
 * Entry / SL / TP Audit Package — 11 sections, không gồm L1-L11 scoring.
 */

import type { ScorerVersion } from '../constants/scoring';
import type { RuleAuditSnapshot } from '../types/ruleAuditSnapshot';
import { FinalEntryStatus } from '../types/scoring';
import { getTradeScoreEntrySltpRuleBookText } from '../docs/tradeScoreEntrySltpRuleBook';
import {
  getTradeScoreEntrySltpAuditInstructionText,
  getTradeScoreEntrySltpAuditWorkflowText,
  getTradeScoreEntrySltpMasterAuditPrompt,
  getTradeScoreEntrySltpAuditOutputTemplate,
} from '../docs/tradeScoreEntrySltpAuditMeta';
import type { SignalRow } from './signalBoardScan';
import {
  buildExportRow,
  buildEvidenceBaselineReport,
  EVIDENCE_PACKAGE_VERSION,
  type SignalExportRow,
} from './exportService';
import {
  resolveFinalEntryStatus,
  resolveSignalRow,
  resolveTradePlanV3,
} from './signalRowView';
import { TRADE_SCORE_ENTRY_SLTP_RULE_BOOK_VERSION } from '../docs/tradeScoreEntrySltpRuleBook';

export const ENTRY_SLTP_AUDIT_PACKAGE_FILENAME = 'Entry_SLTP_Audit_Package.txt';
export const ENTRY_SLTP_WORKSHEET_BLANK = '______________';

const DEFAULT_SCORER: ScorerVersion = 'v4';
const AUDIT_PACKAGE_SECTION_BORDER = '='.repeat(80);
const COIN_BORDER = '========================================================';
const WORKSHEET_COIN_BORDER = '════════════════════════════';
const WORKSHEET_BLANK = ENTRY_SLTP_WORKSHEET_BLANK;

const ENTRY_SLTP_MARKET_PREFIXES = ['adx', 'atr', 'vwap', 'structure'] as const;

const ENTRY_SLTP_SNAPSHOT_FIELDS: { group: string; paths: string[] }[] = [
  {
    group: 'ADX',
    paths: [
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
    ],
  },
  {
    group: 'ATR',
    paths: ['atr.atr1h', 'atr.atr1hPct'],
  },
  {
    group: 'VWAP',
    paths: [
      'vwap.vwap',
      'vwap.upperBand1',
      'vwap.lowerBand1',
      'vwap.upperBand2',
      'vwap.lowerBand2',
      'vwap.priceVsVwap',
      'vwap.zone',
      'vwap.isNearVwap',
      'vwap.isPullingBackToVwap',
      'vwap.entryQuality',
      'vwap.suggestedEntry',
    ],
  },
  {
    group: 'STRUCTURE',
    paths: [
      'structure.lookbackCandles',
      'structure.swingPrice',
      'structure.swingTime',
      'structure.slPrice',
      'structure.slSource',
      'structure.candlesBack',
      'structure.distanceFromEntry',
      'structure.bufferPct',
    ],
  },
];

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

function readRuleAuditSnapshotPath(snapshot: RuleAuditSnapshot, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = snapshot;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function formatCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatEntrySltpPackageHeader(generatedTime: string): string {
  return [
    AUDIT_PACKAGE_SECTION_BORDER,
    'ENTRY / SL / TP AUDIT PACKAGE',
    AUDIT_PACKAGE_SECTION_BORDER,
    '',
    'Package Version',
    '',
    EVIDENCE_PACKAGE_VERSION,
    '',
    'Rule Version',
    '',
    TRADE_SCORE_ENTRY_SLTP_RULE_BOOK_VERSION,
    '',
    'Scope',
    '',
    'Entry / SL / TP / RR / Quality — NO L1-L11 scoring',
    '',
    'Generated Time',
    '',
    generatedTime,
    '',
  ].join('\n');
}

function snapshotGroupLines(
  snapshot: RuleAuditSnapshot | undefined,
  paths: string[],
): string[] {
  if (snapshot == null) return ['(no snapshot)'];
  const lines: string[] = [];
  for (const path of paths) {
    const label = path.includes('.') ? path.slice(path.indexOf('.') + 1) : path;
    lines.push(`${label}: ${formatCell(readRuleAuditSnapshotPath(snapshot, path))}`);
  }
  return lines.length > 0 ? lines : ['(no data)'];
}

function formatExecutiveSummaryCoinBlock(
  row: SignalRow,
  scorerVersion: ScorerVersion,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const plan = resolveTradePlanV3(row, scorerVersion);
  const finalStatus =
    resolveFinalEntryStatus(row, scorerVersion) ?? FinalEntryStatus.SCORE_BLOCKED;
  const snapshot = row.ruleAuditSnapshot;
  const entryZoneQuality = plan?.entryZone?.quality ?? '';
  const vwapEntryQuality =
    row.vwapSignal?.quality ?? snapshot?.vwap.entryQuality ?? '';
  const exportEntryQuality = entryZoneQuality || vwapEntryQuality;

  return [
    COIN_BORDER,
    row.symbol,
    COIN_BORDER,
    '',
    `Symbol             : ${row.symbol}`,
    `Direction          : ${formatCell(snap.direction)}`,
    `Price              : ${formatCell(row.price)}`,
    `Entry              : ${formatCell(plan?.recommendedEntry)}`,
    `Stop Loss          : ${formatCell(plan?.stopLoss?.price)}`,
    `Take Profit 1      : ${formatCell(plan?.tp1?.price)}`,
    `Take Profit 2      : ${formatCell(plan?.tp2?.price)}`,
    `Take Profit 3      : ${formatCell(plan?.tp3?.price)}`,
    `Primary RR         : ${formatCell(plan?.primaryRR)}`,
    '',
    '--------------------------------------------------------',
    '',
    `Entry Quality (export)     : ${formatCell(exportEntryQuality)}`,
    `entryZone.quality          : ${formatCell(entryZoneQuality)}`,
    `vwap.entryQuality          : ${formatCell(vwapEntryQuality)}`,
    `SL Quality                 : ${formatCell(plan?.stopLoss?.quality)}`,
    `SL Source                  : ${formatCell(row.structureSL?.slSource ?? '')}`,
    `Final Entry Status         : ${formatCell(finalStatus)}`,
    '',
    COIN_BORDER,
  ].join('\n');
}

function formatMarketEvidenceCoinBlock(
  row: SignalRow,
  scorerVersion: ScorerVersion,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const snapshot = row.ruleAuditSnapshot;
  const lines: string[] = [
    COIN_BORDER,
    row.symbol,
    COIN_BORDER,
    '',
    `Price     : ${formatCell(row.price)}`,
    `Direction : ${formatCell(snap.direction)}`,
    '',
  ];

  for (const { group, paths } of ENTRY_SLTP_SNAPSHOT_FIELDS) {
    lines.push(group);
    lines.push(...snapshotGroupLines(snapshot, paths));
    lines.push('');
  }

  lines.push(COIN_BORDER);
  return lines.join('\n');
}

/** Section 8 — worksheet trống; chỉ dùng symbol, không đọc pipeline output. */
function formatExpectedCalculationCoinBlock(symbol: string): string {
  const b = WORKSHEET_BLANK;
  return [
    WORKSHEET_COIN_BORDER,
    `${symbol} — EXPECTED CALCULATION WORKSHEET`,
    WORKSHEET_COIN_BORDER,
    '',
    '(Tính từ Rule Book Section 1 + Market Evidence Section 7 — KHÔNG lấy từ app.',
    'Điền theo đúng thứ tự pipeline.)',
    '',
    'Bước (a) Base Plan:',
    `  Expected Entry:        ${b}`,
    `  Expected SL (base):    ${b}`,
    `  Expected TP1/TP2/TP3:  ${b} / ${b} / ${b}`,
    '',
    'Bước (b) ADX Scale:',
    `  ADX regime + severity: ${b} (điền từ Section 7 evidence)`,
    `  TP multiplier applied: ${b}`,
    `  SL multiplier applied: ${b}`,
    '',
    'Bước (c) VWAP Overlay:',
    `  vwap.entryQuality:     ${b}`,
    `  Overlay áp dụng?:      ${b}`,
    '',
    'Bước (d) Structure SL:',
    `  SL Source Expected:    ${b} (STRUCTURE | ATR_FALLBACK)`,
    `  Lý do:                 ${b}`,
    '',
    'Bước (e) RR Check:',
    `  Expected primary RR:   ${b}`,
    `  RR < 2.0 → invalidate?: ${b}`,
    '',
    `Expected entryZone.quality: ${b}`,
    `Expected SL Quality:        ${b}`,
    '',
    WORKSHEET_COIN_BORDER,
  ].join('\n');
}

function formatActualTradePlanCoinBlock(
  row: SignalRow,
  scorerVersion: ScorerVersion,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const plan = resolveTradePlanV3(row, scorerVersion);
  const adxGate = row.adxGate;
  const structure = row.structureSL;
  const vwapSignal = row.vwapSignal;

  return [
    COIN_BORDER,
    row.symbol,
    COIN_BORDER,
    '',
    `Direction          : ${formatCell(snap.direction)}`,
    `Decision Band      : ${formatCell(snap.decisionLabel ?? plan?.decision)}`,
    `Entry              : ${formatCell(plan?.recommendedEntry)}`,
    `Stop Loss          : ${formatCell(plan?.stopLoss?.price)}`,
    `SL Quality         : ${formatCell(plan?.stopLoss?.quality)}`,
    `SL ATR Distance    : ${formatCell(plan?.stopLoss?.atrDistance)}`,
    `TP1                : ${formatCell(plan?.tp1?.price)} (RR ${formatCell(plan?.tp1?.rrRatio)})`,
    `TP2                : ${formatCell(plan?.tp2?.price)} (RR ${formatCell(plan?.tp2?.rrRatio)})`,
    `TP3                : ${formatCell(plan?.tp3?.price)} (RR ${formatCell(plan?.tp3?.rrRatio)})`,
    `Primary RR         : ${formatCell(plan?.primaryRR)}`,
    `entryZone.quality  : ${formatCell(plan?.entryZone?.quality)}`,
    `vwapSignal.quality : ${formatCell(vwapSignal?.quality)}`,
    `Plan Expiry        : ${formatCell(plan?.expiryTier)}`,
    `Block Reasons      : ${formatCell(plan?.blockReasons?.join(', '))}`,
    '',
    'ADX Gate:',
    `  severity     : ${formatCell(adxGate?.severity)}`,
    `  tpMultiplier : ${formatCell(adxGate?.tpMultiplier)}`,
    `  slMultiplier : ${formatCell(adxGate?.slMultiplier)}`,
    `  block        : ${formatCell(adxGate?.block)}`,
    `  message      : ${formatCell(adxGate?.message)}`,
    '',
    'Structure SL:',
    `  slSource     : ${formatCell(structure?.slSource)}`,
    `  swingPrice   : ${formatCell(structure?.swingPrice)}`,
    `  slPrice      : ${formatCell(structure?.slPrice)}`,
    `  candlesBack  : ${formatCell(structure?.candlesBack)}`,
    `  distancePct  : ${formatCell(structure?.distanceFromEntry)}`,
    '',
    COIN_BORDER,
  ].join('\n');
}

function txtNum(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return String(value);
}

function formatEntrySltpAuditFields(row: SignalExportRow): string[] {
  return [
    '════════════════════════════════',
    'AUDIT FIELDS (Entry/SL/TP scope)',
    '════════════════════════════════',
    `finalEntryStatus: ${row.final_entry_status}`,
    `decisionBand:     ${row.decision_band}`,
    `direction:        ${row.direction_active}`,
    `slQuality:        ${row.sl_quality}`,
    `           (${row.sl_atr_distance}×ATR)`,
    `slProfile V4:     ${row.sl_profile_v4}`,
    `entryQuality:     ${row.entry_quality}`,
    `vwapEntryQuality: ${row.vwap_entry_quality}`,
    `rrAfterStructure: ${row.rr_after_structure}`,
    `planExpiry:       ${row.plan_expiry_tier}`,
    `structureLookback:${row.structure_lookback_config} nến`,
    `rrConfigSource:   ${row.rr_config_source}`,
    `rrConfigPath:     ${row.rr_config_path}`,
    '════════════════════════════════',
  ];
}

function formatEntrySltpActualResultCoinBlock(
  row: SignalExportRow,
): string {
  const changeSign = row.priceChange24h >= 0 ? '+' : '';
  const hardBlocksLine =
    row.hard_blocks.length > 0 ? row.hard_blocks.replace(/\|/g, ' | ') : 'Không có';

  return [
    '════════════════════════════',
    `${row.symbol} — ${txtNum(row.price)} (${changeSign}${txtNum(row.priceChange24h)}%)`,
    `Thời điểm: ${row.timestamp}`,
    '════════════════════════════',
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
    ...formatEntrySltpAuditFields(row),
    '────────────────────────────',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function formatEntrySltpActualResult(rows: SignalRow[], scorerVersion: ScorerVersion): string {
  const exportRows = rows.map((row) => buildExportRow(row, scorerVersion));
  return exportRows.map(formatEntrySltpActualResultCoinBlock).join('\n\n');
}

function buildEntrySltpBaselineSection(): string {
  const baseline = buildEvidenceBaselineReport();
  const checklist = [
    '====================================',
    'Entry / SL / TP Module Checklist',
    '====================================',
    '',
    '[ ] ADX Gate — evaluateADXGate + scaleTradePlanByAdxGate',
    '[ ] VWAP Entry — getVWAPEntrySignal + applyVWAPEntryToPlan',
    '[ ] Structure SL — applyStructureSLToPlans + invalidatePlanIfStructureRrBelowMin',
    '[ ] Trade Plan — calculateTradePlanV3/V4 + fixed RR 2/3/4.5',
    '[ ] Entry Quality — entryZone.quality + vwap.entryQuality (2 hệ độc lập)',
    '[ ] SL Quality — TIGHT/NORMAL/WIDE từ ATR distance',
    '[ ] Evidence snapshot — adx/atr/vwap/structure fields đầy đủ',
    '',
    'Scope: KHÔNG kiểm tra L1-L11 scoring layers.',
    '',
  ].join('\n');

  return `${baseline.reportText}\n\n${checklist}`;
}

/** One-File Entry/SL/TP Audit Package — upload cho AI auditor. */
export function exportEntrySltpAuditPackage(
  rows: SignalRow[],
  scorerVersion: ScorerVersion = DEFAULT_SCORER,
): string {
  const generatedTime = new Date().toISOString();

  const executiveSummary = rows
    .map((row) => formatExecutiveSummaryCoinBlock(row, scorerVersion))
    .join('\n\n');
  const marketEvidence = rows
    .map((row) => formatMarketEvidenceCoinBlock(row, scorerVersion))
    .join('\n\n');
  const expectedCalculation = rows
    .map((row) => formatExpectedCalculationCoinBlock(row.symbol))
    .join('\n\n');
  const actualTradePlan = rows
    .map((row) => formatActualTradePlanCoinBlock(row, scorerVersion))
    .join('\n\n');
  const actualResult = formatEntrySltpActualResult(rows, scorerVersion);
  const baseline = buildEntrySltpBaselineSection();

  return [
    formatEntrySltpPackageHeader(generatedTime),
    formatAuditPackageSection(1, 'ENTRY/SL/TP RULE BOOK', getTradeScoreEntrySltpRuleBookText()),
    formatAuditPackageSection(
      2,
      'AI AUDIT INSTRUCTION',
      getTradeScoreEntrySltpAuditInstructionText(),
    ),
    formatAuditPackageSection(3, 'AI AUDIT WORKFLOW', getTradeScoreEntrySltpAuditWorkflowText()),
    formatAuditPackageSection(4, 'MASTER AUDIT PROMPT', getTradeScoreEntrySltpMasterAuditPrompt()),
    formatAuditPackageSection(
      5,
      'AI OUTPUT TEMPLATE',
      getTradeScoreEntrySltpAuditOutputTemplate(),
    ),
    formatAuditPackageSection(6, 'EXECUTIVE SUMMARY', executiveSummary),
    formatAuditPackageSection(7, 'MARKET EVIDENCE', marketEvidence),
    formatAuditPackageSection(8, 'EXPECTED CALCULATION', expectedCalculation),
    formatAuditPackageSection(9, 'ACTUAL TRADE PLAN', actualTradePlan),
    formatAuditPackageSection(10, 'ACTUAL RESULT', actualResult),
    formatAuditPackageSection(11, 'BASELINE', baseline),
  ].join('\n\n');
}

/** Section headers for tests / validation. */
export const ENTRY_SLTP_AUDIT_SECTION_HEADERS = [
  'SECTION 1',
  'SECTION 2',
  'SECTION 3',
  'SECTION 4',
  'SECTION 5',
  'SECTION 6',
  'SECTION 7',
  'SECTION 8',
  'SECTION 9',
  'SECTION 10',
  'SECTION 11',
] as const;

/** Market evidence prefixes included in Entry/SL/TP package. */
export { ENTRY_SLTP_MARKET_PREFIXES };
