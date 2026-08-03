# REPORT — V4.1 NEAR Routing Discovery (Breakout vs Reversal)

**Date:** 2026-08-01  
**Scope:** Khảo sát only — **không sửa code / không wire production**.  
**Mục tiêu:** Xác định điểm điều phối scan/signal theo symbol để sau này NEAR → breakout, symbol khác → reversal (giữ nguyên).

---

## 1. Điểm điều phối scan & chỗ gọi reversal

### 1.1 Orchestrator chính: `scanV41`

| Item | Giá trị |
|---|---|
| File | `services/v41/scanV41.ts` |
| Entry | `export async function scanV41(symbols?: string[])` |
| Per-symbol | `async function scanOneSymbolV41(symbol: string)` |

`scanV41` chạy **song song** qua `Promise.allSettled(symbols.map(...))` — lỗi một symbol không dừng batch.

### 1.2 Path A — trong scan: **không** gọi `computeTrendReversal`

Trong `scanOneSymbolV41`, reversal được gắn qua `resolveReversalState` → **`checkReversalSignals` / `checkRetestEMA20_1H`** (phase machine EMA retest), **không** gọi `computeTrendReversal`.

Trích dẫn nguyên văn (điểm gọi detector trong scan):

```178:218:services/v41/scanV41.ts
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
```

Gọi từ vòng scan:

```249:259:services/v41/scanV41.ts
async function scanOneSymbolV41(symbol: string): Promise<SignalRowV41> {
  // ...
    const earlyWarning = resolveEarlyWarning(symbol, raw, snapshot);
    const reversalState = resolveReversalState(symbol, raw, snapshot);
```

`checkReversalSignals` trả `{ confirmed, signals }` — khác hẳn `TrendReversalResult`.

### 1.3 Path B — sau scan: **`computeTrendReversal`** (qua RC3 / export)

`computeTrendReversal` **không** nằm trong `scanV41`. Nó được gọi khi build ViewModel / rulebook từ `SignalRowV41` (klines đã fetch sẵn):

```172:179:services/v41/rc3/buildRc3ViewModel.ts
  const trendWithContext = evaluateTrendReversalWithContext(
    { klines1H, trendDirection, symbol },
    {
      fundingRate: row.fundingRate,
      klines4H: klines4H.length > 0 ? klines4H : undefined,
      btcKlines4H: btcKlines4H.length > 0 ? btcKlines4H : undefined,
    },
  );
```

`evaluateTrendReversalWithContext` (`marketContextFilter.ts`):

```627:635:services/v41/marketContextFilter.ts
export function evaluateTrendReversalWithContext(
  trendParams: ComputeTrendReversalParams,
  contextParams: Omit<MarketContextFilterParams, 'trendDirection'>,
): TrendReversalWithContextResult {
  const trendResult = computeTrendReversal(trendParams);
  return applyMarketContextFilter(trendResult, {
    ...contextParams,
    trendDirection: trendParams.trendDirection,
  });
}
```

**Kết luận điểm wire quan trọng nhất cho signal card RC3:**  
`buildRc3ViewModelFromRow` — đây là nơi quyết định logic TR → confidence → decision → levels.  
**Điểm phụ (legacy board / journal setup):** `resolveReversalState` trong `scanOneSymbolV41`.

---

## 2. Cách gọi orchestrator & danh sách symbol

### 2.1 Vòng lặp

Có — `scanV41(symbols)` map song song từng symbol. Caller chính:

```48:52:hooks/useUnifiedAppScan.ts
      await Promise.resolve(scanV3V4Ref.current(force));
      const v41Result = await scanV41(symbolsRef.current);
      setV41Rows(v41Result);
      setV41Cards(buildRc3ViewModelsFromScan(v41Result));
```

`App.tsx` dùng `useUnifiedAppScan(...)` → `v41Cards` vào board RC3.

### 2.2 Danh sách symbol

