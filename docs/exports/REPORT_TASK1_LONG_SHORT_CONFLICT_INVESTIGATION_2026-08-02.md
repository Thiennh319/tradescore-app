# TASK 1/3 — Điều tra xung đột LONG/SHORT (hiện trạng)

**Ngày:** 2026-08-02  
**Phạm vi:** CHỈ điều tra — không sửa code, không backtest, không đề xuất kiến trúc.

---

## 1. Nơi quyết định hướng cuối cùng

### 1.1 SSOT V4 — `suggestDirectionV4`

`services/scorerV4.ts` ~1370–1381:

```ts
export function suggestDirectionV4(result: ScoringResultV4): Direction {
  const { long, short } = result;
  if (long.hardBlocks.length > 0 && short.hardBlocks.length === 0) return 'SHORT';
  if (short.hardBlocks.length > 0 && long.hardBlocks.length === 0) return 'LONG';
  if (long.awaitingRescore && !short.awaitingRescore) return 'SHORT';
  if (short.awaitingRescore && !long.awaitingRescore) return 'LONG';
  if (long.decision === 'KHONG_VAO' && short.decision !== 'KHONG_VAO') return 'SHORT';
  if (short.decision === 'KHONG_VAO' && long.decision !== 'KHONG_VAO') return 'LONG';
  const longScore = long.officialTotalScore ?? long.referenceTotalScore;
  const shortScore = short.officialTotalScore ?? short.referenceTotalScore;
  return longScore >= shortScore ? 'LONG' : 'SHORT';
}
```

**Không** xét: `canEnter`, `groupBlocks`, `blockReasons`, funding/trend riêng, hay margin tối thiểu giữa hai điểm.

### 1.2 V3 tương đương

`services/scorerV3.ts` ~958–965 — cùng ý: hard một phía → phía kia; rồi `KHONG_VAO`; rồi `long.totalScore >= short.totalScore ? 'LONG' : 'SHORT'`.

### 1.3 Call sites (chọn 1 hướng cho snapshot / plan / store)

| Nơi | File | Việc làm |
|-----|------|----------|
| Signal Board scan | `services/signalBoardScan.ts` ~1138–1154 | `directionV4 = suggestDirectionV4(...)` → `snapshotFromV4(..., directionV4)` + trade plan theo hướng đó |
| Trade store | `store/useTradeStore.ts` ~1283–1295 | `selectedDirection = suggestDirectionV4(...)` |
| Market analysis hook | `hooks/useMarketAnalysis.ts` ~397, ~405 | direction + trade plan |
| Backtest / investigate scripts | `scripts/backtest-v4-near-90d.ts`, `investigate-near-180d-long-zero.ts` | entry direction |

### 1.4 Cơ chế song song — ambiguity (không thay `suggestDirection`)

`services/directionAmbiguity.ts` + wire trong `signalBoardScan.ts` ~1114–1143:

- So sánh `|longScore − shortScore|` với `AMBIGUOUS_THRESHOLD = 1.0`
- Hysteresis 2-scan → `status: 'AMBIGUOUS'`
- `applyAmbiguityToSnapshot` (~650–660): gắn `isAmbiguousDirection`, **ép `canEnter: false`** trên snapshot hướng đã chọn
- **Không** đổi `direction` do `suggestDirectionV4`

### 1.5 Unified (V4+V4.1) — ưu tiên LONG nếu cả hai “canEnter”

`services/unifiedSignalEngine.ts` `resolveV4Signal` ~125–131: check **LONG trước**, rồi SHORT.  
`longSnapshot`/`shortSnapshot` chỉ được gắn trong `services/scanUnified.ts` `enrichV4RowForUnified` (~41–60) — **không** gắn trên row Signal Board thường từ `useSignalBoard`.

---

## 2. Logic hiện tại — có phải chỉ “hòa → LONG”?

**Không.** Thứ tự đầy đủ V4:

1. Chỉ LONG bị `hardBlocks` → **SHORT** (và ngược lại)
2. Chỉ một phía `awaitingRescore` → chọn phía còn lại
3. Chỉ một phía `decision === 'KHONG_VAO'` → chọn phía còn lại  
   (`CHO_THEM` / soft block **không** nằm trong bước này)
