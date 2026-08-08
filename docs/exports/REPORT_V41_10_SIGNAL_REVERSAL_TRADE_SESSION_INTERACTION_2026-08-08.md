# Task V41-10 — Signal Reversal & Trade Session Interaction (Report Only)

**Ngày:** 2026-08-08  
**Phạm vi:** Điều tra thuần túy — **không sửa code**  
**Bối cảnh:** Follow-up V41-8 / V41-9 — khi xuất hiện setup breakout **ngược hướng** so với setup đang active.

---

## Trạng thái

**DONE (report-only).** Không có phần “Đã sửa”.

---

## Câu hỏi A — Card tín hiệu khi có setup ngược hướng

### A1. `scanBreakoutSetups` — tất cả hướng hay một hướng?

**Quét và emit mọi setup confirmed trên lịch sử 1H (cả LONG và SHORT), độc lập, không deconflict hướng.**

Comment trong code: *“independent signals, no deconflict.”*

Luồng:

1. Walk từng bar → `detectBreakoutAtIndex` gán `side` theo close phá cạnh Donchian (`> rangeHigh` → LONG, `< rangeLow` → SHORT).
2. Confirm (retest/immediate) thành công → `out.push(setup)`.
3. Không lọc “chỉ giữ một hướng”.

```146:161:services/v41/breakoutDetector.ts
  const candle = klines1H[breakoutIndex]!;
  let side: BreakoutSide | null = null;
  if (candle.close > range.rangeHigh) side = 'LONG';
  else if (candle.close < range.rangeLow) side = 'SHORT';
  if (!side) return null;
```

```518:584:services/v41/breakoutDetector.ts
 * Walk 1H series; emit confirmed setups (independent signals, no deconflict).
 */
export function scanBreakoutSetups(...): BreakoutTradeLevels[] {
  ...
    if (setup) out.push(setup);
  }
  return out;
}
```

→ Nội bộ có thể có **nhiều** phần tử LONG + SHORT trong cùng mảng `setups`.

### A2. `pickCurrentBreakoutSetup` — SHORT cũ vs LONG mới (cùng trong 80h)?

**Ưu tiên `activeOpenTime` mới nhất, bất kể hướng.** Không có logic “giữ hướng cũ đến khi hết hạn”.

```176:194:services/v41/rc3/buildRc3ViewModel.ts
export function pickCurrentBreakoutSetup(
  setups: BreakoutTradeLevels[],
  klines1H: KlineV41[],
): BreakoutTradeLevels | null {
  ...
  let best: BreakoutTradeLevels | null = null;
  for (const setup of setups) {
    if (setup.activeOpenTime > lastOpen) continue;
    const age = lastOpen - setup.activeOpenTime;
    if (age < 0 || age > maxAgeMs) continue;
    if (best == null || setup.activeOpenTime > best.activeOpenTime) {
      best = setup;
    }
  }
  return best;
}
```

Comment cùng file: trong các setup còn fresh trong **80×1H**, lấy `activeOpenTime` mới nhất (*retest vừa xác nhận gần nhất*).

→ SHORT còn trong 80h + LONG mới hơn cũng trong 80h → **chọn LONG**.

### A3. Card UI có chuyển SHORT → LONG ngay ở scan tiếp theo?

**Có** — mỗi lần build card chỉ map **một** `current` setup sang decision/levels.

```197:210:services/v41/rc3/buildRc3ViewModel.ts
function buildBreakoutRc3Card(row: SignalRowV41): V41Rc3SignalCardModel {
  const klines1H: KlineV41[] = row.klines1H ?? [];
  const setups = scanBreakoutSetups({ ... });
  const current = pickCurrentBreakoutSetup(setups, klines1H);
  return adaptBreakoutToRc3Card(current, row);
}
```

`adaptBreakoutToRc3Card` đặt `decision` theo `levels.side` (LONG/SHORT). Không giữ state card cũ giữa các scan — ViewModel rebuild từ row mới.

→ Scan kế tiếp mà LONG mới thắng pick → card hiển thị **LONG ngay** (Gate Active + levels của LONG). SHORT cũ vẫn có thể còn trong mảng `setups` nội bộ nhưng **không render**.

