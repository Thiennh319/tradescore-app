# REPORT — Task V3V4-SYNC-3c (Capital Guard Fix)

**Ngày:** 2026-08-07  
**Follow-up:** V3V4-SYNC-3b Guard A — lỗ hổng capital chỉ nhìn `milestoneJournal`

---

## Trạng thái

**DONE** — Mở rộng tín hiệu “có data” cho Capital; journal/positions/v41Sessions **không đổi**. Tests PASS.

---

## Field dùng làm tín hiệu Capital “có data”

### Cấu trúc sync (`CapitalStatePersisted` / `capitalStateFromSettings`)

```39:45:constants/capitalManagement.ts
export type CapitalStatePersisted = {
  currentCapital: number;
  initialCapital: number;
  lastMilestoneCapital: number;
  updatedAt: number;
  milestoneJournal?: string[];
};
```

`buildDriveCapitalPayload` → `capitalStateFromSettings(settings, milestoneJournal)`:
- `currentCapital` ← `settings.accountSize`
- `initialCapital` / `lastMilestoneCapital` ← settings
- Default app: `DEFAULT_SETTINGS` / `DEFAULT_INITIAL_CAPITAL` = **34**

### Tín hiệu đã chọn (user: milestones_or_nonzero vs default 34)

| Field | Vai trò |
|-------|---------|
| `milestoneJournal.length ≥ 1` | Đã có lịch sử milestone (giữ từ 3b) |
| `currentCapital !== 34` | Số dư thật khác default |
| `initialCapital !== 34` | Vốn gốc khác default |
| `lastMilestoneCapital !== 34` | Mốc milestone khác default |

**Local “rỗng/default”** (để guard còn chạy): milestone rỗng **và** cả 3 số (thiếu field cũng coi = 34) đều = 34.

**Không dùng** riêng `updatedAt` (luôn đổi mỗi lần build payload → quá nhạy với user mới).

---

## Đã sửa

| File | Thay đổi |
|------|----------|
| `services/githubSyncService.ts` | `isCapitalPayloadDefaultEmpty` + `capitalRemoteHasMeaningfulData`; cập nhật nhánh capital của `isLocalDrivePayloadEmpty` / `remoteDrivePayloadHasData` |
| `services/__tests__/driveSync.emptyPushGuard.test.ts` | Helper unit + case capital 100 không milestone (chặn) + cả hai default (cho phép) |

---

## Test

| Case | Kết quả |
|------|---------|
| Local default + Gist `milestoneJournal ≥ 1` | Vẫn chặn (regression 3b — helpers + suite) |
| Local default + Gist `currentCapital: 100`, milestone `[]` | **Chặn + restore** (mới) |
| Local default + Gist cũng 34/34/34 + milestone `[]` | **Cho phép push** (user mới) |
| driveSync smoke / service / v41 / e2e / useTradeStore.driveSync | **PASS** (34 tests trong batch) |

---

## Rủi ro còn lại

| Rủi ro | Mức | Ghi chú |
|--------|-----|---------|
| User thật dùng đúng vốn **34** cả đời, không milestone | Thấp | Guard coi remote “không có data” — không chặn wipe (false negative) |
| Đổi `DEFAULT_INITIAL_CAPITAL` trong tương lai | Thấp | Guard key vào hằng số — cần đồng bộ |
| Capital có lịch sử chỉ trong journal PnL, không đổi 3 số vốn | Thấp | Ngoài phạm vi capital file Gist |
| Hướng B (Web merge) vẫn chưa làm | TB | Như 3b |

---

## Kết luận

Capital guard không còn chỉ dựa milestone: **milestone ≥1 hoặc bất kỳ số vốn ≠ 34** → remote “có data” → chặn empty/default push và restore.
