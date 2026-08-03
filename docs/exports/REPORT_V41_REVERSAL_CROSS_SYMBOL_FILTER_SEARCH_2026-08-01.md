# REPORT — Cross-symbol reversal filter search

**Date:** 2026-08-01
**Scope:** Report-only — enrich features trên trades đã có; **không** đổi production / không chọn filter áp dụng

## Setup

- Input: `v41-final-multi-symbol-fees-trades.csv` (202 trades, 7 scenarios) — CSV gốc **thiếu** feature; đã enrich lại từ klines tại timestamp
- Enrich tại timestamp: trendStrength, trendExhaustion_1h, volumeRatio, flipMag, structureBreak/Score, cvdFlip
- Cost: net_r đã trừ 0.18% RT (từ backtest fees trước)
- Ngưỡng filter từ **percentile dataset gộp** (decided trades), không đoán số cứng
- Ứng viên thật: **≥5/7** scenario có E[R] sau phí **positive**, n_decided pooled ≥30, ≤3 scenario quá mỏng (n&lt;10)
- **Lưu ý flipMag:** giá trị tuyệt đối phụ thuộc scale CVD theo symbol (NEAR vs ETH…) → percentile gộp trên flipMag **không so sánh công bằng**; các filter flipMag chỉ mang tính tham khảo yếu

### Percentiles (pooled decided)

| Feature | p25 | p50 | p75 |
|---|---|---|---|
| exh_1h | 10.0 | 30.0 | 40.0 |
| flipMag | — | 95971.74 | 444103.94 |
| sl_dist% | 1.03 | 1.59 | 2.23 |
| confidence | — | 58.4 | 62.8 |
| trendStrength | — | 70.0 | — |

## Bảng filter — E[R] sau phí theo scenario

