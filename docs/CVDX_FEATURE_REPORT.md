# Báo cáo chức năng CVDX

**Ngày:** 2026-06-29  
**Ghi chú tên:** Trong codebase tên chính thức là **CVDX** (Cumulative Volume Delta — mở rộng). Không có module tên `VCDX`.

---

## 1. CVDX là gì?

**CVDX** là lớp logic **CVD nâng cao** gắn vào **Scorer V4 — L5a (CVD Strength)**, không phải engine chấm điểm riêng biệt trên UI.

| Khía cạnh | Mô tả |
|-----------|--------|
| **Vị trí code** | `services/indicators.ts` (phân loại trạng thái CVD) + `services/scorerV4.ts` (`scoreL5aV4`) |
| **Test** | `services/cvdx.test.ts` — 3 case A/B/C |
| **Engine UI** | Người dùng chọn **V4** trên Bảng tín hiệu; CVDX chạy ngầm trong L5a |
| **Journal `strategySource`** | Enum: `'V3' \| 'V4' \| 'CVDX' \| 'MANUAL'` — hiện tại vào lệnh từ Signal Board ghi **`V4`**, không ghi `CVDX` |
| **Khác biệt `CVDX` vs `V4` trong journal** | Chỉ khi `strategySource === 'CVDX'`: nhãn khuyến nghị LONG có thể là **`RECOVERING LONG x/15`** thay vì `STRONG LONG` |

**Tóm lại:** CVDX = quy tắc CVD sâu (deep negative, recovering, hard block) trong pipeline V4. UI engine vẫn hiển thị **V4**; nhãn **CVDX** chủ yếu dùng trong schema journal / migration / test.

---

## 2. Luồng dữ liệu

```
Binance klines 1H (~220 nến)
        │
        ▼
buildCVDPointsFromKlines()          ← indicators.ts
  (bar delta → CVD tích lũy)
        │
        ▼
analyzeCVD()                        ← slope, divergence, cvdMomentum24h
        │
        ├── classifyCvdState()      ← STRONG_BEARISH / RECOVERING / BEARISH / NEUTRAL
        ├── evaluateLongCvdHardBlock()
        └── applyRecoveringCvdLocalPenalty()
        │
        ▼
scoreL5aV4()                        ← scorerV4.ts L5a (0–2 điểm raw)
        │
        ▼
scoreAnalysisV4()                   ← gộp L1–L10, hardBlocks, warnings
        │
        ├── signalBoardScan.ts      → SignalRow (cvdValue, cvdTrend, v4 snapshot)
        ├── journalService.ts       → market.cvdValue, market.cvdTrend khi vào lệnh
        └── positionAdvisorV3.ts    → rule CVD_DIVERGENCE khi đang giữ lệnh
```

**Momentum 24h:** `currentCvd − cvd[24 nến 1H trước]` (`CVD_MOMENTUM_24H_BARS = 24`).

**CVD tích lũy:** Từ `takerBuyVolume` / volume trên mỗi nến 1H (`calculateBarDelta` → `calculateCVD`).

---

## 3. Phân loại trạng thái CVD (`classifyCvdState`)

**Ngưỡng deep negative:** `currentCvd < -20_000_000` (`CVD_STATE_DEEP_NEGATIVE`)

| Trạng thái | Điều kiện |
|------------|-----------|
| **RECOVERING** | Deep negative **và** `cvdMomentum24h > +3_000_000` |
| **STRONG_BEARISH** | Deep negative **và** `cvdMomentum24h < -3_000_000` |
| **BEARISH** | Deep negative, momentum trong khoảng `[-3M, +3M]` |
| **NEUTRAL** | `currentCvd ≥ -20M` (không deep negative) |

*Enum nội bộ còn BULLISH / STRONG_BULLISH — chưa dùng trong CVDX hiện tại.*

---

## 4. Quy tắc chấm điểm L5a (`scoreL5aV4`)

### 4.1 Hard block

| Hướng | Điều kiện | Thông báo |
|-------|-----------|-----------|
| **LONG** | `STRONG_BEARISH` **và** `currentPrice < ema20` | `CVD deeply negative and still deteriorating.` |
| **SHORT** | `currentCvd > +2_000_000` | `CVD +X.XXM > +2M — chặn Short hoàn toàn` |

Hard block → `hardBlocks[]` → **HARD BLOCK 🚫** trên Signal Board / Trade Plan.

### 4.2 Chấm điểm thường (0–2 raw, nhóm B)

**LONG:**

| Điểm | Điều kiện |
|------|-----------|
| **2** | CVD dương + slope `up` |
| **1** | CVD âm nhẹ (`≥ -500K` và `≤ 0`) nhưng đang cải thiện |
| **0** | CVD âm sâu (`< -500K`) hoặc slope âm dốc |

