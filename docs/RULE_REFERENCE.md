# TRADESCORE V3/V4 — RULE REFERENCE

> Ngày tạo: 2026-07-09  
> Nguồn: audit Task 1–5 (READ-ONLY) — số liệu lấy trực tiếp từ code V3/V4

---

## 1. NGƯỠNG VÀO LỆNH

Lấy từ logic quyết định trong `scoreAnalysisV3()` (`services/scorerV3.ts:870-876`) và `resolveDecision()` (`services/scorerV4.ts:999-1005`).

| Decision | Score | Constant? |
|----------|-------|-----------|
| SETUP_NGON | ≥ 11.5 | literal — **KHÔNG** đọc `SCORE_THRESHOLDS` |
| VAO_TU_TIN | ≥ 10.0 | literal |
| CO_THE_VAO | ≥ 9.0 | literal |
| CHO_THEM | ≥ 8.0 | literal |
| KHONG_VAO | < 8.0 hoặc bị block | literal |

Chỉ tính khi **không** bị hard block / group block (V3) hoặc hard block / group block / `blockReasons` (V4).

**V4 thêm:** `CHO_TAI_CHAM` — khi **chỉ** L9 phiên xấu block, điểm đủ cao nếu bỏ L9 (`scorerV4.ts:1240-1249`). `awaitingRescore=true`, `officialTotalScore=null`.

⚠️ **P0-2:** `SCORE_THRESHOLDS` (`constants/scoring.ts:267-283`) tồn tại (`CONFIDENT_MAX: 11.5`, `CAN_ENTER_MAX: 10`, `WAIT_MAX: 9`, `NO_ENTRY_MAX: 8`) nhưng **không** được `scorerV3.ts` / `scorerV4.ts` import.

---

## 2. SCORING LAYERS

**Thang điểm chung:** mỗi layer raw **min=0, max=2** (`layer()` / `layerA()` / `layerB()` / `layerC()` — `maxScore: 2`).  
**Tổng thang 15đ:** 3 nhóm × 5đ (`SCORING_GROUPS_V3` / `SCORING_GROUPS_V4`).  
**Quy đổi nhóm:** `convertToGroupScore()` / `convertToGroupScoreV4()` — `raw / rawMax × groupMax`, cap tại `groupMax`.

---

### L1 — Giá & EMA (Slope)

**File:** `scorerV3.ts:159-200` / `scorerV4.ts:217-258`  
**V3 vs V4:** **GIỐNG** (copy-identical logic)  
**Điểm raw:** min=0 max=2  
**Điều kiện (LONG):**
- 2đ: giá trên EMA20/50 cả 1H+4H **và** slope UP ít nhất 1 khung
- 1.5đ: trên EMA cả 2 khung, slope phẳng
- 1đ: pullback về EMA (`|priceVsEma20Pct| < 2` trên 1H hoặc 4H) khi 1 khung thuận
- `L1_MTF_CONFLICT_RAW` (≈1.333): mâu thuẫn 1H vs 4H
- 0đ: giá dưới tất cả EMA

**Điều kiện (SHORT):** đối xứng (dưới EMA, slope DOWN, v.v.)

**Ngưỡng có tên constant:** `L1_MTF_CONFLICT_RAW = 2 / LAYER_MAX_POINTS` (`LAYER_MAX_POINTS=1.5` → raw ≈1.333)  
**Ngưỡng magic number:** `2` (% pullback EMA — `Math.abs(ema.priceVsEma20Pct) < 2`)  
**Hard Block:** Không (chỉ `warnings` nếu `l1.score < 2`)  
**Test:** Có — `scorerV3.test.ts`, `scorerV4.test.ts` (L1 MTF conflict)  
**Export CSV:** `l1_ema`, `l1_note`  
**TODO:** Đặt constant cho ngưỡng pullback EMA 2%

---

### L2 — RSI 14 + Divergence

**File:** `scorerV3.ts:206-272` / `scorerV4.ts:260-326`  
**V3 vs V4:** **GIỐNG**  
**Điểm raw:** min=0 max=2  
**Điều kiện (LONG):**
- Sweet zone: RSI 45–65 (cả 1H+4H) → 2đ
- OK zone: 35–45 hoặc 65–75 (một khung) → 1đ
- RSI 1H < 30 + Bullish divergence → 1.5đ
- Divergence bullish + score>0 → +0.5 (cap 2)
- NaN RSI → 1đ fallback

