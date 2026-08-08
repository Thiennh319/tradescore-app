# Task V3V4-DATA-2c — Shared Pipeline (MarketAnalysis & LockedPlan)

**Ngày:** 2026-08-08  
**Phạm vi:** Market Analysis + Locked Plan dùng snapshot Unified scan; bỏ fetch trùng  
**Tiền đề:** DATA-2a (429/418), DATA-2b (BTC dedup)

---

## Trạng thái

**DONE** — shared snapshot store; MA + Locked Plan không còn `fetchAllMarketData` khi đã có scan fresh; tests PASS.

---

## Đã sửa

### `services/scanMarketSnapshotStore.ts` (mới)
- Publish/get/subscribe `AllMarketData` + ticker/btc24h theo symbol.
- Fresh window: `SCAN_INTERVAL_MS + 15s`.

### `services/signalBoardScan.ts`
- Sau fetch trong `scanSignalSymbol` → `publishScanMarketSnapshot(...)`.

### `services/bookTickerFromMarket.ts` (mới)
- Top-of-book từ depth → `BookTickerResult` (tránh `/ticker/bookTicker` khi dùng shared).

### `hooks/useMarketAnalysis.ts`
- Ưu tiên snapshot Unified; subscribe khi scan publish.
- Interval 60s **chỉ** network nếu snapshot **stale/missing**.
- Manual `refresh()` vẫn force network.
- Gate 2a: không spam khi blocked (vẫn apply snapshot nếu còn).

### `services/lockedPlanMonitorService.ts`
- `buildLockedPlanMonitorContextFromMarket` (pure).
- `refreshLockedPlanMonitorContext`: **chỉ** snapshot shared + optional `fetchTickerPrice` — **không** `fetchAllMarketData`.

### `hooks/useLockedPlanMonitor.ts`
- Hydrate từ snapshot (subscribe).
- Interval 30s: **ticker-only** (`fetchTicker: true`).

### Tests
- `services/__tests__/scanMarketSharedPipeline.test.ts`

---

## Số request trước → sau (ước lượng / phút, có Locked Plan WAITING)

| Nguồn | Trước | Sau |
|-------|-------|-----|
| Unified V3/V4 (+ V41) | ~không đổi (đã 2b) | không đổi |
| Market Analysis (1 coin) | ~**11–13** REST full + ticker/book mỗi 60s | **0** khi snapshot fresh |
| Locked Plan | ~**2 × (11 + 1)** = **~24**/phút | **2 × ticker** = **2**/phút |
| **Tiết kiệm thêm** | | **~33–35 REST/phút** khi MA + plan active |

(Startup / first paint trước scan đầu, hoặc snapshot hết hạn → MA vẫn fallback network 1 lần.)

---

## Độ trễ dữ liệu

| Surface | Trước | Sau | Ảnh hưởng? |
|---------|-------|-----|------------|
| Market Analysis klines/OI/funding/depth | Poll riêng 60s (lệch pha Unified) | Cùng nhịp Unified (~60s) | **Không chậm hơn**; align với Signal Board |
| MA giá/spread | Ticker+book 60s | Giá từ scan; book từ depth; cập nhật khi scan | Spread ≈ depth top (đủ UI); giá ~60s trừ khi manual refresh |
| Locked Plan market input | Full refresh **30s** | Snapshot ~**60s** | Klines/OI **có thể chậm hơn tối đa ~30s** so với trước |
| Locked Plan **giá** / entry-zone | Ticker trong full fetch 30s | **Ticker riêng 30s** (giữ) | **Không đổi** nhịp giá |

---

## Test

```text
npx vitest run `
  services/__tests__/scanMarketSharedPipeline.test.ts `
  services/binanceApi.test.ts `
  hooks/useResumeableBinanceInterval.test.tsx `
  services/v41/__tests__/rawMarketFetcher.btcDedup.test.ts `
  services/v41/__tests__/scanV41.test.ts
→ 5 files / 36 PASS
```

- Snapshot + ticker-only: `fetchAllMarketData` **không** được gọi.
- Regression 2a/2b PASS.

---

## Việc còn lại

- (Tuỳ chọn) Whale Radar depth vẫn riêng 5 phút — ngoài 2c.
- (Tuỳ chọn) V3/V4 inject BTC 1H cho alt (ghi ở 2b).
- UI banner khi gate 418 (2a residual).

---

## Rủi ro

1. Locked Plan **không hydrate** nếu chưa có Unified snapshot (null) — đợi scan; trước đây tự fetch. App có Unified on mount → thường OK.
2. Book từ depth top ≠ `bookTicker` exact (micro-spread); UI chấp nhận.
3. `signalBoardScan` ↔ `useMarketAnalysis` circular import **có sẵn**; snapshot store không thêm cycle mới.
4. Persist Signal Board trên Web **không** persist `AllMarketData` — snapshot chỉ RAM; cold start cần scan/fetch.

---

## Task ID

**V3V4-DATA-2c** (Shared Pipeline — MarketAnalysis & LockedPlan).