4. So điểm: `officialTotalScore ?? referenceTotalScore`  
   → **`longScore >= shortScore` → LONG** (hòa điểm hoặc LONG cao hơn → LONG; SHORT chỉ khi điểm SHORT **cao hơn hẳn**)

Không có nhánh ưu tiên trend market / funding riêng trong `suggestDirectionV4`. Funding/CVD/BTC ảnh hưởng **gián tiếp** qua hard/score từng phía trước khi so sánh.

**Đã có** rule “chênh lệch tối thiểu” dạng khác: ambiguity `|Δ| < 1.0` (2 scan) → chặn `canEnter`, vẫn giữ hướng nghiêng (`leaningDirection` cũng tie→LONG).

---

## 3. UI Signal Board: cả LONG và SHORT “active” cùng lúc?

### Logic chọn hướng (engine)

- Mỗi coin / mỗi scan: **một** `snap.direction` từ `suggestDirectionV4`.
- Không có state engine “cả hai hướng primary active”.

### UI (có thể hiểu nhầm)

| Thành phần | Hành vi |
|------------|---------|
| `snap.direction` / badge entry / plan mặc định | **Một** hướng |
| Nút LONG / SHORT (`longReady` / `shortReady`) | `isDirectionReady`: `score >= 9` và không coi là blocked — **độc lập từng phía** → **cả hai nút có thể “ready” cùng lúc** (`SignalBoard.tsx` ~1332–1333, ~590–598, ~1442+) |
| Màu số LONG/SHORT (`longScoreActive` / `shortScoreActive`) | Cần `longSnapshot?.canEnter === true` (~1336–1339). Path Signal Board thường **không** có snapshot → cả hai thường **muted** (không phải “hai màu active”) |
| Modal `canEnter` theo hướng | Fallback `isDirectionReady` nếu không có snapshot (~1520–1526) → có thể xác nhận **cả hai** hướng nếu mỗi bên score≥9 |
| Ambiguous | Border/badge đặc biệt; `canEnter` primary = false; bias bar trung tính (~1918+) |

**Kết luận phân tầng:**

- **Không phải bug chọn hướng:** engine luôn ép 1 `direction`.
- **UI có thể gây hiểu nhầm:** hai nút sẵn sàng / modal enter độc lập ≠ “hai hướng active” trong SSOT direction.
- Highlight điểm “active” đồng thời **không** xảy ra trên board V4 thường (thiếu `longSnapshot`); có thể xảy ra trên luồng đã `enrichV4RowForUnified` nếu cả hai `canEnter` và score≥9.

---

## 4. “Điểm” dùng để so sánh là gì?

**V4 (`suggestDirectionV4` + ambiguity scan):**

- Biến: `long.officialTotalScore ?? long.referenceTotalScore` (tương tự SHORT).
- Định nghĩa (`DirectionalScoreV4`, `scorerV4.ts` ~125–127, ~1266–1287):
  - `referenceTotalScore` = **Group A + B + C** (thang quyết định, max ~15), không phải tổng raw layer 0–2.
  - `officialTotalScore` = cùng giá trị khi không `awaitingRescore`; `null` khi chờ tái chấm → fallback `referenceTotalScore` khi so hướng.
- Snapshot UI: `snap.longScore` / `snap.shortScore` copy từ hai tổng đó (`snapshotFromV4`).

**V3:** `long.totalScore` / `short.totalScore`.

**Không** dùng: chênh layer đơn lẻ, confidence V4.1, hay `canEnter` boolean làm proxy điểm.

**Ambiguity:** cùng cặp điểm trên; `scoreDiff = Math.abs(longScore - shortScore)` so với `AMBIGUOUS_THRESHOLD` (1.0).

---

## 5. Tóm tắt hiện trạng (cho Task 2/3)

1. Chọn hướng SSOT = `suggestDirectionV4` (+ V3 tương đương); tie / LONG ≥ SHORT → **LONG**.
2. Đã có gate chênh lệch `|Δ| < 1` → ambiguity → **cấm vào**, không đổi công thức chọn hướng.
3. UI có thể hiện **hai nút ready** cùng coin; đó là tầng hiển thị/fallback, không phải hai `direction` engine.
4. Điểm so sánh = **tổng group-scale** từng phía tại cùng scan (`officialTotalScore ?? referenceTotalScore`).

*(Task này không đề xuất kiến trúc sửa.)*