**Điều kiện (SHORT):**
- Sweet: 35–55; OK: 25–35 hoặc 55–65
- RSI 1H > 70 + Bearish divergence → 1.5đ
- Bearish div bonus +0.5

**Ngưỡng có tên constant:** Không  
**Ngưỡng magic number:** 45/65, 35/75, 30, 70, 25, 55, +0.5 div bonus  
**Hard Block:** Không  
**Test:** Một phần — chỉ qua `scoreAnalysisV3` integration; **không** có `scoreL2` standalone  
**Export CSV:** `l2_rsi`, `l2_note`  
**TODO:** Named constants cho RSI bands; thêm vitest standalone

---

### L3 — MACD + Histogram Momentum

**File:** `scorerV3.ts:278-325` / `scorerV4.ts:328-375`  
**V3 vs V4:** **GIỐNG**  
**Điểm raw:** min=0 max=2  
**Điều kiện (LONG):** h1>0 && h4>0 → 2; zero cross up → 1.5; turning up combos → 1–1.5; 1 khung thuận → 1; cả 2 âm → 0  
**Điều kiện (SHORT):** h1>0 && h4>0 → 0 (VI PHẠM); h1<0 && h4<0 → 2; zero cross down / turning down → 1–1.5

**Ngưỡng có tên constant:** Không (logic dấu histogram)  
**Hard Block:** `l3.score < 1` → `hardBlocks.push('L3 MACD vi phạm — …')` (V3:801-803, V4:1153-1155)  
**Test:** Có — `scorerV3.test.ts`, `scorerV4.test.ts` (SHORT histogram)  
**Export CSV:** `l3_macd`, `l3_note`

---

### L4 — Bollinger %B + Bandwidth

**File:** `scorerV3.ts:331-392` / `scorerV4.ts:377-438`  
**V3 vs V4:** **GIỐNG**  
**Điểm raw:** min=0 max=2  
**Điều kiện:** Phụ thuộc `marketMode` (TRENDING/RANGING) và `%B` bands — xem code cho từng band:
- LONG TRENDING: 60–90→2, 40–60→1.5, 20–40→0.5
- LONG RANGING: 35–55→2, 55–70→1, 20–35→1
- SHORT TRENDING: 10–40→2, 40–60→1.5, >70→0
- SHORT RANGING: <30→0, >80→0, 45–65→2, 30–45/65–80→1

**Ngưỡng magic number:** 10/20/30/35/40/45/55/60/65/70/80/90  
**Hard Block:** Không  
**Test:** Có — `scorerV3.test.ts`, `scorerV4.test.ts`  
**Export CSV:** `l4_bb`, `l4_note`  
**TODO:** Named constants cho %B bands

---

### L5 — Volume / OI / CVD

**File V3:** `scorerV3.ts:412-483` (gộp Vol+OI+CVD)  
**File V4:** `scorerV4.ts:444-568` (L5a CVD) + `574-623` (L5b Vol/OI, `layerNumber=52`)

**V3 vs V4:** **KHÁC**
- **V3:** một layer id=5 — Vol (≥1.5×→+1, ≥1.2×→+0.5), OI deltas (+1/0.3/-0.5), CVD aligned (+1); CVD divergence ngược → **score=0** (không hard block)
- **V4 L5a:** CVD strength bắt buộc; hard block CVD (LONG: `evaluateLongCvdHardBlock`, SHORT: CVD > +2M); `raw < 1` → `blockReasons` (không `hardBlocks`)
- **V4 L5b:** chỉ Vol/OI (logic giống phần Vol/OI V3), `LAYER_L5B_ID=52`

