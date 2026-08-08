# REPORT — Xác nhận cửa sổ NEAR verify FIX_HARD_REASON_LABELING (180d thật)

**Ngày:** 2026-08-08  
**Phạm vi:** Chỉ đọc code — không sửa production.  
**Nguồn hỏi:** `scripts/verify-fix-hard-reason-labeling-near-180d.ts` + `loadMarketBundle` trong `scripts/backtest-v4-near-90d.ts`.

---

## 1. Tham số truyền vào `loadMarketBundle`

Caller:

```34:35:scripts/verify-fix-hard-reason-labeling-near-180d.ts
const DAYS = 180;
const SYMBOL = 'NEARUSDT' as const;
```

```152:152:scripts/verify-fix-hard-reason-labeling-near-180d.ts
  const bundle = await loadMarketBundle(SYMBOL, DAYS);
```

Bên trong `loadMarketBundle` (không phải ngày ISO cố định — tính từ `Date.now()`):

```1538:1545:scripts/backtest-v4-near-90d.ts
export async function loadMarketBundle(
  symbol: AppTradeSymbol,
  days: number,
): Promise<MarketBundle> {
  const endMs = Date.now();
  const windowStartMs = endMs - days * 86_400_000;
  const fetchStart1h = windowStartMs - WARMUP_1H * MS_1H;
  const fetchStart4h = windowStartMs - 80 * MS_4H;
```

| Tham số | Giá trị |
|---------|---------|
| `symbol` | `'NEARUSDT'` |
| `days` | **180** |
| Cửa sổ score | `endMs - 180 × 86_400_000` → `endMs` |
| Fetch 1H bắt đầu | `windowStartMs - WARMUP_1H × MS_1H` với `WARMUP_1H = 220` |

---

## 2. 4318 signal ↔ khoảng thời gian thực

Khung đánh giá trong `buildBarEvalCache`: **1H** (`sym1h`).

\[
4318 \times 1\text{ giờ} / 24 = 179{,}9167… \approx \mathbf{180\ \text{ngày}}
\]

Log chạy verify (2026-08-08):

| Metric | Value |
|--------|------:|
| Fetch 1H bars | 4539 (gồm warmup) |
| Signals evaluated | **4318** |
| Ước lượng span | ≈ **180 ngày** 1H |

(~220 nến warmup + bỏ nến cuối giải thích chênh `4539` fetch vs `4318` eval.)

---

## 3. Thật 180 ngày hay chỉ 90 (tên file “180d” nhầm)?

### **Thật ~180 ngày 1H — không phải 90.**

Lý do:

1. Verify truyền `DAYS = 180` tường minh — không dùng default 90 của suite.  
2. Tên file `backtest-v4-near-90d.ts` là tên suite cũ (`DEFAULT_DAYS = 90`); CLI vẫn hỗ trợ `--days 180`. Verify **gọi shared helpers** với `days=180`.  
3. 4318 nến 1H ≈ 180d; **không** khớp 90d (≈ 2160 nến 1H).

---

## Kết luận

Cửa sổ A/B labeling NEAR trong report `REPORT_FIX_HARD_REASON_LABELING_NEAR_180D_AB_2026-08-08.md` là **~180 ngày thật trên khung 1H**, không phải nhầm từ suite 90d.

---

## Task ID

**REPORT-NEAR-180D-WINDOW-CONFIRM** · 2026-08-08 · report-only
