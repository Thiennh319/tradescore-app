/** Evidence Export — snapshot đầu vào Rule Engine (chưa wire). */

export type RuleAuditSlope = 'UP' | 'DOWN' | 'FLAT';

export type RuleAuditDivergence = 'BULLISH' | 'BEARISH' | 'NONE';

export type RuleAuditMarketMode = 'TRENDING' | 'RANGING';

export type RuleAuditBandwidthSlope = 'EXPANDING' | 'CONTRACTING' | 'FLAT';

export type RuleAuditAdxRegime = 'CHOPPY' | 'RANGING' | 'TRENDING';

export type RuleAuditAdxRegimeStrength = 'WEAK' | 'STRONG';

export type RuleAuditAdxGateSeverity = 'BLOCK' | 'WARNING' | 'BONUS' | 'OK';

export type RuleAuditVwapZone =
  | 'ABOVE_BAND2'
  | 'ABOVE_BAND1'
  | 'NEAR_VWAP'
  | 'BELOW_BAND1'
  | 'BELOW_BAND2'
  | 'BETWEEN';

export type RuleAuditVwapEntryQuality = 'IDEAL' | 'GOOD' | 'NEUTRAL' | 'POOR';

export type RuleAuditCvdTrend = 'UP' | 'DOWN' | 'FLAT';

export type RuleAuditCvdSlope = 'up' | 'down' | 'flat';

export type RuleAuditStructureSlSource = 'STRUCTURE' | 'ATR_FALLBACK';

export interface RuleAuditEmaTimeframe {
  ema20: number;
  ema50: number;
  ema200: number | null;
  slope20: RuleAuditSlope;
  slope50: RuleAuditSlope;
  priceVsEma20Pct: number;
  priceVsEma50Pct: number;
  priceAboveEma20: boolean;
  priceAboveEma50: boolean;
}

export interface RuleAuditEmaInput {
  h1: RuleAuditEmaTimeframe;
  h4: RuleAuditEmaTimeframe;
  alignment: string;
  pullback: boolean;
}

export interface RuleAuditRsiInput {
  rsi1h: number;
  rsi4h: number;
  divergence1h: RuleAuditDivergence;
  divergence4h: RuleAuditDivergence;
}

export interface RuleAuditMacdTimeframe {
  macd: number;
  signal: number;
  histogram: number;
  isTurningUp: boolean;
  isTurningDown: boolean;
  crossedZeroRecentlyUp: boolean;
  crossedZeroRecentlyDown: boolean;
}

export interface RuleAuditMacdInput {
  h1: RuleAuditMacdTimeframe;
  h4: RuleAuditMacdTimeframe;
}

export interface RuleAuditBollingerTimeframe {
  percentB: number;
  bandwidth: number;
  bandwidthSlope: RuleAuditBandwidthSlope;
  marketMode: RuleAuditMarketMode;
  upper: number;
  middle: number;
  lower: number;
}

export interface RuleAuditBollingerInput {
  h1: RuleAuditBollingerTimeframe;
  h4: RuleAuditBollingerTimeframe;
}

export interface RuleAuditVolumeInput {
  volumeRatio1h: number;
  volumeRatio4h: number;
  lastVolume: number;
  avgVolume1h: number;
}

export interface RuleAuditCvdInput {
  value: number;
  trend: RuleAuditCvdTrend;
  slope: RuleAuditCvdSlope;
  divergence: boolean;
  divergenceType: RuleAuditDivergence;
  supportive: boolean;
  cvdMomentum24h: number;
  reason: string;
}

export interface RuleAuditOiInput {
  current: number;
  previous: number;
  delta: number;
  change1hPct: number;
  change4hPct: number;
}

export interface RuleAuditFundingInput {
  ratePct: number;
  avg8: number;
  avg16: number;
  velocity: number;
  acceleration: number;
  state: string;
}

export interface RuleAuditLongShortRatioInput {
  topRatio: number;
  globalRatio: number;
  topHistory: number[];
}

export interface RuleAuditBtcContextInput {
  change24hPct: number;
  change1hPct: number;
  trend: string;
  regimeConfidence: number;
}

export interface RuleAuditAdxInput {
  adx1h: number;
  adx4h: number;
  adxAvg: number;
  regime: RuleAuditAdxRegime;
  regimeStrength: RuleAuditAdxRegimeStrength;
  isChoppy1h: boolean;
  isChoppy4h: boolean;
  bothChoppy: boolean;
  gateAllowed: boolean;
  gateBlock: boolean;
  gateSeverity: RuleAuditAdxGateSeverity;
  gateTpMultiplier: number;
  gateSlMultiplier: number;
  gateMessage: string;
}

export interface RuleAuditVwapInput {
  vwap: number;
  upperBand1: number;
  lowerBand1: number;
  upperBand2: number;
  lowerBand2: number;
  priceVsVwap: number;
  zone: RuleAuditVwapZone;
  isNearVwap: boolean;
  isPullingBackToVwap: boolean;
  sessionStart: number;
  candleCount: number;
  entryQuality: RuleAuditVwapEntryQuality;
  suggestedEntry: number | null;
  entryReason: string;
}

export interface RuleAuditAtrInput {
  atr1h: number;
  atr1hPct: number;
}

export interface RuleAuditStructureInput {
  swingPrice: number;
  swingTime: number;
  slPrice: number;
  slSource: RuleAuditStructureSlSource;
  bufferPct: number;
  distanceFromEntry: number;
  candlesBack: number;
  lookbackCandles: number;
}

export interface RuleAuditSnapshot {
  ema: RuleAuditEmaInput;
  rsi: RuleAuditRsiInput;
  macd: RuleAuditMacdInput;
  bollinger: RuleAuditBollingerInput;
  volume: RuleAuditVolumeInput;
  cvd: RuleAuditCvdInput;
  oi: RuleAuditOiInput;
  funding: RuleAuditFundingInput;
  longShortRatio: RuleAuditLongShortRatioInput;
  btcContext: RuleAuditBtcContextInput;
  adx: RuleAuditAdxInput;
  vwap: RuleAuditVwapInput;
  atr: RuleAuditAtrInput;
  structure: RuleAuditStructureInput;
}
