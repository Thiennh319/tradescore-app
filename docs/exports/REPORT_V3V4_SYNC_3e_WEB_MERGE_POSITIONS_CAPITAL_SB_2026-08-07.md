# REPORT — Task V3V4-SYNC-3e (Web Merge — Positions / Capital / SignalBoard)

**Ngày:** 2026-08-07  
**Follow-up:** 3d (Journal + V41 list merge) — hoàn tất lớp Web cho 3 domain object còn lại.

---

## Trạng thái

**DONE** — Positions field-wise + Capital default-guard trên Web apply; SignalBoard **không sửa** (rule cũ đủ). Helper tách `driveSyncPayloadGuards.ts`. Tests **47 PASS**.

---

## Thiết kế từng domain

### Positions

`mergePositionsFieldsRemote` (field-wise):

| Remote field | Hành vi |
|--------------|---------|
| `currentOpenTrade != null` | Áp remote |
| `currentOpenTrade == null` + local đang có | **Giữ local**, log `🛡️` |
| `lockedPlan` tương tự | Giống open |

**Trade-off (đã chốt):** đóng lệnh thật trên APK (`null`) **không** tự clear open trên Web — user đóng thủ công trên Web UI.

### Capital

Tái dùng `isCapitalPayloadDefaultEmpty` (ngưỡng 3c: milestone ≥1 hoặc số vốn ≠ 34):

- Local **có data thật** + remote **rỗng/default** → **không ghi đè**, log `🛡️`
- Còn lại (remote meaningful / cả hai default / empty-push restore local empty) → apply như cũ

### SignalBoard

Giữ nguyên trong `applyToLocalStore`:

- Skip nếu remote không có `rows` / `scannedAt`
- Skip nếu `local.scannedAt >= remote.scannedAt`

Không phát hiện lỗ hổng rõ cần “ít rows hơn nhưng scannedAt mới hơn” trong task này — remote scan mới hơn với ít rows vẫn có thể là hợp lệ (lọc coin). **Không sửa.**

---

## Đã sửa

| File | Thay đổi |
|------|----------|
| `services/driveSyncPayloadGuards.ts` | **Mới** — capital/positions emptiness + `mergePositionsFieldsRemote` + re-home Guard A helpers |
| `services/githubSyncService.ts` | Import + re-export guards; bỏ bản local trùng |
| `store/useTradeStore.ts` | Positions field-wise; capital block default-remote |
| `services/__tests__/driveSync.objectMerge3e.test.ts` | Tests 3e |

---

## Test

| Suite | Kết quả |
|-------|---------|
| `driveSync.objectMerge3e.test.ts` | PASS |
| emptyPush / merge 3d / service / v41 / e2e / smoke / useTradeStore.driveSync | PASS |
| **Tổng** | **47 passed** |

---

## Việc còn lại

1. Soft-delete journal (3d) nếu cần xoá APK → Web.  
2. (Tuỳ chọn) Positions: tombstone `closedAt` nếu muốn sync đóng lệnh mà không phá field-wise.  
3. (Tuỳ chọn) SignalBoard: rule “rows≪local + scannedAt mới” nếu quan sát thực tế cần.

Chuỗi **3a→3e** defense-in-depth: Guard A (APK push) + Web merge/protect đã phủ journal/v41/positions/capital (+ signalBoard rule cũ).

---

## Rủi ro

| Rủi ro | Mức | Ghi chú |
|--------|-----|---------|
| Open trade đóng trên APK không clear Web | TB | Đã chấp nhận + đóng tay trên Web |
| Locked plan tương tự | Thấp–TB | Cùng field-wise |
| SignalBoard scan mới “nghèo” hơn vẫn đè | Thấp | By design scannedAt |
| Capital đúng 34 không milestone | Thấp | Như 3c |

---

## Kết luận

Web object domains: Positions không bị remote-null wipe; Capital không bị remote-default wipe; SignalBoard giữ rule `scannedAt`.
