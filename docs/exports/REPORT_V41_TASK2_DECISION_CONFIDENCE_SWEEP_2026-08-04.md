# REPORT — Task 2: Sweep Decision Confidence threshold (V4.1) — 4 coin × 180d

**Date:** 2026-08-04  
**Mode:** Measurement only — **không** đổi `decisionConfig.ts`  
**Threshold hiện tại (SSOT đọc-only):** LONG/SHORT ≥ **75**, WATCH **45**, IGNORE floor script band **&lt;45**  
**Tooling:** `scripts/backtest-v41-near-pipeline-funnel.ts` + `scripts/analyze-v41-decision-conf-sweep.ts`  
**CSV:** `docs/exports/v41-decision-funnel-180d/v41-funnel-{BTC,SOL,BNB,NEAR}-180d.csv`  
**Sweep JSON:** `docs/exports/v41-decision-funnel-180d/SWEEP_SUMMARY.json`

---

## 0. Kết luận ngắn (chờ duyệt — chưa đề xuất ship threshold)

| Phát hiện | Số liệu |
|-----------|---------|
| ≥75 (production) trên 4×180d | **0 / 4319 bars × 4** — **0 lệnh** LONG\|SHORT |
| Trần `finalConfidence` quan sát | BTC 69.3 · SOL 70.5 · BNB 71.1 · NEAR 62.3 — **không coin nào ≥75** |
| Eligible bars (đủ TR+context+hardBlocks) | BTC 23 · SOL 31 · BNB 17 · NEAR 17 |
| Sweep khả thi thực tế | chủ yếu **50–60** (cùng tập lệnh eligible); **65–70** gần như cạn mẫu; **75** = 0 |
| WR/EV proxy | mẫu **n≪20** mọi coin → **không đủ tin** để chốt ngưỡng |
| V4 NEAR (đã tối ưu / baseline CVD220+S1) | n≈173 / 180d · WR≈75% · EV≈+0.44R · ~29 lệnh/tháng → **vượt xa** V4.1 tại mọi thr đo được |

**Không đổi `decisionConfig`.** Cần duyệt trước khi Task kiến trúc ngưỡng.

---

## 1. Data & hạn chế (không che)

### 1.1. Fix fetch (tooling)

Lần dump đầu chỉ **1280 bars (~53d)** vì pagination kline sai hướng. Đã sửa `fetchKlines` **forward cursor** trong funnel script rồi chạy lại → **4319 bars / coin ≈ 180.0 ngày hiệu dụng**.

### 1.2. Hạn chế dữ liệu Market Context lịch sử

| Dimension (CSV tags) | Mức độ thiếu trên 4319 bars |
|----------------------|-----------------------------|
| `ctxOi` NA/SKIP | **100%** (4319/4319) mọi coin |
| `ctxWhale` NA/SKIP | **100%** |
| `ctxFunding` NA/SKIP | **~97.5–98.3%** (chỉ funding **live last** lúc scan, không history series) |
| 4H klines fetch | **1159** nến (~ giới hạn 1500) — cửa sổ 4H ngắn hơn full 180d+warmup |

→ Confidence / eligibility **thiếu** OI–Whale–Funding history → completeness ↓, hiếm khi đủ mạnh. Đây là giới hạn **đã cảnh báo Task 1**, vẫn đúng và **ảnh hưởng độ tin cậy** kết luận threshold.

### 1.3. Proxy winrate / EV (không phải V4 full tradePlan)

Analyzer giả lập lệnh khi:

`eligible==1` ∧ `proposedDirection∈{LONG,SHORT}` ∧ `finalConfidence ≥ thr`  
cooldown 12H · entry = close bar tín hiệu · SL **1.5×ATR14** · TP **2.5×ATR14** · timeout **12H**

≠ SL/TP Structure / fee / journal V4. Chỉ để **so sánh thô** giữa các thr. Ghi rõ khi n nhỏ.

---

## 2. Phân phối `finalConfidence` (mọi 1H bar)