**Điểm raw:** min=0 max=2 (mỗi sub-layer V4)  
**Ngưỡng có tên constant (V4):** `HARD_BLOCK_RULES_V4.CVD_*`, `CVD_STEEP_SLOPE_DELTA`, `CVD_RECOVERING_SCORE_PENALTY`  
**Ngưỡng magic number (V3/V4 Vol/OI):** vol 1.2/1.5, OI score 1/0.3/-0.5, lookback CVD divergence 12 nến  
**Hard Block (V4 L5a):** CVD LONG (`evaluateLongCvdHardBlock` — STRONG_BEARISH + price < EMA20); CVD SHORT > `CVD_SHORT_HARD_BLOCK` (+2M)  
**Score Block (V4 only):** L5a raw < 1 → `blockReasons` (`scorerV4.ts:1181-1182`)  
**Test:** Có — `scorerV3.test.ts` (CVD div), `scorerV4.test.ts` (L5a/L5b), `cvdx.test.ts`  
**Export CSV:** `l5_volume`, `l5_note` — **chỉ layer id 5 (L5a V4 / L5 gộp V3)**; L5b **chưa export**  
**TODO:** Export `l5b_*`; named constants vol/OI tiers

---

### L6 — Funding Rate

**File V3:** `scorerV3.ts:501-574`  
**File V4:** `scorerV4.ts:629-803` (`scoreL6V4`, `scoreL6V4Legacy`, `FundingState` maps)

**V3 vs V4:** **KHÁC**
- **V3:** tier theo `currentRate` và `trend` — magic `0.005`, `0.01`; max raw **2**
- **V4 (có `fundingMetrics`):** `classifyFundingState()` → `LONG_L6_BY_STATE` / `SHORT_L6_BY_STATE`; max raw **2** (`L6_RAW_MAX`)
- **V4 fallback** (không metrics): `scoreL6V4Legacy` — cùng tier 0.005/0.01 nhưng **max raw 1** (`layerB(6, score, 1)`)

**FundingState maps (V4):** LONG: SHORT_SQUEEZE_BUILDING→2, SHORT_EUPHORIA_FADING→1.5, NEUTRAL→1, LONG_EUPHORIA_FADING→0.5, EXTREME_LONG_EUPHORIA→0  
**Hard Block (cả V3+V4):** `extremeRisk === LONG_SQUEEZE` (rate > 0.03%) chặn LONG; `SHORT_SQUEEZE` (< -0.03%) chặn SHORT — từ `getFundingAnalysisV3()` (`indicators.ts:1597`) dùng `HARD_BLOCK_RULES_* .FUNDING_*_SQUEEZE_PCT`  
**Ngưỡng có tên constant:** `FUNDING_STATE_THRESHOLDS`, `FUNDING_LONG/SHORT_SQUEEZE_PCT`  
**Test:** Có — `scorerV4.test.ts` (FundingState + fallback + squeeze HB)  
**Export CSV:** `l6_funding`, `l6_note`  
**TODO:** Wire `l6_scoring_path` (V4_STATE / V4_LEGACY / V3_TIER) vào export

---

### L7 — L/S Ratio + Whale Wall

**File:** `scorerV3.ts:580-613` / `scorerV4.ts:809-843`  
**V3 vs V4:** **GIỐNG** (cùng `scoreL7FlowWithWhaleConfirmation`)  
**Điểm raw:** min=0 max=2 — flow score từ whale confirmation  
**Hard Block:** Không (L/S extreme chỉ **warning**)  
**Warning:** `LS_RATIO_EXTREME_HIGH` (>3.0) / `LOW` (<0.5) — `HARD_BLOCK_RULES_V3/V4`  
**Test:** Một phần — `whaleConfirmation.test.ts`; **không** L7 standalone trong scorer tests  
**Export CSV:** `l7_ls_ratio`, `l7_note`

---

### L8 — BTC 24h + 1H Momentum

**File:** `scorerV3.ts:619-695` / `scorerV4.ts:848-924`  
**V3 vs V4:** **GIỐNG**  
**Điểm raw:** min=0 max=2  
**Hard Block:** `BTC_EXTREME_PCT` (|24h|>8%), `BTC_LONG_BLOCK_PCT` (≤-2% chặn LONG), `BTC_SHORT_BLOCK_PCT` (≥+2% chặn SHORT)  
**Soft scoring magic:** `change1h` thresholds ±0.3, `change24h` ±0.5  
**Test:** Không standalone — chỉ qua integration  
**Export CSV:** `l8_btc`, `l8_note`  
**TODO:** vitest L8 standalone

---

### L9 — Phiên giao dịch

