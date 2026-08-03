# REPORT — V4.1: ACTIVE ≥3/4 vs `requiredTrendSignalCount=4`

**Date:** 2026-08-03  
**Scope:** Điều tra only — không sửa code  
**Trigger:** Export `01_RULEBOOK_V41` ghi Gates `ACTIVE (cần ≥3/4 signals)` trên các rule TR, trong khi Evidence `decision_eligibility` có `requiredTrendSignalCount=4`. UI BNB: GATE ACTIVE, 3/4, Confidence 58/50, status WATCH.

---

## 0. Kết luận

| Hạng mục | Phân loại |
|----------|-----------|
| ACTIVE ≥3/4 (+ conf TR ≥50) | Thiết kế cố ý (experiment hạ từ 4→3, 2026-07-26) |
| `isEligibleForDirection` không check count ≥4 | Cố ý — comment: double-gate thừa khi TR đã ACTIVE |
| Config/export vẫn dump `requiredTrendSignalCount=4` | Stale / lệch hiển thị — dễ hiểu nhầm là luật runtime |
| BNB WATCH (58 conf, 3/4, Exhaustion ✕) | Đúng hành vi — chủ yếu vì Decision conf 58 < 75 (TR number trên card); không phải vì thiếu Exhaustion / 4/4 eligibility |

Lưu ý: số 58 trên card là Confidence TR; Decision dùng `finalConfidence` riêng. Chi tiết thêm: `REPORT_V41_DECISION_CONFIDENCE_GE75_DIFFICULTY_2026-08-03.md`.

Không phải bug UI nói 3/4 nhưng eligibility bắt 4/4 trong logic vào lệnh hiện tại. Mâu thuẫn nằm ở Evidence/config còn sót số 4.

---

## 1. Hai hằng số (file / dòng)

### 1.1. Ngưỡng ACTIVE (state TR)

| | |
|--|--|
| Tên | `TREND_REVERSAL_ACTIVE_MIN_SIGNALS` |
| Giá trị | `3` |
| File | `services/v41/reversalDetector.ts` |
| Định nghĩa | ~L126–132 (comment: hạ 4/4 → 3/4, thử nghiệm 2026-07-26; rollback = đặt lại 4) |
| Dùng gate state | `resolveTrendReversalState` ~L685–692: count < 3 → WATCH; conf < TREND_REVERSAL_CONFIDENCE_MIN (50) → WATCH; else ACTIVE |

UI RC3 (cùng SSOT):

- `services/v41/rc3/buildRc3ViewModel.ts` ~L56–88
  - `signalsRequired = TREND_REVERSAL_ACTIVE_MIN_SIGNALS` (=3)
  - `activeEligible = signalsMet && confidenceMet` (≥3/4 và conf ≥50)

Export Rulebook label:

- `services/v41Export/rulebook/Builder.ts` ~L74–76
  - `TH_TR_ACTIVE_MIN_SIGNALS` ← import SSOT
  - `TR_ACTIVE_GATES = ACTIVE (cần ≥${TH_TR_ACTIVE_MIN_SIGNALS}/4 signals)` → hiện ≥3/4

### 1.2. `requiredTrendSignalCount` (config eligibility)

| | |
|--|--|
| Tên | `V41_DECISION_CONFIG.eligibility.requiredTrendSignalCount` |
| Giá trị | `4` |
| File | `services/v41/decision/decisionConfig.ts` ~L14–15 |

Dump vào Evidence export (không mirror logic riêng):

- `services/v41Export/rulebook/Builder.ts` → `evaluateDecisionEligibility` ~L110–128
  - Luôn ghi `requiredTrendSignalCount` từ config vào Evidence kèm `trendSignalCount`, dù runtime không so sánh hai giá trị này.

---

## 2. Eligibility thực sự check gì?

`services/v41/decisionEngine.ts` — `isEligibleForDirection` (~L56–86):

1. `requireTrendReversalConfirmed` → `ctx.trendReversalConfirmed`
2. Market Context pass / not denied (theo config)
3. `completenessMultiplier ≥ minCompletenessMultiplier` (0.65)
4. `hardBlocks.length === 0`
5. Không so `trendSignalCount` với `requiredTrendSignalCount`

Comment trong code (~L80–81):

> Không check trendSignalCount vs requiredTrendSignalCount — TR ACTIVE (trendReversalConfirmed) đã đủ; count≥4 là double-gate thừa.

`trendReversalConfirmed` (`services/v41/confidence/decisionContext.ts` ~L40–43):

> Confirmed = TR đã ACTIVE (binary ≥3/4 hoặc continuous ≥0.6). Không đòi thêm count≥4.

→ Sau khi ACTIVE (≥3/4 + conf TR), eligibility không đòi đủ 4/4.

---

## 3. Hai tầng thật (thiết kế) vs tầng ảo (export)

### Tầng thật

