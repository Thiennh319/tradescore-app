# NEARUSDT V4 rule comparison — backtest

**Generated:** 2026-08-02T16:39:26.711Z
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
- can_enter_ticks: 162
- oi_real_pct: 34.38
- ls_real_pct: 34.38
- near_1h_bars: 2379
- near_4h_bars: 619

## Baseline

| Metric | Value |
|---|---|
| n | 64 |
| Wins / Losses | 43 / 21 |
| Winrate | 67.19% |
| Avg R | 0.40 |
| Sum R | 25.67 |
| Profit factor | 3.48 |
| Expectancy (R) | 0.40 |
| Max DD (R) | 2.53 |

## Filter / rule proposals

| Proposal | n | WR% | PF | Expectancy R | MaxDD R | Overfit risk | Note |
|---|---:|---:|---:|---:|---:|---|---|
| [A] Baseline V4 (canEnter + tradePlanValid) | 64 | 67.19 | 3.48 | 0.40 | 2.53 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Rule gốc — không thêm filter |
| [B] Chỉ VAO_TU_TIN / SETUP_NGON (score≥10) | 52 | 65.38 | 3.48 | 0.42 | 2.53 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Siết ngưỡng decision (bỏ CO_THE_VAO) |
| [C] Group B ≥ 3.5 (flow mạnh) | 11 | 63.64 | 2.15 | 0.34 | 1.74 | CAO — n<20 | Filter theo nhóm dòng tiền |
| [D] Phiên VN 8h–16h (Asia/EU overlap sớm) | 29 | 75.86 | 5.26 | 0.44 | 1.11 | TRUNG BÌNH — n<30 | Session filter theo hourVn tại entry |
| [E] VAO_TU_TIN+ & GroupB≥3.5 | 10 | 60.00 | 1.95 | 0.30 | 2.39 | CAO — n<20 | Kết hợp ngưỡng score + flow |
| [F] Chỉ LONG | 10 | 60.00 | 1.24 | 0.06 | 2.00 | CAO — n<20 | Lọc hướng |
| [G] Chỉ SHORT | 54 | 68.52 | 4.13 | 0.46 | 2.53 | THẤP HƠN (n≥30, vẫn chỉ 90d) | Lọc hướng |
| [H] TRENDING marketMode | 25 | 76.00 | 8.80 | 0.72 | 1.00 | TRUNG BÌNH — n<30 | Chỉ khi Bollinger mode TRENDING |
| score ≥ 9 | 64 | 67.19 | 3.48 | 0.40 | 2.53 | THẤP HƠN | Siết official/reference score |
| score ≥ 9.5 | 60 | 66.67 | 3.68 | 0.42 | 2.53 | THẤP HƠN | Siết official/reference score |
| score ≥ 10 | 52 | 65.38 | 3.48 | 0.42 | 2.53 | THẤP HƠN | Siết official/reference score |
| score ≥ 10.5 | 35 | 68.57 | 3.75 | 0.45 | 1.78 | THẤP HƠN | Siết official/reference score |
| score ≥ 11 | 20 | 75.00 | 4.03 | 0.61 | 1.01 | TRUNG BÌNH — n<30 | Siết official/reference score |
| score ≥ 11.5 | 9 | 55.56 | 1.61 | 0.27 | 2.00 | CAO — n<20 | Siết official/reference score |
| l1 ≥ 1.5 | 51 | 70.59 | 4.35 | 0.50 | 2.00 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l1 ≥ 2 | 48 | 72.92 | 4.93 | 0.51 | 2.00 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 2 | 42 | 78.57 | 9.84 | 0.63 | 1.75 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 1 | 32 | 71.88 | 4.04 | 0.59 | 2.27 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 1.5 | 10 | 80.00 | 7.68 | 0.81 | 1.21 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 2 | 8 | 87.50 | 7.32 | 0.79 | 1.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 1.5 | 44 | 72.73 | 4.51 | 0.48 | 2.10 | THẤP HƠN | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 2 | 26 | 80.77 | 7.56 | 0.57 | 1.15 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |

## Kết luận ≥70% WR

Các phương án đạt WR ≥ 70% (sắp xếp theo n giảm dần):

- **l1 ≥ 1.5**: n=51, WR=70.59%, PF=4.35, overfit=THẤP HƠN
- **l1 ≥ 2**: n=48, WR=72.92%, PF=4.93, overfit=THẤP HƠN
- **l9 ≥ 1.5**: n=44, WR=72.73%, PF=4.51, overfit=THẤP HƠN
- **l3 ≥ 2**: n=42, WR=78.57%, PF=9.84, overfit=THẤP HƠN
- **l5b ≥ 1**: n=32, WR=71.88%, PF=4.04, overfit=THẤP HƠN
- **[D] Phiên VN 8h–16h (Asia/EU overlap sớm)**: n=29, WR=75.86%, PF=5.26, overfit=TRUNG BÌNH — n<30
- **l9 ≥ 2**: n=26, WR=80.77%, PF=7.56, overfit=TRUNG BÌNH
- **[H] TRENDING marketMode**: n=25, WR=76.00%, PF=8.80, overfit=TRUNG BÌNH — n<30
- **score ≥ 11**: n=20, WR=75.00%, PF=4.03, overfit=TRUNG BÌNH — n<30
- **l5b ≥ 1.5**: n=10, WR=80.00%, PF=7.68, overfit=CAO — n<20, nghi overfit

Phương án đáng tin hơn cả (n≥30): **l1 ≥ 1.5** — n=51, WR=70.59%.

## Assumptions / limitations

- Psychology L10: checklist 5/5 giả định operator ready (không mô phỏng tâm lý thật).
- Whale walls rỗng (không có orderbook lịch sử) — L7 thiếu wall confirmation.
- OI / L/S hist Binance ~30 ngày — phần đầu cửa sổ 90d thiếu OI/LS (fallback 0 / ratio=1).
- Exit: TP1 vs SL trên nến 1h; same-bar → SL; timeout theo plan expiryHours (fallback 48 bars).
- L9 session: Date mocked theo openTime nến (getSessionScoreV3 vốn đọc wall-clock).
- Không import / không đọc bất kỳ module v4.1.
