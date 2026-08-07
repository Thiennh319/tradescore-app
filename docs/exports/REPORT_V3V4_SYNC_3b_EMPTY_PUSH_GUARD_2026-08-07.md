# REPORT — Task V3V4-SYNC-3b (Guard A — Prevent Empty Push)

**Ngày:** 2026-08-07  
**Liên quan:** `REPORT_V3V4_SYNC_3a_APK_REINSTALL_WIPES_WEB_2026-08-07.md`  
**Phạm vi sửa:** Chỉ Hướng A (chặn APK push rỗng). **Chưa** Hướng B (Web merge).

---

## Trạng thái

**DONE** — Smoke mock **khớp 3a** → đã triển khai Guard A + test pass.

---

## Kết quả smoke test

| Kiểm tra | Kết quả |
|----------|---------|
| Cách chạy | **Mock only** (vitest) — **không** đụng Gist production |
| Pre-guard (lần chạy đầu) | `syncAll` từ local rỗng **đã** upload `tradescore_journal/positions/capital/v41_sessions` (log `✅ Synced: …`) và mock Gist bị ghi đè rỗng — **khớp V3V4-SYNC-3a** |
| Lifecycle | `useDriveSyncLifecycle.ts` xác nhận APK gọi `void syncAll()` sau hydrate |
| Sau Guard A | Cùng kịch bản: Gist mock **giữ** data; local được restore |

→ **SMOKE XÁC NHẬN ĐÚNG** kết luận 3a → tiến hành Guard A.

---

## Đã sửa

| File | Thay đổi |
|------|----------|
| `services/githubSyncService.ts` | Guard trong `syncFilesBatch`: local rỗng + Gist có data → **BLOCK push**, restore qua bridge; log `🛡️ Empty-push guard`; export helper `isLocalDrivePayloadEmpty` / `remoteDrivePayloadHasData` |
| `services/driveSyncStoreBridge.ts` | `DriveSyncMeta.restoreReason?: 'empty_push_guard'` |
| `store/useTradeStore.ts` | `apply*MirrorFromApk` cho phép APK khi `restoreReason === 'empty_push_guard'` |
| `store/useV41TradeSessionStore.ts` | Cùng cho V41 apply |
| `services/__tests__/driveSync.emptyPushSmoke.test.ts` | Smoke contract + post-guard |
| `services/__tests__/driveSync.emptyPushGuard.test.ts` | Guard cases |
| `services/__tests__/driveSyncService.test.ts` / `driveSync.v41Sessions.test.ts` | Default download `NOT_FOUND` (user mới) |

**signalBoard:** không đổi rule skip-khi-null; không nằm trong tập guard empty.

---

## Ngưỡng phân biệt “rỗng do mất data” vs “rỗng hợp lệ”

**Đã chốt (user):** chỉ chặn khi **remote có ≥1 entry (hoặc object có data)** mà **local = 0 / rỗng**. Không dùng ngưỡng % shrink trong task này.

| Case | Hành vi |
|------|---------|
| Local rỗng + Gist `NOT_FOUND` / remote cũng rỗng | **Cho phép** push rỗng (user mới / file mới) |
| Local rỗng + Gist có ≥1 journal/v41 / positions có open\|locked / capital.milestoneJournal ≥1 | **Chặn push** + restore từ Gist |
| Local đã có ≥1 (vd đóng lệnh còn history) | Guard **không** kích hoạt — push bình thường |
| Local rỗng + không đọc được Gist (`NETWORK_ERROR`) | **Chặn push** (tránh wipe khi chưa verify remote) |

**Capital:** “có data” = `milestoneJournal.length >= 1` (không dùng số dư capital mặc định để tránh false positive user mới có default settings).

---

## Test

| Suite | Kết quả |
|-------|---------|
| `driveSync.emptyPushSmoke.test.ts` | PASS |
| `driveSync.emptyPushGuard.test.ts` | PASS (block+restore / new user / normal push / anti-wipe) |
| `driveSyncService.test.ts` | PASS |
| `driveSync.v41Sessions.test.ts` | PASS |
| `driveSync.e2e.test.ts` | PASS |
| `useTradeStore.driveSync.test.ts` | PASS |

---

## Việc còn lại

1. **Hướng B** (Web merge, không REPLACE xoá) — task riêng, chưa làm.
2. Quan sát thực tế Guard A; nếu cần thêm ngưỡng shrink % → task sau.
3. Smoke thiết bị thật / Gist **test** riêng (tuỳ chọn) — không bắt buộc sau khi mock đã khớp.
4. Capital chỉ dựa `milestoneJournal` — nếu wipe capital-without-milestones vẫn có thể push (rủi ro hẹp).

---

## Rủi ro

| Rủi ro | Mức | Ghi chú |
|--------|-----|---------|
| User mới + Gist legacy còn data người khác (sai Gist ID) | Trung bình | Guard sẽ restore data “lạ” thay vì để trống — đúng bảo vệ nhưng cần đúng Gist |
| Capital không có milestone nhưng có số dư quan trọng trên Gist | Thấp–TB | Có thể chưa chặn |
| Network fail khi local rỗng | Thấp | Không push — APK tạm thiếu sync đến khi online + restore |
| Hướng B chưa có | TB | Nếu Gist đã trống trước khi deploy Guard A, Web vẫn REPLACE theo remote trống |

---

## Kết luận ngắn

Chuỗi 3a **đúng**. Guard A trên APK push: **local empty + remote ≥1 → không wipe Gist, hydrate lại local**. Web merge (B) để task sau.
