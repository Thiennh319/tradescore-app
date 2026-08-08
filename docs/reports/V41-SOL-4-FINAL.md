# V41-SOL-4 — FINAL REPORT — SOL Breakout (Confirm-B) sau fix đếm trùng + sweep

**Ngày:** 2026-08-08  
**Phạm vi:** SOLUSDT Confirm-B breakout — bug fan-out → baseline sạch → param sweep → true OOS  
**Audience:** người ra quyết định production / allow-list  
**Không** đổi production trong chuỗi task này (chỉ research + báo cáo; dedupe code đã có sẵn trong detector/RC3 từ Task 1).

---

## Verdict (đọc trước)

### Khuyến nghị: **(c)** — Chưa đủ cơ sở đưa breakout SOL vào production

- Sau fix bug, baseline sạch (NEAR default params) **dương nhẹ in-sample** (E[R] after **+0.084**, WR **47.5%**) nhưng **không ổn định theo quý** (Q1/Q4 âm).
- Combo sweep “thắng” IS (WR **58.3%**, E[R] **+0.176**) chủ yếu nhờ **TP1_RR thấp hơn** (đổi một số lệnh SL→TP) — fit 12 tháng chọn param.
- **True OOS** (2024-08-08 → 2025-08-08): **cả combo mới và baseline sạch đều ÂM** (E[R] after **−0.111** vs **−0.195**).
- → **Không** allow-list SOL breakout; **không** thay NEAR default bằng param sweep. Giữ SOL trên chiến lược hiện tại (TR) cho đến khi có edge dương OOS bền vững hơn / quan sát thêm.

---

## 1. Bug đã fix (Task 1 / 1b / 1c) — tóm tắt

Confirm-B scan 1H từng bar và từng emit setup độc lập: một breakdown bị **đếm 2–3 lệnh** cùng side trong vài giờ (cascade Donchian / retest liên tiếp). Trên SOL-3: 5 cụm, 11/46 lệnh (~24%) nhưng chiếm phần lớn R năm.

**Fix:** `dedupeByBrokenLevel` — một level ID (Donchian bị phá ± band, hoặc lineage cascade) chỉ còn **1 setup** trong lúc lệnh đại diện còn **mở** (TP/SL/TIMEOUT). Live thiếu tương lai → outcome `'OPEN'` / occupied vô hạn (không free sớm). Wire: `buildBreakoutRc3Card` + backtest SOL.

Chi tiết: `docs/reports/v41-sol-4-task1-bugfix-summary.md`.

---

## 2. TR baseline (Task 2) — có cùng vấn đề?

| | Breakout (trước fix) | TR (SOL-2) |
|--|---------------------:|-----------:|
| Cụm same-side ≤6h | 5 cụm / 11 lệnh | **2 cụm / 6 lệnh (13%)** |
| Nhịp | 1H | **4H clock** (không cooldown) |
| Ảnh hưởng R | rất lớn (~80% tổng R năm buggy) | nhẹ hơn (~11% abs R; kéo signed R âm) |

**Kết luận:** TR **có** fan-out kiến trúc tương tự (mọi clock ACTIVE → trade), **nhẹ hơn** breakout. **Chưa sửa** (baseline dùng chung nhiều task). Nên mở **task riêng** nếu muốn so sánh TR↔breakout công bằng / siết backtest TR.

Chi tiết: `docs/reports/v41-sol-4-task2-tr-baseline-check.md`.

---

## 3. Trước / sau fix — baseline sạch (Task 3)

**Window (pinned):** 2025-08-08 → 2026-08-08 · NEAR default Confirm-B · cost RT 0.18% · dedupe ON

| Metric | V41-SOL-3 gốc (có bug) | Baseline sạch (SSOT) |
|--------|-----------------------:|---------------------:|
| n | 46 | **40** |
| WR% | 50.00 | **47.50** |
| E[R] sau phí | **0.1463** | **0.0836** |

| Slice (sạch) | n | WR% | E[R] after | sign |
|--------------|--:|----:|-----------:|------|
| FULL | 40 | 47.50 | **0.084** | positive |
| Q1 | 10 | 40.00 | −0.098 | negative |
| Q2 | 11 | 54.55 | 0.265 | positive |
| Q3 | 8 | 62.50 | 0.457 | positive |
| Q4 | 11 | 36.36 | −0.204 | negative |
| H1 / H2 | 21 / 19 | 47.6 / 47.4 | 0.092 / 0.074 | positive |

Q3 vẫn dương sau gộp cụm 2026-02-22, nhưng edge năm mỏng và phụ thuộc quý tốt. Cluster ≤6h trên trades sạch: **0**.

Artefacts: `docs/exports/v41-sol-4-breakout-365d-quarterly-clean*`.

---

## 4. Sweep param (Task 4) + xác minh / OOS (Task 4b–4c)

