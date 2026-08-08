# REPORT — V4.1 TR Exhaustion 1H always-zero investigation (NEAR 30d)

**Date:** 2026-07-31
**Scope:** V4.1 only — không sửa production / ngưỡng
**Sample:** 179 timestamps 4H (cùng CSV confidence) · NEARUSDT

## 1. Code — không phát hiện truyền sai khung

### Constant

```typescript
// services/v41/reversalDetector.ts (~L89)
const TREND_REVERSAL_EXHAUSTION_MIN = 55;
```

Không có comment giải thích đơn vị ngoài ngữ cảnh điểm 0–100 của Engine 2.

### Gọi hàm (TR)

```typescript
// services/v41/reversalDetector.ts computeTrendReversal
const exhaustion = calculateTrendExhaustion(klines1H, trendDirection);
// ...
trendExhaustion: exhaustion.trendExhaustion >= TREND_REVERSAL_EXHAUSTION_MIN,
```

Tham số đầu tiên là **`klines1H`** (đúng tên / đúng nguồn từ scan/RC3). **Không** thấy nhầm truyền 4H vào TR gate.

### Đối chứng Market Intelligence (4H)

```typescript
// services/v41/marketIntelligenceLayer.ts
const engine2 = calculateTrendExhaustion(klines4H, trendDirection);
```

→ Phân phối exhaustion max≈70 trên báo cáo confidence 30d là **4H**, trong khi checklist TR dùng **1H**.

### trendDirection

TR nhận `trendDirection` từ caller (RC3: `row.snapshot.trendDirection` = Engine 1 trên **4H**). Script này tái hiện: `calculateTrendStrength(win4h).trendDirection` rồi truyền vào `calculateTrendExhaustion(win1h, trendDirection)`.

`volumeDivergence` chỉ +20 khi BULL+newHigh hoặc BEAR+newLow; nếu NEUTRAL → luôn 0 (by design). NEUTRAL bars trong sample: **48**.

## 2. Phân phối đo được

### TrendExhaustion tổng — 1H vs 4H (cùng 179 clock)

| | 1H (TR gate) | 4H (MI) |
|--|-------------|---------|
| n | 179 | 179 |
| min | 0 | 0 |
| p25 | 0.0 | 0.0 |
| median | 0.0 | 0.0 |
| mean | 6.35 | 11.02 |
| p75 | 10.0 | 20.0 |
| p90 | 20.0 | 30.0 |
| max | 50 | 70 |
| ≥55 | **0** (0.0%) | **4** (2.2%) |

Chỉ nến non-NEUTRAL (n=131): 1H max=50, ≥55 = 0.

### Sub-components 1H (điểm từng phần)

| Component | max | #bars > 0 | median | p90 |
|-----------|-----|-----------|--------|-----|
| RSI Extreme (0–30) | 30 | 76 | 0 | 10.0 |
| Distance EMA20 (0–30) | 10 | 10 | 0 | 0.0 |
| Volume Divergence (0/20) | 20 | 2 | 0 | 0.0 |
| Candle Streak (0/20) | 12 | 3 | 0 | 0.0 |

### Sub-components 4H (tham chiếu)

| Component | max | #bars > 0 |
|-----------|-----|-----------|
| RSI | 30 | 76 |
| Dist EMA20 | 20 | 58 |
| Vol Div | 20 | 6 |
| Streak | 20 | 8 |

## 3. Kết luận

**HIỆN TƯỢNG THẬT (không phải bug truyền sai khung):** cùng hàm `calculateTrendExhaustion`, trên **1H** max = **50** < ngưỡng **55** → 0/179 pass; trên **4H** max = **70**, ≥55 = **4** nến. TR intentionally gate trên 1H; MI snapshot dùng 4H — hai phân phối khác nhau là đúng thiết kế khung, không phải nhầm tham số.

Nghẽn chính trên 1H: tổng điểm hiếm vượt ~30–40 (xem max + components). Nếu muốn checklist Exhaustion “nói chuyện” với MI 4H, đó là **lựa chọn thiết kế** (đổi khung / ngưỡng / nguồn field) — ngoài phạm vi task này.

**Không tự sửa code** trong task này.

## 4. Artefacts

- `docs/exports/v41-tr-exhaustion-1h-vs-4h-30d.csv`
- `docs/exports/v41-tr-exhaustion-1h-vs-4h-30d-summary.json`
- `scripts/investigate-v41-tr-exhaustion-1h-zero-30d.ts`
