# BUILD REPORT — v1.0.8 (V41-1…5 + V3V4-SYNC-2a/3a–3e)

**Ngày:** 2026-08-07  
**Version product:** **1.0.8** (không bump)  
**Commit build:** `471384b` — `feat(v1.0.8): ship V41 monitor/sync + Gist empty-push guard and Web merge protect`  
**Backup trước đó:** `3a0b763` (V3V4-SYNC-2a)

---

## Trạng thái

**DONE** — Tests pre-build PASS; APK + Web EXE build thành công vào **v1.0.8**.

---

## Version build

| File | Version |
|------|---------|
| `package.json` | 1.0.8 |
| `app.json` `expo.version` | 1.0.8 |

---

## Test suite trước build

| Suite | Kết quả |
|-------|---------|
| driveSync* (merge/guard/smoke/service/v41Sessions/e2e/objectMerge) | PASS |
| `useTradeStore.driveSync` | PASS |
| v41: `tradeSessionAdviser`, `scanV41`, `rawMarketLiveMark` | PASS |
| v41Export: `runV41MiExport`, `rulebook` | PASS |
| **Tổng** | **13 files / 92 tests PASS** |

---

## Đường dẫn output

| Artifact | Path |
|----------|------|
| **APK** | `dist/TradeScore-v1.0.8.apk` |
| APK BUILD_INFO | `dist/BUILD_INFO_APK_v1.0.8.txt` |
| **Web EXE** | `dist/TradeScore-Web-v1.0.8/TradeScore-Web.exe` |
| Web bundle | `dist/TradeScore-Web-v1.0.8/TradeScore-web-v1/` |
| Web BUILD_INFO | `dist/TradeScore-Web-v1.0.8/BUILD_INFO.txt` |

---

## Xác nhận build chứa đúng code mới

1. Build từ HEAD **`471384b`** (commit đầy đủ phạm vi V41 + SYNC trước build).  
2. Web bundle `index-692a6e0d….js` chứa chuỗi marker:  
   `Empty-push guard`, `mergeByIdRemoteWins`, `liveMarkPrice`, `V41_SESSION_UPDATED`, `tradescore_v41_sessions.json`, `mergePositionsFieldsRemote`, `isCapitalPayloadDefaultEmpty`, …  
3. Commits liên quan chính: `471384b` (ship fix) ← `3a0b763` (backup 2a).

---

## Vấn đề gặp phải

| Vấn đề | Xử lý |
|--------|-------|
| `expo prebuild --clean` xoá `android/local.properties` | Tạo lại `sdk.dir=C:\\Users\\Thien\\AppData\\Local\\Android\\Sdk` |
| Web lần 1: `dotnet publish` **file lock** `TradeScore-Web.dll` (EXE đang mở) | User đóng EXE → xóa `scripts/WebLauncher/obj|bin` → `build:web` lại → **OK** |
| Working tree còn file **ngoài phạm vi** (journal UI, docs khác, …) | **Không** commit vào `471384b`; build dùng code đã commit + export từ tree có bundle mới (source fix đã trong commit) |

---

## Ghi chú cho người dùng

1. **Trade-off (đã chấp nhận):**  
   - Xoá entry Journal/V41 trên APK **không** tự mất trên Web.  
   - Đóng lệnh thật trên APK **không** tự clear open trên Web → đóng thủ công trên Web UI.  
2. **Cài APK:** ưu tiên **UPDATE IN-PLACE** (không uninstall) để giữ AsyncStorage; Guard A đã bảo vệ push rỗng nhưng in-place an toàn hơn.  
3. Web: dùng bản trong `dist/TradeScore-Web-v1.0.8/` (đóng EXE cũ trước khi ghi đè lần sau).

---

## Việc còn lại

- (Tuỳ chọn) Soft-delete journal / tombstone đóng lệnh nếu muốn sync xoá/đóng từ APK → Web.  
- Smoke thủ công trên máy: Guard A + Web merge sau cài bản mới.  
- Working tree dirty còn lại (không thuộc commit build) — dọn/commit riêng nếu cần.
