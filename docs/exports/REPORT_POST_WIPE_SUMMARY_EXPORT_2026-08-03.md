# BÁO CÁO TỔNG HỢP — Sau sự cố empty-file wipe + bảo vệ (2026-08-03)

**Xuất lúc:** 2026-08-03 ~20:06 ICT  
**Working branch hiện tại:** `backup/emergency-file-wipe-restore-20260803`  
**Task 2 (Decision Confidence sweep):** **KHÔNG chạy**

---

## 0. Kết luận nhanh

| Hạng mục | Trạng thái |
|----------|------------|
| Restore source sau wipe | Xong — `TS_EMPTY=0` trên services/components/hooks/screens/utils |
| Remote GitHub backup | **Đã push** `backup/emergency-file-wipe-restore-20260803` @ `a7fcaa7` |
| Nguyên nhân wipe | **Chưa xác định** — không thấy lệnh mass-overwrite trong terminal/transcript; Event Viewer không gắn I/O D/TradeScore |
| Auto-backup Option A | **Đã bật** — hourly LOCAL commit `backup/auto-hourly`, **không push** |
| Artifact nặng trong backup tip | **0** (`heavy_count=0` tại `cf19afc`) |
| Task 2 | Đóng băng cho đến khi bạn xác nhận tiếp |

---

## 1. Remote emergency branch

```text
origin: https://github.com/Thiennh319/tradescore-app.git
branch: backup/emergency-file-wipe-restore-20260803
tip:    a7fcaa75e49721ab5307a7c9f0b6b320aac664c3
```

| Commit | Vai trò |
|--------|---------|
| `4e5fcb3` | Snapshot sau restore (~425 files) |
| `a7fcaa7` | Note status OneDrive + disk + empty counts |

PR (optional):  
https://github.com/Thiennh319/tradescore-app/pull/new/backup/emergency-file-wipe-restore-20260803

---

## 2. Điều tra lệnh / Event Viewer (tóm tắt)

### 2.1. Terminal / transcript

- Terminal Cursor scan empty: **19:14:51 ICT** (`Get-ChildItem … Length -lt 10`) — lệnh **đọc**, không ghi đè.
- PSReadLine history user: không cập nhật trong tối 03/08 (last write 31/07).
- Scan agent transcript: thấy chuỗi **restore** (`git checkout HEAD`, Local History, commit emergency) — **không** thấy `Clear-Content` / write empty hàng loạt / `git reset --hard` / `git clean -fdx` trên source trees.

### 2.2. Event Viewer 19:00–20:00 ICT

| Log | Phát hiện liên quan? |
|-----|----------------------|
| Application | 2 lỗi **MSSQL$MISASME2021** thiếu file trên `D:\MISA…` — không dính TradeScore |
| System | Chủ yếu DCOM 10016 — noise; không disk fault / NTFS / crash Cursor |
| Ổ D | Healthy, ~108 GB trống; PhysicalDisk Healthy/OK |

### 2.3. OneDrive / disk (từ báo cáo wipe)

- OneDrive process đang chạy; project **không** nằm dưới folder OneDrive.
- Không kết luận được OneDrive là thủ phạm từ bằng chứng hiện có.

---

## 3. Auto-backup Option A (source-only)

| Mục | Chi tiết |
|-----|----------|
| Script | `scripts/auto-hourly-backup.ps1` |
| Branch | `backup/auto-hourly` (local only) |
| Task Scheduler | `TradeScore-AutoHourlyBackup` — **Ready**, lặp hourly |
| Next run (lúc xuất BC) | ~21:02 ICT 03/08/2026 |
| Tip sau harden | `cf19afc` — `hourly source snapshot … empty_canary=0` |
| Log | `docs/exports/auto-hourly-backup.log` |

### Allow-list (commit)

- Dirs: `services/`, `components/`, `hooks/`, `screens/`, `utils/`, `store/`, `constants/`, `config/`, `adapters/`, `scripts/` (có exclude)
- Files: `App.tsx`, `app.json`, `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `babel.config.js`, `metro.config.js`, `.gitignore`

### Forbidden / dropped từ index backup

- `scripts/WebLauncher/bin|obj`
- `dist/`, `node_modules/`
- `android/app/build`, `android/build`
- `TradeScore-web-v1*`, `TradeScore-Web.exe`
- `*.apk`, `*.aab`, `*.exe`, `*.dll`, `*.pdb`
- Safety gate: abort nếu vẫn còn path nặng trong index

### `.gitignore` đã bổ sung

- `*.apk` / `*.aab`, `TradeScore-web-v1/`, `TradeScore-web-v1.*/`
- `scripts/WebLauncher/bin/`, `scripts/WebLauncher/obj/`, `TradeScore-Web.exe`
- + các rule sẵn có: `node_modules/`, `dist/`, `android/app/build/`, …

**Xác nhận tip:** `heavy_count=0` trên `backup/auto-hourly` @ `cf19afc`.

**Ghi chú:** EXE/DLL WebLauncher vẫn có thể đang tracked trên nhánh làm việc (history cũ); tip auto-backup mới **không** mang chúng. Untrack khỏi working tree = cleanup riêng (chưa làm).

---

## 4. Artefacts liên quan

| File | Nội dung |
|------|----------|
| `docs/exports/REPORT_EMERGENCY_FILE_WIPE_RESTORE_2026-08-03.md` | Wipe + restore chi tiết |
| `docs/exports/EMERGENCY_STATUS_2026-08-03.md` | Status ngắn |
| `docs/exports/REPORT_POST_WIPE_CAUSE_AND_PROTECTION_2026-08-03.md` | Điều tra nguyên nhân + bảo vệ |
| `docs/exports/REPORT_POST_WIPE_SUMMARY_EXPORT_2026-08-03.md` | **Báo cáo tổng hợp này** |
| `scripts/auto-hourly-backup.ps1` | Hourly local source backup |
| `scripts/_scan-transcript-wipe.mjs` | Helper scan transcript |
| `docs/exports/auto-hourly-backup.log` | Log chạy hourly |

---

## 5. Việc đã làm / chưa làm

**Đã làm**

1. Push emergency branch lên GitHub  
2. Điều tra terminal + Event Viewer (không chốt root cause)  
3. Cài Option A + harden source-only + verify + bật lại Task Scheduler  

**Chưa làm (có chủ đích)**

- Task 2 Decision Confidence 180d × 4 coin  
- Đổi threshold decision (75/45)  
- Untrack WebLauncher bin/obj khỏi working branch  
- Option B (hourly push remote)

---

## 6. Đề xuất bước tiếp (chờ xác nhận)

1. Tiếp tục làm việc trên nhánh emergency / merge có kiểm soát về `feature/ui-redesign`  
2. Optional: `git rm --cached` WebLauncher bin/obj trên working branch  
3. Khi sẵn sàng: mở lại Task 2 (report-only) — chỉ sau khi bạn OK
