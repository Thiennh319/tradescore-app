/**
 * TASK 16.0 — Domain builders (Public API).
 *
 * Each builder returns Markdown for exactly one domain file.
 * buildAiExport() assembles the full AI_EXPORT folder content:
 * README.md + 10 domain files. The framework never writes to disk —
 * callers receive strings and decide where to persist them.
 *
 * Pure, readonly, deterministic. No Date.now(), no random, no console.
 */

import {
  adaptEntryQuality,
  adaptJournal,
  adaptMarketSnapshot,
  adaptPositionAdviser,
  adaptRuleBook,
  adaptScoreEngine,
  adaptSignalDecision,
  adaptSummary,
  adaptTradePlan,
  adaptUlAnalytics,
} from '../adapters/domainAdapters';
import { AI_EXPORT_VERSION, buildAiDocument } from '../templates/aiDocumentTemplate';
import type { AiExportFile, AiExportInput, AiExportResult } from '../types';

export const AI_EXPORT_FILE_NAMES = {
  readme: 'README.md',
  ruleBook: '01_RULEBOOK.md',
  scoreEngine: '02_SCORE_ENGINE.md',
  entryQuality: '03_ENTRY_QUALITY.md',
  positionAdviser: '04_POSITION_ADVISER.md',
  tradePlan: '05_TRADE_PLAN.md',
  marketSnapshot: '06_MARKET_SNAPSHOT.md',
  signalDecision: '07_SIGNAL_DECISION.md',
  ulAnalytics: '08_UL_ANALYTICS.md',
  journal: '09_JOURNAL.md',
  summary: '10_SUMMARY.md',
} as const;

export function buildRuleExport(input: AiExportInput): string {
  return buildAiDocument('RULEBOOK', input.metadata, adaptRuleBook(input.ruleBook));
}

export function buildScoreExport(input: AiExportInput): string {
  return buildAiDocument('SCORE ENGINE', input.metadata, adaptScoreEngine(input.scoreEngine));
}

export function buildEntryExport(input: AiExportInput): string {
  return buildAiDocument('ENTRY QUALITY', input.metadata, adaptEntryQuality(input.entryQuality));
}

export function buildAdvisorExport(input: AiExportInput): string {
  return buildAiDocument(
    'POSITION ADVISER',
    input.metadata,
    adaptPositionAdviser(input.positionAdviser),
  );
}

export function buildTradePlanExport(input: AiExportInput): string {
  return buildAiDocument('TRADE PLAN', input.metadata, adaptTradePlan(input.tradePlan));
}

export function buildMarketSnapshotExportMd(input: AiExportInput): string {
  return buildAiDocument(
    'MARKET SNAPSHOT',
    input.metadata,
    adaptMarketSnapshot(input.marketSnapshot),
  );
}

export function buildSignalDecisionExport(input: AiExportInput): string {
  return buildAiDocument(
    'SIGNAL DECISION',
    input.metadata,
    adaptSignalDecision(input.signalDecision),
  );
}

export function buildUlAnalyticsExport(input: AiExportInput): string {
  return buildAiDocument('UL ANALYTICS', input.metadata, adaptUlAnalytics(input.ulAnalytics));
}

export function buildJournalExport(input: AiExportInput): string {
  return buildAiDocument('JOURNAL', input.metadata, adaptJournal(input.journal));
}

export function buildSummaryExport(input: AiExportInput): string {
  return buildAiDocument('SUMMARY', input.metadata, adaptSummary(input.summary, input));
}

