/**
 * Dữ liệu phái sinh nâng cao (CoinGlass / Coinalyze) — L11–L13 Scorer V4.
 * Fallback an toàn: API lỗi → điểm 0, không crash pipeline quét.
 */

import {
  scoreL13WhaleDelta,
  WHALE_ALIGN_BONUS_MAX,
  WHALE_TRADE_MIN_USD,
} from './whaleScoring';
import type { WhaleMarketMode } from './whaleMarketBehavior';

export { scoreL13WhaleDelta } from './whaleScoring';

export type DerivativesProvider = 'coinglass' | 'coinalyze' | 'mock';

export interface DerivativesApiConfig {
  provider: DerivativesProvider;
  apiKey: string;
  coinglassBaseUrl: string;
  coinalyzeBaseUrl: string;
  /** Bật mock khi không có API key */
  useMockWhenNoKey: boolean;
  requestTimeoutMs: number;
}

export const DEFAULT_DERIVATIVES_CONFIG: DerivativesApiConfig = {
  provider: 'coinglass',
  apiKey: '',
  coinglassBaseUrl: 'https://open-api.coinglass.com',
  coinalyzeBaseUrl: 'https://api.coinalyze.net/v1',
  useMockWhenNoKey: true,
  requestTimeoutMs: 8000,
};

export const DERIVATIVES_THRESHOLDS = {
  HEATMAP_RANGE_PCT: 5,
  STOP_HUNT_MIN_PCT: 1.5,
  STOP_HUNT_MAX_PCT: 2.0,
  WHALE_LIQ_POOL_USD: 1_000_000,
  L12_FUNDING_BONUS_PCT: 0.01,
  L11_STOP_HUNT_PENALTY: -1.5,
  L11_SAFE_BONUS: 1.0,
  L12_FUNDING_BONUS: 1.0,
  L13_WHALE_TRADE_MIN_USD: WHALE_TRADE_MIN_USD,
  L13_WHALE_ALIGN_BONUS: WHALE_ALIGN_BONUS_MAX,
} as const;

export interface DerivativesLiquidationPool {
  price: number;
  sizeUsd: number;
  /** Phe bị thanh lý tại mức giá này */
  liquidatedSide: 'LONG' | 'SHORT';
}

export interface LiquidationHeatmapResult {
  symbol: string;
  currentPrice: number;
  pools: DerivativesLiquidationPool[];
  fromMock: boolean;
  error?: string;
}

export interface AdvancedDerivativesData {
  symbol: string;
  /** Funding rate % (0.01 = 0.01%) */
  fundingRatePct: number;
  /** Taker whale delta USD — âm = bán áp đảo */
  whaleOrderDeltaUsd: number;
  fromMock: boolean;
  error?: string;
}

export interface AdvancedDerivativesScoreResult {
  liquidationRiskScore: number;
  fundingRateBonus: number;
  whaleDeltaScore: number;
  totalAdvancedScore: number;
  groupBlock: string | null;
  warnings: string[];
  isFallback: boolean;
}

export type TradeDirection = 'LONG' | 'SHORT';

let configOverride: Partial<DerivativesApiConfig> | null = null;

export function configureDerivativesApi(patch: Partial<DerivativesApiConfig>): void {
  configOverride = { ...(configOverride ?? {}), ...patch };
}

export function getDerivativesConfig(): DerivativesApiConfig {
  return { ...DEFAULT_DERIVATIVES_CONFIG, ...(configOverride ?? {}) };
}

export function resetDerivativesConfigForTests(): void {
  configOverride = null;
}

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/USDT$/i, '').toUpperCase();
}

function pctDistance(from: number, to: number): number {
  if (from <= 0) return 0;
  return ((to - from) / from) * 100;
}

function poolsWithinRange(
  pools: DerivativesLiquidationPool[],
  currentPrice: number,
  rangePct: number,
): DerivativesLiquidationPool[] {
  return pools.filter((p) => Math.abs(pctDistance(currentPrice, p.price)) <= rangePct);
}

