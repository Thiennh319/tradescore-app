# Báo cáo hệ thống chấm điểm TradeScore — V3 + V4

**Ngày:** 2026-06-29  
**Phạm vi:** Pipeline production (`scorerV3.ts`, `scorerV4.ts`, nguồn dữ liệu, UI)  
**Tổng điểm hiển thị:** 15 điểm (nhóm A/B/C quy đổi) · **L11 V4** là cảnh báo bổ sung, **không** cộng vào thang 15

---

## Tóm tắt kiến trúc

| Hạng mục | V3 | V4 |
|----------|----|----|
| File scorer chính | `services/scorerV3.ts` | `services/scorerV4.ts` |
| Input builder | `buildAnalysisInputV3FromMarket()` | `buildAnalysisInputV4FromMarket()` |
| Base input | `services/analysisInput.ts` → `buildAnalysisInputFromMarket()` | Kế thừa base + `fundingMetrics`, `oiChange1h/4h` |
| Fetch thị trường | `binanceApi.fetchAllMarketData()` | Cùng pipeline |
| Quét Signal Board | `signalBoardScan.ts` | Cùng file (chạy song song V3 + V4) |
| Store | `store/useTradeStore.ts` (`scorerVersion`, journal, psychology) | Cùng store, mặc định `v4` |
| Lớp bổ sung | — | **L11 Squeeze Risk** (`squeezeRiskEngine.ts`) |
| Coinalyze / CoinGlass | **Không** nằm trong scorer chính | Module `derivativesDataService.ts` (L11–L13 riêng, **chưa wire** vào `scoreAnalysisV4`) |

**Luồng fetch chung (mỗi lần quét):**

```
fetchAllMarketData(symbol)          // binanceApi.ts
  ├─ klines: 5m, 15m, 1h, 4h, 1d
  ├─ orderBook (deep)
  ├─ forceOrders (liquidations)
  ├─ oiEngine (open interest history)
  ├─ fundingHistory
  └─ longShortRatio (top trader)
        ↓
buildAnalysisInputFromMarket()      // analysisInput.ts — OHLCV → CVD, ATR, OI, funding
        ↓
buildAnalysisInputV3/V4FromMarket() // whale walls, funding metrics, BTC klines
        ↓
scoreAnalysisV3 / scoreAnalysisV4()
```

---

## Chú giải nguồn dữ liệu

| Ký hiệu | Ý nghĩa |
|---------|---------|
| **Binance** | REST Futures `fapi.binance.com` qua `services/binanceApi.ts` |
| **Coinalyze** | Chỉ trong `derivativesDataService.ts` (funding bổ sung) — **không** feed scorer L1–L11 chính |
| **CoinGlass** | Cùng module derivatives (liquidation heatmap) — **không** feed scorer chính |
| **OHLCV nội bộ** | Tính từ klines Binance: EMA, RSI, MACD, BB, CVD, volume ratio, ATR |
| **Nhập tay user** | Checklist tâm lý (một phần L10); xác nhận vào lệnh |
| **Hệ thống nội bộ** | Giờ VN (L9), journal (L10 loss streak / daily loss), session rules |

## Chú giải tự động hóa

| Ký hiệu | Ý nghĩa |
|---------|---------|
| ✅ | Hoàn toàn tự động khi quét — không cần thao tác user |
| ⚠️ | Bán tự động — dữ liệu auto + user tick checklist / xác nhận lệnh |
| ❌ | Thủ công — không có trong pipeline auto scorer |

---

## Bảng chi tiết theo layer

### L1 — Giá & EMA (Slope)

| Cột | V3 | V4 |
|-----|----|----|
| **Tên layer** | L1 — Giá & EMA (Slope) | Giống V3 |
| **Nguồn dữ liệu** | Binance klines → **OHLCV nội bộ** | Giống V3 |
| **Chỉ số** | EMA20, EMA50, EMA200; slope EMA20/50; % giá vs EMA20 | Giống V3 |
| **Khung thời gian** | **1H + 4H** | Giống V3 |
| **Hàm tính** | `getEMAAnalysisV3()` → `scoreL1V3()` / `scoreL1V4()` · `services/indicators.ts` | Giống V3 |
| **Tự động hóa** | ✅ | ✅ |
| **Service** | `scorerV3.ts` / `scorerV4.ts` | |
| **Component UI** | `LayerCard`, `SignalBoard`, `ScorerV3DetailSection` / `ScorerV4DetailSection`, `GroupScoreBar` | |
| **Store** | `useTradeStore` (kết quả quét → `signalBoardPersist`); không lưu riêng L1 | |

