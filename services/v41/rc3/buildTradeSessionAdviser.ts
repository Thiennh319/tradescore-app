/**
 * V4.1 Task 11 — Wire Trade Session → Position Adviser → Advisor ViewModel.
 *
 * Gọi `evaluatePositionV41` hiện có — KHÔNG sửa thuật toán.
 * KHÔNG gọi Decision / Planner / Trigger / Confidence / Binance.
 */

import {
  computeCurrentPnlPct,
  evaluatePositionV41,
  type PositionAdvisorV41Action,
  type PositionAdvisorV41Result,
} from '../positionAdvisorV41';
import { NEUTRAL_PROTECTION } from '../protectionLayer';
import type { SignalRowV41 } from '../scanV41';
import {
  mapAdvisorActionCode,
  mapAdvisorReasonCode,
  toAdvisorUpdatedAtUtc,
  waitingFillReasonCode,
} from './adviserMetadata';
import type { V41TradeSession, V41TradeSessionAdvisor } from './rc3ViewModelTypes';
import type {
  V41AdvisorViewModel,
  V41SessionAdviserPatch,
} from './tradeSessionAdviserTypes';

const WAITING_FILL_REASON = 'Chờ khớp lệnh';

function mapActionToAdvisorState(
  action: PositionAdvisorV41Action,
): V41TradeSessionAdvisor {
  switch (action) {
    case 'CLOSE_NOW':
      return 'Close';
    case 'MOVE_SL_BE':
    case 'TRAILING_STOP':
      return 'Move SL';
    case 'PARTIAL_TP1':
    case 'PARTIAL_TP2':
      return 'Scale Out';
    case 'HOLD':
    default:
      return 'Hold';
  }
}

function resolveReason(result: PositionAdvisorV41Result): string {
  const label = result.label?.trim();
  if (label) return label;
  const reason = result.reason?.trim();
  if (reason) return reason;
  return 'Giữ lệnh';
}

export function buildWaitingFillAdvisor(updatedAt: number): V41AdvisorViewModel {
  return {
    state: 'Waiting Fill',
    advisorActionCode: 'WAITING_FILL',
    reason: WAITING_FILL_REASON,
    advisorReasonCode: waitingFillReasonCode(),
    updatedAt,
  };
}

function buildPatchFromAdvice(
  session: V41TradeSession,
  advice: V41AdvisorViewModel,
): Pick<
  V41SessionAdviserPatch,
  | 'advisorActionCode'
  | 'advisorReasonCode'
  | 'advisorUpdatedAt'
  | 'advisorSequence'
  | 'historyAppend'
> {
  const advisorUpdatedAt = toAdvisorUpdatedAtUtc(advice.updatedAt);
  const actionChanged = session.advisorActionCode !== advice.advisorActionCode;
  const advisorSequence = actionChanged
    ? session.advisorSequence + 1
    : session.advisorSequence;

  const historyAppend = actionChanged
    ? {
        sequence: advisorSequence,
        advisorActionCode: advice.advisorActionCode,
        advisor: advice.state,
        advisorReason: advice.reason,
        advisorReasonCode: advice.advisorReasonCode,
        advisorUpdatedAt,
      }
    : undefined;

  return {
    advisorActionCode: advice.advisorActionCode,
    advisorReasonCode: advice.advisorReasonCode,
    advisorUpdatedAt,
    advisorSequence,
    historyAppend,
  };
}

/**
 * Build Advisor ViewModel cho một Trade Session.
 * Pending → Waiting Fill (không gọi evaluatePosition).
 * Running → evaluatePositionV41 (trade management only).
 */
