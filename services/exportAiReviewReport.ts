/**
 * AI Review Report export — single Markdown file (UL-03 / UL-03.1).
 *
 * **Purpose:** Architecture/code review upload for ChatGPT, Claude, Gemini, Cursor.
 * Integrated as an Audit Package export template — not a separate export system.
 *
 * @module services/exportAiReviewReport
 */

import type { AccountHistoryPoint, AiTradeJournalEntry } from '../constants/aiJournal';
import { BUILD_INFO } from '../constants/buildInfo';
import type { ScorerVersion } from '../constants/scoring';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { getTradeScoreRuleBookText } from '../docs/tradeScoreRuleBook';
import type { SignalRow } from '../hooks/useSignalBoard';
import {
  resolveJournalCloseReasonDisplay,
  resolveJournalOpenReasonDisplay,
} from './journalService';
import {
  ENTRY_STATE_MAPPING_FROZEN_VERSION,
  ESM_MODULE_METADATA,
  FEATURE_FLAG,
  MODULE_VERSION,
  POSITION_ADVISER_FEATURE_FLAG,
  POSITION_ADVISER_INTEGRATION_FROZEN_VERSION,
} from './entryStateManager/metadata';
import { PRODUCTION_ESM_BRIDGE_VERSION } from './productionEsmBridge/productionEsmBridgeTypes';
import {
  ESM_STORE_BRIDGE_VERSION,
  getEsmSnapshotForSymbol,
  type EsmBridgeState,
} from '../store/esmBridgeTypes';
import { resolveEsmHintBadge, resolveEsmRuleBookHint } from '../utils/esmUiDisplay';
import {
  buildArchitectureVersionMatrix,
  formatArchitectureVersionMatrix,
  formatFeatureFlagSummary,
  resolveRuntimeFeatureFlags,
  UI_LAYER_VERSION,
} from '../utils/architectureExportMetadata';

export const AI_REVIEW_REPORT_FILENAME = 'TradeScore_AI_Review.md' as const;

export interface AiReviewReportContext {
  readonly generatedAt: string;
  readonly scorerVersion: ScorerVersion;
  readonly signalRows: readonly SignalRow[];
  readonly esmBridge: EsmBridgeState;
  readonly journalEntries: readonly AiTradeJournalEntry[];
  readonly pendingOrders: readonly AiTradeJournalEntry[];
  readonly runningOrders: readonly AiTradeJournalEntry[];
  readonly closedTrades: readonly AiTradeJournalEntry[];
  readonly accountHistory: readonly AccountHistoryPoint[];
  readonly advisorLabelById?: Readonly<Record<string, string>>;
  readonly testCount?: number;
}

function mdSection(title: string, body: string): string {
  return `## ${title}\n\n${body.trim()}\n`;
}

function mdJsonBlock(value: unknown): string {
  return '```json\n' + JSON.stringify(value, null, 2) + '\n```\n';
}

function summarizeSignals(rows: readonly SignalRow[]): string {
  if (rows.length === 0) return '_No signal rows._\n';
  return (
    rows
      .map((row) => {
        const dir = row.direction ?? '—';
        const score = row.score ?? '—';
        const decision = row.decisionDisplay ?? row.decisionLabel ?? '—';
        const canEnter = row.canEnter ? 'yes' : 'no';
        return `- **${row.symbol}** ${dir} · score ${score} · ${decision} · canEnter=${canEnter}`;
      })
      .join('\n') + '\n'
  );
}

function summarizeJournal(
  entries: readonly AiTradeJournalEntry[],
  emptyLabel: string,
  includeReasons = false,
): string {
  if (entries.length === 0) return `_${emptyLabel}_\n`;
  const lines = entries.slice(0, 25).map((entry) => {
    const status = entry.outcome.status;
    const dir = entry.scoring.direction;
    const pnl =
      entry.outcome.pnlUSDT != null ? `${entry.outcome.pnlUSDT.toFixed(2)} USDT` : '—';
    const rec = entry.scoring.recommendationLabel ?? '—';
    const base = `- **${entry.symbol}** ${dir} · ${status} · PnL ${pnl} · rec: ${rec}`;
    if (!includeReasons) return base;
    const open = resolveJournalOpenReasonDisplay(entry) ?? '—';
    const close = resolveJournalCloseReasonDisplay(entry) ?? '—';
    return `${base}\n  - Open: ${open}\n  - Close: ${close}`;
  });
  const suffix = entries.length > 25 ? `\n_…and ${entries.length - 25} more._\n` : '\n';
  return lines.join('\n') + suffix;
}

