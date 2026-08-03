/**
 * Task 14.2 — Shared grouping key extractors (một Aggregator).
 */

import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { actionCodeToLabel } from '../shared/actionLabels';
import { parseProjectedTags } from '../parseProjectedTags';

export { actionCodeToLabel };

export function coinKey(e: AiTradeJournalEntry): string {
  return e.symbol.replace(/USDT$/i, '') || 'UNKNOWN';
}

export function strategyKey(e: AiTradeJournalEntry): string {
  const meta = parseProjectedTags(e);
  const raw = (meta.strategyVersion ?? e.strategySource ?? 'UNKNOWN').toUpperCase();
  if (raw.includes('4.1') || raw.includes('4_1') || raw === 'V4_1') return 'V4.1';
  if (raw.includes('V4') || raw === '4') return 'V4';
  if (raw.includes('V3') || raw === '3') return 'V3';
  return raw;
}

export function triggerKey(e: AiTradeJournalEntry): string {
  return parseProjectedTags(e).triggerCode ?? 'UNKNOWN';
}

/** Low / Medium / High — verifies Confidence Engine snapshots only. */
export function confidenceKey(e: AiTradeJournalEntry): string {
  const meta = parseProjectedTags(e);
  const c = meta.confidence ?? e.scoring.score ?? null;
  if (c == null || !Number.isFinite(c)) return 'NA';
  // Support both 0–1 and 0–10 style scores from TI View
  if (c <= 1) {
    if (c < 0.4) return 'Low';
    if (c < 0.7) return 'Medium';
    return 'High';
  }
  if (c < 5) return 'Low';
  if (c < 8) return 'Medium';
  return 'High';
}

export function fundingKey(e: AiTradeJournalEntry): string {
  const f = e.fundingAtEntry ?? e.market.fundingRate;
  if (f == null || !Number.isFinite(f)) return 'NA';
  if (f > 0.05) return 'HIGH_POS';
  if (f > 0) return 'POS';
  if (f < -0.05) return 'HIGH_NEG';
  if (f < 0) return 'NEG';
  return 'ZERO';
}

export function whaleKey(e: AiTradeJournalEntry): string {
  const r = e.market.topTraderRatio;
  if (!Number.isFinite(r)) return 'NA';
  if (r >= 1.2) return 'LONG_HEAVY';
  if (r <= 0.8) return 'SHORT_HEAVY';
  return 'BALANCED';
}

export function sessionTypeKey(e: AiTradeJournalEntry): string {
  return e.market.sessionType || 'UNKNOWN';
}

/** Asian / London / New York from hourVN stored on TI View. */
export function sessionZoneKey(e: AiTradeJournalEntry): string {
  const h = e.market.hourVN;
  if (h == null || !Number.isFinite(h)) return 'UNKNOWN';
  if (h >= 7 && h < 14) return 'Asian';
  if (h >= 14 && h < 20) return 'London';
  return 'New York';
}

export function tradeTimeMs(e: AiTradeJournalEntry): number {
  return e.outcome.exitTimestamp ?? e.timestamp;
}

export function dayKey(e: AiTradeJournalEntry): string {
  const d = new Date(tradeTimeMs(e));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function weekKey(e: AiTradeJournalEntry): string {
  const d = new Date(tradeTimeMs(e));
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function monthKey(e: AiTradeJournalEntry): string {
  const d = new Date(tradeTimeMs(e));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function advisorBucketLabel(actionCode: string): string {
  return actionCodeToLabel(actionCode);
}

export const FOCUS_COINS = ['BTC', 'SOL', 'BNB', 'NEAR'] as const;

export const TAG_COMBOS: readonly (readonly string[])[] = [
  ['trend', 'funding'],
  ['trend', 'whale'],
  ['funding', 'btc-leading'],
];
