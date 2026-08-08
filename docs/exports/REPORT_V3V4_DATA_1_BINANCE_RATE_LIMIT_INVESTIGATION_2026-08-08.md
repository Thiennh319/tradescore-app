# Task V3V4-DATA-1 — Binance Rate Limit Investigation (Report Only)

**Ngày:** 2026-08-08  
**Phạm vi:** Chỉ điều tra — **không sửa code**  
**Bối cảnh:** Web app nghi bị Binance chặn/từ chối; giả thuyết mỗi coin gọi API riêng → quá nhiều request → rate-limit / block IP.

---

## Trạng thái

**DONE** — inventory API + tần suất + đối chiếu limit + probe HTTP sống. Không có phần “Đã sửa”.

---

## Kết luận ngắn (đúng bằng chứng)

1. **App gọi REST theo từng symbol** (không batch multi-symbol trên hầu hết endpoint). V3/V4 quét 4 coin **tuần tự**; trong mỗi coin lại **bắn song song** nhiều endpoint. V4.1 quét 4 coin bằng **`Promise.allSettled` (song song)**.
2. Có throttle `MIN_REQUEST_GAP_MS = 120` + in-flight dedup, nhưng **không mutex**: nhiều `await throttle()` chạy cạnh nhau qua `Promise.all` → **burst đồng thời** vẫn xảy ra. `fetchOIEngine` còn 2 `fetch` song song sau **một** lần throttle.
3. Ước tính weight mỗi chu kỳ ~60s (4 coin + V41 + `useMarketAnalysis`) **thường dưới** ngưỡng Futures **2400 weight/phút** nếu chỉ một client — nghĩa là **“chỉ vì 4 coin × fan-out” không đủ để kết luận chắc chắn vượt 2400 mỗi phút**.
4. **Bằng chứng sống (máy điều tra / cùng kiểu IP host Web EXE):** mọi `fapi` thử (`/ping`, ticker, klines, `exchangeInfo`) trả **`HTTP 418 I'm a teapot`**. Theo docs Binance, **418 = IP ban** (nặng hơn 429). Production `binanceApi` **không phân biệt** 429 vs 418 — chỉ `throw new Error(\`HTTP ${status}...\`)`.
5. Nguyên nhân “bị chặn” **quan sát được lúc báo cáo** = **IP đang 418**, không phải chỉ “đang nhận 429 tạm”. Việc app fan-out/burst **có thể đóng góp leo thang** (không backoff sau 429) nhưng **không chứng minh được** bằng weight một chu kỳ đơn lẻ đã vượt 2400.

---

## 1. Danh sách nơi gọi Binance (app production)

**Base REST:** `constants/scoring.ts` → `BINANCE_BASE_URL = https://fapi.binance.com`  
**WS:** `services/binanceApi.ts` → `wss://fstream.binance.com/ws`  
**N coin SSOT:** `TRADE_SYMBOLS` = BTC / NEAR / SOL / BNB (**N = 4**)

### 1.1 Client lõi — `services/binanceApi.ts`

| Hàm | Endpoint | Per-coin hay batch? | Binance hỗ trợ multi-symbol? |
|-----|----------|---------------------|------------------------------|
| `fetchKlines` | `GET /fapi/v1/klines` | **1 symbol / request** | **Không** (bắt buộc `symbol`) |
| `fetchTickerPrice` | `GET /fapi/v1/ticker/price` | App luôn truyền `symbol` → **1 coin** | **Có** nếu **bỏ** `symbol` → trả all (weight cao hơn một chút) |
| `fetch24hTickerChange` | `GET /fapi/v1/ticker/24hr` | **1 coin** | **Có** all-market nếu bỏ `symbol` (weight lớn, ~40) |
| `fetchBookTicker` | `GET /fapi/v1/ticker/bookTicker` | **1 coin** | **Có** all nếu bỏ `symbol` |
| `fetchDeepOrderBook` | `GET /fapi/v1/depth?limit=1000` | **1 coin** | **Không** |
| `fetchForceOrders` | WS `{symbol}@forceOrder` | **1 coin / connection** | Stream riêng; REST `forceOrders` là USER_DATA (app **không** dùng REST anonymous) |
| `fetchOIEngine` | `GET /fapi/v1/openInterest` + `GET /futures/data/openInterestHist` | **1 coin**, **2 REST song song** | **Không** batch multi-symbol |
| `fetchFundingRateHistoryResult` | `GET /fapi/v1/fundingRate` | **1 coin** | Không multi-symbol array |
| `fetchLongShortRatio` | `GET /futures/data/topLongShortAccountRatio` | **1 coin** | **Không** |
| `fetchAllMarketData` | Gộp: 5× klines (`TIMEFRAMES`) + depth + forceOrders WS + OI×2 + funding + L/S | **1 coin**, nội bộ **`Promise.all` / `allSettled`** | Không gộp nhiều coin |