### A4. Nhiều setup active trong data vs hiển thị?

| Lớp | Thực tế |
|-----|---------|
| **Nội bộ** (`scanBreakoutSetups` return) | Có thể **nhiều** setup (LONG + SHORT) còn sống trong cửa sổ 80h |
| **UI / 1 symbol** | Chỉ **một** “current setup” qua `pickCurrentBreakoutSetup` → `adaptBreakoutToRc3Card` |

Không có mô hình “hai Gate Active LONG+SHORT cùng lúc trên một card”.

---

## Câu hỏi B — Trade Session khi tín hiệu đảo chiều

### B1. Session SHORT Pending/Running khi card đổi sang LONG?

**Không bị tự đóng/huỷ.** Session **độc lập** với card sau khi đã tạo.

Bằng chứng:

1. `buildTradeSessionAdviserPatches` chỉ dựa `session` + `row.markPrice` / snapshot để fill Pending→Running và advise Running — **không** đọc `card.decision`, breakout setups, hay Gate Active.
2. `useV41TradeSessionStore` không subscribe RC3 card; chỉ `endSession` thủ công / paper fill / adviser patch status.
3. Không có hook nào khi `pickCurrentBreakoutSetup` đổi hướng thì gọi `endSession`.

→ Card SHORT→LONG: session SHORT **giữ nguyên** (Pending Waiting Fill hoặc Running + adviser), tồn tại song song với UI card LONG.

### B2. Cho phép 2 session cùng symbol khác hướng?

**Không.** Giới hạn theo **symbol**, không theo hướng.

```128:129:store/useV41TradeSessionStore.ts
  hasActiveSession: (symbol) =>
    get().sessions.some((s) => s.symbol === symbol && isActiveStatus(s.status)),
```

```156:158:store/useV41TradeSessionStore.ts
  createSession: (input) => {
    if (get().hasActiveSession(input.symbol)) {
      return null;
    }
```

UI khóa nút mở lệnh khi symbol đã có Pending/Running:

```44:57:components/v41/V41BoardRC3.tsx
  const lockedSymbols = useMemo(() => {
    const locked = new Set<string>();
    for (const session of sessions) {
      if (session.status === 'Pending' || session.status === 'Running') {
        locked.add(session.symbol);
      }
    }
    return locked;
  }, [sessions]);
  ...
      if (lockedSymbols.has(card.symbol)) return;
      createSession({ ... });
```

→ SHORT vẫn Pending/Running → **không** tạo được LONG cùng NEARUSDT (`createSession` → `null`; nút action disabled qua `lockedSymbols`).

### B3. User phải tự đóng SHORT trước khi LONG?

**Có — thủ công.** Hệ thống **không** auto-close SHORT khi card đảo LONG; cũng **không** swap session.

Muốn lệnh theo setup LONG mới:

1. User **Đóng** (`endSession`) session SHORT (Pending hoặc Running) trong Execution Monitor.  
2. Sau đó mới bấm mở LONG trên card mới (symbol hết lock).

---

## Kết luận — User cần làm gì khi đảo chiều SHORT → LONG

| Thành phần | Hành vi |
|------------|---------|
| **Card tín hiệu** | Tự chuyển sang setup **mới nhất trong 80h** (có thể LONG), bất kể hướng session |
| **Trade Session cũ** | **Không** đổi theo card; vẫn Pending/Running SHORT |
| **Tạo session LONG mới** | **Bị chặn** khi symbol còn session active |
| **Việc user phải làm** | **Đóng tay** session SHORT → rồi mới mở LONG theo card mới (nếu muốn theo tín hiệu mới) |

Hai hệ thống sau khi tạo session: **tách biệt** — (A) rebuild card từ klines/setup, (B) paper trade session theo mark + adviser.

---

## Việc còn lại (ngoài scope)

- (Product, nếu muốn) Cảnh báo “card đảo chiều nhưng còn session ngược hướng”.  
- (Product) Auto-cancel Pending khi setup hướng khác thắng pick — **chưa có**.

---

## Task ID

**V41-10** (Signal Reversal & Trade Session Interaction — Report Only).
