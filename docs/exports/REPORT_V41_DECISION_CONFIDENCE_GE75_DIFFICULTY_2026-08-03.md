# REPORT — Độ khó đạt Decision Confidence ≥75 (V4.1)

**Date:** 2026-08-03  
**Scope:** Điều tra + báo cáo từ artefact / report sẵn có (lựa chọn A). Không sửa code, không đề xuất đổi ngưỡng.  
**Liên quan:** `REPORT_V41_ACTIVE_3OF4_VS_REQUIRED_TREND_SIGNAL_COUNT_4_2026-08-03.md`

---

## 0. Kết luận ngắn

| Câu hỏi | Quan sát từ dữ liệu sẵn |
|---------|-------------------------|
| Decision Confidence ≥75 có thường đạt không? | Rất hiếm trên bằng chứng hiện có. Live 4-coin snapshot: 0/4 đạt ≥75 (conf Decision ≈ 7.9–12.9). Backtest 180d (NEAR) đo confidenceTR, không dump Decision finalConfidence; confTR ≥70 chỉ ~0–0.5% clock. |
| V4.1 có hay ra LONG/SHORT thật không? | Backtest / UI đo nhiều hơn ở tầng TR gate (≥3/4 + confTR≥50); tầng Decision ≥75 gần như không có thống kê thẳng — live snapshot toàn IGNORE / không LONG/SHORT. |
| Có dấu hiệu ngưỡng 75 khắt? | Có dấu hiệu quan sát được (tỷ lệ thời gian ≥75 < 5% trên mọi nguồn đủ tin gần nhất). Không đề xuất đổi số trong task này. |

---

## 1. Làm rõ SSOT: hai số confidence khác nhau

Đây là điểm hay bị nhầm khi đọc UI BNB (CONFIDENCE TR 58/50 + badge WATCH).

| Tên | Nguồn | Dùng để làm gì trên UI / Decision |
|-----|--------|-----------------------------------|
| Confidence TR (`detail.confidence`) | `reversalDetector` — trung bình 4 component | Card RC3: CONFIDENCE TR …/50; gate ACTIVE ≥50 |
| Decision Confidence (`finalConfidence`) | `confidenceEngine` — blend trend layer + market context × completeness | `evaluateDecision` so với `thresholds.long/short = 75`, `watch = 45` |

Wire RC3 (`buildRc3ViewModel.ts`):

- Card hiển thị `confidenceTr` từ `trendWithContext.detail.confidence`
- Badge LONG/SHORT/WATCH/IGNORE từ `computeDecisionEngineResult(computeConfidenceEngineResult(...))` → dùng `finalConfidence`

Công thức Decision Confidence (tóm tắt config):

```
layerBlend = trendLayer×0.5 + contextLayer×0.5
finalConfidence = clamp(layerBlend × completenessMultiplier)
```

(`services/v41/confidenceEngine.ts`, `services/v41/confidence/confidenceConfig.ts`)

Hệ quả: Card có thể hiện TR=58 (gate ACTIVE) trong khi Decision vẫn WATCH vì `finalConfidence` ∈ [45, 75) hoặc eligibility fail — không nên đọc 58 như đã vượt ngưỡng 75.

---

## 2. Nguồn dữ liệu dùng (và giới hạn)

### Có sẵn (đã dùng)

| Artefact | Coin / cửa sổ | Đo gì |
|----------|---------------|--------|
| `docs/REPORT_V41_BACKTEST_180D_WINRATE_2026-08-01.md` | NEAR 180d / 30d | confTR ∩ gate ≥3/4; sweep ≤≥70; outcome |
| `docs/REPORT_V41_CVD_PRODUCTION_VS_PRIORAVG_POSTFIX_180D_2026-08-01.md` | NEAR 180d | CVD prod vs priorAvg; gate; confTR ≥40/50 + WR |
| `docs/REPORT_V41_SL_WINDOW_FIX_AND_REBACKTEST_180D_2026-08-01.md` | NEAR 180d | CVD production; gate 20; confTR≥50 n=19; WR |
| `docs/REPORT_V41_TR_CONFIDENCE_REAL_RECALC_2026-08-01.md` | NEAR 30d | Phân phối confTR thật; max; ≥70 = 0% |
| `docs/REPORT_V41_COMBINED_EXHAUSTION_CVD_RECALC_2026-08-01.md` | NEAR 30d | Gate ∩ confTR sweep đến ≥70 |
| `docs/outputs/_rulebook_4symbol_tier_report.json` + `01_RULEBOOK_V41_*_LIVE_SCAN*.md` | BTC/NEAR/SOL/BNB 1 snapshot live | Decision Confidence thật (`finalConfidence`) vs ≥75 |
| `docs/exports/REPORT_V4_NEAR_L1_L3_L6_OPTIMIZE_CVD220_2026-08-02.md` | NEAR V4 180d | Tần suất lệnh V4 (so sánh thô) |
| `docs/exports/REPORT_V41_REVERSAL_CROSS_SYMBOL_FILTER_SEARCH_2026-08-01.md` | Multi-symbol decided trades | confTR trên mẫu đã vào lệnh (p50≈58, p75≈63) — có bias selection |

