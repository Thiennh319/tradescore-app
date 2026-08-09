# REPORT — Implement UI SignalBoard mobile compact + expand (Task 4B approve)

**Ngày:** 2026-08-09  
**Phạm vi (đã confirm):** **UI only** trên 5 coin hiện tại — **CHƯA** Task 5 (`TRADE_SYMBOLS` → 8 / ETH·LINK·AVAX).  
**CHƯA** build web/APK.

---

## Verdict

Desktop giữ **card grid** như cũ. Mobile (`width < 768`) dùng **compact list + filter Sẵn sàng/Tất cả + expand inline LONG/SHORT** theo mockup đã duyệt. Không đụng logic scoring/backtest.

---

## Diff tóm tắt

| File | Thay đổi |
|------|----------|
| `components/dashboard/SignalBoard.tsx` | Mobile branch: filter tabs + `SignalCardCompact` + expand; desktop vẫn `SignalCard` grid; header mobile xếp cột (tránh title đứng dọc); helpers `resolveSignalRowUiChrome` / badge/tip compact |
| `constants/vi.ts` | Chuỗi filter: `filterReady`, `filterAll`, `filterReadyEmpty`, `badgeReadyShort`, `badgeWatchShort` |
| `scripts/screenshot-signalboard-compact.mjs` | Playwright capture (dev web only) |
| `docs/exports/screenshots/*.png` | Screenshot thật từ `localhost:8081` |

**Không đổi:** `TRADE_SYMBOLS`, scorer, backtest scripts, `SignalBoardUnified` (Tổng hợp).

### Hành vi UI

| Breakpoint | Layout |
|------------|--------|
| Desktop / web ≥768 | Card grid hiện có (5 coin) |
| Mobile &lt;768 | Tab **Sẵn sàng (N)** / **Tất cả (N)** → row compact → tap expand → Phiên/BTC meta + nút LONG/SHORT + `TradePlanModal` |

- Ready = `resolveCardBadge(...).kind === 'READY'` (cùng badge logic desktop).
- Nút LONG/SHORT: cùng `isU1DirectionButtonEnabled` + `isDirectionReady` như card desktop (outline style trên compact).
- Expand: một row mở tại một thời điểm (`expandedSymbol`).

---

## Screenshot thật (không phải mockup)

Nguồn: Expo web `http://localhost:8081`, tab **V3/V4**, Playwright viewport mobile 390×844 / desktop 1440×900.

1. **Mobile collapsed** — `docs/exports/screenshots/signalboard_mobile_compact_collapsed_2026-08-09.png`  
   Filter + rows compact (chip trạng thái, L/S scores, tip `↑ L`/`↓ S`, chevron ▼).

2. **Mobile expand** — `docs/exports/screenshots/signalboard_mobile_compact_expand_2026-08-09.png`  
   Row BTC mở: Phiên / BTC meta + LONG/SHORT dưới row; row khác thu gọn.

3. **Desktop card grid** — `docs/exports/screenshots/signalboard_desktop_card_grid_2026-08-09.png`  
   5 card BTC·NEAR·SOL·BNB·XRP — layout card không đổi.

> Số “Sẵn sàng (N)” có thể khác giữa 2 shot mobile vì scan live giữa 2 lần capture.

---

## Việc chưa làm (theo confirm `ui_only`)

- **Task 5:** wire ETH/LINK/AVAX vào `TRADE_SYMBOLS` + whale / `PRICE_DECIMALS` / `vi.symbols` / SymbolPicker / audit brands / (tuỳ chọn) `WHALE_RADAR_SYMBOLS`.
- Build web / APK.

---

## Cách tái chụp screenshot

```bash
npm run start:web
# terminal khác:
node scripts/screenshot-signalboard-compact.mjs
```
