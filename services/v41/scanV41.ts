import { useTradeStore } from '../../store/useTradeStore';
import { useReversalStore } from '../../store/useReversalStore';
import { useV41Store } from '../../store/useV41Store';
import { computeEntryQuality, type OpportunitySnapshot } from './entryQualityEngine';
import {
  computeRawEarlyWarning,
  type EarlyWarningResult,
  type EarlyWarningSeverity,
} from './earlyWarningEngine';
import { computeExhaustion, type ExhaustionResult } from './exhaustionEngine';
import { createNeutralSnapshot, runMarketIntelligenceLayer } from './marketIntelligenceLayer';
import { computeMomentum1H, type MomentumResult } from './momentumEngine1H';
import {
  buildProtectionSnapshot,
  NEUTRAL_PROTECTION,
  type ProtectionSnapshot,
} from './protectionLayer';
import type { KlineV41 } from './indicators';
import { fetchRawMarketV41 } from './rawMarketFetcher';
import {
  checkRetestEMA20_1H,
  checkReversalSignals,
  type ReversalState,
} from './reversalDetector';
import {
  generateReversalSetup,
  type ReversalTradeSetup,
} from './reversalTradeSetup';
import { resolveSymbolStrategy } from './strategy/resolveSymbolStrategy';
import type { MarketIntelligenceSnapshot, OpenDirection, PositionState, VisibilityMode } from './types';
import {
  resolveTradeModeUpgrade,
  resolveVisibilityHysteresis,
} from './visibilityManager';

const ACTIVE_VISIBILITY_MODES: VisibilityMode[] = [
  'WATCH_MODE',
  'TRADE_MODE',
  'POSITION_MODE',
];

/** Khớp MIN_KLINES trong momentumEngine1H — tránh gate EQ khi chưa đủ nến 1H. */
const MOMENTUM_EQ_MIN_KLINES = 22;

export type EarlyWarningSnapshot = EarlyWarningResult & {
  severity: EarlyWarningSeverity;
};

export interface SignalRowV41 {
  symbol: string;
  snapshot: MarketIntelligenceSnapshot;
  visibilityMode: VisibilityMode;
  opportunity?: OpportunitySnapshot;
  protection?: ProtectionSnapshot;
  /** Early warning đã qua hysteresis. */
  earlyWarning?: EarlyWarningSnapshot;
  /** Trạng thái đảo chiều + retest EMA20 1H. */
  reversalState?: ReversalState;
  /** Giá đóng nến 4H mới nhất — fallback khi ticker chưa tải. */
  markPrice?: number;
  klines1H?: KlineV41[];
  klines30M?: KlineV41[];
  /**
   * Task 10 wire pass-through — klines 4H đã fetch trong scan (không API mới).
   * Dùng cho Market Context / Volatility Explosion ViewModel.
   */
  klines4H?: KlineV41[];
  /** BTC 4H đã fetch cùng scan — pass-through only. */
  btcKlines4H?: KlineV41[];
  /** Funding đã fetch cùng scan — pass-through only. */
  fundingRate?: number;
  momentum?: MomentumResult;
  exhaustion?: ExhaustionResult;
  fetchedAt: number;
  error?: string;
}

export const DEFAULT_SCAN_SYMBOLS_V41 = [
  'NEARUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'BTCUSDT',
] as const;

/** Đọc vị thế OPEN từ journal — chỉ đọc store, không ghi/sync. */
export function resolvePositionState(symbol: string): PositionState {
  const entries = useTradeStore.getState().tradeJournal;
  const openEntry = entries.find((e) => e.symbol === symbol && e.status === 'OPEN');

  if (openEntry) {
    return {
      hasOpenPosition: true,
      openDirection: openEntry.direction as OpenDirection,
      symbol,
    };
  }

  return {
    hasOpenPosition: false,
    openDirection: null,
    symbol: null,
  };
}

function resolveProtection(klines: Parameters<typeof buildProtectionSnapshot>[0]): ProtectionSnapshot {
  try {
    return buildProtectionSnapshot(klines);
  } catch (error) {
    console.error('[v41] buildProtectionSnapshot failed:', error);
    return NEUTRAL_PROTECTION;
  }
}