**HTTP core** (`binanceGet`):

```ts
// MIN_REQUEST_GAP_MS = 120; withDedup(requestKey); cache TTL mặc định 60s
// Lỗi: throw new Error(`HTTP ${response.status}: ${response.statusText}`)
// → không parse Retry-After, không nhánh 429/418
```

### 1.2 Callers app chính

| File / hook | Hành vi gọi | Per-coin vs batch |
|-------------|-------------|-------------------|
| `signalBoardScan.scanSignalSymbol` | `Promise.all([fetchAllMarketData, fetchTickerPrice, fetch24h…])` | **1 coin** |
| `signalBoardScan.scanAllSignalRows` | `for (sym of TRADE_SYMBOLS) await scanSignalSymbol` | **4 coin tuần tự** (không Promise.all giữa coin) |
| `marketAnalysisFetch.fetchMarketAnalysisBundle` | `fetchAllMarketData` + ticker + BTC 24h | **1 coin** (+ BTC 24h) |
| `hooks/useMarketAnalysis` | `setInterval(loadMarket, SCAN_INTERVAL_MS)` + `setInterval(loadPrice, SCAN_INTERVAL_MS)` | **1 coin đang chọn** — **song song** với Unified scan |
| `hooks/useUnifiedAppScan` | 60s: `scanV3V4` → `scanV41(4)` → `scanUnified` | V3 rồi V41 |
| `v41/rawMarketFetcher.fetchRawMarketV41` | `Promise.all` klines 4H/30m/1H + BTC 4H/1H + funding + ticker; fallback klines 4H raw **bypass** `binanceGet` | **1 coin**; BTC lặp lại mỗi coin |
| `v41/scanV41` | `Promise.allSettled(symbols.map(scanOneSymbolV41))` | **4 coin song song** |
| `lockedPlanMonitorService` + `useLockedPlanMonitor` | `fetchAllMarketData` + ticker mỗi **`MONITOR_INTERVAL_MS = 30_000`** khi plan WAITING | **1 coin** — **nhanh hơn 60s** |
| `whaleRadarScan` + `useWhaleRadar` | depth + ticker + klines 1h / symbol; interval **5 phút** | Loop symbols (per-coin) |
| `usePendingOrderFill` / `periodicScanService.fillPending…` | `fetchTickerPrice` / symbol | Per pending symbol; pending path dùng `Promise.all` trên set symbol |
| `rawMarketFetcher.fetchFundingRateV41` / `fetchFormingFourHCloseV41` | `fetch` thẳng `fapi` (**không** qua throttle/dedup của `binanceGet`) | Per coin |

*(Scripts backtest/archive cũng gọi Binance — ngoài runtime Web EXE; có xử lý 418/429 riêng ở vài script, vd. `backtest-v4-near-90d.ts`.)*

---

## 2. Tần suất + ước số request mỗi chu kỳ

### 2.1 Interval

| Nguồn | Interval | Dùng chung? |
|-------|----------|-------------|
| `constants/scanSchedule.ts` | `SCAN_INTERVAL_MS = 60_000` | **Có** — comment “app, web, chạy ngầm (1 phút)” |
| `useUnifiedAppScan` | `setInterval(..., SCAN_INTERVAL_MS)` | V3/V4 + V4.1 cùng nhịp 60s |
| `useSignalBoard` | `AUTO_TICK_MS = SCAN_INTERVAL_MS` nhưng App truyền **`pauseAutoScan: true`** → auto board tắt; scan do Unified gọi |
| `useMarketAnalysis` | **cũng** `SCAN_INTERVAL_MS` (market + price) | **Thêm** luồng độc lập trên **1 coin UI** |
| `useLockedPlanMonitor` | **`30_000` ms** | **Nhanh hơn** scan chính khi có locked plan WAITING |
| Whale Radar | **`5 * 60_000` ms** | Riêng |

→ V3/V4 **không** có polling riêng nhanh hơn 60s ở Signal Board khi pause; nhưng **Locked Plan 30s** và **useMarketAnalysis 60s** là tải thêm.

### 2.2 Request mỗi chu kỳ Unified (~60s), N=4 — đếm REST “xương sống”

**A. V3/V4 `scanAllSignalRows` (4× tuần tự):** mỗi coin khoảng:

| Nhóm | Số REST (WS riêng) |
|------|---------------------|
| Klines 5 TF (`5m/15m/1h/4h/1d`) | 5 |
| Depth 1000 | 1 |
| OI + OI hist | 2 |
| Funding history | 1 |
| Top L/S ratio | 1 |
| Ticker price | 1 |
| 24h (alt; BTC đã lấy trước) | ~0–1 |
| Force orders | **1 WS** (không REST) |
| **Σ / coin** | **~11–12 REST + 1 WS** |
| **Σ 4 coin** | **~44–48 REST + 4 WS** |

