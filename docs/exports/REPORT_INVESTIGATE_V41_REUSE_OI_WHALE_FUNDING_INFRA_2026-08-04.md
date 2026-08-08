# REPORT — Điều tra reuse hạ tầng OI / Whale / Funding cho V4.1

**Date:** 2026-08-04  
**Mode:** Investigation only — **không sửa code**  
**Scope:** Khả năng dùng lại nguồn đã có (derivatives / Binance / order book / archive) cho dimensions OI / Whale / Funding của V4.1 market context  
**Liên quan:** Task 2 funnel (`REPORT_V41_TASK2_DECISION_CONFIDENCE_SWEEP_2026-08-04.md`) — `ctxOi`/`ctxWhale` 100% NA/SKIP  

**Status:** Báo cáo chờ duyệt. User chọn chưa wire.

---

## 0. Kết luận ngắn

| # | Câu hỏi | Verdict |
|---|---------|---------|
| 1 | `derivativesDataService` (Coinglass/Coinalyze) có OI >30d / whale / đã trả phí? | **Không OI lịch sử.** Liquidation heatmap + funding snapshot; whale live ≈ 0. **Không có bằng chứng đang trả phí** trong repo (`apiKey: ''`, mock mặc định). **Không wire production.** |
| 2 | V4.1 OI/Whale lấy từ đâu — vì sao luôn SKIP/NA? | Filter **không fetch**. Live + backtest **không truyền** `oiDeltaPct` / `whale`. Missing → SKIP (ACTIVE) hoặc NA (non-ACTIVE). |
| 3 | `fetchDeepOrderBook` → whale wall V4.1? | **Proxy được cho live**, cần **adapter** enum `WhaleContextInput`. Không đủ cho backtest 180d (snapshot). |
| 4 | Effort wire + rủi ro V3/V4? | Live OI: **dễ**, rủi ro thấp. Whale adapter: **TB**. Backtest history: **khó**. Reuse **Binance path của V4**, không cần Coinglass stub. |
| 5 | Chi phí / quota thêm V4.1? | Coinglass/Coinalyze = **$0 theo repo**. Ngân sách thực = Binance public (V4 đã dùng). Thêm vài call/cycle thường ổn. |

**Khuyến nghị:** Không dựa vào `derivativesDataService` để cứu Task 2 / confidence. Nếu wire sau này → Binance `fetchOIEngine` + (tùy chọn) orderbook→whale adapter; backtest cần kế hoạch data riêng.

---

## 1. `services/derivativesDataService.ts`

### 1.1. Vai trò thiết kế

Comment file: dữ liệu phái sinh nâng cao (CoinGlass / Coinalyze) cho **L11–L13 Scorer V4**. Fallback: API lỗi → điểm 0, không crash.

### 1.2. Provider & config

| Item | Giá trị |
|------|---------|
| Providers | `'coinglass' \| 'coinalyze' \| 'mock'` |
| Default | Coinglass |
| API key | `apiKey: ''` trong `DEFAULT_DERIVATIVES_CONFIG` |
| Env wiring | **Không** — chỉ `configureDerivativesApi()` runtime patch |
| Mock | `useMockWhenNoKey: true` → mock khi không key |
| Timeout | 8000 ms |
| Cache | **Không** |
| Rate limit docs | **Không trong repo** |

### 1.3. Dữ liệu thực tế fetch

| Loại | Có? | Ghi chú |
|------|-----|---------|
| Liquidation heatmap | Có (Coinglass `/public/v2/liquidation_heatmap`) | Snapshot; lọc ±5% price; stop-hunt zone 1.5–2.0%, pool ≥ $1M |
| Funding | Có (Coinglass `/public/v2/funding` hoặc Coinalyze latest) | Snapshot, không series dài |
| OI / OI history | **Không** | Không endpoint OI trong file |
| Whale order delta | Live = **0** từ API path; mock có giá trị | L13 dùng `scoreL13WhaleDelta` (taker delta USD, min $100k) trên data mock/API |

### 1.4. Wire production?

- Import runtime: **chỉ** `services/derivativesDataService.test.ts` (+ mention audit docs).
- Comment nội bộ kiểu “trước khi wire vào Scorer V4” — **vẫn unwired**.
- V4 live L11 squeeze: `calculateSqueezeRisk` / whale walls từ order book — **không** qua Coinglass heatmap path này.

### 1.5. Trả lời thẳng câu 1