| Tầng | Ý nghĩa | Ngưỡng |
|------|---------|--------|
| A — TR ACTIVE | Setup mở trên RC3 / state TR | ≥3/4 signal + conf TR ≥50 |
| B — Decision LONG/SHORT | Được phép kích hoạt hướng | Eligibility (A confirmed + context + completeness + no hard block) và confidence Decision ≥75 (`thresholds.long` / `short`) |

`thresholds.watch = 45` → conf ∈ [45, 75) thường ra WATCH nếu chưa đạt LONG/SHORT.

### Tầng ảo (gây hiểu nhầm)

| | |
|--|--|
| Config `requiredTrendSignalCount=4` | Còn trong `decisionConfig`, không enforce trong `isEligibleForDirection` |
| Evidence Rulebook | Vẫn in `requiredTrendSignalCount=4` cạnh `trendSignalCount` |
| Warning copy Decision | ~L201–202 còn chữ chưa xác nhận đủ 4 điều kiện khi `!trendReversalConfirmed` — lệch copy so với ACTIVE=3 |

Mục đích ACTIVE 3/4: nới cửa state TR (nhiều case vào ACTIVE hơn), lọc lệnh ở Decision (conf ≥75 + context).  
Không còn thiết kế ACTIVE dễ 3/4 nhưng eligible bắt 4/4.

### Gợi ý UX (không implement trong task này)

- Không thêm dòng eligibility cần 4/4 — sai so với runtime.
- Nếu làm rõ: ACTIVE ≠ vào lệnh; cần Confidence ≥75 (+ Market Context…).

---

## 4. Case BNB (screenshot UI)

Quan sát card:

- Coin: BNB, trigger Trend Reversal
- Badge: WATCH
- Confidence TR: 58/50 cần thiết (xanh — đạt min ACTIVE)
- Tiêu đề: GATE ACTIVE ĐẠT (≥3/4 + CONF)
- 3/4 điều kiện đạt (cần ≥3/4)
- ✓ CVD Flip · ✓ Volume Confirm · ✓ Structure Break · ✕ Exhaustion

### Khớp code

| Điều kiện UI/engine | Kết quả |
|---------------------|---------|
| 3 ≥ ACTIVE_MIN_SIGNALS(3) | Pass → đủ signal-gate ACTIVE |
| 58 ≥ conf min 50 | Pass → activeEligible / GATE ACTIVE |
| Exhaustion fail | Chỉ làm count = 3; không block eligibility vì thiếu 4/4 |
| Decision long/short threshold 75 | Decision dùng finalConfidence (khác số TR 58 trên card) → không LONG/SHORT → WATCH |

### Kết luận case BNB

WATCH không do thiếu đúng 1/4 Exhaustion trong khi eligibility đòi 4/4.

Nguyên nhân chính khớp code: chưa đạt ngưỡng kích hoạt Decision LONG/SHORT (75 trên finalConfidence), không phải requiredTrendSignalCount=4.

Nguyên nhân phụ có thể (cần full Evidence decision_eligibility / Market Context trên export cùng scan): Market Context fail, completeness < 0.65, hard blocks. Không suy từ ảnh rằng Early Warning / Momentum là lý do chính.

---

## 5. Ma trận xác nhận

| Câu hỏi | Trả lời |
|---------|---------|
| UI ≥3/4 và export Gates ≥3/4 có đúng ACTIVE? | Có — SSOT TREND_REVERSAL_ACTIVE_MIN_SIGNALS=3 |
| Eligibility runtime có bắt 4/4? | Không |
| Evidence requiredTrendSignalCount=4 có phải luật đang chạy? | Không — stale dump từ config |
| Có phải bug logic vào lệnh 3 vs 4? | Không — lệch hiển thị/config |
| BNB WATCH vì thiếu Exhaustion? | Không (theo runtime) — chủ yếu chưa đạt cửa Decision ≥75 |

---

## 6. Tham chiếu nhanh

- `services/v41/reversalDetector.ts` — TREND_REVERSAL_ACTIVE_MIN_SIGNALS, resolveTrendReversalState
- `services/v41/decision/decisionConfig.ts` — requiredTrendSignalCount: 4, thresholds 75/45/25
- `services/v41/decisionEngine.ts` — isEligibleForDirection, evaluateDecision
- `services/v41/confidence/decisionContext.ts` — trendReversalConfirmed
- `services/v41/rc3/buildRc3ViewModel.ts` — UI gate summary
- `services/v41Export/rulebook/Builder.ts` — TR_ACTIVE_GATES, Evidence eligibility

---

## 7. Follow-up đề xuất (ngoài phạm vi — chưa làm)

1. Xóa hoặc annotate `requiredTrendSignalCount` trong Evidence (hoặc đổi thành deprecated / not enforced).
2. Sửa copy warning đủ 4 điều kiện → đủ điều kiện ACTIVE (≥3/4 + conf).
3. UI: một dòng ngắn ACTIVE ≠ vào lệnh (cần conf ≥75).

**Status task:** báo cáo xong — không sửa code.
