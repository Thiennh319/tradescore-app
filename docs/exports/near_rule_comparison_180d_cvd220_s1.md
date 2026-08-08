# NEAR V4 rule comparison — 90d backtest

**Generated:** 2026-08-02T14:22:13.045Z
**Symbol:** NEARUSDT
**Engine:** scorerV4 + tradePlanV4 only (no V3, no V4.1)
**Timeframe:** clock=1h; inputs=1h+4h (bắt buộc bởi scorerV4/tradePlanV4)
- csv: D:\Thiennh3\APP\Trading\TradeScore\docs\exports\near_backtest_180d_cvd220_s1.csv
- days: 180
- oi_points: 744
- ls_points: 744
- funding_points: 567
- bars_checked: 3470
- can_enter_ticks: 348
- oi_real_pct: 16.74
- ls_real_pct: 16.74
- near_1h_bars: 4539
- near_4h_bars: 1159

## Baseline

| Metric | Value |
|---|---|
| n | 173 |
| Wins / Losses | 130 / 43 |
| Winrate | 75.14% |
| Avg R | 0.44 |
| Sum R | 75.42 |
| Profit factor | 4.72 |
| Expectancy (R) | 0.44 |
| Max DD (R) | 2.52 |

## Filter / rule proposals

| Proposal | n | WR% | PF | Expectancy R | MaxDD R | Overfit risk | Note |
|---|---:|---:|---:|---:|---:|---|---|
| [A] Baseline V4 (canEnter + tradePlanValid) | 173 | 75.14 | 4.72 | 0.44 | 2.52 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Rule gốc — không thêm filter |
| [B] Chỉ VAO_TU_TIN / SETUP_NGON (score≥10) | 134 | 76.12 | 4.96 | 0.48 | 2.44 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Siết ngưỡng decision (bỏ CO_THE_VAO) |
| [C] Group B ≥ 3.5 (flow mạnh) | 10 | 70.00 | 2.09 | 0.33 | 2.18 | CAO — n<20 | Filter theo nhóm dòng tiền |
| [D] Phiên VN 8h–16h (Asia/EU overlap sớm) | 83 | 80.72 | 5.77 | 0.46 | 1.38 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Session filter theo hourVn tại entry |
| [E] VAO_TU_TIN+ & GroupB≥3.5 | 10 | 70.00 | 2.09 | 0.33 | 2.18 | CAO — n<20 | Kết hợp ngưỡng score + flow |
| [F] Chỉ LONG | 29 | 68.97 | 3.74 | 0.38 | 2.00 | TRUNG BÌNH — n<30 | Lọc hướng |
| [G] Chỉ SHORT | 144 | 76.39 | 4.96 | 0.45 | 2.52 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Lọc hướng |
| [H] TRENDING marketMode | 54 | 81.48 | 9.28 | 0.79 | 1.00 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Chỉ khi Bollinger mode TRENDING |
| score ≥ 9 | 173 | 75.14 | 4.72 | 0.44 | 2.52 | THẤP HƠN | Siết official/reference score |
| score ≥ 9.5 | 156 | 75.00 | 4.67 | 0.45 | 2.52 | THẤP HƠN | Siết official/reference score |
| score ≥ 10 | 134 | 76.12 | 4.96 | 0.48 | 2.44 | THẤP HƠN | Siết official/reference score |
| score ≥ 10.5 | 87 | 75.86 | 5.61 | 0.54 | 1.78 | THẤP HƠN | Siết official/reference score |
| score ≥ 11 | 53 | 71.70 | 4.77 | 0.56 | 1.18 | THẤP HƠN | Siết official/reference score |
| score ≥ 11.5 | 24 | 58.33 | 2.27 | 0.34 | 2.18 | TRUNG BÌNH — n<30 | Siết official/reference score |
| l1 ≥ 1 | 163 | 74.85 | 4.85 | 0.45 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l1 ≥ 1.5 | 119 | 73.95 | 5.29 | 0.51 | 2.00 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l1 ≥ 2 | 114 | 74.56 | 5.80 | 0.53 | 2.00 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l2 ≥ 1 | 171 | 74.85 | 4.62 | 0.43 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 1 | 173 | 75.14 | 4.72 | 0.44 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 1.5 | 166 | 75.90 | 4.95 | 0.45 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 2 | 110 | 80.91 | 9.00 | 0.60 | 1.01 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l4 ≥ 1 | 63 | 71.43 | 3.77 | 0.32 | 1.45 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5a ≥ 1 | 173 | 75.14 | 4.72 | 0.44 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5a ≥ 1.5 | 171 | 75.44 | 4.70 | 0.44 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5a ≥ 2 | 171 | 75.44 | 4.70 | 0.44 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 1 | 57 | 73.68 | 4.45 | 0.50 | 3.55 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 1.5 | 9 | 88.89 | 9.32 | 0.92 | 1.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 2 | 8 | 87.50 | 7.32 | 0.79 | 1.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l6 ≥ 1 | 149 | 75.17 | 4.74 | 0.45 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l6 ≥ 1.5 | 86 | 76.74 | 5.45 | 0.50 | 2.00 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l7 ≥ 1 | 159 | 73.58 | 4.22 | 0.40 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l7 ≥ 1.5 | 15 | 80.00 | 4.11 | 0.52 | 1.74 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l8 ≥ 1 | 142 | 77.46 | 4.92 | 0.47 | 2.94 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l8 ≥ 1.5 | 108 | 78.70 | 5.09 | 0.52 | 1.78 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l8 ≥ 2 | 71 | 78.87 | 4.27 | 0.50 | 1.78 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 1 | 173 | 75.14 | 4.72 | 0.44 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 1.5 | 132 | 74.24 | 5.22 | 0.46 | 2.60 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 2 | 87 | 74.71 | 5.85 | 0.45 | 2.31 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l10 ≥ 1 | 173 | 75.14 | 4.72 | 0.44 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l10 ≥ 1.5 | 173 | 75.14 | 4.72 | 0.44 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l10 ≥ 2 | 173 | 75.14 | 4.72 | 0.44 | 2.52 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |

