# REPORT — Re-audit sync credentials (đính chính kết luận PAT)

**Date:** 2026-07-31 (re-audit)  
**Phạm vi:** Chỉ audit / báo cáo — **chưa sửa code**  
**Liên quan:** `docs/REPORT_AUDIT_APK_WEB_GITHUB_GIST_SYNC_2026-07-31.md` (bản trước)  
**Input mới từ user:** Token classic tên `tradescore-sync`, scope `repo`, UI GitHub báo còn dùng / No expiration

---

## 0. Đính chính kết luận báo cáo trước

| Kết luận cũ | Trạng thái |
|-------------|------------|
| “PAT hết hạn / bị revoke” (nói chung) | **Quá rộng / dễ hiểu sai** — UI GitHub có token `tradescore-sync` **vẫn sống** |
| “Chuỗi token trong `.env` không được GitHub chấp nhận” | **Vẫn đúng** (evidence mới xác nhận lại) |

**Phân biệt quan trọng:** Token trên UI GitHub ≠ bắt buộc là chuỗi đang nằm trong `.env` của app. Sau khi tạo, GitHub **không** hiện lại full secret; app chỉ “khớp” token UI nếu `.env` còn đúng secret đó.

---

## 1. Evidence mới (re-test `.env` — không in secret)

Fingerprint `.env` (không lộ token):

| Key | len | prefix | suffix | sha256_12 | quotes / whitespace |
|-----|-----|--------|--------|-----------|---------------------|
| `EXPO_PUBLIC_GITHUB_TOKEN` | 40 | `ghp_` | `WzL9` | `B1ABF4C351F1` | không |
| `VITE_GITHUB_TOKEN` | 40 | `ghp_` | `WzL9` | `B1ABF4C351F1` | không (cùng giá trị) |
| Gist ID | 32 | — | — | `2a065cc8…7b37` | OK |

### Kết quả HTTP với Bearer = token trong `.env`

| Call | HTTP | Ý nghĩa |
|------|------|---------|
| `GET /user` | **401** `Bad credentials` | Chuỗi **không** phải credential hợp lệ |
| `GET /gists/{id}` + Bearer | **401** `Bad credentials` | Không tới được bước kiểm tra scope |
| `GET /repos/Thiennh319/tradescore-sync` + Bearer | **401** | Cùng lỗi credential |
| `GET /repos/Thiennh319/tradescore-app` + Bearer | **401** | Cùng lỗi credential |
| `GET /gists/{id}` **không** auth | **200** (`public=false`) | Gist vẫn tồn tại; đọc anonymous (secret gist = unlisted) |

