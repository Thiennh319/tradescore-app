import type { TradeDecisionLabel } from '../constants/scoring';

/** Trạng thái vào lệnh cuối — scoring + trade plan hợp lệ. */
export enum FinalEntryStatus {
  ENTRY_VALID = 'ENTRY_VALID',
  WAIT_ENTRY = 'WAIT_ENTRY',
  SCORE_BLOCKED = 'SCORE_BLOCKED',
  GROUP_BLOCKED = 'GROUP_BLOCKED',
  HARD_BLOCKED = 'HARD_BLOCKED',
}

export type ScoringDecisionInput = TradeDecisionLabel;
