# V41-XRP-3 — Production wire: XRP vào breakout allow-list

**Ngày wire code (repo):** 2026-08-08  
**Ngày bắt đầu production (đối chiếu live vs backtest):** **TBD — chờ xác nhận deploy**  
**Params:** NEAR default đã validate (XRP-1 / XRP-2) — **không** dùng near-miss sweep (WIDTH=3 / RR=2.5)

> **V41-XRP-3b (2026-08-08):** làm rõ cơ chế bảo vệ thực tế (§8) + sửa ngày production start (không còn giả định 2026-08-09).

---

## 1. Trạng thái allow-list — trước / sau

| | Trước | Sau |
|--|-------|-----|
| `SYMBOLS_USING_BREAKOUT_STRATEGY` | `['NEARUSDT']` | `['NEARUSDT', 'XRPUSDT']` |
| SOLUSDT | **Không** có trong allow-list (chưa từng được thêm — khớp V41-SOL-4) | Vẫn **trend_reversal** — không cần gỡ |
| XRPUSDT | `trend_reversal` (scan/RC3 có symbol, path TR) | **`breakout`** Confirm-B |

**Xác nhận SOL:** grep + test — SOL không nằm trong allow-list trước task; không có diff “remove SOL”.

---

## 2. Params production (SSOT)

File mới: `services/v41/strategy/breakoutProductionParams.ts`

| Param | Value |
|-------|------:|
| LOOKBACK_N | 20 |
| MAX_WIDTH_PCT | 5 |
| ATR_MULT | 1 |
| confirmMode | retest |
| RETEST_MAX_BARS | 10 |
| RETEST_BAND_PCT | 0.005 |
| TP1_RR | 1.5 |
| slMode | atr_break_level |
| requireStrongBreakout | false |
| MAX_HOLD_1H / signal max-age | 80 |
| dedupeByBrokenLevel | **true** |
| maxHoldBarsForLevelDedupe | 80 |

- Live path `buildBreakoutRc3Card` gọi `buildProductionBreakoutScanParams` — **chung** cho NEAR + XRP.  
- **Không** có per-symbol override → XRP **không** kế thừa param research SOL.  
- `dedupeByBrokenLevel=true` trên cùng RC3 production path (không phải script research riêng).

---

## 3. Safeguard giám sát (đã wire trong repo)

File: `services/v41/strategy/xrpBreakoutProductionSafeguard.ts`  
Hook: `store/useV41TradeSessionStore.ts` (`createSession` / `endSession` / adviser Close)

| Safeguard | Hành vi |
|-----------|---------|
| Log riêng XRP breakout | Tag **`[V41-XRP-BREAKOUT]`** OPEN/CLOSE + JSON (side, entry, pnl, streak) |
| Chuỗi thua ≥5 | `console.warn` **+** local notification (§10) — **không** auto tắt / không tự khóa mở lệnh |

> **Không** coi `HARD_BLOCK_RULES.MAX_CONSECUTIVE_LOSSES=3` là lớp bảo vệ thứ hai cho path XRP breakout RC3 — xem §8: path này **không** ghi psychology journal.

---

## 4. Kiểm tra regression

- Tests cập nhật: `resolveSymbolStrategy`, safeguard unit, RC3 regression (BTC/SOL/BNB vẫn TR; XRP checklist breakout), wire batch order (+XRP).  
- Chạy: 4 file / 21 tests — **pass**.

Hard-code “SOL + breakout production”: chỉ còn docs lịch sử SOL-4 (cố ý không allow-list). Code routing: SOL → `trend_reversal`.

---

## 5. Rollout note — rủi ro đã biết (copy từ XRP-1 / XRP-2)

> OOS Q1 vẫn **rất xấu** (E[R] −0.49) dù full-year dương — không ẩn trong report.

Từ XRP-1 OOS table (2024-08-08 → 2025-08-08):

