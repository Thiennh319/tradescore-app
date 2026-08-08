# Task V41-8 — Gate Active Conditions Investigation (Report Only)

**Ngày:** 2026-08-07  
**Phạm vi:** Điều tra thuần túy — **không sửa code**  
**Bối cảnh UI:** NEAR SHORT — Gate Active, 4 điều kiện ✓ (Consolidation / Breakout / Retest Confirm / Momentum Aligned), Confidence TR `—/0`, Trigger = Breakout Confirmed, Entry ~1.67 / Stop ~1.69 / TP1 ~1.63  

---

## Trạng thái

**DONE** — điều tra xong. Không có phần “Đã sửa”.

---

## Kết luận ngắn

1. Bốn ✓ trên card NEAR **không** là 4 cờ live độc lập. Khi còn Confirm B setup hiện tại (`breakoutLevels != null`), UI **gắn hết cả 4 = `passed`**.
2. **Momentum Aligned** dùng **cùng hàm** `computeMomentum1H` (Rulebook Rule 21 / `momentumEngine1H.ts`), nhưng đánh giá tại **nến retest**; Rule 21 đọc **momentum tại bar scan hiện tại** → **không mâu thuẫn engine**, khác cửa sổ thời gian.
3. Replay klines Binance 1H tại thời điểm điều tra: Gate vẫn Active; levels khớp UI sau `toFixed(2)`; momentum **now** = 0/0 trong khi momentum **tại retest** short confirmed.

---

## 1. Nguồn dữ liệu từng điều kiện

| Lớp | Vai trò |
|-----|---------|
| UI | `components/v41/V41SignalCard.tsx` — render `card.checklist` / Gate Active |
| Wire NEAR | `buildRc3ViewModelFromRow` → `buildBreakoutRc3Card` khi `resolveSymbolStrategy(symbol) === 'breakout'` (`NEARUSDT`) |
| Checklist labels | `services/v41/strategy/adaptBreakoutToRc3Card.ts` — **all-or-nothing** |

### Bằng chứng checklist all-or-nothing

```ts
// adaptBreakoutToRc3Card.ts
function buildBreakoutChecklist(allPassed: boolean): V41ChecklistItem[] {
  return BREAKOUT_CHECKLIST_IDS.map((id) => ({
    id,
    label: BREAKOUT_CHECKLIST_LABELS[id],
    passed: allPassed,
  }));
}

const active = breakoutLevels != null;
const checklist = buildBreakoutChecklist(active);
triggerType: active ? 'Breakout Confirmed' : null,
```

Labels:

| id | Label UI |
|----|----------|
| `consolidation` | Consolidation |
| `breakout` | Breakout |
| `retest` | Retest Confirm |
| `momentum` | Momentum Aligned |

### Production params (NEAR Confirm B)

File: `services/v41/rc3/buildRc3ViewModel.ts`

| Hằng số | Giá trị |
|---------|---------|
| `BREAKOUT_LOOKBACK_N` | 20 |
| `BREAKOUT_MAX_WIDTH_PCT` | 5 |
| `BREAKOUT_ATR_MULT` | 1.0 |
| `BREAKOUT_SIGNAL_MAX_AGE_BARS_1H` | 80 |
| `confirmMode` | `'retest'` |
| `consolidationMode` | `'width'` |
| `slMode` | `'atr_break_level'` |
| `requireStrongBreakout` | `false` |

Wire:

```ts
const setups = scanBreakoutSetups({
  klines1H,
  lookbackN: BREAKOUT_LOOKBACK_N,
  consolidationMode: 'width',
  maxWidthPct: BREAKOUT_MAX_WIDTH_PCT,
  confirmMode: 'retest',
  slMode: 'atr_break_level',
  atrMult: BREAKOUT_ATR_MULT,
  requireStrongBreakout: false,
});
const current = pickCurrentBreakoutSetup(setups, klines1H);
return adaptBreakoutToRc3Card(current, row);
```

### Từng điều kiện — logic tính thật lúc **tạo** setup

