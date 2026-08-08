# REPORT — Điều tra khuyến nghị Hold / Close trên bảng "Lệnh đang chạy"

**Date:** 2026-08-07  
**Mode:** CHỈ ĐIỀU TRA — không sửa code  
**Scope:** Active Trades (journal V4) — PENDING Hold Position; 2× BTC LONG cùng Close; BNB Close reason  
**UI snapshot (user):** NEAR SHORT PENDING Hold; BTC LONG #1/#2 + BNB LONG RUNNING Close

---

## 0. Verdict tổng

| # | Câu hỏi | Phân loại | Một dòng |
|---|---------|-----------|----------|
| Q1 | NEAR PENDING → "Hold Position" | **BUG** (UI/spec mismatch) + **PASS** (Entry=limit) | PENDING dùng ESM UL Review như OPEN; V4.1 path đúng là Waiting Fill. Entry field = limitOrderPrice. |
| Q2 | 2 BTC LONG cùng Close, PnL trái dấu | **PASS** (multi-entry hợp lệ) + **BUG** (label theo symbol) | Hai OPEN cùng symbol được phép; cột khuyến nghị = ESM theo symbol, không phải PA per-entry. |
| Q3 | BNB LONG — lý do Close cụ thể | **INSUFFICIENT EVIDENCE** | "Close Position" ≠ closeReason; thiếu ESM/PA snapshot tại thời điểm UI. |

---

## 1. UI quan sát (đối chiếu)

1. **NEAR SHORT** — Status: PENDING — Khuyến nghị: "Hold Position"  
   Entry: $1.672 | Current: $1.661 | Open Reason: "Hồi về EMA20 1H để Short tại 1.6755" | Time: 08:04 07-08

2. **BTC LONG #1** — Status: RUNNING — Khuyến nghị: "Close Position"  
   Entry: $64,470.60 | Current: $64,398.90 | PnL: -0.03 USDT | Open Reason: support EMA ~64396… | Time: 00:51 07-08

3. **BNB LONG** — Status: RUNNING — Khuyến nghị: "Close Position"  
   Entry: $598.66 | Current: $594.00 | PnL: -0.23 USDT | Time: 20:17 05-08

4. **BTC LONG #2** — Status: RUNNING — Khuyến nghị: "Close Position"  
   Entry: $64,192.60 | Current: $64,398.90 | PnL: +0.10 USDT | Open Reason: support EMA ~64107… | Time: 20:17 05-08

---

## 2. CÂU HỎI 1 — PENDING + "Hold Position"

### 2.1 Trace — hàm generate khuyến nghị trên Active Trades

**Nguồn đang hiển thị trên UI (SSOT cột Khuyến nghị):**

| Layer | File | Behavior |
|-------|------|----------|
| Panel | `components/journal/ActiveTradesPanel.tsx` | Lấy `advisorLabelById` từ `useJournalMarketSync` **nhưng** table không dùng prop này cho cell. |
| Table row | `components/journal/JournalTradeTable.tsx` | `recommendation = esmUlReviewLabel ?? resolveJournalUlReviewRecommendation(...).label` |
| Binder | `utils/journalRecommendationDisplay.ts` | `OPEN` **và** `PENDING` → `resolveEsmUlReviewDisplay(esmSnapshot, entry.symbol)` |
| Label map | `utils/esmUiDisplay.ts` | Action/state → `"Hold Position"` / `"Close Position"` / `"Wait Confirmation"` … |
| Status label | `services/journalService.ts` | `OPEN` → display `"RUNNING"`; `PENDING` giữ `"PENDING"` |

**Đường Position Advisor (có tính per-entry, không hiện trên bảng):**

| Layer | File | Behavior |
|-------|------|----------|
| Sync | `hooks/useJournalMarketSync.ts` | `advisorLabelById` **chỉ** khi `outcome.status === 'OPEN'` (bỏ PENDING) |
| V4 PA | `buildCloseAdvisorContext` → `evaluatePositionV4` | Per `entry.market.entryPrice` + mark |
| V4.1 PA | `evaluatePositionV41` | Chỉ entry V4.1 tag |
| Dead wire | `JournalTradeTable` | Prop `advisorLabelById` khai báo / destructure nhưng **không** bind vào `EsmRecommendationCell` |

