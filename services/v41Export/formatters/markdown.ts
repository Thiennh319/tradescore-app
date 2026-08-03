/**
 * V4.1 Export — Markdown helpers (owned copy).
 * Intentionally duplicated for isolation from aiExport / aiReviewExport.
 */

export type V41ExportScalar = string | number | boolean | null | undefined;

export const UNAVAILABLE = 'UNAVAILABLE';

/** Format one scalar for Markdown. Missing/invalid → UNAVAILABLE. */
export function fmt(value: V41ExportScalar): string {
  if (value === null || value === undefined) return UNAVAILABLE;
  if (typeof value === 'boolean') return value ? 'YES' : 'NO';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : UNAVAILABLE;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : UNAVAILABLE;
}

/** `Label: value` line with UNAVAILABLE fallback. */
export function kv(label: string, value: V41ExportScalar): string {
  return `${label}: ${fmt(value)}`;
}

/** Markdown table. Empty rows → single UNAVAILABLE row. */
export function table(
  headers: readonly string[],
  rows: readonly (readonly V41ExportScalar[])[],
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
