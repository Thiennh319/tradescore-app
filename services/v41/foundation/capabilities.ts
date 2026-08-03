/**
 * V4.1 Foundation — engine capability metadata (declarative only).
 * Does not gate runtime behaviour — documents what each engine may support.
 */

import { V41_ENGINE_ID, type V41EngineId } from './engineIds';

export interface V41EngineCapabilities {
  readonly canGenerateSignal: boolean;
  readonly canProvideAdvisor: boolean;
  readonly canTradePlan: boolean;
  readonly canEntry: boolean;
  readonly canStopLoss: boolean;
  readonly canTakeProfit: boolean;
}

const CAP_NONE: V41EngineCapabilities = {
  canGenerateSignal: false,
  canProvideAdvisor: false,
  canTradePlan: false,
  canEntry: false,
  canStopLoss: false,
  canTakeProfit: false,
};

/** Registry — extend when new engines are added; no algorithm impact. */
export const V41_ENGINE_CAPABILITIES: Record<V41EngineId, V41EngineCapabilities> = {
  [V41_ENGINE_ID.MARKET_INTELLIGENCE]: CAP_NONE,
  [V41_ENGINE_ID.VISIBILITY]: CAP_NONE,
  [V41_ENGINE_ID.ENTRY_QUALITY]: {
    ...CAP_NONE,
    canGenerateSignal: true,
    canEntry: true,
  },
  [V41_ENGINE_ID.PROTECTION]: CAP_NONE,
  [V41_ENGINE_ID.MOMENTUM_1H]: {
    ...CAP_NONE,
    canGenerateSignal: true,
  },
  [V41_ENGINE_ID.EXHAUSTION]: {
    ...CAP_NONE,
    canGenerateSignal: true,
  },
  [V41_ENGINE_ID.EARLY_WARNING]: {
    ...CAP_NONE,
    canGenerateSignal: true,
  },
  [V41_ENGINE_ID.REVERSAL]: {
    ...CAP_NONE,
    canGenerateSignal: true,
  },
  [V41_ENGINE_ID.VOLATILITY_EXPLOSION]: CAP_NONE,
  [V41_ENGINE_ID.FAKE_BREAKOUT]: {
    ...CAP_NONE,
    canGenerateSignal: true,
  },
  [V41_ENGINE_ID.TREND_REVERSAL]: {
    ...CAP_NONE,
    canGenerateSignal: true,
  },
  [V41_ENGINE_ID.CONFIDENCE]: CAP_NONE,
  [V41_ENGINE_ID.DECISION]: {
    ...CAP_NONE,
    canGenerateSignal: true,
  },
  [V41_ENGINE_ID.POSITION_ADVISOR]: {
    ...CAP_NONE,
    canProvideAdvisor: true,
  },
  [V41_ENGINE_ID.RISK]: {
    ...CAP_NONE,
    canStopLoss: true,
    canTradePlan: true,
  },
  [V41_ENGINE_ID.PROFIT]: {
    ...CAP_NONE,
    canTakeProfit: true,
    canTradePlan: true,
  },
  [V41_ENGINE_ID.TRADE_SETUP]: {
    ...CAP_NONE,
    canTradePlan: true,
    canEntry: true,
    canStopLoss: true,
    canTakeProfit: true,
  },
};

export function getEngineCapabilities(engineId: V41EngineId): V41EngineCapabilities {
  return V41_ENGINE_CAPABILITIES[engineId];
}
