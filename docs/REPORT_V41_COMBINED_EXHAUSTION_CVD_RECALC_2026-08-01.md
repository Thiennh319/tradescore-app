# REPORT — V4.1 Combined Exhaustion + CVD priorAvg_vs_c recalc (NEAR 30d)

**Date:** 2026-08-01
**Scope:** V4.1 — tính số liệu thử nghiệm; **không** áp CVD priorAvg_vs_c vào production; **không** chọn ngưỡng confidence
**n:** 179 · non-neutral: 131

## Cấu hình

| Config | CVD Flip | Exhaustion | scoreExhaustion |
|--------|----------|------------|-----------------|
| Baseline gốc | production `++-`/`--+` | ≥55 | `(exh−55)/45` |
| Chỉ sửa Exhaustion | production | ≥28 | `(exh−28)/(100−28)` |
| **Combined (MỚI)** | **priorAvg_vs_c** | ≥28 | `(exh−28)/(100−28)` |

Volume + Structure: giữ nguyên detector production.

## Per-signal pass (n=179)

| Config | CVD | Volume | Exhaustion | Structure |
|--------|-----|--------|------------|-----------|
| Baseline gốc (CVD prod + Exhaustion≥55 + score /45) | 12 | 36 | 0 | 64 |
| Chỉ sửa Exhaustion (CVD prod + Exhaustion≥28 + score /(100−MIN)) | 12 | 36 | 7 | 64 |
| Sửa Exhaustion + CVD priorAvg_vs_c (MỚI) | 25 | 36 | 7 | 64 |

## Bảng tổng hợp: signal-gate ≥3/4 ∩ confidenceTR

| Cấu hình | Signal-gate pass (n=179) | + confidenceTR≥30 | ≥35 | ≥40 | ≥45 | ≥50 | ≥55 | ≥60 | ≥70 |
|---|---|---|---|---|---|---|---|---|---|
| Baseline gốc (chưa sửa gì) | 3 (1.7%) | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 0 |
| Chỉ sửa Exhaustion | 3 (1.7%) | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 1 |
| Sửa Exhaustion + CVD priorAvg_vs_c (MỚI) | 7 (3.9%) | 7 | 7 | 7 | 7 | 7 | 7 | 4 | 1 |

## Quan sát (không phải khuyến nghị)

- Cột “+ confidenceTR≥X” = số nến đạt **cả** ≥3/4 signal-gate **và** confidenceTR≥X (công thức thật theo config).
- CVD priorAvg_vs_c chỉ trong script — production vẫn dùng `detectCvdFlip` pattern chặt.
- Không chọn ngưỡng confidence cuối trong task này.

## Artefacts

- `docs/exports/v41-combined-exhaustion-cvd-recalc-30d.csv`
- `docs/exports/v41-combined-exhaustion-cvd-per-bar-30d.csv`
- `docs/exports/v41-combined-exhaustion-cvd-recalc-30d-summary.json`
- `scripts/recalc-v41-combined-exhaustion-cvd-30d.ts`
