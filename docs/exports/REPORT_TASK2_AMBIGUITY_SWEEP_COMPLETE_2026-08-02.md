# TASK 2/3 — Ambiguity sweep hoàn tất (tooling + Part A)

**Ngày:** 2026-08-02  
**Phạm vi:** Chỉ mở rộng `scripts/backtest-v4-near-90d.ts` (+ harness vitest). **Không** sửa `scorerV4.ts` / `directionAmbiguity.ts`. Phần B UI: không đụng.

---

## 1. Tooling đã làm

| Mục | Cách làm |
|-----|----------|
| Generic `--symbol` | 1 script dùng chung (`BTC\|SOL\|BNB\|NEAR` / `*USDT`) — **không** clone 4 file |
| Ambiguity live | thr=**1.0** gọi production `resolveDirectionAmbiguity`; thr khác = mirror hysteresis 2-scan với ngưỡng param (không sửa production) |
| Reject entry | `enterOk = canEnterV4 && status !== 'AMBIGUOUS'` (≈ `applyAmbiguityToSnapshot`) |
| Sweep | `--sweep-ambiguity` / `runAmbiguitySweep`; load data 1 lần/coin → cache bar score → replay 5 thr |
| CSV | thêm `longScore,shortScore,scoreDiff,ambiguityStatus,ambiguityThreshold` |
| NEAR S1 | scorer live gate; verify CSV thr=1.0: **0** SHORT với `l3 < 1.5` |

Chạy: `npx vitest run scripts/sweep-v4-ambiguity-180d.test.ts`  
Output: `docs/exports/ambiguity-sweep-180d/`

---

## 2. Bảng sweep 180d (4 coin × 5 thr)

**EV** = mean `resultR`. **% mất** = `(n@1.0 − n@thr) / n@1.0`.  
**n/tháng** = n / (180/30).

| Coin | Thr | n | n/tháng | WR% | EV | LONG n/WR%/EV | SHORT n/WR%/EV | % mất vs 1.0 |
|------|----:|--:|--------:|----:|---:|---|---|---:|
| BTC | 1.0 | 349 | 58.17 | 75.36 | 0.511 | 176/76.1/0.440 | 173/74.6/0.584 | 0 |
| BTC | 1.5 | 331 | 55.17 | 77.64 | 0.556 | 165/80.0/0.498 | 166/75.3/0.613 | 5.2 |
| BTC | 2.0 | 319 | 53.17 | 78.37 | 0.582 | 160/78.1/0.496 | 159/78.6/0.668 | 8.6 |
| BTC | 2.5 | 308 | 51.33 | 79.87 | 0.604 | 155/78.1/0.495 | 153/81.7/0.715 | 11.8 |
| BTC | 3.0 | 289 | 48.17 | 79.58 | 0.633 | 144/76.4/0.502 | 145/82.8/0.762 | 17.2 |
| NEAR | 1.0 | 166 | 27.67 | 75.90 | 0.455 | 27/70.4/0.413 | 139/77.0/0.463 | 0 |
| NEAR | 1.5 | 156 | 26.00 | 76.28 | 0.460 | 27/70.4/0.413 | 129/77.5/0.470 | 6.0 |
| NEAR | 2.0 | 153 | 25.50 | 76.47 | 0.477 | 27/70.4/0.416 | 126/77.8/0.490 | 7.8 |
| NEAR | 2.5 | 142 | 23.67 | 75.35 | 0.512 | 25/72.0/0.461 | 117/76.1/0.523 | 14.5 |
| NEAR | 3.0 | 132 | 22.00 | 77.27 | 0.565 | 25/72.0/0.458 | 107/78.5/0.589 | 20.5 |
| SOL | 1.0 | 255 | 42.50 | 69.02 | 0.422 | 99/67.7/0.437 | 156/69.9/0.413 | 0 |
| SOL | 1.5 | 239 | 39.83 | 72.38 | 0.475 | 91/73.6/0.530 | 148/71.6/0.441 | 6.3 |
| SOL | 2.0 | 232 | 38.67 | 73.71 | 0.505 | 85/76.5/0.575 | 147/72.1/0.465 | 9.0 |
| SOL | 2.5 | 221 | 36.83 | 75.11 | 0.539 | 83/75.9/0.575 | 138/74.6/0.518 | 13.3 |
| SOL | 3.0 | 201 | 33.50 | 78.11 | 0.613 | 74/77.0/0.637 | 127/78.7/0.600 | 21.2 |
| BNB | 1.0 | 304 | 50.67 | 73.68 | 0.445 | 96/78.1/0.489 | 208/71.6/0.425 | 0 |
| BNB | 1.5 | 286 | 47.67 | 76.22 | 0.493 | 90/76.7/0.495 | 196/76.0/0.491 | 5.9 |
| BNB | 2.0 | 260 | 43.33 | 78.85 | 0.528 | 79/79.8/0.495 | 181/78.5/0.542 | 14.5 |
| BNB | 2.5 | 249 | 41.50 | 79.52 | 0.566 | 73/79.5/0.488 | 176/79.6/0.598 | 18.1 |
| BNB | 3.0 | 214 | 35.67 | 81.31 | 0.597 | 60/80.0/0.482 | 154/81.8/0.642 | 29.6 |

So với BT NEAR **S1 không-ambiguity** trước đây (n=173): thr=1.0 + ambiguity → **n=166** (−7 / −4.0%).

---

## 3. IS / OOS sanity (cắt theo thời gian trade ≈120d / 60d)

| Coin | Thr | IS n/WR%/EV | OOS n/WR%/EV | Ghi chú |
|------|----:|---|---|---|
| BTC | 3.0 | 177/80.2/0.667 | 112/78.6/0.579 | OOS ổn |
| NEAR | 3.0 | 88/80.7/0.552 | 44/70.5/0.590 | OOS WR −10pp vs IS — theo dõi |
| NEAR | 2.5 | 93/78.5/0.522 | 49/69.4/0.495 | OOS dip rõ hơn |
| SOL | 3.0 | 139/79.1/0.654 | 62/75.8/0.522 | OOS ổn |
| BNB | 3.0 | 143/80.4/0.590 | 71/83.1/0.612 | OOS tốt |

Heuristic max-EV (n≥20, OOS không sập >15pp vs IS) → **thr=3.0 cả 4 coin**. Đây **không** phải đề xuất kiến trúc — chỉ neo số liệu; Task 3 cân frequency vs EV + UI U1/U2/U3.

Xu hướng mẫu: siết threshold ↑ → n↓, WR/EV ↑ trên cả 4 coin; BNB mất nhiều nhất ở thr=3 (−29.6%).

---

## 4. Files

- Runner: `scripts/backtest-v4-near-90d.ts`
- Sweep harness: `scripts/sweep-v4-ambiguity-180d.test.ts`
- Raw: `docs/exports/ambiguity-sweep-180d/*.csv`
- Auto MD: `docs/exports/ambiguity-sweep-180d/REPORT_AMBIGUITY_SWEEP.md`
- Summary: `docs/exports/ambiguity-sweep-180d/SWEEP_SUMMARY.csv`

---

## 5. Chờ duyệt → Task 3

Chọn **một** (hoặc theo-coin) ambiguity threshold + phương án UI **U1/U2/U3** cùng lúc.  
Không merge / không đổi production cho đến khi duyệt Task 3.
