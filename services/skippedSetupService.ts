import {
  AI_JOURNAL_APP_VERSION,
  SKIPPED_SETUPS_ARCHIVE_AGE_MS,
  SKIPPED_SETUPS_ARCHIVE_LIMIT,
} from '../constants/aiJournal';
import type { LayerResult, SkipReason, SkippedSetupEntry, TradeDirection } from '../constants/scoring';
import type { SignalRow } from '../services/signalBoardScan';

const TWO_HOURS_MS = 2 * 3_600_000;
const FOUR_HOURS_MS = 4 * 3_600_000;
const MISSED_OPPORTUNITY_PCT = 2;

export interface SkippedSetupStats {
  total: number;
  withFollowUp: number;
  pendingFollowUp: number;
  byReason: Record<SkipReason, number>;
  correctSkips: number;
  missedOpportunities: number;
}

export function newSkippedSetupId(): string {
  return `skip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function computeHypotheticalPnlPct(
  direction: TradeDirection,
  priceAtSkip: number,
  priceAfter4h: number,
): number {
  if (priceAtSkip <= 0 || !Number.isFinite(priceAfter4h)) return 0;
  const raw =
    direction === 'LONG'
      ? ((priceAfter4h - priceAtSkip) / priceAtSkip) * 100
      : ((priceAtSkip - priceAfter4h) / priceAtSkip) * 100;
  return Math.round(raw * 100) / 100;
}

function layerByNumber(layers: LayerResult[], n: number): LayerResult | undefined {
  return layers.find((l) => l.layer === n);
}

function hasCvdDivergenceSignal(row: SignalRow): boolean {
  const cvdPattern = /cvd|phân kỳ|diverg/i;
  if (row.mandatoryViolations.some((v) => cvdPattern.test(v))) return true;
  return row.layers.some(
    (l) =>
      (l.layer === 5 || /cvd/i.test(l.name)) &&
      (cvdPattern.test(l.reason) || (l.score <= 0 && l.isMandatoryViolation)),
  );
}

export function buildSkipReasonDetail(row: SignalRow, skipReason: SkipReason): string {
  if (row.mandatoryViolations.length > 0) {
    return row.mandatoryViolations.join(', ');
  }
  if (skipReason === 'LOW_SCORE') {
    return `Điểm ${row.score.toFixed(1)} < 9`;
  }
  const l9 = layerByNumber(row.layers, 9);
  if (skipReason === 'BAD_SESSION' && l9) {
    return `L9 = ${l9.score.toFixed(1)}đ — ${l9.reason}`;
  }
  if (skipReason === 'CVD_DIVERGENCE') {
    const cvdLayer = row.layers.find((l) => l.layer === 5 || /cvd/i.test(l.name));
    return cvdLayer?.reason ?? 'Phân kỳ CVD';
  }
  return row.decisionDisplay || 'User bỏ qua setup';
}

export function inferSkipReasonFromSignalRow(row: SignalRow): {
  skipReason: SkipReason;
  skipReasonDetail: string;
} {
  let skipReason: SkipReason = 'USER_SKIP';

  if (row.mandatoryViolations.length > 0) {
    skipReason = 'MANDATORY_FAIL';
  } else if (row.score < 9) {
    skipReason = 'LOW_SCORE';
  } else {
    const l9 = layerByNumber(row.layers, 9);
    if (l9 && l9.score <= 0) {
      skipReason = 'BAD_SESSION';
    } else if (hasCvdDivergenceSignal(row)) {
      skipReason = 'CVD_DIVERGENCE';
    }
  }

  return {
    skipReason,
    skipReasonDetail: buildSkipReasonDetail(row, skipReason),
  };
}

/** Giá tại thời điểm bỏ qua — row.price hoặc entry từ trade plan theo hướng. */
export function resolveSkipPriceFromSignalRow(
  row: SignalRow,
  direction?: TradeDirection,
): number | null {
  if (row.price != null && Number.isFinite(row.price)) return row.price;
  const dir = direction ?? row.direction;
  const v4 = row.tradePlansByScorer?.v4;
  const v3 = row.tradePlansByScorer?.v3;
  const plan =
    (v4?.direction === dir ? v4 : null) ??
    (v3?.direction === dir ? v3 : null) ??
    (row.tradePlanV3?.direction === dir ? row.tradePlanV3 : null);
  const entry = plan?.recommendedEntry;
  if (entry != null && Number.isFinite(entry)) return entry;
  return null;
}

export function newSkippedSetupEntry(input: {
  symbol: string;
  direction: TradeDirection;
  totalScore: number;
  skipReason: SkipReason;
  skipReasonDetail: string;
  priceAtSkip: number;
  id?: string;
  timestamp?: number;
}): SkippedSetupEntry {
  return {
    id: input.id ?? newSkippedSetupId(),
    timestamp: input.timestamp ?? Date.now(),
    symbol: input.symbol,
    direction: input.direction,
    totalScore: input.totalScore,
    skipReason: input.skipReason,
    skipReasonDetail: input.skipReasonDetail,
    priceAtSkip: input.priceAtSkip,
    version: AI_JOURNAL_APP_VERSION,
  };
}

export function archiveSkippedSetupsIfNeeded(
  entries: SkippedSetupEntry[],
  now = Date.now(),
): SkippedSetupEntry[] {
  const visible = entries.filter((e) => !e.archived);
  if (visible.length <= SKIPPED_SETUPS_ARCHIVE_LIMIT) return entries;

  const cutoff = now - SKIPPED_SETUPS_ARCHIVE_AGE_MS;
  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  let visibleCount = visible.length;
  const next = sorted.map((entry) => {
    if (entry.archived) return entry;
    if (visibleCount <= SKIPPED_SETUPS_ARCHIVE_LIMIT) return entry;
    if (entry.timestamp < cutoff) {
      visibleCount -= 1;
      return { ...entry, archived: true };
    }
    return entry;
  });

  if (visibleCount > SKIPPED_SETUPS_ARCHIVE_LIMIT) {
    let toArchive = visibleCount - SKIPPED_SETUPS_ARCHIVE_LIMIT;
    return next.map((entry) => {
      if (entry.archived || toArchive <= 0) return entry;
      toArchive -= 1;
      return { ...entry, archived: true };
    });
  }

  return next;
}

export function getVisibleSkippedSetups(entries: SkippedSetupEntry[]): SkippedSetupEntry[] {
  return entries.filter((e) => !e.archived);
}

export function applySkippedPriceUpdate(
  entry: SkippedSetupEntry,
  priceAfter2h?: number,
  priceAfter4h?: number,
): SkippedSetupEntry {
  const next: SkippedSetupEntry = { ...entry };
  if (priceAfter2h != null && Number.isFinite(priceAfter2h)) {
    next.priceAfter2h = priceAfter2h;
  }
  if (priceAfter4h != null && Number.isFinite(priceAfter4h)) {
    next.priceAfter4h = priceAfter4h;
    next.hypotheticalPnlPct = computeHypotheticalPnlPct(
      entry.direction,
      entry.priceAtSkip,
      priceAfter4h,
    );
  }
  return next;
}

export function refreshSkippedSetupMarkPrices(
  entries: SkippedSetupEntry[],
  markPricesBySymbol: Record<string, number>,
  now = Date.now(),
): SkippedSetupEntry[] {
  return entries.map((entry) => {
    if (entry.archived || entry.priceAfter4h != null) return entry;
    const mark = markPricesBySymbol[entry.symbol];
    if (mark == null || !Number.isFinite(mark)) return entry;

    const age = now - entry.timestamp;
    let priceAfter2h = entry.priceAfter2h;
    let priceAfter4h = entry.priceAfter4h;

    if (age >= TWO_HOURS_MS && priceAfter2h == null) {
      priceAfter2h = mark;
    }
    if (age >= FOUR_HOURS_MS && priceAfter4h == null) {
      priceAfter4h = mark;
    }

    if (priceAfter2h === entry.priceAfter2h && priceAfter4h === entry.priceAfter4h) {
      return entry;
    }

    return applySkippedPriceUpdate(entry, priceAfter2h, priceAfter4h);
  });
}

export function getSkippedStats(entries: SkippedSetupEntry[]): SkippedSetupStats {
  const visible = getVisibleSkippedSetups(entries);
  const byReason: Record<SkipReason, number> = {
    MANDATORY_FAIL: 0,
    LOW_SCORE: 0,
    BAD_SESSION: 0,
    CVD_DIVERGENCE: 0,
    USER_SKIP: 0,
    PLAN_EXPIRED: 0,
    MULTI_CONFIRMATION_CANCEL: 0,
  };

  for (const e of visible) {
    byReason[e.skipReason] += 1;
  }

  const withFollowUp = visible.filter((e) => e.priceAfter4h != null);
  let correctSkips = 0;
  let missedOpportunities = 0;

  for (const e of withFollowUp) {
    const pnl = e.hypotheticalPnlPct ?? 0;
    if (pnl < 0) correctSkips += 1;
    if (pnl > MISSED_OPPORTUNITY_PCT) missedOpportunities += 1;
  }

  return {
    total: visible.length,
    withFollowUp: withFollowUp.length,
    pendingFollowUp: visible.length - withFollowUp.length,
    byReason,
    correctSkips,
    missedOpportunities,
  };
}
