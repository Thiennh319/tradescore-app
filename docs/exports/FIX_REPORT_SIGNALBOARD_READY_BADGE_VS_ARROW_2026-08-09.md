# FIX REPORT — Badge "Sẵn sàng" vs mũi tên hướng (SignalBoard compact)

**Ngày:** 2026-08-09  
**Phạm vi:** code + test only — **chưa build** lại APK/Web  
**Branch:** hiện tại (working tree)

---

## Verdict

| Mục | Kết luận |
|-----|----------|
| Nguyên nhân | **2 điều kiện lệch nhau** (không phải cache) |
| Chỉ mobile? | **Logic badge dùng chung desktop + mobile** — desktop cũng lệch trước đây (badge xanh vs score LONG/SHORT xám) |
| Hướng fix (đã apply) | **Unify:** READY ⇔ `longBtnEnabled \|\| shortBtnEnabled` |
| Đổi tên badge? | **Không** — giữ "Sẵn sàng" vì giờ đúng nghĩa "có thể vào lệnh hướng gợi ý" |

---

## 1) Hai chỗ logic (trước fix)

### A) Badge READY — `resolveCardBadge` bước [5]

```ts
// CŨ — quá rộng
if (longCanEnter || shortCanEnter || totalScore >= 9) {
  return { kind: 'READY', text: '🟢 SẴN SÀNG', ... };
}
```

- `totalScore >= 9` đủ để xanh dù **không** chiều nào vào lệnh được  
- `longCanEnter` / `shortCanEnter` **không** qua U1 (ambiguity) / official-direction

### B) Mũi tên tip + nút LONG/SHORT

```ts
longReady / shortReady = score hướng ≥ 9 && !blocked
longBtnEnabled = isU1DirectionButtonEnabled({ ..., directionReady: longReady })
// tip: longBtnEnabled → ↑ L xanh; else hướng snap nhưng màu muted
```

U1 tắt cả hai khi `isAmbiguous`, và chỉ bật **đúng** `snap.direction`.

→ Ví dụ ảnh: 6 coin badge "Sẵn sàng" vì `totalScore≥9` / canEnter lỏng; chỉ SOL có official direction + directionReady → mũi tên xanh.

---

## 2) Fix đã áp dụng

| File | Thay đổi |
|------|----------|
| `components/dashboard/signalBoardU1.ts` | Thêm `shouldShowReadyBadge(long, short)` |
| `components/dashboard/SignalBoard.tsx` | READY chỉ khi `enterActionable`; bỏ `totalScore≥9` shortcut |
| Cùng file | Desktop `SignalCard` + mobile `resolveSignalRowUiChrome` compute nút **trước**, rồi badge |
| `components/dashboard/signalBoardU1.test.ts` | Invariant READY ↔ nút; case Ambiguous / non-official |

```ts
// MỚI
const enterActionable = shouldShowReadyBadge(longBtnEnabled, shortBtnEnabled);
const cardBadge = resolveCardBadge(..., enterActionable);
// [5] if (enterActionable) → READY; else WATCH
```

Filter mobile `Sẵn sàng (N)` dùng `cardBadge.kind === 'READY'` → cũng chỉ còn coin thật sự bấm được hướng.

---

## 3) Desktop

Cùng `resolveCardBadge` + cùng `longBtnEnabled` tô màu LONG/SHORT score trên card.  
Bug **không chỉ riêng compact** — compact chỉ làm lệch **dễ thấy** vì tip ↑ L / ↓ S cạnh badge. Desktop đã sửa cùng rule.

---

## 4) Test

```bash
npx vitest run components/dashboard/signalBoardU1.test.ts
```

Invariant chính: badge READY ⇒ ít nhất một trong LONG/SHORT enabled (và tip active cùng hướng).

---

## 5) Review diff gợi ý

```
components/dashboard/signalBoardU1.ts
components/dashboard/SignalBoard.tsx   # resolveCardBadge + 2 call sites
components/dashboard/signalBoardU1.test.ts
```

Chưa commit / chưa build — chờ approve.