function summarizeEntrySltp(entries: readonly AiTradeJournalEntry[]): string {
  if (entries.length === 0) return '_No trades with plan data._\n';
  return (
    entries
      .slice(0, 25)
      .map((entry) => {
        const { plan } = entry;
        return [
          `- **${entry.symbol}** ${entry.scoring.direction} · ${entry.outcome.status}`,
          `  - Entry: ${entry.market.entryPrice} (zone ${plan.entryZoneRangeLow}–${plan.entryZoneRangeHigh})`,
          `  - SL: ${plan.slActual} (proposed ${plan.slProposed})`,
          `  - TP1: ${plan.tp1Actual} · TP2: ${plan.tp2} · TP3: ${plan.tp3}`,
          `  - RR: ${plan.rrProposed} · Size: ${plan.sizeActual}`,
        ].join('\n');
      })
      .join('\n') + '\n'
  );
}

function buildEntryStateSection(esmBridge: EsmBridgeState): string {
  const symbols = Object.keys(esmBridge.snapshotBySymbol);
  if (symbols.length === 0) {
    return [
      `Store status: **${esmBridge.status}**`,
      `Enabled flag: **${esmBridge.enabled}**`,
      '',
      '_No ESM snapshots stored yet._',
    ].join('\n') + '\n';
  }

  const lines = symbols.map((symbol) => {
    const snapshot = esmBridge.snapshotBySymbol[symbol];
    const hint = resolveEsmRuleBookHint(snapshot, symbol);
    const updated = esmBridge.lastUpdatedBySymbol[symbol];
    return [
      `### ${symbol}`,
      `- Updated: ${updated != null ? new Date(updated).toISOString() : '—'}`,
      `- ESM enabled: **${snapshot.entryStateManagerEnabled}**`,
      `- Mapped state: **${snapshot.mappedCurrentState}**`,
      `- RuleBook hint: **${hint ?? '—'}**`,
      `- Halted: **${snapshot.halted}**`,
    ].join('\n');
  });

  return lines.join('\n\n') + '\n';
}

function buildRecommendationSection(
  runningOrders: readonly AiTradeJournalEntry[],
  esmBridge: EsmBridgeState,
  advisorLabelById?: Readonly<Record<string, string>>,
): string {
  if (runningOrders.length === 0) return '_No running orders._\n';
  return (
    runningOrders
      .map((entry) => {
        const live = advisorLabelById?.[entry.id]?.trim();
        const pa = live || entry.scoring.recommendationLabel?.trim() || '—';
        const snapshot = getEsmSnapshotForSymbol(esmBridge, entry.symbol);
        const hint = resolveEsmHintBadge(snapshot, entry.symbol) ?? '—';
        return `- **${entry.symbol}** ${entry.scoring.direction}: PA **${pa}** · ESM ${hint}`;
      })
      .join('\n') + '\n'
  );
}

function buildPositionAdviserSection(
  runningOrders: readonly AiTradeJournalEntry[],
  advisorLabelById?: Readonly<Record<string, string>>,
): string {
  if (runningOrders.length === 0) return '_No live Position Adviser snapshots._\n';
  return (
    runningOrders
      .map((entry) => {
        const live = advisorLabelById?.[entry.id]?.trim() ?? '—';
        return [
          `- **${entry.symbol}** ${entry.scoring.direction}`,
          `  - Live label: ${live}`,
          `  - Entry label: ${entry.scoring.recommendationLabel ?? '—'}`,
          `  - Market state: ${entry.scoring.marketState ?? '—'}`,
          `  - Score at entry: ${entry.scoring.score ?? entry.scoring.totalScore}`,
        ].join('\n');
      })
      .join('\n') + '\n'
  );
}

