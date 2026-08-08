# REPORT — V4.1 Exhaustion: Drop vs Lower threshold (NEAR 30d)

**Date:** 2026-08-01
**Scope:** V4.1 only — không sửa production / không chọn phương án
**Data:** join `v41-tr-exhaustion-1h-vs-4h-30d.csv` × `v41-reversal-checklist-scoring-30d-4h.csv` × `v41-market-confidence-30d-4h.csv` theo timestamp
**n joined:** 179 · non-neutral: 131 · missing checklist: 0 · missing confidence: 0

## Định nghĩa

- **A:** bỏ Exhaustion khỏi tổ hợp — chỉ `cvd + volume + structure` (mẫu số 3).
- **B:** giữ ≥3/4 với Exhaustion 1H ≥ mốc (10 / 15 / 20).
- **Baseline:** ≥3/4, Exhaustion ≥55 (constant production hiện tại).
- **confidence≥70 (proxy theo yêu cầu task):** cột `marketConfidence` (CSV market-confidence 30d).
- Overview `marketConfidence≥70`: n=179 → 30; non-neutral n=131 → 30 (min=0, max=90).
- **Caveat production:** TR ACTIVE thật dùng `computeTrendReversalConfidence(signals, detail)` trong `reversalDetector.ts` (điểm trung bình 4 component CVD/Volume/Exhaustion/Structure), **không** phải `marketConfidence` của Market Intelligence. Cột conf≥70 dưới đây là proxy theo CSV đã chỉ định — không phải replay exact confidence TR.

## Bảng so sánh

| Phương án | Điều kiện signal | Pass signal-gate (n=179) | Pass signal-gate (non-neutral n=131) | Pass CẢ signal-gate + confidence≥70 |
|---|---|---|---|---|
| A | ≥2/3 (bỏ Exhaustion) | 29 (16.2%) | 29 (22.1%) | 6 (3.4%) |
| A | ≥3/3 (bỏ Exhaustion) | 3 (1.7%) | 3 (2.3%) | 0 (0.0%) |
| B | ≥3/4, exhaustion≥10 | 16 (8.9%) | 16 (12.2%) | 2 (1.1%) |
| B | ≥3/4, exhaustion≥15 | 5 (2.8%) | 5 (3.8%) | 0 (0.0%) |
| B | ≥3/4, exhaustion≥20 | 5 (2.8%) | 5 (3.8%) | 0 (0.0%) |
| Baseline | ≥3/4, exhaustion≥55 (hiện tại) | 3 (1.7%) | 3 (2.3%) | 0 (0.0%) |

## Quan sát (không phải khuyến nghị)

- Cột cuối = signal-gate ∩ `marketConfidence≥70` (proxy). Chưa replay exact `computeTrendReversalConfidence`.
- A ≥3/3 ≡ Baseline signal-gate (cùng 3 nến): Exhaustion@55 luôn fail → ≥3/4 rút về 3/3 CVD+Volume+Structure.
- Với proxy `marketConfidence≥70`: chỉ **A ≥2/3 (6)** và **B ≥10 (2)** còn nến “full pass”; A≥3/3, B≥15/20, Baseline đều **0**.
- Không khuyến nghị / không chọn phương án trong báo cáo này. Production không đổi.

## Artefacts

- `docs/exports/v41-exhaustion-drop-vs-lower-comparison-30d.csv`
- `docs/exports/v41-exhaustion-drop-vs-lower-comparison-30d-summary.json`
