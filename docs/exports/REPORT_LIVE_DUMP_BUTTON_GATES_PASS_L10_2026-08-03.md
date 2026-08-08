# LIVE DUMP — Lý do nút LONG/SHORT tắt vs badge SẴN SÀNG (2026-08-03)

**Chế độ:** chỉ điều tra — không sửa code trong repo  
**Nguồn:** `scanAllSignalRows('1h', …)` live Binance  
**Scan A (trước):** `DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST` → L10 hard trên mọi coin (artifact default)  
**Scan B (user chọn):** checklist V2 **all true** (PASS L10) — `2026-08-03T13:34:01.188Z`  
**btcChange24h (B):** `-0.698`

Ghi chú map L10: V2-all-true → V3 `chartStudied=false` luôn (scan không inject V3) → 4/5 → L10 score 1.5 → **không** còn hard `L10 Tâm lý chưa sẵn sàng`.

Logic nút/badge mirror `SignalBoard.tsx` + `signalBoardU1.ts` + `collectHardBlockReasons`.

---

## Kết quả Scan B (PASS L10) — dữ liệu thực

### BTCUSDT — **không** tái hiện “cả 2 nút mờ” tại thời điểm scan

| Field | Giá trị đo được |
|-------|-----------------|
| scores | LONG **5.6** / SHORT **11.35** / Δ **5.75** / officialTotal **11.35** |
| officialDirection | SHORT |
| decisionLabel | `VAO_TU_TIN` |
| isAmbiguousDirection | **false** (message null) |
| adxGate.block | **false** (regime RANGING, WARNING) |
| hardBlocks (official) | `[]` |
| groupBlocks | `[]` |
| planBlockReasons | `[]` |
| snap.canEnter | **true** |
| hasAnyHardBlock | **false** (`adx=false`, `hardBlocked=false`, `blockReasons.length=0`) |
| isDirectionReady LONG | score 5.6 → **false** |
| isDirectionReady SHORT | score 11.35, hasAny=false → **true** |
| U1 longBtn / shortBtn | **false / true** |
| Badge branch | `READY_green(shortCanEnter=true)` |

Checklist tắt nút (cả 2):

- [ ] adxGate.block  
- [ ] hardBlocks  
- [ ] groupBlocks  
- [ ] planBlockReasons  
- [ ] ambiguity  
- [x] **không áp dụng — SHORT đang bật**

---

### NEARUSDT — **tái hiện** SẴN SÀNG + cả 2 nút mờ

| Field | Giá trị đo được |
|-------|-----------------|
| scores | LONG **5.73** / SHORT **9.67** / Δ **3.94** / officialTotal **9.67** |
| officialDirection | SHORT |
| decisionLabel | `KHONG_VAO` |
| isAmbiguousDirection | **false** |
| adxGate.block | **false** |
| hardBlocks | `[]` (long/short đều rỗng) |
| groupBlocks | **`["Nhóm A (Xu hướng) 2.2/5đ < 2.5đ"]`** |
| planBlockReasons | `[]` |
| snap.canEnter | **false** |
| snap.hardBlocked | **true** vì **groupBlocks** (không vì hardBlocks) |
| blockReasons.length | **0** (collectHardBlockReasons không đưa groupBlocks vào list khi đã tách; nhưng `hasAnyHardBlock` vẫn true qua `snap.hardBlocked`) |
| hasAnyHardBlock | **true** |
| isDirectionReady LONG | false (score&lt;9 + hasAny) |
| isDirectionReady SHORT | **false** (score≥9 nhưng hasAnyHardBlock true) |
| U1 longBtn / shortBtn | **false / false** |
| Badge | `longHard=false`, `shortHard=false`, `shortCanEnter=true` (vì score≥9 và **isSideHardBlockedForBadge bỏ groupBlocks**) → **`READY_green(shortCanEnter=true)`** |

Checklist tắt nút:

- [ ] adxGate.block  
- [ ] hardBlocks (đơn, per-side)  
- [x] **groupBlocks** ← nguyên nhân đo được  
- [ ] planBlockReasons  
- [ ] ambiguity  
- [ ] khác

**Chuỗi chính xác:**  
`groupBlocks` non-empty → `snap.hardBlocked=true` → `hasAnyHardBlock=true` → `isDirectionReady(SHORT)=false` → U1 tắt cả 2 → trong khi badge vẫn xanh vì `resolveDirectionCanEnter(SHORT)` = score≥9 && !sideHardBadge (không đọc group).

