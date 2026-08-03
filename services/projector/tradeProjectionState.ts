/**
 * Task 12B.3 — Initial / copy helpers for projection state.
 * Pure — không I/O.
 */

import {
  TRADE_PROJECTION_SCHEMA_VERSION,
  TRADE_PROJECTION_VERSION,
} from './tradeProjectionVersion';
import type { TradeProjectionState } from './tradeProjectorTypes';

export function createEmptyProjectionState(): TradeProjectionState {
  return {
    identity: {
      tradeId: null,
      symbol: null,
      sessionId: null,
    },
    phase: 'NONE',
    entrySnapshot: {
      createdAtUtc: null,
      createdAtMs: null,
    },
    position: {
      side: null,
      entryPrice: null,
      stop: null,
      tp1: null,
      tp2: null,
      tp3: null,
      size: null,
      orderType: null,
      limitPrice: null,
      entryAdjusted: null,
      filledAtUtc: null,
    },
    adviserTimeline: [],
    partialCloses: [],
    exit: {
      exitReasonCode: null,
      exitPrice: null,
      exitAtUtc: null,
      pnlUsdt: null,
      pnlPct: null,
      advisorActionCodeAtExit: null,
      lastTpLevel: null,
      slReachedPrice: null,
    },
    machineCodes: {
      triggerCode: null,
      decisionCode: null,
      strategyVersion: null,
      lastAdvisorActionCode: null,
      lastAdvisorReasonCode: null,
    },
    audit: {
      appliedEventIds: [],
      lastEventId: null,
      lastEventAtUtc: null,
      correlationId: null,
      featureSetVersion: null,
      engineVersion: null,
      confidenceVersion: null,
      plannerVersion: null,
      sealed: false,
    },
    ai: {
      projectionVersion: TRADE_PROJECTION_VERSION,
      projectionSchemaVersion: TRADE_PROJECTION_SCHEMA_VERSION,
      confidence: null,
    },
  };
}

/** Deep clone qua JSON — deterministic, không share refs. */
export function cloneProjectionState(state: TradeProjectionState): TradeProjectionState {
  return JSON.parse(JSON.stringify(state)) as TradeProjectionState;
}