| Slice | n | WR% | E[R] after | Ghi chú |
|-------|--:|----:|-----------:|---------|
| OOS Q1 | 12 | **25.00** | **−0.493** | Rất âm — cần giám sát đoạn đầu live |
| OOS Q2 | **3** | 100 | 1.404 | n=3 gánh ~**36%** R dương OOS — mẫu mỏng |
| OOS H1 | 15 | 40.00 | **−0.113** | Nửa đầu OOS âm |
| OOS FULL | 35 | 51.52 | **+0.175** | Full-year vẫn dương |

XRP-2: **0 combo** pass hết gate cứng IS+OOS+conc+small-n → giữ NEAR default; near-miss E[R] cao chỉ có n mỏng.

**Chưa qua paper trading thật** trước khi wire production.

Nếu live XRP thua lỗ kéo dài (đặc biệt kiểu OOS Q1): đối chiếu từ **ngày production start thật (TBD)**, lọc log `[V41-XRP-BREAKOUT]`, xem ALERT streak ≥5 — và nhớ §8: cảnh báo này **không tự khóa**.

---

## 6. Diff tóm tắt

| File | Thay đổi |
|------|----------|
| `services/v41/strategy/resolveSymbolStrategy.ts` | +`XRPUSDT` allow-list |
| `services/v41/strategy/breakoutProductionParams.ts` | **new** NEAR-default SSOT |
| `services/v41/strategy/xrpBreakoutProductionSafeguard.ts` | **new** log + streak alert |
| `services/v41/rc3/buildRc3ViewModel.ts` | dùng SSOT params (+explicit retest/band/tp1) |
| `store/useV41TradeSessionStore.ts` | hook OPEN/CLOSE safeguard |
| `services/v41/scanV41.ts` | comment Path A off cho NEAR/XRP |
| `services/v41/strategy/__tests__/*` | allow-list + safeguard tests |
| `services/v41/rc3/__tests__/rc3ViewModelRegression.test.ts` | XRP breakout checklist assert |
| `services/v41/__tests__/rc3ViewModelWire.test.ts` | batch order +XRP |

---

## 7. Kết luận

- XRPUSDT breakout Confirm-B **đã** vào allow-list **trong source repo** với NEAR default + dedupe.  
- SOL **không** bị ảnh hưởng (vốn không có trong list).  
- Bảo vệ trên path này: **không auto-lock**; giám sát = `console.warn` + **local notification** khi ≥5 thua (§8 / §10).  
- **Production start (live↔backtest): TBD — chờ xác nhận deploy** (§9). Không deploy trong task 3c.

---

## 8. Xác nhận cơ chế bảo vệ thực tế (V41-XRP-3b)

### Câu hỏi: Lệnh XRP breakout có đi qua psychology journal không?

### **Không.**

Path mở lệnh thật từ RC3 card chỉ gọi `useV41TradeSessionStore.createSession` — **không** gọi `addJournalEntry` / không ghi `tradeJournal`.

UI open:

```54:67:components/v41/V41BoardRC3.tsx
  const openFromCard = useCallback(
    (card: V41Rc3SignalCardModel, action: 'LONG' | 'SHORT') => {
      if (card.decision !== action || card.levels == null) return;
      if (lockedSymbols.has(card.symbol)) return;
      createSession({
        symbol: card.symbol,
        action,
        entry: card.levels.entry,
        stop: card.levels.stop,
        tp: card.levels.tp1,
        tp2: card.levels.tp2,
        tp3: card.levels.tp3,
        triggerType: card.triggerType,
      });
```

Store V41 khai báo tường minh không ghi journal V3/V4:

```1:4:store/useV41TradeSessionStore.ts
/**
 * V4.1 RC3 — Trade Session store.
 * Persist local + sync GitHub Gist (APK master / Web mirror). Không ghi Journal V3/V4.
 */
```

Circuit-breaker 3-loss đọc **journal CLOSED**, không đọc V41 sessions:

