# REPORT — V4.1 TR confidence REAL recalc (NEAR 30d)

**Date:** 2026-08-01
**Scope:** V4.1 only — không sửa production / không chọn phương án
**Thay thế:** proxy `marketConfidence` → đúng `computeTrendReversalConfidence(signals, detail)`
**n:** 179 · non-neutral: 131 · verify mismatch vs engine: 0

## Bước 1 — Công thức thật

Nguồn: `services/v41/reversalDetector.ts` (private — không export). Copy nguyên văn:

```ts
function computeTrendReversalConfidence(
  signals: TrendReversalSignals,
  detail: Pick<TrendReversalDetail, 'cvdLast3' | 'volumeRatio' | 'trendExhaustion'>,
): number {
  const scores = [
    scoreCvdFlipComponent(signals.cvdFlip, detail.cvdLast3),
    scoreVolumeComponent(signals.volumeConfirmation, detail.volumeRatio),
    scoreExhaustionComponent(signals.trendExhaustion, detail.trendExhaustion),
    scoreStructureComponent(signals.structureBreak),
  ];
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}
```

### Input

| Field | Nguồn | Có trong 3 CSV trước? |
|-------|-------|----------------------|
| `signals.cvdFlip` | `detectCvdFlip(klines1H, trend)` | Có (`cvd_flip`) — verify lại từ 1H |
| `signals.volumeConfirmation` | volume detector | Có (`volume_confirm`) |
| `signals.trendExhaustion` | `exh_1h ≥ threshold` (boolean) | Có raw `exh_1h`; boolean phụ thuộc plan |
| `signals.structureBreak` | structure detector | Có (`structure_break`) |
| `detail.cvdLast3` | CVD proxy 3 nến 1H cuối | **Thiếu** → tính lại từ klines 1H |
| `detail.volumeRatio` | volume / MA20 | **Thiếu** → tính lại từ klines 1H |
| `detail.trendExhaustion` | raw number | Có (`exh_1h`) |

**Kết luận input:** 3 CSV **không đủ** — thiếu `cvdLast3` + `volumeRatio`. Task này fetch lại 1H/4H cùng timestamps, gọi detector gốc, rồi áp dụng công thức confidence (copy verbatim). Verify vs `computeTrendReversal().detail.confidence`: mismatch = 0.

### Component scores (verbatim)

- CVD (nếu confirmed): `min(100, 55 + |cvd2 - (cvd0+cvd1)/2| / 10)`
- Volume (nếu confirmed): `min(100, 50 + ((volumeRatio - 1.2) / 0.8) * 50)`
- Exhaustion (nếu confirmed): `min(100, 50 + ((trendExhaustion - 55) / 45) * 50)` — **luôn neo MIN=55 trong điểm số**, kể cả khi boolean gate hạ xuống 10/15/20
- Structure (nếu confirmed): `70`, else `0`

**Hệ quả toán học:** khi Exhaustion **không** confirmed → max confidence = (100+100+0+70)/4 = **67.5** < 70 → `confidenceTR≥70` **bất khả thi**.

## Bước 2 — Phân phối confidence TR thật (production signals, exh≥55)

| | n=179 | non-neutral |
|---|---|---|
| min | 0.00 | 0.00 |
| p25 | 0.00 | 0.00 |
| median | 0.00 | 17.50 |
| mean | 12.16 | 16.62 |
| p75 | 17.50 | 25.00 |
| p90 | 38.66 | 41.00 |
| max | 67.50 | 67.50 |
| ≥70 | 0 (0.0%) | 0 (0.0%) |

## Bước 3 — Bảng 6 phương án với confidence TR thật

| Phương án | Điều kiện signal | Pass signal-gate (n=179) | Pass signal-gate + confidenceTR≥70 (thật, n=179) |
|---|---|---|---|
| A | ≥2/3 (bỏ Exhaustion) | 29 | 0 |
| A | ≥3/3 (bỏ Exhaustion) | 3 | 0 |
| B | ≥3/4, exhaustion≥10 | 16 | 1 |
| B | ≥3/4, exhaustion≥15 | 5 | 1 |
| B | ≥3/4, exhaustion≥20 | 5 | 1 |
| Baseline | ≥3/4, exhaustion≥55 (hiện tại) | 3 | 0 |

### Cách gắn confidence theo phương án

- **A:** signal-gate chỉ 3 signal; confidence gọi hàm thật với `trendExhaustion=false` (bỏ khỏi tổ hợp).
- **B / Baseline:** signal-gate ≥3/4 với boolean `exh_1h≥mốc`; confidence dùng cùng boolean đó. Điểm Exhaustion component vẫn neo `TREND_REVERSAL_EXHAUSTION_MIN=55`.

## Bước 4 — Sweep confidenceTR cho A≥2/3 (nếu ≥70 bất khả thi)

| confidenceTR ≥ | Pass A≥2/3 ∧ conf (n=179) | % |
|---|---|---|
| 50 | 3 | 1.7% |
| 55 | 3 | 1.7% |
| 60 | 3 | 1.7% |
| 65 | 2 | 1.1% |
| 70 | 0 | 0.0% |

## Quan sát (không phải khuyến nghị)

- Proxy `marketConfidence` ở báo cáo trước **sai ngữ cảnh** — đã thay bằng công thức TR thật.
- Max confidence khi Exhaustion không confirm = 67.5 → ngưỡng 70 cùng pattern “bất khả thi” như Exhaustion≥55 trên 1H (max quan sát < ngưỡng).
- Không chọn phương án / không đổi production trong task này.

## Artefacts

- `docs/exports/v41-tr-confidence-real-recalc-30d.csv`
- `docs/exports/v41-tr-confidence-real-per-bar-30d.csv`
- `docs/exports/v41-tr-confidence-real-recalc-30d-summary.json`
- `scripts/recalc-v41-tr-confidence-real-30d.ts`
