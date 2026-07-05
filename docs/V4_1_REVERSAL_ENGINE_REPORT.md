# V4.1 Reversal Engine — Báo cáo trạng thái

**Ngày tạo:** 2026-07-04  
**Phạm vi:** Early Warning Engine, Hysteresis, Reversal Detector, Reversal Store, Scan Pipeline, Position Advisor V4.1, Reversal Trade Setup, UI Components

---

## 1. TRẠNG THÁI HIỆN TẠI

### 1.1 File đã tạo / chỉnh sửa (liên quan Reversal Engine)

| # | File | Vai trò |
|---|------|---------|
| 1 | `services/v41/earlyWarningEngine.ts` | Tính raw Early Warning (5 tín hiệu, severity) |
| 2 | `store/useV41Store.ts` | Hysteresis Early Warning (`updateEarlyWarning`) |
| 3 | `services/v41/reversalDetector.ts` | Phase 1 signals + Phase 2 retest EMA20 + SL counter-trend |
| 4 | `store/useReversalStore.ts` | State machine WATCHING / RETEST_CONFIRMED / EXPIRED |
| 5 | `services/v41/reversalTradeSetup.ts` | Tạo kế hoạch lệnh đảo chiều sau retest |
| 6 | `services/v41/scanV41.ts` | Tích hợp EW + reversal vào scan pipeline |
| 7 | `services/v41/positionAdvisorV41.ts` | Rules priority 115/110/105/100 |
| 8 | `services/v41/rawMarketFetcher.ts` | Fetch `klines30M`, `klines1H`, `btcKlines1H` |
| 9 | `components/dashboard/ReversalModal.tsx` | Modal xác nhận lệnh reversal |
| 10 | `components/dashboard/SignalBoardV41.tsx` | Banner WATCHING, trigger modal, EW badges |
| 11 | `components/dashboard/SignalBoardUnified.tsx` | Banner reversal + EW overlay trên tab Tổng hợp |
| 12 | `services/v41/__tests__/earlyWarningEngine.test.ts` | Unit tests EW |
| 13 | `services/v41/__tests__/reversalDetector.test.ts` | Unit tests reversal detector |
| 14 | `store/__tests__/useV41Store.test.ts` | Unit tests hysteresis |
| 15 | `store/__tests__/useReversalStore.test.ts` | Unit tests reversal store |
| 16 | `services/v41/__tests__/positionAdvisorV41.test.ts` | Unit tests advisor (gồm EW/reversal rules) |
| 17 | `services/v41/__tests__/scanV41.test.ts` | Unit tests scan (opportunity, visibility) |

**File liên quan gián tiếp (không thuộc Reversal Engine core):**
- `services/v41/reversalProbabilityEngine.ts` — engine reversal probability Bước 1 MI (khác pipeline Reversal Detector)
- `services/unifiedSignalEngine.ts` — Tab Tổng hợp (Conf≥70, EQ≥85 cho `v41CanEnter`)

### 1.2 Kết quả test — `npx vitest run` (toàn bộ)

```
Test Files  2 failed | 106 passed (108)
     Tests  8 failed | 949 passed (957)
  Duration  222.78s
```

**8 test fail (pre-existing, không thuộc Reversal Engine):**
- `services/positionAdvisorV4.test.ts` — 1 fail
- `services/__tests__/driveSync.e2e.test.ts` — 7 fail

### 1.3 Kết quả test Reversal-related

| Lệnh | Kết quả |
|------|---------|
| `npx vitest run services/v41/__tests__` | **260 passed** (17 files) |
| `npx vitest run store/__tests__` | **17 passed** (2 files) |

---

## 2. EARLY WARNING ENGINE

**File:** `services/v41/earlyWarningEngine.ts`

### 2.1 Danh sách 5 tín hiệu đảo chiều

```typescript
export type EarlyWarningSignal =
  | 'PRICE_BELOW_EMA20_30M'
  | 'EMA20_SLOPE_DOWN_30M'
  | 'SELL_PRESSURE_30M'
  | 'PRICE_BELOW_EMA20_1H'
  | 'BTC_REVERSAL_1H';
```

**Phân bổ timeframe trong `computeRawEarlyWarning`:**

```typescript
  if (klines30M.length > 0) {
    if (detectPriceBelowEma20(klines30M)) {
      signals30M.push('PRICE_BELOW_EMA20_30M');
    }
    if (detectEma20SlopeDown30M(klines30M)) {
      signals30M.push('EMA20_SLOPE_DOWN_30M');
    }
    if (detectSellPressure30M(klines30M)) {
      signals30M.push('SELL_PRESSURE_30M');
    }
  }

  if (klines1H.length > 0 && detectPriceBelowEma20(klines1H)) {
    signals1H.push('PRICE_BELOW_EMA20_1H');
  }

  if (detectBtcReversal1H(btcKlines1H)) {
    signals1H.push('BTC_REVERSAL_1H');
  }
```

**Logic từng detector (nguyên văn):**

