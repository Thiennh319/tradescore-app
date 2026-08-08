# V41-XRP-1 — Baseline Breakout Confirm-B (XRPUSDT)

**Ngày:** 2026-08-08  
**Symbol:** XRPUSDT · Confirm-B · **NEAR default params** · `dedupeByBrokenLevel=true` từ lần chạy đầu  
**Cost:** fee 0.08% + slip 0.1% = **0.18%** RT · **no BTC filter**  
**Script:** `scripts/backtest-v41-xrp-breakout-365d-quarterly.ts`  
**Bài học SOL (V41-SOL-4):** IS + **true OOS** cùng lúc; không sweep trong task này; không promote production dù IS đẹp.

---

## 1. Khai báo XRP

| Hạng mục | Trạng thái |
|----------|------------|
| `TRADE_SYMBOLS` / `AppTradeSymbol` | **Đã thêm** `XRPUSDT` |
| `DEFAULT_SCAN_SYMBOLS_V41`, `V41_RC3_SYMBOLS`, journal filter, export coin UI | **Đã thêm** |
| `SYMBOLS_USING_BREAKOUT_STRATEGY` (live allow-list) | **Không thêm** — live vẫn `trend_reversal` (giống SOL) cho đến quyết định riêng |
| Data 1H Futures | **Đủ ≥730d**: span ≈ **735 ngày**, first `2024-08-03` → covers full OOS+IS |

Params baseline (y hệt NEAR / SOL-clean):

```
LOOKBACK=20, WIDTH=5%, ATR=1, retest, RETEST_MAX=10, BAND=0.005, TP1_RR=1.5,
sl=atr_break_level, strong=false, HOLD=80, dedupe=true (occupancy-B)
```

TR baseline XRP: **không có** trong task này → bỏ qua so sánh TR.

---

## 2. IS — FULL + quarterly (2025-08-08 → 2026-08-08)

| Slice | n | decided | W/L/B/T | WR% | E[R] before | E[R] after | sign | L/S |
|-------|--:|--------:|---------|----:|------------:|-----------:|------|----|
| FULL_365d | **55** | 55 | 29/26/0/0 | **52.73** | 0.318 | **0.196** | **positive** | 21/34 |
| Q1 | 12 | 12 | 7/5/0/0 | 58.33 | 0.458 | 0.370 | positive | 6/6 |
| Q2 | 11 | 11 | 5/6/0/0 | 45.45 | 0.136 | 0.015 | positive | 4/7 |
| Q3 | 15 | 15 | 8/7/0/0 | 53.33 | 0.333 | 0.213 | positive | 4/11 |
| Q4 | 17 | 17 | 9/8/0/0 | 52.94 | 0.324 | 0.177 | positive | 7/10 |
| H1 | 23 | 23 | 12/11/0/0 | 52.17 | 0.304 | 0.200 | positive | 10/13 |
| H2 | 32 | 32 | 17/15/0/0 | 53.13 | 0.328 | 0.194 | positive | 11/21 |

---

## 3. True OOS — FULL + quarterly (2024-08-08 → 2025-08-08)

Cùng params, không đổi gì.

| Slice | n | decided | W/L/B/T | WR% | E[R] before | E[R] after | sign | L/S |
|-------|--:|--------:|---------|----:|------------:|-----------:|------|----|
| FULL_365d | **35** | 33 | 17/16/0/2 | **51.52** | 0.288 | **0.175** | **positive** | 11/24 |
| Q1 | 12 | 12 | 3/9/0/0 | 25.00 | −0.375 | **−0.493** | **negative** | 2/10 |
| Q2 | 3 | 3 | 3/0/0/0 | 100 | 1.500 | 1.404 | positive | 0/3 |
| Q3 | 5 | 5 | 3/2/0/0 | 60.00 | 0.500 | 0.420 | positive | 2/3 |
| Q4 | 15 | 13 | 8/5/0/2 | 61.54 | 0.538 | 0.414 | positive | 7/8 |
| H1 | 15 | 15 | 6/9/0/0 | 40.00 | 0.000 | **−0.113** | **negative** | 2/13 |
| H2 | 20 | 18 | 11/7/0/2 | 61.11 | 0.528 | 0.416 | positive | 9/11 |

