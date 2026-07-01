# TradeScore — Báo cáo lưu trữ Journal (APK + Web)

**Ngày:** 2026-07-01  
**Mục đích:** Hiểu cách journal được lưu, vì sao data có thể mất khi build/cài lại, và gap của GitHub Gist sync — phục vụ thiết kế lưu trữ vĩnh viễn.  
**Phạm vi:** Chỉ đọc codebase — không thay đổi logic app.

---

## Tóm tắt điều hành

| Câu hỏi | Trả lời ngắn |
|---------|----------------|
| Journal chính lưu ở đâu? | `AiTradeJournalEntry[]` — key `gd1_trade_journal_v2` + mirror trong `@tradescore/v7/full-snapshot` |
| APK dùng gì? | **AsyncStorage** (không SQLite) |
| Web dùng gì? | **localStorage** + IndexedDB + window.name + file backup (tùy chọn) |
| Cài APK đè (update) có mất không? | **Thường không** — AsyncStorage giữ nguyên |
| Gỡ APK / clear data có mất không? | **Có** — local mất hết |
| Gist có phục hồi APK khi cài lại không? | **Không** — APK chỉ **upload**, không **pull** khi khởi động |
| Nguy cơ lớn nhất | APK local rỗng sau cài lại → `syncAll()` có thể **upload journal rỗng lên Gist**, ghi đè cloud |

---

## A. File liên quan journal

### Store / hook chính

| Vai trò | Đường dẫn |
|---------|-----------|
| Store trung tâm | `store/useTradeStore.ts` — `aiTradeJournal`, `addJournalEntry`, `closeTradeEntry`, `hydrate()`, persist |
| Hook UI | `hooks/useJournalMarketSync.ts` — mark/advisor lệnh OPEN (không persist riêng) |
| Màn hình | `screens/JournalScreen.tsx` |
| Panel lệnh đang mở | `components/journal/ActiveTradesPanel.tsx` |

### Service đọc/ghi / logic

| File | Vai trò |
|------|---------|
| `services/journalService.ts` | Tạo entry, stats, filter, archive |
| `services/journalAdvisorSnapshot.ts` | Snapshot advisor |
| `services/tradeHistorySync.ts` | Đồng bộ AI journal ↔ legacy `tradeJournal` |
| `services/phase1Migration.ts` | Migration schema (`migrateAiJournal`, …) |
| `services/tradeSnapshot.ts` | Full snapshot `TradeFullSnapshot` |
| `services/appPersistence.ts` | Load legacy keys v5 |
| `services/persistStorage.ts` | Wrapper JSON → storage |
| `services/tradeStorePersist.ts` | Persist legacy journal |
| `services/hydrateSafety.ts` | Chống ghi đè journal rỗng lên disk |
| `services/dataBackupService.ts` | Export/import JSON thủ công (web) |
| `services/webIndexedDbMirror.ts` | Mirror → IndexedDB (web) |
| `services/webFileBackup.ts` | File System Access backup (web) |
| `services/capitalStatePersistence.ts` | Vốn `capital_state` |
| `services/githubSyncService.ts` | Sync lên GitHub Gist |
| `services/githubSync.ts` | HTTP GET/PATCH Gist |
| `services/driveSyncStoreBridge.ts` | Bridge store ↔ sync |

### Type / interface

| Type | File | Ghi chú |
|------|------|---------|
| **`AiTradeJournalEntry`** | `constants/aiJournal.ts` | **Bản ghi chính** (Phase 1) |
| `MarketSnapshot`, `ScoringSnapshot`, `TradePlanSnapshot`, `TradeOutcome` | `constants/aiJournal.ts` | Nested |
| **`StoredTradeJournalEntry`** | `store/useTradeStore.ts` | Legacy |
| **`TradeJournalEntry`** | `constants/scoring.ts` | Legacy đơn giản |
| `TradeFullSnapshot` | `services/tradeSnapshot.ts` | Bundle toàn bộ |

> Không có type tên `JournalEntry` — canonical là **`AiTradeJournalEntry`**.

### UI / test (không persist trực tiếp)

`components/journal/*`, `components/JournalEntryCard.tsx`, các file `*.test.ts` journal.

---

## B. Storage hiện tại

### Engine theo nền tảng

| Nền tảng | Engine | File bridge |
|----------|--------|-------------|
| APK | **AsyncStorage** | `services/storage.ts`, `storage.native.ts` |
| Web | **localStorage** | `services/storage.web.ts` |
| Web | **IndexedDB** (`tradescore-persist-v1`) | `services/webIndexedDbMirror.ts` |
| Web | **window.name** mirror | `services/tradeSnapshot.ts` |
| Web | **File backup** (tùy chọn) | `services/webFileBackup.ts` |
| Web EXE | WebView2 profile `TradeScore-data/webview/` | `scripts/WebLauncher/Program.cs` |
| SQLite | **Không dùng** | — |
| Zustand persist middleware | **Không** | Ghi thủ công `persistAllPhase1Keys()` |

### Keys lưu trữ

