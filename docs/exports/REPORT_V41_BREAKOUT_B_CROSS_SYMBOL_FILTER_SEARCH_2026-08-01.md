# REPORT — Breakout Confirm B Cross-Symbol Filter Search

**Date:** 2026-08-01
**Scope:** Report-only — Confirm B (retest) only; **không** đổi production / không chọn filter áp dụng

## Setup

- Input: `v41-breakout-v1-multi-symbol-longer-trades.csv` — **Confirm B only** (155 trades, 148 decided, 6 scenarios)
- Enrich: retest_dist% (|entry−level|/level), bars_to_retest, ATR@breakout (+ atr%), range_width%, vol_retest/vol_breakout; plus existing sl_dist%, side
- Cost: `net_r` đã trừ 0.18% RT từ backtest V1 trước
- Ngưỡng filter từ **percentile dataset gộp** (decided B trades)
- Ứng viên thật: **≥4/6** scenario E[R] sau phí **positive**, n_decided pooled ≥20, ≤2 scenario quá mỏng (n&lt;8)

### Percentiles (pooled decided B)

| Feature | p25 | p50 | p75 |
|---|---|---|---|
| sl_dist% | 1.23 | 1.73 | 2.35 |
| retest_dist% | 0.57 | 0.89 | 1.37 |
| bars_to_retest | 1 | 1 | 1 |
| atr% of price | 0.65 | 0.81 | 1.08 |
| range_width% | 2.32 | 3.18 | 3.80 |
| vol_retest/break | 0.89 | 1.22 | 2.02 |

## Bảng filter — E[R] sau phí theo scenario