**SHORT:** Đối xứng (CVD âm + slope down = 2; dương nhẹ yếu dần = 1; …).

**Ngưỡng phụ** (`HARD_BLOCK_RULES_V4`):

- `CVD_MILD_NEGATIVE`: -500_000  
- `CVD_MILD_POSITIVE`: +500_000  
- `CVD_STEEP_SLOPE_DELTA`: ±200_000 (12 nến lookback)

### 4.3 Cảnh báo phân kỳ

Khi giá và CVD diverge ngược hướng lệnh:

- LONG: `⚠️ CVD phân kỳ giảm — cảnh báo bull trap`
- SHORT: `⚠️ CVD phân kỳ tăng — cảnh báo bear trap / sắp bounce`

### 4.4 Penalty RECOVERING (đặc trưng CVDX)

Khi `classifyCvdState === RECOVERING`:

| Hiệu ứng | Giá trị |
|----------|---------|
| Trừ điểm L5a | **-1** (`CVD_RECOVERING_SCORE_PENALTY`) |
| Soft warning | `CVD deeply negative but recovering. Confidence slightly reduced.` |
| Hard block | **Không** (khác CASE A STRONG_BEARISH) |

### 4.5 Bắt buộc L5a

Trong `scoreAnalysisV4`: nếu `L5a score < 1` và không hard block CVD:

```
L5a CVD chưa đủ 1đ — {reason}
```

→ Đưa vào `hardBlocks` → chặn vào lệnh.

---

## 5. Ba case chuẩn (test `cvdx.test.ts`)

### CASE A — STRONG_BEARISH + hard block

- `currentCvd = -25M`, `cvdMomentum24h = -5M`, giá dưới EMA20  
- **Kết quả:** Hard block Long, L5a = 0  
- **UI:** `HARD BLOCK 🚫` + subtitle CVD deteriorating

### CASE B — RECOVERING + penalty

- `currentCvd = -25M`, `cvdMomentum24h = +6M`  
- **Kết quả:** Không hard block; warning recovering; L5a bị **-1**  
- **Journal (nếu `strategySource=CVDX`):** `RECOVERING LONG 9.5/15` (ví dụ)

### CASE C — NEUTRAL (hành vi cũ giữ nguyên)

- `currentCvd = -5M`, `cvdMomentum24h = 0`  
- **Kết quả:** NEUTRAL; không hard block; không recovering penalty  
- L5a có thể = 0 với lý do `CVD âm sâu` (theo ngưỡng mild)

---

## 6. Cách hiển thị trên UI

### 6.1 Màn Phân tích — `OrderFlowPanel`

**File:** `components/dashboard/OrderFlowPanel.tsx`  
**Vị trí:** `AnalysisDashboard` — cạnh SMC panel

| Thành phần | Nội dung |
|------------|----------|
| Tiêu đề | `Dòng lệnh & CVD` |
| Biểu đồ | `CVDChart` — đường CVD tích lũy (~90px) |
| Chỉ số | CVD hiện tại, ΔOI, tốc độ funding |
| Phân kỳ | Loại (tăng/giảm/không) + mô tả tiếng Việt |
| Regime pill | LONG_SQUEEZE_RISK, ACCUMULATION, … |

*Đây là **trực quan hóa** CVD; quyết định vào lệnh dùng L5a trong V4 scorer.*

### 6.2 Bảng tín hiệu — Signal Board (engine V4)

**File:** `components/dashboard/SignalBoard.tsx`

| Thành phần | CVDX / CVD liên quan |
|------------|----------------------|
| Toggle engine | Pill **V3** / **V4** — CVDX chỉ active khi chọn **V4** |
| `FinalEntryBadge` | `HARD BLOCK 🚫` + dòng đầu `hardBlockReasons` (vd. CVD deteriorating) |
| `TradePlanV3View` | Danh sách `hardBlockReasons` — CVD hiện cùng BTC, Funding, L9… |
| `GroupScoreBar` | Nhóm **B — Dòng tiền & Thanh khoản** (L5a+L5b+L6+L7) |
| `LayerCard` mở rộng | **L5 — L5a CVD Strength**: thanh điểm + `reason` (vd. recovering warning) |
| Viền thẻ | Đỏ khi `FinalEntryStatus.HARD_BLOCKED` do CVD |

`strategySource` khi xác nhận lệnh: **`V4`** (từ `vi.signalBoard.scorerV4`), không phải chuỗi `CVDX`.

### 6.3 Màn Chấm điểm chi tiết

**File:** `App.tsx` + `ScorerV4DetailSection.tsx`

- Badge **V4**, chế độ TRENDING/RANGING  
- `GroupScoreBar` nhóm A/B/C  
- Layer list qua `LayerCard` (khi bật panel Phase 4 / AI tùy cấu hình `ScoringVisibilityBar`)

