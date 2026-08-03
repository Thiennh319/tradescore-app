/**
 * TASK 16.0 — Global Markdown document template.
 *
 * Every exported file uses the exact same layout:
 * Metadata → INPUT → ANALYSIS → DECISION → OUTPUT → CHECKLIST →
 * WARNINGS → NOTES → AI REVIEW.
 *
 * Pure and deterministic: no Date.now(), no random, no side effects.
 * The generated time comes from the caller-provided metadata.
 */

import { kv, linesOrUnavailable } from '../formatters/markdown';
import type { AiDocumentBody, AiExportMetadata } from '../types';

export const SECTION_DIVIDER = '--------------------------------';

const DOCUMENT_FORMAT_VERSION = '1';
export const AI_EXPORT_VERSION = '1.0.0';

function metadataLines(title: string, metadata: AiExportMetadata | null | undefined): string[] {
  const m = metadata ?? {};
  return [
    `# Metadata`,
    '',
    kv('Document', title),
    kv('Version', m.version ?? DOCUMENT_FORMAT_VERSION),
    kv('Export Version', m.exportVersion ?? AI_EXPORT_VERSION),
    kv('Trade ID', m.tradeId),
    kv('Generated Time', m.generatedAt),
    kv('Engine Version', m.engineVersion),
    kv('Analytics Version', m.analyticsVersion),
    kv('Rule Version', m.ruleVersion),
    kv('Entry Version', m.entryVersion),
    kv('Position Adviser Version', m.positionAdviserVersion),
    kv('Coin', m.coin),
    kv('Side', m.side),
  ];
}

function section(heading: string, lines: readonly string[]): string[] {
  return [SECTION_DIVIDER, '', `# ${heading}`, '', ...linesOrUnavailable(lines)];
}

/**
 * AI REVIEW CHECKLIST — fixed question prompts for the reviewing AI.
 * Answers are intentionally left as "YES / NO" prompts: the framework
 * exports evidence, the AI reviewer fills in the verdicts.
 */
function aiReviewLines(): string[] {
  return [
    'AI REVIEW CHECKLIST',
    '',
    '- Rule conflict? YES / NO',
    '- Missing Evidence? YES / NO',
    '- Priority conflict? YES / NO',
    '- Hard Block correct? YES / NO',
    '- Decision reasonable? YES / NO',
    '- Need Optimization? YES / NO',
    '',
    'Notes:',
    '...',
  ];
}

/** Assemble one standard AI Export document as a Markdown string. */
export function buildAiDocument(
  title: string,
  metadata: AiExportMetadata | null | undefined,
  body: AiDocumentBody,
): string {
  const lines = [
    ...metadataLines(title, metadata),
    '',
    ...section('INPUT', body.input),
    '',
    ...section('ANALYSIS', body.analysis),
    '',
    ...section('DECISION', body.decision),
    '',
    ...section('OUTPUT', body.output),
    '',
    ...section('CHECKLIST', body.checklist),
    '',
    ...section('WARNINGS', body.warnings),
    '',
    ...section('NOTES', body.notes),
    '',
    ...section('AI REVIEW', aiReviewLines()),
    '',
  ];
  return lines.join('\n');
}
