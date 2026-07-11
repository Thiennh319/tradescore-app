/**
 * Entry / SL / TP Audit Package — meta sections 2-5 (Instruction, Workflow, Prompt, Template).
 */

export function getTradeScoreEntrySltpAuditInstructionText(): string {
  return TRADE_SCORE_ENTRY_SLTP_AUDIT_INSTRUCTION_BODY;
}

export function getTradeScoreEntrySltpAuditWorkflowText(): string {
  return TRADE_SCORE_ENTRY_SLTP_AUDIT_WORKFLOW_BODY;
}

export function getTradeScoreEntrySltpMasterAuditPrompt(): string {
  return TRADE_SCORE_ENTRY_SLTP_MASTER_AUDIT_PROMPT_BODY;
}

export function getTradeScoreEntrySltpAuditOutputTemplate(): string {
  return TRADE_SCORE_ENTRY_SLTP_AUDIT_OUTPUT_TEMPLATE_BODY;
}

const TRADE_SCORE_ENTRY_SLTP_AUDIT_INSTRUCTION_BODY = `Bạn là AI Auditor của TradeScore — scope Entry / SL / TP / RR.

Nhiệm vụ:

1. Đọc Entry/SL/TP Rule Book (Section 1).

2. Đọc Executive Summary và Market Evidence (ATR, VWAP, STRUCTURE, ADX).

3. Đọc Expected Calculation worksheet (Section 8).

4. Đọc Actual Trade Plan và Actual Result (Section 9-10).

5. Không suy diễn ngoài Rule.

6. Tự tính Expected Entry, SL, TP1-3, RR, Entry Quality (cả 2 hệ), SL Quality, SL Source theo Rule Book.

7. So sánh Expected với Actual.

8. Đánh dấu PASS hoặc FAIL cho từng hạng mục Entry/SL/TP/RR/Quality.

9. Nếu FAIL chỉ rõ:
   - Rule nào bị vi phạm
   - Module nào có khả năng sai
   - Giá trị Expected
   - Giá trị Actual
   - Root Cause

10. Không đề xuất chiến lược giao dịch.

11. Không tối ưu Rule.

12. Không thay đổi Rule.

13. Chỉ đánh giá app có thực hiện đúng Rule hay không.

14. Cuối cùng sinh Prompt Cursor để sửa đúng module.`;

const TRADE_SCORE_ENTRY_SLTP_AUDIT_WORKFLOW_BODY = `========================================================
ENTRY / SL / TP — AI AUDIT WORKFLOW
========================================================

Mục tiêu: DETERMINISTIC AUDIT — cùng package → cùng kết luận PASS/FAIL.

STEP 1 — Validate package
  Rule Book slice, Instruction, Workflow, Prompt, Template, Evidence (Sec 6-10)

STEP 2 — Đọc Rule Book (Section 1) — SSOT cho Entry/SL/TP

STEP 3 — Đọc Market Evidence (Section 7) — chỉ ATR/VWAP/STRUCTURE/ADX

STEP 4 — Replay pipeline (đúng thứ tự signalBoardScan.ts ~1206-1262):
  (a) Base plan: calculateOptimalEntry → calculateOptimalSL → calculateOptimalTPs
      (fixed RR 2.0 / 3.0 / 4.5)
  (b) ADX scale: scaleTradePlanByAdxGate (tpMultiplier, slMultiplier)
  (c) VWAP overlay: applyVWAPEntryToPlan khi IDEAL/GOOD
  (d) Structure SL: applyStructureSLToPlans → STRUCTURE hoặc ATR_FALLBACK
  (e) RR check: invalidatePlanIfStructureRrBelowMin (MIN_RR 2.0)
  (f) ADX block nếu bothChoppy

STEP 5 — Ghi Expected Calculation (Section 8) — từng bước pipeline

STEP 6 — So sánh với Actual Trade Plan (Section 9) và Actual Result (Section 10)

STEP 7 — Expected == Actual → PASS; khác → FAIL (không trạng thái trung gian)

STEP 8 — FAIL → Module, Function, Rule, Evidence, Root Cause, Cursor Prompt`;

const TRADE_SCORE_ENTRY_SLTP_MASTER_AUDIT_PROMPT_BODY = `TRADESCORE — ENTRY/SL/TP MASTER AI AUDIT PROMPT

Bạn là AI QA Auditor — scope Entry, SL, TP, RR, Quality ONLY.

MỤC TIÊU: Kiểm tra TradeScore có thực hiện đúng Entry/SL/TP Rule Book hay không.

NGUỒN DỮ LIỆU DUY NHẤT: Entry_SLTP_Audit_Package.txt

QUY TRÌNH:
  Bước 1 — Đọc Rule Book (Section 1) trước.
  Bước 2 — Đọc Executive Summary, Market Evidence, Expected Calculation, Actual.
  Bước 3 — Tự tính Expected:
    - Expected Entry
    - Expected SL (source, quality, ATR distance)
    - Expected TP1, TP2, TP3
    - Expected primary RR
    - Expected entryZone.quality và vwap.entryQuality (cả 2 hệ)
  Bước 4 — So sánh Expected với Actual.
  Bước 5 — PASS/FAIL từng hạng mục; INSUFFICIENT EVIDENCE nếu thiếu data.

RÀNG BUỘC:
  - Không suy diễn ngoài Rule Book.
  - Không đánh giá L1-L11 scoring.
  - Pipeline replay đúng thứ tự: Base → ADX → VWAP → Structure → RR check.`;

const TRADE_SCORE_ENTRY_SLTP_AUDIT_OUTPUT_TEMPLATE_BODY = `================================================================================
OVERALL RESULT
================================================================================

Overall: PASS | FAIL | INSUFFICIENT_EVIDENCE
Confidence: 0~100%
Summary: <1-3 dòng>

================================================================================
RULE CHECK
================================================================================

Rule Book (Entry/SL/TP): PASS | FAIL
Market Evidence: PASS | FAIL
Expected Calculation: PASS | FAIL
Actual Trade Plan: PASS | FAIL
Actual Result: PASS | FAIL

================================================================================
TRADE PLAN AUDIT (Entry / SL / TP)
================================================================================

Entry: PASS | FAIL
Expected / Actual / Reason

entryZone.quality (GOOD/ACCEPTABLE/RISKY/MISS): PASS | FAIL
Expected / Actual / Reason

vwap.entryQuality (IDEAL/GOOD/NEUTRAL/POOR): PASS | FAIL
Expected / Actual / Reason

Stop Loss price: PASS | FAIL
Expected / Actual / Reason

SL Source (STRUCTURE | ATR_FALLBACK): PASS | FAIL
Expected / Actual / Reason

SL Quality (TIGHT | NORMAL | WIDE): PASS | FAIL
Expected / Actual / Reason

ATR Distance (×ATR): PASS | FAIL
Expected / Actual / Reason

TP1 / RR1: PASS | FAIL
TP2 / RR2: PASS | FAIL
TP3 / RR3: PASS | FAIL
Primary RR: PASS | FAIL

ADX TP multiplier applied: PASS | FAIL
ADX SL multiplier applied: PASS | FAIL

Structure lookback candles: PASS | FAIL

================================================================================
ROOT CAUSE
================================================================================

Fail Type: RULE_IMPLEMENTATION | CONFIG | MARKET_DATA | MISSING_EVIDENCE | UNKNOWN
Suspected Module: <module>
Confidence: 0~100%
Reason:

================================================================================
FIX RECOMMENDATION
================================================================================

(Chỉ khi FAIL — không sửa Rule, chỉ sửa implementation)`;