---

### L2 — RSI 14 + Divergence

| Cột | V3 | V4 |
|-----|----|----|
| **Nguồn** | Binance klines → **OHLCV nội bộ** | Giống |
| **Chỉ số** | RSI(14) 1H & 4H; phân kỳ RSI 1H (`detectRSIDivergenceV3`) | Giống |
| **Khung** | **1H + 4H** | Giống |
| **Hàm** | `getRSI()`, `detectRSIDivergenceV3()` → `scoreL2V3/V4()` | |
| **Tự động** | ✅ | ✅ |
| **Service** | `indicators.ts`, `scorerV3.ts`, `scorerV4.ts` | |
| **UI** | `LayerCard`, `SignalBoard` | |
| **Store** | — | |

---

### L3 — MACD + Histogram Momentum

| Cột | V3 | V4 |
|-----|----|----|
| **Nguồn** | Binance klines → **OHLCV nội bộ** | Giống |
| **Chỉ số** | MACD (12,26,9); histogram; `crossedZeroRecently`; `isTurningUp/Down` | Giống |
| **Khung** | **1H + 4H** | Giống |
| **Hàm** | `getMACDAnalysisV3()` → `scoreL3V3/V4()` | |
| **Hard block** | Histogram âm (Long) / dương (Short) → `L3 MACD vi phạm` | Giống; UI có thể **ẩn** hard block MACD gần entry (`tradePlanDisplay.ts`) |
| **Tự động** | ✅ | ✅ |
| **Service** | `indicators.ts`, `scorerV3.ts`, `scorerV4.ts`, `tradePlanDisplay.ts` | |
| **UI** | `LayerCard`, `SignalBoard`, `FinalEntryBadge` | |
| **Store** | — | |

---

### L4 — Bollinger %B + Bandwidth

| Cột | V3 | V4 |
|-----|----|----|
| **Nguồn** | Binance klines 1H → **OHLCV nội bộ** | Giống |
| **Chỉ số** | Bollinger(20,2); %B; bandwidth → `marketMode` TRENDING/RANGING | Giống |
| **Khung** | **1H** (mode từ BB 1H) | Giống |
| **Hàm** | `getBollingerAnalysisV3()` → `scoreL4V3/V4()` | |
| **Tự động** | ✅ | ✅ |
| **Service** | `indicators.ts`, `scorerV3.ts`, `scorerV4.ts` | |
| **UI** | `LayerCard`, `ScorerV4DetailSection` (badge TRENDING/RANGING) | |
| **Store** | — | |

---

### L5 — Dòng tiền (CVD / Volume / OI)

| Cột | V3 | V4 |
|-----|----|----|
| **Cấu trúc** | **L5 gộp** — Volume + OI + CVD trong 1 layer (max raw 2) | **Tách:** **L5a** CVD (layer 5) + **L5b** Volume/OI (layer id `52`) |
| **Nguồn** | Binance: klines 1H (`volume`, `takerBuyVolume`), OI history (`fetchOIEngine`) | Giống |
| **Chỉ số V3 L5** | `getVolumeRatio()`; OI delta + price change; `analyzeCVD()`, phân kỳ CVD | |
| **Chỉ số V4 L5a** | CVD tích lũy, slope 12 nến, momentum 24h, `classifyCvdState`, hard block CVDX | `scoreL5aV4()`, `evaluateLongCvdHardBlock()`, `applyRecoveringCvdLocalPenalty()` |
| **Chỉ số V4 L5b** | Volume ratio; OI vs price (không CVD) | `scoreL5bV4()` |
| **Khung** | **1H** (CVD từ ~220 nến 1H; momentum 24 nến 1H) | Giống |
| **Hàm CVD** | `buildCVDPointsFromKlines()`, `analyzeCVD()` — `indicators.ts` | |
| **Bắt buộc V4** | — | L5a raw **≥ 1** hoặc hard block `L5a CVD chưa đủ 1đ` |
| **Tự động** | ✅ | ✅ |
| **Service** | `analysisInput.ts`, `indicators.ts`, `scorerV3.ts`, `scorerV4.ts`, `cvdx.test.ts` | |
| **UI** | `LayerCard` (L5 / L5a / L5b reason), `OrderFlowPanel` + `CVDChart` (trực quan CVD, không chấm điểm trực tiếp), `SignalBoard` hard block CVD | |
| **Store** | `SignalRow.cvdValue`, `cvdTrend` → journal `market.*` khi vào lệnh | |