- **OI lịch sử >30 ngày:** không (service không có OI).
- **Whale / liquidation:** liquidation heatmap yes (snapshot); whale live không dùng được (0).
- **Paid vs free:** mặc định free/mock; **không có key / billing / quota** trong repo → coi như **chưa subscribe**.

---

## 2. V4.1 market context — nguồn & nguyên nhân SKIP/NA

### 2.1. Core: `services/v41/marketContextFilter.ts`

Pure evaluators — **không fetch**.

| Dimension | Input | Skip khi | Fail (rút gọn) |
|-----------|-------|----------|----------------|
| Funding | `fundingRate?` | null / non-finite; trend NEUTRAL | Extreme ±0.03% (`0.0003`) ngược hướng reversal |
| OI | `oiDeltaPct?`, `priceChangePct?` | `oiDeltaPct` null/non-finite | Buildup ≥1.5% + continuation; squeeze ≤−3% + strong price |
| Whale | `whale?: { signal, blocksReversal? }` | `signal === 'NONE'`; NEUTRAL | WALL/ABSORPTION block; ACCUM/DIST ngược trend |

Context filter chỉ áp khi TR `state === 'ACTIVE'`. Non-ACTIVE → không có object `marketContext` → CSV tag **NA**. Dimension skipped vẫn `pass: true` nhưng confidence: score skipped **40/100** + completeness penalty (~8%/dim).

### 2.2. Live wiring

| Stage | File | OI / Whale / Funding |
|-------|------|----------------------|
| Raw fetch | `services/v41/rawMarketFetcher.ts` | Klines + **`/fapi/v1/fundingRate?limit=1`**. **Không** OI, **không** order book / whale |
| RC3 VM | `services/v41/rc3/buildRc3ViewModel.ts` | `evaluateTrendReversalWithContext(..., { fundingRate, klines4H, btcKlines4H })` — **omits** `oiDeltaPct`, `priceChangePct`, `whale` |
| VE engine | `volatilityExplosionEngine.ts` | Cũng nhận `oiDeltaPct` optional; comment nhắc `fetchOIEngine`; RC3 chỉ pass funding |

### 2.3. Backtest / Task 2

`scripts/backtest-v41-near-pipeline-funnel.ts`:

- Không truyền OI / whale.
- Funding: **một** `lastFundingRate` (premiumIndex / tương đương) cho **mọi** bar lịch sử.
- Tag: missing dim → SKIP; no `marketContext` → NA.

**Không có** flag `if (backtest) skip` riêng — hành vi thiếu data giống live.

### 2.4. Trả lời thẳng câu 2

V4.1 **không lấy OI/Whale từ `derivativesDataService`** (cũng không lấy từ Binance OI). Luôn SKIP/NA vì **params không được feed**, không vì filter “từ chối” nguồn derivatives.

---

## 3. `fetchDeepOrderBook` vs whale dimension V4.1

### 3.1. Định nghĩa

`services/binanceApi.ts` — `GET /fapi/v1/depth?limit=1000`, cache TTL ~15s, throttle ~120ms.

### 3.2. Consumers V3/V4 (đã có)

`fetchAllMarketData` / `whaleRadarScan` / scan path:

`fetchDeepOrderBook` → order book → `calculateLiquidityHeatmap` (+ force orders) → pools → `buildWhaleEntryWalls` → L7 / L11 squeeze / trade plan.

### 3.3. V4.1

`WhaleContextInput` (`WALL` | `ABSORPTION` | `DISTRIBUTION` | `ACCUMULATION` | `NONE` + `blocksReversal`) **không** được map từ entry walls ở đâu ngoài tests.

| Use case | Khả thi? |
|----------|----------|
| Live: depth → adapter → whale dim | **Có** — cần viết mapping (effort TB) |
| Backtest 180d whale walls | **Không** chỉ với depth — cần history / proxy khác |

### 3.4. Trả lời thẳng câu 3

Order book depth **có thể** tự tính proxy “whale wall” cho **live** V4.1 nếu có adapter; **không** thay thế dữ liệu whale lịch sử; **không** cần Coinglass cho bước này.

---

## 4. Effort & rủi ro nếu wire nguồn có sẵn

### 4.1. So sánh đường reuse

| Path | Reuse cho V4.1? | Ghi chú |
|------|-----------------|---------|
| Binance `fetchOIEngine` + funding history | **Best fit** | V4 đã dùng; OI hist mặc định `period=5m`, `limit=30` (~2.5h @5m) — đủ ΔOI ngắn hạn live, **không** 180d |
| Order book → whale adapter | **Partial** | Cần logic map walls → enum + `blocksReversal` |
| `derivativesDataService` | **Không khuyến nghị** | Unwired, mock, không OI history, whale API 0 |
| `data/market-archive` + `archive-oi-ls-funding.ts` | **Backtest only (sau)** | CSV 1h oi/ls/funding; heal ~24h; **runtime app không đọc** |

