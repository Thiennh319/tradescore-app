# REPORT — NEAR V4 backtest 180d · CVD rolling align live (`MARKET_KLINE_LIMIT`)

**Date:** 2026-08-02  
**Thay đổi code:** Chỉ `scripts/backtest-v4-near-90d.ts` — **không** đụng `scorerV4` / `analysisInput` / `indicators` / constants.  
**CSV:** `docs/exports/near_backtest_180d_cvd220.csv`  
**MD runner:** `docs/exports/near_rule_comparison_180d_cvd220.md`  
**JSON:** `docs/exports/near_v4_180d_cvd220_analysis.json`

---

## 1. Đã sửa gì (align live)

| Input | Trước (BT) | Sau (align live SSOT) |
|---|---|---|
| **CVD** | `buildCVDPointsFromKlines(near1h)` full `slice(0,i+1)` | Rolling **`MARKET_KLINE_LIMIT`** từ `marketAnalysisFetch.ts` (=220) |
| **Funding history / metrics** | Toàn bộ funding ≤ openTime | Last **`MARKET_LS_DEPTH`** (=12) |
| **L/S ratios** | Toàn bộ LS ≤ openTime | Last **30** (= default `fetchLongShortRatio`) |
| **BTC 1h cho L8** | Full history ≤ openTime | Rolling **`MARKET_KLINE_LIMIT`** (btc24h% vẫn tính từ ≥25 nến full) |
| **klines1h / klines4h cho EMA/MACD/ADX** | Full tới bar hiện tại | **Giữ nguyên full** (warmup indicator — không cắt) |
| **OI** | Lookup nearest (điểm) | Không đổi — live cũng chỉ dùng current/prev + % change |

Log chạy: `CVD rolling=MARKET_KLINE_LIMIT=220; fundingDepth=MARKET_LS_DEPTH=12; lsHist≤30`.

---

## 2. Baseline mới vs cũ

| Metric | Cũ (CVD full-history) | **Mới (CVD rolling 220)** | Δ |
|---|---:|---:|---:|
| n | 86 | **238** | +152 |
| WR% | 79.07 | **72.69** | −6.4 pp |
| EV (avg R) | +0.55 | **+0.38** | −0.17 R |
| Wins / Losses | 68 / 18 | 173 / 65 | — |
| Side mix | **100% SHORT** | **LONG 29 (12.2%) + SHORT 209 (87.8%)** | LONG xuất hiện |

**Đọc nhanh:** Align CVD live → LONG vào được; tần suất lệnh tăng mạnh; WR/EV giảm so với baseline SHORT-only cũ (cũ lạc quan vì lọc thiên lệch CVD). **Không đề xuất threshold mới ở bước này.**

---

## 3. Breakdown LONG / SHORT (riêng biệt)

| Side | n | WR% | EV | Sum R |
|---|---:|---:|---:|---:|
| **LONG** | **29** | **68.97** | **+0.38** | +11.04 |
| **SHORT** | **209** | **73.21** | **+0.37** | +78.34 |
| All | 238 | 72.69 | +0.38 | +89.37 |

- LONG WR ~69% (mẫu nhỏ n=29 — dưới ngưỡng 30 thường dùng để tin cậy).  
- SHORT WR ~73% trên n lớn hơn nhiều.  
- **Không giả định** LONG hành xử giống SHORT.

### Layer contribution — LONG only (n=29)

| Gate | Hi n / WR / EV | Lo n / WR / EV | Ghi chú |
|---|---|---|---|
| L1 ≥ 1.5 (≈2) | 24 / 70.8% / +0.46 | 5 / 60% / ~0 | Mẫu lo nhỏ |
| L3 ≥ 1.5 | 22 / 72.7% / +0.50 | 7 / 57.1% / ~0 | |
| L3 ≥ 2 | 18 / **77.8%** / +0.63 | 11 / 54.6% / −0.03 | Tách rõ nhất trên LONG |
| L6 ≥ 1.5 | 11 / 63.6% / +0.39 | 18 / 72.2% / +0.38 | **Không** nâng WR (khác SHORT) |
| L6 ≥ 2 | 9 / 66.7% / +0.26 | 20 / 70% / +0.44 | Hi L6 không tốt hơn trên LONG mẫu này |

→ Trên LONG, L3≥2 có tín hiệu WR↑; L6 high **không** giống pattern SHORT cũ. Chỉ mô tả — **chưa đề xuất áp dụng**.

### Layer contribution — SHORT (tham chiếu, n=209)

| Gate | Hi n / WR / EV | Lo n / WR / EV |
|---|---|---|
| L1 ≥ 1.5 | 132 / 73.5% / +0.44 | 77 / 72.7% / +0.25 |
| L3 ≥ 2 | 85 / **81.2%** / +0.61 | 124 / 67.7% / +0.21 |
| L6 ≥ 1.5 | 109 / 75.2% / +0.42 | 100 / 71.0% / +0.32 |

---

## 4. Overfit check IS 120d / OOS 60d (baseline mới)

Cắt theo `entryTime`: OOS = 60 ngày gần nhất; IS = phần còn lại trong 180d.

| Tập | n | WR% | EV | LONG n | SHORT n |
|---|---:|---:|---:|---:|---:|
| **IS (~120d)** | 150 | **72.67** | +0.35 | 29 | 121 |
| **OOS (~60d)** | 88 | **72.73** | +0.42 | **0** | 88 |

| Đánh giá | Kết luận |
|---|---|
| WR OOS vs IS | **Gần phẳng** (−0 / +0.06 pp) — không rớt mạnh → ổn định tổng |
| EV OOS | Cao hơn IS nhẹ (+0.42 vs +0.35) |
| LONG OOS | **n=0** — mọi LONG nằm trong IS; **không** có OOS LONG để xác nhận |
| SHORT OOS | n=88, WR 72.7% — ổn |

**Cảnh báo:** Độ ổn định tổng tốt, nhưng **LONG chưa qua được OOS** (mẫu / regime 60d gần đây không có LONG enter). Không tối ưu threshold LONG cho đến khi có thêm sample hoặc cửa sổ khác.

---

## 5. Diễn giải (không tối ưu thêm)

1. Fix CVD rolling **xác nhận giả thuyết B4**: longOk=0 trên BT cũ là artifact phương pháp, không phải kill-switch production.  
2. Baseline align live: **n↑, WR↓ so với SHORT-only cũ** — số cũ không còn dùng làm chuẩn tối ưu.  
3. SHORT vẫn chiếm đa số (~88%) trên 180d NEAR — bias hướng còn, nhưng không còn 100%.  
4. **Bước tiếp theo (chờ duyệt):** tối ưu L1/L3/L6 (và tách LONG vs SHORT) trên baseline **mới** này — không mang threshold từ report SHORT-only cũ.

---

## 6. Checklist duyệt

| Hạng mục | Trạng thái |
|---|---|
| CVD BT = `MARKET_KLINE_LIMIT` SSOT | ✅ Done |
| Không sửa scorer/constants production | ✅ |
| Baseline mới có LONG > 0 | ✅ n_LONG=29 |
| IS/OOS báo cáo | ✅ WR ổn; LONG OOS=0 |
| Đề xuất / áp dụng threshold mới | ❌ **Chưa** — chờ duyệt |

**Chờ duyệt trước khi tối ưu ngưỡng trên baseline CVD220.**