**File:** `scorerV3.ts:701-704` / `scorerV4.ts:926-929` (cùng `getSessionScoreV3()`)  
**V3 vs V4:** **GIỐNG** scoring; **V4 khác** xử lý block → `CHO_TAI_CHAM` khi chỉ L9 block  
**Session rules:** `SESSION_RULES_V3` (`constants/scoring.ts:561-604`) — London Open/NY Peak 2đ, Overlap 1.5đ, Lunch 1đ, NY Close 1đ, Asia Dead 0đ  
**Hard Block:** `l9.score < 0.5` → `L9 Phiên xấu` (V3:840-842, V4:1203-1206)  
**Test:** Không đầy đủ standalone  
**Export CSV:** `l9_session`, `l9_note`

---

### L10 — Tâm lý & Kỷ luật

**File:** `scorerV3.ts:710-765` / `scorerV4.ts:943-997`  
**V3 vs V4:** **GIỐNG**  
**Checklist:** 5 mục `PSYCHOLOGY_CHECKLIST_V3_ITEMS`  
**Điểm:** 5/5→2, 4/5→1.5, ≥3→1, ≥2→0.5  
**Win streak:** `WIN_STREAK_CONFIG.warningThreshold=4` → trừ 0.5đ + warning  
**Hard Block (active):** `l10.score < 1` → `L10 Tâm lý chưa sẵn sàng` (V3:843-845, V4:1207-1209)  
**Hard Block COMMENT OUT (TODO PRODUCTION):** loss streak ≥3/24h + cooldown 180'; daily loss ≥3 USDT — **TẮT** cả V3+V4 (`scorerV3.ts:715-737`, `scorerV4.ts:948-969`)  
**Test:** Không (HB production chưa test)  
**Export CSV:** `l10_psychology`, `l10_note`  
**TODO:** Bật lại HB production; export `l10_hb_active`

---

### L11 — Squeeze Risk (V4 only)

**File:** `scorerV4.ts:1307-1318` → `calculateSqueezeRisk()` (`squeezeRiskEngine.ts`)  
**V3 vs V4:** **Chỉ V4** — **KHÔNG cộng** vào thang 15đ (`ScoringResultV4.squeezeRisk` riêng)  
**Score:** 0–10 (`resolveLevel`: ≥9 EXTREME, ≥6 HIGH, ≥3 MEDIUM, else LOW)  
**Export CSV:** `l11_squeeze` (= `squeezeRisk.score`), `l11_note` (= reasons)  
**Test:** Có — `squeezeRiskEngine.test.ts`  
**Hard Block:** Không trực tiếp trong scorer (ảnh hưởng Plan Health / PA)

---

## 3. HARD BLOCK RULES

### 3.1 Hard Block thật sự

| Rule | Ngưỡng | Constant / Nguồn |
|------|--------|------------------|
| BTC extreme | \|24h\| > 8% | `HARD_BLOCK_RULES_V3/V4.BTC_EXTREME_PCT` |
| BTC LONG block | 24h ≤ -2% | `BTC_LONG_BLOCK_PCT` |
| BTC SHORT block | 24h ≥ +2% | `BTC_SHORT_BLOCK_PCT` |
| Funding LONG squeeze | rate > 0.03% | `FUNDING_LONG_SQUEEZE_PCT` / `getFundingAnalysisV3` |
| Funding SHORT squeeze | rate < -0.03% | `FUNDING_SHORT_SQUEEZE_PCT` |
| L3 MACD LONG | h1≤0 && h4≤0 (score<1) | logic dấu |
| L3 MACD SHORT | h1>0 && h4>0 (score=0 VI PHẠM) | logic dấu |
| L9 session xấu | score < 0.5 | `getSessionScoreV3` |
| L10 psychology | score < 1 (không HB khác) | checklist |
| ADX bothChoppy | cả 1H+4H ADX < 15 | `ADX_CHOPPY_THRESHOLD` local trong `indicators.ts:2021` |
| L/S ratio | warning only (không HB scorer) | `LS_RATIO_EXTREME_HIGH/LOW` |

**V4 thêm:**

| Rule | Điều kiện | Constant |
|------|-----------|----------|
| CVD LONG HB | STRONG_BEARISH + price < EMA20 | `evaluateLongCvdHardBlock` |
| CVD SHORT HB | CVD > +2M | `CVD_SHORT_HARD_BLOCK` |

⚠️ `ADX_THRESHOLDS` trong `constants/scoring.ts:1125-1129` (**15/25/35**) — `indicators.ts` dùng **local const** cùng giá trị, **không import** `ADX_THRESHOLDS`. `adxGate.ts` cũng **không** import.