export function buildTradeSessionAdvisorViewModel(input: {
  session: V41TradeSession;
  row: SignalRowV41 | undefined;
  updatedAt: number;
}): V41AdvisorViewModel {
  const { session, row, updatedAt } = input;

  if (session.status === 'Pending') {
    return buildWaitingFillAdvisor(updatedAt);
  }

  const markPrice = row?.markPrice;
  if (
    markPrice == null ||
    !Number.isFinite(markPrice) ||
    markPrice <= 0 ||
    row?.snapshot == null
  ) {
    return {
      state: session.advisor,
      advisorActionCode: session.advisorActionCode,
      reason: session.advisorReason || 'Thiếu Market Snapshot — giữ khuyến nghị trước.',
      advisorReasonCode: session.advisorReasonCode,
      updatedAt,
    };
  }

  const result = evaluatePositionV41({
    snapshot: row.snapshot,
    protection: row.protection ?? NEUTRAL_PROTECTION,
    markPrice,
    openPosition: {
      entryPrice: session.entry,
      direction: session.action,
      size: 1,
      leverage: 5,
      sl: session.stop,
      tp1: session.tp,
      tp2: session.tp2 ?? session.tp,
      tp3: session.tp3 ?? session.tp,
      openedAt: session.openedAt,
    },
    earlyWarning: row.earlyWarning,
    reversalState: row.reversalState,
    momentum: row.momentum,
    exhaustion: row.exhaustion,
  });

  return {
    state: mapActionToAdvisorState(result.action),
    advisorActionCode: mapAdvisorActionCode(result.action),
    reason: resolveReason(result),
    advisorReasonCode: mapAdvisorReasonCode(result),
    updatedAt,
  };
}

/**
 * Paper fill giống lệnh chờ limit (Binance): giá phải chạm Entry.
 * LONG: mark <= entry · SHORT: mark >= entry.
 * Breakout Confirm B / TR chỉ là tín hiệu — không coi signal = đã vào lệnh.
 */
export function isV41SessionEntryFilled(
  action: 'LONG' | 'SHORT',
  markPrice: number,
  entry: number,
): boolean {
  if (!Number.isFinite(markPrice) || !Number.isFinite(entry) || entry <= 0 || markPrice <= 0) {
    return false;
  }
  return action === 'LONG' ? markPrice <= entry : markPrice >= entry;
}

/**
 * Áp adviser lên session active từ scan rows.
 * Paper fill: Pending + mark chạm Entry → Running rồi advise.
 * Có mark nhưng chưa chạm Entry → giữ Pending / Waiting Fill (cập nhật current).
 * Không polling — caller gọi sau scan.
 */
export function buildTradeSessionAdviserPatches(
  sessions: V41TradeSession[],
  rows: SignalRowV41[],
  updatedAt: number = Date.now(),
): V41SessionAdviserPatch[] {
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]));
  const patches: V41SessionAdviserPatch[] = [];

  for (const session of sessions) {
    if (session.status !== 'Pending' && session.status !== 'Running') {
      continue;
    }

    const row = bySymbol.get(session.symbol);
    const markPrice = row?.markPrice;
    const hasMark =
      markPrice != null && Number.isFinite(markPrice) && markPrice > 0;

    const filled =
      session.status === 'Pending' &&
      hasMark &&
      isV41SessionEntryFilled(session.action, markPrice as number, session.entry);

    const nextStatus: 'Pending' | 'Running' =
      filled ? 'Running' : session.status;

    const sessionForAdvice: V41TradeSession = {
      ...session,
      status: nextStatus,
      current: hasMark ? (markPrice as number) : session.current,
    };

    const advice = buildTradeSessionAdvisorViewModel({
      session: sessionForAdvice,
      row,
      updatedAt,
    });

    const meta = buildPatchFromAdvice(session, advice);
    const isRunning = nextStatus === 'Running';

    patches.push({
      sessionId: session.id,
      status: nextStatus,
      current: hasMark ? (markPrice as number) : session.current,
      pnl:
        isRunning && hasMark
          ? computeCurrentPnlPct(session.entry, markPrice as number, session.action, 5)
          : nextStatus === 'Pending'
            ? null
            : session.pnl,
      advisor: advice.state,
      advisorReason: advice.reason,
      ...meta,
    });
  }

  return patches;
}
