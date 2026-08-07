# REPORT — Task V3V4-SYNC-3a (Root Cause — APK Reinstall Wipes Web Data)

**Ngày:** 2026-08-07  
**Phạm vi:** CHỈ ĐIỀU TRA — **không sửa code**  
**Phủ:** journal / positions / capital / signalBoard (V3/V4) + v41Sessions (V4.1)

---

## Trạng thái

**DONE (điều tra)** — Chuỗi nhân quả “APK trống → push Gist → Web replace → mất data” **khớp code**, với vài sắc thái (signalBoard có thể skip; claim “APK cố ý không persist” **mâu thuẫn** với code + docs hiện có).

---

## Điểm 1 — Web mirror: REPLACE hay MERGE? Có check “remote ít hơn local” không?

### Kết luận điểm 1

| Domain | Web apply behavior | Check “remote ít hơn / rỗng → không ghi đè”? |
|--------|--------------------|-----------------------------------------------|
| **journal** | **REPLACE toàn bộ** bằng `remote` | **Không** — thậm chí local-only entry làm `changes++` rồi vẫn ghi `remote` |
| **positions** | **REPLACE** open + lockedPlan từ remote | **Không** |
| **capital** | **REPLACE** settings/capital nếu khác | **Không** (chỉ “sameCapital?”) |
| **signalBoard** | Ghi đè nếu `remote.scannedAt > local` | Không so sánh số rows; nếu remote không có board → return 0 (không wipe) |
| **v41Sessions** | **REPLACE** sessions bằng remote | **Không** (chỉ skip nếu signature bằng nhau) |

**Claim “V3V4-SYNC-1 đã MERGE Journal”:** trong repo **không** có báo cáo `V3V4-SYNC-1`; hàm `mergeJournalEntries` **không** chạy trên Web mirror path.

### Bằng chứng — journal

Web path trong `applyToLocalStore` gọi bridge, **không** gọi `mergeJournalEntries`:

```514:533:services/githubSyncService.ts
      case DRIVE_FILE_NAMES.journal: {
        if (isWebMirrorPull() && bridge) {
          const count = await bridge.applyJournalMirrorFromApk(data as unknown[], meta);
          ...
          return count;
        }

        const localEntries = bridge
          ? (bridge.getJournal() as unknown[])
          : ...
        const { merged, count } = mergeJournalEntries(localEntries, data as unknown[]);
```

`mergeJournalEntries` chỉ union theo id (add remote thiếu ở local) — và **chỉ** nhánh APK / không-web ở trên.

Bridge Web journal:

```2378:2388:store/useTradeStore.ts
  applyJournalMirrorFromApk: async (remoteJournal) => {
    if (Platform.OS !== 'web') return 0;

    const remote = remoteJournal as AiTradeJournalEntry[];
    const local = useTradeStore.getState().aiTradeJournal;
    const changes = countJournalMirrorChanges(local, remote);
    if (changes === 0) return 0;
    ...
    const persisted = applyJournalPersist(remote, nextStats);
```

`countJournalMirrorChanges` tính local-only là “change”, **không** bảo vệ:

```2349:2368:store/useTradeStore.ts
function countJournalMirrorChanges(local, remote): number {
  ...
  for (const entry of remote) {
    const existing = localById.get(entry.id);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(entry)) {
      changes++;
    }
  }
  for (const entry of local) {
    if (!remoteById.has(entry.id)) {
      changes++;
    }
  }
```

→ Remote `[]` + local 21 entry → `changes=21` → **set journal = `[]`** (REPLACE).

### Bằng chứng — positions / capital

```2414:2447:store/useTradeStore.ts
  applyPositionsMirrorFromApk: async (remote) => {
    ...
    const nextOpen = payload.currentOpenTrade ?? null;
    const nextLocked = payload.lockedPlan ?? null;
    ...
    useTradeStore.setState({
      currentOpenDataTrade: nextOpen,
      lockedPlan: nextLocked,
```

```2449:2478:store/useTradeStore.ts
  applyCapitalMirrorFromApk: async (remote) => {
    ...
    if (sameCapital) return false;
    ...
    useTradeStore.setState({ settings, capitalManagement, milestoneJournal, ... });
```

Không có nhánh “remote rỗng / ít hơn → bỏ qua”.

### Bằng chứng — signalBoard

```561:586:services/githubSyncService.ts
      case DRIVE_FILE_NAMES.signalBoard: {
        ...
        if (!remoteBoard?.rows?.length || !remoteBoard.scannedAt) {
          return 0;
        }
        ...
        if (localBoard && localBoard.scannedAt >= remoteBoard.scannedAt) {
          return 0;
        }
        await savePersistedSignalBoard(...);
```

Sắc thái: remote **thiếu / không rows** → không ghi. Remote board mới hơn (kể cả “hầu như trống”) vẫn có thể đè nếu có `rows.length` và `scannedAt` mới hơn.

