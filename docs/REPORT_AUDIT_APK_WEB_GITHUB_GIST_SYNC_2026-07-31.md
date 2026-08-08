# REPORT — Audit APK↔Web GitHub sync (Gist; không phải tradescore-sync)

**Date:** 2026-07-31  
**Phạm vi:** Chỉ đọc / audit module sync — **chưa sửa file nào**  
**Chờ xác nhận user trước khi đề xuất/áp dụng fix**  
**Bản gốc:** `docs/AUDIT_TRADESCORE_SYNC_GITHUB_2026-07-31.md`

---

## 0. Phát hiện kiến trúc (quan trọng hơn giả thuyết nhầm repo)

Trong codebase TradeScore hiện tại, **không có bất kỳ reference nào tới repo `Thiennh319/tradescore-sync`**.

Đồng bộ APK (master) ↔ Web (slave) đang dùng **GitHub Gist API**, không dùng GitHub Contents API trên repo data.

| Layer | File | Vai trò |
|-------|------|---------|
| HTTP | `services/githubSync.ts` | `GET/PATCH https://api.github.com/gists/{GIST_ID}` |
| Orchestration | `services/githubSyncService.ts` (re-export `driveSyncService.ts`) | `syncAll` / `pullFromDrive` / debounce / web pull 60s |
| Types / file names | `types/driveSync.ts` | 4 file trên Gist |
| Lifecycle | `hooks/useDriveSyncLifecycle.ts` | APK: `syncAll()` sau hydrate; Web: `pullFromDrive()` |
| Nút sync UI | `App.tsx` → `handleManualSyncPress` → APK `syncAll()` / Web `pullFromDrive()` | Badge `SyncStatusBadge` |

**Không đụng** `tradescore-app` trong logic sync runtime (repo đó chỉ xuất hiện ở docs archive OI/LS — ngoài phạm vi sync app).

---

## 1. Checklist audit theo yêu cầu

### a. Config có nhầm sang `tradescore-app` không?

| Kiểm tra | Kết quả |
|----------|---------|
| String `tradescore-sync` trong code | **0 match** |
| String `tradescore-app` trong sync services | **0 match** (chỉ docs archive) |
| Endpoint thực tế | `api.github.com/gists/{id}` |
| Default / `.env` Gist ID | `2a065cc81393e76e48d270291e8f7b37` |

→ **Không phải** lỗi “config trỏ nhầm sang `tradescore-app`”. App **không** trỏ Contents API vào bất kỳ repo nào cho sync journal/positions.

Probe `GET /repos/Thiennh319/tradescore-sync` → **404** (unauthenticated). Với PAT hiện tại cũng không kiểm tra được quyền repo vì PAT đã chết (mục b).

### b. PAT còn hạn / scope?

Local `.env` có:

- `EXPO_PUBLIC_GITHUB_TOKEN` / `VITE_GITHUB_TOKEN` (classic `ghp_…`, length 40)

**Evidence thật (2026-07-31):**

```text
GET https://api.github.com/user
Authorization: Bearer <token từ .env>
→ HTTP 401
body: { "message": "Bad credentials", "status": "401" }
```

```text
GET https://api.github.com/gists/<GIST_ID>  (có Bearer)
→ HTTP 401 Bad credentials
```

→ **PAT trong `.env` hiện tại đã hết hạn / bị revoke / sai.** Upload (`PATCH` cần token) **chắc chắn fail** với `AUTH_FAILED` nếu build nhúng token này.

**Scope:** không đọc được (`X-OAuth-Scopes`) vì 401 trước khi trả scope. Cần PAT mới với quyền ghi Gist (`gist` scope cho classic PAT; hoặc fine-grained quyền Gist tương đương). Không cần `contents:write` trên repo nếu vẫn dùng Gist.

**Lưu ý bảo mật:** token từng lộ trong lịch sử chat khi migrate Drive→Gist — nên **xoay token mới**, không tái sử dụng.

### c. Log request/response khi bấm sync

Từ code (chưa bắt log runtime APK trong session này):

**APK bấm badge sync** → `syncAll()` → `uploadFiles()`:

- Nếu `TOKEN === ''` → log `[GitHubGist] uploadFiles: missing GITHUB token` → `AUTH_FAILED`
- Nếu token bad → `PATCH .../gists/{id}` → log `[GitHubGist] uploadFiles failed ...` + status + body; map 401/403 → `AUTH_FAILED`
- UI: `SyncStatusBadge` → “Sync thất bại”

**Web bấm badge** → `pullFromDrive()` → `GET gist` (Bearer nếu có token).