Theo [GitHub Docs — Authenticating to the REST API](https://docs.github.com/rest/overview/authenticating-to-the-rest-api):

- **401** với invalid credentials = token sai / đã xóa / không còn được nhận diện  
- **403 / 404** khi đã auth = thường là **thiếu quyền / scope**

→ Với **đúng** chuỗi trong `.env` hiện tại: lỗi quan sát được **không phải** “thiếu scope `gist`”, vì request **chưa authenticate được**. Thiếu scope (nếu dùng đúng token `repo`-only còn sống) thường biểu hiện **403** (hoặc 404), **sau khi** `GET /user` = 200.

---

## 2. Trả lời từng điểm yêu cầu

### (1) Tên token `tradescore-sync` + scope `repo` gợi ý Contents API?

**Có — về mặt ý định đặt tên / scope.**  
Scope classic `repo` phục vụ private repo Contents API (`/repos/.../contents/...`).  
Code runtime hiện tại lại gọi **Gist** (`/gists/...`).  
→ Có **lệch ý định đặt tên token ↔ kiến trúc code đang chạy** (Gist sau khi migrate từ Google Drive, ~2026-06).

### (2) Scope `repo` có đủ cho private Gist API không?

**Không đủ cho write / thao tác thay mặt user trên Gist.**  
Classic PAT cần scope **`gist`** để create/update gist; `repo` **không** bao gồm quyền Gist.  
Thiếu `gist` khi token **hợp lệ** → thường **403 Forbidden**, không phải 401 Bad credentials.

Vậy:

| Giả thuyết | Khớp evidence `.env` hiện tại? |
|------------|--------------------------------|
| Sai scope (`repo` vs `gist`) là nguyên nhân **401 đang thấy** | **Không** — 401 trên `/user` = credential không hợp lệ |
| Sai scope sẽ là vấn đề **nếu** paste đúng token UI `tradescore-sync` (chỉ `repo`) vào `.env` rồi gọi Gist PATCH | **Có** — lúc đó kỳ vọng 403 / auth fail kiểu quyền, không phải Bad credentials |

### (3) Token trong `.env` có đúng là token UI `tradescore-sync` không?

**Không thể khẳng định bằng API** (401 → không đọc được note/scopes).  
**Khả năng cao nhất:** `.env` đang giữ **secret cũ / khác** (ví dụ token từng dán lúc migrate Gist trong chat lịch sử), **không** phải secret đang active tên `tradescore-sync`.

Cách user tự đối chiếu (không cần đưa full token cho agent):

1. GitHub → Settings → Personal access tokens → classic → token `tradescore-sync`  
2. So **ký tự cuối** (nếu UI hiện) với suffix `.env` = **`WzL9`**  
3. Nếu khác → chắc chắn **hai token khác nhau**  
4. Nếu trùng nhưng vẫn 401 → secret đã regenerate / copy sai (hiếm); tạo lại secret mới

### (4) Hai lựa chọn + chi phí (chưa implement)

#### a. Giữ kiến trúc **Gist** (code hiện tại) — fix credential/scope

| Việc | Chi phí |
|------|---------|
| Tạo PAT mới **hoặc** edit token: cần scope **`gist`** (có thể thêm `repo` nếu muốn giữ dùng chung) | 5–10 phút trên GitHub UI |
| Ghi secret mới vào `.env` (`EXPO_PUBLIC_` + `VITE_`) — **không commit** | 2 phút |
| **Rebuild** APK + Web (env `EXPO_PUBLIC_*` bake lúc build) | ~build time hiện có |
| Đổi code sync | **0** (giữ `githubSync.ts`) |
| Rủi ro | Secret gist vẫn “ai có URL thì đọc được”; token lộ trong client bundle (`EXPO_PUBLIC_`) |

**Khi nào chọn:** muốn sync chạy lại nhanh, chấp nhận Gist như code đang làm.

#### b. Viết lại sync → repo **`tradescore-sync`** + Contents API

| Việc | Chi phí |
|------|---------|
| Xác nhận / tạo repo `Thiennh319/tradescore-sync` (probe hiện **404** khi chưa auth bằng token sống) | 10–30 phút |
| Đổi `services/githubSync.ts`: `GET/PUT .../repos/{owner}/{repo}/contents/{path}` + gửi **`sha`** khi update | Trung bình — thay lớp HTTP, giữ orchestration `githubSyncService` nếu giữ 4 file JSON |
| Map path (vd. `data/tradescore_journal.json` …) + README repo | Nhỏ |
| PAT: scope **`repo`** (khớp token tên `tradescore-sync`) — **không cần** `gist` | Khớp ý định đặt tên token |
| Conflict SHA (mục e audit cũ) trở thành **có thật** — cần get-sha → put | Thêm logic + retry 409 |
| `skipped-setups.json`: **chưa** có trong sync hiện tại — chỉ thêm nếu product yêu cầu | Scope riêng |
| Rebuild APK + Web + test master/mirror | Như a |

**Khi nào chọn:** muốn đúng mô hình “repo data-only”, khớp tên token / ý định Contents API; chấp nhận đổi code nhiều hơn a.

---

## 3. Kết luận tái audit (evidence-based)

1. Báo cáo trước **sai nếu hiểu là** “mọi token tên tradescore-sync đều chết”. Token UI user kiểm tra **vẫn sống**.  
2. Báo cáo trước **đúng về** chuỗi trong **`.env` local**: GitHub trả **401 Bad credentials** trên `/user` → **không dùng được** cho API (Gist hay Contents).  
3. Giả thuyết “401 chỉ vì thiếu scope `gist`” **không giải thích** được 401 trên `/user`. Scope mismatch là **rủi ro tiếp theo** nếu đưa token `repo`-only vào app vẫn gọi Gist.  
4. Tên/scope token UI **ủng hộ ý định Contents API + `tradescore-sync`**; code hiện tại là **Gist** sau migrate Drive→Gist — lệch kiến trúc / ý định đặt tên.  
5. **Chưa sửa code** — chờ chọn **a** hoặc **b**.

---

## 4. Việc nên làm trước khi chọn hướng (không cần agent sửa code)

1. Đối chiếu suffix UI vs `.env` (`…WzL9`).  
2. (Tuỳ chọn) Tạo PAT tạm **chỉ để smoke** `GET /user` + `GET /repos/Thiennh319/tradescore-sync` — xác nhận repo tồn tại/private.  
3. Chọn **a** (Gist + scope `gist` + cập nhật `.env` + rebuild) hoặc **b** (Contents API + repo sync).  

**Không paste full PAT vào chat.** Chỉ báo: `/user` = 200 hay 401, và repo sync = 200/404.
