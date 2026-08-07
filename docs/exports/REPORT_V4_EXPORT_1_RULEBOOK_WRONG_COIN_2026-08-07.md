# REPORT — Task V4-EXPORT-1 (Rulebook Export Wrong Coin Data)

**Ngày:** 2026-08-07  
**Hệ thống:** V3/V4 Trace Export (`01_RULEBOOK_*.md`) — **không** phải `services/v41Export/**`

---

## Trạng thái

**DONE** — Bug thật; đã sửa: `context.coin` được tôn trọng khi pick row. Tests PASS.

---

## File export Rulebook V3/V4 nằm ở đâu

| Layer | File |
|-------|------|
| UI chọn coin + gọi export | `components/dashboard/SignalBoard.tsx` (`handleExportAuditPackage`) |
| Đổi tên file theo coin | `services/exportAuditCoin.ts` → `exportFilenameForCoin('01_RULEBOOK.md', coin)` |
| Dispatcher Trace/Review | `services/exportTraceReviewWire.ts` → `exportTraceOrReviewMarkdown('trace-rulebook', …)` |
| Nội dung Rule Trace | `buildRuleTraceMarkdown` → `services/aiExport/ruleTrace/*` (Formatter metadata `Coin` / `Trade ID` / `Rule Version`) |

---

## Nguyên nhân (bằng chứng code)

### UI đã truyền đúng `coin`

```777:790:components/dashboard/SignalBoard.tsx
      for (const coin of coins) {
        const context = {
          rows,
          scorerVersion,
          …
          coin,
        };
        const result =
          auditExportMode === 'trace-rule-score-bundle'
            ? exportRuleScoreBundle(context)
            : exportTraceOrReviewMarkdown(auditExportMode, context);
```

Filename đúng vì:

```795:795:components/dashboard/SignalBoard.tsx
        const filename = exportFilenameForCoin(result.filename, coin);
```

### Nhưng dispatcher **không đọc** `coin`

`TraceReviewExportContext` trước fix **không có field `coin`** (excess property bị TypeScript/nén bỏ khi gọi; runtime object vẫn có `coin` nhưng code không dùng).

Pick row cũ:

```typescript
function pickFrozenRow(rows, scorerVersion): SignalRow | null {
  // 1) first row với canEnter
  // 2) else first !error
  // 3) else rows[0]
}
```

→ Board scan điển hình BTC trước / BTC `canEnter` → nội dung **BTC** dù loop đang export NEAR.

`exportTraceOrReviewMarkdown` cũ:

```typescript
const row = pickFrozenRow(context.rows, context.scorerVersion);
// không truyền context.coin
```

### Phạm vi bug

Mọi coin **không phải** “first enterable / first healthy” (thường BTC) — NEAR, SOL, BNB đều có thể bị gắn nhầm BTC khi `rows` còn nhiều coin. Chỉ “đúng tình cờ” nếu coin được chọn đúng là row pickFrozen chọn.

### Git

- Multi-coin UI / `coin` trên context xuất hiện khoảng `f5cf251` (Signal Board U1 / audit coin).
- `pickFrozenRow` (enterable-first) đã có từ dòng export trace (`5648645`…).  
→ **Gap wiring**: UI thêm `coin` nhưng dispatcher không consume — bug từ lúc ship multi-coin audit export, không phải regression V41.

---

## Đã sửa

| File | Thay đổi |
|------|----------|
| `services/exportTraceReviewWire.ts` | Thêm `coin?` (+ optional openTrades/v41) vào `TraceReviewExportContext`; `pickFrozenRow(..., preferredCoin)` — khi có `coin` thì **chỉ** lấy `rows.find(symbol===coin)` (null nếu thiếu/lỗi), **không** fallback BTC; truyền `context.coin` vào pick |

**Không sửa** `scorerV4.ts` / `signalBoardScan.ts` / `nearV4LayerGates.ts` / `services/v41Export/**`.

---

## Test

| Suite | Kết quả |
|-------|---------|
| `exportAuditCoin.test.ts` (đã có case “forces Coin metadata to selected symbol”) | PASS |
| `exportTraceReviewWire*.test.ts` (batch) | PASS |
| `exportRuleScoreBundle.test.ts` / `aiExport` | PASS (batch chạy kèm) |

Case chính: board 4 coin, `coin: 'NEARUSDT'` → markdown `Coin: NEARUSDT`, không còn `Coin: BTCUSDT`.

---

## Việc còn lại

1. Build APK/Web lại nếu cần ship bản có fix này (chưa nằm trong build `471384b` trước đó).  
2. (Optional) Type-check siết hơn: đừng để excess `coin` im lặng trước khi field được khai báo — đã bổ sung field.

---

## Rủi ro

| Rủi ro | Mức | Ghi chú |
|--------|-----|---------|
| Caller không truyền `coin` + `rows` nhiều coin | Thấp | Vẫn behavior cũ (enterable / first) — đúng legacy single-pick |
| `coin` set nhưng row lỗi/thiếu | Thấp | Export fail `UNAVAILABLE` thay vì nhầm BTC — đúng |
