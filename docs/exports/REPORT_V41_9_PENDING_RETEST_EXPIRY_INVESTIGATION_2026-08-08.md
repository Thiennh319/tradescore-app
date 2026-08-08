# Task V41-9 — Pending Order Retest Logic & Expiry Investigation (Report Only)

**Ngày:** 2026-08-08  
**Phạm vi:** Điều tra thuần túy — **không sửa code**  
**Bối cảnh user:** V4.1 NEAR SHORT Trade Session Pending · Entry **1.6650** · Stop **1.6859** · TP1 **1.6336** · Waiting Fill · giá từng ~**1.668** rồi xuống ~**1.5950**

---

## Trạng thái

**DONE (report-only).** Không có phần “Đã sửa”.

---

## Câu hỏi 1 — Vì sao không khớp dù giá chạm ~1.668

### 1.1 Retest confirm dùng gì: CLOSE hay HIGH/LOW?

**Dùng HIGH/LOW của nến 1H (giao cắt band), không dùng CLOSE để xác nhận “đã retest”.**

`findRetestBarIndex` gọi `barTouchesLevel`:

```192:215:services/v41/breakoutDetector.ts
/** Bar intersects [level*(1-band), level*(1+band)]. */
export function barTouchesLevel(
  bar: KlineV41,
  level: number,
  bandPct: number = BREAKOUT_RETEST_BAND_PCT,
): boolean {
  if (!(level > 0) || !Number.isFinite(level)) return false;
  const lo = level * (1 - bandPct);
  const hi = level * (1 + bandPct);
  return bar.low <= hi && bar.high >= lo;
}

export function findRetestBarIndex(
  klines1H: KlineV41[],
  event: BreakoutEvent,
  maxBars: number = BREAKOUT_RETEST_MAX_BARS,
  bandPct: number = BREAKOUT_RETEST_BAND_PCT,
): number | null {
  const level = event.side === 'LONG' ? event.rangeHigh : event.rangeLow;
  const last = Math.min(klines1H.length - 1, event.breakoutIndex + maxBars);
  for (let i = event.breakoutIndex + 1; i <= last; i++) {
    if (barTouchesLevel(klines1H[i]!, level, bandPct)) return i;
  }
  return null;
}
```

- Band: `BREAKOUT_RETEST_BAND_PCT = 0.005` (±**0.5%**) quanh biên breakout (`rangeHigh` LONG / `rangeLow` SHORT).
- Điều kiện touch: `low ≤ hi_band` **và** `high ≥ lo_band` → **bấc (wick) được tính**.
- `CLOSE` chỉ dùng **sau** khi đã tìm được nến retest: làm **giá Entry** của setup (`entry: active.close`), kèm momentum tại nến đó:

```487:500:services/v41/breakoutDetector.ts
  const active = klines1H[retestIdx]!;
  return buildBreakoutLevels({
    side: event.side,
    entry: active.close,
    ...
    confirmMode: 'retest',
    ...
    activeOpenTime: active.openTime,
```

### 1.2 Giả thuyết “chỉ CLOSE → HIGH 1.668 mà CLOSE không trong band thì không retest” — đúng hay sai?

**Sai đối với bước xác nhận retest.**

- HIGH đã giao cắt band quanh biên → `barTouchesLevel` = **true** dù CLOSE nằm ngoài band / dưới Entry.
- CLOSE không đạt band **không** chặn retest confirm theo code hiện tại.

(CLOSE “không đẹp” chỉ ảnh hưởng **entry số** ghi trên lệnh nếu retest bar đó được chọn — không phải điều kiện touch.)

### 1.3 Klines NEARUSDT 1H thực tế (fetch Binance Futures 2026-08-08)

ENTRY user = **1.6650**. Band ±0.5% quanh 1.665 ≈ **[1.6567, 1.6733]** (minh họa quanh entry; code band là quanh **biên range**, không quanh Entry session).

Các nến từ **2026-08-06 12:00 UTC** trở đi có **HIGH ≥ 1.665** (trích):

