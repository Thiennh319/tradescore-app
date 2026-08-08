# ĐIỀU TRA — 4 coin SẴN SÀNG nhưng LONG/SHORT cùng mờ (sau wipe/restore 2026-08-03)

**Chế độ:** CHỈ điều tra — **không sửa code**  
**Thời điểm:** 2026-08-03 ~20:15 ICT  
**So sánh neo known-good:** commit `f5cf251` (`feat(v1.0.8): merge NEAR S1/S3 + ambiguity 2.5 + Signal Board U1`)  
**Working HEAD:** `a7fcaa7` trên `backup/emergency-file-wipe-restore-20260803`

---

## 0. Kết luận ngắn

**Xác nhận UI từ user:**  
- Trước: **C** — không ambiguous message, chỉ SẴN SÀNG + 2 nút mờ.  
- Sau: **A** — xác nhận đúng cách hiểu trên.

| Câu hỏi | Trả lời |
|---------|---------|
| Restore có làm hỏng `SignalBoard.tsx` / `directionAmbiguity.ts` / U1 / S1? | **Không.** Blob hash **trùng 100%** `f5cf251`. |
| BTC/NEAR/SOL (Δ>2.5) có bị `resolveDirectionAmbiguity` coi AMBIGUOUS nhầm? | **Không** (với đúng cặp điểm UI). Status = **CLEAR**, lean **SHORT**. User C củng cố: **không** ambiguous message. |
| BNB (Δ=1.9) cả 2 nút mờ? | **Đúng thiết kế** sau 2 scan sát nhau → AMBIGUOUS (có thể khác card BTC/NEAR/SOL). |
| S1 NEAR L3&lt;1.5 có leak sang BTC/SOL/BNB? | **Không.** Gate symbol-locked `NEARUSDT` only; tests pass. |
| Suite T1–T8 + 5 case S1 sau restore? | **Tất cả pass** (22/22 trong 2 file). |
| Nguyên nhân “SẴN SÀNG + 2 nút mờ” (triệu chứng C)? | **Gap badge vs button đã ship từ `f5cf251`**, không do wipe. Chi tiết §3.5: `hasAnyHardBlock` (`snap.hardBlocked` gồm **groupBlocks**, hoặc `planBlockReasons`) tắt `isDirectionReady` cho **cả 2 nút**, trong khi badge READY vẫn bật vì `totalScore ≥ 9` và **không** đi nhánh đỏ/vàng hard-badge (vì `isSideHardBlockedForBadge` **không** đọc `groupBlocks`/`planBlockReasons`). |

---

## 1. Diff / hash sau wipe+restore vs `f5cf251`

| File | `git hash-object` working tree | `f5cf251:` blob | Kết quả |
|------|--------------------------------:|----------------:|---------|
| `services/directionAmbiguity.ts` | `e3f0ee31…045c52` | identical | **MATCH** |
| `components/dashboard/SignalBoard.tsx` | `14b8e1d9…0f947ce` | identical | **MATCH** |
| `components/dashboard/signalBoardU1.ts` | `a58cdc34…15618c4` | identical | **MATCH** |
| `config/nearV4LayerGates.ts` | `7b4032aa…faea2d` | identical | **MATCH** |
| `services/signalBoardScan.ts` | `27ddfed3…1c7481d6` | identical | **MATCH** |
| `services/scorerV4.ts` | `8f27aa13…9c7481d6` wait: `8f27aa138994…` | identical | **MATCH** |
| `services/directionAmbiguity.task3.test.ts` | identical | identical | **MATCH** |
| `config/nearV4LayerGates.test.ts` | identical | identical | **MATCH** |

`git diff f5cf251 HEAD -- services/directionAmbiguity.ts components/dashboard/SignalBoard.tsx` → **empty**.

→ Không có bằng chứng restore làm lệch logic U1/ambiguity đã test-pass trước build v1.0.8.

---

## 2. Trace `resolveDirectionAmbiguity` với điểm UI

`AMBIGUOUS_THRESHOLD = 2.5` (công thức: `|long−short| < 2.5`).

| Coin | LONG | SHORT | Δ | Raw close? | Scan0 (prev=null) | Scan1 |
|------|-----:|------:|--:|:----------:|-------------------|-------|
| BTC | 5.6 | 10.6 | **5.0** | no | CLEAR / lean SHORT | CLEAR |
| NEAR | 5.3 | 9.7 | **4.4** | no | CLEAR / lean SHORT | CLEAR |
| SOL | 4.4 | 10.3 | **5.9** | no | CLEAR / lean SHORT | CLEAR |
| BNB | 9.4 | 7.5 | **1.9** | **yes** | CLEAR (count=1) | **AMBIGUOUS** |