### Không có trên disk lúc báo cáo (CSV đã mất / chưa tạo)

- `v41-backtest-180d-*.csv`, `v41-tr-confidence-real-per-bar-*.csv`, `backtest-v41-near-pipeline-funnel.csv`
- Phân phối Decision finalConfidence bar-level 180d × 4 coin
- Funnel: conf≥75 → sau đó % vẫn bị Market Context / EW / Momentum / hard block chặn thành LONG/SHORT

Mục phân phối Decision conf 180d × 4 coin không thể điền đầy đủ từ artefact. Phần dưới tách rõ proxy confTR vs Decision conf live.

Không chạy script mới theo lựa chọn A.

---

## 3. Phân phối / tần suất

### 3.1 Decision Confidence thật — snapshot live 4 coin

Nguồn: `_rulebook_4symbol_tier_report.json` (1 scan / coin).

| Symbol | Decision Confidence | Band so với 45/75 | Decision output |
|--------|--------------------:|-------------------|-----------------|
| BTCUSDT | 12.909375 | <45 IGNORE | IGNORE |
| NEARUSDT | 12.909375 | <45 IGNORE | IGNORE |
| SOLUSDT | 12.909375 | <45 IGNORE | IGNORE |
| BNBUSDT | 7.875 | <45 IGNORE | IGNORE |

- ≥75: 0/4 (0%)
- 45–75: 0/4
- <45: 4/4 (100%)

Đây chỉ là một thời điểm — không thay thế 180d. Nhưng cùng hệ số `finalConfidence` mà Decision đang dùng.

### 3.2 Confidence TR (proxy lịch sử) — NEAR 180d / 30d

Backtest báo cáo confidenceTR, filter theo gate ≥3/4; không phải % mọi nến 4H rơi vào band Decision.

#### A) NEAR 180d · CVD production (n clocks = 1079 ≈ 6 tháng 4H)

| Metric | Count | % / 1079 |
|--------|------:|---------:|
| Gate ≥3/4 | 20 | 1.9% |
| Gate ∧ confTR ≥50 | 19 | 1.8% |
| Cột ≥70 / ≥75 trong report production | không có (sweep dừng ≥50) | — |

#### B) NEAR 180d · CVD priorAvg_vs_c experiment (cùng 1079)

| Metric | Count | % / 1079 |
|--------|------:|---------:|
| Gate ≥3/4 | 32 | 3.0% |
| Gate ∧ confTR ≥50 | 31 | 2.9% |
| Gate ∧ confTR ≥70 | 5 | 0.46% |
| Gate ∧ confTR ≥75 | không đo | ≤ 0.46% (ceiling từ ≥70) |

#### C) NEAR 30d · confTR thật mọi bar (n=179) — TR_CONFIDENCE_REAL_RECALC

| | n=179 | non-neutral 131 |
|--|------:|-----------------:|
| median | 0 | 17.5 |
| mean | 12.16 | 16.62 |
| max | 67.5 | 67.5 |
| ≥70 | 0 (0%) | 0% |

Trần toán học confTR khi Exhaustion chưa confirm: (100+100+0+70)/4 = 67.5 → confTR ≥70 (và ≥75) bất khả thi nếu thiếu Exhaustion — đúng pattern UI BNB (3/4, Exhaustion ✕, TR=58).

#### D) Band Decision proxy trên confTR (ước lượng thô, không bằng Decision engine)

Nếu nhầm dùng confTR như Decision confidence trên mọi bar 30d NEAR (median 0, max 67.5):

- <45: phần lớn thời gian (median 0)
- 45–75: minority trong đuôi phân phối
- ≥75: 0% quan sát

Trên 180d, thậm chí trong tập đã qua gate, ≥70 chỉ 5 clock / 1079 (experiment CVD) → <0.5% thời gian.

### 3.3 Trong số lần ≥75, bao nhiêu % thành LONG/SHORT?

Không đo được từ artefact hiện có — thiếu histogram Decision conf và funnel sau Market Context / EW / Momentum.

Gần nhất:

- Script thiết kế funnel: `scripts/backtest-v41-near-pipeline-funnel.ts` — chưa có CSV kết quả trong `docs/exports/`.
- Live 4-coin: 0 lần ≥75 → mẫu số = 0.

---

## 4. Tần suất lệnh / tháng — V4.1 vs V4

### V4.1 (NEAR) — proxy từ backtest gate ∩ confTR (không phải Decision ≥75)

| Cửa sổ / mode | n active proxy | ≈ / tháng (÷6 cho 180d) | Ghi chú |
|---------------|----------------:|-------------------------:|---------|
| 180d CVD production · gate∧confTR≥50 | 19 | ~3.2 | WR ~42–47% ở conf≥40/50 (SL fix reports) |
| 180d CVD priorAvg experiment · gate∧confTR≥50 | 31 | ~5.2 | Không phải production CVD |
| 180d priorAvg · gate∧confTR≥70 | 5 | ~0.8 | Gần cửa hẹp hơn với 75 |
| Decision ≥75 → LONG/SHORT thật | chưa có n | không ước | Live snapshot 0 |

