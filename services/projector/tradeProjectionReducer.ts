/**
 * Task 12B.3 — Pure event → projection state reducer.
 * Không side effect. Không Engine / Binance / Planner / Decision.
 */

import type { PartialCloseRecord } from '../../constants/aiJournal';
import type { TradeEvent } from '../events';
import { cloneProjectionState } from './tradeProjectionState';
import type { TradeProjectionState } from './tradeProjectorTypes';

function parseUtcMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function markApplied(state: TradeProjectionState, event: TradeEvent): void {
  state.audit.appliedEventIds.push(event.eventId);
  state.audit.lastEventId = event.eventId;
  state.audit.lastEventAtUtc = event.createdAtUtc;
  if (!state.audit.correlationId) {
    state.audit.correlationId = event.correlationId;
  }
  if (event.metadata.featureSetVersion) {
    state.audit.featureSetVersion = event.metadata.featureSetVersion;
  }
  if (event.metadata.engineVersion) {
    state.audit.engineVersion = event.metadata.engineVersion;
  }
  if (event.metadata.confidenceVersion) {
    state.audit.confidenceVersion = event.metadata.confidenceVersion;
  }
  if (event.metadata.plannerVersion) {
    state.audit.plannerVersion = event.metadata.plannerVersion;
  }
}

function seal(state: TradeProjectionState): void {
  state.audit.sealed = true;
}

/**
 * Apply một event vào state (immutable: trả state mới).
 * SYNC_ACK / HEARTBEAT → no-op (trả clone cùng nội dung nghiệp vụ, vẫn đánh dấu applied để idempotent).
 * Terminal sealed → ignore business mutations (vẫn track applied id).
 */
export function reduceTradeEvent(
  prev: TradeProjectionState,
  event: TradeEvent,
): TradeProjectionState {
  const state = cloneProjectionState(prev);

  if (state.audit.appliedEventIds.includes(event.eventId)) {
    return state;
  }

  if (event.eventType === 'SYNC_ACK' || event.eventType === 'HEARTBEAT') {
    markApplied(state, event);
    return state;
  }

  if (state.audit.sealed) {
    markApplied(state, event);
    return state;
  }

  switch (event.eventType) {
    case 'TRADE_CREATED': {
      const p = event.payload;
      state.identity.tradeId = event.aggregateId;
      state.identity.symbol = p.symbol;
      state.identity.sessionId = p.sessionId ?? null;
      state.phase = 'CREATED';
      state.entrySnapshot.createdAtUtc = event.createdAtUtc;
      state.entrySnapshot.createdAtMs = parseUtcMs(event.createdAtUtc);
      state.position.side = p.side;
      state.position.entryPrice = p.entry;
      state.position.stop = p.stop;
      state.position.tp1 = p.tp1;
      state.position.tp2 = p.tp2 ?? null;
      state.position.tp3 = p.tp3 ?? null;
      state.machineCodes.triggerCode = p.triggerCode;
      state.machineCodes.decisionCode = p.decisionCode;
      state.machineCodes.strategyVersion = p.strategyVersion;
      state.ai.confidence = p.confidence;
      break;
    }
    case 'ORDER_SUBMITTED': {
      const p = event.payload;
      state.phase = 'ORDER_SUBMITTED';
      state.position.orderType = p.orderType;
      state.position.side = p.side;
      if (p.limitPrice != null) state.position.limitPrice = p.limitPrice;
      if (p.size != null) state.position.size = p.size;
      break;
    }
    case 'ORDER_FILLED': {
      const p = event.payload;
      state.phase = 'FILLED';
      state.position.entryPrice = p.fillPrice;
      state.position.entryAdjusted = p.entryAdjusted;
      state.position.filledAtUtc = p.filledAtUtc;
      break;
    }
    case 'POSITION_RUNNING': {
      const p = event.payload;
      state.phase = 'RUNNING';
      state.position.entryPrice = p.entryPrice;
      state.position.stop = p.stop;
      state.position.tp1 = p.tp1;
      break;
    }
    case 'STOP_MOVED': {
      const p = event.payload;
      state.position.stop = p.newStop;
      break;
    }
    case 'PARTIAL_EXIT': {
      const p = event.payload;
      const record: PartialCloseRecord = {
        partialClosePercent: p.percent,
        partialClosePrice: p.price,
        partialCloseTime: parseUtcMs(event.createdAtUtc),
        partialCloseReason: p.reasonCode,
        realizedPnlUSDT: p.realizedPnlUsdt ?? 0,
        realizedPnlPct: 0,
        closedSizeUsdt: 0,
      };
      state.partialCloses.push(record);
      break;
    }
    case 'TP_REACHED': {
      state.exit.lastTpLevel = event.payload.tpLevelCode;
      break;
    }
    case 'SL_REACHED': {
      state.exit.slReachedPrice = event.payload.price;
      break;
    }
    case 'ADVISER_UPDATED': {
      const p = event.payload;
      const sequence = state.adviserTimeline.length + 1;
      state.adviserTimeline.push({
        sequence,
        eventId: event.eventId,
        atUtc: event.createdAtUtc,
        advisorActionCode: p.advisorActionCode,
        advisorReasonCode: p.advisorReasonCode,
        advisorReasonLabel: p.advisorReasonLabel,
      });
      state.machineCodes.lastAdvisorActionCode = p.advisorActionCode;
      state.machineCodes.lastAdvisorReasonCode = p.advisorReasonCode;
      break;
    }
    case 'TRADE_CLOSED': {
      const p = event.payload;
      state.phase = 'CLOSED';
      state.exit.exitReasonCode = p.exitReasonCode;
      state.exit.exitPrice = p.exitPrice;
      state.exit.exitAtUtc = event.createdAtUtc;
      state.exit.pnlUsdt = p.pnlUsdt;
      state.exit.pnlPct = p.pnlPct;
      state.exit.advisorActionCodeAtExit = p.advisorActionCodeAtExit ?? null;
      seal(state);
      break;
    }
    case 'TRADE_CANCELLED': {
      const p = event.payload;
      state.phase = 'CANCELLED';
      state.exit.exitReasonCode = p.exitReasonCode;
      state.exit.exitAtUtc = event.createdAtUtc;
      seal(state);
      break;
    }
    default: {
      // Exhaustiveness — should not reach for known catalog
      break;
    }
  }

  markApplied(state, event);
  return state;
}