---

### L6 — Funding Rate + Trend

| Cột | V3 | V4 |
|-----|----|----|
| **Nguồn** | Binance `fetchFundingRateHistory` → `getFundingAnalysisV3()` | Giống + `calculateFundingMetrics()` → `classifyFundingState()` |
| **Chỉ số V3** | Funding % hiện tại; trend RISING/FALLING; extreme LONG/SHORT squeeze | |
| **Chỉ số V4** | **FundingState** (5 trạng thái): EXTREME_LONG_EUPHORIA, LONG_EUPHORIA_FADING, NEUTRAL, SHORT_EUPHORIA_FADING, SHORT_SQUEEZE_BUILDING; velocity & acceleration | `resolveL6DetailV4()`, `scoreL6V4()` |
| **Khung** | Lịch sử funding (tối đa ~21 kỳ 8h) | Giống |
| **Hard block** | Funding extreme squeeze → chặn Long/Short | Giống |
| **Fallback V4** | — | Không đủ `fundingMetrics` → `scoreL6V4Legacy()` |
| **Tự động** | ✅ | ✅ |
| **Service** | `binanceApi.ts`, `indicators.ts`, `constants/scoring.ts` (`classifyFundingState`), `scorerV3.ts`, `scorerV4.ts` | |
| **UI** | `LayerCard`, `L6FundingExpandV4` (chi tiết funding state — **V4 only**) | |
| **Store** | `SignalRow.l6Detail` (V4 snapshot) | |

---

### L7 — L/S Ratio + Whale Wall

| Cột | V3 | V4 |
|-----|----|----|
| **Nguồn** | Binance `fetchLongShortRatio` (top trader); order book + force orders → heatmap → whale walls | Giống |
| **Chỉ số** | L/S ratio series; slope ratio; whale bid/ask walls (ATR band, notional validation) | Giống |
| **Khung** | L/S: period theo `statsPeriodFor(timeframe)` (thường **1h**); walls từ order book snapshot | Giống |
| **Hàm** | `getRatioSlope()`, `scoreL7FlowWithWhaleConfirmation()` (`whaleConfirmation.ts`); `buildWhaleEntryWalls()` (`whaleEntryWalls.ts` + `indicators.buildEntryWhaleWalls`) | `scoreL7V3/V4()` |
| **Cảnh báo** | L/S extreme (>3 hoặc <0.5) — warning squeeze | Giống |
| **Tự động** | ✅ (walls có thể dùng `whaleRadarPersist` metadata) | ✅ |
| **Service** | `binanceApi.ts`, `indicators.ts`, `whaleEntryWalls.ts`, `whaleConfirmation.ts`, scorers | |
| **UI** | `LayerCard`, `LiquidityHeatmapChart` (nguồn pools), `SignalBoard` | |
| **Store** | `whaleRadarPersist` (snapshot walls); không lưu riêng L7 | |

---

### L8 — BTC 24h + 1H Momentum

