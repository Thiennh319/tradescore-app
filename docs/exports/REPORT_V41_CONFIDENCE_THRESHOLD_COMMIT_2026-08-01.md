# REPORT — Chốt TREND_REVERSAL_CONFIDENCE_MIN = 50

**Date:** 2026-08-01  
**Scope:** Đổi đúng 1 constant production + đồng bộ UI/test/adapters. **Không** đổi Exhaustion / CVD / SL.

## 1. Baseline full suite (trước khi đổi constant)

Lệnh: `npx vitest run services/v41/__tests__ components/v41/__tests__`

| | Kết quả |
|---|---|
| Files | 1 failed / 35 passed (36) |
| Tests | **1 failed / 419 passed (420)** |

**Fail sẵn (không liên quan UI checklist):**

- `marketContextFilter.test.ts` → `Trend WATCH — không áp context filter`
- Nguyên nhân: mock `trendExhaustion: 30` (≥ `EXHAUSTION_MIN=28`) + klines 3/4 signal → conf ≥70 → `ACTIVE` (test kỳ vọng `WATCH` từ thời `EXHAUSTION_MIN=55`).

UI checklist change **không** phá test nào khác ở baseline.

## 2. Thay đổi production

`services/v41/reversalDetector.ts`:

```ts
export const TREND_REVERSAL_CONFIDENCE_MIN = 50; // was 70
```

Lý do chốt: backtest 180d CVD production + SL window fix — conf≥50 n=19, WR≈42.1% (ổn định hơn conf≥40 WR≈40%).

## 3. File đã sửa (đồng bộ)

| File | Thay đổi |
|---|---|
| `services/v41/reversalDetector.ts` | `70 → 50` + comment |
| `services/v41/foundation/adapters.ts` | Dùng constant thay hard-code `70%` trong review message |
| `services/v41Export/rulebook/Builder.ts` | `TH_TR_CONFIDENCE_MIN = TREND_REVERSAL_CONFIDENCE_MIN` |
| `services/v41Export/rulebook/Formatter.ts` | Text conf≥70 → conf≥TREND_REVERSAL_CONFIDENCE_MIN |
| `services/v41/rc3/rc3ViewModelTypes.ts` | Comment “hiện = 50” |
| `components/v41/V41SignalCard.tsx` | Fallback UI `score/50 cần thiết` |
| `components/v41/buildRc3Cards.ts` | Shell `confidenceMin: 50` |
| `components/v41/dev/rc3LayoutFixtures.ts` | Default `confidenceMin = 50` |
| `services/v41/__tests__/rc3ViewModelWire.test.ts` | Assert `confidenceMin: 50` |
| `services/v41/__tests__/trendReversalEngine.test.ts` | Assert MIN=50; cập nhật case 3/4 (nay ACTIVE vì conf~64≥50) |
| `services/v41/__tests__/marketContextFilter.test.ts` | Fix fixture WATCH bằng `NEUTRAL` |

## 4. Full suite sau khi đổi

Lệnh: `npx vitest run services/v41/__tests__ components/v41/__tests__`

| | Kết quả |
|---|---|
| Files | **36 passed** |
| Tests | **420 passed / 0 failed** |

Bổ sung: `services/v41Export/__tests__` cũng chạy sau sync Builder — xác nhận trong bước kế nếu cần.

## 5. Ảnh hưởng hành vi (test phản ánh)

Với MIN=50, nhiều case **3/4 signal + conf ~64** trước đây WATCH (vì <70) nay **ACTIVE**. Gate unit vẫn: `conf < 50` → WATCH dù đủ signal.

## 6. Không đổi

- `TREND_REVERSAL_EXHAUSTION_MIN` (=28)
- `detectCvdFlip` / CVD priorAvg
- `computeCounterTrendSL` / SL window
- `TREND_REVERSAL_ACTIVE_MIN_SIGNALS` (=3)