function buildStatisticsSection(journalEntries: readonly AiTradeJournalEntry[]): string {
  const closed = journalEntries.filter(
    (e) => e.outcome.status === 'WIN' || e.outcome.status === 'LOSS',
  );
  if (closed.length === 0) return '_No closed trades for statistics._\n';

  const wins = closed.filter((e) => e.outcome.status === 'WIN').length;
  const losses = closed.filter((e) => e.outcome.status === 'LOSS').length;
  const winratePct = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 1000) / 10 : 0;
  const totalPnl = closed.reduce((sum, e) => sum + (e.outcome.pnlUSDT ?? 0), 0);
  const holdMinutes = closed
    .map((e) => e.outcome.holdingTimeMinutes ?? e.outcome.holdDurationMinutes ?? 0)
    .filter((m) => m > 0);
  const avgHold =
    holdMinutes.length > 0
      ? holdMinutes.reduce((a, b) => a + b, 0) / holdMinutes.length
      : 0;

  return [
    `- Closed trades: **${closed.length}**`,
    `- Wins: **${wins}** · Losses: **${losses}**`,
    `- Win rate: **${winratePct}%**`,
    `- Total PnL: **${totalPnl.toFixed(2)} USDT**`,
    `- Avg hold: **${avgHold.toFixed(0)} min**`,
  ].join('\n') + '\n';
}

function buildRuleBookSummary(): string {
  const full = getTradeScoreRuleBookText().trim();
  const lines = full.split('\n').slice(0, 40);
  return '```text\n' + lines.join('\n') + '\n…\n```\n';
}

function buildAuditSummary(rows: readonly SignalRow[]): string {
  const canEnter = rows.filter((r) => r.canEnter && !r.error);
  const blocked = rows.filter((r) => r.hardBlocked);
  return [
    `- Scanned symbols: **${rows.length}**`,
    `- Can enter: **${canEnter.length}**`,
    `- Hard blocked: **${blocked.length}**`,
    `- Symbols ready: ${canEnter.map((r) => r.symbol).join(', ') || '—'}`,
  ].join('\n') + '\n';
}

function buildOpenCloseReasonsSection(entries: readonly AiTradeJournalEntry[]): string {
  const recent = [...entries]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);
  if (recent.length === 0) return '_No journal entries._\n';
  return (
    recent
      .map((entry) => {
        const open = resolveJournalOpenReasonDisplay(entry) ?? '—';
        const close = resolveJournalCloseReasonDisplay(entry) ?? '—';
        return `- **${entry.symbol}** ${entry.outcome.status}: Open — ${open} · Close — ${close}`;
      })
      .join('\n') + '\n'
  );
}

/**
 * Builds the single Markdown AI review report — deterministic, read-only.
 */
