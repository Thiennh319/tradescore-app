/**
 * TASK 17.x — AI Review Export Markdown helpers.
 *
 * Self-contained formatter for the AI Review Export layer. Independent of
 * the Phase 16 aiExport module. Never emits the literal "undefined" /
 * "null" — missing data always renders as UNAVAILABLE. No JSON dump,
 * no object stringify.
 */

export type ReviewScalar = string | number | boolean | null | undefined;

export const UNAVAILABLE = 'UNAVAILABLE';

/** Format one scalar for Markdown output. Missing/invalid → UNAVAILABLE. */
export function fmt(value: ReviewScalar): string {
  if (value === null || value === undefined) return UNAVAILABLE;
  if (typeof value === 'boolean') return value ? 'YES' : 'NO';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : UNAVAILABLE;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : UNAVAILABLE;
}

/** `Label: value` line with UNAVAILABLE fallback. */
export function kv(label: string, value: ReviewScalar): string {
  return `${label}: ${fmt(value)}`;
}

/** Markdown table. Empty rows render a single UNAVAILABLE row. */
export function table(
  headers: readonly string[],
  rows: readonly (readonly ReviewScalar[])[],
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
