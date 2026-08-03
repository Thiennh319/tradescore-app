/**
 * TASK R1.5 — Market Snapshot Export (Architecture: FROZEN).
 *
 * Read-only export of the frozen market snapshot the Rule Engine consumed.
 * This is rule INPUT data, not post-rule output.
 *
 * The exporter copies values only: no indicator recalculation, no market
 * scan, no Binance calls, no Store mutation. Missing values export as null.
 * Raw numeric values are kept as numbers (never stringified/formatted) so
 * AI can verify rule evaluation independently.
 */

export type SnapshotValue = number | string | boolean | null;

export interface MarketSnapshotTrend {
  ema20?: number | null;
  ema50?: number | null;
  ema200?: number | null;
  emaAlignment?: string | null;
  emaSlope?: string | null;
  trendDirection?: string | null;
  trendStrength?: number | null;
}

export interface MarketSnapshotMomentum {
  rsi?: number | null;
  macd?: number | null;
  signal?: number | null;
  histogram?: number | null;
  atr?: number | null;
}

export interface MarketSnapshotVolume {
  volume?: number | null;
  volumeMA20?: number | null;
  volumeRatio?: number | null;
  buyVolume?: number | null;
  sellVolume?: number | null;
  deltaVolume?: number | null;
}

export interface MarketSnapshotVolatility {
  atr?: number | null;
  atrPct?: number | null;
}

export interface MarketSnapshotOrderflow {
  cvd?: number | null;
  cvdTrend?: string | null;
  cvdStrength?: number | null;
  whaleSupport?: number | null;
  whaleResistance?: number | null;
  largestBid?: number | null;
  largestAsk?: number | null;
}

export interface MarketSnapshotDerivatives {
  openInterest?: number | null;
  oiChange?: number | null;
  fundingRate?: number | null;
  longShortRatio?: number | null;
}

export interface MarketSnapshotLiquidity {
  spread?: number | null;
  depth?: number | null;
  slippage?: number | null;
}

export interface MarketSnapshotSupportResistance {
  support?: readonly number[] | null;
  resistance?: readonly number[] | null;
  nearestSupport?: number | null;
  nearestResistance?: number | null;
  distanceSupport?: number | null;
  distanceResistance?: number | null;
}

export interface MarketSnapshotExecution {
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  riskReward?: number | null;
  positionSize?: number | null;
}

/**
 * Frozen market snapshot as consumed by the Rule Engine.
 * The exporter never builds a new snapshot — this must be the exact
 * object (or a frozen clone) the rules evaluated.
 */
export interface MarketSnapshot {
  symbol?: string | null;
  timeframe?: string | null;
  market?: string | null;
  /** ISO timestamp of capture — keeps generatedAt deterministic. */
  capturedAt?: string | null;
  trend?: MarketSnapshotTrend | null;
  momentum?: MarketSnapshotMomentum | null;
  volume?: MarketSnapshotVolume | null;
  volatility?: MarketSnapshotVolatility | null;
  liquidity?: MarketSnapshotLiquidity | null;
  orderflow?: MarketSnapshotOrderflow | null;
  derivatives?: MarketSnapshotDerivatives | null;
  supportResistance?: MarketSnapshotSupportResistance | null;
  execution?: MarketSnapshotExecution | null;
  /** Optional raw values recorded by the engine — copied verbatim. */
  rawEvidence?: Readonly<Record<string, SnapshotValue>> | null;
}

export interface MarketSnapshotExportTrend {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  emaAlignment: string | null;
  emaSlope: string | null;
  trendDirection: string | null;
  trendStrength: number | null;
}

export interface MarketSnapshotExportMomentum {
  rsi: number | null;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
  atr: number | null;
}

export interface MarketSnapshotExportVolume {
  volume: number | null;
  volumeMA20: number | null;
  volumeRatio: number | null;
  buyVolume: number | null;
  sellVolume: number | null;
  deltaVolume: number | null;
}

export interface MarketSnapshotExportVolatility {
  atr: number | null;
  atrPct: number | null;
}

export interface MarketSnapshotExportOrderflow {
  cvd: number | null;
  cvdTrend: string | null;
  cvdStrength: number | null;
  whaleSupport: number | null;
  whaleResistance: number | null;
  largestBid: number | null;
  largestAsk: number | null;
}