| Nguồn | Định nghĩa | Nội dung |
|---|---|---|
| Default scan | `DEFAULT_SCAN_SYMBOLS_V41` trong `scanV41.ts` | `NEARUSDT`, `SOLUSDT`, `BNBUSDT`, `BTCUSDT` |
| Hook default | `useUnifiedAppScan` copy từ `DEFAULT_SCAN_SYMBOLS_V41` (có thể override qua arg `symbols`) | cùng 4 |
| RC3 card order | `V41_RC3_SYMBOLS` trong `rc3ViewModelTypes.ts` | `BTCUSDT`, `SOLUSDT`, `BNBUSDT`, `NEARUSDT` (thứ tự UI khác default scan) |

Constant (hardcoded trong module, không config file riêng):

```77:82:services/v41/scanV41.ts
export const DEFAULT_SCAN_SYMBOLS_V41 = [
  'NEARUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'BTCUSDT',
] as const;
```

```109:114:services/v41/rc3/rc3ViewModelTypes.ts
export const V41_RC3_SYMBOLS = [
  'BTCUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'NEARUSDT',
] as const;
```

`buildRc3ViewModelsFromScan(rows, symbols = V41_RC3_SYMBOLS)` luôn emit **đúng 4 card** theo thứ tự RC3; thiếu row → empty card.

---

## 3. Consumers chính của kết quả reversal / TR

Hai “ngôn ngữ” khác nhau — wire breakout phải chọn consumer nào cần cùng contract.

### 3.A `ReversalState` (Path A — gắn trên `SignalRowV41.reversalState`)

| Consumer | Vai trò |
|---|---|
| `useReversalStore` | Persist phase WATCHING / RETEST_CONFIRMED / EXPIRED |
| `useV41Store.updateSymbolState` | Cache `lastReversalState` theo symbol |
| `SignalBoardV41` / `SignalBoardUnified` | Banner “đang theo dõi retest”; modal `generateReversalSetup` khi `RETEST_CONFIRMED` |
| `buildReversalTradeSetupFromRow` / `generateReversalSetup` | Trade plan counter-trend (entry/SL/TP từ phase) |
| `exportServiceV41.buildExportRowV41` | CSV fields `reversalPhase`, `reversalCounterDirection` |
| `buildTradeSessionAdviser` / `evaluatePositionV41` | Truyền `reversalState` vào position adviser |
| Journal sync (`useJournalMarketSync`) | Pass-through `reversalState` |

### 3.B `TrendReversalResult` / `TrendReversalWithContextResult` (Path B — **không** lưu trên row; recompute từ klines)

| Consumer | Vai trò |
|---|---|
| `buildRc3ViewModelFromRow` | Checklist 4 tín hiệu, gate TR, `triggerType: 'Trend Reversal'`, confidence + decision engines, `planTradeExecution` → levels UI |
| `computeConfidenceEngineResult` → `computeDecisionEngineResult` | LONG/SHORT/WATCH từ TR+context |
| `adaptTrendReversalResult` (`foundation/adapters.ts`) | Envelope foundation / reviews |
| `v41Export/rulebook/Builder.ts` | Re-call `evaluateTrendReversalWithContext` cho Rulebook markdown |
| Unit/backtest scripts | Nhiều script research — ngoài production UI |

### 3.C Downstream UI/export dùng **`V41Rc3SignalCardModel`** (đã “dịch” từ TR)

| Consumer | Vai trò |
|---|---|
| `V41BoardRC3` / `V41SignalPanel` / `V41SignalCard` | Render card từ `v41Cards` |
| Open LONG/SHORT từ card | Dùng `levels` + `decision` trên model |

**Ghi chú:** `V41TriggerType` đã có `'Fake Breakout'` nhưng `resolveTriggerType` **chưa** map breakout thật (comment: Fake Breakout Engine chưa có). Breakout detector hiện tại là Donchian Confirm B — khác tên enum, cần quyết định label khi wire.

