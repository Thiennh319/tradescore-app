/**
 * TradeScore AI Audit Output Template — GĐ3 Task 02 (Single Source of Truth).
 * Chuẩn OUTPUT duy nhất cho GPT / Claude / Gemini.
 * Không phụ thuộc model — mọi AI phải trả về cùng cấu trúc báo cáo.
 */

export const TRADE_SCORE_AUDIT_OUTPUT_TEMPLATE_VERSION = '1.0';

export function getTradeScoreAuditOutputTemplate(): string {
  return TRADE_SCORE_AUDIT_OUTPUT_TEMPLATE_BODY;
}

const TRADE_SCORE_AUDIT_OUTPUT_TEMPLATE_BODY = `================================================================================
OVERALL RESULT
================================================================================

Overall

PASS | FAIL | INSUFFICIENT_EVIDENCE

Confidence

0~100%

Summary

<1-3 dòng>

================================================================================
RULE CHECK
================================================================================

Rule Book

PASS | FAIL

Decision Trace

PASS | FAIL

Market Evidence

PASS | FAIL

Actual Result

PASS | FAIL

================================================================================
LAYER AUDIT
================================================================================

L1 EMA

PASS | FAIL

Expected

Actual

Reason

-----------------------------------------

L2 RSI

PASS | FAIL

Expected

Actual

Reason

-----------------------------------------

L3 MACD

PASS | FAIL

Expected

Actual

Reason

-----------------------------------------

L4 BOLLINGER

PASS | FAIL

Expected

Actual

Reason

-----------------------------------------

L5 VOLUME/CVD

PASS | FAIL

Expected

Actual

Reason

-----------------------------------------

L6 FUNDING

PASS | FAIL

Expected

Actual

Reason

-----------------------------------------

L7 L/S RATIO

PASS | FAIL

Expected

Actual

Reason

-----------------------------------------

L8 BTC

PASS | FAIL

Expected

Actual

Reason

-----------------------------------------

L9 SESSION

PASS | FAIL

Expected

Actual

Reason

-----------------------------------------

L10 PSYCHOLOGY

PASS | FAIL

Expected

Actual

Reason

-----------------------------------------

L11 SQUEEZE

PASS | FAIL

Expected

Actual

Reason

================================================================================
TRADE PLAN AUDIT
================================================================================

Decision

PASS | FAIL

Direction

PASS | FAIL

Entry

PASS | FAIL

Stop Loss

PASS | FAIL

Take Profit

PASS | FAIL

Hard Block

PASS | FAIL

================================================================================
ROOT CAUSE
================================================================================

Fail Type

RULE_IMPLEMENTATION | CONFIG | MARKET_DATA | MISSING_EVIDENCE | UNKNOWN

----------------------------------------------------------

Suspected Module

<module>

Confidence

0~100%

Reason

================================================================================
FIX RECOMMENDATION
================================================================================

(Chỉ khi FAIL.)

Không sửa Rule.
Không tối ưu Strategy.
Chỉ sửa phần implementation.

================================================================================
CURSOR PROMPT
================================================================================

(Sinh Prompt hoàn chỉnh.)

Prompt phải:
- chỉ sửa module liên quan
- không sửa Rule
- không sửa module khác
- giữ backward compatibility

================================================================================
RÀNG BUỘC
================================================================================

AI không được:
- phát minh Rule mới
- tối ưu Rule
- đề xuất Entry mới
- đề xuất Strategy mới
- thay đổi Threshold

Chỉ đánh giá app có chạy đúng RuleBook hay không.

Nếu thiếu dữ liệu → INSUFFICIENT_EVIDENCE`;
