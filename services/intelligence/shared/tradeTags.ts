/**
 * Task 14.4.1 — Search-ready trade tags from projected TI View.
 * Shared by Journal Intelligence + Statistics (no reverse imports).
 */

import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { parseProjectedTags } from '../parseProjectedTags';

export function deriveIntelligenceTradeTags(entry: AiTradeJournalEntry): string[] {
  const tags = new Set<string>();
  const meta = parseProjectedTags(entry);
  const dir = (entry.scoring.direction ?? '').toUpperCase();
  if (dir === 'LONG') tags.add('long');
  if (dir === 'SHORT') tags.add('short');

  const status = entry.outcome.status;
  if (status === 'WIN') tags.add('win');
  else if (status === 'LOSS') tags.add('loss');
  else if (status === 'BREAKEVEN') tags.add('break-even');

  const trend = entry.market.cvdTrend;
  if (trend === 'UP' || trend === 'DOWN') tags.add('trend');

  const triggerBlob = `${meta.triggerCode ?? ''} ${entry.plan.openReason ?? ''}`.toLowerCase();
  if (triggerBlob.includes('reversal')) tags.add('reversal');

  if (Math.abs(entry.market.slippage) >= 0.2) tags.add('volatility');
  if (Math.abs(entry.market.fundingRate) > 0.001) tags.add('funding');
  if (entry.market.topTraderRatio >= 1.1 || entry.market.topTraderRatio <= 0.9) {
    tags.add('whale');
  }
  if (Math.abs(entry.market.btcChangePct) >= 0.5) tags.add('btc-leading');

  const c = meta.confidence ?? entry.scoring.score ?? null;
  if (c != null) {
    if (c >= 0.75) tags.add('high-confidence');
    else if (c >= 0.5) tags.add('medium-confidence');
    else tags.add('low-confidence');
  }

  const reason = entry.outcome.exitReason ?? '';
  if (reason === 'TP1_HIT') tags.add('tp1');
  if (reason === 'TP2_HIT') tags.add('tp2');
  if (reason === 'TP3_HIT') tags.add('tp3');
  if (reason.includes('MANUAL')) tags.add('manual-close');

  for (const p of entry.partialCloses ?? []) {
    tags.add('partial-close');
    if (p.partialCloseReason === 'PARTIAL_TP1') tags.add('tp1');
    if (p.partialCloseReason === 'PARTIAL_TP2') tags.add('tp2');
  }

  for (const a of meta.adviserTimeline) {
    if (a.advisorActionCode.includes('MOVE_SL')) tags.add('move-sl');
    if (a.advisorActionCode === 'TRAILING_STOP') tags.add('trailing-stop');
    if (a.advisorActionCode.includes('PARTIAL')) tags.add('partial-close');
  }

  return [...tags].sort();
}
