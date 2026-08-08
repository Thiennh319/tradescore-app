# NEARUSDT V4 rule comparison — backtest

**Generated:** 2026-08-07T02:53:41.433Z
**Symbol:** NEARUSDT
**Engine:** scorerV4 + tradePlanV4 only (no V3, no V4.1)
**Timeframe:** clock=1h; inputs=1h+4h (bắt buộc bởi scorerV4/tradePlanV4)
- csv: D:\Thiennh3\APP\Trading\TradeScore\docs\exports\near_backtest_30d_real.csv
- days: 30
- symbol: NEARUSDT
- ambiguity_threshold: 2.5
- oi_points: 744
- ls_points: 744
- funding_points: 118
- bars_checked: 718
- can_enter_ticks: 47
- oi_real_pct: 100.00
- ls_real_pct: 100.00
- near_1h_bars: 939
- near_4h_bars: 259

## Baseline

| Metric | Value |
|---|---|
| n | 30 |
| Wins / Losses | 26 / 4 |
| Winrate | 86.67% |
| Avg R | 0.65 |
| Sum R | 19.38 |
| Profit factor | 7.92 |
| Expectancy (R) | 0.65 |
| Max DD (R) | 1.51 |

## Filter / rule proposals

| Proposal | n | WR% | PF | Expectancy R | MaxDD R | Overfit risk | Note |
|---|---:|---:|---:|---:|---:|---|---|
| [A] Baseline V4 (canEnter + tradePlanValid) | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Rule gốc — không thêm filter |
| [B] Chỉ VAO_TU_TIN / SETUP_NGON (score≥10) | 23 | 86.96 | 7.90 | 0.69 | 1.00 | TRUNG BÌNH — n<30 | Siết ngưỡng decision (bỏ CO_THE_VAO) |
| [C] Group B ≥ 3.5 (flow mạnh) | 6 | 83.33 | 5.91 | 0.82 | 1.00 | CAO — n<20 | Filter theo nhóm dòng tiền |
| [D] Phiên VN 8h–16h (Asia/EU overlap sớm) | 15 | 86.67 | 5.70 | 0.63 | 1.00 | CAO — n<20 | Session filter theo hourVn tại entry |
| [E] VAO_TU_TIN+ & GroupB≥3.5 | 6 | 83.33 | 5.91 | 0.82 | 1.00 | CAO — n<20 | Kết hợp ngưỡng score + flow |
| [F] Chỉ LONG | 0 | 0.00 | 0.00 | 0.00 | 0.00 | CAO — n<20 | Lọc hướng |
| [G] Chỉ SHORT | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Lọc hướng |
| [H] TRENDING marketMode | 8 | 87.50 | 19.18 | 1.16 | 0.51 | CAO — n<20 | Chỉ khi Bollinger mode TRENDING |
| score ≥ 9 | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN | Siết official/reference score |
| score ≥ 9.5 | 28 | 85.71 | 7.35 | 0.63 | 1.51 | TRUNG BÌNH — n<30 | Siết official/reference score |
| score ≥ 10 | 23 | 86.96 | 7.90 | 0.69 | 1.00 | TRUNG BÌNH — n<30 | Siết official/reference score |
| score ≥ 10.5 | 13 | 84.62 | 9.24 | 0.82 | 1.00 | CAO — n<20 | Siết official/reference score |
| score ≥ 11 | 6 | 83.33 | 6.94 | 0.99 | 1.00 | CAO — n<20 | Siết official/reference score |
| score ≥ 11.5 | 4 | 75.00 | 4.04 | 0.76 | 1.00 | CAO — n<20 | Siết official/reference score |
| l1 ≥ 1 | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l1 ≥ 1.5 | 25 | 88.00 | 8.72 | 0.71 | 1.00 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l1 ≥ 2 | 23 | 91.30 | 13.93 | 0.73 | 1.00 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l2 ≥ 1 | 29 | 86.21 | 7.60 | 0.64 | 1.51 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l2 ≥ 1.5 | 12 | 75.00 | 2.65 | 0.32 | 1.20 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l2 ≥ 2 | 12 | 75.00 | 2.65 | 0.32 | 1.20 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 1 | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 1.5 | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 2 | 21 | 100.00 | ∞ | 0.86 | 0.00 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l5a ≥ 1 | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5a ≥ 1.5 | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5a ≥ 2 | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 1 | 19 | 89.47 | 13.34 | 0.84 | 1.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 1.5 | 10 | 100.00 | ∞ | 1.18 | 0.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 2 | 9 | 100.00 | ∞ | 1.09 | 0.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l6 ≥ 1 | 28 | 85.71 | 7.34 | 0.63 | 1.51 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l6 ≥ 1.5 | 17 | 82.35 | 4.99 | 0.54 | 2.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l7 ≥ 1 | 17 | 82.35 | 4.56 | 0.53 | 1.57 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l7 ≥ 1.5 | 12 | 83.33 | 6.45 | 0.68 | 1.51 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l8 ≥ 1 | 24 | 83.33 | 6.54 | 0.65 | 1.51 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l8 ≥ 1.5 | 20 | 85.00 | 7.04 | 0.69 | 1.00 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l8 ≥ 2 | 14 | 78.57 | 4.45 | 0.56 | 1.06 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 1 | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 1.5 | 21 | 90.48 | 13.06 | 0.74 | 1.00 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 2 | 12 | 91.67 | 9.38 | 0.70 | 1.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l10 ≥ 1 | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l10 ≥ 1.5 | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l10 ≥ 2 | 30 | 86.67 | 7.92 | 0.65 | 1.51 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |

