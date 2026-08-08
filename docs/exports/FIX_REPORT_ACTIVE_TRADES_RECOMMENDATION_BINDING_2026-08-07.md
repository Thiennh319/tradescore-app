# FIX REPORT — Active Trades recommendation binding (Hold/Close)

**Date:** 2026-08-07  
**Scope:** Binding/UI only — không đổi ESM / PositionAdvisor / decision engine / journalService closeReason

---

## Bug 1 — PENDING → Waiting Fill

| | |
|--|--|
| **File** | `utils/journalRecommendationDisplay.ts` |
| **Trước** | `OPEN \|\| PENDING` → `resolveEsmUlReviewDisplay` (Hold Position khi READY) |
| **Sau** | `PENDING` → label `"Waiting Fill"`, tooltip/reason `"Chờ khớp lệnh"` (cùng text V4.1 `buildTradeSessionAdviser.ts`); `OPEN` giữ ESM |

Constants: `JOURNAL_WAITING_FILL_LABEL`, `JOURNAL_WAITING_FILL_REASON`.

---

## Bug 2 — Per-entry advisor label

| | |
|--|--|
| **Helper** | `resolveJournalActiveTradeRecommendation(entry, esm, advisorLabelById)` |
| **OPEN** | Ưu tiên `advisorLabelById[entry.id]`; thiếu → ESM symbol |
| **PENDING** | Waiting Fill (không ESM, không PA) |
| **Wire** | `ActiveTradesPanel` đã truyền `advisorLabelById` → `JournalTradeTable` / `JournalTradeMobileCard` dùng `advisorLabel={advisorLabelById[entry.id]}` |
| **Không đổi** | Cách tính trong `useJournalMarketSync.ts` (chỉ bind + debug log `recommendationUi` dùng helper mới) |

Files UI:  
- `components/journal/JournalTradeTable.tsx`  
- `components/journal/JournalTradeMobileCard.tsx`  
- `hooks/useJournalMarketSync.ts` (debug only)  
- `utils/journalLiveDebug.ts` (widen source union)

---

## Tests

`utils/journalRecommendationDisplay.test.ts` — mock ESM, không phụ thuộc `docs/tradeScore*` / bridge:

| Case | Result |
|------|--------|
| OPEN → ESM | PASS |
| CLOSED → Closed | PASS |
| PENDING → Waiting Fill (không gọi ESM) | PASS |
| OPEN prefer advisorLabelById | PASS |
| OPEN fallback ESM khi thiếu id | PASS |
| 2 OPEN cùng symbol, 2 nhãn advisor khác | PASS |

`components/journal/CloseTradeModal.test.ts` — **4 passed**.

**Tổng chạy được:** 10 passed / 0 failed (2 files).

`store/useTradeStore.driveSync.test.ts` — **không chạy được trong môi trường hiện tại**: thiếu `docs/tradeScoreRuleBook` (+ audit docs) → resolve fail từ `exportService.ts` (blocker có sẵn, không do patch này). Multi-entry logic **không bị đụng** code.

---

## Không đụng

- `services/journalService.ts` (closeReason / Entry PENDING)  
- ESM core / `evaluatePositionV4` / `evaluatePositionV41`  
- Entry = limitOrderPrice cho PENDING (đã PASS)

---

## Verify thủ công gợi ý

1. NEAR PENDING → cột Khuyến nghị = **Waiting Fill**  
2. 2 BTC OPEN cùng lúc với PA khác nhau → 2 nhãn khác (khi `advisorLabelById` đã tính)
