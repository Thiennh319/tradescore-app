# Báo cáo điều tra: Active direction không reset giữa các scan

**Ngày:** 2026-07-05  
**Phạm vi:** Read-only — không sửa code  
**Triệu chứng:** BTC Long 9.06 > Short 6.67 ở cả 11:30 và 12:50, nhưng ScoreRing hiển thị 9.06 lúc 11:30 và **6.67** lúc 12:50.

---

## Tóm tắt executive

**Không tìm thấy cache `direction` từ scan trước** trong pipeline chính. Mỗi lần quét, `direction` được **tính lại** qua `suggestDirectionV4()` và ghi đè vào row mới.

Triệu chứng quan sát **khớp với thiết kế hiện tại**: UI hiển thị `snap.score` = điểm **phía active**, không phải `max(longScore, shortScore)`. `suggestDirectionV4()` có thể chọn **SHORT** dù `longScore > shortScore` khi Long bị override bởi hard block / awaitingRescore / decision.

**Giả thuyết khả dĩ nhất:** Long có `hardBlocks` (vd. `L5a CVD chưa đủ 1đ` trước task phân loại) → `suggestDirectionV4` → SHORT → ScoreRing = 6.67, trong khi cột LONG/SHORT vẫn hiện 9.06 / 6.67.

---

## Bước A — Trace luồng direction

### 1. `suggestDirectionV4()` — trả về ở đâu?

```1313:1324:services/scorerV4.ts
export function suggestDirectionV4(result: ScoringResultV4): Direction {
  const { long, short } = result;
  if (long.hardBlocks.length > 0 && short.hardBlocks.length === 0) return 'SHORT';
  if (short.hardBlocks.length > 0 && long.hardBlocks.length === 0) return 'LONG';
  if (long.awaitingRescore && !short.awaitingRescore) return 'SHORT';
  if (short.awaitingRescore && !long.awaitingRescore) return 'LONG';
  if (long.decision === 'KHONG_VAO' && short.decision !== 'KHONG_VAO') return 'SHORT';
  if (short.decision === 'KHONG_VAO' && long.decision !== 'KHONG_VAO') return 'LONG';
  const longScore = long.officialTotalScore ?? long.referenceTotalScore;
  const shortScore = short.officialTotalScore ?? short.referenceTotalScore;
  return longScore >= shortScore ? 'LONG' : 'SHORT';
}
```

**Thứ tự ưu tiên (trước khi so sánh điểm):**

| # | Điều kiện | Direction trả về |
|---|-----------|------------------|
| 1 | Long có hardBlocks, Short không | SHORT |
| 2 | Short có hardBlocks, Long không | LONG |
| 3 | Long awaitingRescore, Short không | SHORT |
| 4 | Short awaitingRescore, Long không | LONG |
| 5 | Long decision = KHONG_VAO, Short khác | SHORT |
| 6 | Short decision = KHONG_VAO, Long khác | LONG |
| 7 | Còn lại | So sánh `longScore` vs `shortScore` |

**Lưu ý:** `blockReasons[]` (score block, vd. L5a sau task fix) **không** tham gia `suggestDirectionV4`. Chỉ `hardBlocks[]`.

Gọi tại `scanSignalSymbol()`:

```829:832:services/signalBoardScan.ts
const directionV3 = suggestDirectionV3(scoringV3WithBonus);
const directionV4 = suggestDirectionV4(scoringV4WithBonus);
let v3Base = snapshotFromV3(scoringV3WithBonus, directionV3);
let v4Base = snapshotFromV4(scoringV4WithBonus, directionV4);
```

### 2. Direction được lưu vào đâu?

| Layer | Field | Ghi chú |
|-------|-------|---------|
| Scoring (runtime) | `directionV4` local | Chỉ trong 1 lần gọi `scanSignalSymbol` |
| Snapshot V4 | `row.v4.direction`, `row.v4.score` | `score` = điểm **active side** |
| Row denormalized | `row.direction`, `row.score` | Copy từ `v4Final` qua `baseRow` + `applySnapshotToRow` |
| UI (Signal Board) | `resolveSignalRow(row, 'v4').direction` | Đọc `row.v4` nếu có |
| Store (tab phân tích 1 symbol) | `useTradeStore.selectedDirection` | **Riêng** — cập nhật khi `runAnalysisForSymbol`, không phải mỗi scan 4 coin |

`snapshotFromV4` gắn direction → active score:

```291:306:services/signalBoardScan.ts
function snapshotFromV4(scoringV4, direction) {
  const active = direction === 'LONG' ? scoringV4.long : scoringV4.short;
  const displayScore = active.officialTotalScore ?? active.referenceTotalScore;
  return {
    score: displayScore,
    longScore: scoringV4.long.officialTotalScore ?? scoringV4.long.referenceTotalScore,
    shortScore: scoringV4.short.officialTotalScore ?? scoringV4.short.referenceTotalScore,
    direction,
    ...
  };
}
```

