# Task V41-SOL-1 — Backtest Infrastructure Investigation (Report Only)

**Ngày:** 2026-08-08  
**Phạm vi:** Điều tra hiện trạng — **không sửa code, không chạy backtest**

---

## Trạng thái

**DONE (report-only).** Không có phần “Đã sửa”.

---

## 1. SOL hiện dùng chiến lược gì?

**Trend Reversal** — không phải breakout.

```12:19:services/v41/strategy/resolveSymbolStrategy.ts
export const SYMBOLS_USING_BREAKOUT_STRATEGY: readonly string[] = ['NEARUSDT'];

export function resolveSymbolStrategy(symbol: string): V41SymbolStrategy {
  const normalized = symbol.trim().toUpperCase();
  if (SYMBOLS_USING_BREAKOUT_STRATEGY.includes(normalized)) {
    return 'breakout';
  }
  return 'trend_reversal';
}
```

Wire RC3:

```216:240:services/v41/rc3/buildRc3ViewModel.ts
export function buildRc3ViewModelFromRow(row: SignalRowV41): V41Rc3SignalCardModel {
  ...
  if (resolveSymbolStrategy(symbol) === 'breakout') {
    return buildBreakoutRc3Card(row);
  }
  ...
  const trendWithContext = evaluateTrendReversalWithContext(...);
```

| | **NEAR (breakout)** | **SOL (trend_reversal)** |
|--|---------------------|---------------------------|
| Router | Allow-list `NEARUSDT` | Default path |
| Detector | `scanBreakoutSetups` / Confirm B retest | `evaluateTrendReversalWithContext` |
| Checklist UI | Consolidation / Breakout / Retest / Momentum (4/4 all-or-nothing khi có levels) | CVD Flip / Volume / Structure / Exhaustion |
| Gate ACTIVE | Có setup Confirm B + age ≤ 80×1H | ≥ **3**/4 signals + confidence ≥ **50** |
| SL / TP | ATR×`BREAKOUT_ATR_MULT` @ break level; TP1 RR **1.5** | Counter-trend SL / TR setup (reversalTradeSetup / engine TR) |
| Confidence card | `null` (không dùng TR confidence %) | `confidenceTr` từ TR engine |

---

## 2. Hạ tầng backtest hiện có

### 2.1 `backtest-v4-near-90d.ts` — V4 hay V4.1? Tái dùng cho V4.1/SOL?

| Câu hỏi | Trả lời |
|---------|---------|
| Hệ thống | **V4** (`scorerV4` / `tradePlanV4` / ambiguity) |
| V4.1? | **Không** — header cấm `services/v41/**`, `backtest-v41-*` |
| SOL trên V4? | Script **đã** hỗ trợ `--symbol SOL` (alias `SOLUSDT`) cho **scorer V4** |
| Tái dùng cho V4.1 breakout? | **Không** — logic khác hoàn toàn (`breakoutDetector` ≠ `scorerV4`) |

### 2.2 Catalog `scripts/backtest-*.ts` (không có thư mục `archive/` trong repo)

**Nguồn data chung (đại diện):** fetch klines **thật** Binance Futures (`BINANCE_BASE_URL` / `fapi` klines), không synthetic random. Outcome thường TP/SL/TIMEOUT + WR / E[R] (± phí 0.08–0.18% RT tùy script).

#### Nhóm A — V4 (scorer)

| Script | Mục đích | Coin |
|--------|----------|------|
| `backtest-v4-near-90d.ts` (+ `.test.ts`) | Runner V4 multi-symbol / ambiguity sweep | BTC/SOL/BNB/NEAR |
| `backtest-v4-near-l6-multi-period.ts` (+ test) | Ổn định L6 filter V4 | NEAR (90/180/365) |
| `backtest-v4-near-30d-real.test.ts` | Wrapper 30d OI/LS thật | NEAR |

#### Nhóm B — V4.1 Breakout (`breakoutDetector` / Confirm A|B)

