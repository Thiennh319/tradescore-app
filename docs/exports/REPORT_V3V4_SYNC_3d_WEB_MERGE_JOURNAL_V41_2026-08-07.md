# REPORT — Task V3V4-SYNC-3d (Web Merge — Journal & V41Sessions)

**Ngày:** 2026-08-07  
**Follow-up:** Guard A (3b/3c) — lớp phòng thủ thứ 2 trên Web apply mirror  
**Phạm vi:** Chỉ **Journal** + **V41 Sessions**. Không đụng Positions / Capital / SignalBoard.

---

## Trạng thái

**DONE** — Web (và APK empty-push restore) dùng **MERGE theo id** (remote thắng khi trùng); local-only được giữ. Tests PASS.

---

## Cơ chế cũ (REPLACE)

Journal — set thẳng `remote`:

```typescript
const persisted = applyJournalPersist(remote, nextStats);
// … setState từ remote; local-only bị mất
```

`countJournalMirrorChanges` còn đếm local-only là “change” → kích hoạt wipe khi remote thiếu entry.

V41 — `replaceSessionsFromRemote` gán `sessions = remote` toàn bộ.

---

## Thiết kế merge mới

Helper chung `services/driveSyncMerge.ts` → `mergeByIdRemoteWins(local, remote)`:

1. Duyệt local: nếu có cùng id trên remote → **lấy bản remote** (APK master); nếu không → **giữ local**.
2. Append remote-only ids.
3. `changes` = số lần add/update nội dung (không tính “local-only sẽ bị xóa”).

Rule trùng id (đã chốt): **remote luôn thắng** (không so timestamp).

Cùng hàm cho Web mirror và `empty_push_guard` restore (local rỗng → kết quả ≡ replace).

---

## Đã sửa

| File | Thay đổi |
|------|----------|
| `services/driveSyncMerge.ts` | **Mới** — `mergeByIdRemoteWins` |
| `store/useTradeStore.ts` | `applyJournalMirrorFromApk` merge + persist `merged` |
| `store/useV41TradeSessionStore.ts` | `mergeSessionsFromRemote`; `replaceSessionsFromRemote` alias; bridge gọi merge |
| `services/__tests__/driveSyncMerge.test.ts` | Unit merge (N+M, partial wipe, remote wins, empty remote) |
| `services/__tests__/driveSync.webMerge3d.test.ts` | Wiring journal + V41 store |

---

## Test

| Suite | Kết quả |
|-------|---------|
| `driveSyncMerge.test.ts` | PASS |
| `driveSync.webMerge3d.test.ts` | PASS |
| driveSync emptyPush / service / v41 / e2e / smoke | PASS |
| `useTradeStore.driveSync.test.ts` | PASS |
| **Tổng batch** | **42 passed** |

---

## Vấn đề “xoá entry” (trade-off — chưa soft-delete)

| Phát hiện | Chi tiết |
|-----------|----------|
| Journal | `removeJournalEntry` chỉ filter **legacy** `tradeJournal` theo id — **hard delete** khỏi mảng. **Không** có `deletedAt` / soft-delete trên `AiTradeJournalEntry`. |
| V41 | `endSession` → status `Closed` (giữ bản ghi); `clearAll` xoá sạch local. Không soft-delete flag. |

**Hệ quả merge:** Entry xoá cứng trên APK (không còn trong Gist) **sẽ không biến mất trên Web** nếu Web đã từng có id đó.  
**Đề xuất sau (chưa làm):** soft-delete (`deletedAt`) trên journal (và tuỳ chọn V41) rồi merge tôn trọng flag xoá; hoặc “tombstone” sync.

---

## Việc còn lại

1. **Positions / Capital / SignalBoard** — merge/guard riêng (task sau).  
2. Soft-delete nếu product cần xoá APK → Web.  
3. Hướng A vẫn là lớp 1; 3d là lớp 2 trên list domains.

---

## Rủi ro

| Rủi ro | Mức | Ghi chú |
|--------|-----|---------|
| Web tích tụ entry đã xoá trên APK | TB | Trade-off đã document |
| Trùng id nội dung local mới hơn APK vẫn bị remote đè | Thấp | Đúng chốt “APK master” |
| Positions/Capital vẫn REPLACE | TB | Chưa nằm trong 3d |

---

## Kết luận

Web Journal + V41 Sessions: **MERGE giữ local-only, remote wins on id**. Empty Gist không còn wipe sạch Web list domains này.