### Bằng chứng — v41Sessions

```151:159:store/useV41TradeSessionStore.ts
  replaceSessionsFromRemote: async (remote) => {
    const next = normalizeSessions(remote);
    ...
    set({ sessions: next });
    await persistSessions(next);
    return 1;
  },
```

Tên hàm + hành vi = **replace toàn bộ**. Không so sánh count.

---

## Điểm 2 — Sau cài đè APK, local có bắt đầu RỖNG? “Cố ý không lưu” hay persist bị mất?

### Kết luận điểm 2 — **mâu thuẫn thiết kế-user vs code/docs**

| Nguồn | Nội dung |
|-------|----------|
| **User (bối cảnh task)** | APK cố ý **không** lưu local; Web mới là storage vĩnh viễn |
| **Code thực thi** | APK **CÓ persist** journal/positions/capital qua AsyncStorage; V41 sessions cũng persist key `@tradescore/v41_trade_sessions_v1` |
| **Docs/handoff audit sync** | Mô tả APK = upload master, Web = mirror pull — **không** ghi “APK cố ý không persist local” (`docs/REPORT_AUDIT_APK_WEB_GITHUB_GIST_SYNC_2026-07-31.md`) |

→ Không kết luận “đúng thiết kế code là không lưu APK”. Kết luận vận hành: **sau uninstall / clear data / fresh install**, AsyncStorage trống → hydrate đọc `null` → state default `[]` / null → **trông như rỗng**, rồi bootstrap push.

### Bằng chứng — persist bật trên native

```1:19:services/storage.native.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
...
export async function storageGetItem(...) { return await AsyncStorage.getItem(key); }
export async function storageSetItem(...) { await AsyncStorage.setItem(key, value); }
```

Web dùng `storage.web.ts` (`localStorage`). `persistStorage.ts` gọi lớp đó cho mọi nền tảng.

Store mặc định khi chưa hydrate / disk trống:

```956:966:store/useTradeStore.ts
  tradeJournal: [],
  ...
  aiTradeJournal: [],
  ...
  currentOpenDataTrade: null,
  lockedPlan: null,
```

`hydrate` đọc `AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL` (`gd1_trade_journal_v2`) — nếu không có → `aiJournal ?? []`.

V41:

```140:148:store/useV41TradeSessionStore.ts
  hydrate: async () => {
    const saved = await persistGetJson<unknown>(V41_SESSIONS_STORAGE_KEY);
    const sessions = normalizeSessions(saved);
    set({ sessions, hydrated: true });
```

`App.tsx` còn `registerNativePersistGuard(useTradeStore)` trên non-web — xác nhận native được coi là cần flush persist.

**Không** thấy code tắt persist theo `Platform.OS === 'android'`.  
**Không** thấy storage key đổi theo version làm “không đọc lại” trong phạm vi điều tra này (key journal vẫn `gd1_trade_journal_v2`).

Sắc thái: “cài đè” **update in-place** thường **giữ** AsyncStorage; “cài đè” kèm **uninstall / clear data / đổi package** → trống. Code không phân biệt — chỉ phản ánh disk.

---

## Điểm 3 — Push APK có chặn “local ít/rỗng đè Gist nhiều” không?

### Kết luận điểm 3

**Không.** Chỉ check “có phải APK được upload không” (`canUploadToDrive`).  
`[]` / object rỗng **không** bị coi `missing` (chỉ `null` → missing; signalBoard `null` → skip).

### Bằng chứng — bootstrap push sau hydrate

```26:37:hooks/useDriveSyncLifecycle.ts
    if (Platform.OS !== 'web') {
      ...
      schedule12hSync();
      ...
      void syncAll();
      console.log('[App] GitHub Gist bootstrap upload (APK, after hydrate)');
```

`syncAll` upload **toàn bộ** `DRIVE_FILE_NAMES` (gồm journal, positions, capital, signalBoard, v41Sessions):

```339:363:services/githubSyncService.ts
export async function syncAll(): Promise<SyncResult> {
  if (!canUploadToDrive()) { ... }
  const allFiles = [
    ...new Set([...Object.values(DRIVE_FILE_NAMES), ...pendingFromDisk]),
  ] as DriveFileName[];
  ...
  const { synced, failed } = await syncFilesBatch(allFiles);
```

`buildFilePayload`:

```182:207:services/githubSyncService.ts
  const data = await getLocalData(fileName);
  if (data === null) {
    if (fileName === DRIVE_FILE_NAMES.signalBoard) {
      ... return { kind: 'skip', fileName };
    }
    ...
    return { kind: 'missing', fileName };
  }
  const wrapper = { version, lastUpdated, deviceId, data };
  return { kind: 'ready', ..., content: JSON.stringify(wrapper) };
```