### 6.4 Nhật ký (Journal)

**File:** `components/journal/JournalTradeTable.tsx`

| Cột / field | Hiển thị |
|-------------|----------|
| **SOURCE** | `entry.strategySource` — `V3`, `V4`, `CVDX`, `MANUAL` |
| **KHUYẾN NGHỊ** | `recommendationLabel` — với `CVDX` + recovering: `RECOVERING LONG x/15` |
| **Market lock** | `cvdValue`, `cvdTrend` (`UP`/`DOWN`/`FLAT`) lúc vào lệnh |

Subtitle journal: `{n} lệnh · V3 · V4 · CVDX` (`constants/vi.ts`).

**Logic nhãn:** `services/journalAdvisorSnapshot.ts` — prefix `RECOVERING` chỉ khi `strategySource === 'CVDX'`.

### 6.5 Position Advisor (đang giữ lệnh)

**File:** `services/positionAdvisorV3.ts` — rule **`CVD_DIVERGENCE`** (priority 80)

- Kích hoạt khi warning CVD phân kỳ + L5 ≤ 0  
- Xa TP1 (≥70%): `PARTIAL_TP1` — chốt 50%  
- Gần TP1: `CLOSE_NOW`  
- Cần 2 lần liên tiếp (`lastCVDDivergenceActive`) hoặc đã đi ≥70% đến TP1

---

## 7. Tích hợp hệ thống

| Module | Vai trò CVDX |
|--------|----------------|
| `signalBoardScan.ts` | Tính `cvdValue`, `cvdTrend` trên mỗi `SignalRow` |
| `useSignalBoard.ts` | Quét V3+V4 song song; comment ghi V3+V4+CVDX |
| `useJournalMarketSync.ts` | `CVDX` → dùng engine path `v4` |
| `journalService.ts` | Insight pattern CVD (LONG khi CVD>0, SHORT khi trend DOWN) |
| `phase1Migration.ts` | Giữ `strategySource: CVDX` từ dữ liệu cũ |
| `tradePlanDisplay.ts` | Hard block CVD **không** bị lọc như L3 MACD suppressed |

---

## 8. So sánh V3 / V4 / CVDX

| | V3 | V4 | CVDX |
|---|----|----|------|
| Engine riêng | ✅ `scorerV3.ts` | ✅ `scorerV4.ts` | ❌ (subset L5a trong V4) |
| UI toggle | Pill V3 | Pill V4 | Không có pill riêng |
| L5a deep negative rules | Khác / đơn giản hơn | ✅ đầy đủ | ✅ = phần CVD mở rộng của V4 |
| `strategySource` journal | `V3` | `V4` (mặc định UI) | `CVDX` (enum + RECOVERING label) |
| Position Advisor | V3 rules | V4 rules | Cùng V4 path |

---

## 9. Test liên quan

```bash
npx vitest run services/cvdx.test.ts
npx vitest run services/scorerV4.test.ts -t "L5a"
npx vitest run services/indicators.test.ts -t "CVD|cvd"
```

**Kết quả tham chiếu (2026-06-29):** 27 test CVD/L5a pass (`cvdx` + filtered `scorerV4` + `indicators`).

---

## 10. File tham chiếu

| File | Nội dung |
|------|----------|
| `services/indicators.ts` | `classifyCvdState`, `evaluateLongCvdHardBlock`, `applyRecoveringCvdLocalPenalty`, `analyzeCVD`, `buildCVDPointsFromKlines` |
| `services/scorerV4.ts` | `scoreL5aV4`, tích hợp vào `scoreAnalysisV4` |
| `services/cvdx.test.ts` | Case A/B/C |
| `constants/scoring.ts` | `HARD_BLOCK_RULES_V4`, `LAYER_NAMES_V4` L5a |
| `components/dashboard/OrderFlowPanel.tsx` | UI CVD chart + divergence |
| `components/dashboard/SignalBoard.tsx` | Hiển thị điểm, hard block, LayerCard L5 |
| `services/journalAdvisorSnapshot.ts` | Nhãn `RECOVERING LONG` cho `CVDX` |
| `constants/aiJournal.ts` | `StrategySource` type |

---

## 11. Lưu ý vận hành

1. **Không có file `services/cvdx.ts`** — toàn bộ logic nằm trong `indicators` + `scorerV4`.  
2. **UI engine = V4**, không hiện chữ CVDX trên Signal Board; CVDX là tên nội bộ / journal enum.  
3. Muốn journal ghi `CVDX` + nhãn `RECOVERING LONG`, cần `strategySource: 'CVDX'` lúc vào lệnh — hiện `SignalBoard` ghi `V4`.  
4. CVDX **không** liên quan module V4.1 (`services/v41/`) — đó là pipeline Market Intelligence riêng, chưa wire production.