| Cột | V3 | V4 |
|-----|----|----|
| **Nguồn** | Binance: `fetch24hTickerChange('BTCUSDT')` + BTC klines 1H | Giống |
| **Chỉ số** | `change24h`, `change1h`, momentum ACCELERATING/DECELERATING/NEUTRAL | `getBTCAnalysisV3()` |
| **Khung** | **24h** ticker + **1H** klines BTC | Giống |
| **Hard block** | \|BTC 24h\| > 8%; Long khi BTC ≤ -2%; Short khi BTC ≥ +2% | Giống (`HARD_BLOCK_RULES_V3/V4`) |
| **Tự động** | ✅ | ✅ |
| **Service** | `marketAnalysisFetch.ts` (`fetchBtcChange24hPct`), `indicators.ts`, scorers | |
| **UI** | `LayerCard`, `SignalBoard` (hard block subtitle) | |
| **Store** | — | |

---

### L9 — Phiên giao dịch (Session)

| Cột | V3 | V4 |
|-----|----|----|
| **Nguồn** | **Hệ thống nội bộ** — giờ hiện tại timezone VN (UTC+7) | Giống |
| **Chỉ số** | `SESSION_RULES_V3` (London, NY, Asia, …) | `getSessionScoreV3()` dùng chung |
| **Khung** | Không dùng chart — theo **giờ wall-clock** | Giống |
| **Hard block V4** | — | L9 score < 0.5 → `L9 Phiên xấu` + `awaitingRescore` (chờ phiên tốt) |
| **Tự động** | ✅ | ✅ |
| **Service** | `indicators.ts` (`getSessionScoreV3`), `constants/scoring.ts` (`SESSION_RULES_V3`), scorers | |
| **UI** | `LayerCard`; V4: badge `CHỜ TÁI CHẤM` trên `SignalBoard` | |
| **Store** | — | |

---

### L10 — Tâm lý & Kỷ luật

| Cột | V3 | V4 |
|-----|----|----|
| **Nguồn** | **Hỗn hợp:** checklist user + journal + settings | Giống |
| **Chỉ số** | `PsychologyChecklistV3`: alert, chartStudied, noFomo, slTpReady, riskAccepted; win streak; daily loss USDT; loss streak lock | Giống logic (`scoreL10V3/V4`) |
| **Map UI → scorer** | `toScoringPsychologyChecklist()` trong `useTradeStore.ts`: `alert`←`restedAndFocused`; `noFomo`←`noRevengeTrading`; `slTpReady`←`planWritten`; `noLossStreak`/`dailyLossOk` **tự suy** từ journal | |
| **Hard block auto** | Loss streak lock; daily loss ≥ 3 USDT | Giống |
| **Tự động** | ⚠️ **Bán tự động** — tick checklist trong `TradeStorePanel` / `PsychologyModal`; loss/daily auto từ journal | ⚠️ |
| **Service** | `scorerV3.ts`, `scorerV4.ts`, `useTradeStore.ts` (`derivePsychology`, `computeDailyLossUsdt`) | |
| **UI** | `TradeStorePanel` (checkbox tâm lý), `PsychologyModal`, `LayerCard` | |
| **Store** | `psychologyChecklist`, `tradeJournal` / `aiTradeJournal`, `settings` | |

**Các mục checklist store (nhập tay):**

| Key store | Label (ý nghĩa) |
|-----------|-----------------|
| `restedAndFocused` | Tỉnh táo |
| `noRevengeTrading` | Không FOMO / revenge |
| `planWritten` | Đã có kế hoạch SL/TP |
| `withinDailyLossLimit` | (legacy UI; scorer dùng `computeDailyLossUsdt`) |
| `noOverLeverage` | Không quá đòn bẩy |

---

### L11 — Squeeze Risk (chỉ V4 production)

| Cột | Giá trị |
|-----|---------|
| **V3** | **Không có L11** trong `scoreAnalysisV3` |
| **V4** | **L11 Squeeze Risk** — bổ sung, **không cộng** vào tổng 15 điểm |
| **Nguồn** | Binance: funding metrics, OI history, L/S ratio, klines 1H/4H, whale walls — **OHLCV + derivatives Binance** |
| **Chỉ số** | 5 thành phần × 0–2: funding crowding, OI expansion, L/S crowding, price-OI divergence, whale wall confirmation |
| **Khung** | OI change **1H & 4H**; price change 1H/4H; funding velocity | |
| **Hàm** | `calculateSqueezeRisk()` — `squeezeRiskEngine.ts`; gọi từ `scoreAnalysisV4()` |
| **Output** | Level LOW/MEDIUM/HIGH/EXTREME; `squeezeWarning` trên `SignalRow`; không block điểm chính (trừ cảnh báo ENTRY_VALID) |
| **Tự động** | ✅ |
| **Service** | `squeezeRiskEngine.ts`, `scorerV4.ts`, `squeezeRiskUi.ts` | |
| **UI** | `L11SqueezeExpandV4` (trong `LayerCard`), `TradePlanV3View` (`squeezeWarning`), `SignalBoard` | |
| **Store** | `SignalRow.squeezeRisk`; journal không lưu riêng L11 đầy đủ | |

