/**
 * Task 14.1 — Root Cause classification.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { parseProjectedTags } from './parseProjectedTags';
import type { JournalRootCauseResult } from './types';

export function buildJournalRootCause(
  entry: AiTradeJournalEntry,
): JournalRootCauseResult {
  const meta = parseProjectedTags(entry);
  const status = entry.outcome.status;

  if (status === 'CANCELLED') {
    return {
      category: 'System',
      primary: entry.outcome.exitReason ?? 'Cancelled',
      detail: 'Trade cancelled before completion',
    };
  }

  if (status === 'PENDING' || status === 'OPEN') {
    return {
      category: 'Management',
      primary: 'In progress',
      detail: 'No terminal outcome yet',
    };
  }

  if (status === 'LOSS') {
    if (entry.outcome.exitReason === 'SL_HIT') {
      return {
        category: 'Exit',
        primary: 'SL Hit',
        detail: 'Stop loss executed',
      };
    }
    const last = meta.adviserTimeline[meta.adviserTimeline.length - 1];
    if (last?.advisorActionCode === 'HOLD') {
      return {
        category: 'Management',
        primary: 'Held into adverse move',
        detail: `Last adviser ${last.advisorActionCode}/${last.advisorReasonCode}`,
      };
    }
    if ((entry.scoring.mandatoryViolations?.length ?? 0) > 0) {
      return {
        category: 'Entry',
        primary: 'Mandatory checklist violations',
        detail: entry.scoring.mandatoryViolations!.join(', '),
      };
    }
    if (Math.abs(entry.market.fundingRate) > 0.05) {
      return {
        category: 'Market',
        primary: 'Funding pressure',
        detail: `funding=${entry.market.fundingRate}`,
      };
    }
    return {
      category: 'Exit',
      primary: entry.outcome.exitReason ?? 'Loss',
      detail: 'Loss outcome',
    };
  }

  if (status === 'WIN') {
    return {
      category: 'Exit',
      primary: entry.outcome.exitReason ?? 'Take profit / win',
      detail: 'Plan reached favorable exit',
    };
  }

  return {
    category: 'System',
    primary: status,
    detail: 'Unclassified',
  };
}