export function exportAiReviewReport(ctx: AiReviewReportContext): string {
  const tradeHistory = ctx.closedTrades.length > 0 ? ctx.closedTrades : ctx.journalEntries.filter(
    (e) => e.outcome.status !== 'OPEN' && e.outcome.status !== 'PENDING',
  );

  const sections = [
    '# TradeScore AI Review',
    '',
    `_Generated: ${ctx.generatedAt}_`,
    '',
    mdSection(
      'System Version',
      [
        `App version: **${BUILD_INFO.version}**`,
        `Build date: ${BUILD_INFO.buildDate}`,
        `Scorer engine: **${ctx.scorerVersion}**`,
        `Report module: **${UI_LAYER_VERSION}**`,
      ].join('\n'),
    ),
    mdSection(
      'Architecture Version',
      [
        `- ESM Store Bridge: **${ESM_STORE_BRIDGE_VERSION}**`,
        `- Production ESM Bridge: **${PRODUCTION_ESM_BRIDGE_VERSION}**`,
        `- ESM Core: **${MODULE_VERSION}**`,
        `- Audit schema: **${ESM_MODULE_METADATA.auditVersion}**`,
      ].join('\n'),
    ),
    mdSection(
      'Freeze Version',
      [
        `- ESM Core: **${MODULE_VERSION}**`,
        `- RuleBook: **${ESM_MODULE_METADATA.rulebookVersion}**`,
        `- Entry State Mapping Bridge: **${ENTRY_STATE_MAPPING_FROZEN_VERSION}**`,
        `- Position Adviser Integration: **${POSITION_ADVISER_INTEGRATION_FROZEN_VERSION}**`,
      ].join('\n'),
    ),
    mdSection(
      'Feature Flags',
      [
        `- ${FEATURE_FLAG}: read runtime summary at end of report`,
        `- ${POSITION_ADVISER_FEATURE_FLAG}: read runtime summary at end of report`,
        `- TP_PROBABILITY_FILTER: **${FEATURE_FLAGS.TP_PROBABILITY_FILTER}**`,
        `- TP_PROBABILITY_MIN_TRADES: **${FEATURE_FLAGS.TP_PROBABILITY_MIN_TRADES}**`,
      ].join('\n'),
    ),
    mdSection('Signals', summarizeSignals(ctx.signalRows)),
    mdSection('Current Market Snapshot', summarizeSignals(ctx.signalRows)),
    mdSection('Running Orders', summarizeJournal(ctx.runningOrders, 'No running orders.', true)),
    mdSection('Pending Orders', summarizeJournal(ctx.pendingOrders, 'No pending orders.')),
    mdSection('Journal', summarizeJournal(ctx.journalEntries, 'No journal entries.')),
    mdSection(
      'Recommendation',
      buildRecommendationSection(ctx.runningOrders, ctx.esmBridge, ctx.advisorLabelById),
    ),
    mdSection('Entry State', buildEntryStateSection(ctx.esmBridge)),
    mdSection(
      'Position Adviser Snapshot',
      buildPositionAdviserSection(ctx.runningOrders, ctx.advisorLabelById),
    ),
    mdSection(
      'Entry / SL / TP',
      summarizeEntrySltp(
        ctx.runningOrders.length > 0 ? ctx.runningOrders : ctx.pendingOrders,
      ),
    ),
    mdSection('Trade History', summarizeJournal(tradeHistory, 'No trade history.', true)),
    mdSection('Statistics', buildStatisticsSection(ctx.journalEntries)),
    mdSection('RuleBook Summary', buildRuleBookSummary()),
    mdSection('Audit Summary', buildAuditSummary(ctx.signalRows)),
    mdSection('Open Reason / Close Reason', buildOpenCloseReasonsSection(ctx.journalEntries)),
    mdSection(
      'RuleBook',
      '_Full RuleBook text — see RuleBook Summary for excerpt._\n\n```text\n' +
        getTradeScoreRuleBookText().trim().slice(0, 8000) +
        '\n```',
    ),
    mdSection(
      'Architecture Summary',
      [
        '- ESM Core frozen — UI read-only render',
        '- PA recommendation primary; ESM hint secondary (ⓘ badge)',
        '- snapshotBySymbol per coin — no global latestSnapshot',
        '- AI Review integrated in Audit Package dropdown',
        '- ENTRY_STATE_MANAGER_ENABLED defaults OFF until UL-04',
      ].join('\n'),
    ),
    mdSection(
      'Modules',
      [
        '| Module | Version | Role |',
        '|--------|---------|------|',
        `| Entry State Manager | ${MODULE_VERSION} | Frozen core |`,
        `| Mapping Bridge | ${ENTRY_STATE_MAPPING_FROZEN_VERSION} | FinalEntryStatus ↔ EntryState |`,
        `| Production ESM Bridge | ${PRODUCTION_ESM_BRIDGE_VERSION} | SignalRow transport |`,
        `| ESM Store Bridge | ${ESM_STORE_BRIDGE_VERSION} | Per-symbol snapshots |`,
        `| UL-03.2 UI | ${UI_LAYER_VERSION} | PA + single ESM hint |`,
      ].join('\n'),
    ),
    mdSection(
      'Tests',
      ctx.testCount != null
        ? `Documented test baseline: **${ctx.testCount}**`
        : '_Run vitest for current count._',
    ),
    mdSection(
      'Account History',
      ctx.accountHistory.length > 0
        ? mdJsonBlock(ctx.accountHistory.slice(-30)).trimEnd()
        : '_No account history points._',
    ),
    '# Architecture Version Matrix',
    '',
    formatArchitectureVersionMatrix(buildArchitectureVersionMatrix(ctx.generatedAt)),
    '',
    '# Feature Flags',
    '',
    formatFeatureFlagSummary(
      resolveRuntimeFeatureFlags({
        esmBridge: ctx.esmBridge,
        journalEntryCount: ctx.journalEntries.length,
      }),
    ),
    '---',
    '',
    '## End Report',
    '',
    '_Upload this file to ChatGPT, Claude, Gemini, or Cursor for architecture/code review._',
    '',
  ];

  return sections.join('\n');
}
