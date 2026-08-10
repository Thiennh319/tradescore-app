import { describe, expect, it, vi } from 'vitest';
import type { Kline } from './binanceApi';
import type { BollingerAnalysisV3, EMAAnalysisV3, MACDAnalysisV3 } from './indicators';
import {
  scoreL1V4,
  scoreL3V4,
  scoreL4V4,
  scoreL5aV4,
  scoreL5bV4,
  scoreL6V4,
  scoreAnalysisV4,
  canEnterV4,
  scoringLayersToDisplayV4,
  suggestDirectionV4,
  type AnalysisInputV4,
} from './scorerV4';
import { scoreAnalysisV3 } from './scorerV3';
import { computeAtr1hFromKlines } from './atr1h';
import type { AnalysisInput } from './analysisInput';
import { DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST, FundingState } from '../constants/scoring';
import { LAYER_L5B_ID } from '../constants/scoring';
import { getEMAAnalysisV3, getFundingAnalysisV3 } from './indicators';
import { applyXrpOnlyCvdVolRelScale } from './xrpCvdVolRelScale';

function ema(overrides: Partial<EMAAnalysisV3> = {}): EMAAnalysisV3 {
  return {
    ema20: 100,
    ema50: 99,
    ema200: 98,
    slope20: 'UP',
    slope50: 'UP',
    priceVsEma20Pct: 1,
    priceVsEma50Pct: 1.5,
    priceAboveEma20: true,
    priceAboveEma50: true,
    ...overrides,
  };
}

function klines(closes: number[]): Kline[] {
  return closes.map((close, i) => ({
    openTime: i,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 2000,
    closeTime: i + 1,
    quoteVolume: 2000,
    trades: 20,
    takerBuyBaseVolume: 1000,
    takerBuyQuoteVolume: 1000,
  }));
}

function risingKlines(n: number, start = 100): Kline[] {
  const closes: number[] = [];
  for (let i = 0; i < n; i++) closes.push(start + i * 0.8);
  return klines(closes);
}

function baseInput(overrides?: Partial<AnalysisInput>): AnalysisInput {
  const klines1h = risingKlines(120, 100);
  const klines4h = risingKlines(80, 95);
  const currentPrice = klines1h[klines1h.length - 1].close;
  return {
    symbol: 'BTCUSDT',
    currentPrice,
    klines1h,
    klines4h,
    fundingRate: -0.005,
    oiCurrent: 1_000_000,
    oiPrevious: 990_000,
    topLongShortRatios: [0.95, 0.92, 0.9, 0.88],
    globalLongShortRatios: [0.95, 0.92, 0.9, 0.88],
    btc24hChangePct: 1.5,
    cvdPoints: klines1h.slice(-20).map((k, i) => ({
      timestamp: k.openTime,
      cvd: i * 50_000,
      price: k.close,
    })),
    psychologyChecklist: {
      ...DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
      alert: true,
      slTpReady: true,
    },
    priceChangePct1h: 0.5,
    atr1h: computeAtr1hFromKlines(klines1h, currentPrice),
    ...overrides,
  };
}

function macd(histogram: number, extras: Partial<MACDAnalysisV3> = {}): MACDAnalysisV3 {
  return {
    macd: histogram,
    signal: 0,
    histogram,
    isTurningUp: false,
    isTurningDown: false,
    crossedZeroRecentlyUp: false,
    crossedZeroRecentlyDown: false,
    ...extras,
  };
}

function bb(percentB: number, marketMode: 'TRENDING' | 'RANGING'): BollingerAnalysisV3 {
  return {
    upper: new Float32Array([110]),
    middle: new Float32Array([100]),
    lower: new Float32Array([90]),
    percentB,
    bandwidth: 5,
    bandwidthSlope: marketMode === 'TRENDING' ? 'EXPANDING' : 'FLAT',
    marketMode,
  };
}

describe('scorerV4 L4 BB SHORT', () => {
  it('RANGING %B=17 giá đáy dải → 0đ', () => {
    const r = scoreL4V4('SHORT', bb(17, 'RANGING'));
    expect(r.score).toBe(0);
    expect(r.reason).toContain('đáy dải');
  });

  it('RANGING %B=50 vùng giữa → 2đ', () => {
    expect(scoreL4V4('SHORT', bb(50, 'RANGING')).score).toBe(2);
  });

  it('TRENDING %B=17 ride band → 2đ', () => {
    expect(scoreL4V4('SHORT', bb(17, 'TRENDING')).score).toBe(2);
  });

  it('TRENDING %B=75 → 0đ', () => {
    expect(scoreL4V4('SHORT', bb(75, 'TRENDING')).score).toBe(0);
  });
});

