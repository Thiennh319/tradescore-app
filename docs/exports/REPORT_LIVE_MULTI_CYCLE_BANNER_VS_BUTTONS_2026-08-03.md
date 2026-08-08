# LIVE MULTI-CYCLE — Banner vs nút + 2 mốc “Cập nhật lúc” (2026-08-03)

**Chế độ:** chỉ điều tra — không sửa production source  
**Scan method:** 4 chu kỳ `scanAllSignalRows('1h', PSYCH_PASS_all_true, …)` cách nhau **60s**, giữ ambiguity maps giữa các cycle (giống app).  
**Khung thời gian đo:** `2026-08-03T13:50:17Z` → `13:53:44Z` (ICT ~20:50–20:53)

---

## 1. Hai mốc “Cập nhật lúc” — nguồn đo từ code (không phải cùng timestamp)

| UI | Component | State / prop | Ý nghĩa |
|----|-----------|--------------|---------|
| Header góc phải: `Cập nhật lúc HH:mm` | `SyncStatusBadge` trong `HeaderBar` | `syncState.lastSyncTime` (Drive/GitHub sync) | Lần **đồng bộ Drive** gần nhất — format **chỉ giờ:phút** (`formatSyncTime`, Asia/Ho_Chi_Minh) |
| Trên bảng tín hiệu: `Cập nhật lúc HH:mm:ss · tự quét mỗi 60s` | `SignalBoard` | `lastScannedAt` từ `useSignalBoard` / `signalBoard.lastScannedAt` | Lần **scan tín hiệu** xong — `toLocaleTimeString('vi-VN')` có **giây** |

**Kết luận đo từ wiring:** **hai nguồn độc lập**.  
- Header **không** đọc `lastScannedAt`.  
- Bảng tín hiệu **không** đọc `syncState.lastSyncTime`.  
→ Lệch ~2 phút (vd. header 20:39 vs board 20:37:13) là **có thể** khi Drive sync và scan cách nhau; **không** chứng minh race card/banner.

Trigger update:

| Nguồn | Cập nhật khi |
|-------|----------------|
| `lastScannedAt` | Kết thúc `scan()` trong `useSignalBoard` (`setLastScannedAt(Date.now())`) — interval `SCAN_INTERVAL_MS` / force scan |
| `syncState.lastSyncTime` | Sau thao tác sync Drive (prop `syncState` từ `App.tsx`) — **không** gắn interval 60s scan |

---

## 2. Banner “🔥 X cặp đủ điểm vào lệnh” — nguồn

**Cùng snapshot `rows` render card** — không aggregator scan riêng.

```ts
// SignalBoard.tsx
const entryRows = rows
  .map((row) => ({ row, snap: resolveSignalRow(row, scorerVersion) }))
  .filter(({ row, snap }) => snap.canEnter && !row.error);

// banner text từ entryRows → vi.signalBoard.alert(n, list)
```

| Câu hỏi | Trả lời đo được |
|---------|-----------------|
| Banner build từ snapshot nào? | Cùng prop `rows` với `SignalCard` trong cùng render |
| Có đọc `groupBlocks` / `planBlockReasons`? | **Không** — chỉ `snap.canEnter` |
| `snap.canEnter` từ đâu? | `canEnterV4(active)` lúc scan (hard/group/decision scoring) — **không** gồm `plan.blockReasons` |
| Banner vs nút lệch nguồn? | **Có.** Banner = `snap.canEnter`. Nút = U1 + `isDirectionReady` → `hasAnyHardBlock` gồm `planBlockReasons` (và `hardBlocked`/group/ADX) |

Cùng `rows` → **không** phải banner t-1 / card t trong một frame React. Lệch UI (banner ON, nút OFF) xảy ra **trong cùng snapshot** khi `snap.canEnter===true` nhưng `planBlockReasons`/`hasAnyHardBlock` tắt nút.

---

## 3–4. Bảng theo chu kỳ (SOL / BNB focus)

Banner mỗi cycle (đo được): luôn gồm `BTC SHORT · SOL SHORT · BNB LONG` (count=3). NEAR không vào banner (`snap.canEnter=false`).

### SOL SHORT