### 4.2. Effort / risk matrix

| Công việc | Effort | Rủi ro ảnh hưởng V3/V4 |
|-----------|--------|-------------------------|
| Live: gọi `fetchOIEngine`, map `deltaOI` / pct → `oiDeltaPct` + price Δ từ klines vào TR context (+ VE) | **Dễ** | **Thấp** nếu chỉ đọc API / cache sẵn trong scan V4.1; không đổi `scorerV4` |
| Live: tái dùng heatmap/walls → `WhaleContextInput` | **Trung bình** | **Thấp–TB** — tránh đổi semantics L7; adapter nằm layer V4.1 |
| Live: tăng funding history (16 rates) thay vì `limit=1` | **Dễ** | Thấp |
| Backtest: point-in-time OI/funding 180d | **Khó** | Thấp với production nếu script riêng; **gap data** (Binance hist limit ngắn; archive chỉ forward/heal ngắn) |
| Bật Coinglass key + wire service | **Không ưu tiên** | Thêm dependency/quota vô ích cho OI V4.1 |

Wire **chỉ trong fetch/VM V4.1** → gần như **không đụng** pipeline điểm V3/V4 đang chạy trên Binance.

---

## 5. Chi phí & quota

| Nguồn | Trong repo? | Ước lượng |
|-------|-------------|-----------|
| Coinglass / Coinalyze pricing tiers | **Không** | N/A — chưa cấu hình key → **$0 hiện tại** |
| Binance public Futures | Throttle 120ms (`binanceApi`); archive 200ms; funnel 250ms | V4 đã gọi OI + funding + depth mỗi scan; V4.1 thêm OI/depth **cùng “ngân sách” weight-bearing**, trừ quét rất dày / nhiều symbol |
| Archive GHA | Workflow `archive-oi-ls-funding` | Collector offline, không billing Coinglass |

**Trả lời câu 5:** Không có bill Coinglass trong repo. Quota “đủ cho V4.1 dùng chung?” → với path **Binance reuse**, khả năng cao **có** ở mức scan hiện tại; không chứng minh được bằng số liệu paid-tier vì **không có paid derivative vendor đang active**.

---

## 6. Liên hệ Task 2 (confidence)

Funnel 4×180d: OI/Whale 100% NA/SKIP, Funding ~98% NA → completeness/confidence bị phạt theo thiết kế (`dimensionSkipped` 40 + penalty). **Wire OI/Whale live có thể nâng conf trần quan sát** — nhưng:

- Cần đo lại sau khi có data (không đoán threshold).
- Backtest lịch sử vẫn lệch nếu chỉ lấy live snapshot.
- **Không** đổi `decisionConfig` trong scope báo cáo này.

---

## 7. Khuyến nghị (chờ duyệt — chưa làm)

1. **Đóng** giả thuyết “reuse Coinglass/Coinalyze sẵn có” như đáp án chính — stub unwired, không OI history.
2. Nếu duyệt phase tiếp: **design live Binance** (`fetchOIEngine` + optional whale adapter từ depth/heatmap) trước; tách **design backtest data** (archive dài / vendor) khỏi live.
3. Không sửa code cho đến khi user duyệt design / implementation.

**User trạng thái (2026-08-04):** chọn chỉ đọc báo cáo — **chưa wire**.

---

## 8. File tham chiếu chính

| File | Vai trò |
|------|---------|
| `services/derivativesDataService.ts` | Stub Coinglass/Coinalyze L11–L13 |
| `services/derivativesDataService.test.ts` | Chỉ consumer cấu hình API trong test |
| `services/v41/marketContextFilter.ts` | Evaluators OI/Whale/Funding |
| `services/v41/rawMarketFetcher.ts` | Fetch V4.1 — funding limit=1 |
| `services/v41/rc3/buildRc3ViewModel.ts` | Bỏ qua oi/whale params |
| `services/binanceApi.ts` | `fetchDeepOrderBook`, `fetchOIEngine`, funding hist limit 16 |
| `scripts/archive-oi-ls-funding.ts` | Forward CSV OI/LS/funding 1h |
| `docs/exports/REPORT_V41_TASK2_DECISION_CONFIDENCE_SWEEP_2026-08-04.md` | Bằng chứng SKIP/NA trên funnel |

---

*End of report.*
