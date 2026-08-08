# REPORT — V41 UI checklist fix (RC3 gate display)

**Date:** 2026-08-01  
**Scope:** Chỉ tầng hiển thị / wiring ViewModel → UI. **Không** đổi engine TR / CVD / Exhaustion / SL.

## Vấn đề

Checklist RC3 hiển thị 4 ô (CVD Flip, Volume Confirm, **BTC Confirm**, Exhaustion) và tiêu đề dựa trên `checklist.every(passed)` → người dùng hiểu nhầm cần đủ 4/4 mới active. Thực tế:

- Gate legacy TR = **≥3/4** (`cvdFlip`, `volumeConfirmation`, `trendExhaustion`, **`structureBreak`**) **và** `confidenceTR ≥ TREND_REVERSAL_CONFIDENCE_MIN` (**50** kể từ commit 2026-08-01; lúc sửa UI còn là 70)
- `structureBreak` không hiện trên UI; thay bằng BTC Confirm (Market Context) — không phải signal gate

## Trước → Sau (UI)

| Hạng mục | Trước | Sau |
|---|---|---|
| Ô thứ 3 | BTC Confirm (`marketContext.btc.pass`) | **Structure Break** (`signals.structureBreak`) |
| Tiêu đề section | `every()` → "Checklist điều kiện" / "Thiếu gì" | `gate.activeEligible` → "Gate ACTIVE đạt (≥3/4 + conf)" / "Thiếu gì (cần ≥3/4 + conf)" |
| Tóm tắt số | (không có) | **`X/4 điều kiện đạt (cần ≥3/4)`** |
| Confidence | `%` từ Decision engine | **Confidence TR: `score/{MIN} cần thiết`** (MIN từ `gate.confidenceMin`, hiện **50**) |
| Active badge logic | `allPassed = every(4)` | `activeEligible = signalsMet (≥3) AND confidenceMet` |

## File đã sửa

- `services/v41/rc3/rc3ViewModelTypes.ts` — thêm `V41TrGateSummaryUi` + `gate` trên card model
- `services/v41/rc3/buildRc3ViewModel.ts` — checklist = 4 signal thật; build `gate`
- `components/v41/V41SignalCard.tsx` — render tóm tắt gate + Confidence TR
- `components/v41/buildRc3Cards.ts` — shell checklist/gate khớp
- `components/v41/dev/rc3LayoutFixtures.ts` — fixture DEV cập nhật
- `components/v41/v41Rc3Types.ts` — re-export `V41TrGateSummaryUi`
- `services/v41/__tests__/rc3ViewModelWire.test.ts` — assert labels + gate logic

## Tests

```
npx vitest run services/v41/__tests__/rc3ViewModelWire.test.ts components/v41/__tests__/architectureGuard.test.ts
```

## Ghi chú

- `card.confidence` (Decision engine) vẫn còn trên model cho pipeline khác; UI card ưu tiên hiển thị **Confidence TR** so với ngưỡng gate.
- Không đổi `TREND_REVERSAL_ACTIVE_MIN_SIGNALS` / `TREND_REVERSAL_CONFIDENCE_MIN` / engine compute.

