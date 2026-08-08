# Task V3V4-DATA-2e — Batch Ticker Evaluation + Final Summary

**Ngày:** 2026-08-08  
**Phạm vi:** Đánh giá gộp `ticker/price` all-market; **không** bắt buộc sửa code nếu lợi ích không rõ  
**Chuỗi:** V3V4-DATA-2a → 2b → 2c → 2d → **2e**

---

## Trạng thái

**DONE** — Đã đối chiếu weight Binance + đếm ticker còn lại sau 2b/2c/2d.  
**Kết luận: KHÔNG triển khai batch ticker** (không sửa runtime). Báo cáo này là deliverable.

---

## 1. Weight Binance docs (số thật)

Endpoint app đang dùng: `GET /fapi/v1/ticker/price`  
(Docs: Symbol Price Ticker — deprecated nhưng weight vẫn áp dụng; V2 cùng công thức.)

| Cách gọi | Weight (REQUEST_WEIGHT) |
|----------|-------------------------|
| Có `symbol` (1 coin) | **1** |
| **Không** `symbol` (all markets) | **2** |

Break-even thuần weight: batch all-market **rẻ hơn** chỉ khi thay **≥ 3** lần gọi 1-symbol **cùng một thời điểm** cần dùng chung (3×1 = 3 > 2).

Nguồn: Binance Open Platform — Symbol Price Ticker / Symbol Price Ticker V2 (`Weight: 1 for a single symbol; 2 when the symbol parameter is omitted`).

---

## 2. Số lần `fetchTickerPrice` còn lại (sau 2a–2d) — không dùng số Task 1 cũ

### Call site production (steady-state Web, chu kỳ ~60s)

| Nguồn | Tần suất | Ticker / phút (N=4) | Ghi chú |
|-------|----------|---------------------|---------|
| `signalBoardScan` (V3/V4 Unified) | 1×/coin / 60s | **4** | Bắt buộc per scan |
| `rawMarketFetcher` (V41) | 1×/coin / 60s | **4** | Song song với V3 trong cùng Unified |
| `lockedPlanMonitor` (WAITING) | ticker-only / **30s**, **1** symbol | **2** | Sau 2c — không còn full market |
| `useMarketAnalysis` | chỉ khi snapshot **stale** | **~0** | Sau 2c — dùng shared snapshot |
| `whaleRadarScan` | 1×/coin / **5 phút** | **~0.8** | avg 4/5 |
| `loadQuotes` V41 / Unified UI | mỗi lần `rows` đổi (~60s) | **+4** | UI quotes — vẫn gọi riêng |
| Pending fill / price-level | chỉ khi có PENDING/OPEN | **0–N** | Event-driven, không steady |

**Steady-state ticker REST/phút (có plan WAITING + tab Unified/V41):**  
≈ **4 + 4 + 2 + 0.8 + 4 ≈ 14.8** → weight ≈ **15**  
(không plan / ẩn quotes: ≈ **8–9**/phút)

### So sánh nếu batch all-market (giả định tối ưu lý thuyết)

| Kịch bản | Weight / phút |
|----------|----------------|
| Hiện tại (per-symbol) | ~**15** |
| 1× all-market / chu kỳ scan (w=2) + inject V3+V41+quotes; Locked giữ 1-symbol ×2 | **2 + 2 + ~0.8 ≈ 4.8** |
| **Tiết kiệm** | ~**10 weight/phút** |

So với trần Futures **2400 weight/phút**: tiết kiệm ~**0.4%** ngân sách.  
So với tổng REST còn lại (klines/depth/OI chiếm phần lớn): ticker đã là **phần nhỏ** sau 2b/2c.

### Độ phức tạp nếu làm

- Cache/TTL map giá all-market; wire vào `scanSignalSymbol`, `fetchRawMarketV41`, `loadQuotes`, có chọn filter queue/gate.
- Locked Plan **không** nên dùng all-market (w=2 > w=1 cho 1 coin).
- Rủi ro payload lớn (~hàng trăm symbol), parse/map, stale cache giữa 30s ticker plan vs 60s scan.

→ **Lợi ích weight nhỏ; phức tạp / bề mặt lỗi lớn hơn lợi ích thực tế.**

---

## 3. Kết luận batch ticker