BTC/SOL/BNB/NEAR 4 coin × 180d Decision ≥75: không có bảng sẵn.

### V4 (NEAR) — so sánh thô tần suất

Từ `REPORT_V4_NEAR_L1_L3_L6_OPTIMIZE_CVD220` (path V4 scorer, không dùng Decision conf 75):

| | Ước lượng |
|--|-----------|
| LONG / 180d | 29 ≈ 4.8 lệnh/tháng |
| SHORT baseline CVD220 | hàng chục–hàng trăm / 180d tùy filter |

So sánh công bằng bị hạn chế: V4 vào lệnh theo score/layer; V4.1 TR vào Decision theo `finalConfidence≥75`.

Quan sát: proxy V4.1 gate+confTR≥50 ~3 lệnh/tháng NEAR đã thưa hơn V4 LONG-only (~4.8); cửa Decision ≥75 còn thắt hơn và chưa thấy sample kích hoạt trong live 4-coin.

---

## 5. Winrate khi đủ mạnh — proxy gần nhất conf ≥75

Không có WR riêng Decision conf ≥75. Proxy từ reports (geometry TP1/SL, gate∧confTR):

| Mẫu | n | WR |
|-----|--:|---:|
| NEAR 180d CVD production · confTR≥50 (sau SL window fix) | 19 | 42.1% |
| NEAR 180d CVD production · confTR≥40 | 20 | 40.0% |
| NEAR 180d priorAvg · confTR≥50 | 31 | 42.3% |
| NEAR 180d priorAvg · confTR≥70 | 5 | n quá nhỏ — không báo WR ổn định |
| NEAR 30d (mẫu nhỏ) · ≥40/50 | 7 | 83% — report cảnh báo overfitting |

Quan sát (không khuyến nghị): Ở mức confTR≥50 đã ~40–42% WR trên 180d. Không có bằng chứng WR cao rõ riêng cho ngưỡng 75 vì mẫu ≥70/≥75 gần như trống.

---

## 6. Case BNB UI (TR 58, 3/4, WATCH) — gắn với ngưỡng 75

| Quan sát UI | Ý nghĩa trong pipeline |
|-------------|------------------------|
| GATE ACTIVE · 3/4 · Exhaustion ✕ | confTR đạt ACTIVE; max confTR không Exhaustion = 67.5 (đúng với 58) |
| Badge WATCH | Decision path: không LONG/SHORT — thường vì finalConfidence < 75 và/hoặc eligibility/context (không vì đòi 4/4) |
| Không nên đọc 58 gần 75 | 58 là TR, 75 là Decision finalConfidence — hai trục |

---

## 7. Trả lời tuần tự yêu cầu gốc

1. Script sẵn có: dùng report từ `backtest-v41-*` / `recalc-v41-*` / live rulebook — không tạo script mới; CSV per-bar đa phần không còn trên disk.
2. Phân phối 4 coin × 180d Decision conf: thiếu histogram sẵn. Có: (a) live 4 coin Decision conf; (b) NEAR confTR 30d/180d. Kết luận định hướng: ≥75 rất hiếm.
3. Lệnh/tháng V4.1: chỉ ước từ proxy gate∧confTR NEAR (~3/tháng @≥50; ~0.8/tháng @≥70 experiment). Decision≥75: không có n. V4 NEAR LONG ~4.8/tháng (khác engine).
4. <5% thời gian? Với confTR≥70 trên 180d NEAR: 0.46% (<5%). Decision≥75 live snapshot: 0%. → Có dấu hiệu ngưỡng Decision 75 khắt / hiếm đạt — chỉ nêu quan sát.
5. WR conf≥75: không đo được; proxy confTR≥50 ~40–42% 180d — không chứng minh trade-off hiếm nhưng chất lượng cao ở đúng mức 75.
6. Không sửa / không đề xuất đổi ngưỡng.

---

## 8. Gap dữ liệu nếu cần số đủ điều kiện task (lần sau — ngoài phạm vi A)

1. Chạy (hoặc mở rộng) `backtest-v41-near-pipeline-funnel.ts` multi-symbol 180d, ghi `finalConfidence` + `decision` từng bar.
2. Histogram: `% <45 / [45,75) / ≥75` cho BTC/SOL/BNB/NEAR.
3. Conditional: trong `finalConfidence≥75`, tỷ lệ `decision ∈ {LONG,SHORT}` sau Context/EW/Momentum/eligibility.
4. Optional: WR chỉ trên bar Decision LONG/SHORT thật.

---

## 9. Tham chiếu chính

- `services/v41/decision/decisionConfig.ts` — `thresholds.long/short = 75`, `watch = 45`
- `services/v41/confidenceEngine.ts` / `confidence/confidenceConfig.ts` — `finalConfidence`
- `services/v41/rc3/buildRc3ViewModel.ts` — TR vs Decision wire
- Reports 2026-08-01 listed in §2

**Status:** báo cáo xong — không sửa code.
