import type {
  RuleAuditAdxInput,
  RuleAuditAtrInput,
  RuleAuditBollingerInput,
  RuleAuditBollingerTimeframe,
  RuleAuditBtcContextInput,
  RuleAuditCvdInput,
  RuleAuditEmaTimeframe,
  RuleAuditFundingInput,
  RuleAuditLongShortRatioInput,
  RuleAuditMacdTimeframe,
  RuleAuditMacdInput,
  RuleAuditOiInput,
  RuleAuditRsiInput,
  RuleAuditSnapshot,
  RuleAuditStructureInput,
  RuleAuditVolumeInput,
  RuleAuditVwapInput,
} from '../types/ruleAuditSnapshot';

/** Nguồn EMA đã tính sẵn — map 1:1, không gọi indicator. */
export interface RuleAuditEmaPopulateSource {
  h1: RuleAuditEmaTimeframe;
  h4: RuleAuditEmaTimeframe;
  alignment: string;
  pullback: boolean;
}

/** Nguồn RSI đã tính sẵn — map 1:1, không gọi indicator. */
export type RuleAuditRsiPopulateSource = RuleAuditRsiInput;

/** Nguồn MACD đã tính sẵn — map 1:1, không gọi indicator. */
export type RuleAuditMacdPopulateSource = RuleAuditMacdInput;

/** Nguồn Bollinger đã tính sẵn — map 1:1, không gọi indicator. */
export type RuleAuditBollingerPopulateSource = RuleAuditBollingerInput;

/** Nguồn Volume đã tính sẵn — map 1:1, không gọi indicator. */
export type RuleAuditVolumePopulateSource = RuleAuditVolumeInput;

/** Nguồn CVD đã tính sẵn — map 1:1, không gọi indicator. */
export type RuleAuditCvdPopulateSource = RuleAuditCvdInput;

/** Nguồn OI đã tính sẵn — map 1:1, không gọi API. */
export type RuleAuditOiPopulateSource = RuleAuditOiInput;

/** Nguồn Funding đã tính sẵn — map 1:1, không gọi API. */
export type RuleAuditFundingPopulateSource = RuleAuditFundingInput;

/** Nguồn Long/Short Ratio đã tính sẵn — map 1:1, không gọi API. */
export type RuleAuditLongShortRatioPopulateSource = RuleAuditLongShortRatioInput;

/** Nguồn BTC / market context — map 1:1, không gọi API. */
export type RuleAuditBtcContextPopulateSource = RuleAuditBtcContextInput;

/** Nguồn ADX / trend context — map 1:1, không gọi indicator. */
export type RuleAuditAdxPopulateSource = RuleAuditAdxInput;

/** Nguồn ATR — map 1:1, không tính lại. */
export type RuleAuditAtrPopulateSource = RuleAuditAtrInput;

/** Nguồn VWAP — map 1:1, không tính lại. */
export type RuleAuditVwapPopulateSource = RuleAuditVwapInput;

/** Nguồn Structure SL — map 1:1, không tính lại. */
export type RuleAuditStructurePopulateSource = RuleAuditStructureInput;

export interface RuleAuditPopulateInput {
  ema: RuleAuditEmaPopulateSource;
  rsi: RuleAuditRsiPopulateSource;
  macd: RuleAuditMacdPopulateSource;
  bollinger: RuleAuditBollingerPopulateSource;
  volume: RuleAuditVolumePopulateSource;
  cvd: RuleAuditCvdPopulateSource;
  oi: RuleAuditOiPopulateSource;
  funding: RuleAuditFundingPopulateSource;
  longShortRatio: RuleAuditLongShortRatioPopulateSource;
  btcContext: RuleAuditBtcContextPopulateSource;
  adx: RuleAuditAdxPopulateSource;
  atr: RuleAuditAtrPopulateSource;
  vwap: RuleAuditVwapPopulateSource;
  structure: RuleAuditStructurePopulateSource;
}

function populateEmaTimeframe(
  target: RuleAuditEmaTimeframe,
  source: RuleAuditEmaTimeframe,
): void {
  target.ema20 = source.ema20;
  target.ema50 = source.ema50;
  target.ema200 = source.ema200;
  target.slope20 = source.slope20;
  target.slope50 = source.slope50;
  target.priceVsEma20Pct = source.priceVsEma20Pct;
  target.priceVsEma50Pct = source.priceVsEma50Pct;
  target.priceAboveEma20 = source.priceAboveEma20;
  target.priceAboveEma50 = source.priceAboveEma50;
}

function populateEma(
  snapshot: RuleAuditSnapshot,
  ema: RuleAuditEmaPopulateSource,
): void {
  populateEmaTimeframe(snapshot.ema.h1, ema.h1);
  populateEmaTimeframe(snapshot.ema.h4, ema.h4);
  snapshot.ema.alignment = ema.alignment;
  snapshot.ema.pullback = ema.pullback;
}

