/**
 * ================================================================================
 * TRADESCORE — AI AUDITOR WORKFLOW (GĐ3 — TASK 04 REVISION)
 * ================================================================================
 *
 * Task ID     : GĐ3-T04-R1
 * Type        : Read-only Specification (NOT runtime source code)
 * Version     : 1.1
 * Date        : 2026-07-11
 *
 * PURPOSE
 * -------
 * Định nghĩa workflow DETERMINISTIC AUDIT để mọi AI
 * (GPT / Claude / Gemini / DeepSeek / Qwen / ...)
 * audit TradeScore và đưa ra CÙNG MỘT kết luận PASS hoặc FAIL.
 *
 * CONSTRAINTS
 * -----------
 * - Không chứa business logic.
 * - Không chứa implementation.
 * - Không import module runtime.
 * - Không export function.
 * - Không thay đổi Rule, Scorer, Snapshot, TradePlan, UI, Audit Package.
 *
 * INPUT DUY NHẤT
 * --------------
 * TradeScore_Audit_Package.txt (Single Source of Truth)
 *
 * ================================================================================
 */

const TRADE_SCORE_AI_AUDIT_WORKFLOW_SPEC = `================================================================================
TRADESCORE — DETERMINISTIC AI AUDIT WORKFLOW
================================================================================

Document ID   : GĐ3-T04-R1
Version       : 1.1
Date          : 2026-07-11
Type          : Specification (read-only)
Status        : FROZEN

================================================================================
1. MỤC TIÊU — DETERMINISTIC AUDIT
================================================================================

TradeScore_Audit_Package.txt PHẢI được thiết kế theo nguyên tắc DETERMINISTIC AUDIT.

Nghĩa là:

  Bất kỳ AI nào (GPT, Claude, Gemini, DeepSeek, Qwen, ...)
  khi tuân thủ Audit Package
  đều PHẢI đưa ra cùng một kết luận:

    PASS
    hoặc
    FAIL

Không phụ thuộc vào mô hình AI.

Nếu các AI đưa ra kết luận khác nhau,
nguyên nhân được xem là do Audit Package chưa đủ xác định,
KHÔNG phải do AI.

Workflow này là tài liệu đặc tả (Specification).
Workflow KHÔNG phải code chạy runtime.
Workflow KHÔNG chứa business logic.
Workflow KHÔNG chứa implementation.

================================================================================
2. NGUYÊN TẮC CỐT LÕI — SINGLE SOURCE OF TRUTH
================================================================================

TradeScore_Audit_Package.txt là nguồn sự thật duy nhất.

AI KHÔNG ĐƯỢC sử dụng:

  - Kiến thức trading.
  - Kinh nghiệm cá nhân.
  - Kiến thức thị trường.
  - Suy luận ngoài Rule.
  - Phán đoán chủ quan.

Mọi kết luận PHẢI được suy ra từ Audit Package.

Cấu trúc package (tham chiếu — không copy text):

  Package Header
  SECTION 1  — RULE BOOK
  SECTION 2  — AI AUDIT INSTRUCTION
  SECTION 3  — MASTER AUDIT PROMPT
  SECTION 4  — AI OUTPUT TEMPLATE
  SECTION 5  — EXECUTIVE SUMMARY
  SECTION 6  — MARKET EVIDENCE
  SECTION 7  — RULE DECISION
  SECTION 8  — TRADE PLAN
  SECTION 9  — ACTUAL RESULT
  SECTION 10 — BASELINE

Không đọc source code.
Không dùng kiến thức bên ngoài package.
Không giả định dữ liệu không có trong package.

================================================================================
3. DETERMINISTIC RULE — ĐỊNH DẠNG BẮT BUỘC
================================================================================

Mỗi Rule PHẢI được replay theo chuỗi cố định:

  INPUT
    ↓
  CONDITION
    ↓
  EXPECTED OUTPUT
    ↓
  ACTUAL OUTPUT
    ↓
  COMPARE RESULT

Ví dụ:

--------------------------------------------------------

INPUT

RSI = 82

CONDITION

RSI > 80

EXPECTED OUTPUT

Score = 0

ACTUAL OUTPUT

Score = 1.5

COMPARE RESULT

FAIL

--------------------------------------------------------

QUY TẮC EXPECTED (BẮT BUỘC)
---------------------------

AI KHÔNG ĐƯỢC tự tính Expected theo cảm tính hoặc kinh nghiệm.

Expected PHẢI được xác định DUY NHẤT từ Rule Book (SECTION 1):

  1. Lấy INPUT từ SECTION 6 (MARKET EVIDENCE).
  2. Áp dụng CONDITION được Rule Book định nghĩa cho layer/hạng mục đó.
  3. EXPECTED OUTPUT = kết quả Rule Book quy định khi CONDITION thỏa/không thỏa.
  4. ACTUAL OUTPUT = giá trị từ Application Output (SECTION 5 / 7 / 8 / 9).
  5. COMPARE RESULT = so sánh cứng Expected vs Actual.

Nếu Rule Book không đủ rõ để xác định Expected
  → INSUFFICIENT_EVIDENCE (không được đoán).

================================================================================
4. AI AUDIT WORKFLOW — 5 BƯỚC (KHÔNG ĐƯỢC BỎ / ĐẢO THỨ TỰ)
================================================================================

Bước 1 — Kiểm tra Audit Package đầy đủ
  |
  |  Đọc toàn bộ TradeScore_Audit_Package.txt.
  |  Ghi nhận Package Version, Rule Version, Snapshot Version,
  |  Evidence Version, Generated Time.
  |  Kiểm tra đủ 10 SECTION.
  |
  |  Nếu thiếu dữ liệu bắt buộc
  |    ↓
  |  INSUFFICIENT_EVIDENCE
  |    ↓
  |  DỪNG — không tiếp tục audit.
  |
  v
Bước 2 — Đọc Rule
  |
  |  Đọc SECTION 1 (RULE BOOK).
  |  Rule là nguồn sự thật duy nhất để xác định Expected.
  |  Không bổ sung, không sửa, không suy diễn Rule.
  |
  v
Bước 3 — Đọc Evidence
  |
  |  Đọc SECTION 6 (MARKET EVIDENCE).
  |  Không giả định.
  |  Không nội suy.
  |  Chỉ dùng giá trị có trong package.
  |
  v
Bước 4 — Replay từng Layer (L1 → L11)
  |
  |  Theo Rule Book, replay từng layer theo thứ tự:
  |
  |    L1  EMA
  |    L2  RSI
  |    L3  MACD
  |    L4  BOLLINGER
  |    L5  VOLUME / CVD
  |    L6  FUNDING
  |    L7  L/S RATIO
  |    L8  BTC CONTEXT
  |    L9  SESSION
  |    L10 PSYCHOLOGY
  |    L11 SQUEEZE
  |
  |  Mỗi Layer BẮT BUỘC sinh đủ 5 trường:
  |    Input | Expected | Actual | PASS/FAIL | (Rule reference)
  |
  |  Không bỏ layer. Không đảo thứ tự.
  |
  v
Bước 5 — Replay Group Score → Decision → Trade Plan → Final Status
  |
  |  Theo Rule Book, replay lần lượt:
  |    - Group Score (A / B / C nếu Rule Book định nghĩa)
  |    - Total Score (Long / Short / Final)
  |    - Decision Band, Direction, Recommendation
  |    - Entry, Stop Loss, Take Profit
  |    - Hard Block, Group Block
  |    - Final Entry Status
  |
  |  Mỗi hạng mục BẮT BUỘC sinh:
  |    Input | Expected | Actual | PASS/FAIL
  |
  |  Actual lấy từ:
  |    SECTION 5  EXECUTIVE SUMMARY
  |    SECTION 7  RULE DECISION
  |    SECTION 8  TRADE PLAN
  |    SECTION 9  ACTUAL RESULT

================================================================================
5. AUDIT ORDER (THỨ TỰ CỐ ĐỊNH — KHÔNG ĐƯỢC THAY ĐỔI)
================================================================================

AI Auditor PHẢI thực hiện theo đúng thứ tự sau:

  1.  Evidence Validation
  2.  Rule Validation
  3.  Replay Layer L1–L11
  4.  Replay Total Score
  5.  Replay Group Score
  6.  Replay Decision
  7.  Replay Entry
  8.  Replay Stop Loss
  9.  Replay Take Profit
  10. Replay Hard Block
  11. Replay Final Status

Không được bỏ bước.
Không được đảo thứ tự.
Không được gộp bước.

================================================================================
6. QUY TẮC SO SÁNH (CỨNG — KHÔNG TRẠNG THÁI TRUNG GIAN)
================================================================================

  Expected == Actual
    ↓
  PASS

  Expected != Actual
    ↓
  FAIL

KHÔNG CÓ:
  - Trạng thái trung gian.
  - "Gần đúng".
  - "Theo kinh nghiệm".
  - "Có thể chấp nhận".
  - Sai số làm tròn tùy ý (trừ khi Rule Book quy định rõ tolerance).

Overall Result:
  PASS  — tất cả hạng mục trong AUDIT ORDER = PASS
  FAIL  — ít nhất một hạng mục = FAIL
  INSUFFICIENT_EVIDENCE — thiếu dữ liệu hoặc Rule không đủ xác định Expected

================================================================================
7. AI CONSTRAINT (TUYỆT ĐỐI CẤM)
================================================================================

AI TUYỆT ĐỐI KHÔNG ĐƯỢC:

  - Thêm Rule.
  - Xóa Rule.
  - Thay đổi Threshold.
  - Thay đổi Score.
  - Thêm Indicator.
  - Thêm Layer.
  - Tối ưu chiến lược.
  - Đề xuất Entry khác.
  - Override Decision.
  - Phát minh Expected ngoài Rule Book.
  - Dùng kiến thức trading bên ngoài package.
  - Suy luận ngoài Audit Package.
  - Tự sửa dữ liệu trong package.
  - Đọc hoặc giả định source code.
  - Refactor hoặc thay đổi architecture khi sinh Cursor Prompt.

AI BẮT BUỘC:

  - Chỉ sử dụng dữ liệu trong Audit Package.
  - Xác định Expected duy nhất từ Rule Book.
  - So sánh Expected vs Actual theo quy tắc cứng (mục 6).
  - Tuân thủ AUDIT ORDER (mục 5).
  - Trả về output theo SECTION 4 (AI OUTPUT TEMPLATE).
  - Tuân thủ SECTION 2 (AI AUDIT INSTRUCTION) và SECTION 3 (MASTER AUDIT PROMPT).

================================================================================
8. OUTPUT (BẮT BUỘC)
================================================================================

Nếu PASS
--------

Trả:

  PASS

và giải thích ngắn (1–3 dòng) — chỉ trích dẫn từ package, không suy diễn.

Không sinh Cursor Prompt sửa code.

--------------------------------------------------------

Nếu FAIL
--------

Bắt buộc trả đủ cho TỪNG lỗi:

  Module
    Tên module nghi ngờ sai (vd: scorerV4, tradePlanV3, adxGate).

  Function
    Tên function hoặc vùng logic cụ thể.

  Rule
    Trích dẫn Rule cụ thể từ SECTION 1 (layer / điều kiện / threshold).

  Input
    Giá trị INPUT dùng để replay (từ SECTION 6 hoặc package).

  Expected
    Giá trị xác định duy nhất từ Rule Book (không tự phát minh).

  Actual
    Giá trị từ Application Output (SECTION 5 / 7 / 8 / 9).

  Evidence
    Trích dẫn section + field + giá trị trong Audit Package.

  Root Cause
    Giải thích ngắn gọn tại sao Expected ≠ Actual.
    Phân loại: RULE_IMPLEMENTATION | CONFIG | MARKET_DATA | MISSING_EVIDENCE | UNKNOWN

  Confidence
    0–100% — mức tin cậy vào Root Cause.

  Cursor Prompt
    Prompt hoàn chỉnh để sửa đúng module lỗi.

CẤM trả lời chung chung không có Input / Expected / Actual cụ thể.

================================================================================
9. CURSOR PROMPT (BẮT BUỘC KHI FAIL)
================================================================================

Cursor Prompt PHẢI:

  - Chỉ sửa đúng module lỗi (theo FAIL REPORT — Module / Function).
  - Không sửa module khác.
  - Không refactor.
  - Không optimize.
  - Không thay đổi architecture.
  - Không thay đổi Rule.
  - Không thay đổi Threshold.
  - Giữ backward compatibility 100%.
  - Mô tả rõ Input, Expected vs Actual và Rule bị vi phạm.

Cursor Prompt PHẢI KHÔNG:

  - Đề xuất chiến lược trading mới.
  - Thay đổi Rule Book.
  - Sửa UI nếu lỗi nằm ở scorer / trade plan / decision engine.

================================================================================
10. VERIFY — TÍNH NHẤT QUÁN ĐA AI
================================================================================

Mục tiêu cuối cùng:

  Cùng một TradeScore_Audit_Package.txt
        |
        +-- GPT       --+
        +-- Claude    --+
        +-- Gemini    --+--> CÙNG Expected, CÙNG Actual, CÙNG PASS hoặc FAIL
        +-- DeepSeek  --+
        +-- Qwen      --+

Mọi AI phải:
  - Replay cùng một Rule (SECTION 1).
  - Tạo cùng một Expected (từ Rule Book).
  - So sánh cùng một Actual (từ package).
  - Đưa ra cùng một kết luận PASS hoặc FAIL.

Nếu kết luận khác nhau:
  => Audit Package chưa đủ xác định (thiếu Rule / thiếu Evidence).
  => KHÔNG được quy trách nhiệm cho "AI khác nhau".
  => Phải bổ sung Rule hoặc Evidence trong package cho đến khi deterministic.

================================================================================
11. MỐI QUAN HỆ VỚI CÁC TÀI LIỆU KHÁC
================================================================================

Workflow này (GĐ3-T04-R1) là specification độc lập.

Khi audit thực tế, AI đọc từ Audit Package:

  SECTION 1 — RULE BOOK              (xác định Expected)
  SECTION 2 — AI AUDIT INSTRUCTION   (hướng dẫn auditor)
  SECTION 3 — MASTER AUDIT PROMPT    (prompt chuẩn)
  SECTION 4 — AI OUTPUT TEMPLATE     (format output)
  Workflow này (GĐ3-T04-R1)          (deterministic workflow)

Workflow KHÔNG thay thế Rule Book.
Workflow KHÔNG thay thế Output Template.
Workflow bổ sung nguyên tắc DETERMINISTIC AUDIT để đảm bảo tính nhất quán.

================================================================================
12. ACCEPTANCE CRITERIA (GĐ3-T04-R1)
================================================================================

  [x] Revision docs/tradeScoreAiAuditWorkflow.ts
  [x] Không sửa file implementation khác
  [x] Không thay đổi Rule
  [x] Nội dung chỉ là đặc tả Deterministic AI Audit Workflow
  [x] Không export function
  [x] Không import module runtime
  [x] Expected xác định duy nhất từ Rule Book
  [x] So sánh cứng PASS/FAIL — không trạng thái trung gian
  [x] Backward compatibility 100%

================================================================================
END OF SPECIFICATION
================================================================================`;
