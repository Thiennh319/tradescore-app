# REPORT — Task V3V4-SYNC-2a (Backup)

**Ngày:** 2026-08-07  
**Mục đích:** Backup an toàn trước khi sửa lỗi mất dữ liệu khi cài đè APK/Web phiên bản mới.  
**Commit:** `3a0b763` — `backup(V3V4-SYNC-2a): snapshot Gist + Web EXE local storage before overwrite-fix work`  
**Manifest:** `docs/backups/MANIFEST_V3V4_SYNC_2a_2026-08-07_163942.md`

---

## Trạng thái

**DONE** — đã backup Gist (4/5 file sync) + Web EXE local (EXE đã đóng khi chụp lại) và commit vào git. **Chưa** sửa code ứng dụng trong task này.

---

## Nguyên nhân (bối cảnh)

Chuẩn bị fix mất dữ liệu khi overwrite APK/Web. Cần snapshot Gist + local trước khi đụng persist/migrate.

---

## Đã làm

### 1. Gist (API)

Thư mục: `docs/backups/gist_2026-08-07_163942/`

| File | Trạng thái | Chi tiết |
|------|------------|----------|
| `tradescore_journal.json` | OK | Parse được; 21 entries; `deviceId=APK`; `lastUpdated=2026-08-07T09:04:10.381Z` |
| `tradescore_positions.json` | OK | Parse được; `deviceId=APK` |
| `tradescore_capital.json` | OK | Parse được; `deviceId=APK` |
| `tradescore_signal_board.json` | OK | Parse được; `deviceId=APK` |
| `tradescore_v41_sessions.json` | **MISSING trên Gist** | File chưa tồn tại remote (chưa push / chưa có session sync) |
| `_gist_meta.json` | OK | Snapshot metadata API |
| `gistfile1.txt` | OK | File mặc định của Gist |

### 2. Web EXE local

Nguồn: `dist/TradeScore-Web-v1.0.8/TradeScore-data`  
Thư mục: `docs/backups/web_exe_local_2026-08-07_163942/`

Lần copy đầu (EXE còn chạy) → **không dùng**. Đã **copy lại** sau khi `TradeScore-Web.exe` đã đóng.

| Thành phần | Đường dẫn backup |
|------------|------------------|
| Local Storage (LevelDB) | `...\EBWebView_Default_Local_Storage/` |
| IndexedDB | `...\EBWebView_Default_IndexedDB/` |
| Session Storage | `...\EBWebView_Default_Session_Storage/` |
| Preferences / Local State | cùng thư mục |
| Key hints | `localStorage_key_hints.txt` (`@tradescore/v1`, `v6`, `v7`, `binance`) |

### 3. APK local

**Không** backup trong batch này (user chọn Web EXE).

---

## Xác nhận restore

| Nguồn | Restore được? | Cách |
|-------|---------------|------|
| Gist JSON (4 file) | **Có** | Upload lại nội dung wrapper vào cùng Gist ID (API PATCH hoặc để APK push sau hydrate) |
| Web EXE profile | **Có** | Đóng EXE → copy đè Local Storage / IndexedDB vào `TradeScore-data\webview\EBWebView\Default\` → mở lại |
| `v41Sessions` trên Gist | **Không** | Remote không có file |
| APK AsyncStorage | **Chưa** | Cần bước thủ công riêng nếu cần |

---

## Test

Không chạy unit test (task backup only). Kiểm tra thủ công:

- JSON Gist `ConvertFrom-Json` / parse OK cho 4 file.
- Process `TradeScore-Web` không chạy lúc re-copy local.
- `git commit` chỉ `docs/backups/` → `3a0b763`.

---

## Việc còn lại

1. Backup **APK** local (nếu cần trước khi cài đè APK) — hướng dẫn adb / export khi user yêu cầu.
2. Nếu máy có V41 sessions chỉ local, chưa lên Gist — coi local Web EXE (sau V41-5) hoặc chờ sync lần đầu.
3. Task sửa mất dữ liệu khi overwrite (**chưa bắt đầu**) — chỉ làm sau khi user xác nhận backup đủ.

---

## Rủi ro

| Rủi ro | Mức | Ghi chú |
|--------|-----|---------|
| LevelDB là binary, không đọc JSON tay | Thấp | Restore = copy folder, không import từng key |
| Commit chứa ~10MB profile WebView2 | Thấp | Đã commit theo yêu cầu |
| Thiếu `v41Sessions` trên Gist | Trung bình | Không restore V41 sessions từ Gist được |
| APK chưa backup | Trung bình | Cài đè APK vẫn rủi ro nếu chỉ dựa Gist |

---

## File liên quan

- `docs/backups/MANIFEST_V3V4_SYNC_2a_2026-08-07_163942.md`
- `docs/backups/gist_2026-08-07_163942/`
- `docs/backups/web_exe_local_2026-08-07_163942/`
- Commit: `3a0b763`
