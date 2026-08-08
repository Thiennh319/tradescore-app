/**
 * V4.1 RC3 ViewModel — contract giữa Core wire và UI.
 * UI chỉ render model này (Rule #11).
 */

import type { V41AdvisorActionCode, V41AdvisorReasonCode } from './adviserMetadata';
import type { V41AdviserHistoryEntry } from './tradeSessionAdviserTypes';

export type { V41AdvisorActionCode, V41AdvisorReasonCode } from './adviserMetadata';
export type { V41AdviserHistoryEntry } from './tradeSessionAdviserTypes';

export type V41TriggerType =
  | 'Trend Reversal'
  | 'Volatility Explosion'
  | 'Fake Breakout'
  /** Donchian Confirm B (+ ATR SL) — strategy adapter; not Fake Breakout. */
  | 'Breakout Confirmed';

export type V41DecisionUi = 'LONG' | 'SHORT' | 'WATCH' | 'IGNORE';

export type V41ChecklistItem = {
  id: string;
  label: string;
  passed: boolean;
};

/**
 * Tóm tắt gate Trend Reversal legacy (UI only — không tính lại engine).
 * ACTIVE thật = signalsPassed ≥ signalsRequired AND confidenceTr ≥ confidenceMin.
 */
export type V41TrGateSummaryUi = {
  signalsPassed: number;
  /** TREND_REVERSAL_ACTIVE_MIN_SIGNALS (hiện = 3). */
  signalsRequired: number;
  signalsTotal: number;
  confidenceTr: number | null;
  /** TREND_REVERSAL_CONFIDENCE_MIN (hiện = 50). */
  confidenceMin: number;
  signalsMet: boolean;
  confidenceMet: boolean;
  /** Cả hai điều kiện gate đồng thời. */
  activeEligible: boolean;
};

export type V41TradeLevelsUi = {
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: number;
};

export type V41Rc3SignalCardModel = {
  symbol: string;
  displayName: string;
  triggerType: V41TriggerType | null;
  /** Confidence từ Decision/Confidence engine (lớp tổng hợp) — không phải ngưỡng TR gate. */
  confidence: number | null;
  /** Gate TR legacy: ≥3/4 signal + confidenceTR ≥ min. */
  gate: V41TrGateSummaryUi;
  checklist: V41ChecklistItem[];
  levels: V41TradeLevelsUi | null;
  decision: V41DecisionUi;
  /** Timestamp Market Snapshot (`fetchedAt`) — UI hiển thị Last Scan / Age. */
  fetchedAt?: number | null;
};

export type V41TradeSessionStatus =
  | 'Pending'
  | 'Running'
  | 'TP Hit'
  | 'SL Hit'
  | 'Closed';

export type V41TradeSessionAdvisor =
  | 'Waiting Fill'
  | 'Hold'
  | 'Move SL'
  | 'Scale Out'
  | 'Close';

export type V41TradeSession = {
  id: string;
  symbol: string;
  displayName: string;
  action: 'LONG' | 'SHORT';
  status: V41TradeSessionStatus;
  entry: number;
  current: number;
  pnl: number | null;
  /** UI label — Journal/AI dùng advisorActionCode. */
  advisor: V41TradeSessionAdvisor;
  advisorActionCode: V41AdvisorActionCode;
  advisorReason: string;
  advisorReasonCode: V41AdvisorReasonCode;
  /** ISO-8601 UTC — Journal lưu UTC; UI format local. */
  advisorUpdatedAt: string | null;
  /** Tăng khi advisorActionCode đổi. */
  advisorSequence: number;
  /** Append-only — Journal không ghi đè. */
  advisorHistory: V41AdviserHistoryEntry[];
  stop: number;
  tp: number;
  tp2?: number;
  tp3?: number;
  openedAt: number;
  triggerType: V41TriggerType | null;
};

export const V41_RC3_SYMBOLS = [
  'BTCUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'NEARUSDT',
  'XRPUSDT',
] as const;

export function symbolDisplayName(symbol: string): string {
  return symbol.replace(/USDT$/i, '');
}