### 3.2 Score Block (`blockReasons` — V4 only)

| Rule | Điều kiện |
|------|-----------|
| L5a CVD | `layerResult.score < 1` và không hard block → `blockReasons` (**không** `hardBlocks`) |

### 3.3 Group Block

| Group | Min required | Constant |
|-------|-------------|----------|
| A (Trend) | 2.5/5đ | `SCORING_GROUPS_V3/V4.GROUP_A_TREND.minRequired` |
| B (Flow) | 2.0/5đ | `GROUP_B_FLOW.minRequired` |
| C (Risk) | 2.0/5đ | `GROUP_C_CONTEXT.minRequired` |

**V4 Group B rawMax=8** (L5a+L5b+L6+L7); **V3 rawMax=6** (L5+L6+L7).

### 3.4 Hard Block COMMENT OUT (TODO PRODUCTION)

| Rule | Điều kiện | Status |
|------|-----------|--------|
| Loss streak | ≥3 lệnh thua/24h → cooldown 180' | **TẮT** V3+V4 |
| Daily loss | ≥3 USDT/ngày → block | **TẮT** V3+V4 |

Constants: `MAX_CONSECUTIVE_LOSSES: 3`, `MAX_DAILY_LOSS_USDT: 3`, `LOSS_STREAK_LOCK_MINUTES: 180`

---

## 4. ADX GATE

`evaluateADXGate()` — `services/adxGate.ts` (không import `ADX_THRESHOLDS` từ `scoring.ts`).

| Regime / Condition | ADX | SL mult | TP mult | Severity |
|--------------------|-----|---------|---------|----------|
| BLOCK | `bothChoppy` (1H+4H < 15) | 1.0 | 1.0 | BLOCK |
| WARNING mixed TF | 1 TF choppy | ×1.1 | ×0.9 | WARNING |
| WARNING RANGING | regime=RANGING | ×1.1 | ×0.85 | WARNING |
| OK TRENDING weak | regime=TRENDING | ×1.0 | ×1.0 | OK |
| BONUS TRENDING STRONG | TRENDING + strength STRONG | ×0.9 | ×1.2 | BONUS |

**Regime từ `getADXAnalysis()`:** CHOPPY <15, RANGING 15–25, TRENDING 25–35 weak, STRONG ≥35 (`indicators.ts:2066-2077`).

⚠️ Multipliers **magic inline** trong `adxGate.ts` — chưa named constants.  
**Test:** Có — `adxGate.test.ts`

---

## 5. STRUCTURE SL

| Param | Giá trị | Constant | Ghi chú |
|-------|---------|----------|---------|
| Lookback default | 20 nến 4H | `STRUCTURE_SL_DEFAULTS.LOOKBACK_CANDLES` | |
| Lookback ADX | ADX≥35→40, ≥25→30, else 20 | literals trong `resolveStructureSlLookback()` | **không** dùng `ADX_THRESHOLDS` |
| MIN_CANDLES_BACK | 3 (ADX≥35 → 2) | `MIN_CANDLES_BACK` / `resolveStructureSlMinCandlesBack` | |
| Buffer | 0.3% | `BUFFER_PCT` | dưới/trên swing |
| Cap % | 3.5% | `MAX_STRUCTURE_SL_PCT` | từ entry |
| Cap ATR | 4.0× | `MAX_STRUCTURE_SL_ATR` | từ entry |
| Swing neighbor | 2 bars | `SWING_NEIGHBOR_BARS` | |

**`structure_candles_back` (export):** khoảng cách swing → nến hiện tại — **không** phải lookback config.

**Test:** Có — `structureSL.test.ts`

---

## 6. VWAP

| Zone / Signal | Điều kiện | Entry quality |
|---------------|-----------|---------------|
| NEAR_VWAP | \|price−VWAP\| ≤ 0.5% | IDEAL |
| Pullback to VWAP | 0.5% < \|diff\| ≤ 2% + hướng pullback | GOOD |
| BELOW_BAND2 (LONG) / ABOVE_BAND2 (SHORT) | ngoài 2σ | POOR |
| Else | trong bands | NEUTRAL |

**Constants:** `VWAP_DEFAULTS.NEAR_THRESHOLD_PCT=0.5`, `PULLBACK_THRESHOLD_PCT=2.0`, `MIN_CANDLES=5`