## Kết luận ≥70% WR

Các phương án đạt WR ≥ 70% (sắp xếp theo n giảm dần):

- **[A] Baseline V4 (canEnter + tradePlanValid)**: n=173, WR=75.14%, PF=4.72, overfit=THẤP HƠN (n≥30, vẫn chỉ 90d)
- **score ≥ 9**: n=173, WR=75.14%, PF=4.72, overfit=THẤP HƠN
- **l3 ≥ 1**: n=173, WR=75.14%, PF=4.72, overfit=THẤP HƠN
- **l5a ≥ 1**: n=173, WR=75.14%, PF=4.72, overfit=THẤP HƠN
- **l9 ≥ 1**: n=173, WR=75.14%, PF=4.72, overfit=THẤP HƠN
- **l10 ≥ 1**: n=173, WR=75.14%, PF=4.72, overfit=THẤP HƠN
- **l10 ≥ 1.5**: n=173, WR=75.14%, PF=4.72, overfit=THẤP HƠN
- **l10 ≥ 2**: n=173, WR=75.14%, PF=4.72, overfit=THẤP HƠN
- **l2 ≥ 1**: n=171, WR=74.85%, PF=4.62, overfit=THẤP HƠN
- **l5a ≥ 1.5**: n=171, WR=75.44%, PF=4.70, overfit=THẤP HƠN

Phương án đáng tin hơn cả (n≥30): **[A] Baseline V4 (canEnter + tradePlanValid)** — n=173, WR=75.14%.

## Assumptions / limitations

- Psychology L10: checklist 5/5 giả định operator ready (không mô phỏng tâm lý thật).
- Whale walls rỗng (không có orderbook lịch sử) — L7 thiếu wall confirmation.
- OI / L/S hist Binance ~30 ngày — phần đầu cửa sổ 90d thiếu OI/LS (fallback 0 / ratio=1).
- Exit: TP1 vs SL trên nến 1h; same-bar → SL; timeout theo plan expiryHours (fallback 48 bars).
- L9 session: Date mocked theo openTime nến (getSessionScoreV3 vốn đọc wall-clock).
- Không import / không đọc bất kỳ module v4.1.