```typescript
function detectPriceBelowEma20(klines: KlineV41[]): boolean {
  if (klines.length < EMA_PERIOD) return false;
  const closes = klines.map((k) => k.close);
  const ema20 = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = klines.length - 1;
  const lastEma = lastFiniteEma(ema20, lastIdx);
  if (lastEma == null) return false;
  return closes[lastIdx] < lastEma;
}

function detectEma20SlopeDown30M(klines: KlineV41[]): boolean {
  if (klines.length < EMA_PERIOD + SLOPE_LOOKBACK_30M) return false;
  const closes = klines.map((k) => k.close);
  const ema20 = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = klines.length - 1;
  const prevIdx = lastIdx - SLOPE_LOOKBACK_30M;
  const lastEma = lastFiniteEma(ema20, lastIdx);
  const prevEma = lastFiniteEma(ema20, prevIdx);
  if (lastEma == null || prevEma == null) return false;
  return lastEma < prevEma;
}

function detectSellPressure30M(klines: KlineV41[]): boolean {
  if (klines.length < 3) return false;
  const lastThree = klines.slice(-3);
  return lastThree.every(
    (kline) => kline.takerBuyVolume < kline.volume * SELL_PRESSURE_RATIO,
  );
}

function detectBtcReversal1H(btcKlines1H: KlineV41[]): boolean {
  if (btcKlines1H.length < EMA_PERIOD + BTC_SLOPE_LOOKBACK_1H) return false;
  const closes = btcKlines1H.map((k) => k.close);
  const ema20 = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = btcKlines1H.length - 1;
  const prevIdx = lastIdx - BTC_SLOPE_LOOKBACK_1H;
  const lastEma = lastFiniteEma(ema20, lastIdx);
  const prevEma = lastFiniteEma(ema20, prevIdx);
  if (lastEma == null || prevEma == null) return false;
  return closes[lastIdx] < lastEma && lastEma < prevEma;
}
```

**Hằng số:**

```typescript
const EMA_PERIOD = 20;
const VOLUME_MA_PERIOD = 20;
const VOLUME_CONFIRM_MULTIPLIER = 1.2;
const SELL_PRESSURE_RATIO = 0.4;
const SLOPE_LOOKBACK_30M = 3;
const BTC_SLOPE_LOOKBACK_1H = 2;
```

### 2.2 Logic tính rawSeverity

```typescript
function resolveRawSeverity(
  signalCount30M: number,
  signalCount1H: number,
  volumeConfirmed: boolean,
): EarlyWarningSeverity {
  const totalSignals = signalCount30M + signalCount1H;

  if (totalSignals >= 2 && volumeConfirmed) return 'BLOCK';
  if (signalCount1H >= 1 && volumeConfirmed) return 'WARNING_HARD';
  if (signalCount1H >= 1 && !volumeConfirmed) return 'WARNING_SOFT';
  if (signalCount30M >= 1) return 'WARNING_SOFT';
  return 'CLEAR';
}
```

**Gọi trong `computeRawEarlyWarning`:**

```typescript
  const signalCount30M = signals30M.length;
  const signalCount1H = signals1H.length;
  const signalCount = signalCount30M + signalCount1H;
  const volumeConfirmed = detectVolumeConfirmed(klines30M);
  const rawSeverity = resolveRawSeverity(signalCount30M, signalCount1H, volumeConfirmed);
```

### 2.3 Volume confirmation logic

```typescript
function detectVolumeConfirmed(klines30M: KlineV41[]): boolean {
  if (klines30M.length < VOLUME_MA_PERIOD + 1) return false;
  const lastIdx = klines30M.length - 1;
  const volumes = klines30M
    .slice(lastIdx - VOLUME_MA_PERIOD, lastIdx)
    .map((kline) => kline.volume);
  const volumeMA20 = average(volumes);
  if (!Number.isFinite(volumeMA20) || volumeMA20 <= 0) return false;
  return klines30M[lastIdx].volume > volumeMA20 * VOLUME_CONFIRM_MULTIPLIER;
}
```

### 2.4 Ngưỡng CLEAR / WARNING_SOFT / WARNING_HARD / BLOCK

| Severity | Điều kiện (từ `resolveRawSeverity`) |
|----------|-------------------------------------|
| `BLOCK` | `totalSignals >= 2` **VÀ** `volumeConfirmed === true` |
| `WARNING_HARD` | `signalCount1H >= 1` **VÀ** `volumeConfirmed === true` |
| `WARNING_SOFT` | `signalCount1H >= 1` **VÀ** `!volumeConfirmed` **HOẶC** `signalCount30M >= 1` |
| `CLEAR` | Không có tín hiệu nào |

**Messages:**

```typescript
function buildBlockMessage(): string {
  return '🔴 Đảo chiều xác nhận 30M+1H+Volume — không vào lệnh';
}

function buildWarningMessage(
  signalCount: number,
  signalCount30M: number,
  signalCount1H: number,
): string {
  if (signalCount <= 0) return '';
  const timeframe = resolveTimeframeLabel(signalCount30M, signalCount1H);
  return `⚠️ ${signalCount} tín hiệu đảo chiều ${timeframe} — thận trọng`;
}
```

**Direction ảnh hưởng:**

```typescript
function resolveDirection(trendDirection: TrendDirection): 'LONG' | 'SHORT' | 'BOTH' {
  if (trendDirection === 'BULL') return 'LONG';
  if (trendDirection === 'BEAR') return 'SHORT';
  return 'BOTH';
}
```

---

## 3. HYSTERESIS (useV41Store)

**File:** `store/useV41Store.ts`

### 3.1 Confirm thresholds

```typescript
const CONFIRM_THRESHOLD: Record<EarlyWarningSeverity, number> = {
  CLEAR: 1,
  WARNING_SOFT: 2,
  WARNING_HARD: 2,
  BLOCK: 3,
};
```

### 3.2 Clear thresholds

```typescript
const CLEAR_THRESHOLD: Record<EarlyWarningSeverity, number> = {
  CLEAR: 0,
  WARNING_SOFT: 3,
  WARNING_HARD: 3,
  BLOCK: 5,
};
```

### 3.3 Severity rank

```typescript
const SEVERITY_RANK: Record<EarlyWarningSeverity, number> = {
  CLEAR: 0,
  WARNING_SOFT: 1,
  WARNING_HARD: 2,
  BLOCK: 3,
};
```

### 3.4 Logic `applyEarlyWarningHysteresis` + `updateEarlyWarning`