describe('scorerV4 L1 EMA mâu thuẫn', () => {
  it('LONG mâu thuẫn 1H/4H hiển thị 1đ', () => {
    const ema1hAbove = ema({ priceAboveEma20: true, priceAboveEma50: true, priceVsEma20Pct: 3 });
    const ema4hBelow = ema({
      priceAboveEma20: false,
      priceAboveEma50: false,
      priceVsEma20Pct: -3,
      slope20: 'DOWN',
    });
    const r = scoreL1V4('LONG', ema1hAbove, ema4hBelow);
    expect(r.reason).toContain('Mâu thuẫn 1H vs 4H');
    const [display] = scoringLayersToDisplayV4([r]);
    expect(display.score).toBe(1);
  });

  it('SHORT mâu thuẫn 1H/4H hiển thị 1đ', () => {
    const ema1hBelow = ema({
      priceAboveEma20: false,
      priceAboveEma50: false,
      priceVsEma20Pct: -3,
      slope20: 'DOWN',
    });
    const ema4hAbove = ema({ priceAboveEma20: true, priceAboveEma50: true, priceVsEma20Pct: 3 });
    const r = scoreL1V4('SHORT', ema1hBelow, ema4hAbove);
    expect(r.reason).toContain('Mâu thuẫn 1H vs 4H');
    const [display] = scoringLayersToDisplayV4([r]);
    expect(display.score).toBe(1);
  });

  it('SHORT partial bearish — dưới EMA20, trên EMA50 (1H)', () => {
    const ema1hPartial = ema({
      priceAboveEma20: false,
      priceAboveEma50: true,
      slope20: 'FLAT',
      slope50: 'FLAT',
    });
    const ema4hAbove = ema({
      priceAboveEma20: true,
      priceAboveEma50: true,
      slope20: 'FLAT',
      slope50: 'FLAT',
    });
    const r = scoreL1V4('SHORT', ema1hPartial, ema4hAbove);
    expect(r.score).toBe(1.0);
    expect(r.reason).toContain('chưa qua EMA50');
  });

  it('SHORT else — cả 2 khung trên EMA20 và EMA50', () => {
    const ema1hAbove = ema({
      priceAboveEma20: true,
      priceAboveEma50: true,
      slope20: 'FLAT',
      slope50: 'FLAT',
    });
    const ema4hAbove = ema({
      priceAboveEma20: true,
      priceAboveEma50: true,
      slope20: 'FLAT',
      slope50: 'FLAT',
    });
    const r = scoreL1V4('SHORT', ema1hAbove, ema4hAbove);
    expect(r.score).toBe(0);
    expect(r.reason).toContain('EMA chưa đồng thuận');
  });
});

describe('scorerV4 L3 MACD SHORT', () => {
  it('both histogram negative gets 2', () => {
    const r = scoreL3V4('SHORT', macd(-0.5), macd(-0.3));
    expect(r.score).toBe(2);
    expect(r.reason).toContain('Histogram âm cả 1H & 4H');
  });

  it('both negative with turning down still gets 2 not 1.5', () => {
    const r = scoreL3V4(
      'SHORT',
      macd(-0.5, { isTurningDown: true }),
      macd(-0.3, { isTurningDown: true }),
    );
    expect(r.score).toBe(2);
  });

  it('both positive histogram VI PHẠM', () => {
    const r = scoreL3V4('SHORT', macd(0.5), macd(0.3));
    expect(r.score).toBe(0);
    expect(r.reason).toContain('VI PHẠM');
  });
});

describe('scorerV4 L3 MACD LONG', () => {
  it('h1 negative h4 positive gets 1 khung thuận', () => {
    const r = scoreL3V4('LONG', macd(-42.29), macd(145.61));
    expect(r.score).toBe(1);
    expect(r.reason).toContain('1 khung thuận');
  });

  it('h1 positive h4 negative gets 1 khung thuận', () => {
    const r = scoreL3V4('LONG', macd(0.5), macd(-0.3));
    expect(r.score).toBe(1);
    expect(r.reason).toContain('1 khung thuận');
  });
});

