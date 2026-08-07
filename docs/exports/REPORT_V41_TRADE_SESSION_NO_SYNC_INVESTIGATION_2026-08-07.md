# REPORT — V4.1 Trade Session không sync APK ↔ Web (điều tra)

**Ngày:** 2026-08-07  
**Task đề xuất:** V41-5  
**Trạng thái:** **ĐIỀU TRA XONG — DỪNG, CHƯA SỬA** (cần mở rộng hạ tầng sync chung + store ngoài phạm vi)

---

## Trạng thái

Không triển khai sync trong vòng này. Fix **không nằm gọn** trong `services/v41/**` | `v41Export/**` | `components/v41/**` mà không đụng lớp sync dùng chung / store ngoài allow-list.

---

## 1. Cơ chế sync V3/V4 (bằng chứng)

### Kênh

**GitHub Gist** (alias “Drive” trong code) — APK là **upload master**, Web **mirror pull**.

```1:1:services/driveSyncService.ts
/** GitHub Gist sync — APK upload master, Web mirror pull. */
```

```30:60:types/driveSync.ts
export const GIST_FILE_NAMES = {
  journal: 'tradescore_journal.json',
  positions: 'tradescore_positions.json',
  capital: 'tradescore_capital.json',
  signalBoard: 'tradescore_signal_board.json',
} as const;
// SYNC_ACTION_FILE_MAP: JOURNAL_ENTRY_ADDED → journal, ORDER_* → positions+journal, …
```

Journal thay đổi → `useTradeStore` gọi `syncOnAction('JOURNAL_ENTRY_ADDED'|…)` → push file tương ứng lên Gist; Web `pullFromDrive` / `applyJournalMirrorFromApk` áp bản remote.

### Dùng chung hay riêng V3/V4?

**Lớp sync dùng chung toàn app** cho một tập payload cố định (journal / positions / capital / signalBoard), **không** phải abstraction “mọi feature cắm vào tự động”. Cắm feature mới = mở rộng:

- `GIST_FILE_NAMES` + `SyncActionType` + `SYNC_ACTION_FILE_MAP`
- `DriveSyncStoreBridge` (get/apply)
- `githubSyncService` push/pull
- đăng ký bridge trong `useTradeStore` (hiện tại)

```7:19:services/driveSyncStoreBridge.ts
export interface DriveSyncStoreBridge {
  getDeviceId: () => DriveDeviceId;
  getJournal: () => unknown[];
  getPositions: () => unknown;
  getCapital: () => unknown;
  applyJournalMirrorFromApk: ...
  applyPositionsMirrorFromApk: ...
  applyCapitalMirrorFromApk: ...
}
```

```2373:2377:store/useTradeStore.ts
registerDriveSyncStoreBridge({
  getDeviceId: () => (Platform.OS === 'web' ? 'WEB' : 'APK'),
  getJournal: () => useTradeStore.getState().aiTradeJournal,
  getPositions: () => buildDrivePositionsPayload(...),
  getCapital: () => buildDriveCapitalPayload(...),
```

**Không** có hook `registerExtraSyncPayload` generic. V4.1 hiện **không** trong danh sách file Gist / bridge.

---

## 2. V4.1 Trade Session lưu ở đâu?

**Chỉ RAM Zustand** — comment SSOT:

```1:4:store/useV41TradeSessionStore.ts
 * V4.1 RC3 — Trade Session store (UI only).
 * Không ghi Journal. Không gọi API. Không đụng V3/V4 trade store.
```

```66:67:store/useV41TradeSessionStore.ts
export const useV41TradeSessionStore = create<V41TradeSessionStore>((set, get) => ({
  sessions: [],
```

| Thao tác | Chỗ ghi |
|----------|---------|
| Tạo | `createSession` → `set({ sessions: [...] })` |
| Promote / Current / Advisor | `applyAdviserPatches` (từ `useV41TradeSessionAdviser` + `buildTradeSessionAdviserPatches`) |
| Đóng | `endSession` → filter khỏi mảng |

**Không** `persist` middleware, **không** AsyncStorage/localStorage key riêng, **không** `syncOnAction`, **không** file Gist.

