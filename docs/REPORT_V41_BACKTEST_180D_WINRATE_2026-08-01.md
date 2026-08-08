# REPORT — V4.1 Backtest 180d + Winrate (NEARUSDT, combined TR config)

**Date:** 2026-08-01
**Scope:** V4.1 experiment — CVD `priorAvg_vs_c` **chưa** vào production; Exhaustion MIN=28 đã production; **không** chọn ngưỡng cuối

## Bước 1 — Dữ liệu

| Series | Fetched |
|--------|---------|
| NEAR 4H | 1300 |
| NEAR 1H | 4400 |
| BTC 4H | 1300 (fetch đủ; gate TR experiment không dùng BTC dim) |
| Warmup 4H | 220 nến trước cửa sổ eval |
| Usable clocks 180d | **1079** (kỳ vọng ~1080=1080) |
| Usable clocks 30d (subset) | **179** |

## Bước 2 — Tần suất signal (cấu hình combined)

CVD=`priorAvg_vs_c` · Exhaustion≥28 · Volume/Structure production · gate≥3/4 · confidenceTR công thức đã sửa.

| Window | n | CVD | Vol | Exh | Structure | Signal-gate | ≥30 | ≥35 | ≥40 | ≥45 | ≥50 | ≥55 | ≥60 | ≥70 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 30d | 179 | 24 | 35 | 7 | 66 | 7 (3.9%) | 7 | 7 | 7 | 7 | 7 | 7 | 4 | 1 |
| 180d | 1079 | 177 | 205 | 73 | 297 | 32 (3.0%) | 32 | 32 | 32 | 32 | 31 | 31 | 18 | 5 |

So sánh tỷ lệ gate: 30d 3.9% vs 180d 3.0%.

## Bước 3 — Outcome / Winrate (lần đầu)

### Geometry (production, không bịa)

- **Direction:** BEAR→LONG, BULL→SHORT
- **Entry:** close nến 4H active
- **SL:** `computeCounterTrendSL` (`reversalDetector.ts`)
- **TP1:** `entry ± |entry−SL| × (TP1_RR=1.5 × resolveEffectiveTpMultiplier)` — verbatim `reversalTradeSetup.ts`
- **tpMultiplier:** `computeMomentum1H().tpMultiplier` × 1.2 nếu CAPITULATION/FUNDING_EXTREME else × 0.8 (`computeExhaustion` cho type)
- **Hold:** không có max hold trong production → **20 nến 4H** (~80h)
- **BOTH** (TP+SL cùng nến): đếm **loss** (conservative)
- **Winrate** = thắng / (thắng+thua+BOTH); timeout không vào mẫu số

### Kết quả

| Window | conf≥ | n active | Thắng (TP) | Thua (SL) | BOTH | Timeout | NO_SL | Winrate |
|---|---|---|---|---|---|---|---|---|
| 30d | ≥40 | 7 | 5 | 1 | 0 | 0 | 1 | 83.3% |
| 30d | ≥50 | 7 | 5 | 1 | 0 | 0 | 1 | 83.3% |
| 180d | ≥40 | 32 | 11 | 13 | 3 | 0 | 5 | 40.7% |
| 180d | ≥50 | 31 | 11 | 12 | 3 | 0 | 5 | 42.3% |

## Bước 4 — So sánh 30d vs 180d

| Metric | 30d ≥40 | 180d ≥40 | 30d ≥50 | 180d ≥50 |
|--------|---------|----------|---------|----------|
| n active | 7 | 32 | 7 | 31 |
| winrate | 83.3% | 40.7% | 83.3% | 42.3% |
| W/L/BOTH/TO | 5/1/0/0 | 11/13/3/0 | 5/1/0/0 | 11/12/3/0 |

**Cảnh báo:** winrate conf≥40 lệch lớn 30d (83.3%) vs 180d (40.7%) — mẫu 30d có thể overfitting/may rủi.

## Ghi chú

- SL geometry đã sửa trong `computeCounterTrendSL` (entryPrice validate). CVD priorAvg_vs_c vẫn chỉ trong script backtest.
- Outcome đo geometry TP1/SL của `reversalTradeSetup`, **không** yêu cầu full gate RETEST_CONFIRMED / EQ / marketConfidence của `generateReversalSetup`.

## Artefacts

- `docs/exports/v41-backtest-180d-signal-freq.csv`
- `docs/exports/v41-backtest-180d-winrate-trades.csv`
- `docs/exports/v41-backtest-180d-winrate-summary.csv`
- `docs/exports/v41-backtest-180d-winrate-summary.json`
- `scripts/backtest-v41-combined-180d-winrate.ts`