function populateRsi(
  snapshot: RuleAuditSnapshot,
  rsi: RuleAuditRsiPopulateSource,
): void {
  snapshot.rsi.rsi1h = rsi.rsi1h;
  snapshot.rsi.rsi4h = rsi.rsi4h;
  snapshot.rsi.divergence1h = rsi.divergence1h;
  snapshot.rsi.divergence4h = rsi.divergence4h;
}

function populateMacdTimeframe(
  target: RuleAuditMacdTimeframe,
  source: RuleAuditMacdTimeframe,
): void {
  target.macd = source.macd;
  target.signal = source.signal;
  target.histogram = source.histogram;
  target.isTurningUp = source.isTurningUp;
  target.isTurningDown = source.isTurningDown;
  target.crossedZeroRecentlyUp = source.crossedZeroRecentlyUp;
  target.crossedZeroRecentlyDown = source.crossedZeroRecentlyDown;
}

function populateMacd(
  snapshot: RuleAuditSnapshot,
  macd: RuleAuditMacdPopulateSource,
): void {
  populateMacdTimeframe(snapshot.macd.h1, macd.h1);
  populateMacdTimeframe(snapshot.macd.h4, macd.h4);
}

function populateBollingerTimeframe(
  target: RuleAuditBollingerTimeframe,
  source: RuleAuditBollingerTimeframe,
): void {
  target.percentB = source.percentB;
  target.bandwidth = source.bandwidth;
  target.bandwidthSlope = source.bandwidthSlope;
  target.marketMode = source.marketMode;
  target.upper = source.upper;
  target.middle = source.middle;
  target.lower = source.lower;
}

function populateBollinger(
  snapshot: RuleAuditSnapshot,
  bollinger: RuleAuditBollingerPopulateSource,
): void {
  populateBollingerTimeframe(snapshot.bollinger.h1, bollinger.h1);
  populateBollingerTimeframe(snapshot.bollinger.h4, bollinger.h4);
}

function populateVolume(
  snapshot: RuleAuditSnapshot,
  volume: RuleAuditVolumePopulateSource,
): void {
  snapshot.volume.volumeRatio1h = volume.volumeRatio1h;
  snapshot.volume.volumeRatio4h = volume.volumeRatio4h;
  snapshot.volume.lastVolume = volume.lastVolume;
  snapshot.volume.avgVolume1h = volume.avgVolume1h;
}

function populateCvd(
  snapshot: RuleAuditSnapshot,
  cvd: RuleAuditCvdPopulateSource,
): void {
  snapshot.cvd.value = cvd.value;
  snapshot.cvd.trend = cvd.trend;
  snapshot.cvd.slope = cvd.slope;
  snapshot.cvd.divergence = cvd.divergence;
  snapshot.cvd.divergenceType = cvd.divergenceType;
  snapshot.cvd.supportive = cvd.supportive;
  snapshot.cvd.cvdMomentum24h = cvd.cvdMomentum24h;
  snapshot.cvd.reason = cvd.reason;
}

function populateOi(
  snapshot: RuleAuditSnapshot,
  oi: RuleAuditOiPopulateSource,
): void {
  snapshot.oi.current = oi.current;
  snapshot.oi.previous = oi.previous;
  snapshot.oi.delta = oi.delta;
  snapshot.oi.change1hPct = oi.change1hPct;
  snapshot.oi.change4hPct = oi.change4hPct;
}

function populateFunding(
  snapshot: RuleAuditSnapshot,
  funding: RuleAuditFundingPopulateSource,
): void {
  snapshot.funding.ratePct = funding.ratePct;
  snapshot.funding.avg8 = funding.avg8;
  snapshot.funding.avg16 = funding.avg16;
  snapshot.funding.velocity = funding.velocity;
  snapshot.funding.acceleration = funding.acceleration;
  snapshot.funding.state = funding.state;
}

function populateLongShortRatio(
  snapshot: RuleAuditSnapshot,
  longShortRatio: RuleAuditLongShortRatioPopulateSource,
): void {
  snapshot.longShortRatio.topRatio = longShortRatio.topRatio;
  snapshot.longShortRatio.globalRatio = longShortRatio.globalRatio;
  snapshot.longShortRatio.topHistory = longShortRatio.topHistory;
}

function populateBtcContext(
  snapshot: RuleAuditSnapshot,
  btcContext: RuleAuditBtcContextPopulateSource,
): void {
  snapshot.btcContext.change24hPct = btcContext.change24hPct;
  snapshot.btcContext.change1hPct = btcContext.change1hPct;
  snapshot.btcContext.trend = btcContext.trend;
  snapshot.btcContext.regimeConfidence = btcContext.regimeConfidence;
}

