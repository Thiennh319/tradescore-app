# NEARUSDT V4 rule comparison — backtest

**Generated:** 2026-08-07T02:53:18.594Z
**Symbol:** NEARUSDT
**Engine:** scorerV4 + tradePlanV4 only (no V3, no V4.1)
**Timeframe:** clock=1h; inputs=1h+4h (bắt buộc bởi scorerV4/tradePlanV4)
- csv: D:\Thiennh3\APP\Trading\TradeScore\docs\exports\near_backtest_90d.csv
- days: 90
- symbol: NEARUSDT
- ambiguity_threshold: 2.5
- oi_points: 744
- ls_points: 744
- funding_points: 298
- bars_checked: 2158
- can_enter_ticks: 167
- oi_real_pct: 34.38
- ls_real_pct: 34.38
- near_1h_bars: 2379
- near_4h_bars: 619

## Baseline

| Metric | Value |
|---|---|
| n | 69 |
| Wins / Losses | 48 / 21 |
| Winrate | 69.57% |
| Avg R | 0.42 |
| Sum R | 29.23 |
| Profit factor | 4.03 |
| Expectancy (R) | 0.42 |
| Max DD (R) | 2.00 |

## Filter / rule proposals

| Proposal | n | WR% | PF | Expectancy R | MaxDD R | Overfit risk | Note |
|---|---:|---:|---:|---:|---:|---|---|
| [A] Baseline V4 (canEnter + tradePlanValid) | 69 | 69.57 | 4.03 | 0.42 | 2.00 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Rule gốc — không thêm filter |
| [B] Chỉ VAO_TU_TIN / SETUP_NGON (score≥10) | 54 | 68.52 | 4.07 | 0.45 | 1.73 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Siết ngưỡng decision (bỏ CO_THE_VAO) |
| [C] Group B ≥ 3.5 (flow mạnh) | 9 | 77.78 | 3.46 | 0.55 | 1.00 | CAO — n<20 | Filter theo nhóm dòng tiền |
| [D] Phiên VN 8h–16h (Asia/EU overlap sớm) | 31 | 77.42 | 6.61 | 0.47 | 1.11 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Session filter theo hourVn tại entry |
| [E] VAO_TU_TIN+ & GroupB≥3.5 | 8 | 75.00 | 3.13 | 0.53 | 1.18 | CAO — n<20 | Kết hợp ngưỡng score + flow |
| [F] Chỉ LONG | 10 | 50.00 | 0.80 | -0.05 | 2.00 | CAO — n<20 | Lọc hướng |
| [G] Chỉ SHORT | 59 | 72.88 | 5.12 | 0.50 | 1.82 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Lọc hướng |
| [H] TRENDING marketMode | 25 | 76.00 | 6.98 | 0.68 | 1.00 | TRUNG BÌNH — n<30 | Chỉ khi Bollinger mode TRENDING |
| score ≥ 9 | 69 | 69.57 | 4.03 | 0.42 | 2.00 | THẤP HƠN | Siết official/reference score |
| score ≥ 9.5 | 63 | 68.25 | 4.16 | 0.43 | 1.82 | THẤP HƠN | Siết official/reference score |
| score ≥ 10 | 54 | 68.52 | 4.07 | 0.45 | 1.73 | THẤP HƠN | Siết official/reference score |
| score ≥ 10.5 | 37 | 67.57 | 4.08 | 0.46 | 1.55 | THẤP HƠN | Siết official/reference score |
| score ≥ 11 | 19 | 73.68 | 4.32 | 0.66 | 1.01 | CAO — n<20 | Siết official/reference score |
| score ≥ 11.5 | 9 | 66.67 | 2.25 | 0.42 | 2.00 | CAO — n<20 | Siết official/reference score |
| l1 ≥ 1.5 | 55 | 70.91 | 4.51 | 0.49 | 2.00 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l1 ≥ 2 | 52 | 73.08 | 5.11 | 0.50 | 2.00 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 1.5 | 67 | 71.64 | 4.55 | 0.45 | 1.82 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 2 | 46 | 82.61 | 14.61 | 0.65 | 0.95 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 1 | 32 | 78.13 | 5.38 | 0.69 | 2.27 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 1.5 | 9 | 100.00 | ∞ | 1.16 | 0.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 2 | 8 | 100.00 | ∞ | 1.05 | 0.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l6 ≥ 1.5 | 38 | 71.05 | 4.13 | 0.45 | 2.11 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l7 ≥ 1.5 | 13 | 76.92 | 6.01 | 0.62 | 1.62 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 1.5 | 49 | 73.47 | 5.02 | 0.48 | 2.10 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 2 | 28 | 82.14 | 7.90 | 0.55 | 1.15 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |

## Kết luận ≥70% WR

Các phương án đạt WR ≥ 70% (sắp xếp theo n giảm dần):

- **l3 ≥ 1.5**: n=67, WR=71.64%, PF=4.55, overfit=THẤP HƠN
- **[G] Chỉ SHORT**: n=59, WR=72.88%, PF=5.12, overfit=THẤP HƠN (n≥30, vẫn chỉ 90d)
- **l1 ≥ 1.5**: n=55, WR=70.91%, PF=4.51, overfit=THẤP HƠN
- **l1 ≥ 2**: n=52, WR=73.08%, PF=5.11, overfit=THẤP HƠN
- **l9 ≥ 1.5**: n=49, WR=73.47%, PF=5.02, overfit=THẤP HƠN
- **l3 ≥ 2**: n=46, WR=82.61%, PF=14.61, overfit=THẤP HƠN
- **l6 ≥ 1.5**: n=38, WR=71.05%, PF=4.13, overfit=THẤP HƠN
- **l5b ≥ 1**: n=32, WR=78.13%, PF=5.38, overfit=THẤP HƠN
- **[D] Phiên VN 8h–16h (Asia/EU overlap sớm)**: n=31, WR=77.42%, PF=6.61, overfit=THẤP HƠN (n≥30, vẫn chỉ 90d)
- **l9 ≥ 2**: n=28, WR=82.14%, PF=7.90, overfit=TRUNG BÌNH

Phương án đáng tin hơn cả (n≥30): **l3 ≥ 1.5** — n=67, WR=71.64%.

## Assumptions / limitations

- Psychology L10: checklist 5/5 giả định operator ready (không mô phỏng tâm lý thật).
- Whale walls rỗng (không có orderbook lịch sử) — L7 thiếu wall confirmation.
- OI / L/S hist Binance ~30 ngày — phần đầu cửa sổ 90d thiếu OI/LS (fallback 0 / ratio=1).
- Exit: TP1 vs SL trên nến 1h; same-bar → SL; timeout theo plan expiryHours (fallback 48 bars).
- L9 session: Date mocked theo openTime nến (getSessionScoreV3 vốn đọc wall-clock).
- Không import / không đọc bất kỳ module v4.1.
