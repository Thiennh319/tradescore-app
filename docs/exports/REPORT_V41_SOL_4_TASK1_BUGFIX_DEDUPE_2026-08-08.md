# V41-SOL-4 Task 1 — Duplicate Confirm-B signal counting (SOL)

**Status:** Done (cluster-window verify only; **no** full 365d re-run / param sweep).  
**Choice:** **(b) theo swing / level ID** (Not a/c).

---

## 1. Nguyên nhân bug

`scanBreakoutSetups` walk mỗi bar 1H, emit mọi Confirm-B (`confirmMode: 'retest'`) độc lập. Comment cũ: independent signals, **no deconflict**.

Trên SOL Confirm-B, một breakdown thật thường tạo **chuỗi cascade**: bar confirm giờ `t` trở thành breakout candle của setup giờ `t+1` (`breakoutOpenTime[n+1] === activeOpenTime[n]`), cửa sổ Donchian trượt → `rangeLow` / `rangeHigh` lệch nhẹ, entry thấp dần — nhưng vẫn cùng một sự kiện thị trường.

Bằng chứng CSV `docs/exports/v41-sol-breakout-365d-quarterly-trades.csv` (SOL-3): cụm 2026-02-22 SHORT×3 (13:00 / 14:00 / 15:00), `breakout_open_time` nối tiếp đúng pattern cascade.

**Chỗ code (trước fix):** `services/v41/breakoutDetector.ts` — vòng `for` trong `scanBreakoutSetups` push mọi `setup` rồi `return out` không lọc cùng level.

**Nơi tiêu thụ:**
- Live RC3: `buildBreakoutRc3Card` → `scanBreakoutSetups` → `pickCurrentBreakoutSetup` (newest trong 80h) — UI có thể “nhảy” giữa các bản trùng.
- Backtest SOL-3: `scripts/backtest-v41-sol-breakout-365d-quarterly.ts` map **mọi** setup → trade → đếm trùng phình WR / E[R].

---

## 2. Cách đã fix — **(b) Level ID**

**Vì sao (b):** khớp kiến trúc breakout (mỗi setup đã mang `rangeHigh` / `rangeLow` của cạnh Donchian bị phá). Cooldown theo side (a) quá rộng (chặn setup level khác cùng hướng). ATR spacing (c) là heuristic giá, không gắn identity level.

**Cơ chế:**
1. Opt-in `dedupeByBrokenLevel` trên `ScanBreakoutParams` (default `false` → script research cũ không đổi hành vi trừ khi bật).
2. `dedupeBreakoutSetupsByBrokenLevel`: giữ setup **sớm nhất** theo `activeOpenTime` cho mỗi “level event” trong cửa sổ `maxHoldBarsForLevelDedupe` (80 × 1H = production max-age).
3. **Level ID** = khớp cạnh bị phá trong ±`BREAKOUT_RETEST_BAND_PCT` (0.5%), **hoặc** lineage cascade (`breakoutOpenTime` thuộc tập openTime của event đã chiếm — cần vì cửa sổ trượt làm level lệch >0.5% trên cụm thật).

**Wire on:**
- `buildBreakoutRc3Card` — production Confirm-B card  
- `scripts/backtest-v41-sol-breakout-365d-quarterly.ts` — sẵn cho Task 2 (chưa re-run full 365d ở Task 1)

### Diff chính (`services/v41/breakoutDetector.ts`)

```ts
// ScanBreakoutParams (+dedupeByBrokenLevel, maxHoldBarsForLevelDedupe, levelTolerancePct)

export function brokenLevelPrice(setup: BreakoutTradeLevels): number {
  return setup.side === 'LONG' ? setup.rangeHigh : setup.rangeLow;
}

export function sameBrokenLevelId(a, b, tolerancePct): boolean { /* price OR cascade times */ }

export function dedupeBreakoutSetupsByBrokenLevel(setups, opts): BreakoutTradeLevels[] {
  // sort by activeOpenTime; keep first per lineage while age < maxHoldBars1H
}

// scanBreakoutSetups tail:
if (!dedupeByBrokenLevel) return out;
return dedupeBreakoutSetupsByBrokenLevel(out, { levelTolerancePct, maxHoldBars1H: maxHoldBarsForLevelDedupe });
```