| Filter | n_dec | E pooled | +/−/thin | NEAR 180d | NEAR 365d | SOL 180d | ETH 180d | BNB 180d | DOGE 180d | Candidate? |
|---|---|---|---|---|---|---|---|---|---|---|
| Baseline (no filter) | 148 | 0.033 | 3/3/0 | 0.71 (n=14) | 0.25 (n=30) | 0.19 (n=23) | -0.28 (n=20) | -0.20 (n=37) | -0.17 (n=24) | no |
| side=LONG | 70 | -0.121 | 2/4/2 | 0.36 (n=7) | 0.41 (n=15) | -0.13 (n=5) | -0.40 (n=13) | -0.21 (n=19) | -0.66 (n=11) | no |
| side=SHORT | 78 | 0.171 | 4/2/2 | 1.07 (n=7) | 0.10 (n=15) | 0.28 (n=18) | -0.06 (n=7) | -0.18 (n=18) | 0.24 (n=13) | **YES** |
| sl_dist% < p50 (1.73) | 74 | -0.043 | 2/3/2 | n/a (n=0) | 0.37 (n=5) | 0.39 (n=13) | -0.39 (n=16) | -0.11 (n=26) | -0.07 (n=14) | no |
| sl_dist% ≥ p50 (1.73) | 74 | 0.109 | 3/3/1 | 0.71 (n=14) | 0.23 (n=25) | -0.07 (n=10) | 0.17 (n=4) | -0.40 (n=11) | -0.33 (n=10) | no |
| sl_dist% ≥ p75 (2.35) | 38 | -0.139 | 2/4/4 | 0.33 (n=9) | -0.06 (n=15) | -0.23 (n=6) | 0.18 (n=2) | -1.07 (n=3) | -1.05 (n=3) | no |
| retest_dist% < p50 (0.89) | 74 | 0.060 | 3/3/2 | 1.40 (n=1) | 0.96 (n=6) | 0.52 (n=12) | -0.35 (n=15) | -0.13 (n=24) | -0.04 (n=16) | no |
| retest_dist% < p25 (0.57) | 37 | 0.034 | 3/2/4 | n/a (n=0) | 0.74 (n=4) | 0.28 (n=7) | -0.37 (n=9) | 0.28 (n=10) | -0.44 (n=7) | no |
| bars_to_retest ≤ p50 (1) | 147 | 0.040 | 3/3/0 | 0.71 (n=14) | 0.25 (n=30) | 0.19 (n=23) | -0.28 (n=20) | -0.20 (n=37) | -0.14 (n=23) | no |
| bars_to_retest ≤ p25 (1) | 147 | 0.040 | 3/3/0 | 0.71 (n=14) | 0.25 (n=30) | 0.19 (n=23) | -0.28 (n=20) | -0.20 (n=37) | -0.14 (n=23) | no |
| bars_to_retest ≥ p75 (1) | 148 | 0.033 | 3/3/0 | 0.71 (n=14) | 0.25 (n=30) | 0.19 (n=23) | -0.28 (n=20) | -0.20 (n=37) | -0.17 (n=24) | no |
| atr% < p50 (0.81) | 74 | 0.030 | 2/3/2 | n/a (n=0) | 1.34 (n=2) | 0.59 (n=13) | -0.23 (n=19) | -0.04 (n=29) | -0.23 (n=11) | no |
| atr% ≥ p50 (0.81) | 74 | 0.036 | 2/4/1 | 0.71 (n=14) | 0.18 (n=28) | -0.33 (n=10) | -1.15 (n=1) | -0.77 (n=8) | -0.13 (n=13) | no |
| range_width% < p50 (3.18) | 74 | -0.096 | 3/3/1 | 1.42 (n=2) | 0.45 (n=8) | 0.33 (n=12) | -0.50 (n=15) | -0.23 (n=27) | -0.37 (n=10) | no |
| range_width% ≥ p50 (3.18) | 74 | 0.162 | 4/2/1 | 0.60 (n=12) | 0.18 (n=22) | 0.04 (n=11) | 0.37 (n=5) | -0.11 (n=10) | -0.03 (n=14) | **YES** |
| vol_retest/break ≥ p50 (1.22) | 74 | 0.209 | 4/2/0 | 0.88 (n=9) | 0.49 (n=16) | 0.46 (n=11) | 0.09 (n=8) | -0.01 (n=18) | -0.48 (n=12) | **YES** |
| vol_retest/break ≥ p75 (2.02) | 37 | 0.185 | 4/2/4 | 0.72 (n=7) | 0.44 (n=10) | 0.75 (n=4) | 0.52 (n=3) | -0.29 (n=9) | -1.12 (n=4) | no |
| vol_retest/break < p50 (1.22) | 74 | -0.143 | 2/4/1 | 0.43 (n=5) | -0.01 (n=14) | -0.06 (n=12) | -0.53 (n=12) | -0.37 (n=19) | 0.14 (n=12) | no |
| LONG + sl_dist% ≥ p50 (1.73) | 32 | 0.017 | 4/2/5 | 0.36 (n=7) | 0.43 (n=10) | 0.17 (n=2) | 0.17 (n=2) | -0.25 (n=6) | -1.09 (n=5) | no |
| LONG + retest_dist% < p50 (0.89) | 37 | -0.213 | 1/4/4 | n/a (n=0) | 0.74 (n=4) | -0.32 (n=3) | -0.44 (n=10) | -0.20 (n=13) | -0.42 (n=7) | no |
| bars≤p50 + sl%≥p50 | 73 | 0.125 | 3/3/1 | 0.71 (n=14) | 0.23 (n=25) | -0.07 (n=10) | 0.17 (n=4) | -0.40 (n=11) | -0.25 (n=9) | no |
| retest_dist<p50 + vol_ratio≥p50 | 31 | 0.130 | 3/2/5 | n/a (n=0) | 0.54 (n=3) | 0.63 (n=7) | -0.21 (n=5) | 0.22 (n=9) | -0.42 (n=7) | no |
| width%<p50 + bars≤p50 | 73 | -0.083 | 3/3/1 | 1.42 (n=2) | 0.45 (n=8) | 0.33 (n=12) | -0.50 (n=15) | -0.23 (n=27) | -0.30 (n=9) | no |
| SHORT + bars≤p50 (1) | 77 | 0.187 | 4/2/2 | 1.07 (n=7) | 0.10 (n=15) | 0.28 (n=18) | -0.06 (n=7) | -0.18 (n=18) | 0.34 (n=12) | **YES** |
| atr%<p50 + retest_dist%<p50 | 58 | 0.082 | 2/3/2 | n/a (n=0) | 1.34 (n=2) | 0.85 (n=10) | -0.29 (n=14) | -0.09 (n=23) | -0.03 (n=9) | no |