---

## Ma trận nguồn dữ liệu theo API

| Dữ liệu | API / Nguồn | Endpoint / Hàm | Layer dùng |
|---------|-------------|----------------|------------|
| Klines OHLCV | **Binance** | `GET /fapi/v1/klines` · `fetchKlines` | L1–L5, L11, CVD, ATR |
| Giá / 24h % | **Binance** | `fetchTickerPrice`, `fetch24hTickerChange` | L8, display |
| Open Interest | **Binance** | `fetchOIEngine` | L5, L11 |
| Funding history | **Binance** | `fetchFundingRateHistory` | L5 (order flow UI), L6, L11 |
| Long/Short ratio | **Binance** | `fetchLongShortRatio` | L7, L11 |
| Order book sâu | **Binance** | `fetchDeepOrderBook` | L7 whale walls, heatmap |
| Force orders (liq) | **Binance** | `fetchForceOrders` | Heatmap → L7 walls |
| CVD | **Tính nội bộ** | `buildCVDPointsFromKlines` (taker buy từ klines) | L5 V3 / L5a V4 |
| Session giờ VN | **Nội bộ** | `getSessionScoreV3` | L9 |
| Psychology | **User + journal** | `PsychologyChecklist` store | L10 |
| Liquidation heatmap (derivatives) | **CoinGlass** (optional) | `derivativesDataService.fetchLiquidationHeatmap` | **Không** trong scorer L1–L11 chính |
| Funding bổ sung (derivatives) | **Coinalyze / CoinGlass** | `fetchAdvancedDerivativesData` | **Không** wire scorer chính |

---

## Ma trận tự động hóa tổng hợp (L1–L11)

| Layer | V3 | V4 |
|-------|----|----|
| L1 EMA | ✅ | ✅ |
| L2 RSI | ✅ | ✅ |
| L3 MACD | ✅ | ✅ |
| L4 Bollinger | ✅ | ✅ |
| L5 flow | ✅ | ✅ (L5a + L5b) |
| L6 Funding | ✅ | ✅ |
| L7 L/S + Whale | ✅ | ✅ |
| L8 BTC | ✅ | ✅ |
| L9 Session | ✅ | ✅ |
| L10 Psychology | ⚠️ | ⚠️ |
| L11 Squeeze | — | ✅ |
| **Vào lệnh từ Signal Board** | ⚠️ (user xác nhận plan / limit) | ⚠️ |

---

## File & component theo vai trò

### Services tính toán

| File | Vai trò |
|------|---------|
| `services/scorerV3.ts` | Pipeline V3 L1–L10, quyết định, nhóm điểm |
| `services/scorerV4.ts` | Pipeline V4 L1–L10 + L11 squeeze, nhóm A/B/C |
| `services/analysisInput.ts` | Gom input từ `AllMarketData` |
| `services/indicators.ts` | EMA, RSI, MACD, BB, CVD, funding, session, heatmap, order flow |
| `services/binanceApi.ts` | Fetch REST + cache |
| `services/derivativesDataService.ts` | L11–L13 **derivatives** (Coinglass/Coinalyze) — chưa trong scorer chính |
| `services/squeezeRiskEngine.ts` | L11 Squeeze (production V4) |
| `services/signalBoardScan.ts` | Quét 4 cặp, gọi cả V3 + V4 |
| `services/whaleEntryWalls.ts` | Whale walls cho L7 |
| `services/whaleConfirmation.ts` | L7 flow + wall confirmation |
| `hooks/useMarketAnalysis.ts` | Phân tích dashboard (SMC, heatmap, order flow) |
| `constants/scoring.ts` | Tên layer, nhóm, ngưỡng hard block, funding state |