function whalePoolInStopHuntZone(
  pools: DerivativesLiquidationPool[],
  currentPrice: number,
  direction: TradeDirection,
): DerivativesLiquidationPool | null {
  const { STOP_HUNT_MIN_PCT, STOP_HUNT_MAX_PCT, WHALE_LIQ_POOL_USD } = DERIVATIVES_THRESHOLDS;

  for (const pool of pools) {
    const dist = pctDistance(currentPrice, pool.price);
    const sizeOk = pool.sizeUsd >= WHALE_LIQ_POOL_USD;

    if (direction === 'SHORT') {
      if (dist >= STOP_HUNT_MIN_PCT && dist <= STOP_HUNT_MAX_PCT && sizeOk) {
        return pool;
      }
    } else if (dist <= -STOP_HUNT_MIN_PCT && dist >= -STOP_HUNT_MAX_PCT && sizeOk) {
      return pool;
    }
  }
  return null;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const cfg = getDerivativesConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseCoinglassHeatmap(json: unknown, currentPrice: number): DerivativesLiquidationPool[] {
  const root = json as {
    data?: Array<{ price?: number; volUsd?: number; side?: string; size?: number }>;
  };
  const rows = root.data ?? [];
  return rows
    .map((row) => ({
      price: Number(row.price ?? 0),
      sizeUsd: Number(row.volUsd ?? row.size ?? 0),
      liquidatedSide: String(row.side ?? '').toUpperCase().includes('SHORT')
        ? ('SHORT' as const)
        : ('LONG' as const),
    }))
    .filter((p) => p.price > 0 && p.sizeUsd > 0);
}

function parseCoinalyzeFunding(json: unknown): number {
  const rows = json as Array<{ funding_rate?: number; rate?: number }>;
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const raw = rows[0].funding_rate ?? rows[0].rate ?? 0;
  return Number(raw) * 100;
}

export function mockLiquidationHeatmap(
  symbol: string,
  currentPrice: number,
  scenario: 'safe' | 'stop_hunt_above' | 'stop_hunt_below' = 'safe',
): LiquidationHeatmapResult {
  const pools: DerivativesLiquidationPool[] = [];

  if (scenario === 'stop_hunt_above') {
    pools.push({
      price: currentPrice * 1.0175,
      sizeUsd: 1_500_000,
      liquidatedSide: 'SHORT',
    });
  } else if (scenario === 'stop_hunt_below') {
    pools.push({
      price: currentPrice * 0.9825,
      sizeUsd: 1_200_000,
      liquidatedSide: 'LONG',
    });
  } else {
    pools.push({
      price: currentPrice * 1.04,
      sizeUsd: 400_000,
      liquidatedSide: 'LONG',
    });
  }

  return { symbol, currentPrice, pools, fromMock: true };
}

export function mockAdvancedDerivativesData(
  symbol: string,
  scenario: 'short_friendly' | 'whale_conflict' | 'neutral' = 'short_friendly',
): AdvancedDerivativesData {
  if (scenario === 'short_friendly') {
    return {
      symbol,
      fundingRatePct: 0.012,
      whaleOrderDeltaUsd: -250_000,
      fromMock: true,
    };
  }
  if (scenario === 'whale_conflict') {
    return {
      symbol,
      fundingRatePct: 0.008,
      whaleOrderDeltaUsd: 180_000,
      fromMock: true,
    };
  }
  return {
    symbol,
    fundingRatePct: 0.003,
    whaleOrderDeltaUsd: 20_000,
    fromMock: true,
  };
}

export async function fetchLiquidationHeatmap(
  symbol: string,
  currentPrice: number,
): Promise<LiquidationHeatmapResult> {
  const cfg = getDerivativesConfig();
  const base = { symbol, currentPrice, pools: [] as DerivativesLiquidationPool[], fromMock: false };

  if (cfg.useMockWhenNoKey && !cfg.apiKey) {
    return mockLiquidationHeatmap(symbol, currentPrice, 'safe');
  }

  try {
    if (cfg.provider === 'coinglass') {
      const coin = normalizeSymbol(symbol);
      const url =
        `${cfg.coinglassBaseUrl}/public/v2/liquidation_heatmap?` +
        `symbol=${coin}&range=${DERIVATIVES_THRESHOLDS.HEATMAP_RANGE_PCT}`;
      const json = await fetchJson(url, {
        Accept: 'application/json',
        'CG-API-KEY': cfg.apiKey,
      });
      const pools = poolsWithinRange(
        parseCoinglassHeatmap(json, currentPrice),
        currentPrice,
        DERIVATIVES_THRESHOLDS.HEATMAP_RANGE_PCT,
      );
      return { ...base, pools };
    }

    return mockLiquidationHeatmap(symbol, currentPrice, 'safe');
  } catch (error) {
    console.warn('derivatives_heatmap_fetch_failed', String(error));
    return { ...base, fromMock: true, error: String(error) };
  }
}

export async function fetchAdvancedDerivativesData(
  symbol: string,
): Promise<AdvancedDerivativesData> {
  const cfg = getDerivativesConfig();

  if (cfg.useMockWhenNoKey && !cfg.apiKey) {
    return mockAdvancedDerivativesData(symbol, 'neutral');
  }

  try {
    if (cfg.provider === 'coinalyze') {
      const url =
        `${cfg.coinalyzeBaseUrl}/funding-rate/latest?symbols=${symbol.toLowerCase()}`;
      const json = await fetchJson(url, {
        Accept: 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      });
      return {
        symbol,
        fundingRatePct: parseCoinalyzeFunding(json),
        whaleOrderDeltaUsd: 0,
        fromMock: false,
      };
    }

    if (cfg.provider === 'coinglass') {
      const coin = normalizeSymbol(symbol);
      const url = `${cfg.coinglassBaseUrl}/public/v2/funding?symbol=${coin}`;
      const json = await fetchJson(url, {
        Accept: 'application/json',
        'CG-API-KEY': cfg.apiKey,
      });
      const data = json as { data?: Array<{ rate?: number; fundingRate?: number }> };
      const row = data.data?.[0];
      const rate = Number(row?.rate ?? row?.fundingRate ?? 0);
      return {
        symbol,
        fundingRatePct: rate * 100,
        whaleOrderDeltaUsd: 0,
        fromMock: false,
      };
    }

    return mockAdvancedDerivativesData(symbol, 'neutral');
  } catch (error) {
    console.warn('derivatives_advanced_fetch_failed', String(error));
    return {
      symbol,
      fundingRatePct: 0,
      whaleOrderDeltaUsd: 0,
      fromMock: true,
      error: String(error),
    };
  }
}

export function scoreL11LiquidationRisk(
  direction: TradeDirection,
  currentPrice: number,
  heatmap: LiquidationHeatmapResult | null,
): { score: number; warning: string | null } {
  if (!heatmap || heatmap.pools.length === 0) {
    return { score: 0, warning: null };
  }

  const huntPool = whalePoolInStopHuntZone(heatmap.pools, currentPrice, direction);
  if (huntPool) {
    return {
      score: DERIVATIVES_THRESHOLDS.L11_STOP_HUNT_PENALTY,
      warning:
        `⚠️ Stop-hunt risk: cụm thanh lý ~$${(huntPool.sizeUsd / 1e6).toFixed(1)}M ` +
        `tại ${huntPool.price.toFixed(2)} (${direction})`,
    };
  }

  return {
    score: DERIVATIVES_THRESHOLDS.L11_SAFE_BONUS,
    warning: null,
  };
}

export function scoreL12FundingBonus(
  direction: TradeDirection,
  fundingRatePct: number,
): number {
  if (
    direction === 'SHORT' &&
    fundingRatePct > DERIVATIVES_THRESHOLDS.L12_FUNDING_BONUS_PCT
  ) {
    return DERIVATIVES_THRESHOLDS.L12_FUNDING_BONUS;
  }
  if (
    direction === 'LONG' &&
    fundingRatePct < -DERIVATIVES_THRESHOLDS.L12_FUNDING_BONUS_PCT
  ) {
    return DERIVATIVES_THRESHOLDS.L12_FUNDING_BONUS;
  }
  return 0;
}

export function computeAdvancedDerivativesScore(
  direction: TradeDirection,
  currentPrice: number,
  heatmap: LiquidationHeatmapResult | null,
  advanced: AdvancedDerivativesData | null,
  marketMode?: WhaleMarketMode | string,
): AdvancedDerivativesScoreResult {
  const isFallback =
    !heatmap ||
    !advanced ||
    heatmap.error != null ||
    advanced.error != null ||
    (heatmap.fromMock && advanced.fromMock && !getDerivativesConfig().apiKey);

  if (isFallback && (!heatmap?.pools.length || !advanced)) {
    return {
      liquidationRiskScore: 0,
      fundingRateBonus: 0,
      whaleDeltaScore: 0,
      totalAdvancedScore: 0,
      groupBlock: null,
      warnings: [],
      isFallback: true,
    };
  }

  const l11 = scoreL11LiquidationRisk(direction, currentPrice, heatmap);
  const fundingRateBonus = scoreL12FundingBonus(
    direction,
    advanced?.fundingRatePct ?? 0,
  );
  const l13 = scoreL13WhaleDelta(
    direction,
    advanced?.whaleOrderDeltaUsd ?? 0,
    marketMode,
  );

  const warnings: string[] = [];
  if (l11.warning) warnings.push(l11.warning);

  return {
    liquidationRiskScore: l11.score,
    fundingRateBonus,
    whaleDeltaScore: l13.score,
    totalAdvancedScore: l11.score + fundingRateBonus + l13.score,
    groupBlock: l13.groupBlock,
    warnings,
    isFallback: false,
  };
}

/** Fetch + chấm L11–L13 một lần — dùng trước khi wire vào Scorer V4. */
export async function fetchAndScoreAdvancedDerivatives(
  symbol: string,
  currentPrice: number,
  direction: TradeDirection,
): Promise<AdvancedDerivativesScoreResult> {
  try {
    const [heatmap, advanced] = await Promise.all([
      fetchLiquidationHeatmap(symbol, currentPrice),
      fetchAdvancedDerivativesData(symbol),
    ]);
    return computeAdvancedDerivativesScore(direction, currentPrice, heatmap, advanced);
  } catch (error) {
    console.warn('derivatives_score_failed', String(error));
    return {
      liquidationRiskScore: 0,
      fundingRateBonus: 0,
      whaleDeltaScore: 0,
      totalAdvancedScore: 0,
      groupBlock: null,
      warnings: [],
      isFallback: true,
    };
  }
}
