/**
 * V4.1 analytics — read-only aggregation from AI journal entries.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import type { MarketState } from './types';

const MARKET_STATES: MarketState[] = [
  'StrongUptrend',
  'HealthyUptrend',
  'LateUptrend',
  'Distribution',
  'Accumulation',
  'WeakDowntrend',
  'StrongDowntrend',
  'Transition',
];

const MIN_STATE_SAMPLE = 3;

export interface V41StateStats {
  count: number;
  wins: number;
  winRate: number;
}

export interface V41LabelStats {
  count: number;
  wins: number;
  winRate: number;
}

export interface V41Analytics {
  totalTrades: number;
  winRate: number;
  avgEntryQuality: number;
  avgConfidence: number;
  byMarketState: Record<MarketState, V41StateStats>;
  byQualityLabel: Record<string, V41LabelStats>;
  avgRR: number;
  bestMarketState: MarketState | null;
  worstMarketState: MarketState | null;
}

interface V41SnapshotPayload {
  marketState?: MarketState;
  marketConfidence?: number;
  entryQuality?: number;
  qualityLabel?: string;
  riskRewardRatio?: number;
}

interface ParsedV41Entry {
  entry: AiTradeJournalEntry;
  win: boolean;
  marketState: MarketState;
  entryQuality: number;
  marketConfidence: number;
  qualityLabel: string;
  riskRewardRatio: number;
}

function emptyStateStats(): V41StateStats {
  return { count: 0, wins: 0, winRate: 0 };
}

function emptyAnalytics(): V41Analytics {
  const byMarketState = {} as Record<MarketState, V41StateStats>;
  for (const state of MARKET_STATES) {
    byMarketState[state] = emptyStateStats();
  }
  return {
    totalTrades: 0,
    winRate: 0,
    avgEntryQuality: 0,
    avgConfidence: 0,
    byMarketState,
    byQualityLabel: {},
    avgRR: 0,
    bestMarketState: null,
    worstMarketState: null,
  };
}

export function isV41JournalEntry(entry: AiTradeJournalEntry): boolean {
  const scorerVersion = entry.scoring.scorerVersion as string | undefined;
  return scorerVersion === 'v41' || entry.tags?.includes('v41') === true;
}

function parseTagValue(tags: string[], prefix: string): string | null {
  const tag = tags.find((t) => t.startsWith(prefix));
  if (!tag) return null;
  return tag.slice(prefix.length);
}

function parseV41Snapshot(tags: string[]): V41SnapshotPayload | null {
  const raw = parseTagValue(tags, 'v41Snapshot:');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as V41SnapshotPayload;
  } catch {
    return null;
  }
}

function isMarketState(value: string | undefined | null): value is MarketState {
  return value != null && (MARKET_STATES as string[]).includes(value);
}

function isJournalWin(entry: AiTradeJournalEntry): boolean {
  if (entry.outcome.status === 'WIN') return true;
  const pnl = entry.outcome.pnlUSDT;
  return pnl != null && Number.isFinite(pnl) && pnl > 0;
}

function resolveMarketState(
  entry: AiTradeJournalEntry,
  snapshot: V41SnapshotPayload | null,
): MarketState {
  if (isMarketState(snapshot?.marketState)) return snapshot.marketState;
  const tagState = parseTagValue(entry.tags ?? [], 'marketStateV41:');
  if (isMarketState(tagState)) return tagState;
  if (isMarketState(entry.scoring.marketState)) return entry.scoring.marketState;
  return 'Transition';
}

function resolveEntryQuality(
  entry: AiTradeJournalEntry,
  snapshot: V41SnapshotPayload | null,
): number {
  if (snapshot?.entryQuality != null && Number.isFinite(snapshot.entryQuality)) {
    return snapshot.entryQuality;
  }
  const tagEq = parseTagValue(entry.tags ?? [], 'entryQualityV41:');
  if (tagEq != null) {
    const parsed = Number(tagEq);
    if (Number.isFinite(parsed)) return parsed;
  }
  return entry.scoring.score ?? entry.scoring.totalScore ?? 0;
}

function resolveMarketConfidence(
  entry: AiTradeJournalEntry,
  snapshot: V41SnapshotPayload | null,
): number {
  if (snapshot?.marketConfidence != null && Number.isFinite(snapshot.marketConfidence)) {
    return snapshot.marketConfidence;
  }
  const tagMc = parseTagValue(entry.tags ?? [], 'confidenceV41:');
  if (tagMc != null) {
    const parsed = Number(tagMc);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function resolveQualityLabel(
  entry: AiTradeJournalEntry,
  snapshot: V41SnapshotPayload | null,
): string {
  const label = snapshot?.qualityLabel ?? entry.scoring.recommendationLabel;
  const trimmed = label?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Unknown';
}

function resolveRiskRewardRatio(
  entry: AiTradeJournalEntry,
  snapshot: V41SnapshotPayload | null,
): number {
  if (snapshot?.riskRewardRatio != null && Number.isFinite(snapshot.riskRewardRatio)) {
    return snapshot.riskRewardRatio;
  }
  const rr = entry.plan.rrProposed;
  return rr != null && Number.isFinite(rr) ? rr : 0;
}

function parseV41Entry(entry: AiTradeJournalEntry): ParsedV41Entry {
  const snapshot = parseV41Snapshot(entry.tags ?? []);
  return {
    entry,
    win: isJournalWin(entry),
    marketState: resolveMarketState(entry, snapshot),
    entryQuality: resolveEntryQuality(entry, snapshot),
    marketConfidence: resolveMarketConfidence(entry, snapshot),
    qualityLabel: resolveQualityLabel(entry, snapshot),
    riskRewardRatio: resolveRiskRewardRatio(entry, snapshot),
  };
}

function updateGroupStats<T extends V41StateStats | V41LabelStats>(
  bucket: T,
  win: boolean,
): T {
  const count = bucket.count + 1;
  const wins = bucket.wins + (win ? 1 : 0);
  return {
    ...bucket,
    count,
    wins,
    winRate: count > 0 ? Math.round((wins / count) * 1000) / 10 : 0,
  };
}

function pickExtremeMarketState(
  byMarketState: Record<MarketState, V41StateStats>,
  mode: 'best' | 'worst',
): MarketState | null {
  let selected: MarketState | null = null;
  let selectedRate = mode === 'best' ? -Infinity : Infinity;

  for (const state of MARKET_STATES) {
    const stats = byMarketState[state];
    if (stats.count < MIN_STATE_SAMPLE) continue;
    if (mode === 'best' && stats.winRate > selectedRate) {
      selected = state;
      selectedRate = stats.winRate;
    }
    if (mode === 'worst' && stats.winRate < selectedRate) {
      selected = state;
      selectedRate = stats.winRate;
    }
  }

  return selected;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

export function computeV41Analytics(journalEntries: AiTradeJournalEntry[]): V41Analytics {
  const v41Entries = journalEntries.filter(isV41JournalEntry).map(parseV41Entry);
  if (v41Entries.length === 0) return emptyAnalytics();

  const byMarketState = emptyAnalytics().byMarketState;
  const byQualityLabel: Record<string, V41LabelStats> = {};

  let wins = 0;
  const entryQualities: number[] = [];
  const confidences: number[] = [];
  const riskRewards: number[] = [];

  for (const parsed of v41Entries) {
    if (parsed.win) wins += 1;
    entryQualities.push(parsed.entryQuality);
    confidences.push(parsed.marketConfidence);
    riskRewards.push(parsed.riskRewardRatio);

    byMarketState[parsed.marketState] = updateGroupStats(
      byMarketState[parsed.marketState],
      parsed.win,
    );

    const labelBucket = byQualityLabel[parsed.qualityLabel] ?? emptyStateStats();
    byQualityLabel[parsed.qualityLabel] = updateGroupStats(labelBucket, parsed.win);
  }

  const totalTrades = v41Entries.length;

  return {
    totalTrades,
    winRate: Math.round((wins / totalTrades) * 1000) / 10,
    avgEntryQuality: average(entryQualities),
    avgConfidence: average(confidences),
    byMarketState,
    byQualityLabel,
    avgRR: average(riskRewards),
    bestMarketState: pickExtremeMarketState(byMarketState, 'best'),
    worstMarketState: pickExtremeMarketState(byMarketState, 'worst'),
  };
}

export function formatV41AnalyticsSummary(analytics: V41Analytics): string[] {
  const lines = [
    `Tổng lệnh V4.1: ${analytics.totalTrades}`,
    `Win rate: ${analytics.winRate}%`,
    `EQ trung bình: ${analytics.avgEntryQuality}/100`,
  ];

  if (analytics.bestMarketState) {
    const stats = analytics.byMarketState[analytics.bestMarketState];
    lines.push(
      `Market state tốt nhất: ${analytics.bestMarketState} (${stats.winRate}% · ${stats.count} lệnh)`,
    );
  } else {
    lines.push('Market state tốt nhất: —');
  }

  lines.push(`R:R trung bình: ${analytics.avgRR.toFixed(1)}×`);

  return lines;
}
