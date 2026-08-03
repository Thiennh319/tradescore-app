# NEARUSDT V4 rule comparison — backtest

**Generated:** 2026-08-02T16:39:21.976Z
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
- can_enter_ticks: 45
- oi_real_pct: 100.00
- ls_real_pct: 100.00
- near_1h_bars: 939
- near_4h_bars: 259

## Baseline

| Metric | Value |
|---|---|
| n | 28 |
| Wins / Losses | 20 / 8 |
| Winrate | 71.43% |
| Avg R | 0.52 |
| Sum R | 14.66 |
| Profit factor | 4.15 |
| Expectancy (R) | 0.52 |
| Max DD (R) | 1.75 |

## Filter / rule proposals

| Proposal | n | WR% | PF | Expectancy R | MaxDD R | Overfit risk | Note |
|---|---:|---:|---:|---:|---:|---|---|
| [A] Baseline V4 (canEnter + tradePlanValid) | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH — n<30 | Rule gốc — không thêm filter |
| [B] Chỉ VAO_TU_TIN / SETUP_NGON (score≥10) | 22 | 68.18 | 3.84 | 0.54 | 1.75 | TRUNG BÌNH — n<30 | Siết ngưỡng decision (bỏ CO_THE_VAO) |
| [C] Group B ≥ 3.5 (flow mạnh) | 8 | 62.50 | 2.67 | 0.46 | 1.74 | CAO — n<20 | Filter theo nhóm dòng tiền |
| [D] Phiên VN 8h–16h (Asia/EU overlap sớm) | 15 | 73.33 | 3.99 | 0.53 | 1.11 | CAO — n<20 | Session filter theo hourVn tại entry |
| [E] VAO_TU_TIN+ & GroupB≥3.5 | 8 | 62.50 | 2.67 | 0.46 | 1.74 | CAO — n<20 | Kết hợp ngưỡng score + flow |
| [F] Chỉ LONG | 0 | 0.00 | 0.00 | 0.00 | 0.00 | CAO — n<20 | Lọc hướng |
| [G] Chỉ SHORT | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH — n<30 | Lọc hướng |
| [H] TRENDING marketMode | 9 | 77.78 | 14.58 | 1.09 | 0.51 | CAO — n<20 | Chỉ khi Bollinger mode TRENDING |
| score ≥ 9 | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH — n<30 | Siết official/reference score |
| score ≥ 9.5 | 27 | 70.37 | 3.95 | 0.51 | 1.75 | TRUNG BÌNH — n<30 | Siết official/reference score |
| score ≥ 10 | 22 | 68.18 | 3.84 | 0.54 | 1.75 | TRUNG BÌNH — n<30 | Siết official/reference score |
| score ≥ 10.5 | 15 | 73.33 | 5.15 | 0.66 | 1.11 | CAO — n<20 | Siết official/reference score |
| score ≥ 11 | 10 | 80.00 | 5.05 | 0.81 | 1.00 | CAO — n<20 | Siết official/reference score |
| score ≥ 11.5 | 5 | 60.00 | 2.02 | 0.41 | 1.53 | CAO — n<20 | Siết official/reference score |
| l1 ≥ 1 | 27 | 74.07 | 5.28 | 0.58 | 1.62 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l1 ≥ 1.5 | 20 | 80.00 | 7.26 | 0.75 | 1.11 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l1 ≥ 2 | 18 | 83.33 | 11.02 | 0.78 | 1.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l2 ≥ 1 | 27 | 70.37 | 3.96 | 0.51 | 1.75 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 1 | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 1.5 | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l3 ≥ 2 | 18 | 77.78 | 8.17 | 0.74 | 1.75 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l5a ≥ 1 | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l5a ≥ 1.5 | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l5a ≥ 2 | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 1 | 18 | 77.78 | 6.51 | 0.77 | 1.21 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 1.5 | 10 | 80.00 | 7.68 | 0.81 | 1.21 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l5b ≥ 2 | 8 | 87.50 | 7.32 | 0.79 | 1.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l6 ≥ 1 | 27 | 70.37 | 4.03 | 0.52 | 1.75 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l8 ≥ 1.5 | 21 | 76.19 | 4.77 | 0.61 | 1.11 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l8 ≥ 2 | 15 | 73.33 | 3.28 | 0.50 | 1.06 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 1 | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 1.5 | 18 | 77.78 | 5.67 | 0.65 | 1.21 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l9 ≥ 2 | 9 | 88.89 | 8.53 | 0.84 | 1.00 | CAO — n<20, nghi overfit | Filter layer auto (WR≥70 trên mẫu) |
| l10 ≥ 1 | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l10 ≥ 1.5 | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |
| l10 ≥ 2 | 28 | 71.43 | 4.15 | 0.52 | 1.75 | TRUNG BÌNH | Filter layer auto (WR≥70 trên mẫu) |

## Kết luận ≥70% WR

Các phương án đạt WR ≥ 70% (sắp xếp theo n giảm dần):

- **[A] Baseline V4 (canEnter + tradePlanValid)**: n=28, WR=71.43%, PF=4.15, overfit=TRUNG BÌNH — n<30
- **[G] Chỉ SHORT**: n=28, WR=71.43%, PF=4.15, overfit=TRUNG BÌNH — n<30
- **score ≥ 9**: n=28, WR=71.43%, PF=4.15, overfit=TRUNG BÌNH — n<30
- **l3 ≥ 1**: n=28, WR=71.43%, PF=4.15, overfit=TRUNG BÌNH
- **l3 ≥ 1.5**: n=28, WR=71.43%, PF=4.15, overfit=TRUNG BÌNH
- **l5a ≥ 1**: n=28, WR=71.43%, PF=4.15, overfit=TRUNG BÌNH
- **l5a ≥ 1.5**: n=28, WR=71.43%, PF=4.15, overfit=TRUNG BÌNH
- **l5a ≥ 2**: n=28, WR=71.43%, PF=4.15, overfit=TRUNG BÌNH
- **l9 ≥ 1**: n=28, WR=71.43%, PF=4.15, overfit=TRUNG BÌNH
- **l10 ≥ 1**: n=28, WR=71.43%, PF=4.15, overfit=TRUNG BÌNH

⚠️ Tất cả phương án ≥70% đều có **n < 30** — **không đủ tin cậy thống kê**; cần test 180–365 ngày trước khi dùng live.

## Assumptions / limitations

- Psychology L10: checklist 5/5 giả định operator ready (không mô phỏng tâm lý thật).
- Whale walls rỗng (không có orderbook lịch sử) — L7 thiếu wall confirmation.
- OI / L/S hist Binance ~30 ngày — phần đầu cửa sổ 90d thiếu OI/LS (fallback 0 / ratio=1).
- Exit: TP1 vs SL trên nến 1h; same-bar → SL; timeout theo plan expiryHours (fallback 48 bars).
- L9 session: Date mocked theo openTime nến (getSessionScoreV3 vốn đọc wall-clock).
- Không import / không đọc bất kỳ module v4.1.
