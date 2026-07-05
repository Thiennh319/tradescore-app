# Báo cáo chức năng VWAP

**Ngày cập nhật:** 2026-07-03  
**Phạm vi:** VWAP session · L5 bonus · entry gợi ý · UI panel · journal  
**Trạng thái:** ✅ Hoàn chỉnh (engine → pipeline → panel → journal log)

---

## 1. Tóm tắt

**VWAP (Volume Weighted Average Price)** đo mức giá “công bằng” theo volume trong **phiên UTC ngày hiện tại**, kèm band ±1σ/±2σ để đánh giá vùng giá và gợi ý entry.

| Mục đích | Mô tả |
|----------|--------|
| **Tính VWAP** | Session UTC, klines 15M (fallback 1H) |
| **Zone** | ABOVE_BAND2 … NEAR_VWAP … BELOW_BAND2 |
| **L5 bonus** | +0.5 raw L5 khi giá gần VWAP (cap tại 2) — **ngoài scorer** |
| **Entry gợi ý** | IDEAL/GOOD → thêm `entryOptions` / `entryNote` trên plan V4 |
| **UI** | `VWAPSection` trên Signal Board (sau Structure SL, trước Trade Plan) |
| **Journal** | `vwapSnapshot` trên AI journal + `vwapZone` / `vwapEntryQuality` legacy |

| Khía cạnh | Mô tả |
|-----------|--------|
| **Không sửa scorer core** | Bonus áp dụng post-score trong `signalBoardScan.ts` |
| **Không override recommendedEntry** | Chỉ bổ sung lựa chọn entry VWAP |
| **Optional everywhere** | Thiếu dữ liệu → `vwapData = undefined`, không crash |

---

## 2. Kiến trúc end-to-end

```
Klines 15M / 1H (AllMarketData)
        │
        ▼
buildAnalysisInputFromMarket()
  calculateVWAP(klines, markPrice) → AnalysisInput.vwapData
        │
        ▼
scoreAnalysisV3/V4
        │
        ▼
calculateVWAPBonus()              (services/vwapBonus.ts)
  patch L5 raw → recalc Group B + total (scan side)
        │
        ▼
calculateTradePlanV3/V4
        │
        ▼
ADX Gate
        │
        ▼
getVWAPEntrySignal()              (services/vwapService.ts)
  IDEAL/GOOD → planV4.entryOptions / entryNote
        │
        ▼
Structure SL → enrichSnapshot
        │
        ├──────────────────────────────┐
        ▼                              ▼
SignalRow (vwapData, vwapSignal,   VWAPSection.tsx
         vwapBonus)                 (panel chi tiết)
        │
        ▼
buildVWAPSnapshot(row)            (journalService.ts)
  → AiTradeJournalEntry.vwapSnapshot
  → StoredTradeJournalEntry.vwapZone / vwapEntryQuality
```

---

## 3. Engine — `services/vwapService.ts`

| Export | Vai trò |
|--------|---------|
| `calculateVWAP(klines, currentPrice)` | VWAP session + σ bands + zone |
| `getVWAPEntrySignal(vwap, direction)` | IDEAL / GOOD / NEUTRAL / POOR |
| `VWAP_DEFAULTS` | NEAR 0.5%, PULLBACK 2%, MIN_CANDLES 5 |

**Zone logic:**

| Zone | Điều kiện |
|------|-----------|
| `NEAR_VWAP` | \|price − VWAP\| / VWAP ≤ 0.5% |
| `ABOVE_BAND2` / `BELOW_BAND2` | Ngoài ±2σ |
| `ABOVE_BAND1` / `BELOW_BAND1` | Giữa ±1σ và ±2σ |
| `BETWEEN` | Còn lại |

**Fallback:** klines rỗng, &lt; 5 nến session, volume = 0 → `null`.

---

## 4. L5 Volume Bonus — `services/vwapBonus.ts`

| Input | Output |
|-------|--------|
| `vwapData`, `direction`, `currentL5Raw` | `{ bonusRaw, reason, applied }` |

| Rule | Bonus |
|------|-------|
| LONG + `isNearVwap` + zone ≠ `BELOW_BAND2` | +0.5 |
| SHORT + `isNearVwap` + zone ≠ `ABOVE_BAND2` | +0.5 |
| `currentL5Raw + bonus > 2` | Cap tại 2 |
| Khác | 0 |

Áp dụng **cả Long và Short** trong scoring; `SignalRow.vwapBonus` = bonus hướng V4 active.

---

## 5. Pipeline — `services/signalBoardScan.ts`

Thứ tự scan:

```
score → VWAP L5 bonus → tradePlan → ADX Gate → VWAP Entry → Structure SL → enrich
```

**SignalRow fields mới:**

```typescript
vwapData?: VWAPResult
vwapSignal?: VWAPEntrySignal
vwapBonus?: VWAPBonusResult
```

