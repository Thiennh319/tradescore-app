# REPORT — Market Context Filter test verification (`Trend WATCH`)

**Date:** 2026-08-01  
**Scope:** Chỉ xác minh / sửa test — **không** đổi `marketContextFilter` production.

## 1. Test gốc (trước khi sửa fixture NEUTRAL)

Nguồn: transcript tạo file Task 2.1 (`marketContextFilter.test.ts`) — file chưa có trong git HEAD nên trích từ lịch sử agent. Nguyên văn logic:

```ts
it('Trend WATCH — không áp context filter', () => {
  mockExhaustion.mockReturnValue({
    trendExhaustion: 30,
    rsiExtremeScore: 0,
    distanceEMA20Score: 0,
    volumeDivergencePts: 0,
    candleStreakScore: 0,
  });
  const trend = computeTrendReversal({
    klines1H: buildTrendActiveKlines(),
    trendDirection: 'BULL',
  });
  expect(trend.state).toBe('WATCH');
  const filtered = applyMarketContextFilter(trend, {
    trendDirection: 'BULL',
    ...passContextParams({ btcContext: blockingBtcPump }),
  });
  expect(filtered.marketContext).toBeUndefined();
  expect(filtered.state).toBe('WATCH');
});
```

### Ý nghĩa trong hệ thống

`applyMarketContextFilter` (production):

```ts
if (trendResult.state !== 'ACTIVE') {
  return withDirection; // early-return — không evaluateMarketContext
}
```

Hành vi cần bảo vệ: **chỉ khi TR đã ACTIVE mới áp Market Context**. Khi còn WATCH, không gắn `marketContext`, không downgrade thêm — kể cả input BTC sẽ FAIL nếu bị áp nhầm (`blockingBtcPump` + `BULL`).

## 2. `exhaustion=30` là gì?

**Trường hợp 2:** chỉ là **phương tiện tạo WATCH**, không phải assert giá trị 30.

| Thời điểm | EXHAUSTION_MIN | exhaustion=30 | Kết quả với `buildTrendActiveKlines` + BULL |
|---|---|---|---|
| Task 2.1 gốc | 55 | 30 &lt; 55 → thiếu signal exhaustion | Thường **WATCH** (đủ để test early-return) |
| Sau hạ MIN | 28 | 30 ≥ 28 + 3/4 + conf≥50 | **ACTIVE** → test fail |

## 3. Workaround NEUTRAL có mất ý nghĩa không?

**Có — một phần.**

| | Gốc (BULL + WATCH) | Workaround (NEUTRAL) |
|---|---|---|
| Nhánh `applyMarketContextFilter` | `state !== 'ACTIVE'` early-return | Cùng early-return |
| Counterfactual `blockingBtcPump` | Có ý nghĩa: nếu filter áp nhầm với BULL → BTC FAIL / gắn context | Yếu: `evaluateMarketContext` với NEUTRAL **bỏ qua BTC** theo nhánh riêng — không còn chứng minh “BTC sẽ chặn nếu bị áp” |
| `trendDirection` gắn vào result | `BULL` | `NEUTRAL` |

→ NEUTRAL vẫn “pass” early-return nhưng **không còn kiểm tra đúng scenario gốc** (directional BULL + BTC blocking sẵn sàng fail).

## 4. Sửa lại test cho đúng ý đồ

Giữ **BULL** + `blockingBtcPump`; tạo WATCH bằng klines **không đủ signal** (`buildFlatKlines(30)`) + exhaustion mock dưới MIN (=10). Không phụ thuộc ngưỡng 28/55.

File: `services/v41/__tests__/marketContextFilter.test.ts`

## 5. Tests

`npx vitest run services/v41/__tests__ components/v41/__tests__`

| | Kết quả |
|---|---|
| Files | **36 passed** |
| Tests | **420 passed / 0 failed** |

## Kết luận

| Câu hỏi | Trả lời |
|---|---|
| Fixture NEUTRAL còn đúng ý nghĩa gốc? | **Không đủ** — cùng early-return nhưng mất counterfactual BULL+blockingBTC |
| Đã sửa thêm? | **Có** — viết lại với BULL + flat klines → WATCH |
| Production đổi? | **Không** |