---

## 4. Concentration + cluster (ngay từ đầu)

### Concentration (max quý dương / Σ quý dương)

| Window | top Q | concentration_pos% | Flag >50%? |
|--------|------:|-------------------:|:----------:|
| IS | Q1 | **41.1%** | **Không** |
| OOS | Q4 | **46.0%** | **Không** |

OOS Q1 vẫn **rất xấu** (E[R] −0.49) dù full-year dương — không ẩn trong report.

### Cluster same-side ≤6h (sau dedupe occupancy-B)

| Window | cluster_n | cluster_trade_n | Kỳ vọng |
|--------|----------:|----------------:|---------|
| IS | **3** | 6 | 0 “ideal” |
| OOS | **2** | 4 | 0 “ideal” |

**Không phải tắt nhầm dedupe** — giống hiện tượng SOL OOS: metric ≤6h bắt **re-entry sau khi lệnh trước đã đóng** (TP/SL nhanh), level không luôn cascade cùng ID. Ví dụ IS: 2025-10-10 SHORT TP held=4 rồi +3h SHORT TP lại; 2026-05-10 LONG SL held=2 rồi +5h LONG TP.

→ Dedupe level đang hoạt động; residual ≤6h = gap/cooldown side (ngoài phạm vi Task 1) nếu muốn siết thêm sau.

---

## 5. Kết luận (tiêu chí 3 nhánh)

| Nhánh | Điều kiện | Kết quả XRP |
|-------|-----------|-------------|
| A — Đáng nghiên cứu tiếp | IS **và** OOS full E[R] dương (hoặc OOS không âm nặng) | **Khớp** — IS **+0.196**, OOS **+0.175** |
| B — Dừng, không sweep | OOS âm | Không |
| C — Thiếu data OOS | Lịch sử <730d | Không — data đủ ~735d |

### Quyết định Task V41-XRP-1

**Đáng nghiên cứu tiếp** (sweep / cooldown / walk-forward siết hơn) ở **task riêng** — vì full IS+OOS cùng dương với NEAR default + dedupe.

**Không** đề xuất production / allow-list breakout XRP ở task này, dù số liệu đẹp hơn SOL cùng protocol. Lý do:

1. OOS H1 âm (−0.113); OOS Q1 rất âm (−0.493) — edge không đều.  
2. Residual cluster ≤6h chưa triệt tiêu.  
3. Chưa có paper/live; bài học SOL: IS đẹp ≠ đủ wire.  
4. Live routing vẫn **TR** cho XRP cho đến quyết định allow-list riêng.

So với SOL clean (IS +0.084 / OOS −0.195): XRP NEAR-default **mạnh và bền hơn trên true OOS** trong sample này — đủ để mở phase research tiếp, chưa đủ production.

---

## 6. Việc còn lại (ngoài task này)

1. Task riêng: sweep XRP (profit-first + OOS gate cứng giống SOL-4) — **chỉ khi** vẫn giữ OOS ≥ 0 sau siết.  
2. Cân nhắc cooldown theo side / min gap sau đóng lệnh (residual cluster).  
3. Không thêm `XRPUSDT` vào `SYMBOLS_USING_BREAKOUT_STRATEGY` cho đến gate production riêng.  
4. (Tuỳ chọn) TR baseline XRP nếu muốn so sánh công bằng.

---

## Artefacts

| File |
|------|
| `docs/exports/v41-xrp-1-breakout-365d-quarterly.csv` |
| `docs/exports/v41-xrp-1-breakout-365d-quarterly-trades.csv` |
| `docs/exports/v41-xrp-1-breakout-365d-quarterly-oos-trades.csv` |
| `docs/exports/v41-xrp-1-breakout-365d-quarterly-summary.json` |

---

## Task ID

**V41-XRP-1** · Verdict research: **continue (IS+OOS+) / no production**
