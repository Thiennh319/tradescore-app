/**
 * TASK 16.0 — Markdown formatters.
 *
 * Pure helpers converting frozen scalar values into readable Markdown.
 * Never outputs the literal strings "undefined" / "null" — missing data
 * always renders as UNAVAILABLE. No JSON dump, no object stringify.
 */

import type { AiExportScalar } from '../types';

export const UNAVAILABLE = 'UNAVAILABLE';

/**
 * TASK 18.6.3 — export display convention: at most 2 decimal places.
 * Display-only; does not change engine/group math.
 */
export function roundExport2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Format score-like scalars (Group Score, Raw Sum*, Decision Total, …)
 * with at most 2 decimal places. Missing/invalid → UNAVAILABLE.
 */
export function fmtExportScore2(value: AiExportScalar): string {
  if (value === null || value === undefined) return UNAVAILABLE;
  if (typeof value === 'boolean') return value ? 'YES' : 'NO';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(roundExport2(value)) : UNAVAILABLE;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : UNAVAILABLE;
}

/** Format one scalar for Markdown output. Missing/invalid → UNAVAILABLE. */
export function fmt(value: AiExportScalar): string {
  if (value === null || value === undefined) return UNAVAILABLE;
  if (typeof value === 'boolean') return value ? 'YES' : 'NO';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : UNAVAILABLE;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : UNAVAILABLE;
}

/** `Label: value` line with UNAVAILABLE fallback. */
export function kv(label: string, value: AiExportScalar): string {
  return `${label}: ${fmt(value)}`;
}

/** Bullet list; empty/missing input renders a single UNAVAILABLE bullet. */
export function bullets(values: readonly AiExportScalar[] | null | undefined): string[] {
  if (!values || values.length === 0) return [`- ${UNAVAILABLE}`];
  return values.map((v) => `- ${fmt(v)}`);
}

/** Markdown table. Empty rows render a single UNAVAILABLE row. */
export function table(
  headers: readonly string[],
  rows: readonly (readonly AiExportScalar[])[],
): string[] {
  const headerLine = `| ${headers.join(' | ')} |`;
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`;
  if (rows.length === 0) {
    const emptyRow = `| ${headers.map(() => UNAVAILABLE).join(' | ')} |`;
    return [headerLine, dividerLine, emptyRow];
  }
  const body = rows.map((row) => `| ${row.map(fmt).join(' | ')} |`);
  return [headerLine, dividerLine, ...body];
}

/** Section lines or an UNAVAILABLE placeholder when the section is empty. */
export function linesOrUnavailable(lines: readonly string[]): string[] {
  return lines.length > 0 ? [...lines] : [UNAVAILABLE];
}
