# Task V41-SOL-3 — Baseline Breakout — SOL 365d (NEAR Default Params)

**Date:** 2026-08-08
**Symbol:** SOLUSDT · Confirm B retest · NEAR production params · 365d
**Window:** 2025-08-08T04:32:23.655Z → 2026-08-08T04:32:23.655Z
**Cost:** fee 0.08% + slip 0.1% = **0.18%** RT · **no BTC filter**

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

## FULL 365d — Breakout

| Metric | Value |
|---|---|
| n_active | 46 |
| wins / losses / both / timeout | 23 / 23 / 0 / 0 |
| WR | 50.00% |
| E[R] before fees | 0.2500 |
| E[R] after fees | 0.1463 (positive) |
| LONG / SHORT n | 12 / 34 |

## Quarterly + halves — Breakout

| Slice | n | decided | WR% | E[R] before | E[R] after | sign | L/S |
|---|---:|---:|---:|---:|---:|---|---|
| FULL_365d | 46 | 46 | 50.00 | 0.250 | 0.146 | positive | 12/34 |
| Q1 | 10 | 10 | 40.00 | 0.000 | -0.098 | negative | 3/7 |
| Q2 | 13 | 13 | 53.85 | 0.346 | 0.252 | positive | 4/9 |
| Q3 | 11 | 11 | 72.73 | 0.818 | 0.707 | positive | 1/10 |
| Q4 | 12 | 12 | 33.33 | -0.167 | -0.279 | negative | 4/8 |
| H1 | 23 | 23 | 47.83 | 0.196 | 0.100 | positive | 7/16 |
| H2 | 23 | 23 | 52.17 | 0.304 | 0.193 | positive | 5/18 |

## BẢNG SO SÁNH — TR (SOL-2) vs Breakout (SOL-3)

| Metric | TR (SOL-2) | Breakout Confirm B (SOL-3) | Δ (BO − TR) |
|---|---:|---:|---:|
| n_active | 46 | 46 | 0 |
| WR% | 38.64 | 50.00 | 11.36 pp |
| E[R] before | -0.112 | 0.250 | 0.362 |
| E[R] after fees | -0.230 | 0.146 | 0.376 |
| sign after fees | negative | positive | |

### Theo quý (WR% · E[R] after)

| Slice | TR WR · E[R] | Breakout WR · E[R] |
|---|---|---|
| Q1 | 28.57% · -0.489 (negative) | 40.00% · -0.098 (negative) |
| Q2 | 30.77% · -0.430 (negative) | 53.85% · 0.252 (positive) |
| Q3 | 66.67% · 0.425 (positive) | 72.73% · 0.707 (positive) |
| Q4 | 33.33% · -0.329 (negative) | 33.33% · -0.279 (negative) |
| H1 | 30.00% · -0.451 (negative) | 47.83% · 0.100 (positive) |
| H2 | 45.83% · -0.046 (negative) | 52.17% · 0.193 (positive) |
| FULL_365d | 38.64% · -0.230 (negative) | 50.00% · 0.146 (positive) |

## Kết luận sơ bộ

- Breakout mặc định (NEAR params) trên SOL 365d: WR **50.00%**, E[R] sau phí **0.146** (positive).
- So TR baseline: WR **cao hơn** · E[R] sau phí **tốt hơn**.
- Đây là tham số mặc định NEAR — **chưa** tối ưu cho SOL; n và quý vẫn nhiễu.

## Artefacts

- `docs/exports/v41-sol-breakout-365d-quarterly.csv`
- `docs/exports/v41-sol-breakout-365d-quarterly-trades.csv`
- `docs/exports/v41-sol-breakout-365d-quarterly-summary.json`
- `scripts/backtest-v41-sol-breakout-365d-quarterly.ts`

## Việc còn lại

1. Nếu breakout mặc định chưa thắng rõ → sweep params riêng SOL (task sau).
2. Nếu thắng ổn định OOS → xét allow-list SOL breakout (production wire).

## Task ID

**V41-SOL-3**