```typescript
function applyEarlyWarningHysteresis(
  state: Pick<
    V41SymbolState,
    'ewCurrentSeverity' | 'ewConfirmCount' | 'ewClearCount' | 'ewLastChangedAt'
  >,
  rawSeverity: EarlyWarningSeverity,
): Pick<
  V41SymbolState,
  'ewCurrentSeverity' | 'ewConfirmCount' | 'ewClearCount' | 'ewLastChangedAt'
> & { returnedSeverity: EarlyWarningSeverity } {
  const current = state.ewCurrentSeverity;
  let confirmCount = state.ewConfirmCount;
  let clearCount = state.ewClearCount;
  let nextSeverity = current;
  let lastChangedAt = state.ewLastChangedAt;

  const rawRank = SEVERITY_RANK[rawSeverity];
  const currentRank = SEVERITY_RANK[current];

  if (rawSeverity === current) {
    confirmCount += 1;
    clearCount = 0;
    return {
      ewCurrentSeverity: nextSeverity,
      ewConfirmCount: confirmCount,
      ewClearCount: clearCount,
      ewLastChangedAt: lastChangedAt,
      returnedSeverity: current,
    };
  }

  if (rawRank > currentRank) {
    confirmCount += 1;
    clearCount = 0;
    if (confirmCount >= CONFIRM_THRESHOLD[rawSeverity]) {
      nextSeverity = rawSeverity;
      confirmCount = 0;
      lastChangedAt = Date.now();
      return {
        ewCurrentSeverity: nextSeverity,
        ewConfirmCount: confirmCount,
        ewClearCount: clearCount,
        ewLastChangedAt: lastChangedAt,
        returnedSeverity: rawSeverity,
      };
    }
    return {
      ewCurrentSeverity: nextSeverity,
      ewConfirmCount: confirmCount,
      ewClearCount: clearCount,
      ewLastChangedAt: lastChangedAt,
      returnedSeverity: current,
    };
  }

  // rawSeverity nhẹ hơn current — đang hồi phục
  if (rawSeverity === 'CLEAR') {
    if (current === 'CLEAR') {
      clearCount = 0;
      confirmCount = 0;
      return {
        ewCurrentSeverity: 'CLEAR',
        ewConfirmCount: 0,
        ewClearCount: 0,
        ewLastChangedAt: lastChangedAt,
        returnedSeverity: 'CLEAR',
      };
    }

    clearCount += 1;
    confirmCount = 0;
    const threshold = CLEAR_THRESHOLD[current];
    if (clearCount >= threshold) {
      nextSeverity = 'CLEAR';
      clearCount = 0;
      lastChangedAt = Date.now();
      return {
        ewCurrentSeverity: nextSeverity,
        ewConfirmCount: confirmCount,
        ewClearCount: clearCount,
        ewLastChangedAt: lastChangedAt,
        returnedSeverity: 'CLEAR',
      };
    }
    return {
      ewCurrentSeverity: nextSeverity,
      ewConfirmCount: confirmCount,
      ewClearCount: clearCount,
      ewLastChangedAt: lastChangedAt,
      returnedSeverity: current,
    };
  }

  // Hồi phục từng bậc (vd. BLOCK → WARNING_HARD)
  confirmCount += 1;
  clearCount = 0;
  if (confirmCount >= CONFIRM_THRESHOLD[rawSeverity]) {
    nextSeverity = rawSeverity;
    confirmCount = 0;
    lastChangedAt = Date.now();
    return {
      ewCurrentSeverity: nextSeverity,
      ewConfirmCount: confirmCount,
      ewClearCount: clearCount,
      ewLastChangedAt: lastChangedAt,
      returnedSeverity: rawSeverity,
    };
  }
  return {
    ewCurrentSeverity: nextSeverity,
    ewConfirmCount: confirmCount,
    ewClearCount: clearCount,
    ewLastChangedAt: lastChangedAt,
    returnedSeverity: current,
  };
}
```

```typescript
  updateEarlyWarning: (symbol, rawSeverity) => {
    const prev = get().symbolStates[symbol] ?? defaultSymbolState();
    const outcome = applyEarlyWarningHysteresis(prev, rawSeverity);
    set((state) => ({
      symbolStates: {
        ...state.symbolStates,
        [symbol]: {
          ...(state.symbolStates[symbol] ?? defaultSymbolState()),
          ewCurrentSeverity: outcome.ewCurrentSeverity,
          ewConfirmCount: outcome.ewConfirmCount,
          ewClearCount: outcome.ewClearCount,
          ewLastChangedAt: outcome.ewLastChangedAt,
        },
      },
    }));
    return outcome.returnedSeverity;
  },
```

**State fields per symbol:**

```typescript
export interface V41SymbolState {
  previousMode: VisibilityMode;
  lastSnapshot?: MarketIntelligenceSnapshot;
  updatedAt?: number;
  /** Early Warning Hysteresis */
  ewCurrentSeverity: EarlyWarningSeverity;
  ewConfirmCount: number;
  ewClearCount: number;
  ewLastChangedAt: number;
}
```

---

## 4. REVERSAL DETECTOR

**File:** `services/v41/reversalDetector.ts`

### 4.1 `checkReversalSignals` logic

**Hằng số:**

```typescript
const MIN_CONFIRM_SIGNALS = 3;
```

**5 dấu hiệu bearish (trend BULL → counter SHORT):**

```typescript
function countBearishReversalSignals(params: CheckReversalSignalsParams): number {
  let signals = 0;
  if (detectPriceBelowEma20(params.klines1H)) signals += 1;
  if (detectVolumeSpikeDown(params.klines1H)) signals += 1;
  if (detectCvdDeclining1H(params.klines1H)) signals += 1;
  if (detectBtcBelowEma20WithSlope(params.btcKlines1H)) signals += 1;
  if (detectSellPressure30M(params.klines30M)) signals += 1;
  return signals;
}
```