| Script | Mục đích | Coin có SOL? |
|--------|----------|--------------|
| `backtest-v41-breakout-near-180d.ts` | Immediate vs retest, nhiều cấu hình consolidation | NEAR |
| `backtest-v41-breakout-refinement-near-180d.ts` | W_N20_X5, ATR SL, strong-candle | NEAR |
| `backtest-v41-breakout-v1-multi-symbol-longer.ts` | V1 W_N20_X5 Confirm A/B + phí | **SOL** 180d + NEAR/ETH/BNB/DOGE |
| `backtest-v41-breakout-btc-filter-multi.ts` | Confirm B + filter BTC 4H | **SOL** + multi |
| `backtest-v41-breakout-volratio-oos.ts` | Confirm B + vol ratio OOS | **SOL** + multi |
| `backtest-v41-breakout-near-production-pipeline.ts` | **Production** RC3 path (`resolveSymbolStrategy` → pick → card) | NEAR only (symbol hardcode) |
| `backtest-v41-breakout-near-production-180d.ts` | Descriptive 180d production-like | NEAR |
| `backtest-v41-breakout-near-time-stability.ts` | Quarters / walk-forward | NEAR |
| `backtest-v41-breakout-trend-btc-near.ts` | TrendStrength + BTC filter | NEAR |
| `backtest-v41-final-multi-symbol-fees.ts` | Multi-symbol + fees | **SOL** (+ NEAR/ETH…) |

→ Đã từng **research-backtest SOL trên breakout detector** (gọi `scanBreakoutSetups` trực tiếp), **không** nghĩa production SOL đã switch breakout.

#### Nhóm C — V4.1 Trend Reversal / liên quan

| Script | Mục đích | SOL? |
|--------|----------|------|
| `backtest-v41-combined-180d-winrate.ts` | TR combined WR | NEAR |
| `backtest-v41-multi-symbol-longer.ts` | Production TR multi | **SOL** |
| `backtest-v41-continuous-scoring.ts` | Continuous vs binary TR | **SOL** |
| `backtest-v41-exhaustion-threshold.ts` | Exhaustion gate binary | **SOL** |
| `backtest-v41-tr-confirmation-layers.ts` | Lớp xác nhận TR | **SOL** (alt set) |
| `backtest-v41-ls-oi-confirmation.ts` | L/S + OI confirm TR | **SOL** |
| `backtest-v41-sl-window-fix-180d.ts` | SL window fix rebacktest | NEAR |
| `backtest-v41-rr-atr.ts` | RR/ATR trên ACTIVE CSV | phụ thuộc CSV |
| `backtest-v41-near-oi-rr-ev.ts` / `near-pipeline-funnel.ts` | OI/EV / confidence funnel | NEAR (+ funnel có alias SOL) |
| `backtest-v41-trendfollow-*.ts` | Trend-follow detector (không phải Confirm B live) | NEAR / multi (C có SOL) |

### 2.3 Tái dùng cho mục tiêu “SOL breakout tối ưu winrate như NEAR”?

| Asset | Tái dùng? | Ghi chú |
|-------|-----------|---------|
| `backtest-v4-near-90d` | **Không** cho V4.1 breakout | Đúng tầng V4 |
| `backtest-v41-breakout-v1-multi-symbol-*` / `volratio` / `btc-filter` | **Có (mẫu research)** | Đổi/parametrize symbol=SOL; đã có scenario SOL-180d |
| `backtest-v41-breakout-near-production-pipeline` | **Có (mẫu production)** | Cần cho phép SOL trong `SYMBOLS_USING_BREAKOUT_STRATEGY` *hoặc* fork script inject path breakout — **chưa làm trong task này** |
| TR multi-symbol scripts | Baseline so sánh | Đo SOL **đang live** (TR), không tối ưu breakout |

**Đo WR:** klines **lịch sử thật** (Futures), mô phỏng fill theo high/low sau entry tới TP/SL/max-hold — không phải data giả lập random.

---

## 3. Không gian tham số breakout (production NEAR + detector)

### Production wire (`buildBreakoutRc3Card`)