| Điều kiện (UI) | Hàm / file | Ngưỡng / nguồn |
|----------------|------------|----------------|
| **Consolidation** | `consolidationConfirmedAtBreakout` (`breakoutDetector.ts`), mode `'width'` | Donchian N=20 **trước** nến breakout: `widthPct < 5` với `widthPct = ((rangeHigh − rangeLow) / rangeLow) * 100` |
| **Breakout** | `detectBreakoutAtIndex` | Close **dưới** `rangeLow` → SHORT; **trên** `rangeHigh` → LONG |
| **Retest Confirm** | `tryRetestBreakoutSetup` → `findRetestBarIndex` | Chạm biên đã phá trong ≤ **`BREAKOUT_RETEST_MAX_BARS` (10)** nến; band ± **`BREAKOUT_RETEST_BAND_PCT` (0.5%)**; entry = close nến retest |
| **Momentum Aligned** | `momentumAligned` trong `tryRetestBreakoutSetup` | `computeMomentum1H(klines1H.slice(0, retestIdx + 1))`; SHORT cần `momentumConfirmedShort` (score ≥ **2**/2: `SELL_VOLUME_SPIKE_1H` volume &gt; 1.5× MA20 + bearish close, và/hoặc `CVD_FALLING_1H` 3 bar CVD &lt; 0) |

```ts
// breakoutDetector.ts
function momentumAligned(side: BreakoutSide, momentum: MomentumResult): boolean {
  return side === 'LONG'
    ? momentum.momentumConfirmedLong
    : momentum.momentumConfirmedShort;
}
```

```ts
// momentumEngine1H.ts
momentumConfirmedLong: momentumLong >= 2,
momentumConfirmedShort: momentumShort >= 2,
```

---

## 2. Momentum Aligned (UI) vs Rule 21 `momentum_confirmed`

| | Gate **Momentum Aligned** | Rulebook **`momentum_confirmed`** (Rule 21) |
|--|---------------------------|---------------------------------------------|
| Hàm | `computeMomentum1H` | Cùng `computeMomentum1H` → `row.momentum` / fallback `opportunity` |
| Thời điểm | Tại **nến retest** Confirm B | Tại **bar cuối** `klines1H` lúc scan/export |
| Vai trò trên NEAR | Điều kiện tạo Confirm B | Vẫn emit trong export breakout (`buildMomentumRule(row)`), stage opportunity / entry ready — **không** map checklist RC3 breakout |
| Nguồn Module (rulebook) | (qua `breakoutDetector`) | `services/v41/momentumEngine1H.ts` |

**Verdict:** Cùng nguồn hàm; **không phải 2 khái niệm engine khác**. Khác **cửa sổ thời gian / ngữ cảnh dùng**. Rule 21 FAIL `LONG(0)/SHORT(0)` **now** trong khi UI ✓ là **expected** nếu tại retest short đã confirmed.

Breakout rulebook vẫn có `buildBreakoutStrategyRules` (`breakout_confirmed_active`, levels, …) **và** vẫn gọi `buildMomentumRule(row)` — Rule 21 trên NEAR mô tả momentum **scan hiện tại**, không phải badge “Momentum Aligned” trên card.

---

## 3. Xác nhận 4 điều kiện với dữ liệu mới nhất (lúc điều tra)

**Nguồn:** Binance Futures `NEARUSDT` interval `1h`, limit 200 — replay đúng params RC3.  
**Proxy mark:** last closed/forming 1H close (không đợi user).

| Mục | Kết quả |
|-----|---------|
| Setups trong cửa sổ | **1** SHORT |
| Levels | Entry **1.665** → UI `1.67`; SL **~1.6859** → `1.69`; TP1 **~1.6336** → `1.63` (`formatNum` … `toFixed(2)`) |
| Breakout open | `2026-08-06T16:00:00.000Z` |
| Retest / active open | `2026-08-06T17:00:00.000Z` |
| Age | **19** giờ 1H / cửa sổ **80** |
| Donchian width (locked trong setup) | **~3.65%** &lt; 5% |
| Momentum **tại retest** | short **2** (`SELL_VOLUME_SPIKE_1H` + `CVD_FALLING_1H`) → `momentumConfirmedShort = true` |
| Momentum **now** (kiểu Rule 21) | long **0** / short **0** — confirmed **false** |
| Checklist / Gate | cả **4 ✓**, `activeEligible: true`, Trigger `Breakout Confirmed`, Decision `SHORT` |
| Last close | **~1.645** |