| openTime UTC | O | H | L | C | CLOSE ≥ 1.665? |
|--------------|---|---|---|---|----------------|
| 2026-08-06 16:00 | 1.672 | 1.676 | 1.661 | **1.668** | Yes |
| 2026-08-06 17:00 | 1.668 | 1.676 | 1.653 | **1.665** | Yes (edge) |
| 2026-08-06 18:00 | 1.664 | **1.676** | 1.650 | 1.657 | **No** |
| 2026-08-06 19:00 | 1.657 | **1.667** | 1.656 | 1.657 | **No** |
| 2026-08-07 01:00 | 1.662 | **1.668** | 1.655 | 1.662 | **No** |
| 2026-08-07 02:00 | 1.661 | **1.669** | 1.649 | 1.651 | **No** |
| 2026-08-07 10:00 | 1.650 | **1.669** | 1.647 | 1.656 | **No** |

Nến gần đây (~`1.59x`, khớp user TP đã dưới giá): ví dụ `2026-08-07 20:00` … `2026-08-08 03:00` — HIGH quanh **1.59–1.60**, không còn chạm 1.665.

→ Trên chuỗi 1H: **có** nhiều nến HIGH chạm/vượt 1.665–1.669; một phần **CLOSE &lt; 1.665** (đặc biệt cụm “hôm qua” kiểu Aug 7 01–10 UTC).

### 1.4 Điều này liên quan tần suất scan 60s không?

**Hai cơ chế khác nhau — cần tách:**

| Cơ chế | File | Trigger khớp / confirm | Liên quan 60s? |
|--------|------|------------------------|----------------|
| **A. Retest Confirm** (tạo / giữ setup Breakout) | `breakoutDetector.ts` | OHLC nến 1H (`high`/`low` ∩ band) | **Không** theo nghĩa “miss wick vì poll chậm”: nến đã đóng (và nến forming cập nhật H/L) vẫn được xét khi scan đọc klines. |
| **B. Paper fill Trade Session Pending → Running** | `buildTradeSessionAdviser.ts` | So **`markPrice` tại thời điểm scan** với Entry | **Có liên quan 60s** |

Fill Pending (đây mới là “Waiting Fill” của Trade Session):

```165:208:services/v41/rc3/buildTradeSessionAdviser.ts
 * Paper fill giống lệnh chờ limit (Binance): giá phải chạm Entry.
 * LONG: mark <= entry · SHORT: mark >= entry.
...
export function isV41SessionEntryFilled(
  action: 'LONG' | 'SHORT',
  markPrice: number,
  entry: number,
): boolean {
  ...
  return action === 'LONG' ? markPrice <= entry : markPrice >= entry;
}
...
    const filled =
      session.status === 'Pending' &&
      hasMark &&
      isV41SessionEntryFilled(session.action, markPrice as number, session.entry);
```

Caller chỉ chạy **sau khi scan rows đổi** (`useV41TradeSessionAdviser`) — comment: *“Không polling — caller gọi sau scan.”*  
`markPrice` = `liveMarkPrice` (ticker / forming 4H) tại snapshot scan (`scanV41.ts`).

**Với SHORT Entry 1.6650:** cần `markPrice >= 1.6650` **đúng lúc một lần scan** sau khi session đã Pending.

- Nếu spike HIGH 1.668 chỉ là wick intra-bar / giữa hai lần scan, còn mark lúc tick scan đã về &lt; 1.665 → **không fill**.  
- Đây **không** phải vì retest “chỉ dùng close” (retest vốn dùng H/L).  
- Đây **là** hệ quả thiết kế fill theo **điểm sample mark**, không theo HIGH của mọi nến 1H giữa các lần scan.

Nếu giả thuyết user (session đã Pending, giá từng 1.668 rồi tụt): nguyên nhân khớp / không khớp nằm ở **nhánh B**, không phải nhánh A.

*(Không thể khẳng định tuyệt đối app đang mở/scan đúng giờ spike mà không có log session `openedAt` của user; về mặt code + klines: spike wick trên 1H + fill theo mark samples là mô hình khớp hành vi.)*

