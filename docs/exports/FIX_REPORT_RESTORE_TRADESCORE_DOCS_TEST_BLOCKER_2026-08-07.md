# FIX REPORT — Restore docs/tradeScore* test blocker (2026-08-07)

## Nguyên nhân thật

- `docs/tradeScoreRuleBook.ts` (và các sibling audit docs) **có trong git** (`git ls-files`), **không gitignore**, **không phải generated**.
- Working tree: trạng thái `D` (deleted) — file bị xóa khỏi disk (cùng pattern wipe/restore trước đó), trong khi `exportService.ts` import tĩnh:
  - `../docs/tradeScoreRuleBook`
  - `../docs/tradeScoreAiAuditInstruction`
  - `../docs/tradeScoreMasterAuditPrompt`
  - `../docs/tradeScoreAuditOutputTemplate`
- Vitest resolve fail tại import-time → mọi suite pull `exportService` (incl. `useTradeStore.driveSync.test.ts`) fail trước khi chạy test.

## Cách sửa

- **Khôi phục từ HEAD** (không mock, không sửa `exportService.ts`):

```text
git checkout HEAD -- docs/tradeScoreRuleBook.ts
  docs/tradeScoreAiAuditInstruction.ts
  docs/tradeScoreAiAuditWorkflow.ts
  docs/tradeScoreAuditOutputTemplate.ts
  docs/tradeScoreMasterAuditPrompt.ts
  docs/tradeScoreAuditPackageBaseline.ts
  docs/tradeScoreEntrySltpAuditMeta.ts
  docs/tradeScoreEntrySltpRuleBook.ts
```

- Không đụng logic Bug 1/Bug 2 Active Trades.

## Journal / trade suite (sau restore)

| File | Kết quả |
|------|---------|
| `utils/journalRecommendationDisplay.test.ts` | **6 passed** |
| `components/journal/CloseTradeModal.test.ts` | **4 passed** |
| `store/useTradeStore.driveSync.test.ts` | **9 passed** |
| `hooks/useJournalMarketSync.test.ts` | **2 passed** (ước lượng trong batch 21) |
| **Batch** | **4 files / 21 tests — all passed** |

### Regression quan trọng

`allows multiple independent OPEN records for the same symbol` → **PASS** (4139ms).

## Full suite (`npx vitest run`)

| Metric | Count |
|--------|------:|
| Test files | 19 failed / **242 passed** (261) |
| Tests | 73 failed / **2384 passed** / 2 skipped (2459) |
| Errors (uncaught WS) | 4 (live multi-coin export) |
| Duration | ~481s |

Fail ngoài phạm vi blocker journal (pre-existing / unrelated): featureFlags defaults, exportTrace/Audit snapshot content, AI Review Spec docs, UL-04.2 staging, live WebSocket `Event` type error, v.v. — **không** nằm trong `driveSync` / Active Trades binding.

Log: `docs/exports/_full_vitest_2026-08-07.txt`