function resolveOpportunity(
  snapshot: MarketIntelligenceSnapshot,
  hysteresisMode: VisibilityMode,
  protection: ProtectionSnapshot,
  momentum?: MomentumResult,
  exhaustion?: ExhaustionResult,
  earlyWarningBlocked?: boolean,
): OpportunitySnapshot | undefined {
  if (!ACTIVE_VISIBILITY_MODES.includes(hysteresisMode)) {
    return undefined;
  }

  return computeEntryQuality({
    snapshot,
    protection,
    momentum,
    exhaustion,
    earlyWarningBlocked,
  });
}

function resolveMomentumExhaustion(
  raw: Awaited<ReturnType<typeof fetchRawMarketV41>>,
  snapshot: MarketIntelligenceSnapshot,
): { momentum?: MomentumResult; exhaustion?: ExhaustionResult } {
  try {
    const momentum = computeMomentum1H(raw.klines1H ?? []);
    const exhaustion = computeExhaustion({
      klines1H: raw.klines1H ?? [],
      trendExhaustion: snapshot.trendExhaustion,
      trendDirection: snapshot.trendDirection,
      fundingRate: raw.fundingRate,
    });
    return { momentum, exhaustion };
  } catch (error) {
    console.error('[v41] momentum/exhaustion compute failed:', error);
    return { momentum: undefined, exhaustion: undefined };
  }
}

function resolveEarlyWarning(
  symbol: string,
  raw: Awaited<ReturnType<typeof fetchRawMarketV41>>,
  snapshot: MarketIntelligenceSnapshot,
): EarlyWarningSnapshot | undefined {
  try {
    const rawEW = computeRawEarlyWarning({
      klines30M: raw.klines30M ?? [],
      klines1H: raw.klines1H ?? [],
      btcKlines1H: raw.btcKlines1H ?? [],
      trendDirection: snapshot.trendDirection,
    });
    const stableSeverity = useV41Store
      .getState()
      .updateEarlyWarning(symbol, rawEW.rawSeverity);
    return {
      ...rawEW,
      severity: stableSeverity,
    };
  } catch (error) {
    console.error('[v41] computeRawEarlyWarning failed:', error);
    return undefined;
  }
}

function emptyReversalState(symbol: string): ReversalState {
  return {
    phase: 'NONE',
    detectedAt: 0,
    retestPrice: null,
    counterDirection: null,
    expiresAt: null,
    symbol,
  };
}

function resolveReversalState(
  symbol: string,
  raw: Awaited<ReturnType<typeof fetchRawMarketV41>>,
  snapshot: MarketIntelligenceSnapshot,
): ReversalState {
  /** Path A EMA-retest — tắt cho symbol dùng breakout strategy (NEAR). */
  if (resolveSymbolStrategy(symbol) === 'breakout') {
    return emptyReversalState(symbol);
  }

  try {
    const reversalStore = useReversalStore.getState();
    const currentRevState = reversalStore.getState(symbol);

    if (currentRevState.phase === 'NONE' || currentRevState.phase === 'EXPIRED') {
      const reversalCheck = checkReversalSignals({
        klines1H: raw.klines1H ?? [],
        klines30M: raw.klines30M ?? [],
        btcKlines1H: raw.btcKlines1H ?? [],
        trendDirection: snapshot.trendDirection,
      });

      if (reversalCheck.confirmed) {
        const counterDirection =
          snapshot.trendDirection === 'BULL' ? 'SHORT' : 'LONG';
        reversalStore.startWatching(
          symbol,
          counterDirection,
          snapshot.trendDirection,
        );
      }
    } else if (
      currentRevState.phase === 'WATCHING' &&
      currentRevState.counterDirection != null
    ) {
      const retestCheck = checkRetestEMA20_1H({
        klines1H: raw.klines1H ?? [],
        counterDirection: currentRevState.counterDirection,
      });

      if (retestCheck.confirmed && retestCheck.retestPrice != null) {
        reversalStore.confirmRetest(symbol, retestCheck.retestPrice);
      }
    }

    return reversalStore.getState(symbol);
  } catch (error) {
    console.error('[v41] reversal scan failed:', error);
    return useReversalStore.getState().getState(symbol);
  }
}

