# VERIFY — FIX_HARD_REASON_LABELING NEARUSDT 180d A/B

**Ngày:** 2026-08-08T13:42:10.247Z
**Suite:** `scripts/backtest-v4-near-90d.ts` via loadMarketBundle + buildBarEvalCache + simulateFromCache
**Symbol / window:** NEARUSDT / 180d
**FEATURE_FLAGS.FIX_HARD_REASON_LABELING default:** false (không bật production)

## Bảng so sánh

| Metric | Nhánh A (flag OFF) | Nhánh B (flag ON) | Lệch? |
|---|---:|---:|:---:|
| Tổng số signal được đánh giá | 4318 | 4318 | Không |
| Số entry PASS | 751 | 751 | Không |
| Số entry BLOCKED (Hard) | 1479 | 1479 | Không |
| Số entry BLOCKED (Group) | 1910 | 1910 | Không |
| Số entry BLOCKED (Score/Soft) | 119 | 119 | Không |
| Winrate trên tập entry PASS (rising+planValid simulates) | 54.55% | 54.55% | Không (cùng sim) |
| Trade ID PASS/BLOCK khác nhau A vs B | 0 | 0 | Không |

### Label-only diagnostics

| Soft leaked vào hard-reasons (A OFF) | 1815 |
| Soft leaked vào hard-reasons (B ON) | 0 |
| resolveSnapEntryBlocked mismatches | A=0 B=0 |
| Simulated PASS trades (rising edges) | 145 |

## Kết luận

**Không ảnh hưởng rule/winrate NEAR — chỉ đổi hiển thị.** 100% pass/fail + Hard/Group/Soft counts trùng khớp giữa A và B. Nhánh A từng có 1815 signal leak soft→hard-reasons (label bug); nhánh B = 0 leak.

Flag vẫn **default OFF** — không bật trong task này.