function populateAdx(
  snapshot: RuleAuditSnapshot,
  adx: RuleAuditAdxPopulateSource,
): void {
  snapshot.adx.adx1h = adx.adx1h;
  snapshot.adx.adx4h = adx.adx4h;
  snapshot.adx.adxAvg = adx.adxAvg;
  snapshot.adx.regime = adx.regime;
  snapshot.adx.regimeStrength = adx.regimeStrength;
  snapshot.adx.isChoppy1h = adx.isChoppy1h;
  snapshot.adx.isChoppy4h = adx.isChoppy4h;
  snapshot.adx.bothChoppy = adx.bothChoppy;
  snapshot.adx.gateAllowed = adx.gateAllowed;
  snapshot.adx.gateBlock = adx.gateBlock;
  snapshot.adx.gateSeverity = adx.gateSeverity;
  snapshot.adx.gateTpMultiplier = adx.gateTpMultiplier;
  snapshot.adx.gateSlMultiplier = adx.gateSlMultiplier;
  snapshot.adx.gateMessage = adx.gateMessage;
}

function populateAtr(
  snapshot: RuleAuditSnapshot,
  atr: RuleAuditAtrPopulateSource,
): void {
  snapshot.atr.atr1h = atr.atr1h;
  snapshot.atr.atr1hPct = atr.atr1hPct;
}

function populateVwap(
  snapshot: RuleAuditSnapshot,
  vwap: RuleAuditVwapPopulateSource,
): void {
  snapshot.vwap.vwap = vwap.vwap;
  snapshot.vwap.upperBand1 = vwap.upperBand1;
  snapshot.vwap.lowerBand1 = vwap.lowerBand1;
  snapshot.vwap.upperBand2 = vwap.upperBand2;
  snapshot.vwap.lowerBand2 = vwap.lowerBand2;
  snapshot.vwap.priceVsVwap = vwap.priceVsVwap;
  snapshot.vwap.zone = vwap.zone;
  snapshot.vwap.isNearVwap = vwap.isNearVwap;
  snapshot.vwap.isPullingBackToVwap = vwap.isPullingBackToVwap;
  snapshot.vwap.sessionStart = vwap.sessionStart;
  snapshot.vwap.candleCount = vwap.candleCount;
  snapshot.vwap.entryQuality = vwap.entryQuality;
  snapshot.vwap.suggestedEntry = vwap.suggestedEntry;
  snapshot.vwap.entryReason = vwap.entryReason;
}

function populateStructure(
  snapshot: RuleAuditSnapshot,
  structure: RuleAuditStructurePopulateSource,
): void {
  snapshot.structure.swingPrice = structure.swingPrice;
  snapshot.structure.swingTime = structure.swingTime;
  snapshot.structure.slPrice = structure.slPrice;
  snapshot.structure.slSource = structure.slSource;
  snapshot.structure.bufferPct = structure.bufferPct;
  snapshot.structure.distanceFromEntry = structure.distanceFromEntry;
  snapshot.structure.candlesBack = structure.candlesBack;
  snapshot.structure.lookbackCandles = structure.lookbackCandles;
}

export function populateRuleAuditSnapshot(
  snapshot: RuleAuditSnapshot,
  input: RuleAuditPopulateInput,
): void {
  if (input.ema == null) {
    throw new Error('populateRuleAuditSnapshot: input.ema is required');
  }
  if (input.rsi == null) {
    throw new Error('populateRuleAuditSnapshot: input.rsi is required');
  }
  if (input.macd == null) {
    throw new Error('populateRuleAuditSnapshot: input.macd is required');
  }
  if (input.bollinger == null) {
    throw new Error('populateRuleAuditSnapshot: input.bollinger is required');
  }
  if (input.volume == null) {
    throw new Error('populateRuleAuditSnapshot: input.volume is required');
  }
  if (input.cvd == null) {
    throw new Error('populateRuleAuditSnapshot: input.cvd is required');
  }
  if (input.oi == null) {
    throw new Error('populateRuleAuditSnapshot: input.oi is required');
  }
  if (input.funding == null) {
    throw new Error('populateRuleAuditSnapshot: input.funding is required');
  }
  if (input.longShortRatio == null) {
    throw new Error('populateRuleAuditSnapshot: input.longShortRatio is required');
  }
  if (input.btcContext == null) {
    throw new Error('populateRuleAuditSnapshot: input.btcContext is required');
  }
  if (input.adx == null) {
    throw new Error('populateRuleAuditSnapshot: input.adx is required');
  }
  if (input.atr == null) {
    throw new Error('populateRuleAuditSnapshot: input.atr is required');
  }
  if (input.vwap == null) {
    throw new Error('populateRuleAuditSnapshot: input.vwap is required');
  }
  if (input.structure == null) {
    throw new Error('populateRuleAuditSnapshot: input.structure is required');
  }
  populateEma(snapshot, input.ema);
  populateRsi(snapshot, input.rsi);
  populateMacd(snapshot, input.macd);
  populateBollinger(snapshot, input.bollinger);
  populateVolume(snapshot, input.volume);
  populateCvd(snapshot, input.cvd);
  populateOi(snapshot, input.oi);
  populateFunding(snapshot, input.funding);
  populateLongShortRatio(snapshot, input.longShortRatio);
  populateBtcContext(snapshot, input.btcContext);
  populateAdx(snapshot, input.adx);
  populateAtr(snapshot, input.atr);
  populateVwap(snapshot, input.vwap);
  populateStructure(snapshot, input.structure);
}
