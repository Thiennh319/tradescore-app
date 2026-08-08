# AUDIT — Phạm vi ảnh hưởng khi Binance chặn IP US (GitHub Actions)

**Date:** 2026-07-31  
**Phạm vi:** Chỉ đọc / báo cáo — **không sửa code**  
**Bối cảnh:** Workflow `archive-oi-ls-funding.yml` trên `ubuntu-latest` (US) nhận lỗi *Eligibility / restricted location* trên Futures data endpoints.

---

## Kết luận ngắn

| Câu hỏi | Trả lời |
|---------|---------|
| App live (APK / Web trên máy user) có bị **vì** chặn IP US của GitHub Actions không? | **Không.** Live app gọi Binance **trực tiếp từ device/browser của user**, không qua Actions / không qua backend riêng. |
| Cái gì bị ảnh hưởng? | **Chủ yếu** job archive trên GHA + dữ liệu CSV `data/market-archive/*.csv` (gap từ ~2026-07-31 00:00 UTC). |
| App có đọc `market-archive/*.csv` lúc runtime không? | **Không.** Chỉ `scripts/archive-oi-ls-funding.ts` (ghi) và `scripts/check-market-archive-progress.ts` (đọc kiểm tra). |
| Backtest / investigate scripts chạy local? | Có thể **bị** nếu máy runner ở vùng bị chặn; nếu chạy từ VN/IP được phép thì **không** liên quan GHA US. |

---

## 1. Inventory — mọi chỗ gọi domain Binance (code nguồn)

**Base URL SSOT:** `constants/scoring.ts` → `BINANCE_BASE_URL = 'https://fapi.binance.com'`  
**WebSocket:** `services/binanceApi.ts` → `wss://fstream.binance.com/ws`  
**Không thấy** trong source app: `api.binance.com`, `data-api.binance.vision`, `dapi.binance.com` (spot/delivery).

### A. Production client — `services/binanceApi.ts` → `https://fapi.binance.com`

| Hàm / dòng (khoảng) | Endpoint | Loại dữ liệu | Host runtime |
|---------------------|----------|--------------|--------------|
| `fetchKlines` ~540 | `GET /fapi/v1/klines` | Public market (OHLCV) | **Client** APK/Web |
| `fetchTickerPrice` ~564 | `GET /fapi/v1/ticker/price` | Public market | Client |
| `fetch24hTickerChange` ~579 | `GET /fapi/v1/ticker/24hr` | Public market | Client |
| `fetchBookTicker` ~594 | `GET /fapi/v1/ticker/bookTicker` | Public market | Client |
| `fetchDeepOrderBook` ~608 | `GET /fapi/v1/depth` | Public market | Client |
| `fetchForceOrders` ~631 | `GET /fapi/v1/forceOrders` | USER_DATA (signed) — comment: không dùng anonymous | Client (nếu gọi) |
| `fetchOIEngine` ~669–696 | `GET /fapi/v1/openInterest` + `GET /futures/data/openInterestHist` | Futures restricted (OI) | Client |
| `fetchFundingRateHistory*` ~728–735 | `GET /fapi/v1/fundingRate` | Futures restricted (funding) | Client |
| `fetchLongShortRatio` ~770–778 | `GET /futures/data/topLongShortAccountRatio` | Futures restricted (L/S) | Client |
| `fetchAllMarketData` ~796–817 | gộp klines + depth + forceOrders + OI + funding + L/S | Hỗn hợp | Client |
| WS `BINANCE_WS_BASE` L19 | `wss://fstream.binance.com/ws` | Public stream | Client (nếu dùng) |

**Không có** backend Vercel / Railway / VPS trong pipeline market data live.  
**Không có** proxy server trong repo cho Binance REST.

Callers chính (client):