**5 dấu hiệu bullish (trend BEAR → counter LONG):**

```typescript
function countBullishReversalSignals(params: CheckReversalSignalsParams): number {
  let signals = 0;
  if (detectPriceAboveEma20(params.klines1H)) signals += 1;
  if (detectVolumeSpikeUp(params.klines1H)) signals += 1;
  if (detectCvdRising1H(params.klines1H)) signals += 1;
  if (detectBtcAboveEma20WithSlope(params.btcKlines1H)) signals += 1;
  if (detectBuyPressure30M(params.klines30M)) signals += 1;
  return signals;
}
```

**Export:**

```typescript
export function checkReversalSignals(
  params: CheckReversalSignalsParams,
): { confirmed: boolean; signals: number } {
  const { trendDirection } = params;

  if (trendDirection === 'NEUTRAL') {
    return { confirmed: false, signals: 0 };
  }

  const signals =
    trendDirection === 'BULL'
      ? countBearishReversalSignals(params)
      : countBullishReversalSignals(params);

  return {
    confirmed: signals >= MIN_CONFIRM_SIGNALS,
    signals,
  };
}
```

### 4.2 `checkRetestEMA20_1H` logic

**Hằng số:**

```typescript
const EMA_RETEST_BAND = 0.003;
```

```typescript
export function checkRetestEMA20_1H(params: CheckRetestEMA20Params): RetestResult {
  const { klines1H, counterDirection } = params;

  if (klines1H.length < EMA_PERIOD + 1) {
    return {
      confirmed: false,
      retestPrice: null,
      retestVolume: null,
      volumeConfirmed: false,
    };
  }

  const closes = klines1H.map((k) => k.close);
  const ema20Series = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = klines1H.length - 1;
  const retestIdx = lastIdx - 1;
  const lastEma = lastFiniteEma(ema20Series, lastIdx);
  const retestEma = lastFiniteEma(ema20Series, retestIdx);

  if (lastEma == null || retestEma == null) {
    return {
      confirmed: false,
      retestPrice: null,
      retestVolume: null,
      volumeConfirmed: false,
    };
  }

  const ema20Upper = retestEma * (1 + EMA_RETEST_BAND);
  const ema20Lower = retestEma * (1 - EMA_RETEST_BAND);
  const retestCandle = klines1H[retestIdx];
  const confirmCandle = klines1H[lastIdx];
  const volumeMA20 = volumeMA20Before(klines1H, retestIdx);
  const volumeConfirmed =
    Number.isFinite(volumeMA20) &&
    volumeMA20 > 0 &&
    retestCandle.volume > volumeMA20;

  if (counterDirection === 'SHORT') {
    const touchedEma =
      retestCandle.high >= ema20Lower && retestCandle.high <= ema20Upper;
    const rejected = retestCandle.close < retestCandle.open;
    const continuedDown = confirmCandle.close < lastEma;
    const confirmed = touchedEma && rejected && continuedDown;

    return {
      confirmed,
      retestPrice: confirmed || touchedEma ? retestCandle.high : null,
      retestVolume: retestCandle.volume,
      volumeConfirmed,
    };
  }

  const touchedEma =
    retestCandle.low >= ema20Lower && retestCandle.low <= ema20Upper;
  const rejected = retestCandle.close > retestCandle.open;
  const continuedUp = confirmCandle.close > lastEma;
  const confirmed = touchedEma && rejected && continuedUp;

  return {
    confirmed,
    retestPrice: confirmed || touchedEma ? retestCandle.low : null,
    retestVolume: retestCandle.volume,
    volumeConfirmed,
  };
}
```

### 4.3 `computeCounterTrendSL` logic

```typescript
const SWING_LOOKBACK = 10;
const SL_BUFFER = 0.003;

export function computeCounterTrendSL(params: ComputeCounterTrendSLParams): number {
  const { klines1H, direction } = params;

  if (klines1H.length < Math.max(EMA_PERIOD, SWING_LOOKBACK)) {
    return NaN;
  }

  const closes = klines1H.map((k) => k.close);
  const ema20Series = calculateEMA(closes, EMA_PERIOD);
  const lastEma = lastFiniteEma(ema20Series, klines1H.length - 1);
  if (lastEma == null) return NaN;

  const recent = klines1H.slice(-SWING_LOOKBACK);

  if (direction === 'SHORT') {
    const swingHigh = Math.max(...recent.map((kline) => kline.high));
    const slCandidate1 = swingHigh * 1.003;
    const slCandidate2 = lastEma * 1.005;
    return Math.min(slCandidate1, slCandidate2) * (1 + SL_BUFFER);
  }

  const swingLow = Math.min(...recent.map((kline) => kline.low));
  const slCandidate1 = swingLow * 0.997;
  const slCandidate2 = lastEma * 0.995;
  return Math.max(slCandidate1, slCandidate2) * (1 - SL_BUFFER);
}
```

---

## 5. REVERSAL STORE

**File:** `store/useReversalStore.ts`

### 5.1 ReversalPhase states

```typescript
export type ReversalPhase =
  | 'NONE'
  | 'WATCHING'
  | 'RETEST_CONFIRMED'
  | 'EXPIRED';
```

```typescript
export interface ReversalState {
  phase: ReversalPhase;
  detectedAt: number;
  retestPrice: number | null;
  counterDirection: 'LONG' | 'SHORT' | null;
  expiresAt: number | null;
  symbol: string;
}
```

### 5.2 Timeout 15 phút logic

```typescript
const WATCH_TIMEOUT_MS = 15 * 60 * 1000;
```

**Auto-expire trong `getState`:**

```typescript
  getState: (symbol) => {
    const current = get().states[symbol] ?? defaultReversalState(symbol);

    if (
      current.phase === 'WATCHING' &&
      current.expiresAt != null &&
      Date.now() > current.expiresAt
    ) {
      get().expire(symbol);
      return get().states[symbol] ?? defaultReversalState(symbol);
    }

    return current;
  },
```

