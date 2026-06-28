import type { AccountHistoryPoint, AiTradeJournalEntry, DailySessionStats, WeeklyStats } from '../constants/aiJournal';
import type { SkippedSetupEntry } from '../constants/scoring';
import { SCORER_LAYER_NAMES } from '../constants/scoring';
import type { ScorerLayerId } from '../constants/scoring';
import { getVietnamDateParts } from '../store/useTradeStore';

export type TradeJournalEntry = AiTradeJournalEntry;

export interface ExportBundle {
  exportedAt: string;
  version: string;
  journal: AiTradeJournalEntry[];
  dailyStats: DailySessionStats[];
}

export function buildExportBundle(
  journal: AiTradeJournalEntry[],
  dailyStats: DailySessionStats[],
): ExportBundle {
  return {
    exportedAt: new Date().toISOString(),
    version: '2.0',
    journal,
    dailyStats,
  };
}

function csvEscape(value: string | number | boolean | undefined | null): string {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatVnDate(ts: number): string {
  const p = getVietnamDateParts(new Date(ts));
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`;
}

function formatVnTime(ts: number): string {
  const p = getVietnamDateParts(new Date(ts));
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function entryToCsvRow(
  e: AiTradeJournalEntry,
  historyByTradeId: Map<string, AccountHistoryPoint>,
): string {
  const ls = e.scoring.layerScores;
  const historyPoint = historyByTradeId.get(e.id);
  const accountSizeAfter = historyPoint?.value ?? '';
  return [
    e.id,
    formatVnDate(e.timestamp),
    formatVnTime(e.timestamp),
    e.symbol,
    e.scoring.direction,
    e.scoring.totalScore,
    e.scoring.decision,
    e.plan.entryZoneOptimal,
    e.market.entryPrice,
    e.market.slippage,
    e.plan.slProposed,
    e.plan.slActual,
    e.plan.tp1Actual,
    e.plan.tp2,
    e.plan.tp3,
    e.plan.rrProposed,
    e.plan.sizeActual,
    e.market.cvdValue,
    e.market.btcChangePct,
    e.market.fundingRate,
    e.market.topLSRatio,
    e.market.sessionType,
    e.plan.entryZoneType,
    e.outcome.status,
    e.outcome.exitPrice ?? '',
    e.outcome.pnlUSDT ?? '',
    e.outcome.pnlPct ?? '',
    e.outcome.holdingTimeMinutes ?? '',
    e.outcome.exitReason ?? '',
    e.outcome.limitOrderPrice ?? '',
    e.outcome.limitOrderPlacedAt ?? '',
    ls.l1, ls.l2, ls.l3, ls.l4, ls.l5, ls.l6, ls.l7, ls.l8, ls.l9, ls.l10,
    e.tags.join('|'),
    e.outcome.notes ?? '',
    accountSizeAfter,
    e.positionAdvisorActionAtExit ?? '',
    e.followedAdvisorRecommendation ?? '',
    e.scoringDecisionAtExit ?? '',
    e.planHealthAtExit ?? '',
    e.manualExitReason ?? '',
    e.manualExitNote ?? '',
  ]
    .map(csvEscape)
    .join(',');
}

const CSV_HEADERS = [
  'ID', 'Date', 'Time VN', 'Symbol', 'Direction',
  'Score', 'Decision', 'Entry Proposed', 'Entry Actual', 'Slippage%',
  'SL Proposed', 'SL Actual', 'TP1', 'TP2', 'TP3',
  'R:R', 'Size', 'CVD', 'BTC%', 'Funding%', 'L/S Ratio',
  'Session', 'Entry Zone Type',
  'Status', 'Exit Price', 'PnL USDT', 'PnL%',
  'Holding Minutes', 'Exit Reason', 'Limit Price', 'Limit Placed At',
  'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10',
  'Tags', 'Notes', 'accountSizeAfter',
  'positionAdvisorActionAtExit',
  'followedAdvisorRecommendation',
  'scoringDecisionAtExit',
  'planHealthAtExit',
  'manualExitReason',
  'manualExitNote',
];

/** Export journal ra CSV (Excel / Google Sheets). */
export async function exportJournalToCSV(
  entries: AiTradeJournalEntry[],
  accountHistory: AccountHistoryPoint[] = [],
): Promise<string> {
  const historyByTradeId = new Map(accountHistory.map((h) => [h.tradeId, h]));
  const rows = entries
    .filter((e) => !e.archived)
    .map((e) => entryToCsvRow(e, historyByTradeId));
  return [CSV_HEADERS.join(','), ...rows].join('\n');
}

/** @deprecated dùng exportJournalToCSV */
export function exportJournalCsv(
  journal: AiTradeJournalEntry[],
  accountHistory: AccountHistoryPoint[] = [],
): string {
  const historyByTradeId = new Map(accountHistory.map((h) => [h.tradeId, h]));
  const rows = journal
    .filter((e) => !e.archived)
    .map((e) => entryToCsvRow(e, historyByTradeId));
  return [CSV_HEADERS.join(','), ...rows].join('\n');
}

export function exportJournalJson(
  journal: AiTradeJournalEntry[],
  dailyStats: DailySessionStats[] = [],
): string {
  return JSON.stringify(buildExportBundle(journal, dailyStats), null, 2);
}

const SKIPPED_CSV_HEADERS = [
  'id',
  'date',
  'time_vn',
  'symbol',
  'direction',
  'score',
  'skipReason',
  'skipReasonDetail',
  'priceAtSkip',
  'priceAfter2h',
  'priceAfter4h',
  'hypotheticalPnlPct',
  'version',
];

function skippedToCsvRow(e: SkippedSetupEntry): string {
  return [
    e.id,
    formatVnDate(e.timestamp),
    formatVnTime(e.timestamp),
    e.symbol,
    e.direction,
    e.totalScore,
    e.skipReason,
    e.skipReasonDetail,
    e.priceAtSkip,
    e.priceAfter2h ?? '',
    e.priceAfter4h ?? '',
    e.hypotheticalPnlPct ?? '',
    e.version,
  ]
    .map(csvEscape)
    .join(',');
}

/** Export skipped setups — file riêng cho AI phase 2. */
export function exportSkippedSetupsToCSV(entries: SkippedSetupEntry[]): string {
  const rows = entries.filter((e) => !e.archived).map(skippedToCsvRow);
  return [SKIPPED_CSV_HEADERS.join(','), ...rows].join('\n');
}

export function exportDailyStatsCsv(stats: DailySessionStats[]): string {
  const headers = [
    'date', 'totalTrades', 'wins', 'losses', 'winRate',
    'totalPnlUSDT', 'avgScore', 'avgHoldingMinutes',
  ];
  const rows = stats.map((d) =>
    [
      d.date, d.totalTrades, d.wins, d.losses, d.winRate,
      d.totalPnlUSDT, d.avgScore, d.avgHoldingMinutes,
    ]
      .map(csvEscape)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

export function downloadTextFile(filename: string, content: string, mime = 'application/json'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportBundle(json: string): ExportBundle | null {
  try {
    const data = JSON.parse(json) as ExportBundle;
    if (!Array.isArray(data.journal)) return null;
    return data;
  } catch {
    return null;
  }
}

function formatShortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

/** Báo cáo text tuần để share. */
export function generateTextReport(
  stats: WeeklyStats,
  insights: string[] = [],
): string {
  const lines = [
    '═══ TRADESCORE WEEKLY REPORT ═══',
    `Tuần: ${formatShortDate(stats.from)} - ${formatShortDate(stats.to)}`,
    `Vốn đầu tuần: ${stats.accountStartUSDT.toFixed(2)} USDT`,
    `Vốn cuối tuần: ${stats.accountEndUSDT.toFixed(2)} USDT (${stats.accountChangePct >= 0 ? '+' : ''}${stats.accountChangePct.toFixed(1)}%)`,
    `Tổng lệnh: ${stats.trades} (${stats.wins}W/${stats.losses}L/${stats.breakevens}BE)`,
    `Win rate: ${stats.winRate}%`,
    `P&L tuần: ${stats.totalPnlUSDT >= 0 ? '+' : ''}${stats.totalPnlUSDT.toFixed(2)} USDT`,
  ];
  if (stats.bestTradeLabel) lines.push(`Best trade: ${stats.bestTradeLabel}`);
  if (stats.worstTradeLabel) lines.push(`Worst trade: ${stats.worstTradeLabel}`);
  if (stats.bestLayer) {
    const layerName = SCORER_LAYER_NAMES[Number(stats.bestLayer.replace('l', '')) as ScorerLayerId] ?? stats.bestLayer;
    lines.push(`Layer chính xác nhất: ${stats.bestLayer.toUpperCase()}-${layerName} (${stats.bestLayerAccuracy}%)`);
  }
  if (insights.length > 0) {
    lines.push('', 'Khuyến nghị:');
    for (const i of insights) lines.push(`• ${i}`);
  }
  lines.push('', `Cập nhật: ${formatShortDate(stats.to)}`);
  return lines.join('\n');
}