Cộng 1× `fetchBtcChange24hPct` trước vòng lặp.

**B. V4.1 `scanV41` (4× song song `fetchRawMarketV41`):** mỗi coin điển hình:

| Call | Ghi chú |
|------|---------|
| klines 4H symbol, 4H BTC, 30m, 1H, 1H BTC | 5× `fetchKlines` (BTC lặp ×3 alt) |
| `/fundingRate?limit=1` | bypass guard |
| `fetchTickerPrice` | 1 |
| (± forming 4H raw) | khi ticker fail |
| **Σ / coin** | **~6–8 REST** |
| **Σ 4 coin (không dedupe BTC)** | **~24–32 REST**, nhiều trong **cùng burst** |

**C. `useMarketAnalysis` (cùng phút, 1 symbol đang chọn):** thêm ~1× `fetchAllMarketData` (~10 REST) + ticker + bookTicker + BTC 24h ≈ **+13 REST**/phút (có cache TTL; lần đầu / miss cache).

**D. Locked plan WAITING:** thêm ~1× full market **mỗi 30s** → **~2× / phút** trên 1 symbol (~20+ REST).

**E. Whale / 5 phút:** 4× (depth + ticker + klines1h) ≈ 12 REST / 5 phút (~2–3/phút average).

**Tổng thô một phút “nặng” (Unified + MarketAnalysis, không locked plan):**  
≈ **44–48 (V3) + 24–32 (V41) + ~13 (UI market) ≈ 80–95 REST/phút** (chưa kể whale, pending fill, trùng cache).

### 2.3 Cơ chế giới hạn tốc độ đã có?

| Cơ chế | Có? | Ghi chú |
|--------|-----|---------|
| `MIN_REQUEST_GAP_MS = 120` | Có | Shared `lastRequestAt` **không khóa** → `Promise.all` vẫn burst |
| In-flight `withDedup` | Có | Chỉ trùng **cùng** `path+params` |
| Cache TTL | Có | Default 60s; ticker/book **3s**; depth **15s** |
| Queue / concurrency limit (vd. max 2) | **Không** | |
| Backoff 429 / tôn trọng Retry-After | **Không** (production) | Chỉ một số **script** backtest |
| Phân biệt 418 | **Không** (production) | |

V3: coin **tuần tự**. V41: coin **`Promise.allSettled` không giới hạn**. Trong coin: **`Promise.all`/`allSettled` không giới hạn**.

---

## 3. Đối chiếu Binance rate limit

Nguồn: Binance Futures developer community / Academy (REQUEST_WEIGHT IP):

| Limit | Futures USD-M (điển hình) |
|-------|---------------------------|
| REQUEST_WEIGHT | **2400 / phút / IP** |
| Vượt → | **HTTP 429** (+ thường có `Retry-After`) |
| Tiếp tục spam sau 429 → | **HTTP 418** = **IP ban** (phút → nhiều giờ) |
| Header theo dõi | `X-MBX-USED-WEIGHT-1M` |

**Weight tham chiếu endpoint (docs Futures phổ biến — không lấy được `exchangeInfo` sống vì IP đang 418):**

| Endpoint app dùng | Weight ước lượng |
|-------------------|------------------|
| `/fapi/v1/klines` | **5** |
| `/fapi/v1/ticker/price` (1 symbol) | **1** |
| `/fapi/v1/ticker/24hr` (1 symbol) | **1** |
| `/fapi/v1/ticker/bookTicker` (1 symbol) | **2** |
| `/fapi/v1/depth` limit **1000** | **20** (cao — hotspot) |
| `/fapi/v1/openInterest` | **1** |
| `/fapi/v1/fundingRate` | **1** |
| `/futures/data/*` (OI hist, L/S) | Giới hạn riêng / vẫn tốn IP; không dùng làm “batch” |

**Ước weight / chu kỳ V3 one coin (klines+depth+…):**  
≈ `5×5 + 20 + 1+1 +1 +1 + ticker/24h` ≈ **~50–55** × 4 ≈ **~200–220**  
+ V41 ≈ `5×5 + …` ×4 ≈ **~100–140** (BTC trùng)  
+ MarketAnalysis ≈ **~50**  
→ **~350–450 weight/phút** mức “ổn định” — **dưới 2400**.

→ **Kết luận weight:** với 4 coin + kiến trúc hiện tại, **một client một phút không “tự động” vượt 2400 chỉ vì N=4**.  
Nguy cơ thực tế nghiêng về: **burst không backoff**, **nhiều timer chồng** (30s locked plan, market UI, whale depth 1000), **nhiều instance / cùng IP**, / **418 còn tồn từ abuse trước**, chứ không phải công thức “N×M chắc chắn > 2400”.