### 5.3 `startWatching` / `confirmRetest` / `expire`

```typescript
  startWatching: (symbol, counterDirection, _trendDirection) => {
    const now = Date.now();
    set((state) => ({
      states: {
        ...state.states,
        [symbol]: {
          phase: 'WATCHING',
          detectedAt: now,
          retestPrice: null,
          counterDirection,
          expiresAt: now + WATCH_TIMEOUT_MS,
          symbol,
        },
      },
    }));
  },

  confirmRetest: (symbol, retestPrice) => {
    set((state) => {
      const prev = state.states[symbol] ?? defaultReversalState(symbol);
      return {
        states: {
          ...state.states,
          [symbol]: {
            ...prev,
            phase: 'RETEST_CONFIRMED',
            retestPrice,
            symbol,
          },
        },
      };
    });
  },

  expire: (symbol) => {
    set((state) => {
      const prev = state.states[symbol] ?? defaultReversalState(symbol);
      return {
        states: {
          ...state.states,
          [symbol]: {
            ...prev,
            phase: 'EXPIRED',
            symbol,
          },
        },
      };
    });
  },
```

**Helpers:**

```typescript
  isWatching: (symbol) => get().getState(symbol).phase === 'WATCHING',
  isRetestConfirmed: (symbol) =>
    get().getState(symbol).phase === 'RETEST_CONFIRMED',
  isExpired: (symbol) => get().getState(symbol).phase === 'EXPIRED',
```

---

## 6. SCAN PIPELINE

**File:** `services/v41/scanV41.ts`

### 6.1 Thứ tự Phase 1 → Phase 2

**Trong `scanOneSymbolV41` (mỗi symbol):**

```
fetchRawMarketV41
  → resolveProtection
  → runMarketIntelligenceLayer (snapshot 4H)
  → resolveEarlyWarning (computeRawEarlyWarning + hysteresis)
  → resolveReversalState (Phase 1 + Phase 2)
  → resolveVisibilityHysteresis
  → resolveOpportunity (entryQuality)
  → resolveTradeModeUpgrade
  → if earlyWarning.severity === 'BLOCK' → force visibilityMode = 'WATCH_MODE'
  → updateSymbolState
  → return SignalRowV41
```

**`resolveReversalState` — Phase 1 và Phase 2:**

```typescript
function resolveReversalState(
  symbol: string,
  raw: Awaited<ReturnType<typeof fetchRawMarketV41>>,
  snapshot: MarketIntelligenceSnapshot,
): ReversalState {
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
```

### 6.2 Điều kiện trigger mỗi phase

| Phase | Điều kiện vào | Hành động |
|-------|---------------|-----------|
| **Phase 1** | `phase === 'NONE' \|\| 'EXPIRED'` **VÀ** `checkReversalSignals.confirmed === true` (≥3/5 signals) | `startWatching(symbol, counterDirection)` — counterDirection = SHORT nếu trend BULL, LONG nếu trend BEAR |
| **Phase 2** | `phase === 'WATCHING'` **VÀ** `counterDirection != null` **VÀ** `checkRetestEMA20_1H.confirmed === true` | `confirmRetest(symbol, retestPrice)` → phase = `RETEST_CONFIRMED` |
| **Timeout** | `phase === 'WATCHING'` **VÀ** `Date.now() > expiresAt` (15 phút) | `expire(symbol)` → phase = `EXPIRED` |

**Early Warning BLOCK trong scan:**

```typescript
    if (earlyWarning?.severity === 'BLOCK') {
      visibilityMode = 'WATCH_MODE';
    }
```

### 6.3 Field mới trong `SignalRowV41`

```typescript
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
  fetchedAt: number;
  error?: string;
}
```

```typescript
export type EarlyWarningSnapshot = EarlyWarningResult & {
  severity: EarlyWarningSeverity;
};
```

---

## 7. POSITION ADVISOR V4.1

**File:** `services/v41/positionAdvisorV41.ts`

**Thứ tự ưu tiên trong `evaluatePositionV41`:**

```typescript
  const reversalResult = evaluateReversalDetected(params);
  if (reversalResult) return reversalResult;

  const earlyWarningResult = evaluateEarlyWarningRules(params);
  if (earlyWarningResult) return earlyWarningResult;
```

### 7.1 REVERSAL_DETECTED (priority 115)

```typescript
function isReversalAgainstPosition(
  reversalState: ReversalState,
  positionDirection: 'LONG' | 'SHORT',
): boolean {
  if (reversalState.counterDirection == null) return false;
  return reversalState.counterDirection !== positionDirection;
}

function evaluateReversalDetected(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  const { reversalState, openPosition, markPrice } = params;
  if (!reversalState) return null;
  if (
    reversalState.phase !== 'WATCHING' &&
    reversalState.phase !== 'RETEST_CONFIRMED'
  ) {
    return null;
  }
  if (!isReversalAgainstPosition(reversalState, openPosition.direction)) return null;

  const pnl = computeCurrentPnlUsdt(
    openPosition.entryPrice,
    markPrice,
    openPosition.direction,
    openPosition.size,
    openPosition.leverage,
  );
  const label =
    pnl >= 0
      ? 'Chốt lời — Đảo chiều đang xác nhận'
      : 'Đóng khẩn cấp — Đảo chiều đang xác nhận';

  return neutralResult({
    action: 'CLOSE_NOW',
    urgency: 'CRITICAL',
    label,
    reason: 'reversal WATCHING/RETEST_CONFIRMED (priority 115)',
  });
}
```

### 7.2 EARLY_WARNING_BLOCK (priority 110)

