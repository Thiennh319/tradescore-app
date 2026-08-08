# Task V41-SOL-2 — Baseline TR — SOL 365d + Quarterly Stability

**Ngày:** 2026-08-08  
**Phạm vi:** Baseline Trend Reversal SOL (production SSOT) — **không** đổi threshold/logic

---

## Trạng thái

**DONE** — Đã chạy backtest klines Futures thật, phí 0.18% RT, breakdown theo quý.

---

## Script dùng + điều chỉnh

| Mục | Chi tiết |
|-----|----------|
| Script mới | `scripts/backtest-v41-sol-tr-365d-quarterly.ts` |
| Nguồn logic | Mirror production TR từ `backtest-v41-final-multi-symbol-fees` / `multi-symbol-longer` |
| Vì sao không sửa multi-symbol-longer | Giữ scenario cũ ổn định; SOL-2 cần quarterly + fee rõ ràng |
| Ngày | **365d** (end ≈ 2026-08-08 UTC) |
| Quý | **4 × 91d** (+ halves H1/H2) |
| Data | Binance Futures **1H + 4H** klines thật (`fapi/v1/klines`) |
| Cost | fee **0.08%** + slip **0.10%** = **0.18%** RT (`fee_R = cost%/sl_dist%`) |
| Gate/SSOT | `EXHAUSTION_MIN=28`, `ACTIVE_MIN=3`, `CONFIDENCE_MIN=50`, CVD production, SL `fourHOpenTime`, hold 20×4H, BOTH=loss |

`multi-symbol-longer` trước đó chỉ có **SOL-180d** và **không** tính E[R]/phí — không đủ yêu cầu SOL-2.

---

## Kết quả

### FULL 365d (2025-08-08 → 2026-08-08 UTC)

| Metric | Value |
|--------|------:|
| n_active | **46** |
| decided (TP+SL+BOTH) | 44 |
| wins / losses / both / timeout | 17 / 26 / 1 / 2 |
| **WR** | **38.6%** |
| **E[R] trước phí** | **−0.112** |
| **E[R] sau phí** | **−0.230** (negative) |
| LONG n / WR | 28 / 34.6% |
| SHORT n / WR | 18 / 44.4% |
| mean SL dist % | 2.71 |
| mean fee_R | ~0.12 |

### Theo quý (~91d)

| Slice | Window (UTC date) | n | decided | WR% | E[R] before | E[R] after | sign |
|-------|-------------------|--:|--------:|----:|------------:|-----------:|------|
| Q1 | 2025-08-08 → 2025-11-07 | 8 | 7 | 28.6 | −0.371 | −0.489 | negative |
| Q2 | 2025-11-07 → 2026-02-06 | 14 | 13 | 30.8 | −0.305 | −0.430 | negative |
| Q3 | 2026-02-06 → 2026-05-08 | 9 | 9 | **66.7** | **+0.547** | **+0.425** | **positive** |
| Q4 | 2026-05-08 → 2026-08-08 | 15 | 15 | 33.3 | −0.219 | −0.329 | negative |
| H1 | first half | 22 | 20 | 30.0 | −0.328 | −0.451 | negative |
| H2 | second half | 24 | 24 | 45.8 | +0.068 | −0.046 | negative |

---

## Nhận xét ổn định

- **Không ổn định qua các quý:** WR spread **38.1 pp** (28.6% → 66.7%); chỉ **1/4 quý** E[R] sau phí > 0 (Q3).
- Full-year âm chủ yếu do Q1/Q2/Q4; Q3 mạnh nhưng n nhỏ (9) → dễ “kéo” cảm nhận nếu chỉ nhìn một đoạn.
- H1 tệ hơn H2 về WR; cả hai halves vẫn E[R] sau phí ≤ 0.
- n tổng 46 / quý ~8–15 → nhiễu thống kê cao; baseline định hướng “TR SOL hiện tại **không** edge dương sau phí trên 365d”, không phải verdict đóng cửa vĩnh viễn.

### NEAR breakout (tham khảo, khác chiến lược)

Prior Confirm B NEAR ~365d research (time-stability REF): WR ≈ **53.3%**, E[R] ≈ **0.25**, n≈31 — **không** so sánh apple-to-apple với TR SOL.

---

## File kết quả

| File |
|------|
| `docs/exports/v41-sol-tr-365d-quarterly.csv` |
| `docs/exports/v41-sol-tr-365d-quarterly-trades.csv` |
| `docs/exports/v41-sol-tr-365d-quarterly-summary.json` |
| `docs/exports/REPORT_V41_SOL_2_BASELINE_TR_365D_QUARTERLY_2026-08-08.md` |
| `scripts/backtest-v41-sol-tr-365d-quarterly.ts` |

---

## Việc còn lại

1. **V41-SOL-3 (đề xuất):** backtest SOL **breakout** Confirm B 365d + quarterly cùng cost model → so với baseline TR này.  
2. Nếu breakout thắng rõ + OOS ổn → xét thêm SOL vào `SYMBOLS_USING_BREAKOUT_STRATEGY` (task riêng).  
3. (Tuỳ chọn) Re-run NEAR Confirm B production-parity cùng cửa sổ end-date để đối chiếu fresher.

---

## Task ID

**V41-SOL-2** (Baseline TR — SOL 365d + Quarterly Stability).
