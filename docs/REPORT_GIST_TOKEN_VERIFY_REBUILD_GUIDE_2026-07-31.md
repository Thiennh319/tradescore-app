# REPORT — Verify PAT Gist mới + hướng dẫn rebuild/test (Hướng A)

**Date:** 2026-07-31  
**Phạm vi:** Xác thực token mới trong `.env`; giữ kiến trúc GitHub Gist — **không** sửa logic sync, **không** Contents API / `tradescore-app`  
**Liên quan:**  
- `docs/REPORT_REAUDIT_SYNC_PAT_SCOPE_2026-07-31.md`  
- `docs/REPORT_AUDIT_APK_WEB_GITHUB_GIST_SYNC_2026-07-31.md`

---

## 1. Bối cảnh

User đã thay `EXPO_PUBLIC_GITHUB_TOKEN` và `VITE_GITHUB_TOKEN` trong:

`D:\Thiennh3\APP\Trading\TradeScore\.env`

bằng PAT classic scope **`gist`**. Chọn **Hướng A**: giữ `services/githubSync.ts` → `api.github.com/gists/{id}`.

---

## 2. Kết quả verify (không in secret)

Fingerprint (an toàn): `len=40` · prefix `ghp_` · suffix `…2R4L` · EXPO = VITE · Gist ID `2a065cc81393e76e48d270291e8f7b37`

| Bước | Endpoint | HTTP | Chi tiết |
|------|----------|------|----------|
| 1 | `GET /user` | **200** | `login=Thiennh319` · `X-OAuth-Scopes: **gist**` |
| 2 | `GET /gists/{id}` | **200** | Files: capital, journal, positions, signal_board (+ gistfile1.txt) · `updated_at=2026-07-30T23:19:12Z` |
| 3 | `PATCH` no-op (description giữ nguyên) | **200** | **WRITE_OK=true** — đủ quyền ghi Gist |

→ Token hợp lệ, có scope `gist`, ghi được. Không dừng để thử hướng khác.

---

## 3. Rebuild (lệnh cụ thể)

Working directory: `D:\Thiennh3\APP\Trading\TradeScore`  
Expo bake **`EXPO_PUBLIC_*`** lúc export/bundle; cả hai key đã set.

### a) APK

```powershell
cd D:\Thiennh3\APP\Trading\TradeScore
npm run build:apk
```

Output: `dist/TradeScore-v{version}.apk` — cài bản mới (gỡ APK cũ nếu cần).

### b) Web EXE / static

```powershell
cd D:\Thiennh3\APP\Trading\TradeScore
npm run build:web
```

(Script: `scripts/build-web-exe.ps1` → `npx expo export --platform web`)  
Output: `dist/TradeScore-Web-v{version}/` — chạy bản mới trong `dist`, không dùng bundle cũ chưa export lại.

---

## 4. Test sau rebuild

1. **APK** — bấm badge sync → kỳ vọng “Sync thành công” (không AUTH_FAILED / Sync thất bại).  
2. **Gist `updated_at`** — sau sync APK, kỳ vọng **>** `2026-07-30T23:19:12Z`:

```powershell
$gistId = '2a065cc81393e76e48d270291e8f7b37'
$t = (Select-String -Path 'D:\Thiennh3\APP\Trading\TradeScore\.env' -Pattern '^EXPO_PUBLIC_GITHUB_TOKEN=(.+)$').Matches.Groups[1].Value.Trim()
$h = @{ Accept='application/vnd.github+json'; Authorization="Bearer $t"; 'User-Agent'='TradeScore-check' }
$j = (Invoke-RestMethod -Uri "https://api.github.com/gists/$gistId" -Headers $h)
"updated_at=$($j.updated_at)"
```

3. **Web** — bấm sync/pull → journal / positions / capital khớp APK.

---

## 5. Ràng buộc đã giữ

- Không sửa/refactor `githubSync.ts` / orchestration sync  
- Không chuyển Contents API / `tradescore-sync` repo  
- Không đụng `tradescore-app`  
- Không in full PAT trong báo cáo / log verify

---

## 6. Trạng thái

| Mục | Status |
|-----|--------|
| Token `.env` verify + write gist | **Done** |
| Rebuild APK / Web | **Chờ user chạy** |
| Test end-to-end sync | **Chờ sau rebuild** |
