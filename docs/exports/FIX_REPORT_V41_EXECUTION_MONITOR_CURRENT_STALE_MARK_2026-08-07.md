# REPORT — V4.1 Execution Monitor Current đứng giá (NEAR 1.642 vs live ~1.635)

**Ngày:** 2026-08-07  
**Follow-up:** V41-1 / V41-2 / V41-3  
**Phạm vi sửa:** `services/v41/rawMarketFetcher.ts`, `services/v41/scanV41.ts` (+ tests)  
**Không đụng:** `buildTradeSessionAdviser.ts`, `runV41MiExport` / panel Task V41-2, Journal/V3/V4.

---

## Trạng thái

**BUG THẬT** (nguồn `markPrice` stale) — **đã sửa**.  
Không phải session tồn đọng trước V41-1; không phải adviser dừng update Running; scan interval vẫn chạy.

---

## Triệu chứng gốc

Execution Monitor: NEAR SHORT, Running, Entry 1.6650, **Current 1.6420**, PnL +6.91%, Advisor Move SL, Updated 12:18:56, Holding ~51m.  
Giá thị trường thực ~**1.635** nhưng cột Current không theo.

---

## Nguyên nhân (trích code)

### 1) Luồng cập nhật Current — không có WS riêng

| Bước | Code |
|------|------|
| UI hiển thị | `V41ExecutionMonitor` → `formatPrice(session.current)` |
| Set `current` | `buildTradeSessionAdviserPatches` → `current: hasMark ? markPrice : session.current` (Pending **và** Running) |
| Khi nào chạy | `useV41TradeSessionAdviser` — `useEffect` khi `v41Rows` đổi sau scan |
| Chu kỳ scan | `useUnifiedAppScan` — `setInterval(..., SCAN_INTERVAL_MS)` = **60s** (`constants/scanSchedule.ts`) |

Không có websocket/ticker riêng cho Trade Session. Current = `row.markPrice` từ scan gần nhất.

`Updated 12:18:56` = `advisorUpdatedAt` từ patch sau scan → **scan/adviser vẫn chạy**, không đứng interval.

V41-1 **không** dừng update Running:

```231:231:services/v41/rc3/buildTradeSessionAdviser.ts
current: hasMark ? (markPrice as number) : session.current,
```

### 2) Bug: `markPrice` = close nến **4H đã đóng**

```306:308:services/v41/scanV41.ts  // TRƯỚC SỬA
const lastClose = raw.klines.at(-1)?.close;
markPrice = lastClose …
```

`raw.klines` đã qua `filterClosedKlinesV41` trong `fetchRawMarketV41` — chỉ nến `closeTime < now−1s` → phần tử cuối = **nến 4H đã đóng**, giá có thể **đứng tới ~4 giờ** dù scan mỗi 60s ghi đè cùng số (vd. 1.6420) trong khi tick live ~1.635.

Engine MI vẫn cần closed candles (đúng) — lỗi là **dùng cùng nguồn làm “Current” live**.

### 3) Không phải (b) session tồn đọng V41-1

Session có thể Running sớm do fill-sai lịch sử, nhưng Current đứng **vẫn xảy ra với code update đúng** vì mỗi scan đẩy lại cùng closed-4H close. Root cause = nguồn mark, không chỉ “cần Đóng thủ công”.

---

## Đã sửa

1. `rawMarketFetcher.ts`  
   - Thêm `liveMarkPrice` trên `RawMarketSnapshot`.  
   - Fetch song song `fetchTickerPrice`.  
   - Fallback: close nến 4H **đang chạy** (trước `filterClosed`).  
   - Helpers: `resolveFormingCandleClose`, `resolveLiveMarkPrice`.  
   - `klines` closed-only **không đổi** (MI/engines giữ nguyên).

2. `scanV41.ts`  
   - `markPrice = raw.liveMarkPrice` nếu hợp lệ; fallback closed 4H.

Sau mỗi scan 60s: adviser patch lại `current`/`pnl` từ mark live → Execution Monitor theo giá gần realtime.

---

## Test

```text
npx vitest run \
  services/v41/__tests__/rawMarketLiveMark.test.ts \
  services/v41/__tests__/scanV41.test.ts \
  services/v41/__tests__/tradeSessionAdviser.test.ts
→ 23 passed
```

---

## Việc còn lại

- Session đang mở trên UI: **đợi ≤1 scan** (~60s) sau deploy/reload để Current nhảy theo ticker; hoặc Đóng + mở lại nếu muốn reset sạch.  
- Current vẫn theo **chu kỳ scan 60s**, không phải tick 1s — BY-DESIGN của kiến trúc “không polling riêng”. Muốn sub-second cần ticker bus riêng (ngoài phạm vi tối thiểu này).

## Hardening follow-up (đóng Task V41-4)

| Hỏi | Bằng chứng |
|-----|------------|
| Ticker fail có test? | Có: `resolveLiveMarkPrice({ tickerPrice: null, formingFourHClose: 1.635 })` → forming. Có: scan thiếu `liveMarkPrice` → closed-4H + `console.warn` (spy). |
| Fallback closed-4H silent? | **Không còn.** `scanV41` warn `markPrice fallback to closed-4H…`. Fetch layer warn khi `liveMarkPrice == null` hoặc dùng forming sau ticker fail. |
| Forming lấy từ đâu? | Cùng `Promise.all` với ticker; **nhưng** `fetchKlines` đã `dropUnclosedCandle` → forming từ mảng đó thường `undefined`. Recover: `fetchFormingFourHCloseV41` (klines raw, giữ nến open) chỉ khi ticker fail. |
| Cache stale giống bug cũ? | Ticker TTL 3s (`TICKER_CACHE_TTL_MS`). Closed-4H chỉ là last-resort có warn — không còn “âm thầm đứng giá”. |

Bàn giao tổng: `docs/exports/HANDOFF_V41_TASKS_1_TO_4_2026-08-07.md` (Task V41-4).
