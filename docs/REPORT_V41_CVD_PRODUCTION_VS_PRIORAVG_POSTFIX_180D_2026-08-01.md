# REPORT — CVD production vs priorAvg_vs_c (post SL-fix, NEAR 180d)

**Date:** 2026-08-01
**Scope:** So sánh CVD only — SL đã sửa; Exhaustion≥28; **không** sửa `detectCvdFlip` production; **không** chọn cấu hình cuối
**n clocks:** 1079

## Cấu hình chung

- Exhaustion ≥28 · Volume/Structure production · gate ≥3/4
- confidenceTR công thức đã sửa · SL `entryPrice`-validated
- Hold 20×4H · BOTH = loss (conservative)

## Tần suất signal

| CVD mode | CVD pass | Signal-gate ≥3/4 | ≥30 | ≥35 | ≥40 | ≥45 | ≥50 |
|---|---|---|---|---|---|---|---|
| priorAvg_vs_c | 177 (16.4%) | 32 (3.0%) | 32 | 32 | 32 | 32 | 31 |
| production | 86 (8.0%) | 20 (1.9%) | 20 | 20 | 20 | 20 | 19 |

## Bảng so sánh chính (conf≥40)

| Cấu hình CVD | n active (conf≥40) | Winrate | LONG n/WR | SHORT n/WR |
|---|---|---|---|---|
| priorAvg_vs_c (thử nghiệm) | 32 | 40.7% | 15/61.5% | 17/21.4% |
| production gốc (detectCvdFlip) | 20 | 43.8% | 8/71.4% | 12/22.2% |

### Chi tiết outcome

| CVD mode | conf≥ | n | W | L | BOTH | NO_SL | wrong_side | WR |
|---|---|---|---|---|---|---|---|---|
| priorAvg_vs_c | ≥40 | 32 | 11 | 13 | 3 | 5 | 0 | 40.7% |
| priorAvg_vs_c | ≥50 | 31 | 11 | 12 | 3 | 5 | 0 | 42.3% |
| production | ≥40 | 20 | 7 | 7 | 2 | 4 | 0 | 43.8% |
| production | ≥50 | 19 | 7 | 6 | 2 | 4 | 0 | 46.7% |

## Quan sát (không chọn cấu hình)

- CVD pass riêng: priorAvg 177 vs production 86 trên 1079 nến.
- Gate ≥3/4: priorAvg 32 vs production 20.
- Không sửa `detectCvdFlip` production trong task này.

## Artefacts

- `docs/exports/v41-cvd-prod-vs-prioravg-postfix-180d.csv`
- `docs/exports/v41-cvd-prod-vs-prioravg-postfix-180d-trades.csv`
- `docs/exports/v41-cvd-prod-vs-prioravg-postfix-180d-summary.json`
- `scripts/compare-v41-cvd-prod-vs-prioravg-180d.ts`