```typescript
function evaluateEarlyWarningBlock(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  const { earlyWarning, openPosition, markPrice } = params;
  if (!earlyWarning || earlyWarning.severity !== 'BLOCK') return null;
  if (!isEarlyWarningDirectionAffected(earlyWarning, openPosition.direction)) return null;

  const pnl = computeCurrentPnlUsdt(
    openPosition.entryPrice,
    markPrice,
    openPosition.direction,
    openPosition.size,
    openPosition.leverage,
  );
  const label =
    pnl >= 0
      ? 'Chốt lời ngay — đảo chiều xác nhận 30M+1H'
      : 'Đóng khẩn cấp — đảo chiều xác nhận 30M+1H';

  return neutralResult({
    action: 'CLOSE_NOW',
    urgency: 'CRITICAL',
    label,
    reason: 'earlyWarning BLOCK (priority 110)',
  });
}
```

### 7.3 EARLY_WARNING_HARD (priority 105)

```typescript
function evaluateEarlyWarningHard(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  const { earlyWarning, openPosition, markPrice } = params;
  if (!earlyWarning || earlyWarning.severity !== 'WARNING_HARD') return null;
  if (!isEarlyWarningDirectionAffected(earlyWarning, openPosition.direction)) return null;

  const { entryPrice, direction, sl, tp1 } = openPosition;

  if (isSlAtBreakEven(sl, entryPrice, direction)) {
    return neutralResult({
      urgency: 'MEDIUM',
      label: 'Giữ — SL đã an toàn',
      reason: 'earlyWarning WARNING_HARD with SL at break-even (priority 105)',
    });
  }

  if (
    hasProfitTowardTp1(markPrice, entryPrice, tp1, direction, 0.3) &&
    !isSlAtBreakEven(sl, entryPrice, direction)
  ) {
    return neutralResult({
      action: 'MOVE_SL_BE',
      urgency: 'HIGH',
      breakEvenSuggested: true,
      breakEvenPrice: entryPrice,
      label: 'Siết SL về entry — cảnh báo đảo chiều 1H',
      reason: 'earlyWarning WARNING_HARD with ≥30% toward TP1 (priority 105)',
    });
  }

  return neutralResult({
    urgency: 'MEDIUM',
    label: 'Theo dõi sát — cảnh báo 1H',
    reason: 'earlyWarning WARNING_HARD (priority 105)',
  });
}
```

### 7.4 EARLY_WARNING_SOFT (priority 100)

```typescript
function evaluateEarlyWarningSoft(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  const { earlyWarning, openPosition } = params;
  if (!earlyWarning || earlyWarning.severity !== 'WARNING_SOFT') return null;
  if (!isEarlyWarningDirectionAffected(earlyWarning, openPosition.direction)) return null;

  return neutralResult({
    urgency: 'LOW',
    label: 'Giữ — tín hiệu 30M, theo dõi thêm',
    reason: 'earlyWarning WARNING_SOFT (priority 100)',
  });
}
```

**Direction filter:**

```typescript
function isEarlyWarningDirectionAffected(
  earlyWarning: EarlyWarningResult & { severity: EarlyWarningSeverity },
  positionDirection: 'LONG' | 'SHORT',
): boolean {
  if (earlyWarning.severity === 'CLEAR') return false;
  if (earlyWarning.direction === 'BOTH') return true;
  return earlyWarning.direction === positionDirection;
}
```

---

## 8. REVERSAL TRADE SETUP

**File:** `services/v41/reversalTradeSetup.ts`

### 8.1 Ngưỡng EQ/Confidence counter-trend

**Không có trong `reversalTradeSetup.ts`.** File này không kiểm tra EQ hay Confidence trước khi tạo setup. Điều kiện duy nhất:

```typescript
  if (reversalState.phase !== 'RETEST_CONFIRMED') return null;
  if (reversalState.counterDirection == null) return null;
  if (!Number.isFinite(markPrice) || markPrice <= 0) return null;
```

> Ngưỡng EQ counter ≥ 80 và Confidence ≥ 60 (mục 10) **chưa được implement** trong `reversalTradeSetup.ts` hay `SignalBoardV41.tsx` trigger modal.

### 8.2 TP multiplier × 0.8

**Không có trong `reversalTradeSetup.ts`.** TP cố định theo R:R:

```typescript
const TP1_RR = 1.5;
const TP2_RR = 2.5;
const TP3_RR = 3.5;
```

```typescript
  if (direction === 'SHORT') {
    tp1Price = entry - slDistance * TP1_RR;
    tp2Price = entry - slDistance * TP2_RR;
    tp3Price = entry - slDistance * TP3_RR;
  } else {
    tp1Price = entry + slDistance * TP1_RR;
    tp2Price = entry + slDistance * TP2_RR;
    tp3Price = entry + slDistance * TP3_RR;
  }
```

> Hệ số `× 0.8` cho TP counter-trend **không có** trong file này. (Trong `profitEngine.ts` có `stateMultiplierFromMarketState` trả `0.8` cho `LateUptrend`/`Distribution` — dùng cho lệnh thuận xu hướng qua `tradeSetupGenerator`, không phải reversal.)

### 8.3 SL computation logic (nguyên văn `generateReversalSetup`)