Helper script: `scripts/_investigate-u1-buttons-live-scores.ts`.

**BNB:** cả 2 nút mờ là đúng U1+ambiguity.  
**BTC/NEAR/SOL:** ambiguity **không** giải thích việc cả 2 nút mờ.

---

## 3. Badge “SẴN SÀNG” vs nút LONG/SHORT (U1)

### 3.1. U1 (đúng spec Task3)

```ts
// components/dashboard/signalBoardU1.ts
isU1DirectionButtonEnabled = !isAmbiguous
  && side === officialDirection   // snap.direction / suggestDirectionV4
  && directionReady
```

Wire trong `SignalBoard.tsx`:

```ts
longBtnEnabled  = isU1DirectionButtonEnabled({ side:'LONG',  officialDirection: snap.direction, isAmbiguous, directionReady: longReady })
shortBtnEnabled = isU1DirectionButtonEnabled({ side:'SHORT', ... })
```

`isDirectionReady(side)`:

```ts
score(side) >= 9 && !isDirectionBlocked(...)
```

`isDirectionBlocked` → gọi `hasAnyHardBlock` **trước**:

```ts
hasAnyHardBlock =
  row.adxGate?.block === true
  || snap.hardBlocked === true
  || blockReasons.length > 0
```

→ **Một** hard/group/plan-block trên snapshot active khiến **cả hai** nút `directionReady=false` (U1 tắt non-official; official cũng tắt vì blocked).

### 3.2. Badge READY (lỏng hơn U1)

```ts
// resolveCardBadge [5]
if (longCanEnter || shortCanEnter || totalScore >= 9) {
  return { text: '🟢 SẴN SÀNG', ... }
}
```

`totalScore` = score chiều official (`snap.score`). Với SHORT 9.7–10.6 → badge xanh **dù** `canEnter=false` và dù cả 2 nút mờ.

### 3.3. Ma trận với điểm UI (chỉ score, giả định không hard-block)

| Coin | official (higher score) | amb | SHORT ready (score≥9) | longBtn | shortBtn |
|------|-------------------------|-----|------------------------|---------|----------|
| BTC/NEAR/SOL | SHORT | CLEAR | true | off | **ON** |
| BNB | LONG | AMBIGUOUS | long≥9 | **off** | **off** |

### 3.4. Ma trận khi `directionReady=false` (hard/ADX/blockReasons) dù Δ rõ

| Coin | Badge `totalScore≥9` | longBtn | shortBtn | Khớp ảnh “SẴN SÀNG + 2 nút mờ”? |
|------|----------------------|---------|----------|----------------------------------|
| BTC/NEAR/SOL/BNB | true | off | off | **Có** |

→ Đây là đường giải thích **khớp triệu chứng** mà **không cần** giả thuyết restore hỏng.

`snap.hardBlocked` lấy từ chiều **official** (`snapshotFromV4`: `active.hardBlocks` / `groupBlocks`). `canEnterV4(active)` có thể false trong khi `officialTotalScore` vẫn ≥ 9 (hardBlocks / groupBlocks / decision CHO_*).

### 3.5. Khớp xác nhận UI (C) — cơ chế chính xác nhất

User: **không** ambiguous message; chỉ SẴN SÀNG + 2 nút mờ.

Hai hàm **không đồng bộ** nguồn “block”:

| Nguồn | Dùng cho badge hard/partial? (`isSideHardBlockedForBadge`) | Dùng cho nút? (`hasAnyHardBlock` → `isDirectionReady`) |
|-------|:----------------------------------------------------------:|:------------------------------------------------------:|
| `longHardBlocks` / `shortHardBlocks` | Có | Có (gián tiếp qua side + qua `hardBlocked`) |
| `row.adxGate?.block` / BTC extreme rules | Có | Có |
| `snap.hardBlocked` khi chỉ **`groupBlocks`** (hardBlocks rỗng) | **Không** (không đọc group) | **Có** |
| `planBlockReasons` gộp vào `blockReasons` | **Không** | **Có** (`blockReasons.length > 0`) |
| Ambiguity message | — | Tắt nút qua `isAmbiguous` — **loại** theo xác nhận C |

Chuỗi khớp C (BTC/NEAR/SOL, Δ>2.5, SHORT ≥ 9):

1. Ambiguity CLEAR → không message vàng ambiguous.  
2. Official SHORT, `shortScore ≥ 9` → `totalScore ≥ 9` → badge **SẴN SÀNG**.  
3. Official có `groupBlocks` và/hoặc plan `blockReasons` → `hasAnyHardBlock === true` → `longReady=shortReady=false` → **cả 2 nút mờ**.  
4. Vì `isSideHardBlockedForBadge` bỏ qua group/plan → **không** đổi badge sang BLOCK đỏ/vàng chỉ vì group/plan.

