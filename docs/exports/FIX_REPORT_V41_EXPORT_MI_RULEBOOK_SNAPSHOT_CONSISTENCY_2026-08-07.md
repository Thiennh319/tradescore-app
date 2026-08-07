# FIX REPORT — V4.1 MI vs Rulebook Scan Timestamp lệch (~2 phút)

**Ngày:** 2026-08-07  
**Phạm vi sửa:** `services/v41Export/**` + `components/v41/V41SignalPanel.tsx` (đã xin phép ngoài `services/v41/**`).  
**Không đụng:** `services/v41/rc3/buildTradeSessionAdviser.ts`, Journal V3/V4.

---

## 1. Evidence người dùng

| Document | Generated At | Scan Timestamp (ms) |
|----------|--------------|---------------------|
| `01_MARKET_INTELLIGENCE_V41` (NEAR) | `2026-08-07T04:31:53.790Z` | `1786076996297` |
| `01_RULEBOOK_V41` (NEAR) | `2026-08-07T04:31:57.818Z` | `1786077116324` |

- Generated At lệch **~4s** (hai lần gọi build meta).
- Scan Timestamp lệch **~120s** (hai snapshot MI khác nhau → hai lần scan).

---

## 2. Kết luận điều tra

### **BUG / DESIGN GAP** — thiếu cơ chế “một lần export → frozen pair”

Không phải bug trong builder MI/Rulebook (cả hai đều **copy-only** từ `SignalRowV41`).  
Lệch xảy ra vì UI xuất **hai lần gọi riêng**, mỗi lần lấy `rows` hiện tại — nếu scan chen giữa → `snapshot.scanTimestamp` khác.

| Câu hỏi | Trả lời |
|---------|---------|
| Cùng 1 lời gọi export? | **Không.** `runV41MarketIntelligenceExport` và `runV41RulebookExport` tách biệt. |
| Frozen snapshot dùng chung? | **Không** giữa 2 lần click. Mỗi wire chỉ đóng băng **row tại thời điểm gọi**. |
| Acceptable by design tuyệt đối? | Solo export “lấy mới nhất” có thể chấp nhận, nhưng **không** đảm bảo 2 file audit pair nhất quán. Rủi ro số liệu mâu thuẫn: **có**. |

---

## 3. Trace code

### Entry points

```37:72:services/v41Export/wire/exportV41TraceReviewWire.ts
export function exportV41MarketIntelligenceTrace(row, options?) {
  // snapshot: row.snapshot — no recompute
}
export function exportV41RulebookTrace(row, options?) {
  // row nguyên vẹn — Builder pure
}
```

```54:74:services/v41Export/wire/runV41MiExport.ts
// runV41MarketIntelligenceExport(rows, symbol) → resolve row → MI only
// runV41RulebookExport(rows, symbol) → resolve row → Rulebook only
```

### UI — một kind mỗi lần click

```140:143:components/v41/V41SignalPanel.tsx
// trước fix: rulebook XOR marketIntelligence — không pair
```

### Scan Timestamp nguồn

- MI Formatter: `s.scanTimestamp` từ `snapshot.scanTimestamp`
- Rulebook Builder: `snap.scanTimestamp` từ `row.snapshot`
- `generatedAt`: `resolveV41ExportMeta` → `new Date().toISOString()` mỗi lần gọi (nên Generated At lệch vài giây là **đúng** với 2 click).

### Evidence lệch scan

Test regression: hai build từ 2 row khác `scanTimestamp` → markdown Scan Timestamp khác nhau  
(ghi trong `runV41MiExport.test.ts`).

`scanTimestamp` được gán lúc `runMarketIntelligenceLayer` (`Date.now()` mỗi scan) trong `services/v41/marketIntelligenceLayer.ts` — **không sửa** file đó.

---

## 4. Fix (gọn)

### Thêm paired export dùng chung 1 row + 1 `generatedAt`

| File | Đổi |
|------|-----|
| `services/v41Export/wire/runV41MiExport.ts` | Kind `miRulebookPair`; `buildV41PairedMiRulebookMarkdown`; `runV41PairedMiRulebookExport` |
| `services/v41Export/index.ts` | Re-export |
| `components/v41/V41SignalPanel.tsx` | Menu **「MI + Rulebook (cùng snapshot)」** → 1 lần xuất 2 file |
| Tests | `runV41MiExport.test.ts`, `rulebook.test.ts` |

Hành vi: resolve **một** `SignalRowV41` → cùng `metadata.generatedAt` → 2 markdown → share 2 lần.  
→ **Scan Timestamp giống hệt**; **Generated At giống hệt**.

Solo MI / solo Rulebook vẫn giữ (xuất độc lập = lấy row mới nhất tại click — vẫn có rủi ro nếu so hai file từ 2 click).

---

## 5. Test

```text
npx vitest run services/v41Export/__tests__/runV41MiExport.test.ts \
  services/v41Export/__tests__/exportV41TraceReviewWire.test.ts \
  services/v41Export/__tests__/rulebook.test.ts \
  services/v41Export/__tests__/marketIntelligence.test.ts
```

- Paired: Scan Timestamp + Generated At khớp giữa 2 MD  
- Share 2 filenames  
- Evidence: 2 row khác scan → lệch (document risk cũ)

---

## 6. Hướng dẫn dùng

Muốn 2 document audit **đồng snapshot**: chọn **「MI + Rulebook (cùng snapshot)」** rồi Export một lần.  
Không xuất riêng 2 lần nếu đang so sánh số liệu giữa chúng.
