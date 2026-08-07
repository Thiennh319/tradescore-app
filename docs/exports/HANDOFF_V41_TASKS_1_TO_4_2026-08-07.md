# HANDOFF V4.1 — Tasks V41-1 … V41-5 (2026-08-07)

Tài liệu bàn giao cho agent sau. Phạm vi chung: `services/v41/**`, `services/v41Export/**`, `components/v41/**`.  
**Mở rộng (chỉ V41-5):** `types/driveSync.ts`, `services/driveSyncStoreBridge.ts`, `services/githubSyncService.ts`, `store/useV41TradeSessionStore.ts`, `App.tsx` (đăng ký bridge/hydrate).  
**Cấm đụng:** Journal/V3/V4 (`journalRecommendationDisplay`, `JournalTradeTable`, `ActiveTradesPanel`, `useJournalMarketSync`, `journalService`, SignalBoard/U1, `directionAmbiguity`, `scorerV4`, `signalBoardScan`, `nearV4LayerGates`). Không sửa hành vi journal/positions/capital/signalBoard — chỉ **thêm** V41 sessions sync.

Chi tiết từng fix: file `docs/exports/FIX_REPORT_*` / `REPORT_*` cùng ngày.

---

## Task V41-1 — Paper fill: Pending → Running phải chạm Entry

| Mục | Nội dung |
|-----|----------|
| **Trạng thái** | BUG — đã sửa |
| **Triệu chứng** | NEAR SHORT Breakout session Status=Running ngay; Entry 1.665 / Current 1.642 / PnL +6.91% dù SHORT limit chưa chạm Entry (`mark < entry`) |
| **Nguyên nhân** | `buildTradeSessionAdviserPatches`: `Pending && hasMark → Running` — không so sánh mark với Entry |
| **Đã sửa** | `services/v41/rc3/buildTradeSessionAdviser.ts`: `isV41SessionEntryFilled` — LONG `mark≤entry`, SHORT `mark≥entry`; Pending giữ Waiting Fill + vẫn update `current`; `pnl=null` đến khi fill |
| **Test** | `services/v41/__tests__/tradeSessionAdviser.test.ts` (incl. NEAR SHORT 1.642 vs 1.665) |
| **Việc còn lại** | Session Running sai trước fix: user **Đóng** thủ công rồi mở lại |
| **Báo cáo** | `docs/exports/FIX_REPORT_V41_TRADE_SESSION_PAPER_FILL_ENTRY_TOUCH_2026-08-07.md` |

---

## Task V41-2 — MI + Rulebook lệch Scan Timestamp (~2 phút)

| Mục | Nội dung |
|-----|----------|
| **Trạng thái** | DESIGN GAP — đã sửa (paired export) |
| **Triệu chứng** | `01_MARKET_INTELLIGENCE_V41` vs `01_RULEBOOK_V41` Generated At lệch ~4s nhưng Scan Timestamp lệch ~120s |
| **Nguyên nhân** | UI 2 lần click riêng → `runV41MarketIntelligenceExport` / `runV41RulebookExport` mỗi lần lấy `rows` hiện tại; builder copy-only, không frozen pair |
| **Đã sửa** | `services/v41Export/wire/runV41MiExport.ts`: `miRulebookPair` + `buildV41PairedMiRulebookMarkdown` / `runV41PairedMiRulebookExport` (1 row + 1 `generatedAt`); `V41SignalPanel` menu **「MI + Rulebook (cùng snapshot)」** |
| **Test** | `runV41MiExport.test.ts`, `rulebook.test.ts` — paired cùng Scan Timestamp + Generated At |
| **Việc còn lại** | Solo export vẫn độc lập — dùng paired khi cần audit pair |
| **Báo cáo** | `docs/exports/FIX_REPORT_V41_EXPORT_MI_RULEBOOK_SNAPSHOT_CONSISTENCY_2026-08-07.md` |

---

## Task V41-3 — Rule 21 `momentum_confirmed` FAIL nhưng Decision SHORT (breakout)

| Mục | Nội dung |
|-----|----------|
| **Trạng thái** | **BY-DESIGN** — không sửa engine |
| **Triệu chứng** | Rulebook NEAR: momentum FAIL (0/0), EW CLEAR; Decision SHORT từ Confirm B |
| **Nguyên nhân** | Confirm B **đã** gate `momentumAligned` tại nến retest trong `breakoutDetector`; Rule 21 đọc `row.momentum` **live scan** (EQ/scan-path). Decision Engine TR không dùng momentum. RC3 Open không đọc Rule 21. Rulebook mơ hồ (Rule 21 không SKIPPED như market_context) |
| **Đã sửa** | Không sửa code |
| **Test** | N/A |
| **Việc còn lại** | (Đề xuất, chưa làm) Rulebook: SKIPPED/N/A Rule 21 cho breakout + Stage Map riêng |
| **Báo cáo** | `docs/exports/REPORT_V41_MOMENTUM_CONFIRMED_VS_BREAKOUT_2026-08-07.md` |