```595:632:store/useTradeStore.ts
/** 3 thua liên tiếp trong 24h → cooldown 180 phút kể từ lệnh thua gần nhất. */
export function resolveLossStreakLock(
  journal: StoredTradeJournalEntry[],
  now = new Date(),
): LossStreakLockExtras {
  // ...
  const closed = journal
    .filter((e) => e.status === 'CLOSED')
    .sort((a, b) => (b.closedAt ?? b.entryTime) - (a.closedAt ?? a.entryTime));
  // ...
  const lossStreakLockUntil =
    consecutiveLossesIn24h >= HARD_BLOCK_RULES.MAX_CONSECUTIVE_LOSSES &&
    mostRecentLossClosedAt != null
      ? mostRecentLossClosedAt + lockMs
      : null;
```

(Scan V41 chỉ *đọc* journal để biết đã có OPEN cùng symbol — `resolvePositionState` — không *ghi* session breakout vào đó.)

### Hệ quả (không hiểu nhầm 3 vs 5)

| Cơ chế | Áp dụng cho XRP breakout RC3? |
|--------|-------------------------------|
| `HARD_BLOCK_RULES` 3 thua / khóa ~180 phút | **Không** — vì session không vào psychology journal → không đếm → không khóa mở lệnh V41 |
| Safeguard ≥5 `console.warn` | **Có** — đây là lớp giám sát **duy nhất** đã wire trên path này; **không** auto-block |

Hai con số **3** và **5** **không** phải hai lớp bảo vệ độc lập xếp chồng trên cùng path. Trên path XRP breakout RC3 chỉ còn số **5** (`console.warn`). Số **3** thuộc path journal / Signal Board V3–V4 (và cả ở đó hard-block loss-streak trong scorer còn chỗ đang comment — ngoài phạm vi task, nhưng càng củng cố: đừng tin vào “khóa 3” cho V41 breakout).

### Ai theo dõi log `[V41-XRP-BREAKOUT]`?

**Không có** consumer sẵn: không Telegram/Slack bot; không pipeline forward console → notify. Alert chỉ hiện nếu người vận hành mở DevTools / logcat / terminal WebView.

`presentLocalNotification` / `sendPositionAlert` (position advisor) **đã có** nhưng **chưa** được nối vào `logXrpBreakoutSessionClosed` ALERT.

**Đề xuất (chưa làm trong 3b — chỉ ghi note):** khi `consecutiveLosses >= 5`, gọi `presentLocalNotification` (cùng kênh local notification đã dùng cho session/position alerts) với title kiểu `V41 XRP breakout — 5 losses in a row`, thay vì chỉ `console.warn`. Không cần dựng Telegram nếu app đã hiện push/local notify trên máy người dùng.

---

## 9. Ngày production start thật (V41-XRP-3b)

### **Chưa deploy / chưa xác nhận production đang chạy bản wire XRP.**

Ngày **2026-08-09** trước đó chỉ là giả định “build tiếp theo” — **đã gỡ** khỏi báo cáo để tránh lệch live↔backtest.

Bằng chứng kiểm tra tại thời điểm 3b (2026-08-08, máy repo):

| Check | Kết quả |
|-------|---------|
| `constants/buildInfo.ts` | `version 1.0.8`, `buildDate: **2026-08-02**` — changelog **chưa** nhắc XRP allow-list |
| Web static bundle mới nhất | `TradeScore-web-v1/.../index-*.js` mtime **2026-08-08 ~09:36** — **trước** giờ wire XRP-3 (~17:51) |
| Source allow-list | `resolveSymbolStrategy.ts` đã có `XRPUSDT` (working tree) |
| Commit chứa XRP-3 | Chưa thấy như HEAD production đã ship; thay đổi còn local / uncommitted cùng nhiều WIP |

→ **Production start = `TBD — chờ xác nhận deploy`.**  
Sau khi build/redeploy thật: điền ngày (UTC+7) + bằng chứng (buildDate mới, hash bundle, hoặc log khởi động có `[V41-XRP-BREAKOUT]` / version note).

---

## Task ID

**V41-XRP-3** (+ **3b** clarify) · Allow-list wired in source · Production start **TBD** · Protection on this path = **warn-only**
