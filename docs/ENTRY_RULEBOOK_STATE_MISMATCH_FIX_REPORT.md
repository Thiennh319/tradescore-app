# RuleBook State Field Mismatch — Entry Decision Export Fix Report

**Date:** 2026-07-21  
**Trade evidence:** BTCUSDT-LONG-v4 (`03_ENTRY_DECISION.md`, Timestamp `2026-07-21T01:41:56.458Z`)  
**Engine Version:** 1.0.7  
**Scope:** Export display consistency only — không đổi logic tính RuleBook State (PASS/WAIT/BLOCKED)

---

## Executive Summary

| Mục | Kết luận |
|-----|----------|
| Bug | Cùng field `RuleBook State` trong 1 file `03_ENTRY_DECISION.md` có 2 giá trị: DECISION CHAIN = `UNAVAILABLE`, ENTRY SUMMARY = `PASS` |
| Root cause | 2 section đọc **2 nguồn dữ liệu khác nhau**; production wire chỉ populate 1 nguồn |
| Fix | Formatter dùng **một helper SSOT** cho cả 2 section |
| Logic PASS/FAIL | **Không đổi** |
| Tests | 25/25 passed (`EntryTraceExport` + `EntryTraceEnhancement`) |

---

## 1. Bug description

Trong cùng một document export Entry Decision:

| Section | Field | Giá trị quan sát |
|---------|-------|------------------|
| `# DECISION CHAIN` | `RuleBook State` | `UNAVAILABLE` |
| `# ENTRY SUMMARY` | `RuleBook State` | `PASS` |

Đây là **internal inconsistency** trong cùng pipeline output — không phải khác scale hay khác tài liệu.

---

## 2. Source locations (trước fix)

**Pipeline:**

```
SignalBoard → exportTraceOrReviewMarkdown('trace-entry')
  → buildEntryTraceMarkdown()          // services/exportTraceReviewWire.ts
  → buildEntryTraceExport() / formatEntryTrace()
  → 03_ENTRY_DECISION.md
```

**Formatter** (`services/aiExport/entryTrace/EntryTraceFormatter.ts`):

| Section | Code (trước) | Nguồn |
|---------|--------------|-------|
| DECISION CHAIN | `kv('RuleBook State', trace.ruleBook.stateAfter)` | `EntryTrace.ruleBook.stateAfter` |
| ENTRY SUMMARY | `kv('RuleBook State', summary.ruleBookState)` | `EntryTrace.entrySummary.ruleBookState` |

**Wire** (`buildEntryTraceMarkdown` trong `exportTraceReviewWire.ts`):

- **Có set** `entrySummary.ruleBookState`:
  ```typescript
  snap.hardBlocked ? 'BLOCKED' : snap.canEnter ? 'PASS' : 'WAIT'
  ```
- **Không truyền** `ruleBook` → `ruleBook.stateAfter` = undefined → formatter render `UNAVAILABLE`

---

## 3. Xác nhận: 2 nguồn lệch (không phải 2 khái niệm trùng tên)

| Kiểm tra | Kết quả |
|----------|---------|
| Cùng label export `"RuleBook State"`? | Có — cả 2 section |
| Cùng ý nghĩa hiển thị (PASS/WAIT/BLOCKED)? | Có — ENTRY SUMMARY đã chứng minh giá trị có sẵn |
| Production path populate cả 2? | **Không** — chỉ `entrySummary.ruleBookState` |
| Cần rename field? | **Không** — cùng khái niệm, lệch nguồn |

→ Đủ điều kiện sửa theo constraint: gộp về **single source of truth**, không rename.

---

## 4. Fix applied

### 4.1 Formatter SSOT

`services/aiExport/entryTrace/EntryTraceFormatter.ts`:

