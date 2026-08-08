# REPORT — Apply buildDate Option B + versionCode 13 (local only, no commit)

**Ngày:** 2026-08-08  
**Phạm vi:** Sửa local theo quyết định đã chốt. **Không** build APK/Web. **Không** git add/commit.

## Bảng

| File | Field | Trước | Sau |
|------|-------|-------|-----|
| `constants/buildInfo.ts` | `buildDate` | hardcode `'2026-08-02'` | import `BUILD_DATE_YMD` từ `buildDate.generated.ts` |
| `constants/buildInfo.ts` | `version` | `'1.0.8'` | `'1.0.8'` (giữ) |
| `constants/buildDate.generated.ts` | `BUILD_DATE_YMD` | *(file mới)* | `'2026-08-08'` (stamp HCM; rewrite mỗi build) |
| `scripts/lib/buildDateStamp.mjs` | helper | *(file mới)* | `getBuildDateYmd` / `getBuildTimestampLocal` / `writeBuildDateGenerated` (tz `Asia/Ho_Chi_Minh`) |
| `scripts/stamp-build-date.mjs` | CLI | *(file mới)* | stamp generated file trước bundle |
| `scripts/write-build-info.mjs` | `BUILD_DATE` | `'2026-08-02'` | `getBuildDateYmd(now)` + stamp generated |
| `scripts/write-build-info.mjs` | dòng `Build:` | UTC `toISOString()` | `getBuildTimestampLocal(now)` (HCM, cùng `now`) |
| `scripts/build-web-exe.ps1` | bước 0 | không có | `node stamp-build-date.mjs` **trước** expo export |
| `package.json` | `scripts.build:apk` | gradle rồi write-build-info | **`stamp-build-date` trước** gradle + write-build-info cuối |
| `package.json` | `version` | `1.0.8` | `1.0.8` (giữ) |
| `app.json` | `expo.version` | `1.0.8` | `1.0.8` (giữ) |
| `app.json` | `expo.android.versionCode` | `12` | **`13`** |
| `android/app/build.gradle` | `versionName` | `"1.0.8"` | `"1.0.8"` (giữ) |
| `android/app/build.gradle` | `versionCode` | `12` | **`13`** |

## Cơ chế đồng bộ Option B

1. **Trước** Expo export / Gradle: `stamp-build-date.mjs` ghi `constants/buildDate.generated.ts`.  
2. Bundle JS import qua `BUILD_INFO.buildDate` → in-app = ngày stamp.  
3. **Sau** artifact: `write-build-info.mjs` dùng cùng helper HCM → `buildDate:` trong `BUILD_INFO*.txt` = cùng ngày; đồng thời stamp lại generated (không lệch nếu cùng lần chạy).

Smoke (không build full): `buildDate: 2026-08-08` | `Build: 2026-08-08 21:39:17` (HCM).

**Git:** chưa stage/commit — chờ review.
