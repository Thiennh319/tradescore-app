# Task V41-5 — Gist sync V4.1 Trade Sessions (Option A)

**Ngày:** 2026-08-07  
**Quyết định:** Option A — cắm V4.1 vào Gist sync hiện có; APK master / Web mirror only; sync Pending + Running + Closed.

---

## Trạng thái

**DONE** — đã triển khai Option A trong phạm vi mở rộng đã chốt (driveSync + store + App đăng ký). Journal/positions/capital/signalBoard hành vi cũ không đổi — chỉ **THÊM** file Gist `tradescore_v41_sessions.json`.

---

## Nguyên nhân (trước fix — từ báo cáo điều tra)

`useV41TradeSessionStore` chỉ sống trong RAM: không persist, không vào `GIST_FILE_NAMES` / bridge / push-pull. APK và Web = 2 heap độc lập → session mở trên APK không hiện trên Web (và ngược lại).

---

## Đã sửa (từng file)

| File | Thay đổi |
|------|----------|
| `types/driveSync.ts` | `GIST_FILE_NAMES.v41Sessions`; action `V41_SESSION_UPDATED`; `PullResult.v41SessionsUpdated?` |
| `services/driveSyncStoreBridge.ts` | Optional `getV41Sessions` / `applyV41SessionsMirrorFromApk`; `mergeDriveSyncStoreBridge` (+ pendingPartial nếu journal register sau) |
| `services/githubSyncService.ts` | getLocal / apply / pull tải file thứ 5; Web mirror gọi apply; APK không apply mirror (pattern journal) |
| `store/useV41TradeSessionStore.ts` | Persist `@tradescore/v41_trade_sessions_v1`; `endSession` → `Closed` (giữ history); `syncOnAction('V41_SESSION_UPDATED')` sau create / end / patch ý nghĩa (không spam mỗi tick `current`); `hydrate`, `replaceSessionsFromRemote`, `registerV41DriveSyncBridge()` |
| `App.tsx` | `registerV41DriveSyncBridge()` + `useV41TradeSessionStore.hydrate()` sau trade hydrate |
| `services/__tests__/driveSync.v41Sessions.test.ts` | **Mới** — push APK, Web pull mirror (incl. Closed), merge bridge, store end→Closed+sync |
| `services/__tests__/driveSyncService.test.ts` | Expect sync 5 file; pull mocks thêm download thứ 5 |

**Không đụng** các file V3/V4 đã cấm (journal UI/service, SignalBoard, scorerV4, …).

---

## Test

| Suite | Kết quả |
|-------|---------|
| `services/__tests__/driveSync.v41Sessions.test.ts` | **PASS** (4) |
| `services/__tests__/driveSyncService.test.ts` | **PASS** |
| `services/__tests__/driveSync.e2e.test.ts` | **PASS** (9) |
| `store/useTradeStore.driveSync.test.ts` | **PASS** |

Tổng regression driveSync liên quan đã chạy: **pass**, không thấy regression journal/positions path.

---

## Việc còn lại

1. **Smoke thủ công:** APK tạo session Pending → push Gist → Web pull → Execution Monitor thấy cùng session; End trên APK → Web thấy `Closed`.
2. **Build/deploy** APK + Web mang V41-5 (chưa làm trong task này trừ khi user yêu cầu).
3. **UX lịch sử Closed:** Monitor có thể tích tụ session Closed mãi — chỉ prune/UI filter nếu user yêu cầu sau.
4. **Không 2 chiều:** Web vẫn không push V41 (giống journal) — đúng chốt.

---

## Rủi ro

| Rủi ro | Mức | Ghi chú |
|--------|-----|---------|
| Gist payload lớn nếu nhiều Closed lâu dài | Trung bình | Không giới hạn retention; có thể cần cap/prune sau |
| Web ghi đè local khi pull APK snapshot | Thấp (by design) | Mirror replace như journal Web |
| Debounce 30s → Web thấy trễ sau create/end | Thấp | Giống sync journal hiện tại |
| `mergeDriveSyncStoreBridge` phụ thuộc thứ tự register (V41 vs trade store) | Thấp | Đã có pendingPartial nếu V41 register trước |

---

## Cách hoạt động (tóm tắt)

```
APK: create/patch ý nghĩa/end → persist local → syncOnAction(V41_SESSION_UPDATED)
     → debounce → upload tradescore_v41_sessions.json (deviceId=APK, all sessions incl. Closed)

Web: hydrate local → pullFromDrive → applyV41SessionsMirrorFromApk (chỉ khi deviceId=APK)
     → replace sessions + persist; KHÔNG push V41
```
