/**
 * Task 15.0.1 — Numeric display helpers (USDT / % / RR / Score).
 * Formatting only — analytics still store full precision numbers.
 */

export function formatUsdt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

export function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0.0';
  return n.toFixed(1);
}

export function formatRr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

export function formatScore(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0';
  return String(Math.round(n));
}