**Bonus L5:** `calculateVWAPBonus()` — +0.5 raw max khi `isNearVwap` + CVD đúng hướng + headroom L5 (`vwapBonus.ts`, `BONUS_AMOUNT=0.5`)

**Test:** Có — `vwapService.test.ts`, `tradePlanV3.vwap.test.ts`

---

## 7. ENTRY PATIENCE & SL MULTIPLIER

Từ `TRADE_PLAN_V3_CONFIG` (`constants/scoring.ts:875-931`):

| Decision | Patience % | SL ATR× |
|----------|-----------|---------|
| SETUP_NGON | 0.2% | 1.5× |
| VAO_TU_TIN | 0.4% | 2.0× |
| CO_THE_VAO | 0.6% | 2.5× |
| CHO_THEM | 1.0% | 3.0× |

**marketMode:** TRENDING `slFactor=0.9`, `tpFactor=1.2`; RANGING `slFactor=1.1`, `tpFactor=0.8`

**SL quality** (`tradePlanV3.ts:734-736`): `<1.2×ATR` → TIGHT; `>3×` → WIDE; else NORMAL

**V4 CVD SL tighten** (`TRADE_PLAN_V4_CONFIG` + `resolveV4SlMultiplier`):
- `CVD_SL_TIGHTEN = 0.3`
- Profile `CVD_DOMINANT` khi: decision `VAO_TU_TIN`/`SETUP_NGON` **AND** GroupA ≤ `GROUP_A_NEAR_MIN_MAX` (2.8) **AND** L5a raw ≥ `L5A_STRONG_RAW_MIN` (1.5)
- Profiles: `TREND_DOMINANT` (GroupA≥4.5, L5a≤1.25), `BALANCED` (cả hai mạnh)

---

## 8. RR TARGETS

⚠️ **P0-1:** `TRADE_PLAN_V3_CONFIG.RR_TARGETS` (theo decision, tp1 2.0–2.0, tp3 3.0–5.0) — **dead path** khi production truyền `fixedRrTargets`.

**Production** (`tradePlanV3.ts:627`, `tradePlanV4.ts:291` → `constants/capitalManagement.ts:11-15`):

| TP | R:R |
|----|-----|
| TP1 | 2.0× |
| TP2 | 3.0× |
| TP3 | 4.5× |

---

## 9. DIRECTION SELECTION

**V3** — `suggestDirectionV3()` (`scorerV3.ts:937-944`): rules #1, #2, #5, #6, #7  
**V4** — `suggestDirectionV4()` (`scorerV4.ts:1334-1345`): thêm #3, #4

| # | Điều kiện | V3 | V4 |
|---|-----------|----|----|
| 1 | Long có hardBlocks, Short không → SHORT | ✓ | ✓ |
| 2 | Short có hardBlocks, Long không → LONG | ✓ | ✓ |
| 3 | Long `awaitingRescore`, Short không → SHORT | — | ✓ |
| 4 | Short `awaitingRescore`, Long không → LONG | — | ✓ |
| 5 | Long KHONG_VAO, Short khác → SHORT | ✓ | ✓ |
| 6 | Short KHONG_VAO, Long khác → LONG | ✓ | ✓ |
| 7 | longScore ≥ shortScore → LONG (tie → LONG) | ✓ | ✓ |

V4 score: `officialTotalScore ?? referenceTotalScore`

---

## 10. AMBIGUOUS DIRECTION

`services/directionAmbiguity.ts`

| Param | Giá trị | Constant |
|-------|---------|----------|
| Threshold | 1.0đ chênh lệch | `AMBIGUOUS_THRESHOLD` |
| Vào AMBIGUOUS | `scoreDiff < 1.0` trong ≥2 scan liên tiếp | `consecutiveAmbiguousCount ≥ 2` |
| Thoát AMBIGUOUS | `scoreDiff ≥ 1.0` trong ≥2 scan | `consecutiveClearCount ≥ 2` |

⚠️ **Không có** `directionAmbiguity.test.ts`

---

## 11. CAPITAL MANAGEMENT

`constants/capitalManagement.ts` — `CAPITAL_RATIOS`:

