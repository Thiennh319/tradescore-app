# Báo cáo — Derive `hardBlocked` + dùng trên SignalBoard

**Ngày:** 2026-08-08  
**Phạm vi:** `services/signalBoardScan.ts` + `components/dashboard/SignalBoard.tsx` (+ LayerCard / FinalEntry)  
**Không sửa code.**

---

## 1. Đoạn code derive `hardBlocked` (kèm số dòng)

Có **hai** đường snapshot song song (V3 và V4). Cả hai set `hardBlocked` giống quy tắc OR.

### V3 — `snapshotFromV3`

```544:561:services/signalBoardScan.ts
function snapshotFromV3(
  scoringV3: ScoringResultV3,
  direction: TradeDirection,
): SignalRowScorerSnapshot {
  const active = direction === 'LONG' ? scoringV3.long : scoringV3.short;
  const violations = [...active.hardBlocks, ...active.groupBlocks];
  return {
    // ...
    mandatoryViolations: violations,
    hardBlocked: active.hardBlocks.length > 0 || active.groupBlocks.length > 0,
```

### V4 — `snapshotFromV4`

```579:601:services/signalBoardScan.ts
function snapshotFromV4(
  scoringV4: ScoringResultV4,
  direction: TradeDirection,
): SignalRowScorerSnapshot {
  const active = direction === 'LONG' ? scoringV4.long : scoringV4.short;
  // ...
  const violations = [
    ...active.hardBlocks,
    ...active.blockReasons,
    ...active.groupBlocks,
  ];
  return {
    // ...
    mandatoryViolations: violations,
    hardBlocked: active.hardBlocks.length > 0 || active.groupBlocks.length > 0,
```

(`blockReasons` **không** vào điều kiện `hardBlocked`; chỉ vào `mandatoryViolations` ở V4.)

Copy thẳng sang row:

```656:669:services/signalBoardScan.ts
function applySnapshotToRow(row: SignalRow, snap: SignalRowScorerSnapshot): SignalRow {
  return {
    ...
    hardBlocked: snap.hardBlocked,
```

---

## 2. `hardBlocked` set `true` khi nào?

**Không chỉ** khi `active.hardBlocks.length > 0`.

Công thức hiện tại (V3 và V4):

```text
hardBlocked = (hardBlocks.length > 0) OR (groupBlocks.length > 0)
```

| Nguồn | Làm `hardBlocked = true`? |
|-------|---------------------------|
| `hardBlocks` non-empty | **Có** |
| `groupBlocks` non-empty | **Có** |
| `blockReasons` non-empty alone | **Không** (chỉ cộng vào `mandatoryViolations` V4) |

Tên field **`hardBlocked` lệch nghĩa**: true cả khi chỉ còn Group Block (không có Hard thật).

---

## 3. Ví dụ thực tế

Giả sử:

```text
hardBlocks   = []
groupBlocks  = ["Nhóm A (Xu hướng) 1.6/5đ < 2.5đ"]
blockReasons = ["L5a CVD chưa đủ 1đ..."]
```

Theo dòng 561 / 601:

```text
hardBlocked = ([] .length > 0) || (["Nhóm A..."].length > 0)
            = false || true
            = **true**
```

`blockReasons` L5a **không** quyết định boolean này; nhưng vì `groupBlocks` có phần tử → **`hardBlocked === true`**.

(Nếu chỉ còn `blockReasons` và `groupBlocks = []`, `hardBlocked` sẽ là **false**.)

Song song, `FinalEntryStatus` (enrich) **không** dùng boolean `hardBlocked` — nó phân đúng hơn:

```187:192:services/finalEntryStatus.ts
  const finalEntryStatus = calculateFinalEntryStatus(
    decisionLabel,
    tradePlan?.tradePlanValid ?? false,
    side.hardBlocks.length > 0,   // hard thật
    side.groupBlocks.length > 0,  // group riêng
  );
```

→ Ví dụ trên: `hardBlocks=[]` + `groupBlocks` non-empty → **`GROUP_BLOCKED`**, không `HARD_BLOCKED`.

---

## 4. `SignalBoard.tsx` dùng `snap.hardBlocked` thế nào? Có badge “Hard Block” nhầm Group?

### 4a. Chỗ đọc trực tiếp `snap.hardBlocked`

**A. `hasAnyHardBlock`** — đặt tên “Hard” nhưng OR với `snap.hardBlocked` (có thể chỉ là group):

```460:469:components/dashboard/SignalBoard.tsx
function hasAnyHardBlock(
  row: SignalRow,
  snap: ReturnType<typeof resolveSignalRow>,
  blockReasons: string[],
): boolean {
  return (
    row.adxGate?.block === true ||
    snap.hardBlocked === true ||
    blockReasons.length > 0
  );
}
```

Dùng trong `isDirectionBlocked` / `isDirectionReady` → ảnh hưởng nút/điều kiện sẵn sàng, **không** phải chữ badge “HARD BLOCK”.

**B. Fallback lý do “hard”** khi list `*HardBlocks` rỗng:

```1266:1273:components/dashboard/SignalBoard.tsx
  const rawHardBlockReasons =
    sideHardBlocks.length > 0
      ? sideHardBlocks
      : !snap.hardBlocked
        ? []
        : snap.mandatoryViolations.filter(
            (v) => !(snap.groupBlocks ?? []).includes(v),
          );
```

Và `collectHardBlockReasons` cùng pattern (`tradePlanDisplay.ts` ~107–120):