| Key | Nội dung |
|-----|----------|
| `gd1_trade_journal_v2` | **`AiTradeJournalEntry[]`** (journal chính) |
| `@tradescore/v5/trade-journal` | Legacy `StoredTradeJournalEntry[]` |
| `@tradescore/v7/full-snapshot` | **`TradeFullSnapshot`** (journal + settings + …) |
| `gd1_daily_stats_v2` | Thống kê theo ngày |
| `gd1_open_trade` | Lệnh mở hiện tại |
| `gd1_account_history` | Equity curve |
| `gd1_locked_plan` | Locked limit plan |
| `gd1_skipped_setups` | Setup bỏ qua |
| `capital_state` | Vốn / milestone |
| `@tradescore/v5/settings` | Settings |
| `@drivesync/pending/*` | Upload Gist pending |

### Luồng ghi

Thay đổi journal → `persistAiJournal()` / `persistAllPhase1Keys()` → ghi key Phase 1 + full snapshot (+ IndexedDB/file trên web).

### Data mất khi nào?

| Tình huống | Local storage | Gist cloud |
|------------|---------------|------------|
| Cài APK đè (update) | **Thường giữ** | Không đổi |
| Gỡ APK + cài lại | **Mất** | Còn nếu đã upload |
| Xóa data app | **Mất** | Còn trên Gist |
| Build web mới, cùng origin/EXE profile | **Giữ** | Không đổi |
| Web dev đổi port / origin | **Mất** | Web có thể pull Gist |
| Xóa folder `TradeScore-data` (EXE) | **Mất** | Web pull Gist |

**Kết luận:** “Build version mới” **không tự xóa** data — mất chủ yếu khi **gỡ/clear data** hoặc **đổi web origin**.

---

## C. Cấu trúc `AiTradeJournalEntry`

### Top-level

| Field | Kiểu | Mô tả |
|-------|------|--------|
| `id` | string | ID duy nhất |
| `timestamp` | number | Thời điểm tạo (ms) |
| `symbol` | string | Cặp (vd. BTCUSDT) |
| `accountSizeAtEntry` | number | Vốn lúc vào |
| `market` | MarketSnapshot | Snapshot thị trường lúc vào |
| `scoring` | ScoringSnapshot | Điểm / quyết định lúc vào |
| `plan` | TradePlanSnapshot | SL/TP/size lúc vào |
| `outcome` | TradeOutcome | Trạng thái / PnL / đóng |
| `tags` | string[] | Tags |
| `version` | string | Schema version |
| `abTestRecordId` | string? | A/B test |
| `strategySource` | V3 \| V4 \| CVDX \| MANUAL? | Nguồn chiến lược |
| `archived` | boolean? | Ẩn UI, vẫn stats |
| `gracePeriodEverTriggered` | boolean? | Grace period advisor |
| `lastFundingState` | FundingState? | Scan trước |
| `lastSqueezeRiskLevel` | SqueezeLevel \| null? | L11 trước |
| `lastSqueezeRiskDirection` | SqueezeDirection \| null? | L11 trước |
| `fundingAtEntry` | number \| null? | V4 funding % vào |
| `fundingVelocityAtEntry` | number \| null? | |
| `fundingStateAtEntry` | FundingState \| null? | |
| `fundingAtExit` | number \| null? | V4 funding % đóng |
| `fundingStateAtExit` | FundingState \| null? | |
| `squeezeRiskScoreAtEntry` | number \| null? | L11 vào |
| `squeezeRiskLevelAtEntry` | SqueezeLevel \| null? | |
| `squeezeRiskDirectionAtEntry` | SqueezeDirection \| null? | |
| `squeezeRiskScoreAtExit` | number \| null? | L11 đóng |
| `squeezeRiskLevelAtExit` | SqueezeLevel \| null? | |
| `squeezeRiskDirectionAtExit` | SqueezeDirection \| null? | |
| `positionAdvisorActionAtExit` | PositionAdvisorActionAtExit \| null? | Khuyến nghị lúc đóng |
| `followedAdvisorRecommendation` | boolean \| null? | Có theo advisor |
| `scoringDecisionAtExit` | string \| null? | Quyết định lúc đóng |
| `planHealthAtExit` | PlanHealthStatus \| null? | Plan health lúc đóng |
| `manualExitReason` | ManualExitReason \| null? | Lý do đóng thủ công |
| `manualExitNote` | string \| null? | Ghi chú OTHER |

### `MarketSnapshot`

`entryPrice`, `priceAtAnalysis`, `slippage`, `cvdValue`, `cvdTrend`, `volumeRatio`, `btcChangePct`, `fundingRate`, `topLSRatio`, `oiChangePct`, `sessionType`, `hourVN`

### `ScoringSnapshot`

`totalScore`, `direction`, `layerScores` (l1–l10), `mandatoryViolations`, `decision`, `scorerVersion`, `groupA`, `groupB`, `groupC`, `l5aScore`, `expectedWinrate`, `recommendationLabel`, `score`, `marketState`

### `TradePlanSnapshot`