---

## Task V41-4 — Execution Monitor Current đứng (1.642 vs live ~1.635)

| Mục | Nội dung |
|-----|----------|
| **Trạng thái** | BUG — đã sửa + hardening warn/test |
| **Triệu chứng** | Session Running; Current đứng 1.642 trong khi thị trường ~1.635; Advisor vẫn Updated (scan sống) |
| **Nguyên nhân** | `scanV41` `markPrice` = `raw.klines.at(-1).close` sau `filterClosedKlinesV41` → close **4H đã đóng** (có thể đứng ~4h). Adviser cập nhật Current mỗi scan 60s nhưng cùng số stale. **Không** do V41-1 dừng Running |
| **Đã sửa** | `rawMarketFetcher`: `liveMarkPrice` = ticker (`fetchTickerPrice`, TTL 3s) ưu tiên; forming 4H chỉ khi `closeTime > now`; nếu ticker fail → recover `fetchFormingFourHCloseV41` (HTTP klines raw, **không** qua `fetchKlines`/`dropUnclosedCandle`). `scanV41`: dùng `liveMarkPrice`; fallback closed-4H chỉ khi live thiếu + **`console.warn` (không silent)** |
| **Test** | `rawMarketLiveMark.test.ts`, `scanV41.test.ts` (prefer live; missing live → closed + warn); `tradeSessionAdviser.test.ts` |
| **Việc còn lại** | Current theo chu kỳ scan 60s (không tick 1s). Sau deploy: ≤1 scan để bắt ticker. Session cũ: đợi scan hoặc Đóng/mở lại |

### Xác nhận follow-up (bằng chứng)

1. **Ticker fail:** `.catch` → `console.error('[v41] fetchTickerPrice failed…')`. Test: ticker null → forming. Fallback **closed-4H** có `console.warn` trong `scanV41` + test spy warn. Dùng forming-after-ticker-fail cũng `console.warn` tại fetch layer.  
2. **Forming nguồn:** Cùng `Promise.all` với ticker; nhưng `fetchKlines` đã `dropUnclosedCandle` → last bar thường **đã đóng** → `resolveFormingCandleClose` trả `undefined`. Recover: `fetchFormingFourHCloseV41` (fetch riêng, giữ nến open). Ticker cache `TICKER_CACHE_TTL_MS=3000` — không phải stale kiểu closed-4H.  
3. **Silent closed-4H:** đã loại — warn bắt buộc khi rơi path này.

| **Báo cáo chi tiết** | `docs/exports/FIX_REPORT_V41_EXECUTION_MONITOR_CURRENT_STALE_MARK_2026-08-07.md` |

---

## Task V41-5 — Gist sync Trade Sessions (Option A)

| Mục | Nội dung |
|-----|----------|
| **Trạng thái** | DONE — APK master / Web mirror; sync Pending+Running+Closed |
| **Triệu chứng** | Session V4.1 chỉ RAM → APK và Web không chung dữ liệu |
| **Nguyên nhân** | Không persist; không trong Gist allow-list / bridge |
| **Đã sửa** | File Gist `tradescore_v41_sessions.json`; bridge merge; push/pull trong `githubSyncService`; store persist + `V41_SESSION_UPDATED` (không spam mỗi tick current); App register+hydrate |
| **Test** | `driveSync.v41Sessions.test.ts` + `driveSyncService` + `driveSync.e2e` + `useTradeStore.driveSync` — **PASS** |
| **Việc còn lại** | Smoke APK→Web thủ công; build deploy; (tuỳ chọn) prune/filter Closed trên UI |
| **Báo cáo** | `docs/exports/REPORT_V41_5_GIST_SYNC_TRADE_SESSIONS_2026-08-07.md` |
| **Điều tra trước đó** | `docs/exports/REPORT_V41_TRADE_SESSION_NO_SYNC_INVESTIGATION_2026-08-07.md` |

---

## File chạm (tóm tắt)

| Task | Files chính |
|------|-------------|
| V41-1 | `services/v41/rc3/buildTradeSessionAdviser.ts`, `__tests__/tradeSessionAdviser.test.ts` |
| V41-2 | `services/v41Export/wire/runV41MiExport.ts`, `index.ts`, `components/v41/V41SignalPanel.tsx`, tests v41Export |
| V41-3 | (doc only) |
| V41-4 | `services/v41/rawMarketFetcher.ts`, `scanV41.ts`, `__tests__/rawMarketLiveMark.test.ts`, `scanV41.test.ts` |
| V41-5 | `types/driveSync.ts`, `driveSyncStoreBridge.ts`, `githubSyncService.ts`, `useV41TradeSessionStore.ts`, `App.tsx`, `driveSync.v41Sessions.test.ts`, `driveSyncService.test.ts` |

**Không đụng lại** `buildTradeSessionAdviser` khi làm V41-2/3/4 trừ khi chứng minh liên quan trực tiếp.