describe('scorerV4 L5a CVD', () => {
  function cvdPointsWithMomentum(
    currentCvd: number,
    cvdMomentum24h: number,
    barCount = 25,
  ) {
    const startCvd = currentCvd - cvdMomentum24h;
    return Array.from({ length: barCount }, (_, i) => ({
      timestamp: i * 3_600_000,
      cvd: startCvd + ((currentCvd - startCvd) * i) / (barCount - 1),
      price: 100 - i * 0.1,
    }));
  }

  it('LONG 2đ when CVD positive and slope up', () => {
    const points = risingKlines(12).map((k, i) => ({
      timestamp: k.openTime,
      cvd: 100_000 + i * 20_000,
      price: k.close,
    }));
    const { layerResult, hardBlock } = scoreL5aV4('LONG', points, {
      currentPrice: 110,
      ema20: 105,
    });
    expect(layerResult.score).toBe(2);
    expect(hardBlock).toBeNull();
  });

  it('LONG hard blocks only when deep negative, momentum < -3M, price < EMA20', () => {
    const points = cvdPointsWithMomentum(-25_000_000, -3_500_000);
    const { hardBlock, layerResult } = scoreL5aV4('LONG', points, {
      currentPrice: 95,
      ema20: 100,
    });
    expect(hardBlock).toBe('CVD deeply negative and still deteriorating.');
    expect(layerResult.score).toBe(0);
  });

  it('LONG does not hard block at -2.5M CVD (legacy threshold removed)', () => {
    const { hardBlock } = scoreL5aV4(
      'LONG',
      [{ timestamp: 1, price: 95, cvd: -2_500_000 }],
      { currentPrice: 95, ema20: 100 },
    );
    expect(hardBlock).toBeNull();
  });

  it('LONG RECOVERING: soft warning, -1 L5a penalty, no hard block', () => {
    const points = cvdPointsWithMomentum(-25_000_000, 3_500_000);
    const { hardBlock, warning, layerResult } = scoreL5aV4('LONG', points, {
      currentPrice: 95,
      ema20: 100,
    });
    expect(hardBlock).toBeNull();
    expect(warning).toBe(
      'CVD deeply negative but recovering. Confidence slightly reduced.',
    );
    expect(layerResult.reason).toContain(
      'CVD deeply negative but recovering. Confidence slightly reduced.',
    );
    expect(layerResult.score).toBe(0);
  });

  it('SHORT hard block unchanged when CVD > +2M', () => {
    const { hardBlock } = scoreL5aV4('SHORT', [
      { timestamp: 1, price: 100, cvd: 2_500_000 },
    ]);
    expect(hardBlock).toContain('+2M');
  });

  it('L5a score < 1 goes to blockReasons not hardBlocks', () => {
    const input: AnalysisInputV4 = {
      ...(baseInput() as AnalysisInputV4),
      cvdPoints: [{ timestamp: 1, price: 100, cvd: 2_000 }],
    };
    const result = scoreAnalysisV4(input, { consecutiveLosses: 0, dailyLossUSDT: 0 });
    const side = result.long;

    expect(side.hardBlocks.some((b) => b.startsWith('L5a CVD chưa đủ'))).toBe(false);
    expect(side.blockReasons.some((b) => b.startsWith('L5a CVD chưa đủ'))).toBe(true);
    expect(canEnterV4(side)).toBe(false);
  });

  it('L5b only scores Volume/OI without CVD', () => {
    const result = scoreL5bV4('LONG', klines([100, 101, 102]), 1_000_000, 990_000, 0.5);
    expect(result.layerNumber).toBe(LAYER_L5B_ID);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe('scorerV4 L6 Funding', () => {
  const squeezeMetrics = {
    fundingCurrent: -0.008,
    fundingVelocity: -0.001,
    fundingAcceleration: -0.0002,
    fundingAvg8: -0.007,
    fundingAvg16: -0.006,
  };

  it('SHORT_SQUEEZE_BUILDING → LONG raw 2, SHORT raw 0', () => {
    const funding = getFundingAnalysisV3([{ rate: -0.008, timestamp: 1 }]);
    const long = scoreL6V4('LONG', funding, squeezeMetrics);
    const short = scoreL6V4('SHORT', funding, squeezeMetrics);
    expect(long.layerResult.score).toBe(2);
    expect(short.layerResult.score).toBe(0);
    expect(long.layerResult.maxScore).toBe(2);
  });

  it('NEUTRAL → LONG raw 1, SHORT raw 1', () => {
    const neutralMetrics = {
      fundingCurrent: 0.003,
      fundingVelocity: 0.001,
      fundingAcceleration: 0,
      fundingAvg8: 0.003,
      fundingAvg16: 0.002,
    };
    const funding = getFundingAnalysisV3([{ rate: 0.003, timestamp: 1 }]);
    const long = scoreL6V4('LONG', funding, neutralMetrics);
    const short = scoreL6V4('SHORT', funding, neutralMetrics);
    expect(long.layerResult.score).toBe(1);
    expect(short.layerResult.score).toBe(1);
  });

  const elevatedFundingMetrics = {
    fundingCurrent: 0.0095,
    fundingVelocity: 0,
    fundingAcceleration: 0,
    fundingAvg8: 0.0095,
    fundingAvg16: 0.009,
  };

  it('LONG_FUNDING_ELEVATED → LONG raw 0.5 display 0.375', () => {
    const funding = getFundingAnalysisV3([{ rate: 0.0095, timestamp: 1 }]);
    const { layerResult } = scoreL6V4('LONG', funding, elevatedFundingMetrics);
    expect(layerResult.score).toBe(0.5);
    const [display] = scoringLayersToDisplayV4([layerResult]);
    expect(display.score).toBe(0.38);
  });

  it('LONG_FUNDING_ELEVATED → SHORT raw 1.5 display 1.125', () => {
    const funding = getFundingAnalysisV3([{ rate: 0.0095, timestamp: 1 }]);
    const { layerResult } = scoreL6V4('SHORT', funding, elevatedFundingMetrics);
    expect(layerResult.score).toBe(1.5);
    const [display] = scoringLayersToDisplayV4([layerResult]);
    expect(display.score).toBe(1.13);
  });

  it('fundingCurrent > 0.03% HARD BLOCKs LONG regardless of state', () => {
    const euphoriaMetrics = {
      fundingCurrent: 0.035,
      fundingVelocity: 0.002,
      fundingAcceleration: 0.001,
      fundingAvg8: 0.03,
      fundingAvg16: 0.025,
    };
    const funding = getFundingAnalysisV3([{ rate: 0.035, timestamp: 1 }]);
    const { hardBlock, layerResult } = scoreL6V4('LONG', funding, euphoriaMetrics);
    expect(hardBlock).toContain('chặn Long');
    expect(layerResult.score).toBe(0);
  });

  it('fallback when fundingMetrics null uses legacy scoring without crash', () => {
    const funding = getFundingAnalysisV3([
      { rate: -0.01, timestamp: 1 },
      { rate: -0.02, timestamp: 2 },
    ]);
    const { layerResult } = scoreL6V4('LONG', funding, null);
    expect(layerResult.maxScore).toBe(1);
    expect(layerResult.score).toBeLessThanOrEqual(1);

    const result = scoreAnalysisV4(baseInput() as AnalysisInputV4, {
      consecutiveLosses: 0,
      dailyLossUSDT: 0,
    });
    expect(result.l6Detail.isFallback).toBe(true);
    expect(result.long.rawLayerScores[6]).toBeDefined();
  });

  it('scoreAnalysisV4 exposes l6Detail with FundingState', () => {
    const input: AnalysisInputV4 = {
      ...(baseInput() as AnalysisInputV4),
      fundingHistory: [{ rate: -0.008, timestamp: 1 }],
      fundingMetrics: squeezeMetrics,
    };
    const result = scoreAnalysisV4(input, { consecutiveLosses: 0, dailyLossUSDT: 0 });
    expect(result.l6Detail.fundingState).toBe(FundingState.SHORT_SQUEEZE_BUILDING);
    expect(result.l6Detail.isFallback).toBe(false);
    expect(result.long.rawLayerScores[6]).toBe(2);
    expect(result.short.rawLayerScores[6]).toBe(0);
  });
});

describe('scorerV4 pipeline', () => {
  it('Group B uses 4 sub-layers /8 raw max', () => {
    const result = scoreAnalysisV4(baseInput(), { consecutiveLosses: 0, dailyLossUSDT: 0 });
    const long = result.long;
    expect(long.layers.some((l) => l.layerNumber === 5)).toBe(true);
    expect(long.layers.some((l) => l.layerNumber === LAYER_L5B_ID)).toBe(true);
    expect(long.groupScores.B).toBeLessThanOrEqual(5);
    expect(long.referenceTotalScore).toBeCloseTo(
      long.groupScores.A + long.groupScores.B + long.groupScores.C,
      1,
    );
  });

  it('scoringLayersToDisplayV4 shows L5a and L5b separately', () => {
    const result = scoreAnalysisV4(baseInput(), { consecutiveLosses: 0, dailyLossUSDT: 0 });
    const layers = scoringLayersToDisplayV4(result.long.layers);
    const names = layers.map((l) => l.name);
    expect(names.some((n) => n.includes('L5a'))).toBe(true);
    expect(names.some((n) => n.includes('L5b'))).toBe(true);
    expect(layers.length).toBe(11);
  });

  it('CHO_TAI_CHAM when only L9 blocks and setup would pass', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T04:00:00+07:00'));

    const result = scoreAnalysisV4(baseInput(), { consecutiveLosses: 0, dailyLossUSDT: 0 });
    const side = result.long.referenceTotalScore >= result.short.referenceTotalScore
      ? result.long
      : result.short;

    if (side.hardBlocks.some((b) => b.startsWith('L9'))) {
      const onlyL9 =
        side.hardBlocks.length === 1 && side.hardBlocks[0].startsWith('L9 Phiên xấu');
      if (onlyL9 && side.groupBlocks.length === 0 && side.referenceTotalScore >= 8) {
        expect(side.awaitingRescore).toBe(true);
        expect(side.decision).toBe('CHO_TAI_CHAM');
        expect(side.officialTotalScore).toBeNull();
        expect(canEnterV4(side)).toBe(false);
      }
    }

    vi.useRealTimers();
  });

  it('canEnterV4 false for CHO_TAI_CHAM', () => {
    expect(
      canEnterV4({
        direction: 'LONG',
        layers: [],
        rawLayerScores: {},
        groupScores: { A: 4, B: 4, C: 3 },
        referenceTotalScore: 11,
        officialTotalScore: null,
        hardBlocks: ['L9 Phiên xấu — Asia Dead Zone'],
        blockReasons: [],
        groupBlocks: [],
        warnings: [],
        decision: 'CHO_TAI_CHAM',
        decisionLabel: 'CHỜ TÁI CHẤM',
        decisionColor: '#848E9C',
        winrate: '—',
        awaitingRescore: true,
      }),
    ).toBe(false);
  });

  it('suggestDirectionV4 returns LONG or SHORT', () => {
    const result = scoreAnalysisV4(baseInput(), { consecutiveLosses: 0, dailyLossUSDT: 0 });
    expect(['LONG', 'SHORT']).toContain(suggestDirectionV4(result));
  });
});

function squeezeHighAnalysisInput(): AnalysisInputV4 {
  return {
    ...(baseInput() as AnalysisInputV4),
    fundingMetrics: {
      fundingCurrent: -0.012,
      fundingAvg8: -0.01,
      fundingAvg16: -0.008,
      fundingVelocity: -0.004,
      fundingAcceleration: -0.001,
    },
    oiChange1h: 5,
    oiChange4h: 8,
    topLongShortRatios: [0.6, 0.55, 0.52],
    priceChangePct1h: -1.8,
    priceChange4h: -2.5,
    whaleWalls: {
      bidWalls: [{ price: 100, distancePct: -1.2, multiplier: 3 }],
      askWalls: [],
    },
  };
}

describe('scoreAnalysisV4 L11 squeezeRisk', () => {
  it('includes squeezeRisk HIGH without adding to 15-point total', () => {
    const result = scoreAnalysisV4(squeezeHighAnalysisInput(), {
      consecutiveLosses: 0,
      dailyLossUSDT: 0,
    });

    expect(result.squeezeRisk.level).toBe('HIGH');
    expect(result.squeezeRisk.direction).toBe('SHORT_SQUEEZE');
    expect(result.squeezeRisk.score).toBeGreaterThanOrEqual(6);

    const gs = result.short.groupScores;
    expect(result.short.referenceTotalScore).toBeCloseTo(gs.A + gs.B + gs.C, 2);
    expect(result.short.referenceTotalScore).toBeLessThanOrEqual(15);
  });

  it('V3 scoreAnalysisV3 has no squeezeRisk field', () => {
    const result = scoreAnalysisV3(baseInput(), {
      consecutiveLosses: 0,
      dailyLossUSDT: 0,
    });
    expect('squeezeRisk' in result).toBe(false);
  });
});

function scoringFingerprint(result: ReturnType<typeof scoreAnalysisV4>): string {
  const side = (d: (typeof result)['long']) =>
    [
      d.officialTotalScore ?? 'null',
      d.referenceTotalScore,
      d.decision,
      d.rawLayerScores[5],
      d.groupScores.A,
      d.groupScores.B,
      d.groupScores.C,
      d.hardBlocks.join('|'),
      d.groupBlocks.join('|'),
    ].join(',');
  return `L:${side(result.long)};S:${side(result.short)}`;
}

describe('scoreAnalysisV4 XRP-only CVD Option A — peer fingerprint freeze', () => {
  const today = { consecutiveLosses: 0, dailyLossUSDT: 0 };

  function peerFixture(symbol: 'BTCUSDT' | 'SOLUSDT' | 'BNBUSDT'): AnalysisInputV4 {
    const klines1h = risingKlines(120, symbol === 'BTCUSDT' ? 60_000 : 100);
    const klines4h = risingKlines(80, symbol === 'BTCUSDT' ? 58_000 : 95);
    const currentPrice = klines1h[klines1h.length - 1].close;
    const cvdPoints = klines1h.slice(-30).map((k, i) => ({
      timestamp: k.openTime,
      cvd: -400_000 - i * 50_000,
      price: k.close,
    }));
    return {
      ...(baseInput({
        symbol,
        currentPrice,
        klines1h,
        klines4h,
        cvdPoints,
        atr1h: computeAtr1hFromKlines(klines1h, currentPrice),
      }) as AnalysisInputV4),
      btcKlines1h: klines1h,
    };
  }

  it('BTC/SOL/BNB: applyXrpOnly returns same ref + L5a matches absolute scoreL5aV4', () => {
    for (const symbol of ['BTCUSDT', 'SOLUSDT', 'BNBUSDT'] as const) {
      const input = peerFixture(symbol);
      const scaled = applyXrpOnlyCvdVolRelScale(
        input.symbol,
        input.cvdPoints,
        input.currentPrice,
        input.klines1h,
      );
      expect(scaled).toBe(input.cvdPoints);

      const full = scoreAnalysisV4(input, today);
      const ema = getEMAAnalysisV3(input.klines1h);
      const ctx = { currentPrice: input.currentPrice, ema20: ema.ema20 };
      expect(full.long.rawLayerScores[5]).toBe(
        scoreL5aV4('LONG', input.cvdPoints, ctx).layerResult.score,
      );
      expect(full.short.rawLayerScores[5]).toBe(
        scoreL5aV4('SHORT', input.cvdPoints, ctx).layerResult.score,
      );

      // Freeze: re-score identical fingerprint (no nondet scale branch)
      expect(scoringFingerprint(scoreAnalysisV4(input, today))).toBe(
        scoringFingerprint(full),
      );
    }
  });

  it('XRP: scale applied — L5a follows scaled points, not raw absolute', () => {
    const klines1h = risingKlines(120, 0.5).map((k) => ({
      ...k,
      volume: 50_000_000,
    }));
    const currentPrice = klines1h[klines1h.length - 1].close;
    const cvdPoints = klines1h.slice(-30).map((k, i) => ({
      timestamp: k.openTime,
      cvd: -2_000_000 - i * 100_000,
      price: k.close,
    }));
    const input: AnalysisInputV4 = {
      ...(baseInput({
        symbol: 'XRPUSDT',
        currentPrice,
        klines1h,
        klines4h: risingKlines(80, 0.48),
        cvdPoints,
        atr1h: computeAtr1hFromKlines(klines1h, currentPrice),
      }) as AnalysisInputV4),
      btcKlines1h: risingKlines(120, 60_000),
    };

    const scaled = applyXrpOnlyCvdVolRelScale(
      'XRPUSDT',
      cvdPoints,
      currentPrice,
      klines1h,
    );
    expect(scaled).not.toBe(cvdPoints);
    expect(scaled[0].cvd).not.toBe(cvdPoints[0].cvd);

    const full = scoreAnalysisV4(input, today);
    const ema = getEMAAnalysisV3(klines1h);
    const ctx = { currentPrice, ema20: ema.ema20 };
    expect(full.long.rawLayerScores[5]).toBe(
      scoreL5aV4('LONG', scaled, ctx).layerResult.score,
    );
    // Raw array must not be mutated in place
    expect(cvdPoints[0].cvd).toBe(-2_000_000);
  });
});
