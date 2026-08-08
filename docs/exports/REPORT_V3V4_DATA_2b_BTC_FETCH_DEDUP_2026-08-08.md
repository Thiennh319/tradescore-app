# Task V3V4-DATA-2b — BTC Fetch Dedup

**Ngày:** 2026-08-08  
**Phạm vi:** Fetch BTC 4H/1H **một lần / chu kỳ** V4.1; audit V3/V4 share; không bypass gate 2a  
**Tiền đề:** V3V4-DATA-2a (429/418)

---

## Trạng thái

**DONE** — V41 BTC shared inject; V3/V4 không có lặp HTTP BTC klines (24h đã share); tests PASS.

---

## Đã sửa

### `services/v41/rawMarketFetcher.ts`
- Thêm `SharedBtcMarketV41` + `fetchSharedBtcMarketV41()` — 1× `fetchKlines(BTC,4h)` + 1× `fetchClosedKlinesV41(BTC,1h)` (qua `fetchKlines` → gate 2a).
- `fetchRawMarketV41(symbol, sharedBtc?)`:
  - Có `sharedBtc` → **không** fetch BTC lại; inject cùng reference.
  - `BTCUSDT` + shared → tái dùng shared cho symbol 4H/1H (tránh +2 REST).
  - Không truyền shared → legacy per-call (standalone).

### `services/v41/scanV41.ts`
- `scanV41`: `sharedBtc = await fetchSharedBtcMarketV41()` **trước** `Promise.allSettled` symbols.
- `scanOneSymbolV41(symbol, sharedBtc)` → `fetchRawMarketV41(symbol, sharedBtc)`.

### Tests
- `services/v41/__tests__/rawMarketFetcher.btcDedup.test.ts` (mới)
- `scanV41.test.ts` — mock `fetchSharedBtcMarketV41` + assert inject

### V3/V4 — kiểm tra (không đổi code)

| Mục | Kết quả |
|-----|---------|
| BTC 24h | `scanAllSignalRows` gọi `fetchBtcChange24hPct()` **1 lần**, truyền xuống mọi `scanSignalSymbol` — **đã share** |
| BTC klines HTTP | **Không** fetch BTC klines riêng cho alt; mỗi coin chỉ `fetchAllMarketData(sym)`. BTCUSDT dùng klines của chính nó |
| Lặp ẩn? | **Không** phát hiện lặp REST BTC klines. Rule audit: `btcKlines1h ?? klines1h` — alt **thiếu** BTC 1H thật (fallback klines alt), không phải lặp request. Không sửa trong 2b (sẽ **thêm** fetch nếu inject) |

---

## Số request BTC trước → sau (V4.1, 4 coin / chu kỳ)

| | BTC 4H | BTC 1H | Tổng REST BTC klines |
|--|--------|--------|----------------------|
| **Trước** | 4 | 4 | **8** |
| **Sau** | 1 | 1 | **2** |

(= 1 “lần” shared pair / chu kỳ thay vì 4 lần lặp pair.)

---

## Test

```text
npx vitest run `
  services/v41/__tests__/rawMarketFetcher.btcDedup.test.ts `
  services/v41/__tests__/scanV41.test.ts `
  services/binanceApi.test.ts `
  hooks/useResumeableBinanceInterval.test.tsx
→ 4 files / 32 tests PASS
```

Dedup asserts: sau `fetchShared` + 4× `fetchRawMarketV41(..., shared)` → **0** thêm BTC 4H/1H; mọi coin `btcKlines === shared.btcKlines4H` (cùng reference).

---

## Việc còn lại

- (Tuỳ chọn) V3/V4: fetch BTC 1H **một lần** + inject `btcKlines1h` cho alt — cải thiện đúng BTC layer (không phải dedup).
- DATA-1 item: giảm depth / batch ticker (chưa).

---

## Rủi ro

1. Shared BTC fail → cả chu kỳ V41 fail shared fetch (symbols không chạy). Trước: từng symbol fail độc lập trên BTC; chấp nhận để dedup.
2. BTCUSDT dùng shared closed 4H — live mark vẫn ưu tiên ticker (không đổi semantics chính).
3. Caller cũ `fetchRawMarketV41(sym)` không shared vẫn tốn BTC / symbol (intentional).

---

## Task ID

**V3V4-DATA-2b** (BTC Fetch Dedup).
