# REPORT — V4.1 `momentum_confirmed` vs Breakout Confirm B (NEAR)

**Ngày:** 2026-08-07  
**Chế độ:** Điều tra → sửa chỉ nếu BUG (phạm vi `services/v41/**` | `v41Export/**` | UI `components/v41/**`).  
**Kết luận:** **BY-DESIGN** — không sửa code.  
**Không đụng:** `buildTradeSessionAdviser.ts`, `runV41MiExport.ts`, `V41SignalPanel.tsx` (Task V41-1/2).

---

## 0. Hiện tượng

Rulebook NEARUSDT SHORT (breakout):

| Rule | Status | Ý nghĩa quan sát |
|------|--------|------------------|
| Rule 21 `momentum_confirmed` | **FAIL** | Actual `LONG(0)/SHORT(0)` — scan-time chưa confirmed |
| Rule 20 `early_warning_block` | FAIL | severity=CLEAR (không BLOCK — tốt) |
| Decision Output | **SHORT** | Confirm B (Rule 03/04 PASS) |
| Pipeline Stage Map §7 | text | "Early Warning BLOCK + Momentum confirmed → entry gates (scan path)" |

Nghi vấn: breakout bỏ qua gate momentum chung.

---

## 1. Kết luận ngắn

**BY-DESIGN — không phải BUG bỏ gate.**

Có **hai lớp momentum khác nhau**:

1. **Confirm B (breakout engine):** bắt buộc `momentumConfirmed*` **tại cửa sổ lịch sử** đến nến breakout/retest — đã có trong `breakoutDetector`. Không có Confirm B nếu lúc confirm thiếu momentum cùng phía.
2. **Rule 21 / scan-path entry gates:** đọc `row.momentum` **tại thời điểm scan hiện tại** (nến 1H mới nhất) — phục vụ EQ / `opportunityValid` / export `entryReady` của luồng **TR / scan path**, **không** gate nút Open Long/Short RC3 breakout.

Decision SHORT từ Confirm B + Rule 21 FAIL là **có thể và đúng thiết kế**: retest historically đã pass momentum; **hiện tại** score 0/0.

Decision Engine TR **không** dùng `momentumConfirmed*` để ra LONG/SHORT.

---

## 2. Trace chi tiết

### 2.1 `computeMomentum1H` được gọi ở đâu?

| Nơi | Vai trò |
|-----|---------|
| `momentumEngine1H.ts` | Định nghĩa: score ≥2 → `momentumConfirmedLong/Short` |
| `breakoutDetector.ts` | Gate Confirm A/B — slice đến **breakoutIndex / retestIdx** |
| `scanV41.ts` | Gắn `row.momentum` từ **full klines1H hiện tại** |
| `trendFollowDetector.ts` | TF path |
| Consume khác | `entryQualityEngine`, `reversalTradeSetup`, `positionAdvisorV41`, export/rulebook |

### 2.2 Breakout path — có check momentum trước Confirm B?

**Có — bắt buộc trong detector**, không dựa `row.momentum` scan sau:

```408:485:services/v41/breakoutDetector.ts
function momentumAligned(side, momentum) {
  return side === 'LONG'
    ? momentum.momentumConfirmedLong
    : momentum.momentumConfirmedShort;
}
// tryImmediateBreakoutSetup / tryRetestBreakoutSetup:
const win = klines1H.slice(0, retestIdx + 1); // hoặc breakoutIndex
const momentum = computeMomentum1H(win);
if (!momentumAligned(event.side, momentum)) return null;
```

`buildRc3ViewModel` / `adaptBreakoutToRc3Card`:

- Chỉ `scanBreakoutSetups` → `pickCurrentBreakoutSetup` → card.
- `triggerType='Breakout Confirmed'` / `gate.activeEligible=true` khi `breakoutLevels != null` (đã qua gate trên).
- **Không** đọc lại `row.momentum` (đúng — tránh double-gate với momentum **hiện tại**).

Checklist card item `momentum` = “Confirm B pipeline passed” (4 mục), không = Rule 21 live scan.

### 2.3 Trend-Reversal path — momentum có bắt buộc trước Decision LONG/SHORT?

**`isEligibleForDirection` / `evaluateDecision`:** không hề check `momentumConfirmed*`.