Đây là **bug/gap thiết kế-implement U1+badge**, có trong bản `f5cf251` trước wipe — **không** phải lỗi restore.

---

## 4. Gate S1 NEAR — có leak không?

```ts
// config/nearV4LayerGates.ts
isNearShortLayerGateSymbol(symbol) => symbol === 'NEARUSDT'
nearShortL3HardBlockReason → null trừ NEAR + SHORT + L3 < 1.5
```

Gọi trong `scorerV4` qua `resolveNearShortL3Gate(input.symbol, direction, l3.score)` — không có nhánh ép symbol khác.

Dry-run L3=1.0 SHORT:

| Symbol | S1 reason |
|--------|-----------|
| BTCUSDT | `null` |
| NEARUSDT | `NEAR SHORT — L3 MACD < 1.5 (gate NEAR-only)` |
| SOLUSDT | `null` |
| BNBUSDT | `null` |

→ **Không** phải S1 “áp nhầm” BTC/SOL/BNB sau restore.

---

## 5. Kết quả test sau restore

```text
npx vitest run services/directionAmbiguity.task3.test.ts config/nearV4LayerGates.test.ts
Test Files  2 passed (2)
Tests       22 passed (22)
```

Gồm: T1–T8 (threshold 2.5, hysteresis, symbol-agnostic, U1, AMBIGUOUS both-off, S1 độc lập) + 5 case S1 Option A (NEAR L3 1.0/1.5/2.0, NEAR LONG, BTC/SOL/BNB).

**Không có test từng pass trước build mà fail sau restore** trong bộ này → phản chứng restore làm hỏng logic đã cover.

---

## 6. Phân loại nguyên nhân

| Giả thuyết | Verdict |
|------------|---------|
| A. Restore làm sai `SignalBoard` / `directionAmbiguity` / U1 / S1 | **LOẠI** (hash + tests) |
| B. Ambiguity nhầm BTC/NEAR/SOL vì Δ>2.5 | **LOẠI** (trace CLEAR) |
| C. S1 leak multi-coin | **LOẠI** |
| D. BNB cả 2 nút mờ | **ĐÚNG thiết kế** (Δ&lt;2.5 → AMBIGUOUS) |
| E. BTC/NEAR/SOL: badge READY + 2 nút mờ vì **gap `totalScore≥9` badge vs `hasAnyHardBlock` (groupBlocks / planBlockReasons)** | **CHỐT (khớp xác nhận C)** — gap đã có từ `f5cf251`, không do wipe |
| F. Ambiguity hysteresis kẹt AMBIGUOUS | **Loại** cho case C (user không thấy ambiguous message) |
| G. Tần suất “~1 lệnh NEAR/ngày” vs 24 SHORT/tháng | Kỳ vọng backtest ≠ gate live; không chứng minh restore hỏng |

**Tóm lại:** không phải restore; không phải ambiguity nhầm Δ; không phải S1 leak.  
Với triệu chứng C: **badge SẴN SÀNG (totalScore≥9) + nút tắt vì `hasAnyHardBlock` đọc group/plan mà badge hard path không đọc** — gap U1/badge từ bản đã duyệt.

---

## 7. Việc chưa làm (có chủ đích)

- Không sửa SignalBoard / ambiguity / S1  
- Không dump scan live từ Binance trong báo cáo này (cần app đang scan để đọc `hardBlocks` từng coin)  
- Không chạy Task 2 Decision Confidence

### Gợi ý xác minh live (user / phiên sau — vẫn report-only)

Trên card BTC khi 2 nút mờ, kiểm tra:

1. Có dòng `⚠️ Xu hướng chưa rõ ràng…` không? → nếu **không**: không phải ambiguity.  
2. Export/trace `shortHardBlocks`, `groupBlocks`, `canEnter`, `decisionLabel`, `adxGate.block` của chiều SHORT.  
3. Nếu `hardBlocked` hoặc `blockReasons.length>0` trong khi `shortScore≥9` → khớp nguyên nhân E.

---

## Artefacts

| Path | Vai trò |
|------|---------|
| `docs/exports/REPORT_INVESTIGATE_4COIN_BUTTONS_DIM_AFTER_WIPE_2026-08-03.md` | Báo cáo này |
| `scripts/_investigate-u1-buttons-live-scores.ts` | Trace điểm UI + U1 matrix |
| `docs/exports/REPORT_TASK3_ARCHITECTURE_AMBIGUITY_2P5_UI_U1_2026-08-02.md` | Spec U1 gốc |
