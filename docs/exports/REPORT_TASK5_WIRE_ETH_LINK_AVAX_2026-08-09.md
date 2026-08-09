# REPORT — Task 5 wire ETH/LINK/AVAX vào TRADE_SYMBOLS

**Ngày:** 2026-08-09  
**Task:** 5/9 — wire production  
**CHƯA** build web/APK  

---

## 0) Quyết định đã áp dụng

| # | Quyết định | Kết quả |
|---|------------|---------|
| 1 | `WHALE_RADAR_SYMBOLS` Option A | +ETH/LINK/AVAX (XRP **vẫn ngoài** list — gap riêng) |
| 2 | `PRICE_DECIMALS` | **1** cho ETH/LINK/AVAX |
| 3 | V41 lists | **không đụng** |
| 4 | Thứ tự `TRADE_SYMBOLS` | append cuối |
| 5 | Whale minNotional | ETH **2_000_000**; LINK/AVAX **600_000** (mid 500k–800k) |

---

## 1) Diff checklist (9 file + phụ)

| # | File | Việc |
|---|------|------|
| 1 | `constants/scoring.ts` | TRADE_SYMBOLS → 8 |
| 2 | `constants/scoring.test.ts` | expect 8 (sửa stale 4-coin + XRP) |
| 3 | `constants/whaleRadar.ts` | config + minNotional + radar list Option A |
| 4 | `utils/formatPrice.ts` | decimals = 1 |
| 5 | `utils/formatPrice.test.ts` | assert ETH/LINK/AVAX |
| 6 | `constants/vi.ts` | labels + searchPlaceholder + subtitle |
| 7 | `components/dashboard/SymbolPicker.tsx` | màu ETH `#627EEA` LINK `#2A5ADA` AVAX `#E84142` |
| 8 | `services/exportAuditCoin.ts` | brand + tree options |
| 9 | `services/__tests__/exportAuditCoin.test.ts` | expect 8 |

**Phụ (UI board):** `SignalBoard.tsx` `SYMBOL_COLORS` cùng brand 3 coin.  
**Verify script:** `scripts/backtest-v4-board-8coin-trusted.ts` (+ `.test.ts`).

### Không sửa (đúng scope)

- `scorerV4` / XRP Option A / NEAR gates  
- `DEFAULT_SCAN_SYMBOLS_V41` / `V41_RC3_SYMBOLS`

---

## 2) Test suite

| Suite | Kết quả |
|-------|---------|
| Unit Task 5 (`scoring` / `formatPrice` / `exportAuditCoin`) | **55/55 pass** |
| Full vitest dirty | **70 failed \| 2496 passed \| 2 skipped** (286 files) |

So sánh trước đó (`REPORT_TEST_BASELINE_VS_DIRTY_B1B2_OPTION_A`):

| | Baseline HEAD | Dirty B1/B2/A | **Dirty + Task 5** |
|--|-------------:|--------------:|-------------------:|
| Failed | 71 | 74 | **70** |

- Stale `TRADE_SYMBOLS` (thiếu XRP) **đã fix** → fail count giảm.  
- Không thấy regression mới gắn Task 5 trong các file checklist.  
- `productionEsmScanWiring` 2 fail: **đã có trên baseline** (không phải do add ETH vào TRADE_SYMBOLS — eligibility = journal OPEN, không whitelist coin).  
- Log: `docs/exports/_task5_vitest_full_2026-08-09.log`

---

## 3) Backtest 8-coin trusted (production code + FORCE absolute CVD)

**Script:** `npx vitest run scripts/backtest-v4-board-8coin-trusted.test.ts`  
**Report:** `docs/exports/REPORT_BOARD_8COIN_V4_TRUSTED_2026-08-09.md`

| Coin | Board8 n / WR / PF | Baseline7 (đã duyệt) | Khớp? |
|------|-------------------:|---------------------:|-------|
| BTC | 34 / 50.0% / 2.41 | 34 / 50.0% / 2.41 | **Exact** |
| SOL | 19 / 73.7% / 4.78 | 19 / 73.7% / 4.78 | **Exact** |
| BNB | 21 / 66.7% / 3.07 | 21 / 66.7% / 3.32 | n ok; PF lệch nhẹ (cửa sổ trượt) |
| XRP* | 18 / 66.7% / 3.72 | 17 / 70.6% / 4.03 | lệch cửa sổ (+1 trade); *absolute CVD — app production vẫn Option A* |
| ETH | 28 / 64.3% / 2.09 | 28 / 64.3% / 2.09 | **Exact** |
| LINK | 28 / 75.0% / 6.84 | 28 / 78.6% / 8.29 | n ok; WR/PF lệch nhẹ cửa sổ |
| AVAX | 12 / 75.0% / 8.24 | 13 / 76.9% / 8.98 | −1 trade / cửa sổ |
| NEAR | 22 / 90.9% / 15.49 | *(không trong baseline7)* | OK mới |

**Kết luận verify:** ETH khớp tuyệt đối với báo cáo Task 2/3 đã duyệt; LINK/AVAX vẫn WR≥75% (OK). Drift nhỏ trên LINK/AVAX/XRP do cửa sổ `--days 21` trượt theo `Date.now`, không phải thay đổi rule scorer Task 5.

---

## 4) Diff đầy đủ (checklist)

Xem output `git diff` các file ở mục 1 (đã chạy trong session). Tóm tắt dòng:

```
 constants/scoring.ts                       | TRADE_SYMBOLS 5→8
 constants/scoring.test.ts                  | expect 8
 constants/whaleRadar.ts                    | ETH/LINK/AVAX config + Option A list
 utils/formatPrice.ts                       | decimals 1×3
 utils/formatPrice.test.ts                  | +1 test
 constants/vi.ts                            | labels + placeholder
 components/dashboard/SymbolPicker.tsx      | +3 colors
 services/exportAuditCoin.ts                | +3 brand/options
 services/__tests__/exportAuditCoin.test.ts | expect tree 8
```

`SignalBoard.tsx` còn chứa thay đổi UI compact (Task 4B) + `SYMBOL_COLORS` Task 5 — xem riêng nếu commit tách.

---

## 5) Dừng

Task 5 wire **xong**. Chưa build.  
Tiếp theo (nếu muốn): commit tách UI compact / Task 5; hoặc Task tiếp theo trong chuỗi 9.