- `services/marketAnalysisFetch.ts` → `fetchAllMarketData` (Signal Board / phân tích)
- `services/signalBoardScan.ts` → `fetchAllMarketData`
- `services/lockedPlanMonitorService.ts` → `fetchAllMarketData` + ticker
- `services/v41/rawMarketFetcher.ts` → `fetchKlines` + **riêng** `GET /fapi/v1/fundingRate?limit=1` (~L80)
- UI: `SignalBoardV41` / `SignalBoardUnified` / hooks → ticker / 24h
- Whale radar: depth + klines + ticker
- v.v. (import `binanceApi`)

### B. Archive job — `scripts/archive-oi-ls-funding.ts` + GHA

| Dòng (khoảng) | Endpoint | Loại | Host |
|---------------|----------|------|------|
| ~212 | `GET /futures/data/openInterestHist` | Restricted OI hist | **GitHub Actions** `ubuntu-latest` (US) **và** local nếu chạy tay |
| ~233 | `GET /futures/data/topLongShortAccountRatio` | Restricted L/S | GHA / local |
| ~253 | `GET /fapi/v1/fundingRate` | Restricted funding | GHA / local |

Workflow: `.github/workflows/archive-oi-ls-funding.yml` → `npx tsx scripts/archive-oi-ls-funding.ts`  
→ **Đây là nơi đang bị chặn IP US** đúng như mô tả.

**Ghi chú:** Collector **không** gọi `globalLongShortAccountRatio` — cột `ls_global_ratio` cố ý để `null` (phase 1). Thiếu `ls_global_ratio` **không** chỉ do US block.

**Ghi chú:** Collector **không** gọi `premiumIndex` — funding lấy từ `/fapi/v1/fundingRate`.

### C. Scripts backtest / investigate (Node local hoặc CI nếu chạy)

Đều dùng `BINANCE_BASE_URL` / `fapi.binance.com` — **không** đọc `market-archive` (trừ khi sau này wire). Host = máy chạy script.

| File | Endpoints chính |
|------|-----------------|
| `scripts/backtest-v4-near-90d.ts` | klines, fundingRate, openInterestHist, topLongShortAccountRatio |
| `scripts/investigate-v41-context-momentum-30d.ts` | klines, fundingRate, openInterestHist |
| `scripts/backtest-v41-near-pipeline-funnel.ts` | klines + **`/fapi/v1/premiumIndex`** (funding mark) |
| `scripts/backtest-v41-ls-oi-confirmation.ts` | klines, openInterestHist, topLongShort… |
| `scripts/backtest-v41-near-oi-rr-ev.ts` | klines, openInterestHist |
| `scripts/backtest-v41-continuous-scoring.ts` | klines |
| `scripts/backtest-v41-rr-atr.ts` | klines |
| `scripts/backtest-v41-tr-confirmation-layers.ts` | klines |
| `scripts/backtest-v41-exhaustion-threshold.ts` | klines |
| `scripts/investigate-v41-market-confidence-30d.ts` | klines 4h |
| `scripts/investigate-v41-near-momentum-ew15.ts` | klines |

### D. Nguồn phái sinh **không** phải Binance

`services/derivativesDataService.ts` — CoinGlass / Coinalyze (L11–L13 phụ). **Không** liên quan chặn Binance US trên GHA.

---

## 2. Phân loại endpoint vs khả năng bị chặn region

| Nhóm | Ví dụ | Khả năng bị “restricted location” (theo báo cáo user + hành vi Binance Futures data) |
|------|--------|----------------------------------------------------------------------------------------|
| Public market | klines, ticker, depth, 24hr | **Thường không** bị cùng policy Eligibility (user báo chặn nhóm futures data) |
| Futures restricted | fundingRate, openInterest / openInterestHist, topLongShortAccountRatio, (premiumIndex), globalLongShort… | **Có** — đúng lỗi trên GHA US |
| App live từ VN / IP được phép | Cùng endpoint restricted | **Thường OK** — phụ thuộc IP **device**, không phụ thuộc GHA |

---

## 3. Engine / module live phụ thuộc nguồn nào?