→ **Theo logic + data mới nhất: Gate Active + 4 ✓ vẫn đúng** (setup còn fresh). Không phải UI treo sai; chỉ **momentum live đã không còn confirmed**.

---

## 4. Điều kiện chấm dứt từng mục (ngưỡng từ code)

**Quan trọng:** Card **không** flip từng ✓/✗ độc lập. Cả 4 chỉ chuyển ✗ khi `pickCurrentBreakoutSetup` → `null` → `adaptBreakoutToRc3Card(null, …)` → `allPassed = false`.

| Mục | Khi **không tạo setup mới** | Khi **Gate Active hiện tại mất** |
|-----|-----------------------------|----------------------------------|
| Consolidation | `widthPct >= 5` trên Donchian N=20 trước breakout | Width đã khóa trên sự kiện lịch sử; **không** tắt vì range sau đó nới rộng |
| Breakout | Không có close phá biên Donchian | Sự kiện đã detect **không** “un-break”; giá quay vào range **không** clear checklist |
| Retest Confirm | Không chạm biên trong ≤10 nến sau breakout (±0.5%) | Retest đã xảy ra thì giữ; hết Gate chủ yếu vì **tuổi tín hiệu** |
| Momentum Aligned | Tại bar retest: không đủ ≥2 tín hiệu cùng phía | **Không** re-check mỗi scan; live momentum = 0 **không** tắt Gate |

### Chấm dứt Gate Active (rõ từ code)

`pickCurrentBreakoutSetup` (`buildRc3ViewModel.ts`):

- Chỉ giữ setup có `activeOpenTime ≤ lastOpen` và  
  `age = lastOpen − activeOpenTime ≤ 80 × 3_600_000` ms  
- Trong các setup còn fresh: lấy `activeOpenTime` **mới nhất**

→ Mất Active khi **age &gt; 80 giờ 1H** kể từ `activeOpenTime` (và không còn setup fresh khác).

Giá chạm Stop/TP thuộc **execution / session** — **không** được wire để flip checklist Gate trong code hiện tại.

---

## 5. Ước lượng khoảng cách (NEAR SHORT tại thời điểm probe)

| Metric | Giá trị (tính từ code + klines) |
|--------|----------------------------------|
| Còn trong cửa sổ Gate | **~61 giờ 1H** (80 − 19) tới khi age hết |
| Mark (last 1H close) | **~1.645** |
| Stop setup | **~1.6859** |
| Khoảng tới Stop | **~+0.041** (~**+2.49%**) — Stop vẫn trên giá; đây là R lệnh, **không** phải ngưỡng tắt Gate |
| Momentum live | Đã **không** aligned — Gate vẫn Active |

---

## Sơ đồ quan hệ (tóm tắt)

```text
scanV41 row (NEAR)
  → buildBreakoutRc3Card
       scanBreakoutSetups (history walk)
         consolidation? → breakout event? → retest ≤10 bars? → momentumAligned @ retest bar?
       → pickCurrentBreakoutSetup (age ≤ 80×1H)
       → adaptBreakoutToRc3Card
            levels != null  ⇒  cả 4 checklist ✓ + Gate Active + "Breakout Confirmed"
            levels == null  ⇒  cả 4 ✗

Rulebook NEAR:
  breakout_* rules  ⇐ Confirm B / levels (đúng gate product)
  momentum_confirmed (Rule 21)  ⇐ row.momentum @ NOW  (cùng hàm, khác thời điểm)
```

---

## Không có phần “Đã sửa”

Task **V41-8** — chỉ điều tra / báo cáo.
