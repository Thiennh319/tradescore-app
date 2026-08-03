# BÁO CÁO ĐIỀU TRA SAU WIPE + BƯỚC BẢO VỆ (2026-08-03)

**Thời điểm báo cáo:** 2026-08-03 ~20:00 ICT  
**Branch emergency (remote):** `backup/emergency-file-wipe-restore-20260803` @ `a7fcaa7`  
**Task 2 Decision Confidence sweep:** **KHÔNG chạy** (đúng yêu cầu).

---

## 1. Remote backup — ĐÃ XONG

```
git push -u origin backup/emergency-file-wipe-restore-20260803
```

| Mục | Giá trị |
|-----|---------|
| Remote | `https://github.com/Thiennh319/tradescore-app.git` |
| Branch | `backup/emergency-file-wipe-restore-20260803` |
| Tip | `a7fcaa75e49721ab5307a7c9f0b6b320aac664c3` |
| Tracking | `origin/backup/emergency-file-wipe-restore-20260803` |

Có bản ngoài máy local. PR link (optional):  
https://github.com/Thiennh319/tradescore-app/pull/new/backup/emergency-file-wipe-restore-20260803

---

## 2. Lịch sử lệnh / terminal quanh sự cố

### 2.1. Cửa sổ thời gian thực tế

| Mốc | Thời gian (ICT) | Ghi chú |
|-----|-----------------|--------|
| Terminal scan empty V4.1 | **19:14:51** (`2026-08-03T12:14:51Z`) | Phát hiện wipe đã xảy ra |
| Ước ước “19:30–19:40” trong status sớm | Có thể lệch ~15–20 phút so với timestamp terminal | |

Terminal Cursor còn lưu (`terminals/751721.txt`):

```
command: Get-ChildItem -Recurse services\v41 -File | Where-Object { $_.Length -lt 10 } ...
title: Find empty wiped files under services/v41
started_at: 2026-08-03T12:14:51.887Z
status: failed
```

→ Lệnh quanh “lúc phát hiện” là **đọc/scan**, không phải ghi đè.

### 2.2. PowerShell ConsoleHost history

File `PSReadLine\ConsoleHost_history.txt` **LastWrite = 2026-07-31** — **không** có lệnh tay nào trong khung 03/08 tối.  
Lệnh agent chạy qua Cursor Shell (không ghi vào PSReadLine history user).

### 2.3. Agent transcript (scan `_scan-transcript-wipe.mjs`)

Trong cửa sổ khẩn cấp (cuối transcript):

- Lệnh **restore**: `git checkout HEAD -- …`, scan `TS_EMPTY`, commit emergency, push emergency.
- Không thấy pattern kiểu:
  - `writeFileSync(path, '')` hàng loạt
  - `Clear-Content` / `Set-Content` empty trên `services|components|hooks`
  - `git reset --hard` / `git clean -fdx` toàn repo
  - `Remove-Item -Recurse` trên trees source chính

Các `Remove-Item` “danger” hit trong scan là **dọn stash/docs tạm** (vd. `docs/exports/_stash_task5b_*`), không match mass wipe source.

### 2.4. Kết luận mục 2

**Chưa tìm thấy lệnh ghi đè hàng loạt / script dọn source** trong log Cursor/terminal còn lại.  
Wipe xảy ra **trước** lệnh scan 19:14 — nguyên nhân ngoài (Cursor write lỗi, sync/AV, tool khác, hoặc transcript không giữ đủ tool payload) **chưa xác định được từ log hiện có**.

---

## 3. Windows Event Viewer (19:00–20:00 ICT)

| Log | Số error/warning (Level 1–3) | Liên quan TradeScore / ổ D? |
|-----|------------------------------|-----------------------------|
| Application | 2 | **MSSQL$MISASME2021** — thiếu `D:\MISA SME.NET 2021\Data\...` (OS error 2/3). **Không** dính TradeScore |
| System | 31 | Chủ hết **DCOM 10016** (LOCAL SERVICE activation). Noise thường gặp, **không** I/O disk TradeScore |

**Ổ D:** `HealthStatus = Healthy`, `SizeRemaining ≈ 108 GB`, PhysicalDisk `Healthy / OK`.

**Không** có event crash Cursor/Node, disk fault, NTFS corrupt, Unexpected Shutdown gắn với khung giờ wipe.

---

## 4. Cơ chế bảo vệ — Option A (đã chọn)

User xác nhận **A**: commit tự động mỗi giờ vào branch local `backup/auto-hourly`, **không push**.

| Thành phần | Chi tiết |
|------------|----------|
| Script | `scripts/auto-hourly-backup.ps1` |
| Cách commit | `commit-tree` + temp `GIT_INDEX_FILE` — **không** checkout đè branch đang làm |
| Canary | Abort nếu ≥10 file `.ts/.tsx` size ≤2 trong services/components/hooks/screens/utils |
| Scope add | App/package/tsconfig + services/components/hooks/screens/utils/store/constants/config/adapters/scripts + docs/exports |
| Task Scheduler | `TradeScore-AutoHourlyBackup` — lặp mỗi **1 giờ**, local only |
| Log | `docs/exports/auto-hourly-backup.log` |

**Lớp bảo vệ hiện có:**

1. Remote emergency branch (đã push)  
2. Hourly local auto-commit branch  
3. Empty-file canary trong script  

Nếu sau này muốn Option B (thêm push), chỉ cần bật lại `git push` trong script.

---

## 5. Task 2

**Đóng băng** — không chạy sweep Decision Confidence 180d×4 cho đến khi bạn xác nhận thêm (nguyên nhân rõ hơn hoặc chấp nhận rủi ro với 2 lớp backup trên).

---

## Artefacts

| Path | Mục đích |
|------|----------|
| `docs/exports/REPORT_EMERGENCY_FILE_WIPE_RESTORE_2026-08-03.md` | Báo cáo wipe/restore |
| `docs/exports/REPORT_POST_WIPE_CAUSE_AND_PROTECTION_2026-08-03.md` | File này |
| `scripts/auto-hourly-backup.ps1` | Hourly local backup |
| `scripts/_scan-transcript-wipe.mjs` | Helper quét transcript |
| `docs/exports/auto-hourly-backup.log` | Log chạy hourly |

---

## Tóm tắt hành động

1. **Đã push** emergency branch lên GitHub.  
2. **Không** tìm thấy lệnh mass-wipe trong terminal/transcript còn lại; Event Viewer không chỉ I/O D/TradeScore.  
3. **Đã cài Option A** — hourly local commit `backup/auto-hourly`.  
4. **Không** chạy Task 2.