Eligibility: TR confirmed, market context, completeness, hardBlocks — **không** momentum.

Momentum bắt buộc ở lớp **sau** TR decision, trên **scan/EQ setup**:

```264:265:services/v41/entryQualityEngine.ts
const momentumConfirmed = resolveMomentumConfirmed(opportunityDirection, momentum);
if (!momentumConfirmed) return false; // → opportunityValid
```

```97:103:services/v41/reversalTradeSetup.ts
if (!momentumConfirmed) return null; // counter-trend setup
```

### 2.4 UI “vào lệnh” V4.1 — có bị Rule 21 chặn không?

`V41SignalCard` / `V41BoardRC3.openFromCard`:

- Show Open khi `decision === LONG|SHORT` && `levels != null`.
- **Không** đọc `opportunityValid`, `entryReadyLong/Short`, hay `row.momentum`.

→ Nút breakout **không** bị `momentum_confirmed` FAIL (scan-time) chặn — đúng với Confirm B đã lọc lịch sử.

`entryReady*` trong `exportServiceV41.resolveEntryReady` là export/scan-path; **không** wire RC3 Open.

### 2.5 Rulebook SPEC / document có nói “momentum chỉ cho TR” không?

**Mơ hồ — giống cảm nhận user.**

- NEAR: `market_context` ×5 + Decision Engine rules = **SKIPPED** với lý do N/A breakout (Task 6 style).
- `momentum_confirmed` vẫn **buildMomentumRule(row)** như TR → FAIL khi live 0/0, dù Decision = Confirm B SHORT.
- Stage Map **chung** (Formatter) bước 7: *"Early Warning BLOCK + Momentum confirmed → entry gates (**scan path**)"* — ghi “scan path” nhưng document **không** nói rõ N/A cho breakout Decision Output.
- `buildBreakoutDecisionChain` vẫn append `MomentumLong=…|Short=…` từ **input snapshot hiện tại** (dễ hiểu nhầm là gate Decision).

Không có câu minh định trong SPEC embedded: “Rule 21 N/A cho breakout Confirm B”.

---

## 3. Vì sao không phải BUG “bỏ gate”?

| Khẳng định sai | Thực tế code |
|----------------|--------------|
| Breakout không check momentum | Check tại retest/breakout bar trong detector |
| Decision Engine cần momentum cho mọi path | TR Decision **không** dùng momentum; breakout Decision = Confirm B card |
| Rule 21 FAIL ⇒ setup “ảo” | Rule 21 = live scan momentum ≠ Confirm-time momentum |

Nếu **bắt buộc thêm** `row.momentum` hiện tại trước khi RC3 Decision SHORT:

- Siết mạnh tần suất tín hiệu (setup Confirm B “cũ” hết confirmed live → mất SHORT).
- **Trùng / lệch temporal** với gate đã pass lúc retest.
- → **Trade-off UX lớn** — theo prompt: dừng, **không** tự apply.

---

## 4. Đề xuất (không tự làm — BY-DESIGN)

Làm rõ document/rulebook export (tương tự Rule 8–17 market_context):

1. Với `resolveSymbolStrategy === 'breakout'`: Rule `momentum_confirmed` → **SKIPPED / INFO**  
   - reason: *N/A scan-path — Confirm B đã yêu cầu momentumAligned tại nến retest trong `breakoutDetector`; Rule 21 đọc `row.momentum` live không gate Decision RC3.*
2. (Tuỳ chọn) Rule INFO: Actual = momentum tại `activeOpenTime` / retestIdx nếu reproduce được từ `klines1H`.
3. Stage Map: bản breakout riêng — bỏ hoặc chú thích bước 7 chỉ áp dụng TR scan path; Decision = Confirm B.
4. Embedded SPEC: một dòng *“momentum_confirmed (Rule 21) không áp dụng làm gate Decision breakout.”*

---

## 5. Sửa code?

**Không.** Không đổi detector, RC3, Decision Engine, hay Task V41-1/2 files.

---

## 6. Tóm tắt 1 dòng

Confirm B **đã** gate momentum lịch sử; Rule 21 FAIL là **momentum live scan-path** — không chứng minh breakout bỏ gate quan trọng; lệch là **gap documentation rulebook**, không phải thiếu gate engine.