**Đường V4.1 Trade Session (không phải Active Trades V4):**

| Layer | File | Behavior |
|-------|------|----------|
| Adviser | `services/v41/rc3/buildTradeSessionAdviser.ts` | `session.status === 'Pending'` → `Waiting Fill` / `"Chờ khớp lệnh"`; **không** gọi `evaluatePositionV41` |
| Test | `services/v41/__tests__/tradeSessionAdviser.test.ts` | Confirm Pending → Waiting Fill |

### 2.2 "Hold Position" có hợp lệ cho PENDING không?

**Theo ESM UL Review map (có chủ đích, không phải fallback rỗng):**

```text
OPEN_POSITION / MONITOR_POSITION / READY / ACTIVE → "Hold Position"
PREPARE_EXIT / CLOSE_POSITION / EXIT             → "Close Position"
ENTRY / WATCH / LOCKED (+ một số action)         → "Wait Confirmation"
```

Test cố định: ESM `READY` → label `"Hold Position"`  
(`utils/journalRecommendationDisplay.test.ts`).

**Theo journal status / V4.1 session adviser:** PENDING/Pending phải là **Waiting Fill**, không phải Hold Position.

**Kết luận:** Hold Position là nhãn ESM hợp lệ cho state READY / monitor, nhưng **không** phải nhãn hợp lệ cho journal `PENDING` trên Active Trades nếu đối chiếu spec V4.1 Waiting Fill. Đây là **BUG binding** (dùng nhãn quản lý vị thế cho lệnh chưa khớp), không phải random default.

### 2.3 Nên hiện gì với PENDING?

| Nguồn | Nhãn kỳ vọng |
|-------|----------------|
| V4.1 `buildWaitingFillAdvisor` | `Waiting Fill` — reason `Chờ khớp lệnh` |
| Active Trades V4 hiện tại | ESM UL Review (thường Hold / Close / Wait Confirmation) — **không** phân nhánh PENDING |

Code quyết định nhãn theo Status trên Active Trades: **chỉ** nhánh  
`OPEN || PENDING → ESM`; không có nhánh `"Chờ khớp"` trong `journalRecommendationDisplay.ts`.

### 2.4 Entry / Current / 1.6755 — data model

| UI | Field | Nghĩa code |
|----|-------|------------|
| Entry | `market.entryPrice` | PENDING: gán = `limitOrderPrice` khi `newAiJournalPendingEntry` |
| (ẩn) | `outcome.limitOrderPrice` | Limit đặt lệnh |
| Open Reason text "… tại 1.6755" | `plan.openReason` / entryZone reasoning | Preferred / trigger narrative từ trade plan |
| Preferred zone | `plan.entryZoneOptimal` (+ range) | Optimal pullback/EMA zone |
| Current | mark live (`markBySymbol`) | Giá thị trường hiển thị khi OPEN/PENDING |

```722:754:services/journalService.ts
// newAiJournalPendingEntry:
//   market.entryPrice = input.limitOrderPrice
//   outcome.status = 'PENDING'
//   outcome.limitOrderPrice = input.limitOrderPrice
```

**PASS:** Cột Entry với PENDING **đúng nghĩa limit price**, không phải filled price.  
`$1.6755` trong Open Reason ≠ Entry field — không gán nhầm vào Entry theo code path này.

### 2.5 Evidence Local Storage (một phần)

Từ WebView Local Storage key `gd1_locked_plan` (fragment, LevelDB có compression):

- `pendingEntryId`: `aj_1786064697145_lbltemy`
- Symbol: `NEARUSDT`, direction SHORT
- Plan status: `WAIT`
- `entryZone` type: `PULLBACK_EMA`
- Khớp lệnh PENDING chờ khớp, không phải filled OPEN

`gd1_trade_journal_v2` có trong storage nhưng **không decode trọn** (LevelDB/block compression) → không export được đủ 4 entry JSON.

### 2.6 Phân loại Q1

| Hạng mục | Phân loại |
|----------|-----------|
| PENDING hiện Hold Position | **BUG** — vi phạm kỳ vọng Waiting Fill (V4.1) / trộn entry-state ESM với journal PENDING |
| Entry = 1.672 là limit | **PASS** |
| Snapshot ESM NEAR đúng lúc Hold | **INSUFFICIENT EVIDENCE** (thiếu `harnessResult.actions` / state) |

