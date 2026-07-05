# Báo cáo chức năng Structure SL

**Ngày cập nhật:** 2026-07-03  
**Phạm vi:** Stop-loss theo swing 4H — engine · pipeline · UI · journal  
**Trạng thái:** ✅ Hoàn chỉnh (scan → plan → panel → journal log)

---

## 1. Tóm tắt

**Structure SL** đặt stop-loss dựa trên **swing high/low gần nhất** trên khung **4H**, so sánh với SL ATR và lấy mức **xa entry hơn** (an toàn hơn).

| Mục đích | Mô tả |
|----------|--------|
| **LONG** | SL dưới swing low 4H + buffer 0.3% |
| **SHORT** | SL trên swing high 4H + buffer 0.3% |
| **Fallback** | Không có swing hợp lệ → giữ SL ATR |
| **UI** | Panel chi tiết trên Signal Board + badge đánh giá |
| **Journal** | Snapshot lúc vào lệnh (`structureSLSnapshot`) + `slSource` legacy |

| Khía cạnh | Mô tả |
|-----------|--------|
| **Không phải layer scorer** | Không cộng/trừ điểm L1–L10 |
| **Sau ADX Gate** | ADX scale TP/SL trước; Structure chỉ **override SL** |
| **Dữ liệu** | `market.klines['4h']` có sẵn — không fetch thêm |

---

## 2. Kiến trúc end-to-end

```
Klines 4H (AllMarketData)
        │
        ▼
calculateTradePlanV3/V4          (SL ban đầu = ATR)
        │
        ▼
ADX Gate                         (scale TP + SL multiplier)
        │
        ▼
calculateStructureSL()           (services/structureSL.ts)
  findRecentSwingLow/High
  → min/max vs atrSL
  → applyStructureSlToPlan (recalc R:R)
        │
        ├──────────────────────────────┐
        ▼                              ▼
SignalRow.structureSL          enrichSnapshotFinalStatus
        │
        ├──────────────┬─────────────────────┐
        ▼              ▼                     ▼
StructureSLSection   buildStructureSLSnapshot   resolveStructureSlSourceForLegacyJournal
(Signal Board UI)    → AiTradeJournalEntry      → StoredTradeJournalEntry.slSource
```

---

## 3. Engine — `services/structureSL.ts`

### Phát hiện swing

| Loại | Điều kiện |
|------|-----------|
| **Swing low** | `Low[i]` < 2 nến trước **và** 2 nến sau |
| **Swing high** | `High[i]` > 2 nến trước **và** 2 nến sau |

### Hằng số `STRUCTURE_SL_DEFAULTS`

| Key | Giá trị | Ý nghĩa |
|-----|---------|---------|
| `BUFFER_PCT` | 0.3 | Buffer % dưới/trên swing |
| `LOOKBACK_CANDLES` | 20 | Quét tối đa 20 nến 4H |
| `MIN_CANDLES_BACK` | 3 | Swing cách nến hiện tại ≥ 3 nến |

Chọn swing **gần nhất** (index cao nhất trong phạm vi).

### Logic `calculateStructureSL`

**LONG**

1. Tìm swing low → không có → `ATR_FALLBACK`
2. `structureSL = swingLow × (1 - bufferPct/100)`
3. Invalid nếu `structureSL > entryPrice` → `ATR_FALLBACK`
4. `slPrice = min(structureSL, atrSL)` — xa entry hơn = giá SL thấp hơn

**SHORT**

1. Tìm swing high → không có → `ATR_FALLBACK`
2. `structureSL = swingHigh × (1 + bufferPct/100)`
3. Invalid nếu `structureSL < entryPrice` → `ATR_FALLBACK`
4. `slPrice = max(structureSL, atrSL)` — xa entry hơn = giá SL cao hơn

### `StructureSLResult`

```typescript
{
  swingPrice: number;
  swingTime: number;
  slPrice: number;
  slSource: 'STRUCTURE' | 'ATR_FALLBACK';
  bufferPct: number;
  distanceFromEntry: number;  // %
  candlesBack: number;
}
```

---

## 4. Pipeline — `services/signalBoardScan.ts`

### Thứ tự

```
scoreV3/V4 → tradePlanV3/V4 → ADX Gate → Structure SL → enrichSnapshotFinalStatus → ADX block
```

### Wire

- Input: `directionV4`, `planV4.recommendedEntry`, `planV4.stopLoss.price` (sau ADX), `klines4h`
- `slSource === 'STRUCTURE'` → override `stopLoss.price` trên plan V3 + V4
- Recalc: `tp1/2/3.rrRatio`, `primaryRR`, `stopLoss.distancePct`
- `SignalRow.structureSL` — luôn gán khi `calculateStructureSL` thành công (kể cả `ATR_FALLBACK`)
- Lỗi / thiếu klines → `structureSL = undefined`, SL giữ nguyên

---

## 5. UI Panel — `StructureSLSection.tsx`

### Vị trí

`SignalBoard.tsx`: sau **AdxMarketRegimeSection**, trước **Trade Plan**  
Hiển thị khi `row.structureSL != null`

### Nội dung

| Phần | Mô tả |
|------|--------|
| **Header** | 🏗️ SL theo cấu trúc giá 4H + tooltip |
| **Bảng STRUCTURE** | Swing point, buffer, SL cấu trúc, SL ATR gốc, SL áp dụng (xanh), khoảng cách % |
| **Bảng ATR_FALLBACK** | Trạng thái không swing, SL áp dụng (ATR), ghi chú |
| **Badge** | Cam: SL rộng hơn ATR · Xanh: SL chặt hơn ATR · Xám: Dùng ATR mặc định |

