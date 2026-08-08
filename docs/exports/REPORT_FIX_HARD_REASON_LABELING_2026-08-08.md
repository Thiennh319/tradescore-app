# REPORT — FIX_HARD_REASON_LABELING (label-only, flag default OFF)

**Ngày:** 2026-08-08  
**Phạm vi:** Đổi tên / làm sạch label hard-reasons — **không** đổi rule entry.  
**Flag:** `FEATURE_FLAGS.FIX_HARD_REASON_LABELING = false` (default OFF). Không commit, không bật production.

---

## PHẦN A — Diff / thay đổi code (sau flag)

### Flag

`config/featureFlags.ts`:
- `FIX_HARD_REASON_LABELING: false`
- `isFixHardReasonLabelingEnabled()` + env `FIX_HARD_REASON_LABELING=1|true` + `setFixHardReasonLabelingForTests`

### Rename `hardBlocked` → `entryBlocked` (cùng công thức OR)

Công thức **không đổi**:

```ts
blocked = hardBlocks.length > 0 || groupBlocks.length > 0
```

`services/entryBlockedLabeling.ts`:
- `applyEntryBlockedFields(blocked)` — flag OFF: `{ hardBlocked }`; ON: `{ entryBlocked, hardBlocked }` (mirror cùng giá trị)
- `resolveSnapEntryBlocked(snap)` — đọc tên đúng theo flag

Wire: `services/signalBoardScan.ts` (`snapshotFromV3` / `snapshotFromV4` / ADX / applySnapshotToRow / row build), `SignalBoard.tsx`, `scanUnified.ts`, `signalRowView.ts`, `productionEsmBridge/signalRowScanContext.ts`, UL review copy (text “Entry blocked” khi flag ON).

### Hard-reason labeling fix

`services/tradePlanDisplay.ts` — `collectHardBlockReasons`:
- **Flag OFF:** giữ fallback cũ (`mandatoryViolations` trừ group — có thể lẫn soft).
- **Flag ON:** **chỉ** `hardBlocks[]` theo side; soft/group tách:
  - `collectGroupBlockReasons` → “Lý do chặn nhóm”
  - `collectScoreSoftBlockReasons` → “Lý do điểm chưa đạt”

`SignalBoard.tsx` ~rawHardBlockReasons: flag ON chỉ `sideHardBlocks`; hiện nhãn group/soft riêng trên plan panel.

### Unit tests

`services/__tests__/fixHardReasonLabeling.test.ts` — **5 passed**.

---

## PHẦN B — NEARUSDT 180d A/B

**Suite:** `scripts/backtest-v4-near-90d.ts` (`loadMarketBundle` + `buildBarEvalCache` + `simulateFromCache`)  
**Script:** `scripts/verify-fix-hard-reason-labeling-near-180d.ts`  
**Report chi tiết:** `docs/reports/REPORT_FIX_HARD_REASON_LABELING_NEAR_180D_AB_2026-08-08.md`

| Metric | Nhánh A (flag OFF) | Nhánh B (flag ON) | Lệch? |
|---|---:|---:|:---:|
| Tổng số signal được đánh giá | 4318 | 4318 | Không |
| Số entry PASS | 751 | 751 | Không |
| Số entry BLOCKED (Hard) | 1479 | 1479 | Không |
| Số entry BLOCKED (Group) | 1910 | 1910 | Không |
| Số entry BLOCKED (Score/Soft) | 119 | 119 | Không |
| Winrate trên tập entry PASS (rising+planValid) | 54.55% | 54.55% | Không |
| Trade ID PASS/BLOCK khác nhau A vs B | **0** | **0** | Không |

Label diagnostics: A OFF soft→hard-reason leak = **1815** bars; B ON leak = **0**.

### Kết luận B

**Không ảnh hưởng rule/winrate NEAR — chỉ đổi hiển thị.**  
Không có Trade ID đổi pass/fail → **đủ điều kiện kỹ thuật để xem xét bật flag sau**, nhưng task này **không tự bật**.

---

## Cách review local

```bash
# Diff các file đã sửa (không commit)
git diff -- config/featureFlags.ts services/entryBlockedLabeling.ts services/signalBoardScan.ts services/tradePlanDisplay.ts components/dashboard/SignalBoard.tsx

# Unit
npx vitest run services/__tests__/fixHardReasonLabeling.test.ts

# A/B NEAR 180d (mạng Binance)
npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/verify-fix-hard-reason-labeling-near-180d.ts
```

Bật thử runtime (không đổi default trong code):  
`FIX_HARD_REASON_LABELING=1` hoặc `setFixHardReasonLabelingForTests(true)`.

---

## Task ID

**FIX_HARD_REASON_LABELING** · flag default **OFF** · NEAR 180d A/B **identical pass/fail** · no commit