### Components hiển thị

| Component | Layer / nội dung |
|-----------|------------------|
| `components/dashboard/SignalBoard.tsx` | Tổng điểm, Final Entry, layers expand |
| `components/LayerCard.tsx` | Chi tiết L1–L10 (+ L11 expand V4) |
| `components/GroupScoreBar.tsx` | Nhóm A/B/C |
| `components/dashboard/ScorerV3DetailSection.tsx` | Mode + nhóm V3 |
| `components/dashboard/ScorerV4DetailSection.tsx` | Mode + nhóm V4 |
| `components/L6FundingExpandV4.tsx` | Chi tiết L6 funding state |
| `components/L11SqueezeExpandV4.tsx` | Chi tiết L11 squeeze |
| `components/dashboard/OrderFlowPanel.tsx` | CVD chart (liên quan L5) |
| `components/dashboard/AnalysisDashboard.tsx` | SMC + Order Flow + heatmap |
| `components/dashboard/TradeStorePanel.tsx` | Psychology checklist + scoring panel |
| `components/PsychologyModal.tsx` | Chỉnh checklist L10 |
| `components/TradePlanV3View.tsx` | Hard blocks, squeeze warning |
| `components/FinalEntryBadge.tsx` | Trạng thái vào lệnh |

### Store

| Store / persist | Nội dung liên quan scorer |
|---------------|---------------------------|
| `store/useTradeStore.ts` | `scorerVersion`, `psychologyChecklist`, journal → L10 stats, `placeOrder` |
| `services/signalBoardPersist.ts` | Cache kết quả quét Signal Board |
| `services/appPersistence.ts` | Hydrate psychology, settings |
| `constants/scoring.ts` | `STORAGE_KEYS_V3/V4`, `STORAGE_KEYS.scorerVersion` |

---

## Khác biệt V3 vs V4 (tóm tắt kỹ thuật)

| Tiêu chí | V3 | V4 |
|----------|----|----|
| Số layer chấm điểm chính | L1–L10 | L1–L10 (L5 tách 5a/5b) |
| L11 | Không | Squeeze Risk (cảnh báo) |
| Nhóm điểm | A(1–4), B(5–7), C(8–10) | A(1–4), B(5,52,6,7), C(8–10) |
| L5 CVD | Gộp với Vol/OI | L5a riêng + CVDX hard block / recovering |
| L6 | Funding % + trend | FundingState + velocity/acceleration |
| L9 xấu | Chỉ trừ điểm | Có thể **CHỜ TÁI CHẤM** (L9 hard block) |
| Tổng điểm max | 15 (quy đổi nhóm) | 15 (quy đổi nhóm) |
| UI engine toggle | Signal Board pill **V3** / **V4** | |

---

## Phụ lục: `derivativesDataService.ts` (L11–L13 derivatives — chưa production scorer)

Module này **khác** L11 Squeeze trong `scorerV4.ts`. Comment trong code: *"dùng trước khi wire vào Scorer V4"*.

| Layer (derivatives) | Nguồn | Provider | Wire scorer? |
|--------------------|-------|----------|--------------|
| L11 Liquidation risk | Heatmap thanh lý | CoinGlass (hoặc mock) | ❌ Chưa |
| L12 Funding bonus | Funding rate | Coinalyze / CoinGlass | ❌ Chưa |
| L13 Whale delta | Taker whale delta | Mock / API tùy config | ❌ Chưa |

Khi không có API key: `useMockWhenNoKey: true` → điểm 0, không crash.

---

## Tham chiếu test

| Suite | File |
|-------|------|
| V3 layers | `services/scorerV3.test.ts` |
| V4 layers + L5a CVD | `services/scorerV4.test.ts`, `services/cvdx.test.ts` |
| Indicators | `services/indicators.test.ts` |
| L11 Squeeze | `services/squeezeRiskEngine.test.ts` |
| Derivatives (chưa wire) | `services/derivativesDataService.test.ts` |