Chuỗi: `constants/vi.ts` → `vi.signalBoard.structureSL.*`

---

## 6. Journal log

### Schema — `StructureSLSnapshot` (`constants/aiJournal.ts`)

```typescript
{
  swingPrice: number;
  swingTime: number;
  slPrice: number;
  slSource: 'STRUCTURE' | 'ATR_FALLBACK';
  bufferPct: number;
  distanceFromEntry: number;
  candlesBack: number;
}
```

Gắn optional: `AiTradeJournalEntry.structureSLSnapshot` — entry cũ không có field → không crash.

### Service — `journalService.ts`

| Hàm | Vai trò |
|-----|---------|
| `buildStructureSLSnapshot(structureSL)` | Map 1:1 từ `StructureSLResult` |
| `buildSnapshotsFromSignalRow()` | Gán `structureSLSnapshot` từ `row.structureSL` |
| `resolveStructureSlSourceForLegacyJournal(row)` | `row.structureSL?.slSource` |

### Legacy journal — `StoredTradeJournalEntry`

```typescript
slSource?: string;  // 'STRUCTURE' | 'ATR_FALLBACK'
```

Ghi qua `App.tsx` → `addJournalEntry({ slSource: ... })`

### AI journal entry

`App.tsx` → `buildSnapshotsFromSignalRow` → `addTradeEntry` / `placePendingOrder` truyền `snapshots.structureSLSnapshot`

---

## 7. So sánh với ATR / ADX

| | ATR (trade plan) | ADX Gate | Structure SL |
|---|------------------|----------|--------------|
| Nguồn SL | ATR 1H × multiplier | Scale SL qua `slMultiplier` | Swing 4H + buffer |
| Ảnh hưởng TP | ✅ | ✅ scale | ❌ |
| Thứ tự pipeline | 1 | 2 | 3 |
| Journal field | plan snapshot | `adxSnapshot` | `structureSLSnapshot` |
| UI panel | Trade Plan view | AdxMarketRegimeSection | StructureSLSection |

---

## 8. File tham chiếu

| File | Vai trò |
|------|---------|
| `services/structureSL.ts` | Engine swing + `calculateStructureSL` |
| `services/signalBoardScan.ts` | Wire pipeline + `SignalRow.structureSL` |
| `components/dashboard/StructureSLSection.tsx` | UI panel |
| `components/dashboard/SignalBoard.tsx` | Wire panel |
| `constants/vi.ts` | Chuỗi tiếng Việt |
| `constants/aiJournal.ts` | `StructureSLSnapshot` schema |
| `services/journalService.ts` | Build snapshot + snapshots row |
| `store/useTradeStore.ts` | `slSource` legacy + `structureSLSnapshot` on entry |
| `App.tsx` | Ghi journal khi vào lệnh / pending |

---

## 9. Test coverage

| File | Tests | Nội dung |
|------|-------|----------|
| `structureSL.test.ts` | 9 | Swing detection + calculateStructureSL |
| `structureSLJournal.test.ts` | 5 | `buildStructureSLSnapshot` + serialize + migrate |
| `adxGate.test.ts` | 2 | Wire scan (mock) — pipeline tổng thể |

```bash
npx vitest run services/structureSL.test.ts services/structureSLJournal.test.ts
# 14 passed
```

### Suite toàn bộ (2026-07-03)

| Metric | Số |
|--------|-----|
| **Pass** | **725** |
| **Fail** | **8** (7 `driveSync.e2e` + 1 grace period advisor — pre-existing) |
| **Tổng** | **733** |

---

## 10. Ví dụ hành vi

### Case A — STRUCTURE, swing xa (LONG)

- Swing low 95, buffer → SL cấu trúc ~94.72
- ATR SL 96 (gần entry hơn) → áp dụng **94.72**
- Badge cam: SL rộng hơn ATR
- Journal: `structureSLSnapshot.slSource = 'STRUCTURE'`, legacy `slSource = 'STRUCTURE'`

### Case B — STRUCTURE, ATR xa hơn (LONG)

- Swing gần → structure SL cao hơn
- `min()` chọn ATR → badge xanh: SL chặt hơn ATR

### Case C — ATR_FALLBACK

- Không swing trong 20 nến / swing invalid
- SL giữ ATR, panel xám, snapshot vẫn ghi `slSource: 'ATR_FALLBACK'`

### Case D — Entry journal cũ

- Không có `structureSLSnapshot` → `migrateAiJournalEntry` → `undefined`, không crash

---

## 11. Ghi chú vận hành

1. Structure SL chỉ chạy khi có plan V4 và `klines4h.length > 0`.
2. `enrichSnapshotFinalStatus` chạy **sau** Structure SL — `finalEntryStatus` theo SL/R:R cuối.
3. Panel hiện khi scan set `structureSL` (kể cả fallback); không hiện khi lỗi/ thiếu data.
4. SL ATR gốc trên UI: hiển thị khi suy ra được (ATR thắng hoặc fallback); `—` khi structure thắng và ATR không lưu trong result.

---

## 12. Việc có thể làm tiếp

- Hiển thị `structureSLSnapshot` trong Journal UI / analytics
- Lưu `atrSlPrice` vào `StructureSLResult` để UI không cần suy luận
- Integration test `scanSignalSymbol` + klines 4H có swing thật
- Thống kê win rate theo `slSource` STRUCTURE vs ATR_FALLBACK