```typescript
/**
 * Single source of truth for the export field "RuleBook State"
 * (DECISION CHAIN + ENTRY SUMMARY). Prefer entrySummary; fall back to
 * ruleBook.stateAfter when callers only populate RULEBOOK INTERACTION.
 */
function exportedRuleBookState(trace: EntryTrace) {
  return trace.entrySummary.ruleBookState ?? trace.ruleBook.stateAfter;
}
```

Cả DECISION CHAIN và ENTRY SUMMARY gọi `exportedRuleBookState(trace)`.

- Ưu tiên giá trị đã tính ở `entrySummary` (production wire).
- Fallback `ruleBook.stateAfter` cho unit test / caller chỉ populate RULEBOOK INTERACTION.

### 4.2 Wire (clarify SSOT, logic không đổi)

`buildEntryTraceMarkdown` — extract một biến `ruleBookState` rồi gán vào `entrySummary.ruleBookState` (cùng biểu thức `hardBlocked` / `canEnter` như trước).

### 4.3 Regression tests

`services/aiExport/entryTrace/__tests__/EntryTraceEnhancement.test.ts`:

1. Chỉ có `entrySummary.ruleBookState: 'PASS'` (không có `ruleBook`) → **cả 2 section = PASS**, không `UNAVAILABLE` ở DECISION CHAIN.
2. Hai nguồn lệch (`stateAfter: BLOCKED`, `ruleBookState: PASS`) → **cả 2 section = PASS** (entrySummary thắng).

**Vitest:** `EntryTraceExport.test.ts` + `EntryTraceEnhancement.test.ts` → **25 passed**.

---

## 5. Diff (phần liên quan bug)

```diff
+ function exportedRuleBookState(trace: EntryTrace) {
+   return trace.entrySummary.ruleBookState ?? trace.ruleBook.stateAfter;
+ }

  // DECISION CHAIN
- kv('RuleBook State', trace.ruleBook.stateAfter),
+ kv('RuleBook State', exportedRuleBookState(trace)),

  // ENTRY SUMMARY
- kv('RuleBook State', summary.ruleBookState),
+ kv('RuleBook State', exportedRuleBookState(trace)),
```

Wire (equivalent, không đổi công thức):

```diff
+ const ruleBookState = snap.hardBlocked
+   ? 'BLOCKED'
+   : snap.canEnter
+     ? 'PASS'
+     : 'WAIT';
  entrySummary: {
    ...
-   ruleBookState: snap.hardBlocked ? 'BLOCKED' : snap.canEnter ? 'PASS' : 'WAIT',
+   ruleBookState,
  },
```

---

## 6. Expected behavior (export tương lai)

| Scenario | DECISION CHAIN | ENTRY SUMMARY |
|----------|----------------|---------------|
| `canEnter=true`, không hard block | `PASS` | `PASS` |
| `hardBlocked=true` | `BLOCKED` | `BLOCKED` |
| Không enter, không hard | `WAIT` | `WAIT` |

Hai section **luôn cùng giá trị** cho `RuleBook State`.

**Không đổi:** RULEBOOK INTERACTION (`State Before` / `State After` / Trigger / Reason) — vẫn đọc `trace.ruleBook.*` riêng; production wire vẫn không populate interaction chi tiết.

---

## 7. File Reference

| Vai trò | Path |
|---------|------|
| Formatter (fix) | `services/aiExport/entryTrace/EntryTraceFormatter.ts` |
| Wire entry trace | `services/exportTraceReviewWire.ts` → `buildEntryTraceMarkdown` |
| Types | `services/aiExport/entryTrace/EntryTraceTypes.ts` |
| Tests | `services/aiExport/entryTrace/__tests__/EntryTraceEnhancement.test.ts` |
| Export kind | `trace-entry` → filename `03_ENTRY_DECISION.md` |

---

**Report status:** COMPLETE  
**Author:** Code audit + fix (display SSOT only)  
**Related evidence:** BTCUSDT-LONG-v4 Entry Decision export @ `2026-07-21T01:41:56.458Z`