`buildBreakoutRc3Card` / SOL-3 script: `dedupeByBrokenLevel: true`, `maxHoldBarsForLevelDedupe: 80`.

---

## 3. Kết quả test trên 5 cửa sổ cụm

Nguồn trước fix: CSV SOL-3.  
Sau fix: giữ **lệnh đầu** mỗi cụm (đúng semantics dedupe) → `n=1`, `net_r` = net_r lệnh đầu.

| Cụm | Side | Trước (n, Σ net_r) | Sau (n, net_r) |
|-----|------|--------------------|----------------|
| 2025-12-29 00:00–01:00 | LONG | 2, **−2.143** | 1, **−1.085** |
| 2026-01-20 07:00–08:00 | SHORT | 2, **+2.838** | 1, **+1.416** |
| 2026-02-22 13:00–15:00 | SHORT | 3, **+4.057** | 1, **+1.376** |
| 2026-03-06 13:00–14:00 | SHORT | 2, **+2.882** | 1, **+1.440** |
| 2026-07-05 01:00–02:00 | SHORT | 2, **−2.241** | 1, **−1.136** |
| **Tổng 5 cụm** | | **11 lệnh, Σ ≈ +5.393** | **5 lệnh, Σ ≈ +2.011** |

Unit test (fixture cascade giống CSV, level cố ý drift >0.5%):

```text
npx vitest run services/v41/__tests__/breakoutDetector.test.ts
→ 17 passed (gồm describe dedupeBreakoutSetupsByBrokenLevel / 5 clusters)
```

---

## 4. Đường dẫn code đã sửa

| File | Vai trò |
|------|---------|
| `services/v41/breakoutDetector.ts` | Dedupe level-ID + cascade lineage; hook trong `scanBreakoutSetups` |
| `services/v41/rc3/buildRc3ViewModel.ts` | Bật dedupe trong `buildBreakoutRc3Card` |
| `scripts/backtest-v41-sol-breakout-365d-quarterly.ts` | Bật dedupe cho backtest SOL Confirm-B |
| `services/v41/__tests__/breakoutDetector.test.ts` | Unit test 5 cụm + cascade + negative cases |

**Evidence CSV (không sửa):** `docs/exports/v41-sol-breakout-365d-quarterly-trades.csv`

---

## 5. Ranh giới Task 1

- **Không** re-run full 365d SOL breakout.  
- **Không** sweep param.  
→ Task 2/3.

---

## 5b. Semantics cửa sổ dedupe (Task 1b)

### Trả lời: Task 1 ban đầu là **(A)** → đã sửa thành **(B)**

**Trước 1b (A)** — cửa sổ lịch cố định 80h từ `activeOpenTime` head, không nhìn TP/SL:

```ts
// (legacy) age < maxHoldMs  // maxHoldMs = 80 * 1H
const age = candidate.activeOpenTime - lin.head.activeOpenTime;
if (age < 0 || age >= maxHoldMs) return false;
```

**Sau 1b (B)** — occupancy theo thời điểm đóng mô phỏng của lệnh đại diện:

```ts
occupiedUntilOpenTime = resolveBreakoutExit({ setup: head, klines1H, maxHoldBars1H }).exitOpenTime;
// block chỉ khi:
candidate.activeOpenTime <= occupiedUntilOpenTime  // và ≥ head.activeOpenTime
// (free ngay khi candidate.activeOpenTime > exit)
```