`entryZoneType`, `entryZoneOptimal`, `entryZoneRangeLow`, `entryZoneRangeHigh`, `slProposed`, `slActual`, `tp1Proposed`, `tp1Actual`, `tp2`, `tp3`, `rrProposed`, `sizeProposed`, `sizeActual`, `isSafeSL`, `openReason`

### `TradeOutcome`

`status` (OPEN \| WIN \| LOSS \| BREAKEVEN \| CANCELLED \| PENDING), `exitPrice`, `exitTimestamp`, `pnlUSDT`, `pnlPct`, `holdingTimeMinutes`, `holdDurationMinutes`, `exitReason`, `closeReason`, `limitOrderPrice`, `fillMarketPrice`, `entryAdjusted`, `limitOrderPlacedAt`, `notes`, `offlineClose`, `wasGracePeriodTriggered`

### Legacy `StoredTradeJournalEntry`

Kế thừa `TradeJournalEntry` (`symbol`, `direction`, `entryPrice`, `entryTime`, `leverage`, `size`, `stopLoss`, `takeProfit1/2/3`) + `id`, `status`, `closedAt`, `notes`, `exitPrice`, `closeReason`, `realizedPnlUsdt`, `realizedPnlPercent`, `strategySource`, …

---

## D. GitHub Gist sync

### File trên Gist (`types/driveSync.ts`)

| File Gist | Nội dung |
|-----------|----------|
| `tradescore_journal.json` | `AiTradeJournalEntry[]` (wrapper version/deviceId/lastUpdated) |
| `tradescore_positions.json` | `currentOpenTrade`, `openTrades`, `lockedPlan` |
| `tradescore_capital.json` | `CapitalStatePersisted` |
| `tradescore_signal_board.json` | Signal board scan |

**Không sync:** `dailyStats`, `accountHistory`, `skippedSetups`, settings đầy đủ, psychology, analysis bundle, full snapshot.

### Master / mirror

| Nền tảng | Vai trò | Khởi động (`useDriveSyncLifecycle`) |
|----------|---------|--------------------------------------|
| **APK** | Master — upload | Sau `hydrate`: `syncAll()` — **không pull** |
| **Web** | Mirror — download | Sau `hydrate`: `pullFromDrive()` + mỗi 60s |

### Thủ công (badge sync — `App.tsx`)

- Web → `pullFromDrive()`
- APK → `syncAll()` (upload only)

### APK cài lại — auto-restore?

**Không.** `pullFromDrive()` chỉ chạy trên web. APK không có bootstrap pull từ Gist.

### Vì sao Gist có data mà vẫn mất?

1. **APK sau cài lại:** local rỗng → `hydrate` rỗng → `syncAll()` upload journal rỗng → **có thể ghi đè Gist**.
2. **APK không pull** — Gist feed web, không restore APK.
3. **Web:** `applyJournalMirrorFromApk` thay journal local bằng bản APK (không merge từng field).
4. **Thiếu field trên Gist** — stats/history chỉ local.
5. **Cài đè APK** thường không mất — nhầm với gỡ/clear data.

---

## E. Gap & đề xuất (chưa implement)

### Gap

| # | Gap | Mức độ |
|---|-----|--------|
| 1 | APK không pull Gist khi cài mới / local rỗng | Nghiêm trọng |
| 2 | `syncAll()` upload khi local rỗng → ghi đè cloud | Nghiêm trọng |
| 3 | Gist thiếu dailyStats, accountHistory, skippedSetups, settings | Trung bình |
| 4 | Web mirror một chiều từ APK | Trung bình |
| 5 | Không export/import tự động trên APK | Trung bình |

### Đề xuất giải pháp (chỉ thiết kế)

1. **Bootstrap pull trước upload (APK):** Nếu local journal rỗng và Gist có data → pull + merge by `id` → rồi mới upload.
2. **Chặn upload rỗng:** Không PATCH journal nếu local `length === 0` và remote có entries (hoặc cần xác nhận user).
3. **Sync full snapshot** lên Gist (1 file) — gần `TradeFullSnapshot` hiện có.
4. **SQLite (optional APK)** — bền hơn với dataset lớn; vẫn cần cloud backup.
5. **Export JSON định kỳ** — mở rộng `dataBackupService` sang native (Downloads).
6. **Web EXE:** hướng dẫn giữ `TradeScore-data`; backup JSON định kỳ.
7. **Merge policy:** pull → merge by `id`, local wins conflict — tránh replace toàn bộ.

---

## Tham chiếu code

| Chủ đề | File |
|--------|------|
| Hydrate | `store/useTradeStore.ts` — `hydrate()` |
| Persist | `persistAllPhase1Keys()`, `persistFullSnapshotFromState()` |
| Gist upload | `services/githubSyncService.ts` — `syncAll()`, `syncFilesBatch()` |
| Gist pull (web) | `pullFromDrive()`, `applyJournalMirrorFromApk` trong `useTradeStore.ts` |
| Lifecycle | `hooks/useDriveSyncLifecycle.ts` |
| Keys | `constants/aiJournal.ts` — `AI_JOURNAL_STORAGE_KEYS` |

---

*Báo cáo tạo từ phân tích codebase — không sửa logic production.*
