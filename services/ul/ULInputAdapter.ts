/**
 * Task 15.0.1 — Layer 1 Input Adapter.
 * Sanitize invalid trades + stable fingerprint. Pure / non-mutating.
 */

import type { ULTradeInput, UlSide } from './types';

const VALID_SIDES = new Set<UlSide>(['LONG', 'SHORT']);

export function isValidTrade(t: unknown): t is ULTradeInput {
  if (t == null || typeof t !== 'object') return false;
  const o = t as Record<string, unknown>;
  if (typeof o.symbol !== 'string' || o.symbol.trim() === '') return false;
  if (!VALID_SIDES.has(o.side as UlSide)) return false;
  if (!Number.isFinite(o.entry as number)) return false;
  if (!Number.isFinite(o.exit as number)) return false;
  if (!Number.isFinite(o.pnl as number)) return false;
  if (o.rr != null && !Number.isFinite(o.rr as number)) return false;
  if (!Number.isFinite(o.duration as number) || (o.duration as number) < 0) return false;
  if (typeof o.strategy !== 'string') return false;
  if (!Number.isFinite(o.openedAt as number)) return false;
  if (!Number.isFinite(o.closedAt as number)) return false;
  if (typeof o.reasonOpen !== 'string') return false;
  if (typeof o.reasonClose !== 'string') return false;
  return true;
}

/** Drop NaN / Infinity / missing pnl / missing close time. Does not mutate input. */
export function sanitizeTrades(trades: readonly unknown[]): ULTradeInput[] {
  const out: ULTradeInput[] = [];
  for (const t of trades) {
    if (!isValidTrade(t)) continue;
    out.push({
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      entry: t.entry,
      exit: t.exit,
      pnl: t.pnl,
      rr: t.rr != null && t.rr > 0 ? t.rr : null,
      duration: t.duration,
      strategy: t.strategy,
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      reasonOpen: t.reasonOpen,
      reasonClose: t.reasonClose,
    });
  }
  return out;
}

/** FNV-1a 32-bit → hex (deterministic, no crypto). */
export function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function tradeFingerprintPart(t: ULTradeInput): string {
  return [
    t.id ?? '',
    t.symbol,
    t.side,
    t.entry,
    t.exit,
    t.pnl,
    t.rr ?? '',
    t.duration,
    t.strategy,
    t.openedAt,
    t.closedAt,
    t.reasonOpen,
    t.reasonClose,
  ].join('\x1f');
}

/**
 * Stable hash of sanitized trades (order-independent).
 * Empty set → "empty".
 */
export function fingerprintTrades(trades: readonly ULTradeInput[]): string {
  if (trades.length === 0) return 'empty';
  const parts = trades.map(tradeFingerprintPart);
  parts.sort();
  return fnv1aHex(parts.join('\x1e'));
}

export function buildCacheKey(fingerprint: string, version: number): string {
  return `ul:${version}:${fingerprint}`;
}