`resolveBreakoutExit` forward-sim cùng logic hit TP/SL/TIMEOUT như backtest.  
`scanBreakoutSetups` luôn truyền `klines1H` vào dedupe → **một pha**, không cần đợi pipeline “simulate sau” (constraint đã nói không chặn (B) vì klines sẵn có lúc scan).  
`maxHoldBarsForLevelDedupe` giờ chỉ là **TIMEOUT ceiling** khi resolve exit, không còn là cửa sổ chặn cố định.

Tests có thể inject `resolveExitOpenTime` (outcome giả định) để fixture không cần full OHLC.

### Diff chính (A→B)

- Thêm `resolveBreakoutExit` / `hitBreakoutLevelsOnBar`
- Lineage lưu `occupiedUntilOpenTime`; bỏ so sánh `age < 80h`
- `dedupeBreakoutSetupsByBrokenLevel` yêu cầu `klines1H` hoặc `resolveExitOpenTime`

### Re-run 5 cụm cũ (không đổi kết quả)

Cascade nằm trong cửa sổ hold thật (CSV `bars_held` 9–56 ≫ khoảng cách 1–2h giữa lệnh trùng) → vẫn **1 lệnh / cụm**:

| Cụm | Sau Task1 / sau 1b |
|-----|--------------------|
| 2025-12-29 LONG | 1, net_r −1.085 |
| 2026-01-20 SHORT | 1, net_r +1.416 |
| 2026-02-22 SHORT | 1, net_r +1.376 |
| 2026-03-06 SHORT | 1, net_r +1.440 |
| 2026-07-05 SHORT | 1, net_r −1.136 |

### Test case mới (độc lập cùng level)

- `keeps 2 independent same-level events when first trade already closed (occupancy B)` — TP sau 10 bar, re-break +40 bar cùng ±0.5% → **giữ 2**
- `still blocks same-level re-entry while first trade is open` → **giữ 1**

```text
npx vitest run services/v41/__tests__/breakoutDetector.test.ts
→ 19 passed (17 cũ + 2 occupancy-B)
```

---

## 5c. Hành vi khi thiếu dữ liệu tương lai (live scan)

### Trả lời: **sai (ngầm)** → đã sửa

**Trước 1c:** khi không tìm thấy TP/SL trong cửa sổ, `resolveBreakoutExit` vẫn trả:

```ts
return {
  outcome: 'TIMEOUT',                          // ← gán sai (chưa đến maxHold)
  barsHeld: endIdx > activeIdx ? … : null,
  exitOpenTime: klines1H[endIdx]!.openTime,  // ← = last bar hiện có
};
```

Trong **một** lần scan live, coincidence này vẫn block hầu hết candidate (`activeOpenTime ≤ last bar`), nhưng semantics sai: coi như đã TIMEOUT/đóng sớm. Dễ hiểu nhầm / regression nếu data hoặc so sánh occupancy đổi.

**Sau 1c:** phân biệt TIMEOUT thật vs series cụt:

```ts
// Reached max-hold bar with no hit → real TIMEOUT
if (endIdx >= maxEndIdx && endIdx > activeIdx) { … TIMEOUT … }

// No exit + series truncated before maxHold (live):
// still open — keep occupied indefinitely until more bars arrive.
return {
  outcome: 'OPEN',
  barsHeld: null,
  exitOpenTime: BREAKOUT_EXIT_OPEN_SENTINEL, // +Infinity
};
```

Dedupe: `candidate.activeOpenTime > +Infinity` không bao giờ true → level **occupied** tới khi có thêm bar và exit thật (TP/SL/TIMEOUT).

### Test mới

`keeps level occupied when klines truncate before exit (live / no future data)` — series chỉ 3 bar sau active, SL/TP xa → `outcome='OPEN'`, candidate cùng level vẫn bị chặn (giữ 1).

```text
npx vitest run services/v41/__tests__/breakoutDetector.test.ts
→ 20 passed (19 + 1 live-truncation)
```