| Filter | n_dec | E pooled | +/−/thin | NEAR 180d | NEAR 365d | SOL 180d | ETH 180d | ETH 365d | BNB 180d | DOGE 180d | Candidate? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Baseline (no filter) | 195 | -0.185 | 1/6/0 | -0.16 (n=19) | -0.30 (n=42) | -0.20 (n=28) | 0.16 (n=26) | -0.18 (n=52) | -0.45 (n=15) | -0.22 (n=13) | no |
| side=LONG | 101 | -0.099 | 2/5/2 | 0.46 (n=7) | -0.11 (n=20) | -0.26 (n=17) | 0.26 (n=10) | -0.13 (n=28) | -0.27 (n=10) | -0.32 (n=9) | no |
| side=SHORT | 94 | -0.277 | 1/6/2 | -0.52 (n=12) | -0.48 (n=22) | -0.10 (n=11) | 0.10 (n=16) | -0.24 (n=24) | -0.80 (n=5) | -0.01 (n=4) | no |
| exh_1h < p25 (10.0) | 43 | -0.143 | 2/5/5 | -0.27 (n=5) | -0.45 (n=12) | 0.70 (n=6) | -0.04 (n=6) | -0.29 (n=10) | 0.23 (n=3) | -1.19 (n=1) | no |
| exh_1h < p50 (30.0) | 86 | -0.245 | 0/7/3 | -0.02 (n=8) | -0.38 (n=17) | -0.29 (n=13) | -0.18 (n=12) | -0.23 (n=22) | -0.13 (n=8) | -0.40 (n=6) | no |
| exh_1h ≥ p75 (40.0) | 61 | -0.232 | 2/5/5 | -0.78 (n=7) | -0.37 (n=16) | -0.34 (n=6) | 0.33 (n=8) | -0.25 (n=16) | -0.66 (n=5) | 1.28 (n=3) | no |
| structureBreak=true | 173 | -0.211 | 0/7/0 | -0.04 (n=17) | -0.25 (n=37) | -0.13 (n=26) | -0.02 (n=22) | -0.31 (n=46) | -0.45 (n=15) | -0.19 (n=10) | no |
| structureBreak=false | 22 | 0.021 | 2/4/7 | -1.18 (n=2) | -0.68 (n=5) | -1.05 (n=2) | 1.17 (n=4) | 0.78 (n=6) | n/a (n=0) | -0.35 (n=3) | no |
| flipMag ≥ p50 (95971.74) | 99 | -0.242 | 1/5/3 | -0.05 (n=17) | -0.28 (n=38) | -0.39 (n=22) | 0.03 (n=4) | -0.20 (n=5) | n/a (n=0) | -0.22 (n=13) | no |
| flipMag ≥ p75 (444103.94) | 49 | -0.085 | 1/3/4 | -0.10 (n=11) | 0.04 (n=22) | -0.51 (n=4) | n/a (n=0) | n/a (n=0) | n/a (n=0) | -0.15 (n=12) | no |
| sl_dist% < p50 (1.59) | 96 | -0.291 | 1/6/1 | -0.03 (n=10) | -0.43 (n=24) | -0.53 (n=11) | 0.07 (n=10) | -0.30 (n=24) | -0.35 (n=13) | -0.07 (n=4) | no |
| sl_dist% ≥ p50 (1.59) | 99 | -0.081 | 2/5/3 | -0.30 (n=9) | -0.13 (n=18) | 0.02 (n=17) | 0.22 (n=16) | -0.07 (n=28) | -1.07 (n=2) | -0.29 (n=9) | no |
| sl_dist% ≥ p75 (2.23) | 50 | -0.046 | 3/4/5 | -0.60 (n=5) | -0.04 (n=12) | 0.17 (n=8) | 0.30 (n=7) | 0.15 (n=10) | -1.06 (n=1) | -0.37 (n=7) | no |
| confidence ≥ p75 (62.8) | 49 | -0.407 | 2/5/5 | 0.02 (n=8) | 0.00 (n=10) | -0.73 (n=6) | -0.78 (n=6) | -0.52 (n=14) | -0.65 (n=4) | -1.22 (n=1) | no |
| trendStrength < p50 (70.0) | 86 | -0.145 | 2/5/3 | 0.03 (n=4) | -0.09 (n=16) | -0.18 (n=10) | 0.11 (n=12) | -0.30 (n=29) | -0.08 (n=8) | -0.17 (n=7) | no |
| LONG + exh < p50 (30.0) | 43 | -0.270 | 1/6/6 | 0.50 (n=4) | -0.45 (n=9) | -0.66 (n=5) | -0.21 (n=5) | -0.11 (n=11) | -0.08 (n=6) | -1.15 (n=3) | no |
| LONG + exh < p25 (10.0) | 23 | -0.326 | 3/4/7 | 0.31 (n=3) | -0.57 (n=7) | 0.02 (n=2) | -0.06 (n=2) | -0.76 (n=5) | 0.23 (n=3) | -1.19 (n=1) | no |
| LONG + structureBreak | 90 | -0.153 | 2/5/3 | 0.46 (n=7) | -0.17 (n=19) | -0.21 (n=16) | 0.03 (n=8) | -0.25 (n=24) | -0.27 (n=10) | -0.31 (n=6) | no |
| LONG + sl_dist% ≥ p50 (1.59) | 54 | 0.047 | 2/4/5 | n/a (n=0) | 0.39 (n=5) | -0.10 (n=12) | 0.44 (n=9) | -0.03 (n=20) | -1.08 (n=1) | -0.07 (n=7) | no |

## Overfit check — filter dương khi gộp nhưng lệch symbol

- **structureBreak=false**: E pooled=0.021 nhưng chỉ **2/7** dương (ETH-180d, ETH-365d) → **overfit / kéo điểm bởi ít symbol**.
- **LONG + sl_dist% ≥ p50 (1.59)**: E pooled=0.047 nhưng chỉ **2/7** dương (NEAR-365d, ETH-180d) → **overfit / kéo điểm bởi ít symbol**.

## Kết luận

**Không tìm được filter nào** thỏa “E[R] sau phí dương nhất quán ≥5/7 scenario + n đủ lớn”.
Đây là bằng chứng bổ sung củng cố việc **không dựa vào filter hẹp tìm trên 1 coin** để cứu chiến lược reversal trong mẫu đã test — edge sau phí không hiện nhất quán qua symbol.

## Artefacts

- `docs/exports/v41-reversal-cross-symbol-filter-trades-enriched.csv`
- `docs/exports/v41-reversal-cross-symbol-filter-results.csv`
- `docs/exports/v41-reversal-cross-symbol-filter-summary.json`
- `scripts/search-v41-reversal-cross-symbol-filters.ts`