`getJournal()` → `aiTradeJournal` = `[]` → **ready**, upload content `data: []`.  
`getV41Sessions?.() ?? []` → luôn mảng, kể cả rỗng → **ready**.

```262:267:services/githubSyncService.ts
function canUploadToDrive(): boolean {
  const bridge = getDriveSyncStoreBridge();
  if (bridge) {
    return bridge.getDeviceId() === 'APK';
  }
  return true;
}
```

Không so sánh độ lớn với Gist hiện tại. `uploadFiles` PATCH thay nội dung file.

Manual sync APK cũng `syncAll()` (`App.tsx` `handleManualSyncPress`).

---

## Kết luận nguyên nhân chính xác

Chuỗi sau **được code hỗ trợ đầy đủ** (không chỉ suy đoán):

```
APK fresh/clear data
  → hydrate đọc AsyncStorage trống → state default rỗng
  → useDriveSyncLifecycle: syncAll() bootstrap
  → push tradescore_journal.json data:[] (+ positions/capital rỗng; v41Sessions [])
  → Gist bị ghi đè bản master rỗng
  → Web pullFromDrive → apply*MirrorFromApk REPLACE
  → Web local journal/positions/capital/v41Sessions mất theo remote
```

**Sắc thái (không phủ nhận core):**

1. **Claim “APK cố ý không lưu”** ≠ code: APK **có** AsyncStorage persist; mất local thường vì **wipe app data / install sạch**, không vì flag “disable persist”.
2. **signalBoard:** fresh APK chưa scan → payload `null` → **skip upload** → Gist board cũ **có thể còn**; Web board không bị wipe bởi file missing. Nếu APK scan rồi push board mới thì vẫn đè theo `scannedAt`.
3. **Journal Web không phải MERGE-add:** `mergeJournalEntries` không dùng trên Web; apply = `applyJournalPersist(remote)`.
4. Cascade **không cần** user tạo trade mới — chỉ cần mở APK sau wipe để `syncAll()` chạy.

---

## Đề xuất hướng sửa (CHƯA LÀM — chờ xác nhận)

### A — Phía PUSH (APK): chống push “destructive empty”

Trước `syncAll` / `syncFilesBatch` trên APK:

- So sánh local vs Gist (hoặc vs last-known good snapshot):
  - local journal length ≪ remote, hoặc local `[]` trong khi Gist `length > 0` → **không upload** file đó;
  - thay bằng **pull/hydrate từ Gist trước** (Auto-Restore phía APK — ý tưởng V3V4-SYNC-2d nhưng master cũng phải phục hồi).
- Áp dụng cho journal, positions, capital, v41Sessions (signalBoard đã có skip-khi-null; vẫn cân nhắc guard thêm).

### B — Phía APPLY MIRROR (Web): MERGE, không REPLACE xoá

- Journal: giữ entry local mà remote không có; cập nhật theo id nếu remote mới hơn (đây **chưa** có trên Web path hiện tại).
- Positions / capital: không clear open/locked/capital về null/default chỉ vì remote “trống hơn”.
- v41Sessions: merge by id (hoặc không replace bằng `[]` nếu local đang có sessions).
- signalBoard: giữ rule `scannedAt` hoặc thêm “không nhận board rỗng”.

### Khuyến nghị

**Làm cả A + B** (defense in depth): A chặn nguồn ghi đè Gist; B bảo vệ Web nếu Gist đã bị hỏng một phần.  
Thứ tự ưu tiên nếu chỉ làm một: **A trước** (ngăn Gist trống), rồi B.

---

## Việc còn lại

1. User xác nhận hướng A / B / cả hai trước khi implement (task sửa sau).
2. (Tuỳ chọn) Smoke: APK clear-data → mở app → quan sát log `bootstrap upload` + nội dung Gist journal → Web pull.
3. Làm rõ product intent: nếu APK **không** được coi SSOT local, có thể đổi mô hình sync (Web master hoặc last-writer-wins có guard) — đó là quyết định thiết kế, **ngoài** bugfix thuần.

---

## Rủi ro nếu không sửa

Mỗi lần APK mất AsyncStorage + mở app có mạng/token hợp lệ → **wipe Gist → wipe Web** cho journal/positions/capital/v41Sessions (signalBoard tùy scan).

---

## File đã đọc (bằng chứng)

- `services/githubSyncService.ts` — push/pull/apply
- `hooks/useDriveSyncLifecycle.ts` — APK `syncAll` / Web `pullFromDrive`
- `store/useTradeStore.ts` — mirror + hydrate + defaults
- `store/useV41TradeSessionStore.ts` — replaceSessionsFromRemote
- `services/storage.native.ts` / `storage.web.ts` / `persistStorage.ts`
- `App.tsx` — hydrate + manual sync
- `docs/REPORT_AUDIT_APK_WEB_GITHUB_GIST_SYNC_2026-07-31.md` — không mô tả “APK không persist”
