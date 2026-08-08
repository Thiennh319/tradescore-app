# Task V3V4-DATA-2d — Concurrency Queue

**Ngày:** 2026-08-08  
**Phạm vi:** Thay throttle racy bằng queue đồng thời toàn cục (max 3); flush khi gate 429/418  
**Tiền đề:** DATA-2a / 2b / 2c

---

## Trạng thái

**DONE** — `BINANCE_MAX_CONCURRENT = 3`; mọi HTTP/WS market qua `withBinanceConcurrency`; tests PASS.

---

## Đã sửa

### `services/binanceApi.ts`
- Xóa `MIN_REQUEST_GAP_MS` / `throttle()` (không mutex).
- Thêm queue: `acquireBinanceSlot` / `releaseBinanceSlot` / `withBinanceConcurrency`.
- `binanceGet`, `binancePublicFetch`, `fetchForceOrders` (WS) → giữ slot khi gọi mạng.
- `fetchOIEngine`: 2× `binancePublicFetch` → mỗi cái 1 slot (không bypass).
- `activateBlock` / `__setBinanceBlockForTests`: **reject** mọi waiter đang chờ (`BinanceTrafficBlockedError`) — không treo queue khi ban.
- Test helpers: `__getBinanceConcurrencyForTests`.

### `services/v41/scanV41.ts`
- Giữ `fetchSharedBtcMarketV41()` **trước** rồi `Promise.allSettled` 4 symbol (2b không đổi).
- HTTP per-symbol tự xếp hàng qua queue toàn cục (không burst vượt max).

---

## Test

```text
npx vitest run `
  services/binanceApi.test.ts `
  hooks/useResumeableBinanceInterval.test.tsx `
  services/v41/__tests__/rawMarketFetcher.btcDedup.test.ts `
  services/v41/__tests__/scanV41.test.ts `
  services/__tests__/scanMarketSharedPipeline.test.ts
→ 5 files / 38 PASS
```

Mới:
- Burst 12 job → peak == 3, không vượt.
- Block khi còn waiter → reject hết, không hang.

Regression 2a/2b/2c: PASS.

---

## Việc còn lại

- (Tuỳ chọn) Tinh chỉnh max 2 vs 3 theo đo live weight.
- Whale / depth 1000 weight (DATA-1 residual).

---

## Rủi ro — có chậm chu kỳ scan?

| | Trước (burst) | Sau (max 3) |
|--|---------------|-------------|
| Mô hình | Nhiều `fetch` song song gần như không giới hạn | Wave ~3 REST cùng lúc |
| V3 `fetchAllMarketData` × 4 tuần tự coin; trong coin ~10 REST song song | ~1 RTT “sóng” / coin | ~⌈10/3⌉ ≈ **4 sóng** / coin → **~2–4×** thời gian fetch / coin nếu RTT thống trị |
| Ước tính wall-clock (RTT ~100–150ms) | ~0.3–0.6s / coin × 4 ≈ **1.5–2.5s** | ~0.5–1.0s / coin × 4 ≈ **2.5–4.5s** |
| V41 (sau shared BTC): ~4–6 REST × 4 (song song logic) | ~1 sóng lớn | hàng đợi chung với V3 nếu cùng lúc — thêm **~1–2s** |

**Kết luận:** Chu kỳ scan có thể **chậm thêm ~1–3 giây** wall-clock (vẫn **≪ 60s** interval). Đổi lấy ổn định rate-limit / giảm burst → 418.

`withDedup` vẫn gộp request trùng key — không đổi contract dữ liệu trả về.

---

## Task ID

**V3V4-DATA-2d** (Concurrency Queue).