export interface MarketSnapshotExportDerivatives {
  openInterest: number | null;
  oiChange: number | null;
  fundingRate: number | null;
  longShortRatio: number | null;
}

export interface MarketSnapshotExportLiquidity {
  spread: number | null;
  depth: number | null;
  slippage: number | null;
}

export interface MarketSnapshotExportSupportResistance {
  support: readonly number[];
  resistance: readonly number[];
  nearestSupport: number | null;
  nearestResistance: number | null;
  distanceSupport: number | null;
  distanceResistance: number | null;
}

export interface MarketSnapshotExportExecution {
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  positionSize: number | null;
}

export interface MarketSnapshotExport {
  version: 1;
  generatedAt: string;
  fingerprint: string;
  symbol: string | null;
  timeframe: string | null;
  market: string | null;
  trend: MarketSnapshotExportTrend;
  momentum: MarketSnapshotExportMomentum;
  volume: MarketSnapshotExportVolume;
  volatility: MarketSnapshotExportVolatility;
  liquidity: MarketSnapshotExportLiquidity;
  orderflow: MarketSnapshotExportOrderflow;
  derivatives: MarketSnapshotExportDerivatives;
  supportResistance: MarketSnapshotExportSupportResistance;
  execution: MarketSnapshotExportExecution;
  /** Flat raw values for AI verification — numbers stay numbers. */
  rawEvidence: Record<string, SnapshotValue>;
}

const SNAPSHOT_EXPORT_VERSION = 1 as const;

/** FNV-1a 32-bit → hex — same deterministic pattern as RuleMatrixExporter. */
function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numArray(value: readonly number[] | null | undefined): readonly number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'number' && Number.isFinite(v));
}

