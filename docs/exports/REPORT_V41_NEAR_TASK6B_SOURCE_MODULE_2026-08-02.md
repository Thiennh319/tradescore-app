# REPORT — V4.1 NEAR Task 6b (Source Module fix rules 03–12)

**Date:** 2026-08-02  
**Scope:** Sửa Source Module sai cho rule `market_context_*` (×5) + `decision_*` (×5) trên nhánh breakout NEARUSDT.  
**Không đổi:** Reason (Task 6), Evidence (Task 7/7b), BTC/SOL/BNB rulebook, Status/Actual/Threshold.

---

## 1. Problem

Export NEAR ghi `Source Module = services/v41/strategy/resolveSymbolStrategy.ts` cho **cả 10 rule** 03–12.

- `resolveSymbolStrategy` chỉ **quyết định** breakout vs TR.
- Không phải module gốc chứa logic Market Context / Decision Engine.
- BTC/SOL/BNB cùng rule ID vẫn ghi module thật (`marketContextFilter`, `decisionConfig`, `decisionEngine`).

---

## 2. Fix

**File:** `services/v41Export/rulebook/Builder.ts`

- `buildBreakoutSkippedMarketContextRules()` / `buildBreakoutSkippedDecisionRules()`
- Source Module khớp **byte-stable** với TR path (`buildMarketContextRules` / `buildDecisionRules`).

| Rule ID | Source Module (sau sửa) |
|---|---|
| `market_context_btc` | `services/v41/marketContextFilter.ts` |
| `market_context_funding` | `services/v41/marketContextFilter.ts` |
| `market_context_oi` | `services/v41/marketContextFilter.ts` |
| `market_context_whale` | `services/v41/marketContextFilter.ts` |
| `market_context_volatility` | `services/v41/marketContextFilter.ts` |
| `decision_long_short` | `services/v41/decision/decisionConfig.ts (thresholds.long/short)` |
| `decision_watch` | `services/v41/decision/decisionConfig.ts (thresholds.watch/long)` |
| `decision_ignore` | `services/v41/decision/decisionConfig.ts + decisionEngine ladder` |
| `decision_final_output` | `services/v41/decisionEngine.ts (evaluateDecision → state)` |
| `decision_eligibility` | `services/v41/decisionEngine.ts (isEligibleForDirection)` |

**Data Source Detail** (ghi chú thêm, không thay Source Module):

- MC: `module gốc marketContextFilter — không được gọi trên breakout path (resolveSymbolStrategy=breakout)`
- Decision: `module gốc decisionConfig/decisionEngine — không được gọi trên breakout path (resolveSymbolStrategy=breakout)`

**Reason (VI):** giữ nguyên Task 6 (`BREAKOUT_MC_REASON_VI` / `BREAKOUT_DECISION_REASON_VI`).

---

## 3. Before / After (Source Module)

| | Before (sai) | After |
|---|---|---|
| 10 rule 03–12 | `services/v41/strategy/resolveSymbolStrategy.ts` | Module gốc theo bảng §2 (giống BTC cùng ID) |

---

## 4. Tests

**File:** `services/v41Export/__tests__/rulebook.nearBreakout.test.ts`

- Case mới **Task 6b:** NEAR Source Module ≡ BTC cùng ID; không chứa `resolveSymbolStrategy`; Detail có *không được gọi trên breakout path*.
- Regression BTC/SOL/BNB: Reason + Source Module TR path không đổi.

```
npx vitest run services/v41Export/__tests__/rulebook.nearBreakout.test.ts services/v41Export/__tests__/rulebook.test.ts
→ Test Files  2 passed (2)
→ Tests       19 passed (19)
```

---

## 5. Out of scope

- Không rebuild web/APK trong task này.
- Không đổi version.
- Không đụng `breakout_context` / `breakout_confirmed_active` / `breakout_strategy`.

---

## 6. Tham chiếu

- Task 6 Reason: `docs/exports/REPORT_V41_NEAR_TASK6_REASON_FIX_2026-08-02.md`
- Task 7 / 7b Evidence split: `REPORT_V41_NEAR_TASK7_EVIDENCE_2026-08-02.md`, `REPORT_V41_NEAR_TASK7B_SPLIT_2026-08-02.md`