**Code vi phạm (BUG):**  
`utils/journalRecommendationDisplay.ts` — gom `PENDING` vào cùng nhánh ESM như `OPEN`.  
Đối chiếu đúng: `services/v41/rc3/buildTradeSessionAdviser.ts` (Pending → Waiting Fill).

**Field còn thiếu:**  
`esmBridge.snapshotBySymbol.NEARUSDT` (actionType, nextState, reason); journal entry đầy đủ `limitOrderPrice`, `entryZoneOptimal`, `openReason`.

---

## 3. CÂU HỎI 2 — Hai BTC LONG

### 3.1 Có phải duplicate bug?

**PASS — multi-entry hợp lệ theo product code.**

- Store test: `store/useTradeStore.driveSync.test.ts` —  
  `allows multiple independent OPEN records for the same symbol` (3 OPEN BTC khác `entryPrice`).
- UI: entry riêng `64470.60` vs `64192.60`, open reason EMA support khác nhau → khớp mô hình 2 signal/entry độc lập, không có gate “một OPEN / symbol”.

**INSUFFICIENT EVIDENCE** từ Local Storage đầy đủ cho BTC #2 (64192.60): chỉ decode được fragment `open_trade` BTC `entryPrice ≈ 64470.6` OPEN V4. Không kết luận id/timestamp #2 từ dump.

### 3.2 Close theo từng entry hay chung structure?

| Engine | Per-entry? | Hiện trên Active Trades? |
|--------|------------|---------------------------|
| ESM UL Review (`resolveEsmUlReviewDisplay(snapshot, symbol)`) | **Không** — theo symbol | **Có** (cột Khuyến nghị) |
| `evaluatePositionV4` / `buildCloseAdvisorContext` | **Có** — `entry.market.entryPrice`, PnL riêng | **Không** (prop chết) |

```178:245:services/positionAdvisorExitTracking.ts
// pnlFromPrices(entry.market.entryPrice, price, ...)
// position.entryPrice: entry.market.entryPrice
// → evaluatePositionV4(...)
```

### 3.3 Vì sao PnL trái dấu (-0.03 / +0.10) nhưng cùng Close?

Vì cột UI **không** lấy `advisorLabelById` / PnL — lấy **một** nhãn ESM cho `BTCUSDT`.  
Hai row cùng symbol ⇒ cùng "Close Position" khi ESM BTC ở `PREPARE_EXIT` / `CLOSE_POSITION` / `EXIT`.

Không chứng minh được “copy PA từ lệnh A sang B”: PA không render trên cell.

### 3.4 Phân loại Q2

