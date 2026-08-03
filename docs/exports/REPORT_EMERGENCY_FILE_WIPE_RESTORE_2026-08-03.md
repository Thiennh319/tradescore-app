# BÁO CÁO KHẨN CẤP — Mass empty-file wipe + restore (2026-08-03)

**Thời điểm:** 2026-08-03 (~19:30–19:40 ICT)  
**Repo:** `D:\Thiennh3\APP\Trading\TradeScore`  
**Mục đích:** Ghi nhận trạng thái trước khi làm việc tiếp (sweep Decision Confidence / quay UI redesign).

---

## 0. Kết luận ngắn

| Hạng mục | Kết quả |
|----------|---------|
| Đã xảy ra wipe file rỗng? | **Có** — ~223 file source `0–2 byte` (không chỉ V4.1) |
| Đã khôi phục? | **Có** — tracked từ git HEAD; untracked từ Cursor Local History |
| Source `.ts`/`.tsx` còn rỗng? | **0** (sau restore) |
| Chốt an toàn trong git? | **Có** — branch riêng + 2 commit |
| OneDrive chạy? | **Có** (process), project **không** nằm trong thư mục OneDrive |
| Ổ D đầy? | **Không** (~108 GB trống) |

---

## 1. Git — trạng thái lúc kiểm tra

### 1.1. Log gần đây (`git log --oneline -20` — điểm neo)

| Commit | Mô tả |
|--------|--------|
| `f5cf251` | feat(v1.0.8): merge NEAR S1/S3 + ambiguity 2.5 + Signal Board U1 |
| `ac82c6a` | fix(entry-decision): Soft Block count/list |
| `3f8a1b8` / `efd001c` | chore version sync v1.0.8 |
| `ae7489f` | fix(export): Group/Hard Block relabel |
| … | (xem full log trên máy) |

### 1.2. Branch trước sự cố

- Branch: `feature/ui-redesign`
- HEAD lúc neo: `f5cf251`
- Working tree: **rất dirty** (UI redesign + hàng loạt docs `D` + untracked V4.1/UL/export)

### 1.3. Branch / commit an toàn (đã tạo)

| | |
|--|--|
| Branch | `backup/emergency-file-wipe-restore-20260803` |
| Commit snapshot | `4e5fcb3` — `backup(emergency): snapshot after mass empty-file wipe restore` (425 files, +71k/−144) |
| Commit note | `a7fcaa7` — `docs: emergency wipe/restore status note` |
| HEAD hiện tại | `a7fcaa7` trên branch backup |

**Không đè** lên `feature/ui-redesign`; chỉ fork branch backup từ trạng thái hiện có rồi commit phần đã khôi phục + tooling funnel.

Phạm vi commit chính gồm: `services/`, `components/`, `hooks/`, `screens/`, `utils/`, `adapters/`, funnel script, vài report V4.1, smoke CSV.

Working tree **vẫn còn** thay đổi ngoài commit (docs mass-delete cũ, `TradeScore-web-v1`, `App.tsx`, …) — chưa gộp hết vào commit backup.

---

## 2. File rỗng / bất thường

### 2.1. Trước khôi phục

- Scan roots: `services`, `components`, `config`, `constants`, `hooks`, `screens`, `scripts`, `store`, `utils`, `adapters`
- **~223** path size ≤ 5 byte (đuôi `.ts/.tsx/.js/.mjs/.json` trong phạm vi scan)

**Ví dụ file nguy hiểm (tracked, size 0):**

- `services/exportService.ts`
- `services/journalService.ts`
- `services/scorerV3.ts`
- `services/signalBoardScan.ts`
- `services/vwapService.ts`
- `services/exportTraceReviewWire.ts`
- `services/dataBackupService.ts`
- Nhiều UI: `SignalBoardV41.tsx`, `EquityCurveChart.tsx`, `JournalEntryDetail.tsx`, …

**Ví dụ untracked bị rỗng:** hàng loạt module dưới `services/ul/`, `services/intelligence/`, `services/v41/`, scripts backtest, …

Không giới hạn V4.1 — **toàn app**.

### 2.2. Cách khôi phục

| Loại | Cách |
|------|------|
| Tracked empties (33) | `git checkout HEAD -- <file>` |
| Untracked empties (~194) | Cursor Local History (`%APPDATA%\Cursor\User\History\...\entries.json` → bản size >50) |
| Helper | `scripts/_emergency-restore-empty-from-history.mjs` |