---

## 4. So sánh type output: Breakout vs Trend Reversal

### 4.1 Trend Reversal — `TrendReversalResult` (`reversalDetector.ts`)

```typescript
type TrendReversalState = 'ACTIVE' | 'WATCH';

interface TrendReversalSignals {
  cvdFlip: boolean;
  volumeConfirmation: boolean;
  trendExhaustion: boolean;
  structureBreak: boolean;
}

interface TrendReversalDetail {
  trendExhaustion: number;
  volumeRatio: number;
  cvdLast3: [number, number, number];
  structureBreakType: 'HH_LH' | 'LL_HL' | null;
  olderSwingPrice / newerSwingPrice: number | null;
  confidence: number;
  activeConditionCount: number;
}

interface TrendReversalResult {
  state: TrendReversalState;
  signals: TrendReversalSignals;
  detail: TrendReversalDetail;
  reversalScore?: number;           // continuous only
  componentScores?: {...};          // continuous only
  isEffectivelyInactive?: boolean;  // continuous only
}
```

Sau filter: `TrendReversalWithContextResult` = trên + `marketContext`, `preContextState?`, hướng.

**Không** chứa sẵn entry/SL/TP — levels do `planTradeExecution` sau decision.

### 4.2 Breakout — output chính research: `BreakoutTradeLevels` (`breakoutDetector.ts`)

```typescript
interface BreakoutTradeLevels {
  side: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  slDistancePct: number;
  tp1RR: number;
  rangeHigh / rangeLow: number;
  confirmMode: 'immediate' | 'retest';
  consolidationMode: 'width' | 'bb_contracting';
  breakoutOpenTime: number;
  activeOpenTime: number;
}
```

Các type phụ: `BreakoutEvent`, `DonchianRange` — event/geometry, không phải decision envelope.

API scan: `scanBreakoutSetups(...) → BreakoutTradeLevels[]` (nhiều setup theo lịch sử), không có `ACTIVE|WATCH` / confidence gate kiểu TR.

### 4.3 Bảng khác biệt (để biết cần “dịch” gì)

| Field / khái niệm | TR (`TrendReversalResult`) | Breakout (`BreakoutTradeLevels`) | Ghi chú wire |
|---|---|---|---|
| `state` ACTIVE/WATCH | Có | **Thiếu** | RC3/decision cần; phải map (vd. có setup hiện tại → ACTIVE) |
| `signals` 4 bool checklist | Có | **Thiếu** | Checklist UI TR-specific; breakout cần checklist khác hoặc empty/gate riêng |
| `detail.confidence` | Có | **Thiếu** | Confidence engine ăn TR+context — **không** drop-in |
| Swing / structure stop | Có (detail) | Range high/low thay thế | Structure stop RC3 từ swing TR |
| `side` / direction | Gián tiếp (từ trend + decision) | **Có** `side` | Breakout rõ hơn |
| `entry` / `sl` / `tp1` | **Thiếu** (planner sau) | **Có sẵn** | Breakout đã có levels; có thể bypass `planTradeExecution` TR |
| Market context filter | Có (WithContext) | **Thiếu** | BTC filter research nằm ngoài detector |
| Phase EMA retest store | Path A `ReversalState` | **Không tương đương** | Confirm B retest ≠ EMA20 retest store |
| Continuous scoring fields | Optional | **Thiếu** | N/A |

**Kết luận type:** Breakout **không** nói cùng ngôn ngữ với `TrendReversalResult`. Consumer “nặng” nhất cần cùng ngôn ngữ là **`V41Rc3SignalCardModel`** (decision + levels + triggerType + gate/checklist), không phải raw TR result. Path A (`ReversalState`) là contract thứ hai nếu vẫn giữ SignalBoard legacy cho NEAR.

---

## 5. Đề xuất routing (chỉ đề xuất — không code)