| Param | Giá trị |
|-------|---------|
| Size per trade | 17.65% vốn (`sizePercent: 0.1765`) |
| Max loss per trade | 25% size (`maxLossPerTrade: 0.25`) ≈ 4.4% vốn |
| Max loss per day | 50% size (`maxLossPerDay: 0.5`) |
| Leverage | 5× |
| Milestone growth | 30% (`milestoneGrowth: 0.3`) |

---

## 12. PLAN EXPIRY

`services/tradePlanExpiry.ts` — `PLAN_EXPIRY_CONFIG`:

| Tier | Score min (config) | TTL | Logic thực tế `calculatePlanExpiry()` |
|------|-------------------|-----|--------------------------------------|
| HIGH | ≥ 13.0 | 12h | `score >= 13` |
| MEDIUM | ≥ 11.0 | 8h | `score >= 11` |
| LOW | 9.0 (defined) | 4h | **mọi score < 11** (LOW.minScore **không** được check) |

Chỉ gắn expiry khi plan valid (`resolvePlanExpiryOutput`).

---

## 13. POSITION ADVISOR

### 13.1 Rules V3 (core — V4 dùng chung matrix)

`services/positionAdvisorV3.ts` — priority sort descending:

| Priority | Type | Điều kiện chính | Magic? |
|----------|------|----------------|--------|
| 100 | CLOSE_URGENT | hardBlocks chứa BTC/Funding/squeeze | needle strings |
| 95 | CLOSE_NOW | `groupBlocks.length > 0` | — |
| 90 | CLOSE_URGENT | L8 ≤ 0 (BTC reversal) | — |
| 85 | CLOSE_REVERSE / CLOSE_NOW | opposite score ≥ 11.0 (10.0 nếu đang CLOSE_REVERSE) | 10/11 |
| 80 | PARTIAL_TP1 / CLOSE_NOW | CVD divergence + dist TP1 | 70% dist |
| 60 | PARTIAL_TP2 / PARTIAL_TP1 | dist ≥ 100% TP1; TP2 ≥ 80% | 80/100% |
| 50 | PARTIAL_TP1 | dist ≥ 50% TP1 + score < 8 | 50% |
| 40 | HOLD_MOVE_SL | dist ≥ 60% TP1 + 1.5R + PnL>0 | 60%, 1.5R |
| 20 | HOLD | score ≥ 9.0 (8.5 nếu đang HOLD) | 8.5/9.0 |
| 10 | HOLD | score ≥ 7.0 (6.5 nếu đang HOLD) | 6.5/7.0 |
| 0 | HOLD (fallback) | always | — |

Light loss threshold opposite strong: `maxLoss × 0.3` (`positionAdvisorV3.ts:1778`)

### 13.2 Rules thêm V4 (`positionAdvisorV4.ts`)

| Priority | Type | Điều kiện |
|----------|------|-----------|
| 75 | FUNDING_REVERSAL | FundingState transition 2-scan |
| 70 | SQUEEZE_RISK_ALERT | Squeeze HIGH → EXTREME escalation |

### 13.3 V4 điều chỉnh so với V3

| Rule | V3 | V4 |
|------|----|----|
| HOLD_STRONG threshold | 8.5/9.0 cố định | ADX CHOPPY→9.5; TRENDING STRONG→8.5 (khi chưa HOLD) |
| MOVE_SL_BE | dist ≥ 60% TP1 | ADX TRENDING STRONG → 50% |

### 13.4 Plan Health (liên quan PA — `planHealth.ts`)

Penalties: SQUEEZE_EXTREME −30, CVD_DIVERGENCE −25, FUNDING_REVERSAL −20, MACD_REVERSAL −20, RSI_EXTREME −15  
Status: ≤25 CRITICAL, ≤55 WEAK, ≤85 NORMAL, else STRONG  
autoCancel: ≥3 tín hiệu đồng thời **hoặc** CRITICAL

**Test:** Có — `planHealth.test.ts`

---

## 14. GAPS & TODO (từ audit Task 1–5)

### 14.1 Magic numbers cần đặt tên constant (ưu tiên cao)