```typescript
export function generateReversalSetup(
  params: GenerateReversalSetupParams,
): ReversalTradeSetup | null {
  const {
    symbol,
    reversalState,
    klines1H,
    markPrice,
    marginUsdt = DEFAULT_MARGIN_USDT,
    leverage = DEFAULT_LEVERAGE,
  } = params;

  if (reversalState.phase !== 'RETEST_CONFIRMED') return null;
  if (reversalState.counterDirection == null) return null;
  if (!Number.isFinite(markPrice) || markPrice <= 0) return null;

  const direction = reversalState.counterDirection;
  const entry = markPrice;

  const slPrice = computeCounterTrendSL({
    klines1H,
    direction,
    entryPrice: entry,
  });
  if (!Number.isFinite(slPrice) || slPrice <= 0) return null;

  const slDistance = Math.abs(entry - slPrice);
  if (slDistance <= 0) return null;

  const slDistancePct = (slDistance / entry) * 100;

  let tp1Price: number;
  let tp2Price: number;
  let tp3Price: number;

  if (direction === 'SHORT') {
    tp1Price = entry - slDistance * TP1_RR;
    tp2Price = entry - slDistance * TP2_RR;
    tp3Price = entry - slDistance * TP3_RR;
  } else {
    tp1Price = entry + slDistance * TP1_RR;
    tp2Price = entry + slDistance * TP2_RR;
    tp3Price = entry + slDistance * TP3_RR;
  }

  const rawMaxLoss = marginUsdt * (slDistancePct / 100) * leverage;
  const maxLossUsdt = Math.min(rawMaxLoss, marginUsdt);
  const retestPrice = reversalState.retestPrice ?? entry;

  return {
    symbol,
    direction,
    entryPrice: entry,
    slPrice,
    tp1Price,
    tp2Price,
    tp3Price,
    slDistancePct,
    tp1RR: TP1_RR,
    tp2RR: TP2_RR,
    tp3RR: TP3_RR,
    marginUsdt,
    leverage,
    maxLossUsdt,
    isCounterTrend: true,
    retestPrice,
    generatedAt: Date.now(),
  };
}
```

---

## 9. UI COMPONENTS

### 9.1 `ReversalModal` — props + layout

**Props:**

```typescript
export interface ReversalModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSkip: () => void;
  setup: ReversalTradeSetup;
  symbol: string;
  marketState: string;
}
```

**Layout:**
- Header màu xanh (LONG) / đỏ (SHORT): `⚡ CƠ HỘI {direction} — {symbol}`
- Warning box vàng: `⚠️ Lệnh ngược xu hướng 4H / Chốt lời sớm hơn bình thường`
- Source line: `Đảo chiều + Retest EMA20 1H ✅`
- Rows: ENTRY, SL (-%), TP1/TP2/TP3 (R:R + % chốt)
- Size box: margin × leverage × max loss
- Countdown: `Modal tự đóng sau: {remainingSeconds} giây` — `AUTO_CLOSE_SECONDS = 300`
- Actions: `⚡ Xác nhận {direction}` | `Bỏ qua cơ hội này`

**Auto-close:**

```typescript
const AUTO_CLOSE_SECONDS = 300;
```

### 9.2 Banner WATCHING trong `SignalBoardV41`

```typescript
      {reversalState?.phase === 'WATCHING' && reversalState.counterDirection ? (
        <View
          style={[
            styles.reversalWatchBanner,
            { backgroundColor: hexWithAlpha('#3B82F6', 0.15), borderColor: '#3B82F6' },
          ]}
        >
          <Text style={styles.reversalWatchText}>
            🔄 Đang theo dõi retest {reversalState.counterDirection}...
          </Text>
        </View>
      ) : null}
```

**Early Warning badges (cùng card):**

| Severity | UI |
|----------|-----|
| `BLOCK` | `🔴 {blockMessage}` — disable nút LONG/SHORT (`isEwBlock`) |
| `WARNING_HARD` | `⚠️ Cảnh báo 1H — {warningMessage}` |
| `WARNING_SOFT` | `⚠️ Tín hiệu 30M — theo dõi` |

**Trigger modal reversal (`useEffect`):**

```typescript
  useEffect(() => {
    if (reversalState?.phase !== 'RETEST_CONFIRMED') {
      shownRetestAtRef.current = null;
      return;
    }
    if (reversalModalVisible) return;
    if (currentPrice == null) return;
    if (shownRetestAtRef.current === reversalState.detectedAt) return;

    const rowWithKlines = row as SignalRowV41WithKlines;
    const setup = generateReversalSetup({
      symbol: row.symbol,
      reversalState,
      klines1H: rowWithKlines.klines1H ?? [],
      markPrice: currentPrice,
      marginUsdt: 6,
      leverage: 5,
    });

    if (setup != null) {
      shownRetestAtRef.current = reversalState.detectedAt;
      setReversalSetup(setup);
      setReversalModalVisible(true);
    }
  }, [reversalState, row, currentPrice, reversalModalVisible]);
```

### 9.3 Debug panel fields

**Không có Debug Panel UI riêng** trong app hiện tại. Dữ liệu debug có sẵn qua:

| Nguồn | Fields |
|-------|--------|
| `useV41Store.symbolStates[symbol]` | `ewCurrentSeverity`, `ewConfirmCount`, `ewClearCount`, `ewLastChangedAt`, `previousMode`, `lastSnapshot` |
| `useReversalStore.states[symbol]` | `phase`, `detectedAt`, `retestPrice`, `counterDirection`, `expiresAt` |
| `SignalRowV41.earlyWarning` | `rawSeverity`, `severity` (sau hysteresis), `signals30M`, `signals1H`, `signalCount`, `volumeConfirmed`, `warningMessage`, `blockMessage`, `direction` |
| `SignalRowV41.reversalState` | Toàn bộ `ReversalState` |
| `VisibilityResult.visibilityReason` | Chuỗi lý do visibility (trong MI layer, không render trên card) |

**Tab Tổng hợp (`SignalBoardUnified`) — banner reversal:**

```typescript
      {v41Row?.reversalState?.phase === 'WATCHING' &&
      v41Row.reversalState.counterDirection ? (
        ...
          🔄 V4.1 theo dõi retest {v41Row.reversalState.counterDirection}...
      ) : null}

      {v41Row?.reversalState?.phase === 'RETEST_CONFIRMED' ? (
        <Text style={styles.reversalConfirmedText}>
          ⚡ Retest EMA20 xác nhận — chờ modal V4.1
        </Text>
      ) : null}
```