- Ví dụ Q3: `hardBlocked=true`, `sideHardBlocks=[]` → lấy `mandatoryViolations` trừ group → **còn lại `blockReasons` (L5a soft)** bị nhét vào danh sách **hard reasons**.  
→ Đây là **bug semantic / wire lý do**: soft bị gắn nhãn hard-reason, dù status entry có thể vẫn `GROUP_BLOCKED`.

**C. Truyền vào `collectHardBlockReasons`:**

```1247:1253:components/dashboard/SignalBoard.tsx
  const hardBlockSnapInput: HardBlockSnapInput = {
    ...
    hardBlocked: snap.hardBlocked,
```

### 4b. Badge user nhìn thấy trên card status (đang **bật**)

`resolveCardBadge` / `isSideHardBlockedForBadge` **không** đọc `snap.hardBlocked`. Chỉ coi hard khi:

```248:269:components/dashboard/SignalBoard.tsx
function isSideHardBlockedForBadge(...): boolean {
  if (sideHardBlocks(direction, snap).length > 0) return true;  // hardBlocks list thật
  if (row.adxGate?.block) return true;
  // ... BTC HARD_BLOCK_RULES_V4 ...
  return false;
}
```

Text badge dạng `🔴 BLOCK CẢ HAI — …` / `🟡 BLOCK LONG — …` (`kind: 'HARD_BLOCK' | 'PARTIAL_BLOCK'`), **không** chữ `"HARD BLOCK 🚫"`.  
Với **chỉ** Group Block (không hard list / ADX / BTC), `isSideHardBlockedForBadge` = **false** → **không** rơi nhánh đỏ “hard cả hai” chỉ vì group.

Hiển thị:

```1388:1391:components/dashboard/SignalBoard.tsx
          <View style={[styles.statusBadgeBox, { backgroundColor: cardBadge.backgroundColor }]}>
            <Text style={styles.statusBadgeTitle}>{cardBadge.text}</Text>
          </View>
```

### 4c. Badge chữ `"HARD BLOCK 🚫"` (`FinalEntryBadge`)

```76:81:services/finalEntryStatus.ts
    case FinalEntryStatus.HARD_BLOCKED:
      return {
        label: 'HARD BLOCK 🚫',
        ...
```

Group-only → status **`GROUP_BLOCKED`** → label **`CHẶN NHÓM ⛔`**, không “HARD BLOCK”.

Nhưng block này đang **ẩn** trên SignalBoard:

```1547:1568:components/dashboard/SignalBoard.tsx
          {false && (
            <>
          ...
                <FinalEntryBadge
                  display={entryDisplay}
```

### 4d. Kết luận bug UI?

| Giả thuyết | Kết luận |
|------------|----------|
| Badge card hiện **“Hard Block”** trong khi chỉ có Group Block | **Không đúng** với path status badge đang bật (`resolveCardBadge` không dùng `snap.hardBlocked`; FinalEntry “HARD BLOCK” đang `{false &&}`). Group-only + FinalEntry (nếu bật) hiện **“CHẶN NHÓM”**. |
| Field / logic **`hardBlocked` đặt tên sai** (true khi chỉ group) | **Đúng — bug/semantic wire thật** tại `signalBoardScan.ts:561` & `:601`. |
| Hậu quả: `hasAnyHardBlock` + `collectHardBlockReasons` / `rawHardBlockReasons` nhầm soft vào “hard reasons” | **Đúng — bug wire thật** (`SignalBoard.tsx` ~1266–1273, `tradePlanDisplay.ts` ~107–120), dù không phải badge literal “HARD BLOCK”. |

---

## 5. `blockType`-equivalent trên UI (Hard/Soft theo layer)?

**UI không phân loại Hard/Soft kiểu export `blockType` ở cấp layer.**

- `LayerCard` chỉ dùng `layer.isMandatoryViolation` để **màu bar bearish + prefix `⚠`** trên reason — **không** map sang HARD/SOFT:

```40:65:components/LayerCard.tsx
        const barColor = layer.isMandatoryViolation
          ? COLORS.bearish
          : layer.score >= 1
            ? COLORS.bullish
            ...
                {layer.isMandatoryViolation ? '⚠ ' : ''}
                {layer.reason}
```

- Phân Hard / Group / Score ở UI (khi còn dùng) là **`FinalEntryStatus`** (`HARD_BLOCKED` / `GROUP_BLOCKED` / `SCORE_BLOCKED`) — cấp **entry**, không phải từng layer.
- Map `isMandatoryViolation` → `blockType` Soft/Hard nằm ở **export** (`services/aiExport/traceLayerPresentation.ts`: comment *Never treat isMandatoryViolation alone as HARD* → soft khi violation). **Không** wired vào dashboard UI layer cards.

---

## Tóm tắt nhanh

1. Derive: `hardBlocked = hardBlocks.length>0 || groupBlocks.length>0` (V3 L561, V4 L601).  
2. Không chỉ hard list; **group cũng bật**; `blockReasons` alone **không**.  
3. Ví dụ group + L5a soft: **`hardBlocked = true`**.  
4. Badge “HARD BLOCK 🚫” không bật hiện tại; **bug thật** là tên/`OR group` + promote soft→hard-reasons; group-only FinalEntry = CHẶN NHÓM.  
5. UI layer: chỉ `isMandatoryViolation` visual; **không** có Hard/Soft `blockType` như export.

---

## Task ID

**REPORT-HARD_BLOCKED-DERIVE-SIGNALBOARD** · 2026-08-08 · report-only
