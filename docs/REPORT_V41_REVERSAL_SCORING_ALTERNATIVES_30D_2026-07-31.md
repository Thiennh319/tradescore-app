# REPORT — V4.1 RC3 reversal checklist scoring alternatives (NEAR 30d)

**Date:** 2026-07-31
**Scope:** V4.1 only — **không** sửa production; script `investigate-v41-reversal-checklist-scoring-30d.ts`
**Sample:** 179 nến 4H (timestamps từ `v41-market-confidence-30d-4h.csv`) · NEARUSDT

## 1. Code — panel 4-check ở đâu?

| Layer | File | Vai trò |
|-------|------|---------|
| Labels shell | `components/v41/buildRc3Cards.ts` | Chỉ label; `passed: false` cứng — **không** tính thị trường |
| Wire thật | `services/v41/rc3/buildRc3ViewModel.ts` | Map 4 check từ `evaluateTrendReversalWithContext` |
| Render UI | `components/v41/V41SignalCard.tsx` | Hiển thị ✓/✗; `allPassed = checklist.every(c => c.passed)` chỉ đổi tiêu đề |
| Board | `components/v41/V41BoardRC3.tsx` | Dùng cards (shell hoặc wire) |

### Map 1-1 (nguyên văn wiring)

```typescript
// services/v41/rc3/buildRc3ViewModel.ts
passed: trendWithContext.signals.cvdFlip,           // CVD Flip
passed: trendWithContext.signals.volumeConfirmation, // Volume Confirm
passed: trendWithContext.marketContext?.dimensions.btc.pass === true, // BTC Confirm
passed: trendWithContext.signals.trendExhaustion,  // Exhaustion
```

| UI label | Engine field | Nguồn tính |
|----------|--------------|------------|
| CVD Flip | `signals.cvdFlip` | `detectCvdFlip` trong `reversalDetector.ts` (1H, 3 nến CVD proxy) — **không** phải `computeMomentum1H` |
| Volume Confirm | `signals.volumeConfirmation` | `detectTrendReversalVolumeConfirmation` (vol > 1.2× MA20) — **không** phải volume spike Momentum1H 1.5× |
| BTC Confirm | `marketContext.dimensions.btc.pass` | `evaluateBtcMarketContext` (1/5 dim Market Context). **RC3 quirk:** `applyMarketContextFilter` chỉ gắn `marketContext` khi TR `state===ACTIVE` → UI thường ✗ BTC khi TR chưa ACTIVE. Bảng scoring dưới dùng BTC **đánh giá mỗi nến** (độc lập). |
| Exhaustion | `signals.trendExhaustion` | `calculateTrendExhaustion` ≥ 55 (`TREND_REVERSAL_EXHAUSTION_MIN`) trên **1H** |

**Lưu ý:** TR engine còn signal thứ 4 `structureBreak` — **không** hiện trên checklist RC3 (thay bằng BTC Confirm).

## 2. AND hay scoring?

| Cơ chế | Thực tế trong code |
|--------|-------------------|
| Checklist UI 4 ✓ | Hiển thị độc lập; `every(passed)` chỉ đổi title “Checklist điều kiện” / “Thiếu gì” — **không** tự ACTIVE lệnh |
| Trend Reversal ACTIVE (legacy binary) | **≥ 3 / 4** signals TR (`cvdFlip`, `volumeConfirmation`, `trendExhaustion`, `structureBreak`) **và** confidence ≥ 70 — không phải AND-4 UI |
| Continuous TR (flag) | Score 0–1, ACTIVE nếu ≥ 0.6 (NEAR có thể bật theo flag) |
| Decision LONG/SHORT | `computeDecisionEngineResult` trên confidence/eligibility — tách khỏi 4 ✓ UI |

Giả thuyết “AND-4 mới active lệnh” = **giả thuyết so sánh** trên đúng 4 ô checklist UI (score=4), không phải gate duy nhất trong production.

## 3. Phân phối từng check (n=179)

| Check | Pass | % |
|-------|------|---|
| CVD Flip | 12 | 6.7% |
| Volume Confirm | 36 | 20.1% |
| BTC Confirm (eval mỗi nến) | 121 | 67.6% |
| BTC Confirm (RC3 wire, chỉ khi TR ACTIVE) | 0 | 0.0% |
| Exhaustion (≥55 trên 1H) | 0 | 0.0% |
| *(ref)* structureBreak (không trên UI) | 64 | 35.8% |

## 4. Phân phối tổng điểm 0–4

Score = cvd + volume + **btc_eval** + exhaustion.

| Score | Số nến | % |
|-------|--------|---|
| 0 | 42 | 23.5% |
| 1 | 108 | 60.3% |
| 2 | 26 | 14.5% |
| 3 | 3 | 1.7% |
| 4 | 0 | 0.0% |

## 5. Bảng so sánh phương án scoring (không khuyến nghị)

| Phương án | Điều kiện | Active (nến) | Tỷ lệ |
|-----------|-----------|--------------|-------|
| AND-4 (giả thuyết UI đủ 4 ✓) | score = 4 | 0 | 0.0% |
| Score ≥ 2 | score ≥ 2 | 29 | 16.2% |
| Score ≥ 3 | score ≥ 3 | 3 | 1.7% |
| Exhaustion must + ≥2/3 còn lại | exhaustion=1 **và** (cvd+vol+btc) ≥ 2 | 0 | 0.0% |

### Tham chiếu engine TR (không phải checklist UI)

| Metric | Count | % |
|--------|-------|---|
| `tr_state === 'ACTIVE'` | 0 | 0.0% |
| legacy signal count ≥ 3 | 3 | 1.7% |

## 6. Artefacts

- CSV: `docs/exports/v41-reversal-checklist-scoring-30d-4h.csv`
- JSON: `docs/exports/v41-reversal-checklist-scoring-30d-4h-summary.json`
- Script: `scripts/investigate-v41-reversal-checklist-scoring-30d.ts`

**Không sửa** scorer V3/V4, không sửa RC3/TR production trong task này.