---

## 10. ĐIỀU KIỆN MỞ LỆNH ĐẦY ĐỦ

### Thuận xu hướng — Tab V4.1 (`entryQualityEngine` + `SignalBoardV41`)

- `visibilityMode === 'TRADE_MODE'`
- `opportunity.opportunityValid === true` → `entryQuality >= eqThreshold` (70/75/80 theo tier Confidence) **VÀ** `opportunityDirection !== 'NONE'`
- Nút LONG/SHORT xanh: `entryQualityLong/Short >= 70` + đúng hướng
- `earlyWarning.severity !== 'BLOCK'` (BLOCK → `isEwBlock`, nút disabled + force WATCH_MODE trong scan)

### Thuận xu hướng — Tab Tổng hợp STRONG / STRONG_V41 (`unifiedSignalEngine.ts`)

```typescript
const V41_MIN_CONFIDENCE = 70;
const V41_MIN_EQ = 85;

const STRONG_V41_MARKET_STATES: readonly MarketState[] = [
  'StrongUptrend',
  'HealthyUptrend',
  'StrongDowntrend',
  'WeakDowntrend',
];

  const v41CanEnter =
    hasDirection && confidence >= V41_MIN_CONFIDENCE && eq >= V41_MIN_EQ;
```

- **STRONG:** V4 ✅ + V4.1 ✅ + cùng hướng
- **STRONG_V41:** V4 ❌ + V4.1 ✅ + `marketState` trong `STRONG_V41_MARKET_STATES`
- **MEDIUM:** V4 ✅ + V4.1 ❌ + cùng hướng
- Early Warning BLOCK trên Unified: downgrade STRONG_V41 → WATCH (`applyEarlyWarningToUnifiedSignal`)

### Đảo chiều (Reversal) — theo spec mục tiêu vs code thực tế

| Điều kiện (spec) | Trong code |
|------------------|------------|
| ≥ 3/5 dấu hiệu đảo chiều | ✅ `checkReversalSignals` → `MIN_CONFIRM_SIGNALS = 3` |
| Retest EMA20 1H xác nhận | ✅ `checkRetestEMA20_1H` → `RETEST_CONFIRMED` |
| EQ counter ≥ 80 | ❌ Chưa implement |
| Confidence ≥ 60 | ❌ Chưa implement |

### Block tất cả

| Block | Nơi áp dụng |
|-------|-------------|
| Early Warning = BLOCK | `scanV41`: force `WATCH_MODE`; `SignalBoardV41`: `isEwBlock` disable nút; Position Advisor: `CLOSE_NOW` priority 110 |
| Reversal WATCHING/CONFIRMED ngược hướng lệnh | Position Advisor: `CLOSE_NOW` priority 115 |
| V4 và V4.1 xung đột hướng | Tab Tổng hợp only: `unifiedSignalEngine` → `canEnter: false` |

---

## 11. HẠN CHẾ HIỆN TẠI

1. **`klines1H` không có trên `SignalRowV41`** — scan không gán field này; `generateReversalSetup` trong UI dùng `row.klines1H ?? []` → SL thường `NaN` → modal không mở dù `RETEST_CONFIRMED`.
2. **Ngưỡng EQ≥80 / Conf≥60 cho reversal** — chưa có trong `reversalTradeSetup.ts` hay trigger UI.
3. **TP multiplier × 0.8 cho counter-trend** — chưa implement; reversal dùng TP1/2/3 R:R cố định 1.5/2.5/3.5.
4. **`App.tsx` chưa truyền `v41Rows` vào `SignalBoardUnified`** — tab Tổng hợp fallback `ewCurrentSeverity` từ store, banner reversal/EW đầy đủ cần prop `v41Rows`.
5. **Không có Debug Panel UI** — chỉ có state trong Zustand stores.
6. **Early Warning chỉ detect bearish signals** (price below EMA, slope down, sell pressure) — phù hợp trend BULL; chưa mirror đầy đủ cho trend BEAR trong EW engine (khác với reversal detector có cả bullish).
7. **Reversal modal chỉ trên tab V4.1** — Unified chỉ hiển thị banner text, không có `ReversalModal`.
8. **8 test fail toàn repo** — `driveSync.e2e` (7) + `positionAdvisorV4` (1), không liên quan reversal.

---

## 12. TEST COVERAGE

### `npx vitest run services/v41/__tests__`

```
 RUN  v4.1.8 D:/Thiennh3/APP/Trading/TradeScore

 Test Files  17 passed (17)
      Tests  260 passed (260)
   Start at  20:52:51
   Duration  26.84s (transform 985ms, setup 0ms, import 3.13s, tests 336ms, environment 60.83s)
```

### `npx vitest run store/__tests__`

```
 RUN  v4.1.8 D:/Thiennh3/APP/Trading/TradeScore

 Test Files  2 passed (2)
      Tests  17 passed (17)
   Start at  20:52:51
   Duration  7.29s (transform 262ms, setup 0ms, import 520ms, tests 33ms, environment 10.33s)
```

### Test files trực tiếp liên quan Reversal Engine

| File test | Số test (ước lượng) |
|-----------|---------------------|
| `earlyWarningEngine.test.ts` | 13 |
| `reversalDetector.test.ts` | 13 |
| `useV41Store.test.ts` | hysteresis EW |
| `useReversalStore.test.ts` | 9 |
| `positionAdvisorV41.test.ts` | gồm EW/reversal rules |
| `scanV41.test.ts` | opportunity/visibility |

---

*Báo cáo được tạo tự động từ source code tại `services/v41/`, `store/`, `components/dashboard/` — 2026-07-04.*
