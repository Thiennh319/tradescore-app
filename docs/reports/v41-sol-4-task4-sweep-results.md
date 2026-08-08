# V41-SOL-4 Task 4 — Param sweep SOL breakout (profit-first)

**Ngày:** 2026-08-08  
**Baseline sạch (Task 3):** E[R] after **≥ 0.0836**, WR baseline **47.50%**  
**Window:** `2025-08-08T04:32:23.655Z` → `2026-08-08T04:32:23.655Z`  
**Code:** `dedupeByBrokenLevel=true` (Task 1 occupancy-B)  
**Script:** `scripts/backtest-v41-sol-breakout-param-sweep.ts`  
**Phương pháp:** OFAT (27 runs) → pick promising → combo top-2/dim (84 evals unique)

---

## Hàm mục tiêu + rào chắn (đúng spec)

| # | Điều kiện | Ngưỡng |
|---|-----------|--------|
| 1 | E[R] after (full) | ≥ **0.0836** |
| 2 | WR% (full) | **> 47.50** |
| WF | Walk-forward | H1 E[R] ≥ 0 và H2 E[R] ≥ **−0.05** |
| Conc | Concentration | max Σnet quý dương / Σ net quý dương ≤ **50%** (cùng phép Task 3 Q3) |
| Dedup | Cluster ≤6h same-side | **0** cụm |

---

## Kết luận

**Có combo thỏa đủ điều kiện** — thực chất **một họ tham số** (metrics trùng), khác nhau chỉ ở `retest_max_bars` ∈ {5,10} và `max_hold_1h` ∈ {80,120} (không đổi kết quả trade trên sample này).

### Họ thắng (metrics giống nhau)

| Metric | Baseline clean | Winner family |
|--------|---------------:|--------------:|
| n | 40 | **36** |
| WR% | 47.50 | **58.33** (+10.8 pp) |
| E[R] before | 0.188 | **0.278** |
| E[R] after | **0.0836** | **0.1764** (+0.093) |
| concentration_pos% | 55.7 | **43.7** |
| H1 E[R] / H2 E[R] | 0.092 / 0.074 | **0.286 / 0.054** |
| cluster ≤6h | 0 | **0** |

**Core deltas vs default (các param khác giữ NEAR default):**

| Param | Default | Winner |
|-------|--------:|-------:|
| `retest_band_pct` | 0.005 | **0.003** |
| `tp1_rr` | 1.5 | **1.2** |
| `retest_max_bars` | 10 | 5 hoặc 10 (indifferent) |
| `max_hold_1h` | 80 | 80 hoặc 120 (indifferent) |

Khuyến nghị dùng SSOT sạch cho Task 5:  
**LOOKBACK=20, WIDTH=5, ATR=1, RETEST_MAX=10, BAND=0.003, TP1_RR=1.2, strong=false, HOLD=80**  
(+ dedupe level occupancy).

---

## Top combo (đủ gate) — chi tiết

### Combo A (khuyến nghị)

```
lookback_n=20, max_width_pct=5, atr_mult=1,
retest_max_bars=10, retest_band_pct=0.003, tp1_rr=1.2,
require_strong_breakout=false, max_hold_1h=80
```

| Slice | n | E[R] after | note |
|-------|--:|-----------:|------|
| FULL | 36 | **0.1764** | WR **58.33%** |
| Q1 | 8 | +0.265 | |
| Q2 | 11 | +0.302 | top dương |
| Q3 | 8 | +0.269 | |
| Q4 | 9 | −0.138 | âm nhẹ |
| H1 (IS) | — | **+0.286** | pass |
| H2 (OOS) | — | **+0.054** | pass (≥ −0.05 và ≥ 0) |

- **concentration_pos%** = 43.7% (top = Q2) — **pass ≤50%**  
- **re-check dedup:** cluster_n = **0**

### Combo B–D (metrics = A)

| ID | Khác A | Kết quả |
|----|--------|---------|
| B | `max_hold_1h=120` | Identical trades/metrics |
| C | `retest_max_bars=5`, hold=80 | Identical |
| D | `retest_max_bars=5`, hold=120 | Identical |

→ Trên sample 365d này, cửa sổ retest 5 vs 10 và hold 80 vs 120 **không** tách edge; edge đến từ **band hẹp hơn + TP RR thấp hơn**.

---

## OFAT — hướng tín hiệu (tóm tắt)

| Param | Giá trị cải thiện E[R]/WR (kèm E[R]≥baseline) | Ghi chú |
|-------|-----------------------------------------------|---------|
| max_width_pct | 3, 4 | E[R]/WR↑ mạnh nhưng **concentration 62–89%** → fail gate |
| lookback_n | 30 | E[R]/WR↑, conc ~48% OFAT nhưng WF fail; combo + width hẹp → conc cao |
| retest_band_pct | **0.003** | WR↑, E[R]↑, conc↓ → **chìa khóa** |
| tp1_rr | **1.2** | WR↑; 2.0/2.5 làm E[R]/WR↓ |
| retest_max_bars | 5 | Gần baseline; kết hợp band+RR mới khác biệt |
| atr_mult / strong / hold | hầu hết trung tính hoặc xấu | atr≠1 làm WF/E[R] tệ |

---

## Combo gần đạt — bị loại (trung thực)

| Lý do loại | Ví dụ | WR | E[R] | conc% |
|------------|-------|---:|-----:|------:|
| concentration>50% | LOOKBACK=30 WIDTH=4 TP1=1.2 | 69.23 | 0.405 | **84.6** |
| concentration>50% | WIDTH=4 only (OFAT) | 55.17 | 0.263 | **88.6** |
| walk_forward_fail | BAND=0.003 only (OFAT, TP1=1.5) | 55.00 | 0.106 | 43.0 | H2 yếu/`NaN` path |
| er_below / wr flat | Baseline / nhiều OFAT atr | ≤47.5 | ≤0.084 | >50 |

Không hạ tiêu chuẩn: nhiều combo “đẹp” (WR 60–69%, E[R] 0.26–0.42) **bị loại đúng** vì phụ thuộc 1 quý.

---

## Artefacts

| File |
|------|
| `docs/exports/v41-sol-4-sweep-results.csv` (84 rows) |
| `docs/exports/v41-sol-4-sweep-results-summary.json` |
| `scripts/backtest-v41-sol-breakout-param-sweep.ts` |

Detector: `scanBreakoutSetups` nhận `retestMaxBars` / `retestBandPct` / `tp1Rr` (sweep-safe, default giữ production).

---

## Task 5 (gợi ý input)

Dùng **Combo A** làm candidate param SOL Confirm-B nếu tiếp tục allow-list / wire — đã thỏa profit-first + chống overfit trên window đã pin.