**Gist vẫn đọc được không auth trong probe public GET** (200, có 4 file, `updated_at=2026-07-30T23:19:12Z`) — web có thể vẫn pull được một phần nếu không cần token; **APK upload thì không** khi token 401.

### d. Path file có khớp `data/skipped-setups.json` trên `tradescore-sync`?

**Không.** Payload sync hiện tại là **tên file trong Gist**, không phải path repo:

| Gist file name | Mục đích |
|----------------|----------|
| `tradescore_journal.json` | Journal |
| `tradescore_positions.json` | Positions |
| `tradescore_capital.json` | Capital |
| `tradescore_signal_board.json` | Signal board |

`skipped-setups.json` / `data/skipped-setups.json` **không** nằm trong `GIST_FILE_NAMES`. Skipped setups chỉ local store + export CSV (`exportShare`), **không sync qua Gist**.

### e. Conflict SHA (Contents API)?

**Không áp dụng** kiến trúc hiện tại. Gist `PATCH` gửi `{ files: { name: { content } } }` — **không** dùng `sha` như `PUT /repos/.../contents/...`.

### f. CORS / network (web)?

- Web gọi `fetch('https://api.github.com/gists/...')` từ browser.
- GitHub REST hỗ trợ CORS cho browser; lỗi điển hình hơn là **401 token** hoặc thiếu token, không phải CORS “nhầm repo”.
- Chưa bắt được lỗi CORS cụ thể trong session này (cần DevTools Network khi chạy web). Ưu tiên evidence: **401 Bad credentials** trên PAT.

---

## 2. Evidence phụ — Gist đang sống

Unauthenticated GET gist (lúc audit):

- HTTP **200**
- owner: `Thiennh319`
- `public: false`
- files: `tradescore_capital.json`, `tradescore_journal.json`, `tradescore_positions.json`, `tradescore_signal_board.json` (+ `gistfile1.txt`)
- `updated_at`: **2026-07-30T23:19:12Z**

→ Cloud sync target (Gist) vẫn tồn tại; vấn đề chính nghiêng về **credential upload**.

---

## 3. Kết luận tạm (dựa trên evidence, chưa sửa)

1. **Giả thuyết “nhầm `tradescore-app` / lệch owner-repo string”** — **không khớp code sync hiện tại** (đang dùng Gist, không trỏ repo sync).
2. **Giả thuyết “repo `tradescore-sync` + `data/skipped-setups.json`”** — **không có trong codebase**; có thể là mô tả mong muốn / tài liệu cũ / hệ khác — cần user xác nhận intent.
3. **Nguyên nhân lỗi sync upload có evidence mạnh:** PAT trong `.env` → **HTTP 401 Bad credentials** → APK `syncAll` / `uploadFiles` fail auth.

---

## 4. Hướng fix tối thiểu (CHỈ ĐỀ XUẤT — chờ xác nhận)

**Không implement cho đến khi bạn xác nhận một trong hai hướng:**

### Hướng A — Giữ Gist (khớp code hiện tại, fix nhỏ nhất)

1. Tạo PAT GitHub mới (classic `gist` scope, hoặc fine-grained Gist write).
2. Cập nhật `.env` (`EXPO_PUBLIC_GITHUB_TOKEN` + `VITE_GITHUB_TOKEN`) — **không commit token**.
3. Rebuild APK + Web để nhúng env vào bundle (Expo `EXPO_PUBLIC_*` bake lúc build).
4. Test: bấm sync APK → Gist `updated_at` mới; web pull thấy data.
5. (Tuỳ chọn) Xoay token cũ đã lộ.

### Hướng B — Đổi sang repo `tradescore-sync` Contents API (đúng mô tả prompt của bạn)

1. Xác nhận repo `Thiennh319/tradescore-sync` tồn tại (hiện probe 404).
2. Viết lại `githubSync.ts` sang `GET/PUT /repos/.../contents/...` + SHA — **đây là thay đổi kiến trúc**, không phải config typo.
3. Quyết định schema path (`data/...`) và có sync `skipped-setups` hay không (hiện **chưa** sync).

---

## 5. Ràng buộc đã giữ

- Không sửa code trong audit này.
- Không commit / không đụng workflow `tradescore-app` archive.
- Không in full PAT trong báo cáo.

---

## 6. Cần bạn xác nhận

1. Sync đúng nghĩa là **GitHub Gist** (Hướng A) hay bắt buộc **repo `tradescore-sync`** (Hướng B)?  
2. Nếu A: bạn tạo PAT mới rồi gửi cách đưa vào `.env` / EAS secret (không paste token vào chat nếu có thể)?  
3. Sau khi xác nhận → mới sửa code (nếu cần) + hướng dẫn test APK/Web.