/** README.md — reading order, file meaning, export flow. */
export function buildReadmeExport(): string {
  return [
    '# AI EXPORT — TradeScore Review Package',
    '',
    `Export Version: ${AI_EXPORT_VERSION}`,
    '',
    'This folder is generated for AI reviewers (Claude, ChatGPT, Gemini, Grok...).',
    'It is NOT a user-facing report. Every file follows the same structure:',
    'Metadata / INPUT / ANALYSIS / DECISION / OUTPUT / CHECKLIST / WARNINGS / NOTES / AI REVIEW.',
    '',
    'All values are frozen snapshots copied from the engines — nothing is',
    'recalculated. Missing data is marked UNAVAILABLE, never invented.',
    '',
    '## Reading Order (recommended)',
    '',
    '1. `06_MARKET_SNAPSHOT.md` — raw market inputs the rules evaluated',
    '2. `01_RULEBOOK.md` — every rule with status, score and reason',
    '3. `02_SCORE_ENGINE.md` — layer and group scores, final grade',
    '4. `07_SIGNAL_DECISION.md` — decision flow, hard blocks, confidence',
    '5. `03_ENTRY_QUALITY.md` — entry checks and verdict',
    '6. `05_TRADE_PLAN.md` — entry / stop / targets / risk-reward',
    '7. `04_POSITION_ADVISER.md` — advice for the open position',
    '8. `08_UL_ANALYTICS.md` — historical performance metrics',
    '9. `09_JOURNAL.md` — past trade evidence',
    '10. `10_SUMMARY.md` — overall verdict and open questions',
    '',
    '## File Meaning',
    '',
    '| File | Domain |',
    '| --- | --- |',
    '| 01_RULEBOOK.md | Rule evaluation matrix |',
    '| 02_SCORE_ENGINE.md | Layer / group scoring |',
    '| 03_ENTRY_QUALITY.md | Entry quality checks |',
    '| 04_POSITION_ADVISER.md | Position advice |',
    '| 05_TRADE_PLAN.md | Trade plan levels |',
    '| 06_MARKET_SNAPSHOT.md | Raw market inputs |',
    '| 07_SIGNAL_DECISION.md | Decision replay |',
    '| 08_UL_ANALYTICS.md | Analytics metrics |',
    '| 09_JOURNAL.md | Journal history |',
    '| 10_SUMMARY.md | Aggregated summary |',
    '',
    '## Export Flow',
    '',
    'Trade Engine -> RuleBook -> Analytics -> Export Adapter -> Markdown Builder -> AI Export Folder',
    '',
    'The export layer is read-only: engines are never modified and no',
    'indicator is recalculated. One file = one domain, never mixed.',
    '',
    '## How to Review',
    '',
    'Answer the AI REVIEW CHECKLIST at the end of each file:',
    'rule conflicts, missing evidence, priority conflicts, hard block',
    'correctness, decision reasonableness, and optimization needs.',
    '',
  ].join('\n');
}

/** Build the complete AI_EXPORT package (README + 10 domain files). */
export function buildAiExport(input: AiExportInput): AiExportResult {
  const files: AiExportFile[] = [
    { fileName: AI_EXPORT_FILE_NAMES.readme, markdown: buildReadmeExport() },
    { fileName: AI_EXPORT_FILE_NAMES.ruleBook, markdown: buildRuleExport(input) },
    { fileName: AI_EXPORT_FILE_NAMES.scoreEngine, markdown: buildScoreExport(input) },
    { fileName: AI_EXPORT_FILE_NAMES.entryQuality, markdown: buildEntryExport(input) },
    { fileName: AI_EXPORT_FILE_NAMES.positionAdviser, markdown: buildAdvisorExport(input) },
    { fileName: AI_EXPORT_FILE_NAMES.tradePlan, markdown: buildTradePlanExport(input) },
    { fileName: AI_EXPORT_FILE_NAMES.marketSnapshot, markdown: buildMarketSnapshotExportMd(input) },
    { fileName: AI_EXPORT_FILE_NAMES.signalDecision, markdown: buildSignalDecisionExport(input) },
    { fileName: AI_EXPORT_FILE_NAMES.ulAnalytics, markdown: buildUlAnalyticsExport(input) },
    { fileName: AI_EXPORT_FILE_NAMES.journal, markdown: buildJournalExport(input) },
    { fileName: AI_EXPORT_FILE_NAMES.summary, markdown: buildSummaryExport(input) },
  ];
  return { version: 1, files };
}
