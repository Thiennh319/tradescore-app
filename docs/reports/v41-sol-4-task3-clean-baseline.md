# V41-SOL-4 Task 3 — Clean Breakout Baseline (365d sau fix dedupe)

**Ngày:** 2026-08-08  
**Window (pinned = SOL-3):** `2025-08-08T04:32:23.655Z` → `2026-08-08T04:32:23.655Z`  
**Config:** NEAR default Confirm-B (LOOKBACK 20 / WIDTH 5% / ATR 1 / retest / TP1_RR 1.5 / MAX_HOLD 80) + **`dedupeByBrokenLevel=true` (occupancy-B)** · cost RT **0.18%** · no BTC filter  
**Script:** `scripts/backtest-v41-sol-breakout-365d-quarterly.ts`

---

## E[R] sau phí baseline sạch (SSOT cho Task 4)

### **E[R] sau phí baseline sạch = 0.0836**

Task 4 chỉ chấp nhận combo có **E[R] after fees ≥ 0.0836**. Không nhận combo thấp hơn ngưỡng này.

(Giá trị chính xác JSON: `0.08364635880431151`.)

---

## FULL + Quarterly (sạch)

| Slice | n | decided | W/L/B/T | WR% | E[R] before | E[R] after | sign | L/S |
|-------|--:|--------:|---------|----:|------------:|-----------:|------|----|
| FULL_365d | **40** | 40 | 19/21/0/0 | **47.50** | 0.188 | **0.0836** | positive | 11/29 |
| Q1 | 10 | 10 | 4/6/0/0 | 40.00 | 0.000 | −0.098 | negative | 3/7 |
| Q2 | 11 | 11 | 6/5/0/0 | 54.55 | 0.364 | 0.265 | positive | 3/8 |
| Q3 | **8** | 8 | 5/3/0/0 | **62.50** | 0.563 | **0.457** | **positive** | 1/7 |
| Q4 | 11 | 11 | 4/7/0/0 | 36.36 | −0.091 | −0.204 | negative | 4/7 |
| H1 | 21 | 21 | 10/11/0/0 | 47.62 | 0.190 | 0.092 | positive | 6/15 |
| H2 | 19 | 19 | 9/10/0/0 | 47.37 | 0.184 | 0.074 | positive | 5/14 |

Kiểm tra cụm same-side ≤6h trên trades sạch: **0 cụm** (46→40 = đúng −6 lệnh trùng Task 1).

---

## So sánh 3 cột (ảnh hưởng bug)

| Metric | (1) V41-SOL-3 gốc (có bug) | (2) Dedupe thủ công ước tính | (3) Sau fix code (Task 3 — **SSOT**) |
|--------|---------------------------:|-----------------------------:|------------------------------------:|
| n | 46 | 40 | **40** |
| WR% | 50.00 | 47.5 | **47.50** |
| E[R] sau phí | 0.1463 | 0.0836 | **0.0836** |

Cột (2) khớp gần như tuyệt đối với (3) trên 3 metric FULL → ước tính keep-first 5 cụm Task 1 là đúng hướng. **Chỉ cột (3) dùng cho Task 4.**

Δ (3)−(1): n −6 · WR −2.5 pp · E[R] after **−0.0627**.

---

## Đánh giá riêng Q3 (2026-02-06 → 2026-05-08)

| | Trước fix (SOL-3) | Sau fix (clean) |
|--|------------------:|----------------:|
| n | 11 | **8** (−3 từ cụm 2026-02-22 SHORT×3→1) |
| WR% | 72.73 | **62.50** |
| E[R] after | **0.707** | **0.457** |

- **Q3 vẫn dương** sau dedupe (E[R] after **+0.457**).
- Cụm 3 lệnh 22/02 đã bị gộp → bớt ~2 lệnh thắng “ảo”, kéo E[R] Q3 xuống nhưng không làm quý âm.
- Đóng góp R dương giữa các quý >0: dirty Q3 ≈ **70%** Σ R dương các quý; clean Q3 ≈ **56%** — vẫn quý mạnh nhất nhưng không còn “gánh ảo” như trước.

Claim “Q3 gánh 52% lợi nhuận năm” (pre-task) khớp hướng: dirty Σ net_r Q3 / Σ dương các quý ≈ 70%; sau fix còn ≈ 56%.

---

## Artefacts

| File |
|------|
| `docs/exports/v41-sol-4-breakout-365d-quarterly-clean.csv` |
| `docs/exports/v41-sol-4-breakout-365d-quarterly-clean-trades.csv` |
| `docs/exports/v41-sol-4-breakout-365d-quarterly-clean-summary.json` |
| `docs/exports/REPORT_V41_SOL_4_TASK3_CLEAN_BASELINE_2026-08-08.md` (auto từ script) |

**Không** ghi đè artefact SOL-3 buggy (`v41-sol-breakout-365d-quarterly*`).

---

## Ghi chú chạy

- Eval end **pinned** `2026-08-08T04:32:23.655Z` (không dùng `Date.now()`) để khớp window SOL-3.
- `1h` bars fetched: 8840; setups sau dedupe: 40.