## Overfit check — dương khi gộp nhưng lệch symbol

- **sl_dist% ≥ p50 (1.73)**: E pooled=0.109 nhưng chỉ **3/6** dương → **overfit / kéo điểm bởi ít symbol**.
- **retest_dist% < p50 (0.89)**: E pooled=0.060 nhưng chỉ **3/6** dương → **overfit / kéo điểm bởi ít symbol**.
- **retest_dist% < p25 (0.57)**: E pooled=0.034 nhưng chỉ **3/6** dương → **overfit / kéo điểm bởi ít symbol**.
- **bars_to_retest ≤ p50 (1)**: E pooled=0.040 nhưng chỉ **3/6** dương → **overfit / kéo điểm bởi ít symbol**.
- **bars_to_retest ≤ p25 (1)**: E pooled=0.040 nhưng chỉ **3/6** dương → **overfit / kéo điểm bởi ít symbol**.
- **bars_to_retest ≥ p75 (1)**: E pooled=0.033 nhưng chỉ **3/6** dương → **overfit / kéo điểm bởi ít symbol**.
- **atr% < p50 (0.81)**: E pooled=0.030 nhưng chỉ **2/6** dương → **overfit / kéo điểm bởi ít symbol**.
- **atr% ≥ p50 (0.81)**: E pooled=0.036 nhưng chỉ **2/6** dương → **overfit / kéo điểm bởi ít symbol**.
- **bars≤p50 + sl%≥p50**: E pooled=0.125 nhưng chỉ **3/6** dương → **overfit / kéo điểm bởi ít symbol**.
- **retest_dist<p50 + vol_ratio≥p50**: E pooled=0.130 nhưng chỉ **3/6** dương → **overfit / kéo điểm bởi ít symbol**.
- **atr%<p50 + retest_dist%<p50**: E pooled=0.082 nhưng chỉ **2/6** dương → **overfit / kéo điểm bởi ít symbol**.

## Kết luận

**Có** — **4** filter đạt tiêu chí số cứng (≥4/6 dương, n_dec≥20, thin≤2). Liệt kê id (không tự chọn / không wire production):

| id | Filter | +/6 | n_dec | E pooled | Ghi chú |
|---|---|---|---|---|---|
| `side_SHORT` | side=SHORT | 4 | 78 | +0.171 | Âm: ETH (−0.06, n=7), BNB (−0.18). NEAR-180 n=7 thin. |
| `width_ge_p50` | range_width% ≥ 3.18 | 4 | 74 | +0.162 | Âm: BNB, DOGE. ETH n=5 thin. |
| `vol_ratio_ge_p50` | vol_retest/break ≥ 1.22 | 4 | 74 | +0.209 | Âm: BNB (−0.01), DOGE (−0.48). **0 thin** — sạch nhất về n. |
| `SHORT_bars_le_p50` | SHORT + bars≤1 | 4 | 77 | +0.187 | Gần trùng `side_SHORT` vì **bars_to_retest gần như luôn = 1** (p25=p50=p75=1) → feature bars gần như vô dụng trong mẫu này. |

**Không tự chọn filter cuối** trong task này.

### Caveat (đọc cùng tiêu chí)

- 2/4 “dương” thường gồm **NEAR-180 + NEAR-365** (cùng coin, cửa sổ chồng) → đếm 4/6 **dễ đạt hơn** so với 4 symbol độc lập thật.
- Baseline B vẫn chỉ 3/6 dương; các ứng viên chủ yếu **kéo ETH lên yếu / cắt LONG** chứ chưa đảo BNB+DOGE cùng lúc một cách vững.
- Vì vậy: **đạt tiêu chí số ≠ đã chứng minh edge ổn định đa symbol**. Cần bước xác nhận tách NEAR (1 scenario) hoặc walk-forward trước khi coi là production candidate.

## Artefacts

- `scripts/search-v41-breakout-b-cross-symbol-filters.ts`
- `docs/exports/v41-breakout-b-cross-symbol-filter-trades-enriched.csv`
- `docs/exports/v41-breakout-b-cross-symbol-filter-results.csv`
- `docs/exports/v41-breakout-b-cross-symbol-filter-summary.json`

*End of report.*