---

### SOLUSDT — **không** tái hiện “cả 2 nút mờ” tại thời điểm scan

| Field | Giá trị đo được |
|-------|-----------------|
| scores | LONG **4.79** / SHORT **10.73** / Δ **5.94** / officialTotal **10.73** |
| officialDirection | SHORT |
| decisionLabel | `VAO_TU_TIN` |
| hardBlocks / groupBlocks / planBlockReasons | tất cả `[]` |
| hasAnyHardBlock | **false** |
| U1 | long **false** / short **true** |
| Badge | `READY_green(shortCanEnter=true)` |

Checklist tắt cả 2 nút: **không** — SHORT đang bật.

---

### BNBUSDT — cả 2 nút mờ (không phải ambiguity trên scan 1-pass)

| Field | Giá trị đo được |
|-------|-----------------|
| scores | LONG **9.79** / SHORT **7.92** / Δ **1.87** / officialTotal **9.79** |
| officialDirection | LONG |
| decisionLabel | `CO_THE_VAO` |
| isAmbiguousDirection | **false** (prevState=null, 1 scan — hysteresis chưa vào AMBIGUOUS) |
| hardBlocks | `[]` |
| groupBlocks | `[]` |
| planBlockReasons | **`["R:R 1.56:1 < tối thiểu 2:1 — không vào"]`** |
| snap.hardBlocked | false |
| blockReasons.length | **1** (plan) |
| hasAnyHardBlock | **true** (via blockReasons) |
| isDirectionReady LONG | **false** (score≥9 nhưng hasAny) |
| U1 | **false / false** |
| Badge | `READY_green(longCanEnter=true)` (side hard badge false; score≥9) |

Checklist tắt nút:

- [ ] adxGate.block  
- [ ] hardBlocks  
- [ ] groupBlocks  
- [x] **planBlockReasons** ← nguyên nhân đo được  
- [ ] ambiguity (trên dump này = false; Δ&lt;2.5 sẽ AMBIGUOUS sau 2 scan liên tiếp trên app stateful)

---

## So sánh badge vs nút (đo được)

| Coin | Badge nhánh thực | longCanEnter | shortCanEnter | totalScore≥9 | Cả 2 nút mờ? | Nguyên nhân nút (đo) |
|------|------------------|--------------|---------------|--------------|--------------|----------------------|
| BTC | READY (`shortCanEnter`) | false | **true** | true | **Không** | — |
| NEAR | READY (`shortCanEnter`) | false | **true*** | true | **Có** | **groupBlocks** |
| SOL | READY (`shortCanEnter`) | false | **true** | true | **Không** | — |
| BNB | READY (`longCanEnter`) | **true*** | false | true | **Có** | **planBlockReasons** |

\* `resolveDirectionCanEnter` fallback: `score≥9 && !isSideHardBlockedForBadge` — **không** xét `groupBlocks`/`planBlockReasons`, nên canEnter badge có thể true trong khi `snap.canEnter`/`isDirectionReady` false.

---

## Kết luận theo yêu cầu (Scan B)

1. **NEAR** (đúng pattern user: xanh + 2 nút mờ, Δ&gt;2.5, không ambiguous):  
   nguyên nhân cụ thể = **`groupBlocks`** (`Nhóm A 2.2/5 < 2.5`) → `snap.hardBlocked` → `hasAnyHardBlock` → tắt `isDirectionReady` cả 2 phía.

2. **BNB** (2 nút mờ trên dump này): **`planBlockReasons`** (`R:R 1.56:1 < 2:1`), không ambiguity sau 1 scan.

3. **BTC / SOL** tại `13:34Z` **không** tắt cả 2 nút — SHORT **enabled**. Không suy đoán thêm; nếu UI lúc chụp ảnh khác, cần dump lại đúng phút đó hoặc dump từ store psychology/ambiguity ref của app.

4. Scan mặc định trước đó (không PASS L10) bị **`hardBlocks`: `L10 Tâm lý chưa sẵn sàng`** trên mọi coin — với full `resolveCardBadge` sẽ vào nhánh **HARD_BLOCK đỏ**, không khớp SẴN SÀNG xanh; vì vậy Scan B mới là baseline khớp giả định UI checklist đủ.

---

## Artefact method

- Temp script chạy rồi xóa: `scripts/_tmp_dump_button_gates_passl10.mts`  
- Không commit / không sửa production source.