### Hàm mục tiêu (IS)

1. E[R] after ≥ **0.0836** (baseline sạch)  
2. Trong các combo đó: WR > **47.5%**  
+ walk-forward H1/H2, concentration quý dương ≤50%, cluster ≤6h = 0

### Top combo pass gate IS

```
LOOKBACK=20, WIDTH=5%, ATR=1, RETEST_MAX=10,
BAND=0.003 (từ 0.005), TP1_RR=1.2 (từ 1.5),
strong=false, HOLD=80 + dedupe
```

| Metric IS | Baseline sạch | Sweep winner |
|-----------|--------------:|-------------:|
| n | 40 | 36 |
| WR% | 47.50 | **58.33** |
| E[R] after | 0.084 | **0.176** |
| concentration_pos% | 55.7 | **43.7** |
| H1 / H2 E[R] | 0.092 / 0.074 | 0.286 / 0.054 |
| cluster ≤6h | 0 | 0 |

**Cơ chế WR IS (4c):** trên 35 lệnh chung, **3 lệnh đổi SL→TP** chỉ vì TP gần hơn (RR 1.2) — không phải “band chỉ lọc lệnh thua”.

### True OOS (quan trọng)

| Config | Window | n | WR% | E[R] after |
|--------|--------|--:|----:|-----------:|
| Sweep winner | **2024-08 → 2025-08** | 27 | 44.4 | **−0.111** |
| Baseline sạch (cùng OOS) | cùng | 29 | 35.7 | **−0.195** |

Cả hai **âm**. Winner tốt hơn baseline trên năm xấu, nhưng **không** chứng minh edge dương OOS.  
“Cluster” OOS (2 cụm) = re-entry sau TP nhanh (held=2), dedupe occupancy **đã bật đúng** — không phải tắt nhầm fix Task 1.

→ Sweep IS cải thiện **không chuyển** thành khuyến nghị production.

---

## 5. Khuyến nghị cuối cùng — chọn **(c)**

| Lựa chọn | Mô tả | Quyết định |
|----------|--------|------------|
| (a) Allow-list SOL breakout + paper | Edge OOS dương / ổn định | **Không** — OOS âm |
| (b) Giữ NEAR default cho SOL breakout | Baseline sạch dương ổn, sweep vô ích | **Không áp dụng** — SOL **chưa** nên ở allow-list breakout; default NEAR chỉ là tham chiếu research |
| **(c) Chưa production breakout SOL** | Baseline sạch yếu/không đều + OOS âm | **Chọn** |

**Hành động production đề xuất:**

1. **Không** thêm `SOLUSDT` vào breakout allow-list.  
2. **Giữ** SOL trên TR (hoặc chiến lược hiện hành) cho đến khi có nghiên cứu OOS dương có kiểm soát.  
3. **Giữ** code dedupe level-occupancy trong detector/RC3 (đúng cho live NEAR breakout & mọi symbol breakout sau này) — đó là fix chất lượng tín hiệu, không phải “green light” SOL.  
4. **Không** promote `band=0.003` / `TP1_RR=1.2` làm SSOT SOL.

---

## 6. Việc còn lại

| # | Việc | Ưu tiên |
|---|------|--------|
| 1 | Task riêng: **deconflict / occupancy TR backtest** (Task 2) nếu còn so sánh TR↔BO | Trung bình |
| 2 | Nếu còn R&D SOL breakout: cooldown theo side / min gap sau TP nhanh; thêm năm OOS hoặc walk-forward rolling | Thấp (research) |
| 3 | Không wire allow-list SOL breakout cho đến khi E[R] OOS ≥ 0 và quý không phụ thuộc một đợt | Gate cứng |
| 4 | Paper/live chỉ xem xét lại **sau** khi có gói OOS mới đạt ngưỡng — không dựa report IS sweep này | — |

---

## Artefacts / nguồn

| Vai trò | Path |
|---------|------|
| Task 1 bugfix | `docs/reports/v41-sol-4-task1-bugfix-summary.md` |
| Task 2 TR check | `docs/reports/v41-sol-4-task2-tr-baseline-check.md` |
| Task 3 clean baseline | `docs/reports/v41-sol-4-task3-clean-baseline.md` |
| Task 4 sweep | `docs/reports/v41-sol-4-task4-sweep-results.md` |
| Task 4b/4c OOS + WR | `docs/reports/v41-sol-4-task4b-winning-combo-verification.md` |
| Clean trades | `docs/exports/v41-sol-4-breakout-365d-quarterly-clean-trades.csv` |
| Sweep CSV | `docs/exports/v41-sol-4-sweep-results.csv` |
| Winner + OOS trades | `docs/exports/v41-sol-4-winning-combo-trades.csv`, `…-oos-prior365d-trades.csv` |

---

## Task ID

**V41-SOL-4** (Tasks 1 → 5) · Final recommendation **(c)**