| Tham số | Giá trị hiện tại | File |
|---------|------------------|------|
| `BREAKOUT_LOOKBACK_N` | **20** | `buildRc3ViewModel.ts` (local const) |
| `BREAKOUT_MAX_WIDTH_PCT` | **5** |同上 |
| `BREAKOUT_ATR_MULT` | **1.0** |同上 |
| `confirmMode` | **`'retest'`** (Confirm B) |同上 |
| `slMode` | **`'atr_break_level'`** |同上 |
| `requireStrongBreakout` | **false** |同上 |
| `BREAKOUT_SIGNAL_MAX_AGE_BARS_1H` | **80** |同上 (pickCurrent) |

### Detector exports (`breakoutDetector.ts`)

| Tham số | Giá trị |
|---------|---------|
| `BREAKOUT_RETEST_MAX_BARS` | **10** |
| `BREAKOUT_RETEST_BAND_PCT` | **0.005** (±0.5%) |
| `BREAKOUT_TP1_RR` | **1.5** |
| `BREAKOUT_SL_BUFFER` | **0.003** (mode opposite_range; prod dùng ATR) |
| `BREAKOUT_ATR_PERIOD` | **14** |
| `BREAKOUT_ATR_AVG_LOOKBACK` | **20** |
| `BREAKOUT_STRONG_RANGE_ATR_MULT` | **1.5** (khi bật strong filter) |
| `BREAKOUT_STRONG_VOLUME_MULT` | **1.5** |
| `BREAKOUT_VOLUME_MA_PERIOD` | **20** |
| Confirm A vs B | `'immediate'` \| `'retest'` |

### Momentum gate (retest/immediate)

| Tham số | Giá trị |
|---------|---------|
| Momentum confirmed | **≥ 2** tín hiệu cùng phía (`momentumEngine1H`: `momentumLong/Short >= 2`) |

### Thêm chiều có trong research (chưa mặc định prod)

- Filter BTC 4H same-direction  
- `vol_retest/vol_breakout` ratio  
- Strong-candle fake-breakout (`requireStrongBreakout: true`)  
- `MAX_HOLD_1H` backtest (thường **80**, khớp cửa sổ age)  
- Cost model 0.08% fee + 0.10% slip  

---

## 4. Đề xuất hướng tiếp theo (**CHƯA làm**)

1. **Baseline 1 — SOL TR (live path):** chạy/đọc lại `backtest-v41-multi-symbol-longer` scenario SOL-180d (hoặc 365d) → WR/E[R] hiện tại trên Trend Reversal.  
2. **Baseline 2 — SOL breakout research (detector):** tái chạy / param-sweep trên khung giống `backtest-v41-breakout-v1-multi-symbol-longer` với **SOL 180d + 365d**, Confirm B mặc định prod (retest, N=20, X=5%, ATR×1.0).  
3. **Sweep có kiểm soát** (ít chiều / OOS):  
   - Grid nhỏ: `LOOKBACK_N ∈ {15,20,25}`, `MAX_WIDTH ∈ {4,5,6}`, `RETEST_MAX ∈ {6,10,14}`, `BAND ∈ {0.3%,0.5%,0.7%}`, `ATR_MULT ∈ {0.8,1.0,1.2}`, tuỳ chọn `requireStrongBreakout`.  
   - Holdout: train 180d / OOS 180d hoặc walk-forward nửa kỳ.  
4. **Production-parity (sau khi chọn bộ tham số):** script kiểu `near-production-pipeline` nhưng cho SOL — chỉ có ý nghĩa sau khi (task sau) thêm SOL vào allow-list *hoặc* test harness bypass router.  
5. **So sánh quyết định ship:** chỉ route SOL → breakout nếu E[R]/WR (sau phí) **ổn định OOS** và không xấu hơn TR baseline; cân nhắc tham số **per-symbol** vs share NEAR constants.  
6. **Dữ liệu:** Binance Futures 1H (+ 4H nếu filter BTC/trend); khung đề xuất **180d in-sample + 180d OOS** hoặc **365d** + quarterly stability (như NEAR time-stability).  
7. **Không** dùng `backtest-v4-near-90d` cho mục tiêu V4.1 breakout.

---

## Task ID

**V41-SOL-1** (Backtest Infrastructure Investigation).