/** Build counter-trend reversal plan từ row scan — truyền đủ snapshot/opportunity/momentum. */
export function buildReversalTradeSetupFromRow(
  row: Pick<
    SignalRowV41,
    'symbol' | 'reversalState' | 'klines1H' | 'snapshot' | 'opportunity' | 'momentum'
  >,
  markPrice: number,
  options?: { marginUsdt?: number; leverage?: number },
): ReversalTradeSetup | null {
  if (!row.reversalState) return null;

  return generateReversalSetup({
    symbol: row.symbol,
    reversalState: row.reversalState,
    klines1H: row.klines1H ?? [],
    markPrice,
    marginUsdt: options?.marginUsdt,
    leverage: options?.leverage,
    snapshot: row.snapshot,
    opportunity: row.opportunity,
    momentum: row.momentum,
  });
}

async function scanOneSymbolV41(symbol: string): Promise<SignalRowV41> {
  const { previousMode } = useV41Store.getState().getSymbolState(symbol);
  const positionState = resolvePositionState(symbol);

  try {
    const raw = await fetchRawMarketV41(symbol);
    const protection = resolveProtection(raw.klines);
    const snapshot = runMarketIntelligenceLayer(raw.klines, raw.btcKlines);
    const { momentum, exhaustion } = resolveMomentumExhaustion(raw, snapshot);
    const earlyWarning = resolveEarlyWarning(symbol, raw, snapshot);
    const reversalState = resolveReversalState(symbol, raw, snapshot);
    const hysteresis = resolveVisibilityHysteresis(snapshot, positionState, previousMode);
    const klines1H = raw.klines1H ?? [];
    const opportunity = resolveOpportunity(
      snapshot,
      hysteresis.mode,
      protection,
      klines1H.length >= MOMENTUM_EQ_MIN_KLINES ? momentum : undefined,
      exhaustion,
      earlyWarning?.severity === 'BLOCK',
    );
    let visibilityMode = resolveTradeModeUpgrade(
      hysteresis.mode,
      positionState.hasOpenPosition,
      opportunity?.entryQuality ?? 0,
    );

    if (earlyWarning?.severity === 'BLOCK') {
      visibilityMode = 'WATCH_MODE';
    }

    useV41Store.getState().updateSymbolState(
      symbol,
      visibilityMode,
      snapshot,
      earlyWarning,
      opportunity,
      reversalState,
    );

    const lastClose = raw.klines.at(-1)?.close;
    const markPrice =
      lastClose != null && Number.isFinite(lastClose) ? lastClose : undefined;

    return {
      symbol: raw.symbol,
      snapshot,
      visibilityMode,
      opportunity,
      protection,
      earlyWarning,
      reversalState,
      markPrice,
      klines1H: raw.klines1H,
      klines30M: raw.klines30M,
      klines4H: raw.klines,
      btcKlines4H: raw.btcKlines,
      fundingRate: raw.fundingRate,
      momentum,
      exhaustion,
      fetchedAt: raw.fetchedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[v41] scan failed for ${symbol}:`, error);

    return {
      symbol,
      snapshot: createNeutralSnapshot(),
      visibilityMode: 'INACTIVE',
      fetchedAt: Date.now(),
      error: message,
    };
  }
}

/**
 * Scan danh sách symbol V4.1 — song song, lỗi từng symbol không dừng cả batch.
 */
export async function scanV41(
  symbols: string[] = [...DEFAULT_SCAN_SYMBOLS_V41],
): Promise<SignalRowV41[]> {
  useV41Store.getState().setScanning(true);

  try {
    const results = await Promise.allSettled(symbols.map((symbol) => scanOneSymbolV41(symbol)));

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      const symbol = symbols[index] ?? 'UNKNOWN';
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`[v41] scanV41 rejected for ${symbol}:`, result.reason);

      return {
        symbol,
        snapshot: createNeutralSnapshot(),
        visibilityMode: 'INACTIVE' as const,
        fetchedAt: Date.now(),
        error: message,
      };
    });
  } finally {
    useV41Store.getState().setScanning(false);
  }
}