| Hạng mục | Phân loại |
|----------|-----------|
| 2 OPEN BTC hợp lệ | **PASS** (thiếu dump #2 → partial live confirm) |
| Cùng Close trên UI | **BUG** (binding symbol-level cho cột per-trade) |
| Copy PA giữa 2 lệnh | Không phải bug copy PA — **N/A** / hiểu nhầm UI |
| PA per-entry live khác nhau? | **INSUFFICIENT EVIDENCE** (UI không export PA label từng id) |

**Code vi phạm (BUG UI):**  
`utils/journalRecommendationDisplay.ts` + `JournalTradeTable` dùng ESM theo `entry.symbol` cho mọi row; `advisorLabelById` không được wire.

**Field còn thiếu:**  
2× `id`, `entryPrice`, `timestamp`; `advisorLabelById[id]` / `triggeredBy`; ESM BTC `primaryAction`.

---

## 4. CÂU HỎI 3 — BNB LONG Close reason

### 4.1 Trace

- Cột **Khuyến nghị** "Close Position" = ESM action/state map (`PREPARE_EXIT` / `CLOSE_POSITION` / `EXIT`), **không** ghi structure/SL/TP vào cell.
- Cột **Lý do đóng** = `resolveJournalCloseReasonDisplay(entry)`:

```237:248:services/journalService.ts
// closeReason stored → hoặc exitReason → formatJournalCloseReason
// OPEN còn chạy: thường null → UI "—"
```

- Open Reason chỉ lý do **mở** (`plan.openReason` / entryZone) — đúng design; không có close-reason song song khi vẫn OPEN.

### 4.2 Phân loại Q3

**INSUFFICIENT EVIDENCE** — không có export:

- `esmBridge.snapshotBySymbol.BNBUSDT` primary action + `reason`
- hoặc PA `type` / `triggeredBy` / `label` cho entry BNB
- hoặc (sau đóng) `outcome.exitReason` / `closeReason` / `positionAdvisorActionAtExit`

**ENHANCEMENT** (ghi nhận, không sửa trong phiên này):  
Xuất “lý do khuyến nghị đóng” live (ESM reason / PA triggeredBy) cạnh Open Reason khi status còn OPEN/RUNNING.

---

## 5. Luồng tóm tắt (Active Trades V4)

```text
Journal entry (PENDING | OPEN)
        │
        ├─ Status cell ── resolveJournalStatusLabel (OPEN→RUNNING)
        │
        ├─ Recommendation cell ── resolveJournalUlReviewRecommendation
        │                              └── resolveEsmUlReviewDisplay(symbol)
        │                                    (PENDING ≡ OPEN về nhánh này)
        │
        ├─ Entry cell ── market.entryPrice
        │                  (PENDING = limitOrderPrice)
        │
        ├─ Current ── mark price
        │
        └─ Close reason ── outcome.closeReason/exitReason
                             (thường trống khi còn OPEN)

[Song song, không render bảng]
useJournalMarketSync.advisorLabelById
  └── chỉ OPEN → evaluatePositionV4 | evaluatePositionV41 (per entry)
```

---

## 6. Missing fields checklist (để khoá INSUFFICIENT)

Muốn verify live không suy đoán — cần dump một lần:

```json
{
  "journalOpenPending": [
    {
      "id": "",
      "symbol": "",
      "outcome.status": "PENDING|OPEN",
      "market.entryPrice": 0,
      "outcome.limitOrderPrice": null,
      "plan.openReason": "",
      "plan.entryZoneOptimal": 0,
      "plan.entryZoneType": "",
      "scoring.direction": "",
      "strategySource": "",
      "timestamp": 0
    }
  ],
  "esmBridge.snapshotBySymbol": {
    "NEARUSDT|BTCUSDT|BNBUSDT": {
      "mappedCurrentState": "",
      "harnessResult.pipelineResult.stateMachineResult.nextState": "",
      "harnessResult.pipelineResult.actionEngineResult.actions": [
        { "actionType": "", "reason": "" }
      ]
    }
  },
  "advisorLabelById": { "<entryId>": "<label if computed>" },
  "markBySymbol": { "NEARUSDT": 0, "BTCUSDT": 0, "BNBUSDT": 0 }
}
```

---

## 7. Khuyến nghị bước tiếp (không thực hiện trong báo cáo này)

1. **PENDING recommendation:** tách nhánh → Waiting Fill / Chờ khớp (align V4.1), không gọi ESM Hold cho PENDING.  
2. **Active Trades recommendation:** ưu tiên `advisorLabelById` (per-entry PA) cho OPEN; ESM chỉ badge/tooltip nếu cần.  
3. **Export live:** thêm close/hold reason (ESM reason hoặc PA `triggeredBy`) cạnh Open Reason khi RUNNING.  
4. **Verify:** dump JSON checklist §6 rồi re-classify Q1 live action + Q3 BNB rule.

---

## 8. Files đọc (read-only)

- `utils/journalRecommendationDisplay.ts`
- `utils/esmUiDisplay.ts`
- `utils/journalRecommendationDisplay.test.ts`
- `components/journal/JournalTradeTable.tsx`
- `components/journal/ActiveTradesPanel.tsx`
- `hooks/useJournalMarketSync.ts`
- `services/journalService.ts` (`newAiJournalPendingEntry`, status/close reason)
- `services/positionAdvisorExitTracking.ts`
- `services/v41/rc3/buildTradeSessionAdviser.ts`
- `services/v41/__tests__/tradeSessionAdviser.test.ts`
- `store/useTradeStore.driveSync.test.ts`
- `constants/aiJournal.ts` (`AI_JOURNAL_STORAGE_KEYS`)
- Local Storage WebView: `gd1_locked_plan`, `gd1_trade_journal_v2` (partial)

**Không sửa code trong phiên điều tra này.**
)