---

## Câu hỏi 2 — Trade Session Pending có tự hết hạn không?

### 2.1 / 2.2 Có logic auto Expired / Closed / Cancelled theo thời gian?

**Không.** Trong phạm vi đã khảo sát:

| Nơi | Auto-expire Pending theo giờ? |
|-----|-------------------------------|
| `store/useV41TradeSessionStore.ts` | **Không** — tạo `Pending` / `WAITING_FILL`; `endSession` → `Closed` **thủ công**; không có timer |
| `buildTradeSessionAdviser.ts` | Pending giữ Waiting Fill cho đến khi **mark chạm Entry** → `Running`; không nhánh Expired |
| `useV41TradeSessionAdviser.ts` | Chỉ `buildTradeSessionAdviserPatches` khi rows đổi |

`createSession` set cố định Waiting Fill; status active chỉ `'Pending' | 'Running'`; không có `'Expired'` / `'Cancelled'` trong patch adviser.

```156:193:store/useV41TradeSessionStore.ts
  createSession: (input) => {
    ...
      status: 'Pending',
      ...
      advisor: 'Waiting Fill' satisfies V41TradeSessionAdvisor,
      advisorActionCode: 'WAITING_FILL',
      advisorReason: 'Chờ khớp lệnh',
```

```242:254:store/useV41TradeSessionStore.ts
  endSession: (id) => {
    const sessions = get().sessions.map((s) =>
      s.id === id
        ? {
            ...s,
            status: 'Closed' as const,
            advisor: s.advisor === 'Waiting Fill' ? ('Close' as const) : s.advisor,
          }
        : s,
    );
```

### 2.3 Pending tồn tại thế nào?

**Vô thời hạn theo thời gian tường**, cho đến khi:

1. Paper fill: mark thỏa `isV41SessionEntryFilled` → **Running**, hoặc  
2. User **`endSession` / “Đóng”** → **Closed**, hoặc  
3. (Ngoại lệ sync) remote mirror ghi đè — không phải timer local.

Không có ngưỡng giờ trong store/adviser.

### 2.4 Quan hệ với Gate Active 80 giờ (Task V41-8)

**Độc lập.**

- Cửa sổ **80×1H** nằm ở `pickCurrentBreakoutSetup` (`BREAKOUT_SIGNAL_MAX_AGE_BARS_1H = 80`) — chỉ lọc **tín hiệu Gate Active UI / RC3 card**, không gọi `endSession` / không đổi Trade Session.
- Task V41-8 cũng ghi: giá chạm Stop/TP thuộc execution/session — **không** wire để tắt Gate; chiều ngược lại: **Gate hết tuổi không wire để đóng session**.

→ Setup gốc mất Gate Active sau ~80h **không** tự đóng Pending đã tạo.

---

## Kết luận ngắn

1. **Retest confirm = HIGH/LOW ∩ band ±0.5%**, không phải CLOSE-only. Giả thuyết “CLOSE không vào band nên không retest” **sai** với code.  
2. **Waiting Fill khớp lệnh** = so `markPrice` scan với Entry (SHORT: ≥ Entry); **có thể miss wick** nếu sample scan không còn ≥ Entry — **liên quan chu kỳ scan**, không liên quan close-only retest.  
3. Klines: nhiều nến HIGH ≥ 1.665; vài nến “spike 1.668” có **CLOSE &lt; 1.665** (vd Aug 7 01/02 UTC).  
4. **Pending không tự hết hạn**; **Gate 80h độc lập** với Trade Session.

---

## Việc còn lại (ngoài scope — không làm trong task này)

- (Tuỳ chọn product) Fill theo HIGH/LOW nến 1H hoặc poll mark dày hơn nếu muốn paper fill sát limit exchange.  
- (Tuỳ chọn) TTL / auto-cancel Pending gắn tuổi setup hoặc cửa sổ 80h — hiện **chưa có**.

---

## Task ID

**V41-9** (Pending Order Retest Logic & Expiry Investigation — Report Only).
