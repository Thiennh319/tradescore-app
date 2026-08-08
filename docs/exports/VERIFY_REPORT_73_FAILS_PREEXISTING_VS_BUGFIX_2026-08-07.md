# VERIFY REPORT — 73 fails pre-existing vs Bug 1/Bug 2 (2026-08-07)

## Method (safe)

1. Recorded pre-state: `docs/exports/_verify_step1_status_before.txt`, `_verify_step1_diffstat_before.txt`, `_verify_step1_bugfix_sha256.txt`
2. Stashed **only** Bug 1/Bug 2 files (kept `docs/tradeScore*.ts` restored):
   - `utils/journalRecommendationDisplay.ts`
   - `utils/journalRecommendationDisplay.test.ts`
   - `components/journal/JournalTradeTable.tsx`
   - `components/journal/JournalTradeMobileCard.tsx`
   - `hooks/useJournalMarketSync.ts`
   - `utils/journalLiveDebug.ts`
3. Baseline full suite (docs OK, **no** bugfix): JSON + TXT  
   `docs/exports/_full_vitest_baseline_nobugfix_2026-08-07.json`
4. Compared to prior with-bugfix run:  
   `docs/exports/_full_vitest_2026-08-07.txt` (UTF-16 from Tee-Object)
5. `git stash pop` — **no conflict**, SHA256 **MATCH** all 6 files
6. Re-ran journal batch → **21/21 pass**

## Totals

| Run | Failed tests | Passed | Fail files |
|-----|-------------:|-------:|-----------:|
| **With Bug 1+2** | **73** | 2384 | **19** |
| **Baseline (no bugfix)** | **73** | 2381 | **19** |

(Passed/total lệch nhẹ 2384 vs 2381 — discovery/skip/env; **fail count giống hệt 73**.)

## Fail-file set compare

| Bucket | Count | Verdict |
|--------|------:|---------|
| Fail file ở **cả hai** | **19** | Pre-existing |
| **Chỉ** khi có bugfix | **0** | **Không regression** |
| **Chỉ** khi không bugfix | **0** | Không có “vô tình fix thêm” ở mức file |

19 file fail (identical both runs):

- `config/featureFlags.test.ts`
- `services/__tests__/exportAuditCoin.test.ts`
- `services/__tests__/exportTraceReviewWire.l5aBlockTypeSoft.test.ts`
- `services/__tests__/exportTraceReviewWire.nearShortL3GateEvidence.test.ts`
- `services/__tests__/exportTraceReviewWire.positionAdviserWire.test.ts`
- `services/__tests__/exportTraceReviewWire.semantics.test.ts`
- `services/__tests__/exportTraceReviewWire.task187.scoreTraceLabels.test.ts`
- `services/__tests__/exportTraceReviewWire.task188.blockingEventsOrigin.test.ts`
- `services/__tests__/generateMultiCoinTraceExports.live.test.ts`
- `services/aiExport/__tests__/aiReviewSpec.test.ts`
- `services/aiExport/__tests__/presentationArchitectureLock.test.ts`
- `services/aiExport/tradePlanTrace/__tests__/TradePlanTraceExport.test.ts`
- `services/exportDecisionReplay.test.ts`
- `services/exportDecisionTrace.test.ts`
- `services/exportService.layerInputSnapshot.test.ts`
- `services/performanceHt/__tests__/PerformanceHTBind.test.ts`
- `services/productionEsmBridge/productionEsmScanWiring.test.ts`
- `services/productionEsmBridge/ul042StagingValidation.test.ts`
- `services/tradePlanV3.vwap.test.ts`

## Regression thật?

**Không.** Không có fail file / không có evidence fail mới chỉ xuất hiện khi có Bug 1+2.

## Patch restore

| Check | Result |
|-------|--------|
| `git stash pop` | OK, dropped stash |
| SHA256 6 file bugfix | **6/6 MATCH** step1 |
| `git diff --stat` bugfix | `6 files, +335/−104` — khớp step1 |
| `Waiting Fill` in display.ts | present (3 hits) |
| Journal suite after pop | **4 files / 21 tests PASS** |

## Conclusion

73 fail full suite là **pre-existing**; Bug 1/Bug 2 **không** gây thêm fail. Patch đã khôi phục nguyên vẹn.