### 3. Scan mới — ghi đè hay merge?

**Ghi đè hoàn toàn** (không merge row cũ):

```140:145:hooks/useSignalBoard.ts
const next = await scanAllSignalRows(...);
setRows(next);  // thay toàn bộ mảng rows
```

Mỗi symbol: `baseRow` mới → `return applySnapshotToRow(baseRow, v4Final)`.

**Ngoại lệ Web:** nếu mirror APK còn fresh (< 3 phút), **bỏ qua quét local** và load persist:

```112:125:hooks/useSignalBoard.ts
if (isWeb && mirrorFresh) {
  applyPersistedBoard(cached, setRows, ...);
  return;  // không gọi scanAllSignalRows
}
```

→ Web có thể hiển thị snapshot APK cũ (direction baked in persist), trong khi log console từ lần quét APK khác.

### 4. Chỗ giữ state giữa các scan

| Mechanism | File | Ảnh hưởng `direction`? |
|-----------|------|-------------------------|
| `ambiguityStateRefV4` (useRef Map) | `hooks/useSignalBoard.ts:82-83` | **Không** — chỉ hysteresis `isAmbiguousDirection` |
| `resolveDirectionAmbiguity(previousState)` | `directionAmbiguity.ts` | **Không** — không ghi `snap.direction` |
| `loadPersistedSignalBoard` / Gist mirror | `signalBoardPersist`, `useSignalBoard` | **Có thể** — load row cũ nguyên snapshot (Web) |
| `applySnapshotToRow` spread `...row` | `signalBoardScan.ts:368` | **Latent risk** — hiện tại `row` = `baseRow` mới, không phải row state cũ |
| `useTradeStore.selectedDirection` | `useTradeStore.ts:927+` | Tab phân tích — **không** điều khiển ScoreRing Signal Board |

---

## Bước B — `applySnapshotToRow()`

```368:387:services/signalBoardScan.ts
function applySnapshotToRow(row: SignalRow, snap: SignalRowScorerSnapshot): SignalRow {
  return {
    ...row,
    score: snap.score,
    longScore: snap.longScore,
    shortScore: snap.shortScore,
    direction: snap.direction,
    decisionLabel: snap.decisionLabel,
    ...
    isAmbiguousDirection: snap.isAmbiguousDirection,
    ambiguousMessage: snap.ambiguousMessage,
  };
}
```

- **Merge partial:** spread `...row` rồi overwrite ~15 field top-level.
- **`direction`:** luôn copy từ `snap.direction` (tức `v4Final.direction` = output `suggestDirectionV4`).
- **Không merge** nested `row.v4` tại đây — `v4` đã set trong `baseRow` trước khi gọi (`v4: v4Final`).
- **Rủi ro thiết kế:** nếu sau này gọi `applySnapshotToRow(oldRowFromState, newSnap)`, field không liệt kê (vd. `adxGate`, `longSnapshot`) sẽ **sống sót từ row cũ**. Hiện tại không xảy ra.

---

## Bước C — Ambiguity state

```355:366:services/signalBoardScan.ts
function applyAmbiguityToSnapshot(snap, ambiguity) {
  if (ambiguity.status !== 'AMBIGUOUS') return snap;
  return {
    ...snap,
    isAmbiguousDirection: true,
    ambiguousMessage: ambiguity.message,
    canEnter: false,
  };
}
```

- **`snap.direction` không đổi** khi AMBIGUOUS — vẫn từ `suggestDirectionV4` tại bước trước.
- **`leaningDirection`** trong `AmbiguityState` chỉ dùng cho **message**, không gán vào `snap.direction`.
- Hysteresis (`ambiguityStateRef`) **persist qua scan** nhưng chỉ flip `isAmbiguousDirection` / `canEnter`, **không cache direction**.
- Với BTC 9.06 vs 6.67 (diff = 2.39 > threshold 1.0): **không vào AMBIGUOUS** → không giải thích flip direction.

---

## Bước D — Luồng đầy đủ → UI

```
scoreAnalysisV4(input)
  → applyVwapBonusToScoring (patch long/short totals, groupBlocks, decision)
  → resolveDirectionAmbiguity(longScore, shortScore, prevAmbiguityState)  // ref Map
  → directionV4 = suggestDirectionV4(scoringV4WithBonus)   ← ACTIVE SIDE
  → v4Base = snapshotFromV4(..., directionV4)              ← score = active side
  → applyAmbiguityToSnapshot(v4Base, ambiguityV4)
  → enrichSnapshotFinalStatus (plan, hardBlocks active side, ...)
  → baseRow { direction, longScore, shortScore, v4: v4Final, ... }
  → applySnapshotToRow(baseRow, v4Final)
  → setRows([...])  hoặc  applyPersistedBoard (Web mirror)

UI SignalBoard card:
  snap = resolveSignalRow(row, scorerVersion)  // row.v4
  displayScore = snap.score                      // ScoreRing — ACTIVE side only
  snap.longScore / snap.shortScore               // cột LONG / SHORT (luôn cả hai)
```