## Kết luận ≥70% WR

Các phương án đạt WR ≥ 70% (sắp xếp theo n giảm dần):

- **[A] Baseline V4 (canEnter + tradePlanValid)**: n=30, WR=86.67%, PF=7.92, overfit=THẤP HƠN (n≥30, vẫn chỉ 90d)
- **[G] Chỉ SHORT**: n=30, WR=86.67%, PF=7.92, overfit=THẤP HƠN (n≥30, vẫn chỉ 90d)
- **score ≥ 9**: n=30, WR=86.67%, PF=7.92, overfit=THẤP HƠN
- **l1 ≥ 1**: n=30, WR=86.67%, PF=7.92, overfit=THẤP HƠN
- **l3 ≥ 1**: n=30, WR=86.67%, PF=7.92, overfit=THẤP HƠN
- **l3 ≥ 1.5**: n=30, WR=86.67%, PF=7.92, overfit=THẤP HƠN
- **l5a ≥ 1**: n=30, WR=86.67%, PF=7.92, overfit=THẤP HƠN
- **l5a ≥ 1.5**: n=30, WR=86.67%, PF=7.92, overfit=THẤP HƠN
- **l5a ≥ 2**: n=30, WR=86.67%, PF=7.92, overfit=THẤP HƠN
- **l9 ≥ 1**: n=30, WR=86.67%, PF=7.92, overfit=THẤP HƠN

Phương án đáng tin hơn cả (n≥30): **[A] Baseline V4 (canEnter + tradePlanValid)** — n=30, WR=86.67%.

## Assumptions / limitations

- Psychology L10: checklist 5/5 giả định operator ready (không mô phỏng tâm lý thật).
- Whale walls rỗng (không có orderbook lịch sử) — L7 thiếu wall confirmation.
- OI / L/S hist Binance ~30 ngày — phần đầu cửa sổ 90d thiếu OI/LS (fallback 0 / ratio=1).
- Exit: TP1 vs SL trên nến 1h; same-bar → SL; timeout theo plan expiryHours (fallback 48 bars).
- L9 session: Date mocked theo openTime nến (getSessionScoreV3 vốn đọc wall-clock).
- Không import / không đọc bất kỳ module v4.1.
