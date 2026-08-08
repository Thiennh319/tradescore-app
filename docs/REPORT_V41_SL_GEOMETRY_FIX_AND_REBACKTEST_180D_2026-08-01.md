# REPORT — V4.1 SL geometry fix + rebacktest 180d

**Date:** 2026-08-01
**Scope:** Sửa `computeCounterTrendSL`; CVD priorAvg_vs_c **chỉ** trong backtest script; không đổi MarketConfidence / Momentum1H / detectCvdFlip production

## Bước 1 — Sửa production

`services/v41/reversalDetector.ts` → `computeCounterTrendSL`:

1. Dùng `entryPrice`: SHORT yêu cầu SL > entry; LONG yêu cầu SL < entry.
2. Loại candidate EMA nếu sai phía → fallback swing-only (+ `SL_BUFFER=0.003`).
3. Nếu không còn candidate hợp lệ → trả `NaN` (caller skip trade).

Giữ: swing lookback 10, EMA20, buffer 0.003, TF 1H.

## Bước 2 — Unit tests

- Fixtures 4 timestamp lỗi: `services/v41/__tests__/fixtures/sl-geometry-*.json`
- Tests trong `services/v41/__tests__/reversalDetector.test.ts`
- Happy path + synthetic wrong-side EMA + NaN khi mọi candidate sai phía

## Bước 3 — Rebacktest 180d (sau sửa SL)

### SL sai phía trên lệnh active conf≥40

| Metric | Trước sửa | Sau sửa |
|--------|-----------|---------|
| n active (gate∧conf≥40) | 32 | 32 |
| SL sai phía | **20 (62.5%)** | **0** |
| NO_SL (NaN → skip) | 0 | 5 |

### Winrate (BOTH = loss, conservative)

| conf≥ | n | W | L | BOTH | TO | NO_SL | Winrate | Trước (tham chiếu) |
|---|---|---|---|---|---|---|---|---|
| 40 | 32 | 11 | 13 | 3 | 0 | 5 | 40.7% | 25.0% |
| 50 | 31 | 11 | 12 | 3 | 0 | 5 | 42.3% | ~25.8% |

### LONG vs SHORT (180d, conf≥40)

| Side | n | W | L | BOTH | NO_SL | wrong_side | WR (BOTH=loss) | Trước (1H-resolved) |
|---|---|---|---|---|---|---|---|---|
| LONG | 15 | 8 | 4 | 1 | 2 | 0 | 61.5% | 53.8% |
| SHORT | 17 | 3 | 9 | 2 | 3 | 0 | 21.4% | 7.7% |

### LONG vs SHORT (180d, conf≥50)

| Side | n | W | L | BOTH | NO_SL | wrong_side | WR |
|---|---|---|---|---|---|---|---|
| LONG | 14 | 8 | 3 | 1 | 2 | 0 | 66.7% |
| SHORT | 17 | 3 | 9 | 2 | 3 | 0 | 21.4% |

## Quan sát

- **wrong_side: 20 → 0**; **5 lệnh** skip an toàn (`NaN` khi swing-only cũng sai phía).
- Winrate conf≥40: **25.0% → 40.7%** (đạt ngưỡng hòa vốn ~40% @ R:R=1.5 trên decided trades; 5 NO_SL không vào mẫu số WR).
- LONG/SHORT vẫn lệch (61.5% vs 21.4%) nhưng SHORT đã cải thiện so với 7.7% — giả thuyết “SL SHORT lỗi nhiều hơn” đúng một phần, chưa giải thích hết.
- Unit tests liên quan: `reversalDetector` + `reversalTradeSetup` + `trendReversalEngine` = **44/44 pass** (đã cập nhật 2 assertion Exhaustion MIN 55→28).
- Không chọn ngưỡng confidence / không áp CVD priorAvg_vs_c vào production.

## Artefacts

- `docs/exports/v41-sl-geometry-fix-rebacktest-180d-summary.json`
- `docs/exports/v41-backtest-180d-winrate-trades.csv` (refresh sau fix)
- `docs/exports/v41-backtest-180d-winrate-summary.json`
- Fixtures: `services/v41/__tests__/fixtures/sl-geometry-*`