| Câu hỏi | Trả lời |
|---------|---------|
| All-market có rẻ hơn rõ trên giấy? | Có **chỉ khi** gộp ≥3 symbol cùng lúc (w=2 vs ≥3). |
| Sau 2b/2c còn đáng làm? | **Không đủ rõ** — tiết kiệm ~10 w/phút, ticker đã ~15 w/phút; depth/klines vẫn là hotspot. |
| Có sửa code? | **Không.** |

---

## 4. Đã sửa

*(Không có thay đổi runtime — evaluation only.)*

---

## 5. Test

*(Không có test mới — không đổi code.)*  
Suite 2a–2d trước đó: **38 PASS** (đứng yên).

---

## 6. Tổng kết chuỗi 2a→2e — REST/phút vs baseline Task 1

**Baseline Task V3V4-DATA-1** (ước lượng Unified + MA, không Whale chi tiết): **~80–95 REST/phút**  
(V3 ~44–48 + V41 ~24–32 + MA ~13).

### Bảng theo nguồn (steady-state Web, 4 coin, có Locked Plan WAITING)

| Nguồn | Baseline (DATA-1) | Sau 2a–2d (2e đo lại) | Thay đổi chính |
|-------|-------------------|------------------------|----------------|
| **Unified V3/V4** | ~44–48 | ~**44–48** | Cùng số REST; queue (2d) chỉ xếp hàng; BTC 24h đã 1× |
| **V41** | ~24–32 | ~**18–22** | **2b:** BTC 4H+1H **8→2**; BTCUSDT tái dùng shared |
| **Market Analysis** | ~11–13 | ~**0** (fresh snapshot) | **2c:** shared `AllMarketData` |
| **Locked Plan** | ~24 (2× full market/phút) | ~**2** (ticker-only) | **2c** |
| **Whale Radar** | ~2–3 avg | ~**2–3** avg | Không đổi |
| **UI loadQuotes** (V41/Unified) | (thường gộp/nhầm vào MA) | ~**8** (4 ticker + 4×24h) | Nổi rõ sau khi MA tách |
| **Gate 429/418** | Không có | Pause khi ban | **2a** |
| **Concurrency** | Burst không giới hạn | Max **3** in-flight | **2d** (không giảm count) |

### Tổng REST/phút (ước lượng)

| Kịch bản | REST/phút |
|----------|-----------|
| Baseline DATA-1 (V3+V41+MA) | **~80–95** |
| Sau 2a–2d, **có** plan WAITING, **có** loadQuotes | ~44–48 + 18–22 + 0 + 2 + 2–3 + 8 ≈ **~74–83** |
| Sau 2a–2d, plan WAITING, **không** đếm loadQuotes riêng | ≈ **~66–75** |
| Sau 2a–2d, **không** plan, snapshot MA fresh | ≈ **~64–73** (+ quotes nếu mở tab) |

**Điểm giảm lớn nhất:** MA (−13) + Locked (−22) + V41 BTC (−6) ≈ **−40 REST/phút** ở case nặng (plan active).  
Tổng cuối vẫn ~**70–80** khi mở đủ UI quotes — chủ yếu còn **klines × TF × coin + depth 1000**.

### Weight (gợi ý, không đo live vì IP có thể 418)

- Hotspot còn lại: `/fapi/v1/depth?limit=1000` (~weight **20**/lần × 4 coin / phút).  
- Batch ticker (2e) chỉ cắt ~10 weight — **không** đổi bức tranh.

---

## 7. Việc còn lại (ngoài 2e)

1. Giảm **depth limit** / weight Whale + Signal (lớn nhất).  
2. (Tuỳ chọn) Dedup **loadQuotes** với giá đã có từ scan snapshot (dễ hơn all-market batch).  
3. (Tuỳ chọn) Inject BTC 1H vào V3/V4 alt (chất lượng, không phải rate).  
4. UI banner khi gate 418.

---

## 8. Rủi ro

- Không ship batch → **không** rủi ro regression 2e.  
- Nếu sau này batch: cẩn thận Locked Plan (đừng dùng all-market cho 1 coin), TTL cache, và payload all-symbols.

---

## Task ID

**V3V4-DATA-2e** (Batch Ticker Evaluation + Final Summary).