*(Không fetch được `exchangeInfo` lúc báo cáo để chốt số limit live — mọi call = 418.)*

---

## 4. 429 vs 418 — app có phân biệt không? Probe sống?

### 4.1 Error handling production

```278:280:services/binanceApi.ts
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
```

- Không đọc body `banned until …`
- Không đọc `Retry-After`
- Không dừng poll khi 418
- Fail → fallback cache (nếu còn) hoặc error row / console

V41 funding/forming raw `fetch`: `throw new Error(\`HTTP ${res.status}\`)` — cùng kiểu.

**Scripts** (vd. `backtest-v4-near-90d.ts`) **có** nhánh `status === 418 || status === 429` + wait — **không** dùng trong Web app path.

### 4.2 Probe lúc điều tra (shell trên host workspace)

| Endpoint | Kết quả |
|----------|---------|
| `/fapi/v1/ping` | **418** I'm a teapot |
| `/fapi/v1/ticker/price?symbol=BTCUSDT` | **418** |
| `/fapi/v1/klines?...NEARUSDT` | **418** |
| `/fapi/v1/exchangeInfo` | **418** |

→ **Loại lỗi đang quan sát: IP ban (418), không phải 429 tạm.**  
Nếu Web EXE chạy cùng IP máy này → app cũng sẽ fail mọi market call cho đến khi ban hết / đổi IP.

*(Ghi chú lịch sử repo: `docs/AUDIT_BINANCE_US_IP_BLOCK_IMPACT_2026-07-31.md` — GHA US bị eligibility trên `/futures/data/*`; khác với 418 teapot, nhưng cùng họ “IP/location restriction”.)*

---

## 5. Nguyên nhân chính xác (trích code + docs — không suy đoán vượt bằng chứng)

| Phát biểu | Bằng chứng | Verdict |
|-----------|------------|---------|
| “Mỗi coin tự gọi API riêng” | `scanAllSignalRows` for-loop; `scanV41` map per symbol; hầu hết endpoint bắt buộc `symbol` | **Đúng** |
| “Quá nhiều request đồng thời” | `fetchAllMarketData` + `fetchRawMarketV41` + `scanV41` dùng `Promise.all`/`allSettled`; throttle 120ms **không mutex** | **Đúng (burst)** |
| “Chắc chắn vượt weight 2400 mỗi phút chỉ vì 4 coin” | Ước ~350–450 w/phút ổn định vs 2400 | **Không đủ bằng chứng** |
| “Bị chặn = 429 tạm, tự hết sau vài giây” | Probe = **418**; app không backoff | **Không khớp quan sát hiện tại** |
| “Bị chặn = IP ban 418” | Probe 418 trên mọi endpoint; Binance docs: 418 = ban | **Khớp quan sát host điều tra** |
| App xử lý khác 429 vs 418 | Chỉ `HTTP ${status}` | **Không phân biệt** |

**Tóm lại nguyên nhân có bằng chứng:**  
IP đang ở trạng thái **ban (418)**. Kiến trúc gọi **per-coin + burst + chồng timer + depth weight cao + không backoff 429** là **yếu tố rủi ro leo thang / tái ban**, nhưng **không** thay thế được bằng chứng 418 bằng giả thuyết “N coin làm vượt 2400 mỗi chu kỳ”.

---

## 6. Đề xuất hướng gộp / giảm tải (**CHƯA làm**)

1. **Batch ticker:** một lần `GET /fapi/v1/ticker/price` (không `symbol`) hoặc `bookTicker` all → map 4 coin (cân nhắc weight all-market).
2. **Không fetch BTC 4H/1H lặp trong V41:** fetch BTC một lần / chu kỳ, inject vào 4 symbol.
3. **Giảm depth:** `limit=1000` → 100/500 nếu whale/heatmap đủ; tiết kiệm weight lớn nhất trong V3 bundle.
4. **Concurrency cap:** queue toàn cục (vd. max 2–3 REST) thay throttle racy 120ms; serialize `scanV41`.
5. **Gộp pipeline:** Unified scan đã có rows → `useMarketAnalysis` không `fetchAllMarketData` trùng; Locked plan dùng snapshot scan 60s thay vì full fetch 30s (hoặc chỉ ticker).
6. **429/418 policy:** dừng interval + đọc `Retry-After` / `banned until`; **không** retry storm khi 418.
7. **Klines:** không batch được — giữ per-symbol nhưng cache/share TF giữa V3 và V41 trong cùng chu kỳ.

---

## Không có phần “Đã sửa”

Task **V3V4-DATA-1** — điều tra / báo cáo only.