function rawValue(value: SnapshotValue | undefined): SnapshotValue {
  if (value === undefined) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

function copyTrend(trend: MarketSnapshotTrend | null | undefined): MarketSnapshotExportTrend {
  return {
    ema20: num(trend?.ema20),
    ema50: num(trend?.ema50),
    ema200: num(trend?.ema200),
    emaAlignment: str(trend?.emaAlignment),
    emaSlope: str(trend?.emaSlope),
    trendDirection: str(trend?.trendDirection),
    trendStrength: num(trend?.trendStrength),
  };
}

function copyMomentum(
  momentum: MarketSnapshotMomentum | null | undefined,
): MarketSnapshotExportMomentum {
  return {
    rsi: num(momentum?.rsi),
    macd: num(momentum?.macd),
    signal: num(momentum?.signal),
    histogram: num(momentum?.histogram),
    atr: num(momentum?.atr),
  };
}

function copyVolume(
  volume: MarketSnapshotVolume | null | undefined,
): MarketSnapshotExportVolume {
  return {
    volume: num(volume?.volume),
    volumeMA20: num(volume?.volumeMA20),
    volumeRatio: num(volume?.volumeRatio),
    buyVolume: num(volume?.buyVolume),
    sellVolume: num(volume?.sellVolume),
    deltaVolume: num(volume?.deltaVolume),
  };
}

function copyVolatility(
  volatility: MarketSnapshotVolatility | null | undefined,
): MarketSnapshotExportVolatility {
  return {
    atr: num(volatility?.atr),
    atrPct: num(volatility?.atrPct),
  };
}

function copyOrderflow(
  orderflow: MarketSnapshotOrderflow | null | undefined,
): MarketSnapshotExportOrderflow {
  return {
    cvd: num(orderflow?.cvd),
    cvdTrend: str(orderflow?.cvdTrend),
    cvdStrength: num(orderflow?.cvdStrength),
    whaleSupport: num(orderflow?.whaleSupport),
    whaleResistance: num(orderflow?.whaleResistance),
    largestBid: num(orderflow?.largestBid),
    largestAsk: num(orderflow?.largestAsk),
  };
}

function copyDerivatives(
  derivatives: MarketSnapshotDerivatives | null | undefined,
): MarketSnapshotExportDerivatives {
  return {
    openInterest: num(derivatives?.openInterest),
    oiChange: num(derivatives?.oiChange),
    fundingRate: num(derivatives?.fundingRate),
    longShortRatio: num(derivatives?.longShortRatio),
  };
}

function copyLiquidity(
  liquidity: MarketSnapshotLiquidity | null | undefined,
): MarketSnapshotExportLiquidity {
  return {
    spread: num(liquidity?.spread),
    depth: num(liquidity?.depth),
    slippage: num(liquidity?.slippage),
  };
}

function copySupportResistance(
  sr: MarketSnapshotSupportResistance | null | undefined,
): MarketSnapshotExportSupportResistance {
  return {
    support: numArray(sr?.support),
    resistance: numArray(sr?.resistance),
    nearestSupport: num(sr?.nearestSupport),
    nearestResistance: num(sr?.nearestResistance),
    distanceSupport: num(sr?.distanceSupport),
    distanceResistance: num(sr?.distanceResistance),
  };
}

function copyExecution(
  execution: MarketSnapshotExecution | null | undefined,
): MarketSnapshotExportExecution {
  return {
    entryPrice: num(execution?.entryPrice),
    stopLoss: num(execution?.stopLoss),
    takeProfit: num(execution?.takeProfit),
    riskReward: num(execution?.riskReward),
    positionSize: num(execution?.positionSize),
  };
}

/**
 * Flat raw values for AI verification.
 * Copies the engine-provided rawEvidence verbatim; when absent, projects the
 * already-copied section values (projection of existing data — no computation).
 */
function buildRawEvidence(
  snapshot: MarketSnapshot,
  sections: {
    trend: MarketSnapshotExportTrend;
    momentum: MarketSnapshotExportMomentum;
    volume: MarketSnapshotExportVolume;
    orderflow: MarketSnapshotExportOrderflow;
    derivatives: MarketSnapshotExportDerivatives;
    liquidity: MarketSnapshotExportLiquidity;
  },
): Record<string, SnapshotValue> {
  if (snapshot.rawEvidence != null) {
    const out: Record<string, SnapshotValue> = {};
    for (const key of Object.keys(snapshot.rawEvidence).sort()) {
      out[key] = rawValue(snapshot.rawEvidence[key]);
    }
    return out;
  }

  return {
    cvd: sections.orderflow.cvd,
    ema20: sections.trend.ema20,
    ema50: sections.trend.ema50,
    ema200: sections.trend.ema200,
    fundingRate: sections.derivatives.fundingRate,
    oi: sections.derivatives.openInterest,
    spread: sections.liquidity.spread,
    volume: sections.volume.volume,
  };
}

/** Deterministic content string — excludes generatedAt (timestamp-independent). */
function fingerprintContent(out: Omit<MarketSnapshotExport, 'fingerprint' | 'generatedAt'>): string {
  const stable = (value: unknown): string => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys.map((k) => `${k}:${stable(record[k])}`).join(',')}}`;
    }
    return String(value);
  };
  return stable(out);
}

/**
 * Build the Market Snapshot export from the frozen snapshot the rules used.
 *
 * O(n) over snapshot fields. Read-only: input is never mutated and no
 * indicator is recalculated — values are copied (or null when absent).
 */
export function buildMarketSnapshotExport(
  snapshot: MarketSnapshot,
): MarketSnapshotExport {
  const trend = copyTrend(snapshot.trend);
  const momentum = copyMomentum(snapshot.momentum);
  const volume = copyVolume(snapshot.volume);
  const volatility = copyVolatility(snapshot.volatility);
  const liquidity = copyLiquidity(snapshot.liquidity);
  const orderflow = copyOrderflow(snapshot.orderflow);
  const derivatives = copyDerivatives(snapshot.derivatives);
  const supportResistance = copySupportResistance(snapshot.supportResistance);
  const execution = copyExecution(snapshot.execution);
  const rawEvidence = buildRawEvidence(snapshot, {
    trend,
    momentum,
    volume,
    orderflow,
    derivatives,
    liquidity,
  });

  const body = {
    version: SNAPSHOT_EXPORT_VERSION,
    symbol: str(snapshot.symbol),
    timeframe: str(snapshot.timeframe),
    market: str(snapshot.market),
    trend,
    momentum,
    volume,
    volatility,
    liquidity,
    orderflow,
    derivatives,
    supportResistance,
    execution,
    rawEvidence,
  };

  return {
    ...body,
    generatedAt: snapshot.capturedAt ?? new Date().toISOString(),
    fingerprint: fnv1aHex(fingerprintContent(body)),
  };
}