---

## 6. UI — `components/dashboard/VWAPSection.tsx`

| Vị trí | Sau `StructureSLSection`, trước Trade Plan |
| Điều kiện | `row.vwapData != null` |

**Nội dung panel:**

1. Bảng chỉ số: VWAP, band ±1σ/±2σ, giá hiện tại, % so VWAP  
2. Zone badge (6 zone, màu đỏ/cam/xanh/xám)  
3. Entry signal (IDEAL / GOOD / POOR — ẩn NEUTRAL)  
4. Badge bonus L5 khi `vwapBonus.applied`

Chuỗi tiếng Việt: `constants/vi.ts` → `signalBoard.vwap`.

---

## 7. Journal

### Schema — `VWAPSnapshot` (`constants/aiJournal.ts`)

```typescript
{
  vwap, upperBand1, upperBand2, lowerBand1, lowerBand2,
  priceVsVwap, zone, isNearVwap,
  entryQuality,   // IDEAL/GOOD/NEUTRAL/POOR
  bonusApplied, bonusRaw
}
```

| Hàm / field | Mô tả |
|-------------|--------|
| `buildVWAPSnapshot(row)` | Map từ `vwapData` + `vwapSignal` + `vwapBonus` |
| `buildSnapshotsFromSignalRow()` | Gán `vwapSnapshot` |
| `AiTradeJournalEntry.vwapSnapshot?` | Optional — không break entry cũ |
| `StoredTradeJournalEntry.vwapZone?` | Legacy |
| `StoredTradeJournalEntry.vwapEntryQuality?` | Legacy |

**Luồng vào lệnh:** `App.tsx` → `buildSnapshotsFromSignalRow` → `addTradeEntry` / `placePendingOrder`.

---

## 8. Test

### VWAP-specific (22/22 pass)

| File | Tests | Nội dung |
|------|-------|----------|
| `vwapService.test.ts` | 10 | calculateVWAP, zones, entry signal, pullback |
| `vwapBonus.test.ts` | 6 | LONG/SHORT bonus, cap, zone block |
| `vwapJournal.test.ts` | 6 | buildVWAPSnapshot, serialize, migrate legacy |

```bash
npx vitest run services/vwapService.test.ts services/vwapBonus.test.ts services/vwapJournal.test.ts
# → 3 files, 22 passed
```

### Full suite (2026-07-03)

| | |
|---|---|
| **Tổng** | 755 tests |
| **Pass** | 747 |
| **Fail** | 8 (không liên quan VWAP) |

**Fail có sẵn:**

| File | Số | Ghi chú |
|------|-----|---------|
| `positionAdvisorV4.test.ts` | 1 | Grace period: `CLOSE_NOW` vs `HOLD` |
| `driveSync.e2e.test.ts` | 7 | GitHub Gist mock / fetch |

**Kết luận test VWAP:** Không có lỗi test nào thuộc module VWAP.

---

## 9. File map

| File | Vai trò |
|------|---------|
| `services/vwapService.ts` | Engine VWAP + entry signal |
| `services/vwapBonus.ts` | L5 bonus calculator |
| `services/analysisInput.ts` | `vwapData` trên input |
| `services/signalBoardScan.ts` | Wire pipeline + SignalRow |
| `components/dashboard/VWAPSection.tsx` | UI panel |
| `components/dashboard/SignalBoard.tsx` | Mount section |
| `constants/vi.ts` | Chuỗi UI |
| `constants/aiJournal.ts` | `VWAPSnapshot` schema |
| `services/journalService.ts` | `buildVWAPSnapshot`, snapshots |
| `store/useTradeStore.ts` | Legacy fields + `addTradeEntry` |
| `App.tsx` | Ghi journal khi vào lệnh |

---

## 10. Giới hạn / lưu ý

1. **Session UTC** — VWAP reset theo ngày UTC, không theo giờ VN.  
2. **Klines 15M** — cần đủ ≥ 5 nến trong session; thiếu → không có VWAP.  
3. **Bonus ngoài scorer** — chỉ patch L5 + Group B trên scan; không đổi logic L5a/L5b gốc trong `scorerV4.ts`.  
4. **Entry VWAP** — chỉ ghi chú / `entryOptions`; `recommendedEntry` giữ nguyên từ trade plan.  
5. **Chưa có badge trên hàng Signal Board** — chi tiết chỉ trong panel expand (giống Structure SL ban đầu).

---

## 11. Checklist QA thủ công

- [ ] Mở panel coin có đủ klines 15M → thấy section VWAP  
- [ ] Giá gần VWAP → zone `NEAR_VWAP`, badge xanh  
- [ ] Vào lệnh → AI journal có `vwapSnapshot`  
- [ ] Entry cũ (trước VWAP) → mở journal không crash  
- [ ] `recommendedEntry` plan không đổi khi có VWAP entry gợi ý  
