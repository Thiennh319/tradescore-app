/**
 * Task 14.1 / 14.1.1 — AI Summary (Rule #51 + #59 + #64).
 * Narrative logic unchanged — chỉ metadata summaryVersion + tagsRead.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { parseProjectedTags } from './parseProjectedTags';
import type {
  JournalAiSummaryResult,
  JournalEvidenceItem,
  JournalOutcomeAnalysisResult,
  JournalRootCauseResult,
} from './types';

/** Rule #64 — bump when summary narrative formula changes in a future task */
export const AI_SUMMARY_VERSION = 1 as const;

export function buildJournalAiSummary(
  entry: AiTradeJournalEntry,
  outcome: JournalOutcomeAnalysisResult,
  rootCause: JournalRootCauseResult,
  evidence: readonly JournalEvidenceItem[],
  /** AI may read tags — must not create tags */
  tradeTags: readonly string[] = [],
): JournalAiSummaryResult {
  const meta = parseProjectedTags(entry);
  const ids = evidence.map((e) => e.id);
  const tagsRead = [...tradeTags];
  const lines: string[] = [];

  if (entry.outcome.status === 'WIN') {
    lines.push('Trade này thắng vì:');
    if (entry.market.cvdTrend === 'UP' || entry.market.cvdTrend === 'DOWN') {
      lines.push(`• Trend (CVD ${entry.market.cvdTrend}).`);
    }
    if (Math.abs(entry.market.fundingRate) > 0.001) {
      lines.push(`• Funding ${entry.market.fundingRate >= 0 ? 'hỗ trợ / tích cực' : 'âm'} (${entry.market.fundingRate}).`);
    }
    if (entry.market.topTraderRatio >= 1.1) {
      lines.push('• Whale / top trader nghiêng mua.');
    } else if (entry.market.topTraderRatio <= 0.9) {
      lines.push('• Whale / top trader nghiêng bán (khớp SHORT nếu có).');
    }
    const moveSl = meta.adviserTimeline.find((s) =>
      s.advisorActionCode.includes('MOVE_SL') || s.advisorActionCode === 'TRAILING_STOP',
    );
    if (moveSl) {
      lines.push(`• Adviser Move SL (${moveSl.advisorReasonCode}).`);
    }
    if (Number.isFinite(entry.plan.rrProposed)) {
      lines.push(`• RR kế hoạch ${entry.plan.rrProposed.toFixed(2)}.`);
    }
    if (lines.length === 1) {
      lines.push(`• Exit ${entry.outcome.exitReason ?? 'WIN'}.`);
    }
  } else if (entry.outcome.status === 'LOSS') {
    lines.push('Trade này thua. Nguyên nhân chính:');
    lines.push(`• [${rootCause.category}] ${rootCause.primary}.`);
    lines.push(`• ${rootCause.detail}.`);
    if (outcome.advisorAccuracy != null && outcome.advisorAccuracy < 50) {
      lines.push('• Adviser alignment thấp so với kết quả.');
    }
  } else if (entry.outcome.status === 'CANCELLED') {
    lines.push(`Trade bị hủy: ${rootCause.primary}.`);
  } else {
    lines.push(
      `Trade ${entry.scoring.direction} đang ${entry.outcome.status}. Trigger=${meta.triggerCode ?? 'n/a'}.`,
    );
  }

  lines.push('Không khuyến nghị đặt lệnh mới từ summary này (Rule #51).');

  return {
    text: lines.join('\n'),
    evidenceIds: ids,
    summaryVersion: AI_SUMMARY_VERSION,
    tagsRead,
  };
}
