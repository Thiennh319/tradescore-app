/**
 * V4.1 Task 11 / 11.1 — Trade Session Position Adviser ViewModel + Journal metadata.
 */

import type {
  V41AdvisorActionCode,
  V41AdvisorReasonCode,
} from './adviserMetadata';
import type { V41TradeSessionAdvisor } from './rc3ViewModelTypes';

/** Một bước trong chuỗi Adviser — Journal append-only. */
export type V41AdviserHistoryEntry = {
  sequence: number;
  advisorActionCode: V41AdvisorActionCode;
  /** Text thân thiện (UI). */
  advisor: V41TradeSessionAdvisor;
  advisorReason: string;
  advisorReasonCode: V41AdvisorReasonCode;
  /** ISO-8601 UTC. */
  advisorUpdatedAt: string;
};

export type V41AdvisorViewModel = {
  state: V41TradeSessionAdvisor;
  advisorActionCode: V41AdvisorActionCode;
  reason: string;
  advisorReasonCode: V41AdvisorReasonCode;
  /** ISO-8601 UTC. */
  updatedAt: string;
};

export type V41SessionAdviserPatch = {
  sessionId: string;
  status?: 'Pending' | 'Running';
  current?: number;
  pnl?: number | null;
  advisor: V41TradeSessionAdvisor;
  advisorActionCode: V41AdvisorActionCode;
  advisorReason: string;
  advisorReasonCode: V41AdvisorReasonCode;
  /** ISO-8601 UTC. */
  advisorUpdatedAt: string;
  advisorSequence: number;
  /** Chỉ set khi action code đổi — store append vào history. */
  historyAppend?: V41AdviserHistoryEntry;
};
