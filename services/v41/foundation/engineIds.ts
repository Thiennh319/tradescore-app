/**
 * V4.1 Foundation — canonical engine identifiers.
 * Types only; engines keep legacy return shapes via adapters.
 */

export const V41_ENGINE_ID = {
  MARKET_INTELLIGENCE: 'market_intelligence',
  VISIBILITY: 'visibility',
  ENTRY_QUALITY: 'entry_quality',
  PROTECTION: 'protection',
  MOMENTUM_1H: 'momentum_1h',
  EXHAUSTION: 'exhaustion',
  EARLY_WARNING: 'early_warning',
  REVERSAL: 'reversal',
  VOLATILITY_EXPLOSION: 'volatility_explosion',
  FAKE_BREAKOUT: 'fake_breakout',
  TREND_REVERSAL: 'trend_reversal',
  CONFIDENCE: 'confidence',
  DECISION: 'decision',
  POSITION_ADVISOR: 'position_advisor',
  RISK: 'risk',
  PROFIT: 'profit',
  TRADE_SETUP: 'trade_setup',
} as const;

export type V41EngineId = (typeof V41_ENGINE_ID)[keyof typeof V41_ENGINE_ID];
