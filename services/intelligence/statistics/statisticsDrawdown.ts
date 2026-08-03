/**
 * Task 14.2 — Drawdown + streaks (TI View equity path only).
 */

import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import type { StatisticsDrawdownMetrics } from './statisticsTypes';

function sortByExit(entries: readonly AiTradeJournalEntry[]): AiTradeJournalEntry[] {
  return [...entries].sort(
    (a, b) => (a.outcome.exitTimestamp ?? a.timestamp) - (b.outcome.exitTimestamp ?? b.timestamp),
  );
}

export function computeDrawdownMetrics(
  eligible: readonly AiTradeJournalEntry[],
  netPnlUsdt: number | null,
): StatisticsDrawdownMetrics {
  const closed = sortByExit(eligible);
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  let any = false;
  let winStreak = 0;
  let loseStreak = 0;
  let longestWin = 0;
  let longestLose = 0;

  for (const e of closed) {
    const pnl = e.outcome.pnlUSDT;
    if (pnl != null && Number.isFinite(pnl)) {
      any = true;
      equity += pnl;
      peak = Math.max(peak, equity);
      maxDd = Math.max(maxDd, peak - equity);
    }
    if (e.outcome.status === 'WIN') {
      winStreak += 1;
      loseStreak = 0;
      longestWin = Math.max(longestWin, winStreak);
    } else if (e.outcome.status === 'LOSS') {
      loseStreak += 1;
      winStreak = 0;
      longestLose = Math.max(longestLose, loseStreak);
    } else {
      winStreak = 0;
      loseStreak = 0;
    }
  }

  const currentDd = any ? Math.max(0, peak - equity) : null;
  const recoveryFactor =
    maxDd > 0 && netPnlUsdt != null && Number.isFinite(netPnlUsdt)
      ? netPnlUsdt / maxDd
      : null;

  return {
    currentDrawdownUsdt: currentDd,
    maxDrawdownUsdt: any ? maxDd : null,
    recoveryFactor,
    longestLosingStreak: longestLose,
    longestWinningStreak: longestWin,
  };
}