**ScoreRing** (`SignalBoard.tsx` ~889-893, 1186-1188):

```typescript
const displayScore = snap.awaitingRescore ? null : snap.score;
// snap.score ≠ max(long, short) — là điểm hướng active
```

---

## 1. Chỗ direction *có thể* bị “kẹt” / lệch kỳ vọng

| # | Vị trí | Mô tả | Khả năng gây bug quan sát |
|---|--------|-------|---------------------------|
| A | `suggestDirectionV4` override rules | Chọn SHORT dù longScore cao hơn | **Cao** — khớp 9.06/6.67 → hiện 6.67 |
| B | L5a / hard block Long (`hardBlocks`) | Push vào `hardBlocks` → rule #1 | **Cao** (trước task blockReasons) |
| C | `awaitingRescore` / `KHONG_VAO` một phía | Rule #3–6 | Trung bình |
| D | Web mirror persist | Hiển thị row APK cũ, không quét lại | Trung bình (Web only) |
| E | `applySnapshotToRow(...row)` spread | Field cũ sống sót nếu row ≠ baseRow mới | Thấp (chưa dùng pattern đó) |
| F | AMBIGUOUS hysteresis | Giữ direction cũ | **Loại trừ** (diff 2.39 > 1.0) |
| G | Cache direction scan trước | Không tìm thấy | **Loại trừ** |

---

## 2. Hypothesis — nguyên nhân khả dĩ nhất

### H1 (Primary): Override `suggestDirectionV4`, không phải cache direction

Cùng `longScore=9.06`, `shortScore=6.67` trên row, nhưng:

- **11:30:** Long không có `hardBlocks` (hoặc cả hai đều block) → rule #7 → LONG → ScoreRing **9.06**
- **12:50:** Long có `hardBlocks` (vd. `L5a CVD chưa đủ 1đ`, L3 MACD, BTC block, …), Short không → rule #1 → SHORT → ScoreRing **6.67**

Log “Long 9.06 > Short 6.67” mô tả **hai cột điểm**, không khẳng định active direction = Long.

**Cách verify (Task 4):** log thêm per scan cho BTC:

```text
directionV4, long.hardBlocks, short.hardBlocks,
long.decision, short.decision, long.awaitingRescore
```

### H2 (Secondary): Web mirror snapshot cũ

Web trong 3 phút sau APK scan dùng `applyPersistedBoard` thay vì `scanAllSignalRows`. UI có thể khác log local nếu so sánh Web vs APK.

### H3 (Unlikely): `selectedDirection` store

Chỉ ảnh hưởng TradeStorePanel / phân tích 1 symbol — **không** điều khiển ScoreRing trên Signal Board 4 coin.

---

## 3. File + dòng cần xem khi sửa (Task 4 — chưa sửa)

| Ưu tiên | File | Dòng / hàm | Hướng sửa gợi ý |
|---------|------|------------|-----------------|
| P0 | `services/scorerV4.ts` | `suggestDirectionV4` ~1313-1324 | Tách “hard block override” vs “score winner”; log/debug; cân nhắc dùng `blockReasons` trong logic hiển thị |
| P0 | `services/scorerV4.ts` | `buildDirectional` ~1154-1158 | L5a score block → `blockReasons` (đã fix task trước) — giảm false hard override |
| P1 | `services/signalBoardScan.ts` | `snapshotFromV4` ~291-306 | UI có thể hiện thêm “active direction” rõ hoặc ring = max side khi educate user |
| P1 | `components/dashboard/SignalBoard.tsx` | `displayScore` ~889-893 | ScoreRing vs long/short columns — làm rõ active side |
| P2 | `hooks/useSignalBoard.ts` | Web mirror ~112-125 | Timestamp / source badge khi dùng cached row |
| P2 | `services/signalBoardScan.ts` | `applySnapshotToRow` ~368 | Bỏ `...row` spread hoặc whitelist field — tránh stale merge tương lai |
| P3 | `services/directionAmbiguity.ts` | toàn file | Không liên quan case diff=2.39 |

---

## Checklist debug cho Task 4

1. Export / log 2 snapshot BTC 11:30 vs 12:50: `row.v4.direction`, `longHardBlocks`, `shortHardBlocks`, `longScore`, `shortScore`.
2. Xác nhận platform (Web mirror vs APK native scan).
3. Nếu H1 đúng: quyết định product — ScoreRing hiển thị **active** (hiện tại) hay **best** side?
4. Nếu hard block Long là L5a score-only: task blockReasons đã giảm false SHORT override.

---

*Báo cáo read-only — chưa thay đổi source code.*
