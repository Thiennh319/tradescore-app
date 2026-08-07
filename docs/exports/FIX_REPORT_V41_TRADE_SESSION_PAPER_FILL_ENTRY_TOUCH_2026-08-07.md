# FIX REPORT — V4.1 Trade Session paper fill (chạm Entry)

**Ngày:** 2026-08-07  
**Phạm vi:** `services/v41/**` (+ test liên quan). Không đụng Journal V3/V4 / `journalRecommendationDisplay` / SignalBoard.  
**UI:** Execution Monitor chỉ đọc store — không cần sửa component.

---

## 1. Triệu chứng (báo cáo người dùng)

| Field | Giá trị quan sát |
|--------|------------------|
| Symbol | NEAR SHORT |
| Trigger | Breakout Confirmed |
| Status | **Running ngay khi tạo** (Holding Time ~5m15s) |
| Entry | 1.6650 |
| Current | 1.6420 |
| PnL | +6.91% |

**Nghi vấn:** hệ thống coi breakout signal = đã vào lệnh, không chờ giá thực sự chạm Entry.

---

## 2. Kết luận điều tra

### **BUG** — không phải BY-DESIGN

Breakout Confirm B chỉ sinh **tín hiệu + levels kế hoạch**. Session được tạo đúng `Pending` / Waiting Fill, nhưng bước paper-fill sau scan **promote sai** lên `Running` chỉ vì đã có `markPrice`, **không** kiểm tra giá chạm Entry.

Ảnh hưởng cả session V4.1 (Breakout **và** Trend Reversal) vì cùng đường `buildTradeSessionAdviserPatches`.

---

## 3. Trace theo 4 câu hỏi

### Q1 — Confirm B (`confirmMode=retest`): đã vào lệnh hay chỉ tín hiệu?

**Chỉ tín hiệu.**

- `tryRetestBreakoutSetup` → Entry = **close nến retest** (`active.close`), `confirmMode: 'retest'`.
- `buildRc3ViewModel` / `adaptBreakoutToRc3Card` → card `triggerType: 'Breakout Confirmed'` + `levels.entry/sl/tp1`.
- Không gọi store / không set Running tại detector.

Trích:

```487:500:services/v41/breakoutDetector.ts
  const active = klines1H[retestIdx]!;
  return buildBreakoutLevels({
    side: event.side,
    entry: active.close,
    ...
    confirmMode: 'retest',
```

### Q2 — Nơi tạo Trade Session: có verify giá cross Entry trước Running?

**Tạo session:** `V41BoardRC3.openFromCard` → `useV41TradeSessionStore.createSession`  
→ luôn `status: 'Pending'`, `advisor: 'Waiting Fill'`, `entry` từ `card.levels.entry`.  
**Không** verify fill lúc tạo (đúng).

**Promote Running:** `hooks/useV41TradeSessionAdviser` → `buildTradeSessionAdviserPatches` sau mỗi scan.

**Trước fix (BUG):**

```ts
const nextStatus =
  session.status === 'Pending' && hasMark ? 'Running' : session.status;
```

Chỉ cần `markPrice` hữu hạn > 0 → Running. Không so với Entry.

### Q3 — So với luồng Waiting Fill / Pending?

| Bước | Thiết kế đúng | Thực tế trước fix |
|------|----------------|-------------------|
| Tạo session | Pending + Waiting Fill | Đúng |
| Đợi chạm Entry | Giữ Pending | **Bỏ qua** — Running ngay nếu có mark |
| Sau fill | Running + Position Adviser | Running sớm + PnL giả |

`buildTradeSessionAdvisorViewModel`: `Pending` → Waiting Fill (không gọi `evaluatePositionV41`) — đúng; bị bỏ qua vì status đã bị promote sớm.

### Q4 — Entry 1.6650 lấy từ đâu?

**Giá kế hoạch lúc Confirm B** = close nến retest (qua RC3 levels), **không** phải giá fill thật trên sàn.  
Sau khi tạo session, `session.entry` giữ mức đó; PnL = `computeCurrentPnlPct(entry, mark, …)` khi (sai) đã Running.

Với SHORT limit semantics chuẩn: fill khi `mark >= entry`.  
Mark 1.642 **&lt;** 1.665 → **chưa khớp** → phải Remaining Pending; trước fix lại Running + PnL dương.

---

## 4. Sửa

### File đổi

| File | Thay đổi |
|------|----------|
| `services/v41/rc3/buildTradeSessionAdviser.ts` | Thêm `isV41SessionEntryFilled`; promote Pending→Running chỉ khi chạm Entry; Pending giữ Waiting Fill, `pnl=null`, vẫn cập nhật `current` |
| `services/v41/__tests__/tradeSessionAdviser.test.ts` | Cập nhật test promote; thêm case NEAR SHORT; unit test helper |

### Semantics fill (đồng bộ journal pending limit)

- **LONG:** `markPrice <= entry`
- **SHORT:** `markPrice >= entry`

### Sau fix (logic chính)

```ts
export function isV41SessionEntryFilled(action, markPrice, entry): boolean {
  // LONG: mark <= entry · SHORT: mark >= entry
}

const filled =
  session.status === 'Pending' &&
  hasMark &&
  isV41SessionEntryFilled(session.action, markPrice, session.entry);

const nextStatus = filled ? 'Running' : session.status;
```

Scenario báo cáo: SHORT entry 1.665 / mark 1.642 → **Pending / Waiting Fill**, `pnl = null`.

---

## 5. Test

```text
npx vitest run services/v41/__tests__/tradeSessionAdviser.test.ts
→ 13 passed

(+ nhóm liên quan breakout trước đó: pickCurrentBreakoutSetup,
  adaptBreakoutToRc3Card, breakoutDetector — không phá)
```

Case phủ:

- LONG mark trên entry → giữ Pending  
- LONG mark ≤ entry → Running  
- NEAR SHORT 1.642 vs 1.665 → Pending  
- NEAR SHORT mark ≥ 1.665 → Running  

---

## 6. Không đụng

- `journalRecommendationDisplay.ts`, `components/journal/*`, `useJournalMarketSync.ts`
- SignalBoard / V3–V4 scorer / journalService  
- `breakoutDetector` algorithm (chỉ mức tín hiệu — đúng)  
- `V41ExecutionMonitor.tsx` (chỉ render)

---

## 7. Ghi chú vận hành

- Session V4.1 **đang Running sai** trước khi cài bản có fix: user nên **End** session cũ và mở lại từ card nếu cần hành vi Waiting Fill đúng.
- Rebuild APK/Web nếu cần artifact chứa fix (source đã sửa trong tree).