→ APK và Web = **hai heap độc lập**. Reload cũng mất session trên cùng máy.

---

## 3. Kết luận nguyên nhân

| | V3/V4 Journal | V4.1 Trade Session |
|--|---------------|---------------------|
| Persist local | Có (`persistStorage` / journal keys) | Không |
| Sync APK↔Web | Gist journal/positions/capital | Không |
| Store | `useTradeStore` + Drive bridge | `useV41TradeSessionStore` memory-only |

**Nguyên nhân chính xác:** V4.1 cố ý “UI only / không ghi Journal / không API”, ngoài pipeline Gist. Không phải bug sync bị gãy — **chưa bao giờ nối sync**.

### Có cắm trong phạm vi allow-list không?

| Việc cần | Nằm trong allow-list? |
|----------|------------------------|
| Thêm `tradescore_v41_sessions.json` + action type | `types/driveSync.ts` — **NGOÀI** |
| Push/pull trong `githubSyncService` | `services/githubSyncService.ts` — **NGOÀI** (hạ tầng chung) |
| Mở rộng `DriveSyncStoreBridge` | `driveSyncStoreBridge.ts` — **NGOÀI** |
| `getSessions` / `applySessionsMirror` | Thường gắn `store/useV41TradeSessionStore.ts` — **NGOÀI** allow-list (`store/**`) |
| Gọi sync sau create/end | Store hoặc `App.tsx` / hook — phần lớn **NGOÀI** |
| Chỉ viết helper thuần trong `services/v41/**` | **Không đủ** — không ai gọi push/pull/wire bridge |

→ **Không thể** hoàn tất sync APK↔Web **chỉ** bằng sửa `services/v41/**` + `v41Export/**` + `components/v41/**` mà không đụng hạ tầng Gist / store.

Dựa mục **5** prompt: **DỪNG**, chờ xác nhận trước khi đụng lớp sync chung.

---

## Đã sửa

**Không.**

---

## Test

N/A (chưa implement).

---

## Việc còn lại / Phương án đề xuất (chờ xác nhận)

**Option A — Cắm vào Gist sync hiện có (khuyến nghị nếu chấp nhận đụng hạ tầng):**

1. `types/driveSync.ts`: `v41Sessions: 'tradescore_v41_sessions.json'` + `V41_SESSION_UPDATED`.  
2. `driveSyncStoreBridge` + `githubSyncService`: get/push/pull/apply mirror (Web mirror giống journal).  
3. `useV41TradeSessionStore`: persist tùy chọn + gọi `syncOnAction` sau create / patch có ý nghĩa / end; hydrate từ local + pull.  
4. Đăng ký bridge (có thể file mới `services/v41/sync/registerV41DriveSync.ts` gọi từ App — **App.tsx** cũng ngoài allow-list hiện tại).  
5. Test: mock gist push/pull; APK mock → Web apply đúng sessions.

**Rủi ro:** thay đổi Gist schema / bridge ảnh hưởng đường sync Journal–Capital nếu regress; cần test `driveSync*.test.ts`. Conflict hai máy cùng sửa session (cần quy tắc APK-master giống journal).

**Option B — Sync riêng trong `services/v41` gọi Gist API song song:** tránh sửa bridge — vẫn cần token/Gist ID, trùng hạ tầng, **vẫn** phải sửa `store/useV41TradeSessionStore` (ngoài phạm vi). Không sạch hơn Option A.

**Option C — Chỉ persist local (AsyncStorage) không sync cloud:** hết lệch sau reload **trên cùng thiết bị**, **không** giải APK↔Web.

---

## Rủi ro cần xác nhận thêm

1. Cho phép sửa `types/driveSync.ts`, `driveSyncStoreBridge.ts`, `githubSyncService.ts`, `store/useV41TradeSessionStore.ts`, và (có thể) `App.tsx` / hook đăng ký?  
2. Master vẫn APK-only cho V4.1 sessions (Web chỉ mirror) — có chấp nhận?  
3. Scope session sync: chỉ Pending/Running active, hay cả lịch sử đã End?

---

## Liên kết

- Handoff V41-1…4: `docs/exports/HANDOFF_V41_TASKS_1_TO_4_2026-08-07.md`