| Coin | bars | &lt;45 (IGNORE band) | 45–75 (WATCH) | ≥75 | max conf | mean conf | eligible n |
|------|-----:|---------------------:|--------------:|----:|----------:|----------:|-----------:|
| BTC | 4319 | **98.50%** (4254) | 1.50% (65) | **0%** | 69.3 | 11.5 | 23 |
| SOL | 4319 | **97.89%** (4228) | 2.11% (91) | **0%** | 70.5 | 11.6 | 31 |
| BNB | 4319 | **98.66%** (4261) | 1.34% (58) | **0%** | 71.1 | 11.2 | 17 |
| NEAR | 4319 | **98.31%** (4246) | 1.69% (73) | **0%** | 62.3 | 11.5 | 17 |

Engine `decision LONG|SHORT` @ thr=75: **0** trên mọi coin (khớp band ≥75 = 0).

---

## 3. Sweep threshold → tần suất / WR / EV

**Định nghĩa kích hoạt:** đủ eligibility (Market Context path + TR confirmed + hardBlocks rỗng + completeness) **và** conf ≥ thr (giống `meetsDirectionThreshold` + `isEligibleForDirection`).

| Coin | Thr | % bars ≥thr | n trades (cooldown 12H) | n/tháng | L/S | nEval | WR% | EV (R) | Cảnh báo |
|------|----:|------------:|------------------------:|--------:|-----|------:|----:|---------:|----------|
| BTC | 50 | 1.50 | 15 | 2.5 | 8/7 | 15 | 40.0 | −0.02 | n&lt;20 |
| BTC | 55 | 0.58 | 15 | 2.5 | 8/7 | 15 | 40.0 | −0.02 | n&lt;20 |
| BTC | 60 | 0.56 | 14 | 2.3 | 7/7 | 14 | 35.7 | −0.06 | n&lt;20 |
| BTC | 65 | 0.02 | 1 | 0.17 | 0/1 | 1 | 0 | −1.00 | **n≪20** |
| BTC | 70 | 0 | 0 | 0 | — | 0 | — | — | trống |
| BTC | **75** | **0** | **0** | **0** | — | 0 | — | — | production |
| SOL | 50 | 2.11 | 14 | 2.3 | 7/7 | 14 | **64.3** | **+0.14** | n&lt;20 |
| SOL | 55 | 0.79 | 14 | 2.3 | 7/7 | 14 | 64.3 | +0.14 | n&lt;20 |
| SOL | 60 | 0.76 | 14 | 2.3 | 7/7 | 14 | 64.3 | +0.14 | n&lt;20 |
| SOL | 65 | 0.02 | 1 | 0.17 | 0/1 | 1 | 0 | −1.00 | **n≪20** |
| SOL | 70 | 0.02 | 1 | 0.17 | 0/1 | 1 | 0 | −1.00 | **n≪20** |
| SOL | **75** | **0** | **0** | **0** | — | 0 | — | — | production |
| BNB | 50 | 1.34 | 11 | 1.8 | 3/8 | 11 | 27.3 | −0.34 | n&lt;20 |
| BNB | 55 | 0.44 | 11 | 1.8 | 3/8 | 11 | 27.3 | −0.34 | n&lt;20 |
| BNB | 60 | 0.44 | 11 | 1.8 | 3/8 | 11 | 27.3 | −0.34 | n&lt;20 |
| BNB | 65 | 0.02 | 1 | 0.17 | 0/1 | 1 | 0 | −1.00 | **n≪20** |
| BNB | 70 | 0.02 | 1 | 0.17 | 0/1 | 1 | 0 | −1.00 | **n≪20** |
| BNB | **75** | **0** | **0** | **0** | — | 0 | — | — | production |
| NEAR | 50 | 1.69 | 12 | 2.0 | 3/9 | 12 | 33.3 | −0.11 | n&lt;20 |
| NEAR | 55 | 0.51 | 12 | 2.0 | 3/9 | 12 | 33.3 | −0.11 | n&lt;20 |
| NEAR | 60 | 0.51 | 12 | 2.0 | 3/9 | 12 | 33.3 | −0.11 | n&lt;20 |
| NEAR | 65 | 0 | 0 | 0 | — | 0 | — | — | trống |
| NEAR | 70 | 0 | 0 | 0 | — | 0 | — | — | trống |
| NEAR | **75** | **0** | **0** | **0** | — | 0 | — | — | production |

**Ghi chú:** Thr 50/55/60 trùng n trades vì **mọi bar eligible đã có conf ≥ ~55–60**; bottleneck chính là **eligibility / completeness / thiếu OI–Whale**, không phải cắt nhẹ giữa 50 và 60.