| Cycle | scannedAt (UTC) | score SHORT | snap.canEnter (banner) | groupBlocks | planBlockReasons | hasAnyHardBlock | isDirectionReady SHORT | shortBtn | Banner∋SOL | mismatch |
|------:|-----------------|------------:|:----------------------:|:-----------:|------------------|:---------------:|:----------------------:|:--------:|:----------:|----------|
| 1 | 13:50:17Z | 10.73 | true | [] | [] | false | **true** | **ON** | yes | ALIGNED |
| 2 | 13:51:26Z | 10.73 | true | [] | [] | false | **true** | **ON** | yes | ALIGNED |
| 3 | 13:52:35Z | 10.31 | true | [] | **`R:R thực 1.55:1 sau Structure SL < 2:1`** | **true** | **false** | **OFF** | yes | **BANNER_ON_BUTTON_OFF** |
| 4 | 13:53:44Z | 10.31 | true | [] | [] | false | **true** | **ON** | yes | ALIGNED |

**SOL mờ↔sáng:** giữa cycle 2→3→4, **`planBlockReasons` đổi thật** (xuất hiện rồi mất). `snap.canEnter` giữ `true` mọi cycle → banner luôn liệt kê SOL.  
**Không** phải UI render hai snapshot khác nhau trong cùng cycle; là **source plan gate dao động** giữa các lần scan.

Checklist cause (khi nút OFF, cycle 3):

- [ ] adxGate.block  
- [ ] hardBlocks  
- [ ] groupBlocks  
- [x] **planBlockReasons**  
- [ ] ambiguity  

### BNB LONG

| Cycle | scannedAt (UTC) | score LONG | snap.canEnter | groupBlocks | planBlockReasons | hasAnyHardBlock | isDirectionReady LONG | longBtn | Banner∋BNB | mismatch |
|------:|-----------------|-----------:|:-------------:|:-----------:|------------------|:---------------:|:---------------------:|:-------:|:----------:|----------|
| 1 | 13:50:17Z | 10.63 | true | [] | **`R:R 1.67:1 < 2:1`** | true | false | OFF | yes | BANNER_ON_BUTTON_OFF |
| 2 | 13:51:26Z | 10.63 | true | [] | **`R:R 1.67:1 < 2:1`** | true | false | OFF | yes | BANNER_ON_BUTTON_OFF |
| 3 | 13:52:35Z | 11.04 | true | [] | **`R:R 1.67:1 < 2:1`** | true | false | OFF | yes | BANNER_ON_BUTTON_OFF |
| 4 | 13:53:44Z | 11.04 | true | [] | **`R:R 1.67:1 < 2:1`** | true | false | OFF | yes | BANNER_ON_BUTTON_OFF |

**BNB ổn định** qua 4 cycle: luôn banner ON + nút OFF vì **`planBlockReasons` R:R** (không phải groupBlocks; không ambiguity trong 4 cycle này).

### BTC / NEAR (ngắn)

| Cycle | BTC mismatch | BTC shortBtn | NEAR snap.canEnter | NEAR cause (ổn định) |
|------:|--------------|--------------|--------------------|----------------------|
| 1–2 | ALIGNED | ON | false | groupBlocks Nhóm A (+ plan R:R lúc cycle 1–2) |
| 3–4 | BTC cũng **BANNER_ON_BUTTON_OFF** (xuất hiện planBlockReasons trên BTC) | OFF | false | groupBlocks Nhóm A (plan đôi khi rỗng) |

(Chi tiết BTC cycle 3–4: `planBlockReasons` non-empty → cùng class lệch banner/`snap.canEnter` vs nút.)

---

## Kết luận đo được

1. **Hai “Cập nhật lúc”** = Drive sync (`SyncStatusBadge`) vs scan board (`lastScannedAt`) — **tách nguồn**.  
2. **Banner** = filter `snap.canEnter` trên **cùng** `rows` với card; **bỏ qua** `planBlockReasons`/`groupBlocks` (group đã nằm trong `canEnter` scoring nếu có).  
3. **BNB luôn mờ + banner vẫn nêu** = `BANNER_ON_BUTTON_OFF` ổn định do **`planBlockReasons` (R:R &lt; 2:1)** trong khi `snap.canEnter===true`.  
4. **SOL lúc mờ lúc sáng** = **`planBlockReasons` bật/tắt giữa cycle** (đo được cycle 3 có, 1/2/4 không); banner vẫn ON vì `canEnter` không đổi. Không cần race banner≠card snapshot trong một render.

---

## Method

- Temp script chạy 4×60s rồi xóa (`_tmp_multi_cycle_banner_card.mts`).  
- Psych checklist all-true (PASS L10), ambiguity map stateful giữa cycle.