- L1: 2% EMA pullback threshold
- L2: RSI bands (45/65, 35/55, 30, 70, 25, 75)
- L4: %B bands (60/90, 40/60, 20/40, 35/55, v.v.)
- L5 V3/V4: vol 1.2/1.5, OI score deltas 1/0.3/0.5
- L6 V3/V4 fallback: rate tiers 0.005/0.01
- L8: soft 0.3/0.5 BTC momentum
- L10: checklist counts 5/4/3/2
- ADX gate multipliers: 0.85/0.9/1.2 TP; 0.9/1.1 SL
- Structure SL ADX map: 35/25/40/30
- PA thresholds: 8.5/9.0/9.5/6.5/7.0/10.0/11.0
- PA distance: 50/60/70% TP1; 1.5R; 0.3×maxLoss
- Plan Health: 25/55/85 status; −30/−25/−20/−15 penalties
- Squeeze levels: ≥9/6/3
- SL quality: 1.2×/3× ATR
- ThesisState (PA): 80/65/40

### 14.2 Rules không nhất quán V3/V4 cần review (P0)

- **P0-1:** RR dynamic `TRADE_PLAN_V3_CONFIG.RR_TARGETS` dead code — production `fixed_RR_TARGETS` 2.0/3.0/4.5
- **P0-2:** `SCORE_THRESHOLDS` không dùng cả V3+V4
- **P0-3:** L10 HB (loss streak / daily loss) comment out cả V3+V4
- **P0-4:** L6 V4 fallback max raw **1** vs V3/V4 FundingState max raw **2**
- **P0-5:** L5 V3 divergence → score=0 vs V4 L5a → `blockReasons`

### 14.3 Rules chưa có test vitest đầy đủ

- L2 RSI standalone
- L7 L/S standalone (chỉ whaleConfirmation)
- L8 BTC standalone
- L9 Session standalone đầy đủ
- L10 checklist + HB production
- SL quality TIGHT/NORMAL/WIDE (một phần trong vwap test)
- Direction Ambiguity (`directionAmbiguity.test.ts` — **không tồn tại**)

### 14.4 Chưa export signal (Task 6b)

- `final_entry_status` (5 giá trị `FinalEntryStatus`)
- `decision_band`, `direction_active`
- `ambiguity_status`, `ambiguity_score_diff`
- `sl_quality`, `sl_atr_distance`, `sl_profile_v4`
- `entry_quality`, `rr_after_structure`
- `l5b_score`, `l5b_note`, `l5_block_path`
- `l6_scoring_path`, `l10_hb_active`
- `plan_expiry_tier`, `structure_lookback_config`
- `score_thresholds_source`, `rr_config_source`

**Export hiện tại:** 61 cột — `services/exportService.ts` (`buildExportRow`, `CSV_COLUMNS`). `finalDecision` = 3 giá trị (`VÀO|CHỜ|KHÔNG VÀO`) từ `mapFinalDecision(FinalEntryStatus)`.

---

## PHỤ LỤC — ĐẾM TỔNG HỢP

### Số rule đã document

| Nhóm | Số lượng |
|------|----------|
| Ngưỡng decision | 5 |
| Scoring layers L1–L11 | 11 |
| Hard block rules (active) | 12 |
| Score block (V4) | 1 |
| Group block min | 3 |
| HB comment out | 2 |
| ADX gate regimes | 5 |
| Structure SL params | 7 |
| VWAP zones/signals + bonus | 6 |
| Entry patience + SL ATR tiers | 8 |
| RR production targets | 3 |
| Direction waterfall | 7 |
| Ambiguity hysteresis | 3 |
| Capital ratios | 5 |
| Plan expiry tiers | 3 |
| Position Advisor rules (V3+V4) | 13 |
| Plan Health penalties | 5 |
| **Tổng rule entries** | **~86** |

### Số TODO / gap

| Loại | Số lượng |
|------|----------|
| Magic number groups (§14.1) | 15 |
| P0 drift items (§14.2) | 5 |
| Test gaps (§14.3) | 7 |
| Export gaps Task 6b (§14.4) | 18 |
| **Tổng TODO/gap** | **45** |

### Task 6b — phân loại export (từ Task 5)

- 🟢 READY: **16** cột (chỉ sửa `exportService.ts`)
- 🟡 NEED_WIRE: **4** (`sl_cap_applied`, `entry_path`, `vwap_sl_recalc`, `direction_suggest_rule`)
- 🔴 COMPLEX: **0**

---

*Tài liệu này chỉ phản ánh code tại thời điểm audit. Không thay thế vitest — khi code đổi, cập nhật từ source truth.*