---

## 4. Overfit sanity IS/OOS (split 2/3–1/3 thời gian ≈ 120d/60d của cửa sổ 180d)

Best thr theo EV proxy (mặc định **50**, vì 50≡55≡60 về n):

| Coin | Best thr (theo EV proxy) | IS n / WR / EV | OOS n / WR / EV | Cảnh báo |
|------|--------------------------|----------------|-----------------|----------|
| BTC | 50 | 9 / 22% / −0.29 | 6 / 67% / +0.39 | **n&lt;20 cả hai** — OOS “đẹp” không tin |
| SOL | 50 | 10 / 60% / +0.16 | 4 / 75% / +0.09 | **n&lt;20** — OOS n=4 |
| BNB | 50 | 9 / 22% / −0.37 | 2 / 50% / −0.21 | **n≪20** |
| NEAR | 50 | 10 / 30% / −0.12 | 2 / 50% / −0.03 | **n≪20** |

**CẢNH BÁO RÕ:** Không threshold nào đạt n≥20 trades trên 180d sau cooldown. **Không đủ mẫu** để kết luận kiến trúc ngưỡng mới — đặc biệt V4.1 vốn hiếm lệnh.

---

## 5. So sánh V4.1 (thr đề xuất tạm = 50–60) vs V4 NEAR baseline

Nguồn V4: `docs/exports/near_rule_comparison_180d_cvd220_s1.md` — baseline canEnter+planValid, 180d:

| Engine | Coin | Thr / gate | n (180d) | n/tháng | WR% | EV (R) |
|--------|------|------------|---------:|--------:|----:|-------:|
| **V4** | NEAR | score/plan baseline | **173** | **~28.8** | **75.1** | **+0.44** |
| V4.1 | NEAR | conf≥50–60 + eligible | 12 | ~2.0 | 33.3* | −0.11* |
| V4.1 | BTC | conf≥50–60 + eligible | 15 | ~2.5 | 40.0* | −0.02* |
| V4.1 | SOL | conf≥50–60 + eligible | 14 | ~2.3 | 64.3* | +0.14* |
| V4.1 | BNB | conf≥50–60 + eligible | 11 | ~1.8 | 27.3* | −0.34* |
| V4.1 | cả 4 | **conf≥75** | **0** | **0** | — | — |

\*Proxy ATR — không đồng apples-to-apples với V4 plan R.

### Ưu tiên engine theo số liệu hiện có (measurement, chưa approve product)

| Coin | Ưu tiên tạm (dựa trên tần suất + WR/EV có sẵn) | Lý do ngắn |
|------|-----------------------------------------------|------------|
| **NEAR** | **V4** | V4 có n lớn + WR/EV mạnh; V4.1 ~2 lệnh/tháng, WR proxy yếu, conf trần 62 |
| **BTC / BNB** | **V4** (nếu đã có V4 board) / V4.1 chưa chứng minh | V4.1 ≤2.5 lệnh/tháng, EV proxy ≤0, n&lt;20 |
| **SOL** | V4.1 **thú vị nhất** trong 4 coin (WR proxy 64%, EV +0.14) nhưng **n=14** — chưa đủ thay V4 | Cần thêm sample / data OI–Funding history trước khi ưu tiên V4.1 |

---

## 6. Artefacts

| Path | Nội dung |
|------|----------|
| `docs/exports/v41-decision-funnel-180d/v41-funnel-*-180d.csv` | Bar dump đủ cột Task 1 (4319 bars) |
| `docs/exports/v41-decision-funnel-180d/SWEEP_SUMMARY.json` | Sweep máy |
| `scripts/analyze-v41-decision-conf-sweep.ts` | Analyzer Task 2 |
| Funnel pagination fix | `fetchKlines` forward trong `backtest-v41-near-pipeline-funnel.ts` |

---

## 7. Việc **không** làm (đúng yêu cầu)

- Không sửa `decisionConfig.ts`  
- Không đề xuất kiến trúc ship threshold mới (chỉ bảng số + cảnh báo mẫu)  
- Không merge/production change ngoài tooling đo lường

**Chờ duyệt** trước bước đề xuất ngưỡng / dual-engine policy.