### 2.3. Sau khôi phục

| Kiểm tra | Kết quả |
|----------|---------|
| `.ts`/`.tsx` rỗng trong services/components/hooks/screens/utils | **0** |
| `exportService.ts` | ~67 KB |
| `journalService.ts` | ~76 KB |
| `scorerV3.ts` | ~36 KB |
| `signalBoardScan.ts` | ~43 KB |
| `reversalDetector.ts` | ~29 KB |
| Còn rỗng | Chỉ stub build `WebLauncher/obj/...Up2Date` (không phải source) |
| Missing history list | `docs/exports/_empty-restore-missing.txt` (chỉ junk Up2Date) |

---

## 3. Cloud sync (OneDrive)

| Kiểm tra | Kết quả |
|----------|---------|
| Process | `OneDrive.exe` (PID ví dụ 13244) + `OneDrive.Sync.Service` **đang chạy** |
| Env `OneDrive` | `C:\Users\Thien\OneDrive` |
| Project dưới OneDrive path? | **Không** (`D:\Thiennh3\APP\Trading\TradeScore`) |
| Reparse / junction trên project? | **Không** (`fsutil reparsepoint query` → not a reparse point) |

### Cảnh báo / đề xuất

Dù project không nằm trong folder OneDrive, OneDrive vẫn chạy nền — đây là nguyên nhân phổ biến khi:

- Desktop/Documents Known Folder Move
- Copy / shortcut project vào vùng sync
- Đồng bộ nhầm thư mục khác rồi ghi đè

**Đề xuất:**

1. Giữ project **chỉ** trên `D:\Thiennh3\...` — không copy vào OneDrive/Desktop/Documents đang sync.
2. Tắt Known Folder Move cho Desktop/Documents nếu bật.
3. Nếu lại thấy file 0 byte: pause OneDrive tạm thời, kiểm tra File History / Cursor History ngay.
4. Cân nhắc thêm project vào `.gitignore` của tool sync khác (Drive for desktop, v.v.) nếu sau này cài thêm.

---

## 4. Dung lượng ổ đĩa

| Ổ | Trống (ước lượng lúc check) | Used (ước lượng) |
|---|-----------------------------:|-----------------:|
| **C:** | ~44 GB | ~222 GB |
| **D:** (project) | ~108 GB | ~103 GB |

→ **Không** phải tình trạng “ổ đầy gây ghi dở dang” trên D.

---

## 5. Việc đã làm thêm trong phiên khẩn cấp

1. Scan empty toàn diện (không chỉ V4.1)
2. Restore tracked + Local History
3. Tạo branch `backup/emergency-file-wipe-restore-20260803`
4. Commit snapshot `4e5fcb3` + note `a7fcaa7`
5. Xác nhận `TS_EMPTY=0`

Tooling Decision Confidence funnel (Task 1 trước đó) vẫn nằm trong snapshot (`scripts/backtest-v41-near-pipeline-funnel.ts`, smoke CSV BNB 7d).

---

## 6. Khuyến nghị trước khi làm tiếp

1. Làm việc tiếp trên branch **`backup/emergency-file-wipe-restore-20260803`** hoặc merge có kiểm soát về `feature/ui-redesign` sau khi review.
2. **Không** push force / reset hard trước khi đối chiếu diff.
3. Optional: `git push -u origin backup/emergency-file-wipe-restore-20260803` để có remote backup (chỉ khi bạn yêu cầu).
4. Sweep Decision Confidence 180d × 4 coin chỉ sau khi xác nhận branch ổn định.

---

## Artefacts

| File | Nội dung |
|------|----------|
| `docs/exports/EMERGENCY_STATUS_2026-08-03.md` | Tóm tắt ngắn |
| `docs/exports/REPORT_EMERGENCY_FILE_WIPE_RESTORE_2026-08-03.md` | Báo cáo đầy đủ (file này) |
| `docs/exports/_empty-restore-missing.txt` | Path không tìm thấy trong History |
| `scripts/_emergency-restore-empty-from-history.mjs` | Script restore từ Cursor History |

**Branch / commits:** `backup/emergency-file-wipe-restore-20260803` @ `a7fcaa7` (note) / `4e5fcb3` (snapshot).