### Phương án A — If/else theo symbol tại điểm điều phối

**Chỗ:**  
1) `buildRc3ViewModelFromRow`: `if (symbol === 'NEARUSDT')` → breakout path → map thẳng/`adapt` sang `V41Rc3SignalCardModel`; else giữ `evaluateTrendReversalWithContext`…  
2) Tuỳ chọn: trong `resolveReversalState` / `scanOneSymbolV41` skip hoặc no-op reversal store cho NEAR để tránh banner EMA retest lẫn breakout.

| Ưu | Nhược |
|---|---|
| Ít file, rõ “NEAR đặc biệt”, khớp scope chỉ-NEAR | Logic scan/VM phình; khó mở rộng thêm coin sau; dễ quên consumer thứ 2 (export rulebook / legacy board) |
| Wire nhanh cho RC3 | Rulebook Builder vẫn re-call TR trừ khi cũng branch |

### Phương án B — Lớp strategy / adapter riêng

**Chỗ:** Ví dụ `resolveSymbolStrategy(symbol) → 'trend_reversal' | 'breakout'` + `adaptBreakoutToRc3Card(row)` (và optional `adaptBreakoutToExport`).  
`buildRc3ViewModelFromRow` chỉ gọi adapter theo strategy; `scanV41` vẫn fetch raw chung (klines/BTC đã đủ cho breakout + BTC filter).

| Ưu | Nhược |
|---|---|
| Tách concern; consumer RC3 chỉ thấy 1 card model; dễ test adapter | Nhiều file hơn lần đầu; phải thiết kế checklist/gate breakout (hoặc gate rút gọn) |
| Export/UI khác có thể reuse adapter | Overkill nếu chắc chắn mãi chỉ NEAR |

### Gợi ý thực dụng

- **RC3 là SSOT UI hiện tại** (`useUnifiedAppScan` → `v41Cards`) → ưu tiên route tại **`buildRc3ViewModelFromRow`** (A tối thiểu, hoặc B nếu muốn sạch).  
- **Không** cần đổi `DEFAULT_SCAN_SYMBOLS_V41` chỉ để route — list đã chứa NEAR; route là **algorithm**, không phải membership.  
- Nếu NEAR không còn dùng EMA-retest Path A: tắt/skip `resolveReversalState` cho NEAR để tránh double-signal (TR banner + breakout card).  
- Rulebook export: nếu vẫn export NEAR theo TR checklist sẽ **sai nghĩa** — cần branch hoặc skip TR sections / section breakout riêng khi wire.

---

## 6. Sơ đồ luồng (hiện tại)

```
useUnifiedAppScan(symbols ≈ DEFAULT_SCAN_SYMBOLS_V41)
  └─ scanV41(symbols)
       └─ scanOneSymbolV41(symbol)  × N parallel
            ├─ fetchRawMarketV41
            ├─ MI / momentum / EW / opportunity / visibility
            └─ resolveReversalState → checkReversalSignals + store  → row.reversalState
  └─ buildRc3ViewModelsFromScan(rows, V41_RC3_SYMBOLS)
       └─ buildRc3ViewModelFromRow(row)
            └─ evaluateTrendReversalWithContext → computeTrendReversal  ← Path B
                 → confidence → decision → planTradeExecution → V41Rc3SignalCardModel
```

`breakoutDetector.ts` hiện **không** nằm trên sơ đồ production.

---

## Artefacts

- Report này: `docs/exports/REPORT_V41_NEAR_ROUTING_DISCOVERY_2026-08-01.md`  
- Không có CSV/JSON (discovery tĩnh).  
- Code tham chiếu chính: `scanV41.ts`, `buildRc3ViewModel.ts`, `marketContextFilter.ts`, `reversalDetector.ts`, `breakoutDetector.ts`, `useUnifiedAppScan.ts`.

*End of report — no production changes.*