| Module / lớp | Nguồn dữ liệu runtime | Đọc `market-archive`? | Ảnh hưởng chặn GHA US? |
|--------------|----------------------|------------------------|-------------------------|
| V3/V4 Signal Board (`fetchAllMarketData` → L6 funding, L7 L/S, OI, klines…) | Binance REST **từ client** | Không | **Không** (trừ user ở vùng bị chặn) |
| L6 Funding (scorer V3/V4 / locked plan) | `fundingRate` history từ `binanceApi` | Không | Không qua GHA |
| V4.1 scan (`rawMarketFetcher` + MI / context / exhaustion funding) | klines + funding **từ client** | Không | Không qua GHA |
| V4.1 Market Confidence / Context / Momentum | Input từ fetch live / backtest script | Không dùng archive CSV | GHA archive ≠ feed live |
| Position / price monitors | ticker / market bundle client | Không | Không |
| Forward archive CSV | Chỉ collector + check progress | **Ghi/đọc CSV** | **Có — đây là nạn nhân** |

**Thiết kế archive:** Phương án C — tích lũy OI/L/S/funding 1h để **sau này** backtest 90d+ không phụ thuộc trần ~30d Binance. Hiện **chưa** wire vào scorer/app production.

---

## 4. Ai đọc `data/market-archive/*.csv`?

| File | Vai trò | Ảnh hưởng gap từ 2026-07-31 00:00 UTC |
|------|---------|--------------------------------------|
| `scripts/archive-oi-ls-funding.ts` | Ghi upsert | Job fail / partial → CSV thiếu funding / OI / L/S mới |
| `scripts/check-market-archive-progress.ts` | Đo coverage / ready_90d | Báo coverage thấp / gap dài |
| App APK / Web / scorer / V4.1 runtime | — | **Không đọc** → **không** degrade live vì file thiếu |

→ Module “bị ảnh hưởng bởi khoảng thiếu” = **pipeline archive + mọi backtest tương lai dựa trên CSV này** (chưa có consumer production trong repo).

---

## 5. Bảng tổng hợp theo yêu cầu

| Nơi gọi API | Host ở đâu | Loại endpoint | Bị ảnh hưởng chặn US (GHA)? | Module app phụ thuộc |
|-------------|------------|---------------|-----------------------------|----------------------|
| `binanceApi.ts` (live) | Device user (APK/Web) | Public + Futures restricted | **Không** (IP user) | Signal Board, L6/L7/OI, V4.1 fetch, monitors… |
| `rawMarketFetcher.ts` funding | Device user | Futures funding | Không (IP user) | V4.1 scan / exhaustion / context |
| `archive-oi-ls-funding.ts` | **GHA US** (+ local) | Futures OI / L/S / funding | **Có trên GHA** | Chỉ archive CSV — **không** feed live |
| Backtest/investigate scripts | Máy chạy script | Public ± restricted | Chỉ nếu IP máy bị chặn | Offline research — không phải UI live |
| CoinGlass/Coinalyze | Client (nếu bật) | Non-Binance | Không | L11–L13 phụ |

---

## 6. Kết luận rõ ràng cho bước tiếp

1. **Live TradeScore (real-time trên máy người dùng) không phụ thuộc** IP GitHub Actions Virginia — vụ chặn US **không tự làm hỏng** sync Gist hay scoring live.  
2. **Chỉ** forward-archive trên Actions (và CSV trong `tradescore-app` / local `data/market-archive`) đang / sẽ **thiếu / partial** khi runner ở US.  
3. `ls_global_ratio` trống là **by design** hiện tại, không chỉ do block.  
4. Bước tiếp (khi bạn duyệt) thường là: đổi host runner / proxy non-US / self-hosted agent ngoài US / hoặc thu thập từ máy local — **không** cần đụng logic scorer live để “vá” lỗi GHA.

**Không sửa file nào trong audit này.**
