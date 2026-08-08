# Task V41-SOL-4 / Task3 — Clean Breakout Baseline — SOL 365d

**Date:** 2026-08-08
**Symbol:** SOLUSDT · Confirm B retest · NEAR params + level-occupancy dedupe · 365d
**Window:** 2025-08-08T04:32:23.655Z → 2026-08-08T04:32:23.655Z
**Cost:** fee 0.08% + slip 0.1% = **0.18%** RT · **no BTC filter** · **dedupeByBrokenLevel=true**

## Config (NEAR production defaults)

| Param | Value |
|---|---|
| LOOKBACK_N | 20 |
| MAX_WIDTH_PCT | 5 |
| ATR_MULT | 1 |
| confirmMode | retest |
| RETEST_MAX_BARS | 10 |
| RETEST_BAND_PCT | 0.005 (±0.5%) |
| TP1_RR | 1.5 |
| slMode | atr_break_level |
| requireStrongBreakout | false |
| MAX_HOLD_1H | 80 |
| dedupeByBrokenLevel | true (occupancy-B) |

## FULL 365d — Breakout (clean)

| Metric | Value |
|---|---|
| n_active | 40 |
| wins / losses / both / timeout | 19 / 21 / 0 / 0 |
| WR | 47.50% |
| E[R] before fees | 0.1875 |
| E[R] after fees | 0.0836 (positive) |
| LONG / SHORT n | 11 / 29 |

## Quarterly + halves — Breakout

| Slice | n | decided | WR% | E[R] before | E[R] after | sign | L/S |
|---|---:|---:|---:|---:|---:|---|---|
| FULL_365d | 40 | 40 | 47.50 | 0.188 | 0.084 | positive | 11/29 |
| Q1 | 10 | 10 | 40.00 | 0.000 | -0.098 | negative | 3/7 |
| Q2 | 11 | 11 | 54.55 | 0.364 | 0.265 | positive | 3/8 |
| Q3 | 8 | 8 | 62.50 | 0.563 | 0.457 | positive | 1/7 |
| Q4 | 11 | 11 | 36.36 | -0.091 | -0.204 | negative | 4/7 |
| H1 | 21 | 21 | 47.62 | 0.190 | 0.092 | positive | 6/15 |
| H2 | 19 | 19 | 47.37 | 0.184 | 0.074 | positive | 5/14 |

## BẢNG SO SÁNH — TR (SOL-2) vs Breakout (SOL-3)

| Metric | TR (SOL-2) | Breakout Confirm B (SOL-3) | Δ (BO − TR) |
|---|---:|---:|---:|
| n_active | 46 | 40 | -6 |
| WR% | 38.64 | 47.50 | 8.86 pp |
| E[R] before | -0.112 | 0.188 | 0.299 |
| E[R] after fees | -0.230 | 0.084 | 0.314 |
| sign after fees | negative | positive | |

### Theo quý (WR% · E[R] after)

| Slice | TR WR · E[R] | Breakout WR · E[R] |
|---|---|---|
| Q1 | 28.57% · -0.489 (negative) | 40.00% · -0.098 (negative) |
| Q2 | 30.77% · -0.430 (negative) | 54.55% · 0.265 (positive) |
| Q3 | 66.67% · 0.425 (positive) | 62.50% · 0.457 (positive) |
| Q4 | 33.33% · -0.329 (negative) | 36.36% · -0.204 (negative) |
| H1 | 30.00% · -0.451 (negative) | 47.62% · 0.092 (positive) |
| H2 | 45.83% · -0.046 (negative) | 47.37% · 0.074 (positive) |
| FULL_365d | 38.64% · -0.230 (negative) | 47.50% · 0.084 (positive) |

## Kết luận sơ bộ

- Breakout mặc định (NEAR params) trên SOL 365d: WR **47.50%**, E[R] sau phí **0.084** (positive).
- So TR baseline: WR **cao hơn** · E[R] sau phí **tốt hơn**.
- Đây là tham số mặc định NEAR — **chưa** tối ưu cho SOL; n và quý vẫn nhiễu.

## Artefacts

- `docs/exports/v41-sol-4-breakout-365d-quarterly-clean.csv`
- `docs/exports/v41-sol-4-breakout-365d-quarterly-clean-trades.csv`
- `docs/exports/v41-sol-4-breakout-365d-quarterly-clean-summary.json`
- `scripts/backtest-v41-sol-breakout-365d-quarterly.ts`

## Việc còn lại

1. Task 4: sweep params — combo mới không được có E[R] sau phí thấp hơn baseline sạch này.
2. Nếu sweep thắng ổn định OOS → xét allow-list SOL breakout (production wire).

## Task ID

**V41-SOL-4-Task3**
